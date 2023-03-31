import * as vscode from 'vscode';
import {ElvClient} from '@eluvio/elv-client-js';
import { FabricRunner } from './fabric_runner';


export namespace elv_tree
{
    class NetWorkView extends vscode.TreeItem {
        private json: any;
        readonly entity:string | undefined;

        public children: NetWorkView[] = [];

        constructor(entity: string, json: any) {
          super(entity,vscode.TreeItemCollapsibleState.None);
          this.entity = entity;
          this.json = json;
          this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        }
        public addChild (child : NetWorkView) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            this.children.push(child);
        }

      }

    export class NodeLocalView implements vscode.TreeDataProvider<NetWorkView>
    {
        private data : NetWorkView [] = [];
        private fr:FabricRunner;
   
        private mOnDidChangeTreeData: vscode.EventEmitter<NetWorkView | undefined> = new vscode.EventEmitter<NetWorkView | undefined>();


        readonly onDidChangeTreeData ? : vscode.Event<NetWorkView | undefined> = this.mOnDidChangeTreeData.event;

        // we register two commands for vscode, item clicked (we'll implement later) and the refresh button. 
        public constructor(fr:FabricRunner)  {
            this.fr = fr;

            vscode.commands.registerCommand('debug_id.item_clicked', r => this.onItemClicked(r));
            vscode.commands.registerCommand('debug_id.refresh', () => this.update());
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

        public async update() {
            this.data = [];
            let sn = this.fr.clientExecute(["space", "node", "list", "--config=/home/jan/ELV/elv-vscode/builds/RUN/config/qfab_cli.json"]);
            if (sn === undefined){
                return;
            }
            let j = JSON.parse(String.fromCharCode(...sn.data));
            this.data.push(new NetWorkView("NodeList", j));
            let ti = new NetWorkView("Nodes", j["nodes"]);
            this.data.at(-1)?.addChild(ti);
            console.log(`ret = ${JSON.stringify(j)}`);
            this.mOnDidChangeTreeData.fire(undefined);
       }


        // this is called whenever we refresh the tree view
        public async refresh() {
            this.update();
        }
 
    }
   
}