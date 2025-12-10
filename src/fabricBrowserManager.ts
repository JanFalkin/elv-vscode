import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
const cp = require('child_process');
const tcpPortUsed = require('tcp-port-used');

export class FabricBrowserManager {
    private context: vscode.ExtensionContext;
    private browserProcess: any = null;
    private browserPath: string = '';
    private port: number = 8080;
    private outputChannel: vscode.OutputChannel;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('Eluvio Fabric Browser');

        // Get browser path from settings or node_modules
        const config = vscode.workspace.getConfiguration('elv-vscode');
        const customPath = config.get<string>('browser.path');

        if (customPath && fs.existsSync(customPath)) {
            this.browserPath = customPath;
        } else {
            // Use node_modules installation
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                const wsPath = workspaceFolders[0].uri.fsPath;
                this.browserPath = path.join(wsPath, 'node_modules', '@eluvio', 'elv-fabric-browser');
            }
        }

        this.port = config.get<number>('browser.port', 8080);
    }

    /**
     * Check if fabric browser is installed
     */
    public isInstalled(): boolean {
        if (!this.browserPath) {
            return false;
        }

        const packageJsonPath = path.join(this.browserPath, 'package.json');
        return fs.existsSync(packageJsonPath);
    }

    /**
     * Check if fabric browser is currently running
     */
    public async isRunning(): Promise<boolean> {
        try {
            return await tcpPortUsed.check(this.port, '127.0.0.1');
        } catch (error) {
            return false;
        }
    }

    /**
     * Start the fabric browser dev server
     */
    public async start(): Promise<boolean> {
        if (!this.isInstalled()) {
            vscode.window.showErrorMessage(
                'Eluvio Fabric Browser is not installed. Please run npm install first.'
            );
            return false;
        }

        if (await this.isRunning()) {
            vscode.window.showInformationMessage('Fabric Browser is already running');
            return true;
        }

        try {
            this.outputChannel.show(true);
            this.outputChannel.appendLine('Starting Eluvio Fabric Browser...');
            this.outputChannel.appendLine(`Browser path: ${this.browserPath}`);
            this.outputChannel.appendLine(`Port: ${this.port}`);

            // Check if configuration.js exists, create from example if not
            const configPath = path.join(this.browserPath, 'configuration.js');
            const configExamplePath = path.join(this.browserPath, 'configuration-example.js');

            if (!fs.existsSync(configPath) && fs.existsSync(configExamplePath)) {
                this.outputChannel.appendLine('Creating configuration.js from example...');

                // Read example config and set coreUrl to local
                let configContent = fs.readFileSync(configExamplePath, 'utf8');

                // Update coreUrl to point to localhost:8082 (elv-core-js default)
                // For now, we'll just copy the example
                fs.writeFileSync(configPath, configContent);

                this.outputChannel.appendLine('configuration.js created. You may need to customize it.');
            }

            // Start the dev server using npm run serve
            this.browserProcess = cp.spawn('npm', ['run', 'serve'], {
                cwd: this.browserPath,
                shell: true,
                env: { ...process.env, PORT: this.port.toString() }
            });

            this.browserProcess.stdout.on('data', (data: Buffer) => {
                this.outputChannel.append(data.toString());
            });

            this.browserProcess.stderr.on('data', (data: Buffer) => {
                this.outputChannel.append(data.toString());
            });

            this.browserProcess.on('error', (error: Error) => {
                this.outputChannel.appendLine(`Error: ${error.message}`);
                vscode.window.showErrorMessage(`Failed to start Fabric Browser: ${error.message}`);
            });

            this.browserProcess.on('exit', (code: number) => {
                this.outputChannel.appendLine(`Fabric Browser exited with code ${code}`);
                this.browserProcess = null;
            });

            // Wait for the server to start
            await this.waitForServer(30000); // 30 second timeout

            vscode.window.showInformationMessage(
                `Fabric Browser started on http://localhost:${this.port}`
            );

            return true;

        } catch (error: any) {
            this.outputChannel.appendLine(`Failed to start: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to start Fabric Browser: ${error.message}`);
            return false;
        }
    }

    /**
     * Stop the fabric browser dev server
     */
    public async stop(): Promise<void> {
        if (!this.browserProcess) {
            vscode.window.showInformationMessage('Fabric Browser is not running');
            return;
        }

        this.outputChannel.appendLine('Stopping Fabric Browser...');

        try {
            // Kill the process
            if (process.platform === 'win32') {
                cp.execSync(`taskkill /pid ${this.browserProcess.pid} /T /F`);
            } else {
                process.kill(-this.browserProcess.pid);
            }

            this.browserProcess = null;
            this.outputChannel.appendLine('Fabric Browser stopped');
            vscode.window.showInformationMessage('Fabric Browser stopped');

        } catch (error: any) {
            this.outputChannel.appendLine(`Error stopping: ${error.message}`);
            vscode.window.showWarningMessage(`Error stopping Fabric Browser: ${error.message}`);
        }
    }

    /**
     * Open the fabric browser in VS Code's SimpleBrowser
     */
    public async open(): Promise<void> {
        if (!(await this.isRunning())) {
            const start = await vscode.window.showInformationMessage(
                'Fabric Browser is not running. Would you like to start it?',
                'Yes',
                'No'
            );

            if (start === 'Yes') {
                const started = await this.start();
                if (!started) {
                    return;
                }
            } else {
                return;
            }
        }

        // Open in SimpleBrowser
        const url = `http://localhost:${this.port}`;
        try {
            await vscode.commands.executeCommand('simpleBrowser.show', url);
            this.outputChannel.appendLine(`Opened browser at ${url}`);
        } catch (error: any) {
            // Fallback to external browser if SimpleBrowser command fails
            vscode.window.showErrorMessage(
                `Could not open SimpleBrowser: ${error.message}. Opening in external browser...`
            );
            await vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }

    /**
     * Wait for the server to start listening
     */
    private async waitForServer(timeout: number): Promise<void> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            if (await this.isRunning()) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        throw new Error('Server failed to start within timeout period');
    }

    /**
     * Get the browser URL
     */
    public getUrl(): string {
        return `http://localhost:${this.port}`;
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        if (this.browserProcess) {
            this.stop();
        }
        this.outputChannel.dispose();
    }
}
