import * as vscode from 'vscode';
import {ElvClient} from '@eluvio/elv-client-js';

export namespace elv_tree
{
    // this represents an item and it's children (like nested items)
    // we implement the item later
    class tree_item extends vscode.TreeItem 
    {
        readonly entity: string | undefined;
    
        // children represent branches, which are also items 
        public children: tree_item[] = [];
        
        // add all members here, file and line we'll need later
        // the label represent the text which is displayed in the tree
        // and is passed to the base class
        constructor(entity: string) {
            super(entity, vscode.TreeItemCollapsibleState.None);
            this.entity = entity;
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        }
    
        // a public method to add childs, and with additional branches
        // we want to make the item collabsible
        public add_child (child : tree_item) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            this.children.push(child);
        }
    }
    
    // tree_view will created in our entry point
    export class tree_view implements vscode.TreeDataProvider<tree_item>
    {
        // m_data holds all tree items 
        private m_data : tree_item [] = [];
        private elv_client = ElvClient;
        // with the vscode.EventEmitter we can refresh our  tree view
        private m_onDidChangeTreeData: vscode.EventEmitter<tree_item | undefined> = new vscode.EventEmitter<tree_item | undefined>();
        // and vscode will access the event by using a readonly onDidChangeTreeData (this member has to be named like here, otherwise vscode doesnt update our treeview.
        readonly onDidChangeTreeData ? : vscode.Event<tree_item | undefined> = this.m_onDidChangeTreeData.event;

        // we register two commands for vscode, item clicked (we'll implement later) and the refresh button. 
        public constructor()  {
            vscode.commands.registerCommand('node_id.item_clicked', r => this.item_clicked(r));
            vscode.commands.registerCommand('node_id.refresh', () => this.refresh());
        }
        
        // we need to implement getTreeItem to receive items from our tree view
        public getTreeItem(element: tree_item): vscode.TreeItem|Thenable<vscode.TreeItem> {
            const item = new vscode.TreeItem(element.label!, element.collapsibleState);
            return item;
        }
        
        // and getChildren
        public getChildren(element : tree_item | undefined): vscode.ProviderResult<tree_item[]> {
            if (element === undefined) {
                return this.m_data;
            } else {
                return element.children;
            }
        }
        
        // this is called when we click an item
        public item_clicked(item: tree_item) {
            // we implement this later
        }
        
        // this is called whenever we refresh the tree view
        public async refresh() {
                this.m_data = [];
                if (this.elv_client.configUrl === undefined){
                    this.elv_client = await ElvClient.FromConfigurationUrl({
                        configUrl: "https://main.net955305.contentfabric.io/config"
                      });
                }
                let nodes = this.elv_client.Nodes();
                let uris = nodes.fabricURIs as [string];
                this.m_data.push(new tree_item("FabricURIs"));
                uris.forEach(uri => {
                    this.m_data.at(-1)?.add_child(new tree_item(uri));
                });
                let ethers = this.elv_client.Nodes().ethereumURIs as [string];
                this.m_data.push(new tree_item("EthereumURIs"));
                ethers.forEach(eth => {
                    this.m_data.at(-1)?.add_child(new tree_item(eth));
                });
                let searches = this.elv_client.Nodes().searchURIs as [string];
                this.m_data.push(new tree_item("SearchURIs"));
                searches.forEach(search => {
                    this.m_data.at(-1)?.add_child(new tree_item(search));
                });
                let auths = this.elv_client.Nodes().authServiceURIs as [string];
                this.m_data.push(new tree_item("AuthServiceURIs"));
                auths.forEach(auth => {
                    this.m_data.at(-1)?.add_child(new tree_item(auth));
                });
                this.m_onDidChangeTreeData.fire(undefined);
        }
        
    }
}