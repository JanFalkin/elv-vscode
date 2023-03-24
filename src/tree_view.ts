import * as vscode from 'vscode';
import {ElvClient} from '@eluvio/elv-client-js';

export namespace elv_tree
{
    // this represents an item and it's children (like nested items)
    // we implement the item later
    class NetWorkView extends vscode.TreeItem 
    {
        readonly entity: string | undefined;
    
        // children represent branches, which are also items 
        public children: NetWorkView[] = [];
        
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
        public addChild (child : NetWorkView) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            this.children.push(child);
        }
    }

    export class NodeLocalView implements vscode.TreeDataProvider<NetWorkView>
    {
        private data : NetWorkView [] = [];
        private elvData = ElvClient;
        private configData = {};
   
        private mOnDidChangeTreeData: vscode.EventEmitter<NetWorkView | undefined> = new vscode.EventEmitter<NetWorkView | undefined>();


        readonly onDidChangeTreeData ? : vscode.Event<NetWorkView | undefined> = this.mOnDidChangeTreeData.event;

        // we register two commands for vscode, item clicked (we'll implement later) and the refresh button. 
        public constructor(localData:Object)  {
            this.configData = localData;

            vscode.commands.registerCommand('debug_id.item_clicked', r => this.onItemClicked(r));
            vscode.commands.registerCommand('debug_id.refresh', () => this.refresh());
        }
        
        // we need to implement getTreeItem to receive items from our tree view
        public getTreeItem(element: NetWorkView): vscode.TreeItem|Thenable<vscode.TreeItem> {
            const item = new vscode.TreeItem(element.label!, element.collapsibleState);
            return item;
        }
        
        // and getChildren
        public getChildren(element : NetWorkView | undefined): vscode.ProviderResult<NetWorkView[]> {
            if (element === undefined) {
                return this.data;
            } else {
                return element.children;
            }
        }
        
        // this is called when we click an item
        public onItemClicked(item: NetWorkView) {
            // we implement this later
        }
        
        // this is called whenever we refresh the tree view
        public async refresh() {
                this.data = [];
                if (this.elvData.configUrl === undefined){
                    this.elvData = await ElvClient.FromConfigurationUrl({
                        configUrl: "http://localhost:8008/config?qspace=dev&self"
                      });
                }
                // let nodes = this.elvData.Nodes();
                // let uris = nodes.fabricURIs as [string];
                // this.data.push(new NetWorkView("FabricURIs"));
                // uris.forEach(uri => {
                //     this.data.at(-1)?.addChild(new NetWorkView(uri));
                // });
                // let ethers = this.elvData.Nodes().ethereumURIs as [string];
                // this.data.push(new NetWorkView("EthereumURIs"));
                // ethers.forEach(eth => {
                //     this.data.at(-1)?.addChild(new NetWorkView(eth));
                // });
                // let searches = this.elvData.Nodes().searchURIs as [string];
                // this.data.push(new NetWorkView("SearchURIs"));
                // searches.forEach(search => {
                //     this.data.at(-1)?.addChild(new NetWorkView(search));
                // });
                // let auths = this.elvData.Nodes().authServiceURIs as [string];
                // this.data.push(new NetWorkView("AuthServiceURIs"));
                // auths.forEach(auth => {
                //     this.data.at(-1)?.addChild(new NetWorkView(auth));
                // });
                // this.mOnDidChangeTreeData.fire(undefined);
        }
 
    }
    
    // tree_view will created in our entry point
    export class NodeNetworkView implements vscode.TreeDataProvider<NetWorkView>
    {
        // data holds all tree items 
        private data : NetWorkView [] = [];
        private elvData = ElvClient;
        // with the vscode.EventEmitter we can refresh our  tree view
        private m_onDidChangeTreeData: vscode.EventEmitter<NetWorkView | undefined> = new vscode.EventEmitter<NetWorkView | undefined>();
        // and vscode will access the event by using a readonly onDidChangeTreeData (this member has to be named like here, otherwise vscode doesnt update our treeview.
        readonly onDidChangeTreeData ? : vscode.Event<NetWorkView | undefined> = this.m_onDidChangeTreeData.event;

        // we register two commands for vscode, item clicked (we'll implement later) and the refresh button. 
        public constructor()  {
            vscode.commands.registerCommand('node_id.item_clicked', r => this.onItemClicked(r));
            vscode.commands.registerCommand('node_id.refresh', () => this.refresh());
        }
        
        // we need to implement getTreeItem to receive items from our tree view
        public getTreeItem(element: NetWorkView): vscode.TreeItem|Thenable<vscode.TreeItem> {
            const item = new vscode.TreeItem(element.label!, element.collapsibleState);
            return item;
        }
        
        // and getChildren
        public getChildren(element : NetWorkView | undefined): vscode.ProviderResult<NetWorkView[]> {
            if (element === undefined) {
                return this.data;
            } else {
                return element.children;
            }
        }
        
        // this is called when we click an item
        public onItemClicked(item: NetWorkView) {
            // we implement this later
        }
        
        // this is called whenever we refresh the tree view
        public async refresh() {
                this.data = [];
                if (this.elvData.configUrl === undefined){
                    this.elvData = await ElvClient.FromConfigurationUrl({
                        configUrl: "https://main.net955305.contentfabric.io/config"
                      });
                }
                let nodes = this.elvData.Nodes();
                let uris = nodes.fabricURIs as [string];
                this.data.push(new NetWorkView("FabricURIs"));
                uris.forEach(uri => {
                    this.data.at(-1)?.addChild(new NetWorkView(uri));
                });
                let ethers = this.elvData.Nodes().ethereumURIs as [string];
                this.data.push(new NetWorkView("EthereumURIs"));
                ethers.forEach(eth => {
                    this.data.at(-1)?.addChild(new NetWorkView(eth));
                });
                let searches = this.elvData.Nodes().searchURIs as [string];
                this.data.push(new NetWorkView("SearchURIs"));
                searches.forEach(search => {
                    this.data.at(-1)?.addChild(new NetWorkView(search));
                });
                let auths = this.elvData.Nodes().authServiceURIs as [string];
                this.data.push(new NetWorkView("AuthServiceURIs"));
                auths.forEach(auth => {
                    this.data.at(-1)?.addChild(new NetWorkView(auth));
                });
                this.m_onDidChangeTreeData.fire(undefined);
        }
        
    }
}