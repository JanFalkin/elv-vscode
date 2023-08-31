import * as vscode from 'vscode';
import { getBaseDir } from './fabric_runner';
var path = require('path');

export class CommandsViewProvider implements vscode.TreeDataProvider<CommandItem | CommandCategory>  {
    private _onDidChangeTreeData: vscode.EventEmitter<CommandItem | CommandCategory | undefined> = new vscode.EventEmitter<CommandItem | CommandCategory | undefined>();
    readonly onDidChangeTreeData: vscode.Event<CommandItem | CommandCategory | undefined> = this._onDidChangeTreeData.event;

    private commandCategories: CommandCategory[] = [
        new CommandCategory('Tokens', [
            new CommandItem(
                'Decode Token from Clipboard',
                'Decode the contents of the clipboard',
                'decodeClipboard'
            ),
            new CommandItem(
                'Decode selection',
                'Decode the contents of the clipboard',
                'decodeToken'
            ),
        ]),
        new CommandCategory('QFAB', [
            new CommandItem(
                'Run Local Fabric',
                'Runs a local copy of Eluvio content fabric',
                'executeFabric'
            ),
            new CommandItem(
                'Stop Local Fabric',
                'Stops a local copy of Eluvio content fabric if running',
                'stopFabric'
            ),
        ]),
        // Add more command items as needed
    ];

    getTreeItem(element: CommandItem | CommandCategory): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CommandItem | CommandCategory): Thenable<(CommandItem | CommandCategory)[]> {
        if (element) {
            if (element instanceof CommandCategory) {
                return Promise.resolve(element.commandItems);
            } else {
                return Promise.resolve([]);
            }
        } else {
            return Promise.resolve(this.commandCategories);
        }
    }
}

class CommandCategory extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly commandItems: CommandItem[],
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    ) {
        super(label, collapsibleState);
    }
}

class CommandItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly commandId: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(label, collapsibleState);
        this.command = {
            command: commandId,
            title: label
        };
        let d = getBaseDir();
        this.iconPath = {
            light: vscode.Uri.file(path.join(d, '/src/assets/img_light/play.svg')),
            dark: vscode.Uri.file(path.join(d, 'src/assets/img_dark/play.svg'))
        };
    }
}

