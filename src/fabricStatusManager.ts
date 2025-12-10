import * as vscode from 'vscode';
import { FabricRunner } from './fabric_runner';
import { WorkspaceStateManager } from './workspaceStateManager';
import { FabricBrowserManager } from './fabricBrowserManager';
import { exec } from 'child_process';

export enum FabricStatus {
    NOT_INSTALLED = 'not_installed',
    STOPPED = 'stopped',
    STARTING = 'starting',
    RUNNING = 'running',
    STOPPING = 'stopping',
    ERROR = 'error'
}

export class FabricStatusManager {
    private statusBarItem: vscode.StatusBarItem;
    private status: FabricStatus = FabricStatus.STOPPED;
    private fabricRunner: FabricRunner;
    private binaryManager: any;
    private statusCheckInterval?: NodeJS.Timeout;
    private context: vscode.ExtensionContext;
    private workspaceState: WorkspaceStateManager;
    private browserManager?: FabricBrowserManager;

    constructor(
        context: vscode.ExtensionContext,
        fabricRunner: FabricRunner,
        workspaceState: WorkspaceStateManager,
        browserManager?: FabricBrowserManager,
        binaryManager?: any
    ) {
        this.context = context;
        this.fabricRunner = fabricRunner;
        this.workspaceState = workspaceState;
        this.browserManager = browserManager;
        this.binaryManager = binaryManager;

        // Create status bar item
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'elv-vscode.toggleFabric';

        // Register command
        context.subscriptions.push(
            vscode.commands.registerCommand('elv-vscode.toggleFabric', () => {
                this.toggleFabric();
            })
        );

        context.subscriptions.push(this.statusBarItem);

        // Initial update - check if installed first
        this.checkInstallStatus().then(installed => {
            this.updateStatus(installed ? FabricStatus.STOPPED : FabricStatus.NOT_INSTALLED);
        });
        this.statusBarItem.show();

        // Start periodic status checks
        this.startStatusChecking();
    }

    public async checkInstallStatus(): Promise<boolean> {
        // Check if binaries exist (not full install which includes config)
        if (this.binaryManager) {
            const check = await this.binaryManager.checkBinaries();
            return check.installed;
        }
        // Fallback to fabricRunner check
        return await this.fabricRunner.isInstalled();
    }

    public async updateInstallStatus(): Promise<void> {
        const installed = await this.checkInstallStatus();
        if (!installed && this.status !== FabricStatus.NOT_INSTALLED) {
            this.updateStatus(FabricStatus.NOT_INSTALLED);
        } else if (installed && this.status === FabricStatus.NOT_INSTALLED) {
            this.updateStatus(FabricStatus.STOPPED);
        }
    }

    private startStatusChecking(): void {
        // Check every 5 seconds
        this.statusCheckInterval = setInterval(() => {
            this.checkFabricStatus();
        }, 5000);

        this.context.subscriptions.push({
            dispose: () => {
                if (this.statusCheckInterval) {
                    clearInterval(this.statusCheckInterval);
                }
            }
        });
    }

    private async checkFabricStatus(): Promise<void> {
        const isRunning = await this.isQfabRunning();

        if (isRunning && this.status === FabricStatus.STOPPED) {
            this.updateStatus(FabricStatus.RUNNING);
        } else if (!isRunning && this.status === FabricStatus.RUNNING) {
            this.updateStatus(FabricStatus.STOPPED);
        }
    }

    private isQfabRunning(): Promise<boolean> {
        return new Promise((resolve) => {
            exec('pgrep -x qfab', (error, stdout, stderr) => {
                resolve(!error && stdout.trim().length > 0);
            });
        });
    }

    public updateStatus(newStatus: FabricStatus): void {
        this.status = newStatus;
        this.updateStatusBarItem();

        // Save state
        this.context.workspaceState.update('fabricStatus', newStatus);

        // Update workspace state
        if (newStatus === FabricStatus.RUNNING) {
            this.workspaceState.setFabricRunning(true);
        } else if (newStatus === FabricStatus.STOPPED) {
            this.workspaceState.setFabricRunning(false);
        }
    }

