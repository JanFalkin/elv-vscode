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
            // Return command items for a specific category
            const category = this.commandCategories.find((cat) => cat.label === element.label);
            return Promise.resolve(category ? category.commandItems : []);
        } else {
            // Return top-level categories
            return Promise.resolve(this.commandCategories);
        }
    }
    updateFabricState(isRunning: boolean) {
        const runQfabCommand = this.commandCategories.find(category => category.label === "QFAB")?.commandItems.find(item => item.commandId === "executeFabric");
        if (runQfabCommand) {
            runQfabCommand.setEnabled(!isRunning);
        }
        const stopQfabCommand = this.commandCategories.find(category => category.label === "QFAB")?.commandItems.find(item => item.commandId === "stopFabric");
        if (stopQfabCommand) {
            stopQfabCommand.setEnabled(isRunning);
        }
        this.refresh();
    }
    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}

class CommandCategory extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly commandItems: CommandItem[] = [],
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    ) {
        super(label, collapsibleState);
        this.contextValue = 'commandCategory';
    }
    // Override the `onclick` event handler to prevent event propagation
    public get onclick(): vscode.Command | undefined {
        return {
            command: '',
            title: '',
            tooltip: '',
            arguments: []
        };
    }
}

class CommandItem extends vscode.TreeItem {
    private _enabled: boolean;
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly commandId: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
        public enabled?: boolean
    ) {
        super(label, collapsibleState);
        this.command = {
            command: commandId,
            title: label
        };
        this._enabled = false;
        this.contextValue = this._enabled ? 'commandEnabled' : 'commandDisabled';
        let d = getBaseDir();
        this.iconPath = {
            light: vscode.Uri.file(path.join(d, '/src/assets/img_light/play.svg')),
            dark: vscode.Uri.file(path.join(d, 'src/assets/img_dark/play.svg'))
        };
    }
    public setEnabled(enabled: boolean): void {
        this._enabled = enabled;
        this.contextValue = this._enabled ? 'commandEnabled' : 'commandDisabled';
    }
}

