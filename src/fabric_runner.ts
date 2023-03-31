import * as vscode from 'vscode';
var path = require('path');
import { spawn, spawnSync, ChildProcessWithoutNullStreams } from 'child_process';
import { kill } from 'process';
var fs = require('fs');

export class FabricRunner
{
    public elvMasterProcess?: ChildProcessWithoutNullStreams;
    public qfabProcess?: ChildProcessWithoutNullStreams;
    targetDir:string;
    script:string;
    binDir:string;
    elvmaster:string;
    qfab:string;
    qfabCli:string;
    cfg:string;
    qfabCfg:string;
    elvmasterCfg:string;


    // children represent branches, which are also items

    // add all members here, file and line we'll need later
    // the label represent the text which is displayed in the tree
    // and is passed to the base class
    constructor() {
        this.targetDir = path.join(__dirname, "..", 'builds');
        this.script = path.join(__dirname, "..", "bin", "build-devsetup.sh");
        this.binDir = path.join(__dirname, "..", "..", 'bin');
        this.elvmaster = path.join(this.binDir, "elvmasterd");
        this.qfab = path.join(this.binDir, "qfab");
        this.qfabCli = path.join(this.binDir, "qfab_cli");
        this.cfg = path.join(this.targetDir, "config-env.json");
        this.qfabCfg = path.join(this.targetDir, "RUN", "config", "qfab.json");
        this.elvmasterCfg = path.join(this.targetDir, "RUN", "config", "elvmasterd_dev_config.toml");
    }
    public finalize() {
        console.log('Finalizing');
        this.qfabProcess?.kill('SIGTERM');
        this.elvMasterProcess?.kill('SIGTERM');
    }


    public async install(forceRegen:boolean){
        console.log("building mock fabric");

        try{
            let td = fs.statSync(this.targetDir);
            if (td === undefined){
                fs.mkdirSync(this.targetDir);
            }
        }catch(e){
            fs.mkdirSync(this.targetDir);
        }
        try{
          let js = fs.statSync(this.cfg);
          if (js !== null && !forceRegen){
            console.log("already configured");
            let s = await fs.readFileSync(this.cfg);
            return s;
          }
        }catch(e){
          console.log(`no config json present exception ${e}`);
        }
        let runDir = path.join(this.targetDir,"RUN");
        try{
          let rd = fs.statSync(runDir, {});
          if (rd !== null){
            fs.rmSync(runDir, { recursive: true});
          }
        }catch(e){
          console.log(`exception ${e}`);
        }
        let oldDir = process.cwd();
        process.chdir(this.targetDir);
        let rets = spawnSync(this.script, [this.elvmaster, this.qfab, this.qfabCli]);
        if (rets.status !== 0) {
            console.error(`Command exited with code ${rets.status}`);
            return;
        }
        let fields = ["space-owner", "space_owner_private_key",
        "user", "user_private_key", "kms_account", "kms_id", "kms_public_key",
        "kms_private_key", "qfab_node_account", "qfab_node_id",
        "eth_url", "qfab_url", "network_id", "port", "rpcport", "elvport"];

        var obj: { [key: string]: any } = {};

        var readme = "";
        if (rets.stdout) {
          let lines = rets.stdout.toString().split("\n");
          lines.forEach(line =>{
            line = line.trim();
            fields.forEach(field => {
              let parse = `${field}=`;
              if (line.startsWith(parse)){
                obj[field] = line.split("=")[1];
              }
            });
            console.log(`line: ${line}`);
            readme += (line + '\n');
          });
        }
        if (rets.stderr) {
          console.log(`stderr: ${rets.stderr}`);
        }

        try {
          fs.writeFileSync("config-env.json", JSON.stringify(obj));
          fs.writeFileSync("DEVBUILD.out", readme);
        } catch (err) {
          console.error(err);
        }
        process.chdir(oldDir);
    }
    public clientExecute(params:string[]){
        const child = spawnSync(this.qfabCli, params);
        if (child.status !== 0){
            console.error(`Failed to get space nod list`);
            return;
        }
        return child.stdout.toJSON();
    }

    public execute() {
        const env = {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            ELV_WALLET_PASSPHRASE: 'test',
          };
        this.elvMasterProcess = spawn(this.elvmaster, ["start", "dev", "--config",this.elvmasterCfg]);
        this.qfabProcess = spawn(this.qfab, ["daemon", "--config", this.qfabCfg], { env });
        if (this.elvMasterProcess !== undefined){
            this.elvMasterProcess.on('exit', (code) => {
                console.log(`Executable elvmasterd exited with code ${code}`);
              });
        }
        if (this.qfabProcess !== undefined){
            this.qfabProcess.on('exit', (code) => {
                console.log(`Executable qfab exited with code ${code}`);
            });
            this.qfabProcess.stderr.on('data', (data) => {
                console.error(`stderr: ${data}`);
            });
            this.qfabProcess.stdout.on('data', (data) => {
                console.error(`stdout: ${data}`);
            });
        }
        process.on('exit', () => {
            console.log('Node.js has exited');
            this.finalize();
        });
        process.on('SIGINT', () => {
            console.log('Received SIGINT signal');
            this.finalize();
        });

        process.on('SIGTERM', () => {
            console.log('Received SIGTERM signal');
            this.finalize();
        });
    }
}
