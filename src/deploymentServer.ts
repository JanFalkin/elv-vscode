import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
const express = require('express');

/**
 * Deployment server that serves built elv-core-js and elv-fabric-browser
 * and proxies API requests to the local fabric
 */
export class DeploymentServer {
    private server: any = null;
    private port: number = 8090;
    private fabricUrl: string = 'http://localhost:8008';
    private outputChannel: vscode.OutputChannel;
    private coreJsDistPath: string = '';
    private browserDistPath: string = '';

    constructor(private context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('Eluvio Deployment Server');
        
        const config = vscode.workspace.getConfiguration('elv-vscode');
        this.port = config.get<number>('browser.deploymentPort', 8090);
        
        const fabricConfig = vscode.workspace.getConfiguration('elv-vscode.fabric');
        const fabricPort = fabricConfig.get<number>('qfabPort', 8008);
        this.fabricUrl = `http://localhost:${fabricPort}`;
    }

    /**
     * Get paths to built distributions
     */
    private getPaths(): { coreJs: string; browser: string } {
        const config = vscode.workspace.getConfiguration('elv-vscode');
        
        // Get custom paths or use workspace sibling directories
        let coreJsPath = config.get<string>('browser.coreJsPath', '');
        let browserPath = config.get<string>('browser.path', '');
        
        // Fallback to sibling directories
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || this.context.extensionUri.fsPath;
        const parentDir = path.dirname(workspacePath);
        
        if (!coreJsPath || !fs.existsSync(coreJsPath)) {
            coreJsPath = path.join(parentDir, 'elv-core-js');
        }
        
        if (!browserPath || !fs.existsSync(browserPath)) {
            browserPath = path.join(parentDir, 'elv-fabric-browser');
        }
        
        return {
            coreJs: path.join(coreJsPath, 'dist'),
            browser: path.join(browserPath, 'dist')
        };
    }

    /**
     * Build the projects
     */
    public async build(): Promise<boolean> {
        const paths = this.getPaths();
        const coreJsPath = path.dirname(paths.coreJs); // Remove /dist
        const browserPath = path.dirname(paths.browser); // Remove /dist
        
        if (!fs.existsSync(coreJsPath) || !fs.existsSync(path.join(coreJsPath, 'package.json'))) {
            vscode.window.showErrorMessage(
                `elv-core-js not found at ${coreJsPath}. Please configure browser.coreJsPath in settings or place it in ${path.dirname(coreJsPath)}/elv-core-js`
            );
            return false;
        }

        if (!fs.existsSync(browserPath) || !fs.existsSync(path.join(browserPath, 'package.json'))) {
            vscode.window.showErrorMessage(
                `elv-fabric-browser not found at ${browserPath}. Please configure browser.path in settings or place it in ${path.dirname(browserPath)}/elv-fabric-browser`
            );
            return false;
        }

        this.outputChannel.show(true);
        this.outputChannel.appendLine('Building elv-core-js and elv-fabric-browser...');

        // Build elv-core-js
        this.outputChannel.appendLine('\n=== Building elv-core-js ===');
        const coreJsBuilt = await this.buildProject(coreJsPath, 'elv-core-js');
        if (!coreJsBuilt) {
            return false;
        }

        // Build elv-fabric-browser
        this.outputChannel.appendLine('\n=== Building elv-fabric-browser ===');
        const browserBuilt = await this.buildProject(browserPath, 'elv-fabric-browser');
        if (!browserBuilt) {
            return false;
        }

        this.outputChannel.appendLine('\n✓ Build completed successfully');
        vscode.window.showInformationMessage('Fabric Browser built successfully');
        return true;
    }

    /**
     * Build a single project
     */
    private buildProject(projectPath: string, name: string): Promise<boolean> {
        return new Promise((resolve) => {
            const { spawn } = require('child_process');
            
            this.outputChannel.appendLine(`Building ${name} at ${projectPath}...`);
            
            const buildProcess = spawn('npm', ['run', 'build'], {
                cwd: projectPath,
                shell: true
            });

            buildProcess.stdout.on('data', (data: Buffer) => {
                this.outputChannel.append(data.toString());
            });

            buildProcess.stderr.on('data', (data: Buffer) => {
                this.outputChannel.append(data.toString());
            });

            buildProcess.on('close', (code: number) => {
                if (code === 0) {
                    this.outputChannel.appendLine(`✓ ${name} built successfully`);
                    resolve(true);
                } else {
                    this.outputChannel.appendLine(`✗ ${name} build failed with code ${code}`);
                    vscode.window.showErrorMessage(`Failed to build ${name}`);
                    resolve(false);
                }
            });

            buildProcess.on('error', (error: Error) => {
                this.outputChannel.appendLine(`✗ Error building ${name}: ${error.message}`);
                resolve(false);
            });
        });
    }

    /**
     * Check if builds exist
     */
    private areBuildsReady(): boolean {
        const paths = this.getPaths();
        const coreJsBuilt = fs.existsSync(paths.coreJs) && 
                           fs.existsSync(path.join(paths.coreJs, 'index.html'));
        const browserBuilt = fs.existsSync(paths.browser) && 
                            fs.existsSync(path.join(paths.browser, 'index.html'));
        
        return coreJsBuilt && browserBuilt;
    }

