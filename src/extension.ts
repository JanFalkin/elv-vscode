// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { elv_tree } from './tree_view';
import { FabricRunner } from './fabric_runner';


import {ElvClient} from '@eluvio/elv-client-js';
var fs = require('fs');
var path = require('path');
const cp = require('child_process');
var fabricRunner = new FabricRunner();


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	try{
		var lv = new elv_tree.NodeLocalView(fabricRunner);
		const treeView = vscode.window.createTreeView('debug_id', { treeDataProvider: lv });
		vscode.commands.registerCommand('executeFabric', executeFabric);
		vscode.commands.registerCommand('installFabric', installFabric);
		//mock.runMock();
		// note: we need to provide the same name here as we added in the package.json file
		await lv.refresh();
	}catch(e){
		console.error(e);
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}


async function executeFabric(){
	fabricRunner.execute();
}

async function installFabric(){
	fabricRunner.install(false);
}


function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
