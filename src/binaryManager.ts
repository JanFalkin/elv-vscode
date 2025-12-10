import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { spawn } from 'child_process';

export interface BinaryInfo {
    name: string;
    version: string;
    url: string;
    checksum?: string;
}

export interface PlatformBinaries {
    qfab: BinaryInfo;
    elvmasterd: BinaryInfo;
    qfab_cli: BinaryInfo;
}

export class BinaryManager {
    private context: vscode.ExtensionContext;
    private binDir: string;
    private outputChannel: vscode.OutputChannel;
    private downloadProgress: vscode.Progress<{ message?: string; increment?: number }> | undefined;
    private static readonly GITHUB_TOKEN_KEY = 'github-pat';

    constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
        this.context = context;
        this.outputChannel = outputChannel;
        this.binDir = path.join(context.globalStorageUri.fsPath, 'bin');

        // Ensure bin directory exists
        if (!fs.existsSync(this.binDir)) {
            fs.mkdirSync(this.binDir, { recursive: true });
        }
    }

    /**
     * Get stored GitHub Personal Access Token
     */
    private async getGitHubToken(): Promise<string | undefined> {
        return await this.context.secrets.get(BinaryManager.GITHUB_TOKEN_KEY);
    }

    /**
     * Store GitHub Personal Access Token securely
     */
    public async setGitHubToken(token: string): Promise<void> {
        await this.context.secrets.store(BinaryManager.GITHUB_TOKEN_KEY, token);
    }

    /**
     * Remove stored GitHub Personal Access Token
     */
    public async clearGitHubToken(): Promise<void> {
        await this.context.secrets.delete(BinaryManager.GITHUB_TOKEN_KEY);
    }

    /**
     * Prompt user for GitHub Personal Access Token
     */
    private async promptForGitHubToken(): Promise<string | undefined> {
        const result = await vscode.window.showInformationMessage(
            'GitHub authentication required to download Eluvio fabric binaries from private repository.',
            'Enter Token',
            'Learn More',
            'Cancel'
        );

        if (result === 'Learn More') {
            // Show instructions
            const panel = vscode.window.createWebviewPanel(
                'githubTokenHelp',
                'GitHub Personal Access Token Setup',
                vscode.ViewColumn.One,
                {}
            );
            panel.webview.html = this.getTokenHelpHtml();
            return undefined;
        } else if (result === 'Enter Token') {
            const token = await vscode.window.showInputBox({
                prompt: 'Enter your GitHub Personal Access Token',
                password: true,
                placeHolder: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value) {
                        return 'Token is required';
                    }
                    if (!value.startsWith('ghp_') && !value.startsWith('github_pat_')) {
                        return 'Invalid token format. Should start with ghp_ or github_pat_';
                    }
                    return null;
                }
            });

            if (token) {
                await this.setGitHubToken(token);
                vscode.window.showInformationMessage('GitHub token saved securely');
                return token;
            }
        }

        return undefined;
    }

    /**
     * HTML content for GitHub token setup instructions
     */
    private getTokenHelpHtml(): string {
        return `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: var(--vscode-font-family); padding: 20px; line-height: 1.6; }
        h1 { color: var(--vscode-foreground); }
        h2 { color: var(--vscode-foreground); margin-top: 20px; }
        ol { margin-left: 20px; }
        li { margin: 10px 0; }
        code { background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 3px; }
        .note { background: var(--vscode-textBlockQuote-background); border-left: 4px solid var(--vscode-textBlockQuote-border); padding: 10px; margin: 20px 0; }
    </style>
</head>
<body>
    <h1>GitHub Personal Access Token Setup</h1>

    <h2>Why do I need this?</h2>
    <p>The Eluvio fabric binaries are stored in a private GitHub repository. You need a Personal Access Token (PAT) to authenticate and download them.</p>

    <h2>How to create a GitHub PAT:</h2>
    <ol>
        <li>Go to <a href="https://github.com/settings/tokens/new">github.com/settings/tokens/new</a></li>
        <li>Click "Generate new token" → "Generate new token (classic)"</li>
        <li>Give it a name like "Eluvio VS Code Extension"</li>
        <li>Set expiration (e.g., 90 days or No expiration for convenience)</li>
        <li><strong>Select scope: <code>repo</code></strong> (Full control of private repositories)</li>
        <li>Click "Generate token" at the bottom</li>
        <li>Copy the token (starts with <code>ghp_</code>)</li>
        <li>Paste it into VS Code when prompted</li>
    </ol>

    <div class="note">
        <strong>Note:</strong> The token will be stored securely in VS Code's encrypted secrets storage. It will never be logged or transmitted anywhere except to GitHub for authentication.
    </div>

    <h2>Required Access:</h2>
    <p>You must have read access to the Eluvio fabric binaries repository. Contact your administrator if you don't have access.</p>
</body>
</html>`;
    }

    /**
     * Ensure GitHub token is available, prompt if not
     */
    private async ensureGitHubToken(): Promise<string | undefined> {
        let token = await this.getGitHubToken();

        if (!token) {
            token = await this.promptForGitHubToken();
        }

        return token;
    }

    /**
     * Get the platform-specific binary configuration
     */
    private getPlatformBinaries(): PlatformBinaries | null {
        const platform = process.platform;
        const arch = process.arch;

        // Get configuration from VS Code settings
        const config = vscode.workspace.getConfiguration('elv-vscode.binaries');
        const baseUrl = config.get<string>('downloadUrl') || '';
        const version = config.get<string>('version') || 'latest';

        if (!baseUrl) {
            vscode.window.showWarningMessage(
                'No binary download URL configured. Please set elv-vscode.binaries.downloadUrl in settings.'
            );
            return null;
        }

        // Construct platform-specific URLs
        const platformSuffix = this.getPlatformSuffix(platform, arch);
        if (!platformSuffix) {
            vscode.window.showErrorMessage(`Unsupported platform: ${platform}-${arch}`);
            return null;
        }

        return {
            qfab: {
                name: 'qfab',
                version: version,
                url: `${baseUrl}/qfab-${version}-${platformSuffix}`
            },
            elvmasterd: {
                name: 'elvmasterd',
                version: version,
                url: `${baseUrl}/elvmasterd-${version}-${platformSuffix}`
            },
            qfab_cli: {
                name: 'qfab_cli',
                version: version,
                url: `${baseUrl}/qfab_cli-${version}-${platformSuffix}`
            }
        };
    }

    private getPlatformSuffix(platform: string, arch: string): string | null {
        if (platform === 'linux' && arch === 'x64') {
            return 'linux-amd64';
        } else if (platform === 'linux' && arch === 'arm64') {
            return 'linux-arm64';
        } else if (platform === 'darwin' && arch === 'x64') {
            return 'darwin-amd64';
        } else if (platform === 'darwin' && arch === 'arm64') {
            return 'darwin-arm64';
        } else if (platform === 'win32' && arch === 'x64') {
            return 'windows-amd64.exe';
        }
        return null;
    }

    /**
     * Check if all required binaries are installed
     */
    public async checkBinaries(): Promise<{ installed: boolean; missing: string[] }> {
        const binaries = ['qfab', 'elvmasterd', 'qfab_cli'];
        const missing: string[] = [];

        for (const binary of binaries) {
            const binaryPath = path.join(this.binDir, binary);
            if (!fs.existsSync(binaryPath)) {
                missing.push(binary);
            } else {
                // Check if binary is executable
                try {
                    fs.accessSync(binaryPath, fs.constants.X_OK);
                } catch (err) {
                    missing.push(binary);
                }
            }
        }

        // Check for tools bundle (lib directory with FFmpeg libraries)
        const toolsLibDir = path.join(path.dirname(this.binDir), 'tools', 'lib');
        if (!fs.existsSync(toolsLibDir)) {
            missing.push('tools-bundle');
        }

        return {
            installed: missing.length === 0,
            missing: missing
        };
    }

    /**
     * Download a single binary file with optional GitHub authentication
     */
    private async downloadFile(url: string, destPath: string, githubToken?: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(destPath);
            const protocol = url.startsWith('https') ? https : http;

            const options: https.RequestOptions = {};

            // Add GitHub authentication header if token is provided
            if (githubToken && url.includes('github.com')) {
                options.headers = {
                    'Authorization': `token ${githubToken}`,
                    'User-Agent': 'elv-vscode-extension',
                    'Accept': 'application/octet-stream'
                };
            }

            const request = protocol.get(url, options, (response: any) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    // Follow redirect, preserve authentication
                    const redirectUrl = response.headers.location;
                    if (redirectUrl) {
                        file.close();
                        this.downloadFile(redirectUrl, destPath, githubToken).then(resolve).catch(reject);
                        return;
                    }
                }

                if (response.statusCode === 401) {
                    file.close();
                    fs.unlinkSync(destPath);
                    reject(new Error('GitHub authentication failed. Token may be invalid or expired.'));
                    return;
                }

                if (response.statusCode === 404) {
                    file.close();
                    fs.unlinkSync(destPath);
                    reject(new Error('Binary not found. Check the download URL and version.'));
                    return;
                }

                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlinkSync(destPath);
                    reject(new Error(`Failed to download: ${response.statusCode}`));
                    return;
                }

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    // Make executable
                    fs.chmodSync(destPath, 0o755);
                    resolve();
                });

                file.on('error', (err: any) => {
                    file.close();
                    if (fs.existsSync(destPath)) {
                        fs.unlinkSync(destPath);
                    }
                    reject(err);
                });
            });

            request.on('error', (err: any) => {
                file.close();
                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath);
                }
                reject(err);
            });

            request.end();
        });
    }

    /**
     * Download all required binaries with GitHub authentication if needed
     */
    public async downloadBinaries(): Promise<boolean> {
        const binaries = this.getPlatformBinaries();
        if (!binaries) {
            return false;
        }

        // Check if URL is GitHub and get token if needed
        const config = vscode.workspace.getConfiguration('elv-vscode.binaries');
        const baseUrl = config.get<string>('downloadUrl') || '';
        const isGitHub = baseUrl.includes('github.com');

        let githubToken: string | undefined;
        if (isGitHub) {
            githubToken = await this.ensureGitHubToken();
            if (!githubToken) {
                vscode.window.showErrorMessage('GitHub authentication cancelled. Cannot download binaries.');
                return false;
            }
        }

        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Downloading Eluvio Fabric Binaries",
            cancellable: false
        }, async (progress) => {
            this.downloadProgress = progress;
            const binaryList = [binaries.qfab, binaries.elvmasterd, binaries.qfab_cli];
            let completed = 0;

            for (const binary of binaryList) {
                try {
                    progress.report({
                        message: `Downloading ${binary.name}...`,
                        increment: 0
                    });

                    const destPath = path.join(this.binDir, binary.name);
                    await this.downloadFile(binary.url, destPath, githubToken);

                    completed++;
                    progress.report({
                        increment: (100 / binaryList.length)
                    });

                    console.log(`Downloaded ${binary.name} to ${destPath}`);
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    vscode.window.showErrorMessage(
                        `Failed to download ${binary.name}: ${errorMsg}`
                    );

                    // If authentication error, offer to re-enter token
                    if (errorMsg.includes('authentication') && isGitHub) {
                        const retry = await vscode.window.showErrorMessage(
                            'GitHub authentication failed. Would you like to enter a new token?',
                            'Enter New Token',
                            'Cancel'
                        );

                        if (retry === 'Enter New Token') {
                            await this.clearGitHubToken();
                            return await this.downloadBinaries(); // Retry with new token
                        }
                    }

                    return false;
                }
            }

            vscode.window.showInformationMessage('All binaries downloaded successfully!');
            return true;
        });
    }

    /**
     * Download and extract tools bundle (FFmpeg libraries, etc.)
     */
    public async downloadToolsBundle(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('elv-vscode.binaries');
        const baseUrl = config.get<string>('downloadUrl') || '';
        const version = config.get<string>('version') || 'latest';
        const platform = process.platform;
        const arch = process.arch;

        if (!baseUrl) {
            return false;
        }

        const platformSuffix = this.getPlatformSuffix(platform, arch);
        if (!platformSuffix) {
            return false;
        }

        const toolsUrl = `${baseUrl}/tools-${version}-${platformSuffix}.tar.gz`;
        const toolsDir = path.join(path.dirname(this.binDir), 'tools');
        const toolsTarPath = path.join(path.dirname(this.binDir), 'tools.tar.gz');

        // Check if GitHub and get token
        const isGitHub = baseUrl.includes('github.com');
        let githubToken: string | undefined;
        if (isGitHub) {
            githubToken = await this.ensureGitHubToken();
            if (!githubToken) {
                return false;
            }
        }

        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Downloading Eluvio Tools Bundle",
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ message: 'Downloading tools bundle...' });

                await this.downloadFile(toolsUrl, toolsTarPath, githubToken);

                progress.report({ message: 'Extracting tools bundle...', increment: 50 });

                // Extract the tar.gz
                const tar = require('child_process').spawnSync('tar',
                    ['-xzf', toolsTarPath, '-C', path.dirname(this.binDir)],
                    { stdio: 'inherit' }
                );

                if (tar.status !== 0) {
                    throw new Error('Failed to extract tools bundle');
                }

                // Clean up tar file
                fs.unlinkSync(toolsTarPath);

                // Handle case where tarball contains build-toolset instead of tools
                const buildToolsetDir = path.join(path.dirname(this.binDir), 'build-toolset');
                if (fs.existsSync(buildToolsetDir) && !fs.existsSync(toolsDir)) {
                    this.outputChannel.appendLine(`[BinaryManager] Renaming build-toolset to tools`);
                    fs.renameSync(buildToolsetDir, toolsDir);
                }

                progress.report({ increment: 50 });
                this.outputChannel.appendLine(`[BinaryManager] Tools bundle extracted to ${toolsDir}`);
                vscode.window.showInformationMessage('Tools bundle installed successfully!');

                return true;
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                this.outputChannel.appendLine(`[BinaryManager] Tools bundle download failed: ${errorMsg}`);
                vscode.window.showErrorMessage(
                    `Failed to download tools bundle: ${errorMsg}. ` +
                    `The Eluvio Fabric requires a specific version of FFmpeg libraries. ` +
                    `Please ensure tools-${version}-${platformSuffix}.tar.gz is available in your binary repository.`
                );
                return false;
            }
        });
    }

    /**
     * Ensure binaries are available, prompt user if not
     */
    public async ensureBinaries(): Promise<boolean> {
        this.outputChannel.appendLine('[BinaryManager] Checking binaries...');
        const check = await this.checkBinaries();

        if (check.installed) {
            this.outputChannel.appendLine('[BinaryManager] All binaries already installed');
            return true;
        }

        this.outputChannel.appendLine(`[BinaryManager] Missing binaries: ${check.missing.join(', ')}`);
        this.outputChannel.appendLine('[BinaryManager] Showing installation prompt to user...');

        // Ask user if they want to download
        const choice = await vscode.window.showInformationMessage(
            `The following binaries are missing: ${check.missing.join(', ')}. Would you like to download them?`,
            'Download',
            'Cancel',
            'Specify Path'
        );

        this.outputChannel.appendLine(`[BinaryManager] User selected: ${choice || 'dismissed/cancelled'}`);

        if (choice === 'Download') {
            const binariesSuccess = await this.downloadBinaries();
            if (!binariesSuccess) {
                return false;
            }

            // Tools bundle is required for proper operation
            const toolsSuccess = await this.downloadToolsBundle();
            if (!toolsSuccess) {
                vscode.window.showWarningMessage(
                    'Binaries installed but tools bundle failed. The extension may not work correctly without the required FFmpeg libraries.'
                );
                return false;
            }

            return true;
        } else if (choice === 'Specify Path') {
            return await this.promptForBinaryPath();
        }

        return false;
    }

    /**
     * Allow user to specify custom binary path
     */
    private async promptForBinaryPath(): Promise<boolean> {
        const binDir = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Binary Directory',
            title: 'Select directory containing qfab, elvmasterd, qfab_cli, and tools tarball'
        });

        if (binDir && binDir[0]) {
            const sourcePath = binDir[0].fsPath;

            // Copy or symlink binaries
            try {
                const binaries = ['qfab', 'elvmasterd', 'qfab_cli'];
                for (const binary of binaries) {
                    const sourceBinary = path.join(sourcePath, binary);
                    const destBinary = path.join(this.binDir, binary);

                    if (fs.existsSync(sourceBinary)) {
                        // Create symlink
                        if (fs.existsSync(destBinary)) {
                            fs.unlinkSync(destBinary);
                        }
                        fs.symlinkSync(sourceBinary, destBinary);
                    } else {
                        vscode.window.showWarningMessage(`${binary} not found in selected directory`);
                    }
                }

                // Look for tools tarball in source directory
                const toolsDestDir = path.join(path.dirname(this.binDir), 'tools');
                const sourceToolsDir = path.join(sourcePath, 'tools');

                // First check if tools/ directory already exists (already extracted)
                if (fs.existsSync(sourceToolsDir)) {
                    this.outputChannel.appendLine(`[BinaryManager] Found extracted tools directory at ${sourceToolsDir}`);
                    // Symlink the existing tools directory
                    if (fs.existsSync(toolsDestDir)) {
                        const stats = fs.lstatSync(toolsDestDir);
                        if (stats.isSymbolicLink()) {
                            fs.unlinkSync(toolsDestDir);
                        } else {
                            fs.rmSync(toolsDestDir, { recursive: true, force: true });
                        }
                    }
                    fs.symlinkSync(sourceToolsDir, toolsDestDir);
                    this.outputChannel.appendLine(`[BinaryManager] Linked tools directory from ${sourceToolsDir}`);
                } else {
                    // Look for tools tarball (tools-*.tar.gz or tools.tar.gz)
                    const files = fs.readdirSync(sourcePath);
                    const toolsTarball = files.find(f => f.startsWith('tools') && f.endsWith('.tar.gz'));

                    if (toolsTarball) {
                        const toolsTarPath = path.join(sourcePath, toolsTarball);
                        this.outputChannel.appendLine(`[BinaryManager] Found tools tarball: ${toolsTarPath}`);
                        this.outputChannel.appendLine(`[BinaryManager] Extracting to ${path.dirname(this.binDir)}`);

                        // Extract the tarball
                        const tar = require('child_process').spawnSync('tar',
                            ['-xzf', toolsTarPath, '-C', path.dirname(this.binDir)],
                            { stdio: 'inherit' }
                        );

                        if (tar.status !== 0) {
                            throw new Error(`Failed to extract tools tarball: ${toolsTarball}`);
                        }

                        this.outputChannel.appendLine(`[BinaryManager] Tools extracted successfully`);

                        // Handle case where tarball contains build-toolset instead of tools
                        const buildToolsetDir = path.join(path.dirname(this.binDir), 'build-toolset');
                        if (fs.existsSync(buildToolsetDir) && !fs.existsSync(toolsDestDir)) {
                            this.outputChannel.appendLine(`[BinaryManager] Renaming build-toolset to tools`);
                            fs.renameSync(buildToolsetDir, toolsDestDir);
                        }
                    } else {
                        vscode.window.showWarningMessage(
                            'tools/ directory or tools-*.tar.gz not found in selected path. FFmpeg libraries may be missing.'
                        );
                    }
                }

                const check = await this.checkBinaries();
                if (check.installed) {
                    vscode.window.showInformationMessage('Binaries and tools linked successfully!');
                    return true;
                } else {
                    vscode.window.showWarningMessage(
                        `Installation incomplete. Missing: ${check.missing.join(', ')}`
                    );
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to link binaries: ${error}`);
            }
        }

        return false;
    }

    /**
     * Get the path to the binaries directory
     */
    public getBinDir(): string {
        return this.binDir;
    }

    /**
     * Get version of installed binary
     */
    public async getBinaryVersion(binaryName: string): Promise<string | null> {
        const binaryPath = path.join(this.binDir, binaryName);

        if (!fs.existsSync(binaryPath)) {
            return null;
        }

        return new Promise((resolve) => {
            const proc = spawn(binaryPath, ['--version']);
            let output = '';

            proc.stdout.on('data', (data) => {
                output += data.toString();
            });

            proc.on('close', (code) => {
                if (code === 0 && output) {
                    // Extract version from output
                    const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
                    resolve(versionMatch ? versionMatch[1] : 'unknown');
                } else {
                    resolve('unknown');
                }
            });

            proc.on('error', () => {
                resolve(null);
            });

            // Timeout after 5 seconds
            setTimeout(() => {
                proc.kill();
                resolve('unknown');
            }, 5000);
        });
    }
}
