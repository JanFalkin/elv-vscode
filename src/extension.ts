// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { elv_tree } from './tree_view';
import { FabricRunner } from './fabric_runner';
import { CommandsViewProvider } from './commandView';
import { BinaryManager } from './binaryManager';
import { FabricStatusManager } from './fabricStatusManager';
import { WorkspaceStateManager } from './workspaceStateManager';
import { FabricBrowserManager } from './fabricBrowserManager';
import { ElvClient } from '@eluvio/elv-client-js';
var fs = require('fs');
var path = require('path');
const cp = require('child_process');
var fabricRunner: FabricRunner;
var statusManager: FabricStatusManager;
var workspaceStateManager: WorkspaceStateManager;
var browserManager: FabricBrowserManager;

interface PublishCommandArgs {
	file: string;
}


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel('Eluvio Fabric Extension');
	outputChannel.appendLine('[elv-vscode] Extension activating...');
	outputChannel.show();

	try {
		console.log('[elv-vscode] Extension activating...');
		outputChannel.appendLine('[elv-vscode] Creating FabricRunner...');
		fabricRunner = new FabricRunner(context, outputChannel);
		outputChannel.appendLine('[elv-vscode] FabricRunner created');

		outputChannel.appendLine('[elv-vscode] Creating WorkspaceStateManager...');
		workspaceStateManager = new WorkspaceStateManager(context);
		outputChannel.appendLine('[elv-vscode] WorkspaceStateManager created');

		// Initialize binary manager
		outputChannel.appendLine('[elv-vscode] Creating BinaryManager...');
		const binaryManager = new BinaryManager(context, outputChannel);
		outputChannel.appendLine('[elv-vscode] Binary manager initialized');

		// Initialize browser manager
		outputChannel.appendLine('[elv-vscode] Creating FabricBrowserManager...');
		browserManager = new FabricBrowserManager(context);
		outputChannel.appendLine('[elv-vscode] Browser manager initialized');

		// Check for binaries on first activation
		const isFirstRun = !context.globalState.get('extensionHasRun');
		outputChannel.appendLine(`[elv-vscode] First run: ${isFirstRun}`);
		console.log(`[elv-vscode] First run: ${isFirstRun}`);
		if (isFirstRun) {
			outputChannel.appendLine('[elv-vscode] Checking binaries...');
			const check = await binaryManager.checkBinaries();
			outputChannel.appendLine(`[elv-vscode] Binaries installed: ${check.installed}, missing: ${check.missing.join(', ')}`);
			console.log(`[elv-vscode] Binaries installed: ${check.installed}, missing: ${check.missing.join(', ')}`);
			if (!check.installed) {
				// Show prompt with Download/Specify Path options
				outputChannel.appendLine('[elv-vscode] Prompting for binaries...');
				console.log('[elv-vscode] Prompting for binaries...');
				await binaryManager.ensureBinaries();
			}
			context.globalState.update('extensionHasRun', true);
		}

		// Initialize status manager with browser manager
		outputChannel.appendLine('[elv-vscode] Initializing status manager...');
		console.log('[elv-vscode] Initializing status manager...');
		statusManager = new FabricStatusManager(context, fabricRunner, workspaceStateManager, browserManager, binaryManager);

		// Check if auto-start is enabled or if fabric was running last time
		const config = vscode.workspace.getConfiguration('elv-vscode');
		const autoStart = config.get<boolean>('fabric.autoStart', false);
		const wasPreviouslyRunning = workspaceStateManager.wasFabricRunning();

		// Only auto-start if binaries are installed
		const binariesCheck = await binaryManager.checkBinaries();
		if (binariesCheck.installed && (autoStart || wasPreviouslyRunning)) {
			await statusManager.startFabric();
		}

		var lv = new elv_tree.NodeLocalView(fabricRunner);
		const treeView = vscode.window.createTreeView('debug_id', { treeDataProvider: lv });
		context.subscriptions.push(
			vscode.commands.registerCommand('executeFabric', executeFabric),
			vscode.commands.registerCommand('installFabric', installFabric),
			vscode.commands.registerCommand('publishBitcode', publishBitcode),
			vscode.commands.registerCommand('decodeToken', decodeToken),
			vscode.commands.registerCommand('decodeClipboard', decodeClipboard)
		);

		// Register GitHub token management commands
		context.subscriptions.push(
			vscode.commands.registerCommand('elv-vscode.setGitHubToken', async () => {
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
				await binaryManager.setGitHubToken(token);
				vscode.window.showInformationMessage('GitHub token saved securely');
			}
		}),

		vscode.commands.registerCommand('elv-vscode.clearGitHubToken', async () => {
			await binaryManager.clearGitHubToken();
			vscode.window.showInformationMessage('GitHub token cleared');
		}),

		vscode.commands.registerCommand('elv-vscode.downloadBinaries', async () => {
			const success = await binaryManager.downloadBinaries();
			if (!success) {
				vscode.window.showErrorMessage('Failed to download binaries');
			}
		})
	);

		// Register Fabric Browser commands
		context.subscriptions.push(
			vscode.commands.registerCommand('elv-vscode.startFabricBrowser', async () => {
				await browserManager.start();
			}),

			vscode.commands.registerCommand('elv-vscode.stopFabricBrowser', async () => {
				await browserManager.stop();
			}),

			vscode.commands.registerCommand('elv-vscode.openFabricBrowser', async () => {
				await browserManager.open();
			})
		);

		// Register Install Fabric command
		context.subscriptions.push(
			vscode.commands.registerCommand('elv-vscode.installFabric', async () => {
			const success = await binaryManager.ensureBinaries();
			// Always update status regardless of success/cancel
			// This ensures the UI reflects the current state
			await statusManager.updateInstallStatus();

			if (success) {
				vscode.window.showInformationMessage('Fabric binaries installed successfully. You can now start the fabric.');
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('elv-vscode.reinstallFabric', async () => {
			outputChannel.appendLine('[elv-vscode] Force reinstalling fabric...');
			await fabricRunner.install(true); // forceRegen=true
			await statusManager.updateInstallStatus();
			vscode.window.showInformationMessage('Fabric reinstalled. You can now start it.');
		})
	);
		// note: we need to provide the same name here as we added in the package.json file

		const commandsViewProvider = new CommandsViewProvider();
		vscode.window.registerTreeDataProvider('commandView', commandsViewProvider);

		await lv.refresh();
		outputChannel.appendLine('[elv-vscode] Extension activated successfully!');
	} catch (e) {
		console.error(e);
		outputChannel.appendLine(`[elv-vscode] ERROR during activation: ${e}`);
		outputChannel.show();
		vscode.window.showErrorMessage(`Eluvio Fabric extension failed to activate: ${e}`);
	}
}

// This method is called when your extension is deactivated
export function deactivate() {
	// Check if auto-close is enabled
	const config = vscode.workspace.getConfiguration('elv-vscode');
	const autoClose = config.get<boolean>('fabric.autoCloseOnExit', true);

	if (autoClose && statusManager && statusManager.isRunning()) {
		fabricRunner.finalize();
	}
}


async function executeFabric() {
	await fabricRunner.execute();
}

async function installFabric() {
	fabricRunner.install(false);
}

async function publishBitcode(args: { command: string, arguments: PublishCommandArgs[] }) {
	const filename = args.arguments[0].file;
	fabricRunner.publishBitcode(filename);
}

async function decodeToken() {
	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor) {
		const selectedText = activeEditor.document.getText(activeEditor.selection);
		// Use the selectedText as needed
		console.log(selectedText);
		let s = fabricRunner.decodeToken(selectedText);
	}

}

async function decodeClipboard() {
	const activeEditor = vscode.window.activeTextEditor;
	const clipboardContents = vscode.env.clipboard.readText();
	clipboardContents.then((text) => {
		return fabricRunner.decodeToken(text);;
	});

}


function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
