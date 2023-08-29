import * as vscode from 'vscode';

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
    }

    command = {
        command: this.commandId,
        title: this.label
    };
}