    private updateStatusBarItem(): void {
        let icon: string;
        let text: string;
        let tooltip: string;
        let color: vscode.ThemeColor | undefined;

        switch (this.status) {
            case FabricStatus.NOT_INSTALLED:
                icon = '$(cloud-download)';
                text = 'Install Fabric';
                tooltip = 'Click to install Eluvio fabric binaries';
                color = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;
            case FabricStatus.STOPPED:
                icon = '$(circle-slash)';
                text = 'Fabric: Stopped';
                tooltip = 'Click to start local Eluvio fabric';
                color = undefined;
                break;
            case FabricStatus.STARTING:
                icon = '$(loading~spin)';
                text = 'Fabric: Starting';
                tooltip = 'Local fabric is starting...';
                color = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;
            case FabricStatus.RUNNING:
                icon = '$(pass-filled)';
                text = 'Fabric: Running';
                tooltip = 'Click to stop local Eluvio fabric';
                color = new vscode.ThemeColor('statusBarItem.prominentBackground');
                break;
            case FabricStatus.STOPPING:
                icon = '$(loading~spin)';
                text = 'Fabric: Stopping';
                tooltip = 'Local fabric is stopping...';
                color = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;
            case FabricStatus.ERROR:
                icon = '$(error)';
                text = 'Fabric: Error';
                tooltip = 'Local fabric encountered an error. Click to retry.';
                color = new vscode.ThemeColor('statusBarItem.errorBackground');
                break;
        }

        this.statusBarItem.text = `${icon} ${text}`;
        this.statusBarItem.tooltip = tooltip;
        this.statusBarItem.backgroundColor = color;
    }

    private async toggleFabric(): Promise<void> {
        if (this.status === FabricStatus.NOT_INSTALLED) {
            // Trigger install flow
            await vscode.commands.executeCommand('elv-vscode.installFabric');
        } else if (this.status === FabricStatus.RUNNING) {
            await this.stopFabric();
        } else if (this.status === FabricStatus.STOPPED || this.status === FabricStatus.ERROR) {
            await this.startFabric();
        } else {
            vscode.window.showInformationMessage(
                `Fabric is currently ${this.status}. Please wait...`
            );
        }
    }

    public async startFabric(): Promise<void> {
        if (this.status === FabricStatus.RUNNING || this.status === FabricStatus.STARTING) {
            vscode.window.showInformationMessage('Fabric is already running or starting');
            return;
        }

        try {
            this.updateStatus(FabricStatus.STARTING);

            // Check if installation is needed
            const installNeeded = !await this.fabricRunner.isInstalled();
            if (installNeeded) {
                vscode.window.showInformationMessage('Installing local fabric...');
                try {
                    await this.fabricRunner.install(false);
                } catch (installError) {
                    this.updateStatus(FabricStatus.ERROR);
                    // Error message already shown by install(), just rethrow
                    throw installError;
                }
            }

            // Start the fabric
            await this.fabricRunner.execute();

            // Wait a bit and verify it started
            await new Promise(resolve => setTimeout(resolve, 3000));
            const running = await this.isQfabRunning();

            if (running) {
                this.updateStatus(FabricStatus.RUNNING);
                vscode.window.showInformationMessage('Local fabric started successfully');

                // Auto-start browser if enabled
                const config = vscode.workspace.getConfiguration('elv-vscode');
                const autoStartBrowser = config.get<boolean>('browser.autoStart', false);
                if (autoStartBrowser && this.browserManager) {
                    // Start browser in background (don't await to avoid blocking)
                    setTimeout(() => {
                        this.browserManager?.start().catch(err => {
                            vscode.window.showWarningMessage(`Failed to auto-start Fabric Browser: ${err.message}`);
                        });
                    }, 2000); // Wait 2 seconds for fabric to stabilize
                }
            } else {
                throw new Error('Fabric failed to start');
            }
        } catch (error) {
            this.updateStatus(FabricStatus.ERROR);
            vscode.window.showErrorMessage(`Failed to start fabric: ${error}`);
        }
    }

    public async stopFabric(): Promise<void> {
        if (this.status === FabricStatus.STOPPED || this.status === FabricStatus.STOPPING) {
            vscode.window.showInformationMessage('Fabric is already stopped or stopping');
            return;
        }

        try {
            this.updateStatus(FabricStatus.STOPPING);

            // Stop the fabric
            this.fabricRunner.finalize();

            // Wait for processes to terminate
            await new Promise(resolve => setTimeout(resolve, 2000));

            this.updateStatus(FabricStatus.STOPPED);
            vscode.window.showInformationMessage('Local fabric stopped');
        } catch (error) {
            this.updateStatus(FabricStatus.ERROR);
            vscode.window.showErrorMessage(`Failed to stop fabric: ${error}`);
        }
    }

    public getStatus(): FabricStatus {
        return this.status;
    }

    public isRunning(): boolean {
        return this.status === FabricStatus.RUNNING;
    }

    public dispose(): void {
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
        }
        this.statusBarItem.dispose();
    }
}
