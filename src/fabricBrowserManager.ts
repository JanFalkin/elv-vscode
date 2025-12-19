import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
const cp = require('child_process');
const tcpPortUsed = require('tcp-port-used');

export class FabricBrowserManager {
    private context: vscode.ExtensionContext;
    private browserProcess: any = null;
    private coreJsProcess: any = null;
    private browserPort: number = 8082;
    private coreJsPort: number = 8082;
    private outputChannel: vscode.OutputChannel;
    private coreJsOutputChannel: vscode.OutputChannel;
    private workspacePath: string = '';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('Eluvio Fabric Browser');
        this.coreJsOutputChannel = vscode.window.createOutputChannel('Eluvio Core JS');

        const config = vscode.workspace.getConfiguration('elv-vscode');
        this.browserPort = config.get<number>('browser.port', 8080);
        this.coreJsPort = config.get<number>('browser.coreJsPort', 8090);
        
        // Try to get workspace path - first from workspace folders
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
            this.outputChannel.appendLine(`[Init] Workspace path from workspaceFolders: ${this.workspacePath}`);
        } 
        // Fallback: When developing the extension, use the extension path itself as workspace
        else {
            const extensionPath = context.extensionUri.fsPath;
            this.outputChannel.appendLine(`[Init] Extension path: ${extensionPath}`);
            
            // Check if this looks like a development environment (has node_modules as sibling)
            const nodeModulesPath = path.join(extensionPath, 'node_modules');
            if (fs.existsSync(nodeModulesPath)) {
                this.workspacePath = extensionPath;
                this.outputChannel.appendLine(`[Init] Using extension path as workspace (dev mode): ${this.workspacePath}`);
            } else {
                this.outputChannel.appendLine(`[Init] WARNING: No workspace path available and not in dev mode`);
            }
        }
    }

    /**
     * Get workspace path, trying multiple methods
     */
    private getWorkspacePath(): string {
        // Use cached path if available
        if (this.workspacePath) {
            return this.workspacePath;
        }
        
        // Try workspace folders again
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.workspacePath = workspaceFolders[0].uri.fsPath;
            this.outputChannel.appendLine(`[getWorkspacePath] Found workspace: ${this.workspacePath}`);
            return this.workspacePath;
        }
        
        // Try workspace file
        if (vscode.workspace.workspaceFile) {
            const wsPath = path.dirname(vscode.workspace.workspaceFile.fsPath);
            this.outputChannel.appendLine(`[getWorkspacePath] Using workspace file parent: ${wsPath}`);
            return wsPath;
        }
        
        this.outputChannel.appendLine(`[getWorkspacePath] ERROR: No workspace path available`);
        return '';
    }

    /**
     * Get the browser path (resolved lazily)
     */
    private getBrowserPath(): string {
        const config = vscode.workspace.getConfiguration('elv-vscode');
        const customPath = config.get<string>('browser.path');
        
        this.outputChannel.appendLine(`[getBrowserPath] customPath: ${customPath || 'none'}`);
        
        if (customPath && fs.existsSync(customPath)) {
            this.outputChannel.appendLine(`[getBrowserPath] Using custom path: ${customPath}`);
            return customPath;
        }
        
        const wsPath = this.getWorkspacePath();
        this.outputChannel.appendLine(`[getBrowserPath] workspace path: ${wsPath || 'empty'}`);
        
        if (wsPath) {
            // Check parent directory (sibling to workspace)
            const siblingPath = path.join(path.dirname(wsPath), 'elv-fabric-browser');
            this.outputChannel.appendLine(`[getBrowserPath] Checking sibling path: ${siblingPath}`);
            if (fs.existsSync(siblingPath)) {
                this.outputChannel.appendLine(`[getBrowserPath] Using sibling path: ${siblingPath}`);
                return siblingPath;
            }
            
            // Check in node_modules
            const browserPath = path.join(wsPath, 'node_modules', '@eluvio', 'elv-fabric-browser');
            this.outputChannel.appendLine(`[getBrowserPath] Computed path: ${browserPath}`);
            this.outputChannel.appendLine(`[getBrowserPath] Path exists: ${fs.existsSync(browserPath)}`);
            return browserPath;
        }
        
        this.outputChannel.appendLine(`[getBrowserPath] No workspace path, returning empty`);
        return '';
    }

    /**
     * Get the elv-core-js path (resolved lazily)
     */
    private getCoreJsPath(): string {
        const config = vscode.workspace.getConfiguration('elv-vscode');
        const customPath = config.get<string>('browser.coreJsPath');
        
        if (customPath && fs.existsSync(customPath)) {
            return customPath;
        }
        
        const wsPath = this.getWorkspacePath();
        if (wsPath) {
            // Check parent directory (sibling to workspace)
            const siblingPath = path.join(path.dirname(wsPath), 'elv-core-js');
            if (fs.existsSync(siblingPath)) {
                return siblingPath;
            }
            // Check in node_modules
            return path.join(wsPath, 'node_modules', '@eluvio', 'elv-core-js');
        }
        
        return '';
    }

    /**
     * Check if fabric browser is installed
     */
    public isInstalled(): boolean {
        const browserPath = this.getBrowserPath();
        if (!browserPath) {
            return false;
        }

        const packageJsonPath = path.join(browserPath, 'package.json');
        const nodeModulesPath = path.join(browserPath, 'node_modules');
        return fs.existsSync(packageJsonPath) && fs.existsSync(nodeModulesPath);
    }

    /**
     * Check if elv-core-js is installed
     */
    public isCoreJsInstalled(): boolean {
        const coreJsPath = this.getCoreJsPath();
        if (!coreJsPath) {
            return false;
        }

        const packageJsonPath = path.join(coreJsPath, 'package.json');
        const nodeModulesPath = path.join(coreJsPath, 'node_modules');
        return fs.existsSync(packageJsonPath) && fs.existsSync(nodeModulesPath);
    }

    /**
     * Check if fabric browser is currently running
     */
    public async isRunning(): Promise<boolean> {
        try {
            return await tcpPortUsed.check(this.browserPort, '127.0.0.1');
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if elv-core-js is currently running
     */
    public async isCoreJsRunning(): Promise<boolean> {
        try {
            return await tcpPortUsed.check(this.coreJsPort, '127.0.0.1');
        } catch (error) {
            return false;
        }
    }

    /**
     * Install dependencies for a package using npm install
     */
    private async installDependencies(packagePath: string, packageName: string): Promise<boolean> {
        return new Promise((resolve) => {
            this.outputChannel.appendLine(`Installing dependencies for ${packageName}...`);
            this.outputChannel.appendLine(`Running: npm install in ${packagePath}`);
            
            const npmProcess = cp.spawn('npm', ['install'], {
                cwd: packagePath,
                shell: true
            });

            npmProcess.stdout.on('data', (data: Buffer) => {
                this.outputChannel.append(data.toString());
            });

            npmProcess.stderr.on('data', (data: Buffer) => {
                this.outputChannel.append(data.toString());
            });

            npmProcess.on('close', (code: number) => {
                if (code === 0) {
                    this.outputChannel.appendLine(`✓ Dependencies installed for ${packageName}`);
                    resolve(true);
                } else {
                    this.outputChannel.appendLine(`✗ Failed to install dependencies for ${packageName} (exit code: ${code})`);
                    resolve(false);
                }
            });

            npmProcess.on('error', (error: Error) => {
                this.outputChannel.appendLine(`✗ Error installing dependencies: ${error.message}`);
                resolve(false);
            });
        });
    }

    /**
     * Start elv-core-js dev server (required for fabric browser)
     */
    public async startCoreJs(): Promise<boolean> {
        const coreJsPath = this.getCoreJsPath();
        
        if (!coreJsPath) {
            this.coreJsOutputChannel.appendLine('elv-core-js path not configured');
            vscode.window.showErrorMessage(
                'elv-core-js is not found. Please ensure it is installed in node_modules or set elv-vscode.browser.coreJsPath.'
            );
            return false;
        }

        this.coreJsOutputChannel.appendLine(`Using core-js path: ${coreJsPath}`);

        // Check if package.json exists
        const packageJsonPath = path.join(coreJsPath, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            this.coreJsOutputChannel.appendLine('elv-core-js package.json not found at: ' + coreJsPath);
            vscode.window.showErrorMessage(
                'elv-core-js package.json not found. Please run npm install in the workspace.'
            );
            return false;
        }

        // Check if dependencies are installed, if not, install them
        if (!this.isCoreJsInstalled()) {
            this.coreJsOutputChannel.appendLine('elv-core-js dependencies not installed, installing...');
            vscode.window.showInformationMessage('Installing elv-core-js dependencies...');
            
            const installed = await this.installDependencies(coreJsPath, 'elv-core-js');
            if (!installed) {
                vscode.window.showErrorMessage('Failed to install elv-core-js dependencies');
                return false;
            }
        }

        if (await this.isCoreJsRunning()) {
            this.coreJsOutputChannel.appendLine('elv-core-js is already running');
            return true;
        }

        try {
            this.coreJsOutputChannel.show(true);
            this.coreJsOutputChannel.appendLine('Starting elv-core-js...');
            this.coreJsOutputChannel.appendLine(`Core JS path: ${coreJsPath}`);
            this.coreJsOutputChannel.appendLine(`Port: ${this.coreJsPort}`);

            // Check if configuration.js exists and update it for local fabric
            const configPath = path.join(coreJsPath, 'config', 'configuration.js');
            if (fs.existsSync(configPath)) {
                this.coreJsOutputChannel.appendLine('Updating configuration.js for local fabric...');
                
                // Get local fabric port
                const fabricConfig = vscode.workspace.getConfiguration('elv-vscode.fabric');
                const qfabPort = fabricConfig.get<number>('qfabPort', 8008);
                
                const configContent = `const EluvioConfiguration = {
  "config-url": "http://localhost:${qfabPort}/config?qspace=dev",
  "apps": {
    "Eluvio Fabric Browser": "http://localhost:${this.browserPort}",
  }
};

if(typeof exports !== 'undefined') {
  exports.EluvioConfiguration = EluvioConfiguration;
}
`;
                fs.writeFileSync(configPath, configContent);
                this.coreJsOutputChannel.appendLine('Configuration updated for local fabric');
            }

            // Start the dev server using npm run serve
            this.coreJsProcess = cp.spawn('npm', ['run', 'serve'], {
                cwd: coreJsPath,
                shell: true,
                env: { ...process.env, 'ELV_CORE_JS_PORT': this.coreJsPort.toString() }
            });

            this.coreJsProcess.stdout.on('data', (data: Buffer) => {
                this.coreJsOutputChannel.append(data.toString());
            });

            this.coreJsProcess.stderr.on('data', (data: Buffer) => {
                this.coreJsOutputChannel.append(data.toString());
            });

            this.coreJsProcess.on('error', (error: Error) => {
                this.coreJsOutputChannel.appendLine(`Error: ${error.message}`);
                vscode.window.showErrorMessage(`Failed to start elv-core-js: ${error.message}`);
            });

            this.coreJsProcess.on('exit', (code: number) => {
                this.coreJsOutputChannel.appendLine(`elv-core-js exited with code ${code}`);
                this.coreJsProcess = null;
            });

            // Wait for the server to start
            await this.waitForServer(this.coreJsPort, 30000); // 30 second timeout

            this.coreJsOutputChannel.appendLine(`elv-core-js started on http://localhost:${this.coreJsPort}`);
            return true;

        } catch (error: any) {
            this.coreJsOutputChannel.appendLine(`Failed to start: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to start elv-core-js: ${error.message}`);
            return false;
        }
    }

    /**
     * Start the fabric browser dev server
     */
    public async start(): Promise<boolean> {
        const browserPath = this.getBrowserPath();
        
        if (!browserPath) {
            this.outputChannel.appendLine('Fabric Browser path not configured');
            vscode.window.showErrorMessage(
                'Eluvio Fabric Browser is not found. Please run npm install in the workspace.'
            );
            return false;
        }

        this.outputChannel.appendLine(`Using browser path: ${browserPath}`);

        // Check if package.json exists
        const packageJsonPath = path.join(browserPath, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            this.outputChannel.appendLine('Fabric Browser package.json not found at: ' + browserPath);
            vscode.window.showErrorMessage(
                'Eluvio Fabric Browser package.json not found. Please run npm install in the workspace.'
            );
            return false;
        }

        // Check if dependencies are installed, if not, install them
        if (!this.isInstalled()) {
            this.outputChannel.appendLine('Fabric Browser dependencies not installed, installing...');
            vscode.window.showInformationMessage('Installing Fabric Browser dependencies...');
            
            const installed = await this.installDependencies(browserPath, 'elv-fabric-browser');
            if (!installed) {
                vscode.window.showErrorMessage('Failed to install Fabric Browser dependencies');
                return false;
            }
        }

        // First ensure elv-core-js is running
        this.outputChannel.appendLine('Ensuring elv-core-js is running...');
        const coreJsStarted = await this.startCoreJs();
        if (!coreJsStarted) {
            vscode.window.showErrorMessage('Cannot start Fabric Browser: elv-core-js failed to start');
            return false;
        }

        // Always update configuration.js before checking if running
        // This ensures it has the correct port even if browser is already running
        const configPath = path.join(browserPath, 'configuration.js');
        const configExamplePath = path.join(browserPath, 'configuration-example.js');

        if (!fs.existsSync(configPath) && fs.existsSync(configExamplePath)) {
            this.outputChannel.appendLine('Creating configuration.js from example...');
            fs.copyFileSync(configExamplePath, configPath);
        }

        this.outputChannel.appendLine('Updating configuration.js to point to local elv-core-js...');
        const configContent = `const EluvioConfiguration = {
  "coreUrl": "http://localhost:${this.coreJsPort}",
};

if(typeof exports !== 'undefined') {
  exports.EluvioConfiguration = EluvioConfiguration;
}
`;
        fs.writeFileSync(configPath, configContent);
        this.outputChannel.appendLine(`Configuration updated: coreUrl = http://localhost:${this.coreJsPort}`);

        if (await this.isRunning()) {
            this.outputChannel.appendLine('Fabric Browser is already running - restart required for config changes');
            const restart = await vscode.window.showWarningMessage(
                'Fabric Browser configuration has been updated. Restart the browser to apply changes?',
                'Restart',
                'Cancel'
            );
            
            if (restart === 'Restart') {
                await this.stop();
                // Continue to start it again below
            } else {
                return true;
            }
        }

        try {
            this.outputChannel.show(true);
            this.outputChannel.appendLine('Starting Eluvio Fabric Browser...');
            this.outputChannel.appendLine(`Browser path: ${browserPath}`);
            this.outputChannel.appendLine(`Port: ${this.browserPort}`);
            this.outputChannel.appendLine(`Core JS Port: ${this.coreJsPort}`);

            // Start the dev server using npm run serve
            this.browserProcess = cp.spawn('npm', ['run', 'serve'], {
                cwd: browserPath,
                shell: true,
                env: { ...process.env, 'PORT': this.browserPort.toString() }
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
            await this.waitForServer(this.browserPort, 30000); // 30 second timeout

            vscode.window.showInformationMessage(
                `Fabric Browser started on http://localhost:${this.browserPort}`
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
            this.outputChannel.appendLine('Fabric Browser is not running');
        } else {
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

            } catch (error: any) {
                this.outputChannel.appendLine(`Error stopping: ${error.message}`);
                vscode.window.showWarningMessage(`Error stopping Fabric Browser: ${error.message}`);
            }
        }

        // Also stop elv-core-js
        if (!this.coreJsProcess) {
            this.coreJsOutputChannel.appendLine('elv-core-js is not running');
        } else {
            this.coreJsOutputChannel.appendLine('Stopping elv-core-js...');

            try {
                // Kill the process
                if (process.platform === 'win32') {
                    cp.execSync(`taskkill /pid ${this.coreJsProcess.pid} /T /F`);
                } else {
                    process.kill(-this.coreJsProcess.pid);
                }

                this.coreJsProcess = null;
                this.coreJsOutputChannel.appendLine('elv-core-js stopped');

            } catch (error: any) {
                this.coreJsOutputChannel.appendLine(`Error stopping: ${error.message}`);
                vscode.window.showWarningMessage(`Error stopping elv-core-js: ${error.message}`);
            }
        }

        vscode.window.showInformationMessage('Fabric Browser and elv-core-js stopped');
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

        // Check if we should use external browser (default for CORS reasons)
        const config = vscode.workspace.getConfiguration('elv-vscode');
        const useExternalBrowser = config.get<boolean>('browser.useExternalBrowser', true);

        const url = `http://localhost:${this.browserPort}/`;
        
        if (useExternalBrowser) {
            this.outputChannel.appendLine(`Opening in external browser: ${url}`);
            await vscode.env.openExternal(vscode.Uri.parse(url));
        } else {
            try {
                this.outputChannel.appendLine(`Opening in SimpleBrowser: ${url}`);
                await vscode.commands.executeCommand('simpleBrowser.show', url);
            } catch (error: any) {
                // Fallback to external browser if SimpleBrowser command fails
                this.outputChannel.appendLine(`SimpleBrowser failed: ${error.message}, opening externally`);
                vscode.window.showWarningMessage(
                    `SimpleBrowser has CORS restrictions. Opening in external browser instead.`
                );
                await vscode.env.openExternal(vscode.Uri.parse(url));
            }
        }
    }

    /**
     * Wait for the server to start listening
     */
    private async waitForServer(port: number, timeout: number): Promise<void> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                const isRunning = await tcpPortUsed.check(port, '127.0.0.1');
                if (isRunning) {
                    return;
                }
            } catch (error) {
                // Continue waiting
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        throw new Error('Server failed to start within timeout period');
    }

    /**
     * Get the browser URL
     */
    public getUrl(): string {
        return `http://localhost:${this.browserPort}/`;
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        if (this.browserProcess) {
            this.stop();
        }
        this.outputChannel.dispose();
        this.coreJsOutputChannel.dispose();
    }
}
