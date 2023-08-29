// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { elv_tree } from './tree_view';
import { FabricRunner } from './fabric_runner';


import { ElvClient } from '@eluvio/elv-client-js';
var fs = require('fs');
var path = require('path');
const cp = require('child_process');
var fabricRunner = new FabricRunner();

interface PublishCommandArgs {
	file: string;
}


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	try {
		var lv = new elv_tree.NodeLocalView(fabricRunner);
		const treeView = vscode.window.createTreeView('debug_id', { treeDataProvider: lv });
		vscode.commands.registerCommand('executeFabric', executeFabric);
		vscode.commands.registerCommand('installFabric', installFabric);
		vscode.commands.registerCommand('publishBitcode', publishBitcode);
		vscode.commands.registerCommand('decodeToken', decodeToken);
		vscode.commands.registerCommand('decodeClipboard', decodeClipboard);
		//mock.runMock();
		// note: we need to provide the same name here as we added in the package.json file
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
