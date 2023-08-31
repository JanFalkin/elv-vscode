// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { elv_tree } from './tree_view';
import { FabricRunner, getBaseDir } from './fabric_runner';
import { CommandsViewProvider } from './commandView';
import * as child_process from 'child_process';


import { ElvClient } from '@eluvio/elv-client-js';
var fs = require('fs');
var path = require('path');
var fabricRunner = new FabricRunner();

interface PublishCommandArgs {
	file: string;
}

function checkQfabStatus(): Promise<boolean> {
	return new Promise<boolean>((resolve, reject) => {
		// Run a command to check if the qfab binary is running
		child_process.exec('pgrep qfab', (error, stdout, stderr) => {
			if (error) {
				resolve(false); // qfab not running
			} else {
				resolve(true); // qfab running
			}
		});
	});
}

const qfabStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
qfabStatusItem.text = 'qfab';
qfabStatusItem.show();

let isFabricRunning = false;

export function updateQfabStatus(ctx: vscode.ExtensionContext) {
	checkQfabStatus().then((isRunning) => {
		isFabricRunning = isRunning;

		const circleIcon = isRunning ? "$(link)" : "$(circle-slash)";
		const statusText = `${circleIcon} qfab`;

		qfabStatusItem.text = statusText;
		qfabStatusItem.tooltip = `qfab is ${isRunning ? 'running' : 'not running'}`;
		qfabStatusItem.command = 'toggleFabricStatus';

		if (isRunning) {
			qfabStatusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
		} else {
			qfabStatusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
		}
	});
}

async function toggleFabricStatus() {
	let confirmMessage = '';
	let action = '';
	if (isFabricRunning) {
		confirmMessage = 'Are you sure you want to stop the fabric?';
		action = 'Stopping fabric...';
	} else {
		confirmMessage = 'Are you sure you want to start the fabric?';
		action = 'Starting fabric...';
	}
	const userChoice = await vscode.window.showInformationMessage(confirmMessage, 'Yes', 'No');
	if (userChoice === 'Yes') {
		if (isFabricRunning) {
			// Stop fabric logic here
			vscode.window.showInformationMessage('Stopping fabric...');
			stopFabric();
		} else {
			// Start fabric logic here
			vscode.window.showInformationMessage('Starting fabric...');
			executeFabric();
		}
	}
}


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	try {
		fabricRunner.setContext(context);
		updateQfabStatus(context);
		const isFirstRun = !context.globalState.get("extensionHasRun");
		let basePath = getBaseDir();
		let cfg = path.resolve(basePath, 'builds/RUN');

		if (isFirstRun && !fs.existsSync(cfg)) {
			// Run the installFabric command here
			vscode.commands.executeCommand("installFabric");

			// Set a flag to indicate that the extension has run before
			context.globalState.update("extensionHasRun", true);
		}
		const rustDebuggerExtensionId = 'zerotaskx.rust-extension-pack';

		// Check if the Rust Debugger extension is already installed
		const rustDebuggerExtension = vscode.extensions.getExtension(rustDebuggerExtensionId);
		if (!rustDebuggerExtension) {
			try {
				// Install the Rust Debugger extension
				await vscode.commands.executeCommand('workbench.extensions.installExtension', rustDebuggerExtensionId);
				// Activate the Rust Debugger extension
				const rustDebuggerExtension = vscode.extensions.getExtension(rustDebuggerExtensionId);
				if (rustDebuggerExtension !== undefined) {
					await rustDebuggerExtension.activate();
				}
				// Use the Rust Debugger extension in your extension
				// ...
			} catch (error) {
				console.error('Failed to install the Rust Debugger extension:', error);
			}
		}
		var lv = new elv_tree.NodeLocalView(fabricRunner);
		const treeView = vscode.window.createTreeView('debug_id', { treeDataProvider: lv });
		vscode.commands.registerCommand('executeFabric', executeFabric);
		vscode.commands.registerCommand('stopFabric', stopFabric);
		vscode.commands.registerCommand('toggleFabricStatus', toggleFabricStatus);
		vscode.commands.registerCommand('installFabric', installFabric);
		vscode.commands.registerCommand('publishBitcode', publishBitcode);
		vscode.commands.registerCommand('decodeToken', decodeToken);
		vscode.commands.registerCommand('decodeClipboard', decodeClipboard);
		//mock.runMock();
		// note: we need to provide the same name here as we added in the package.json file

		const commandsViewProvider = new CommandsViewProvider();
		vscode.window.registerTreeDataProvider('commandView', commandsViewProvider);

		// Register the command to decode clipboard
		const decodeClipboardCommand = vscode.commands.registerCommand('decodeClipboard', () => {
			// Implement the logic to decode the clipboard contents
			// You can use the vscode.env.clipboard.readText() method to read the clipboard contents
			// and perform the decoding operation as needed
		});

		context.subscriptions.push(decodeClipboardCommand);

		await lv.refresh();
	} catch (e) {
		console.error(e);
	}
}

// This method is called when your extension is deactivated
export function deactivate() { }


async function executeFabric() {
	fabricRunner.execute();
}

async function stopFabric() {
	fabricRunner.stop();
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
