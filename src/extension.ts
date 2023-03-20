// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { elv_tree } from './tree_view';

import {ElvClient} from '@eluvio/elv-client-js';


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	let tree = new elv_tree.tree_view();
	// note: we need to provide the same name here as we added in the package.json file
	vscode.window.registerTreeDataProvider('node_id', tree);
	tree.refresh();
}

// This method is called when your extension is deactivated
export function deactivate() {}


function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