    /**
     * Start the deployment server
     */
    public async start(): Promise<boolean> {
        if (this.server) {
            this.outputChannel.appendLine('Deployment server is already running');
            return true;
        }

        // Check if builds exist, if not offer to build
        if (!this.areBuildsReady()) {
            const build = await vscode.window.showInformationMessage(
                'Fabric Browser needs to be built first. This will take a few minutes. Build now?',
                'Build',
                'Cancel'
            );

            if (build !== 'Build') {
                return false;
            }

            const built = await this.build();
            if (!built) {
                return false;
            }
        }

        const paths = this.getPaths();
        this.coreJsDistPath = paths.coreJs;
        this.browserDistPath = paths.browser;

        // Check if dist folders exist
        if (!fs.existsSync(this.coreJsDistPath)) {
            vscode.window.showErrorMessage('elv-core-js not built. Run "Build Fabric Browser" first.');
            return false;
        }

        if (!fs.existsSync(this.browserDistPath)) {
            vscode.window.showErrorMessage('elv-fabric-browser not built. Run "Build Fabric Browser" first.');
            return false;
        }

        try {
            const app = express();

            // Serve configuration.js dynamically
            app.get('/configuration.js', (req: any, res: any) => {
                const configContent = `const EluvioConfiguration = {
  "config-url": "/config?qspace=dev&self"
};

if(typeof exports !== 'undefined') {
  exports.EluvioConfiguration = EluvioConfiguration;
}
`;
                res.type('application/javascript');
                res.send(configContent);
            });

            // Proxy middleware for fabric API requests
            app.use((req: any, res: any, next: any) => {
                // Proxy requests to /config, /qlibs, /q/, etc to the fabric
                if (req.path.startsWith('/config') || 
                    req.path.startsWith('/qlibs') || 
                    req.path.startsWith('/q/') ||
                    req.path.startsWith('/qspace') ||
                    req.path.startsWith('/s/') ||
                    req.path.startsWith('/rep/')) {
                    
                    this.outputChannel.appendLine(`Proxying: ${req.method} ${req.path}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`);
                    
                    const proxyUrl = `${this.fabricUrl}${req.url}`;
                    const client = this.fabricUrl.startsWith('https') ? https : http;
                    
                    const options = {
                        method: req.method,
                        headers: {
                            ...req.headers,
                            host: new URL(this.fabricUrl).host
                        }
                    };

                    const proxyReq = client.request(proxyUrl, options, (proxyRes: any) => {
                        // Add CORS headers
                        res.set('Access-Control-Allow-Origin', '*');
                        res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                        res.set('Access-Control-Allow-Headers', '*');
                        
                        res.status(proxyRes.statusCode || 200);
                        Object.keys(proxyRes.headers).forEach(key => {
                            res.set(key, proxyRes.headers[key]);
                        });
                        proxyRes.pipe(res);
                    });

                    proxyReq.on('error', (error: Error) => {
                        this.outputChannel.appendLine(`Proxy error: ${error.message}`);
                        res.status(502).send('Bad Gateway');
                    });

                    if (req.method !== 'GET' && req.method !== 'HEAD') {
                        req.pipe(proxyReq);
                    } else {
                        proxyReq.end();
                    }
                } else {
                    next();
                }
            });

            // Serve core-js static files (default)
            app.use(express.static(this.coreJsDistPath));

            // Serve browser static files at /browser
            app.use('/browser', express.static(this.browserDistPath));

            // Fallback to index.html for SPA routing
            app.get('*', (req: any, res: any) => {
                const indexPath = path.join(this.coreJsDistPath, 'index.html');
                if (fs.existsSync(indexPath)) {
                    res.sendFile(indexPath);
                } else {
                    res.status(404).send('Not found');
                }
            });

            // Start server
            this.server = app.listen(this.port, () => {
                this.outputChannel.appendLine(`\n✓ Deployment server started on http://localhost:${this.port}`);
                this.outputChannel.appendLine(`  - Core JS: ${this.coreJsDistPath}`);
                this.outputChannel.appendLine(`  - Browser: ${this.browserDistPath}`);
                this.outputChannel.appendLine(`  - Proxying to fabric: ${this.fabricUrl}`);
                
                vscode.window.showInformationMessage(
                    `Fabric Browser ready at http://localhost:${this.port}`,
                    'Open'
                ).then(action => {
                    if (action === 'Open') {
                        vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${this.port}`));
                    }
                });
            });

            this.server.on('error', (error: any) => {
                if (error.code === 'EADDRINUSE') {
                    vscode.window.showErrorMessage(`Port ${this.port} is already in use`);
                } else {
                    vscode.window.showErrorMessage(`Server error: ${error.message}`);
                }
                this.server = null;
            });

            return true;

        } catch (error: any) {
            this.outputChannel.appendLine(`Failed to start server: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to start deployment server: ${error.message}`);
            return false;
        }
    }

    /**
     * Stop the deployment server
     */
    public async stop(): Promise<void> {
        if (!this.server) {
            this.outputChannel.appendLine('Deployment server is not running');
            return;
        }

        return new Promise((resolve) => {
            this.server.close(() => {
                this.outputChannel.appendLine('Deployment server stopped');
                this.server = null;
                resolve();
            });
        });
    }

    /**
     * Check if server is running
     */
    public isRunning(): boolean {
        return this.server !== null;
    }

    /**
     * Open the browser
     */
    public async open(): Promise<void> {
        if (!this.isRunning()) {
            const start = await vscode.window.showInformationMessage(
                'Deployment server is not running. Would you like to start it?',
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

        const url = `http://localhost:${this.port}`;
        await vscode.env.openExternal(vscode.Uri.parse(url));
    }
}
