import * as vscode from 'vscode';
var path = require('path');
import { spawn, spawnSync, ChildProcessWithoutNullStreams } from 'child_process';
import { kill } from 'process';
import qfabBaseConfig from './dev-config.json';
//const qfabBaseConfig = require('dev-config.json');
var fs = require('fs');
var tcpPortUsed = require('tcp-port-used');
const { readFile } = require('fs/promises');
const { execSync } = require('child_process');

function content(path: string) {
  return fs.readFileSync(path);
}

class VersionedObject {
  public id!: string;

}

class LocalObjects {
  public id!: string;
  public obj!: { [key: string]: VersionedObject; };
}


class LocalLibrary {
  public id!: string;
  public content!: { [key: string]: LocalObjects; };
}


class LocalSpace {
  public id!: string;
  public libs!: { [key: string]: LocalLibrary; };
}

class LocalFabric {
  public spaces: { [key: string]: LocalSpace };

  constructor() {
    this.spaces = {};
  }

  public addSpace(spaceid: string) {
    this.spaces[spaceid] = new LocalSpace;
  }
}


export class FabricRunner {
  public elvMasterProcess?: ChildProcessWithoutNullStreams;
  public qfabProcess?: ChildProcessWithoutNullStreams;
  targetDir: string;
  binDir: string;
  toolsDir: string;  // Directory for bundled tools (FFmpeg libs, etc.)
  elvmaster: string;
  qfab: string;
  qfabCli: string;
  cfg: string;
  qfabCfg: string;
  elvmasterCfg: string;
  runDir: string;
  obj: { [key: string]: any };
  fabric: LocalFabric;
  context?: vscode.ExtensionContext;
  extensionPath: string;
  storagePath: string;
  outputChannel?: vscode.OutputChannel;


  // children represent branches, which are also items

  // add all members here, file and line we'll need later
  // the label represent the text which is displayed in the tree
  // and is passed to the base class
  constructor(context?: vscode.ExtensionContext, outputChannel?: vscode.OutputChannel) {
    this.context = context;
    this.outputChannel = outputChannel;
    this.extensionPath = context?.extensionPath || path.join(__dirname, "..");
    this.storagePath = context?.globalStorageUri?.fsPath || path.join(this.extensionPath, 'storage');

    // Ensure storage directory exists
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }

    this.targetDir = path.join(this.storagePath, 'builds');
    this.binDir = path.join(this.storagePath, 'bin');
    this.toolsDir = path.join(this.storagePath, 'tools'); // Tools bundle location
    this.elvmaster = path.join(this.binDir, "elvmasterd");
    this.qfab = path.join(this.binDir, "qfab");
    this.qfabCli = path.join(this.binDir, "qfab_cli");
    this.cfg = path.join(this.targetDir, "config-env.json");
    this.runDir = path.join(this.targetDir, "RUN");
    this.qfabCfg = path.join(this.runDir, "config", "qfab.json");
    this.elvmasterCfg = path.join(this.runDir, "config", "elvmasterd_dev_config.toml");
    this.obj = {};
    this.fabric = new LocalFabric;
  }

  public async isInstalled(): Promise<boolean> {
    try {
      const configExists = fs.existsSync(this.cfg);
      const binariesExist = fs.existsSync(this.qfab) &&
                           fs.existsSync(this.elvmaster) &&
                           fs.existsSync(this.qfabCli);
      return configExists && binariesExist;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get environment variables with bundled tools paths
   */
  private getExecutionEnvironment(): NodeJS.ProcessEnv {
    const env = { ...process.env };

    // Add Eluvio wallet passphrase (required by qfab)
    env.ELV_WALLET_PASSPHRASE = 'test';

    // Add bundled lib directory to LD_LIBRARY_PATH if it exists
    const toolsLibDir = path.join(this.toolsDir, 'lib');
    if (fs.existsSync(toolsLibDir)) {
      const ldLibraryPath = env.LD_LIBRARY_PATH || '';
      env.LD_LIBRARY_PATH = ldLibraryPath ? `${toolsLibDir}:${ldLibraryPath}` : toolsLibDir;
    }

    // Add bundled bin directory to PATH if it exists
    const toolsBinDir = path.join(this.toolsDir, 'bin');
    if (fs.existsSync(toolsBinDir)) {
      const pathVar = env.PATH || '';
      env.PATH = pathVar ? `${toolsBinDir}:${pathVar}` : toolsBinDir;
    }

    return env;
  }

  public finalize() {
    console.log('Finalizing');
    this.qfabProcess?.kill('SIGTERM');
    this.elvMasterProcess?.kill('SIGTERM');
  }

  public async decodeClipboard(token: string) {
    this.decodeToken(token);
  }

  public async decodeToken(token: string) {
    let ch = vscode.window.createOutputChannel('elv-vscode');
    const qfabCliConfig = path.join(this.runDir, "config", "qfab_cli.json");
    let client = this.clientExecute(["tools", "decode", token,
      "--config", qfabCliConfig]);
    if (client !== undefined && client.data[0] !== 10) {
      let s = String.fromCharCode(...client.data);
      console.log("SUCCESS token contents:", s);
      ch.appendLine("elv tools decode");
      ch.appendLine(s);
      ch.show();
      return s;
    }
  }

  public async publishBitcode(wasmFilePath: string) {
    const qfabCliConfig = path.join(this.runDir, "config", "qfab_cli.json");
    let client = this.clientExecute(["space", "bitcode", wasmFilePath,
      "--library", "ilib2nLKiR5p2yiGqCNicszxQYyvu9W4", "--space", "ispc36s3uwY9voTx6gXcXENn4KfY29fC",
      "--config", qfabCliConfig]);
    if (client !== undefined) {
      let s = String.fromCharCode(...client.data);
      let j = JSON.parse(s);
    }
  }
  //${qfab_node_id} ${qfab_url} ${eth_url} ${qfab_cli_space_owner_config_file} ${kms_id}
  qfabCliNodeAdd(qfabNodeId: string, qfabUrl: string, ethUrl: string, qfabCliSpaceOwnerConfigFile: string, kmsId: string) {
    const env = this.getExecutionEnvironment();
    let res = spawnSync(this.qfabCli, ["space", "node", "add", qfabNodeId, "fab+" + qfabUrl, "eth+" + ethUrl, "--config", qfabCliSpaceOwnerConfigFile, "--kms", kmsId], { env });
    let se = String.fromCharCode(...res.stderr);
    let so = String.fromCharCode(...res.stdout);
    if (res.status === 0) {
      console.log("SUCCESS: space node added...");
    }
    else {
      console.error(`FAILED: space node add... stderr=${se}`);
    }
  }

  qfabCliKmsAdd(kmsId: string, ethUrl: string, kmsPublicKey: string, cfg: string) {
    const env = this.getExecutionEnvironment();
    let res = spawnSync(this.qfabCli, ["space", "kms", "add", kmsId, ethUrl, "--pubkey", kmsPublicKey, "--config", cfg], { env });
    if (res.status === 0) {
      console.log("SUCCESS: space kms added...");
    }
    else {
      console.error("Failed: space kms added...");
    }
  }

  qfabCliSpaceCreate(cfg: string) {
    console.log(`Creating space with config: ${cfg}`);
    this.outputChannel?.appendLine(`[FabricRunner] Creating space with config: ${cfg}`);
    const env = this.getExecutionEnvironment();
    let res = spawnSync(this.qfabCli, ["space", "create", "--config", cfg], { timeout: 30000, env });
    let se = String.fromCharCode(...res.stderr);
    let so = String.fromCharCode(...res.stdout);

    this.outputChannel?.appendLine(`[qfab_cli space create] stdout: ${so}`);
    if (se) this.outputChannel?.appendLine(`[qfab_cli space create] stderr: ${se}`);
    this.outputChannel?.appendLine(`[qfab_cli space create] exit code: ${res.status}`);

    if (res.status === 0) {
      console.log("space created:", so);
      this.outputChannel?.appendLine(`[FabricRunner] Space created successfully: ${so.trim()}`);
      let sdata = content(cfg);
      let s = String.fromCharCode(...sdata);
      let rep = `"space_id": ${so}`;
      let from = `"space_id": ""`;
      s = s.replace(from, rep);
      fs.writeFileSync(cfg, s);
      return so.trim();
    } else {
      const errorMsg = `Failed to create space. Status: ${res.status}, stderr: ${se}, stdout: ${so}`;
      console.error(errorMsg);
      this.outputChannel?.appendLine(`[FabricRunner] ERROR: ${errorMsg}`);
      vscode.window.showErrorMessage(`Failed to create space: ${se || so}`);
      throw new Error(errorMsg); // Throw instead of returning empty string
    }
  }

  elvmasterdWalletCreate(cfg: string) {
    this.outputChannel?.appendLine(`[FabricRunner] Running: ${this.elvmaster} wallet create dev --config ${cfg}`);
    const env = this.getExecutionEnvironment();
    let res = spawnSync(this.elvmaster, ["wallet", "create", "dev", "--config", cfg], { env });
    let se = String.fromCharCode(...res.stderr);
    let so = String.fromCharCode(...res.stdout);
    this.outputChannel?.appendLine(`[elvmaster wallet] stdout: ${so}`);
    if (se) this.outputChannel?.appendLine(`[elvmaster wallet] stderr: ${se}`);
    if (res.status !== 0) {
      this.outputChannel?.appendLine(`[elvmaster wallet] ERROR: exit code ${res.status}`);
      throw new Error(`elvmasterd wallet create failed: ${se || so}`);
    }
    return so;
  }

  elvmasterdInit(cfg: string) {
    this.outputChannel?.appendLine(`[FabricRunner] Running: ${this.elvmaster} init dev --config ${cfg}`);
    const env = this.getExecutionEnvironment();
    let res = spawnSync(this.elvmaster, ["init", "dev", "--config", cfg], { env });
    let se = String.fromCharCode(...res.stderr);
    let so = String.fromCharCode(...res.stdout);
    this.outputChannel?.appendLine(`[elvmaster init] stdout: ${so}`);
    if (se) this.outputChannel?.appendLine(`[elvmaster init] stderr: ${se}`);
    if (res.status !== 0) {
      this.outputChannel?.appendLine(`[elvmaster init] ERROR: exit code ${res.status}`);
      throw new Error(`elvmasterd init failed: ${se || so}`);
    }
    return so;
  }

  elvmasterdDevConfig(emLog: string, emDir: string) {
    return `
[node]
log_file="${emLog}"
datadir="${emDir}"
nodekey=true
rpcaddr="127.0.0.1"
port=${this.obj["port"]}
rpcport=${this.obj["rpcport"]}
elvport=${this.obj["elvport"]}
networkid=${this.obj["network_id"]}

[svc_config]
fabric_url="${this.obj["qfab_url"]}"

[genesis]
chainid=${this.obj["chain_id"]}
`;
  }

  qfabCliConfig(cfgFileToWrite: string, secret: string) {
    let s = `{
        "space_id": "",
        "api": {
          "url": "${this.obj["qfab_url"]}"
        },
        "fs": "os",
        "ethereum": {
        "url": "${this.obj["eth_url"]}",
        "private_key": "${secret}"
        },
        "log": {
          "level": "warn",
          "formatter": "console",
          "named": {
            "/cli": {
              "level": "warn",
              "formatter": "console"
            },
            "/cli-result": {
              "level": "normal",
              "formatter": ""
            }
          }
        }
      }`;
    fs.writeFileSync(cfgFileToWrite, s);
    fs.chmodSync(cfgFileToWrite, '600');
  }

  buildQfabConfig() {
    try {
      this.outputChannel?.appendLine('[FabricRunner] Building qfab config...');
      this.outputChannel?.appendLine(`[FabricRunner] Config file path: ${this.obj["qfab_config_file"]}`);
      this.outputChannel?.appendLine(`[FabricRunner] User space ID: ${this.obj["user_space_id"]}`);

      // Validate space ID before creating config
      if (!this.obj["user_space_id"] || this.obj["user_space_id"].trim() === "") {
        const errorMsg = 'user_space_id is empty! Space creation must have failed.';
        this.outputChannel?.appendLine(`[FabricRunner] ERROR: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // Create a deep copy to avoid mutating the imported object
      const qfabConfig = JSON.parse(JSON.stringify(qfabBaseConfig));

      qfabConfig["paths"] = this.obj["path"];
      qfabConfig["log"]["file"]["filename"] = this.obj["qfab_log_file"];
      qfabConfig["avpipe"]["cache"]["path"] = path.join(this.obj["path"]["install_path"], "pogreb.db");
      qfabConfig["fabric"]["node_id"] = this.obj["qfab_node_id"];
      qfabConfig["qspaces"][0]["id"] = this.obj["user_space_id"];
      qfabConfig["qspaces"][0]["ethereum"]["wallet_file"] = this.obj["wallet_file"];

      this.outputChannel?.appendLine('[FabricRunner] Writing qfab config to file...');
      fs.writeFileSync(this.obj["qfab_config_file"], JSON.stringify(qfabConfig, null, 2));
      this.outputChannel?.appendLine('[FabricRunner] qfab config file created successfully');
    } catch (e) {
      const errorMsg = `failed to generate ${this.obj["qfab_config_file"]}: ${e}`;
      console.error(errorMsg);
      this.outputChannel?.appendLine(`[FabricRunner] ERROR: ${errorMsg}`);
      throw e; // Re-throw to make the error visible
    }
  }


  async buildLocalFabric() {
    try {
      this.outputChannel?.appendLine('[FabricRunner] buildLocalFabric() starting...');
      //        let oldDir = process.cwd();
      //        process.chdir(this.targetDir);
      fs.mkdirSync(this.runDir, { recursive: true });
      this.obj["qfab_dir"] = path.join(this.runDir, "QDATA");
      fs.mkdirSync(this.obj["qfab_dir"], { recursive: true });
      this.obj["elvmaster_dir"] = path.join(this.runDir, "elv-master");

      fs.mkdirSync(this.obj["elvmaster_dir"], { recursive: true });
      this.obj["elvmaster_keystore_dir"] = `${this.obj["elvmaster_dir"]}/keystore`;
      this.obj["node_wallet"] = `${this.obj["elvmaster_keystore_dir"]} + ${this.obj["qfab_node_account"]}`;
      this.obj["config_path"] = path.join(this.runDir, "config");
      fs.mkdirSync(this.obj["config_path"], { recursive: true });
      this.obj["path"] = {};
      this.obj["path"]["install_path"] = `${this.obj["qfab_dir"]}`;
      this.obj["path"]["qparts_path"] = `${this.obj["qfab_dir"]}/PARTS`;
      this.obj["path"]["qtemp_path"] = `${this.obj["qfab_dir"]}/TEMP`;
      this.obj["path"]["qlibs_path"] = `${this.obj["qfab_dir"]}/LIBS`;
      this.obj["path"]["qnode_path"] = `${this.obj["qfab_dir"]}/LOCAL`;
      this.obj["path"]["qcache_path"] = `${this.obj["qfab_dir"]}/CACHE`;
      this.obj["path"]["qsearch_path"] = `${this.obj["qfab_dir"]}/SEARCH`;

      this.obj["elvmasterd_dev_config_file"] = `${this.obj["config_path"]}/elvmasterd_dev_config.toml`;
      this.obj["elvmasterd_log"] = `${this.runDir}/elvmasterd.log`;

      this.obj["qfab_cli_space_owner_config_file"] = `${this.obj["config_path"]}/qfab_cli_space_owner.json`;
      this.obj["qfab_cli_user_config_file"] = `${this.obj["config_path"]}/qfab_cli.json`;
      this.obj["qfab_cli_kms_config_file"] = `${this.obj["config_path"]}/qfab_cli_kms.json`;
      // create qfab config file and qfab node private_key file
      this.obj["qfab_log_file"] = `${this.runDir}/qfab.log`;
      this.obj["qfab_privkey"] = `${this.obj["config_path"]}/qfab_privkey.key`;
      this.obj["qfab_config_file"] = `${this.obj["config_path"]}/qfab.json`;

      this.outputChannel?.appendLine('[FabricRunner] Creating elvmasterd config...');
      let emTOML = this.elvmasterdDevConfig(this.obj["elvmasterd_log"], this.obj["elvmaster_dir"]);
      fs.writeFileSync(this.obj["elvmasterd_dev_config_file"], emTOML);
      fs.chmodSync(this.obj["elvmasterd_dev_config_file"], '600');

      this.outputChannel?.appendLine('[FabricRunner] Creating elvmasterd wallet...');
      this.elvmasterdWalletCreate(this.obj["elvmasterd_dev_config_file"]);
      // if (wallet === ""){
      //   console.error("failed to create wallet");
      //   return;
      // }
      this.outputChannel?.appendLine('[FabricRunner] Initializing elvmasterd...');
      this.elvmasterdInit(this.obj["elvmasterd_dev_config_file"]);
      const files = fs.readdirSync(this.obj["elvmaster_keystore_dir"]);
      const fileNameSubstring = this.obj["qfab_node_account"]; // the substring you want to match

      const wildcard = "*";
      const matchingFiles = files.filter((file: string) => {
        const filename = file;
        return file.includes(fileNameSubstring);
      });
      this.obj["wallet_file"] = path.join(this.obj["elvmaster_keystore_dir"], matchingFiles[0]);

      this.outputChannel?.appendLine('[FabricRunner] Starting elvmasterd temporarily for space creation...');
      // Start elvmaster temporarily to create spaces (will be stopped and restarted by execute())
      this.executeElvMaster();
      execSync('sleep 5');

      this.outputChannel?.appendLine('[FabricRunner] Creating qfab CLI configs and spaces...');
      this.qfabCliConfig(this.obj["qfab_cli_space_owner_config_file"], this.obj["space_owner_private_key"]);
      this.qfabCliConfig(this.obj["qfab_cli_user_config_file"], this.obj["user_private_key"]);
      this.qfabCliConfig(this.obj["qfab_cli_kms_config_file"], this.obj["kms_private_key"]);

      function escapeIt(str: string | undefined) {
        if (str === undefined) {
          return;
        }
        return str.replace(/\n|\\|"/g, '');
      }

      this.obj["space_owner_space_id"] = this.qfabCliSpaceCreate(this.obj["qfab_cli_space_owner_config_file"]);
      this.obj["user_space_id"] = escapeIt(this.qfabCliSpaceCreate(this.obj["qfab_cli_user_config_file"]));
      this.obj["kms_space_id"] = this.qfabCliSpaceCreate(this.obj["qfab_cli_kms_config_file"]);

      this.outputChannel?.appendLine('[FabricRunner] Adding KMS and node to spaces...');
      this.qfabCliKmsAdd(this.obj["kms_id"], this.obj["eth_url"], this.obj["kms_public_key"], this.obj["qfab_cli_space_owner_config_file"]);
      this.qfabCliNodeAdd(this.obj["qfab_node_id"], this.obj["qfab_url"], this.obj["eth_url"], this.obj["qfab_cli_space_owner_config_file"], this.obj["kms_id"]);

      this.outputChannel?.appendLine('[FabricRunner] Calling buildQfabConfig()...');
      this.buildQfabConfig();
      this.outputChannel?.appendLine('[FabricRunner] buildQfabConfig() completed');

      // Stop elvmaster that was started during setup
      this.outputChannel?.appendLine('[FabricRunner] Stopping temporary elvmaster process...');
      if (this.elvMasterProcess) {
        const pid = this.elvMasterProcess.pid;
        this.outputChannel?.appendLine(`[FabricRunner] elvmaster PID: ${pid}`);

        // Check if process is still alive
        try {
          process.kill(pid!, 0); // Signal 0 checks if process exists without killing it
          this.outputChannel?.appendLine('[FabricRunner] Process is alive, sending SIGTERM...');
        } catch (e) {
          this.outputChannel?.appendLine('[FabricRunner] Process already dead');
          this.elvMasterProcess = undefined;
          return;
        }

        this.outputChannel?.appendLine('[FabricRunner] Sending SIGTERM...');

        // Wait for process to actually exit
        await new Promise<void>((resolve) => {
          if (!this.elvMasterProcess) {
            this.outputChannel?.appendLine('[FabricRunner] elvmaster process already undefined');
            resolve();
            return;
          }

          const timeout = setTimeout(() => {
            this.outputChannel?.appendLine('[FabricRunner] elvmaster stop timeout after 5s, forcing SIGKILL...');
            if (this.elvMasterProcess && this.elvMasterProcess.pid) {
              try {
                process.kill(this.elvMasterProcess.pid, 'SIGKILL');
                this.outputChannel?.appendLine('[FabricRunner] SIGKILL sent');
              } catch (e) {
                this.outputChannel?.appendLine(`[FabricRunner] Failed to SIGKILL: ${e}`);
              }
            }
            this.elvMasterProcess = undefined;
            resolve();
          }, 5000);

          // The 'exit' handler in executeElvMaster already sets elvMasterProcess to undefined
          // So we just need to wait for that to happen
          const checkInterval = setInterval(() => {
            if (!this.elvMasterProcess) {
              clearTimeout(timeout);
              clearInterval(checkInterval);
              this.outputChannel?.appendLine('[FabricRunner] elvmaster stopped successfully');
              resolve();
            }
          }, 100);

          // Send the kill signal
          try {
            this.elvMasterProcess.kill('SIGTERM');
          } catch (e) {
            clearTimeout(timeout);
            clearInterval(checkInterval);
            this.outputChannel?.appendLine(`[FabricRunner] Failed to kill: ${e}`);
            this.elvMasterProcess = undefined;
            resolve();
          }
        });
      } else {
        this.outputChannel?.appendLine('[FabricRunner] No elvmaster process to stop (elvMasterProcess is undefined)');
      }

      this.outputChannel?.appendLine('[FabricRunner] Saving config-env.json...');
      try {
        fs.writeFileSync(this.cfg, JSON.stringify(this.obj));
        this.outputChannel?.appendLine('[FabricRunner] config-env.json saved successfully');
      } catch (err) {
        console.error(err);
        this.outputChannel?.appendLine(`[FabricRunner] ERROR saving config-env.json: ${err}`);
      }
      this.outputChannel?.appendLine('[FabricRunner] buildLocalFabric() completed successfully');
      //        process.chdir(oldDir);
    } catch (e) {
      console.error(e);
      this.outputChannel?.appendLine(`[FabricRunner] ERROR in buildLocalFabric(): ${e}`);
      throw e; // Re-throw to make the error visible
    }
  }

  async checkPort(portId: number) {
    if (!portId || isNaN(portId)) {
      console.error(`Invalid port: ${portId}`);
      return false; // Consider undefined/invalid ports as available
    }
    let b = await tcpPortUsed.check(portId, '127.0.0.1').then(function (inUse: boolean) {
      console.log(`Port ${portId} usage: ${inUse}`);
      return inUse;
    }, function (err: Error) {
      console.error(`Error checking port ${portId}:`, err.message);
      return false; // On error, assume port is available
    });
    return b;
  }

  async checkAllPorts() {
    const ports = [
      { name: 'elvmaster', value: this.obj["port"] },
      { name: 'rpc', value: this.obj["rpcport"] },
      { name: 'elv', value: this.obj["elvport"] },
      { name: 'qfab', value: this.obj["qfabport"] }
    ];

    for (const port of ports) {
      if (await this.checkPort(port.value)) {
        vscode.window.showErrorMessage(`Port ${port.value} (${port.name}) is in use. Please stop any running fabric instances.`);
        return false;
      }
    }
    return true;
  }

  public async install(forceRegen: boolean) {
    try {
      this.outputChannel?.appendLine('[FabricRunner] Starting fabric installation...');
      // Load configuration from VS Code settings
      const config = vscode.workspace.getConfiguration('elv-vscode');

      this.obj["space_owner"] = config.get('keys.spaceOwner', '0x81679e1b01aa38c04ca5aec757432d10fda01dfd');
      this.obj["space_owner_private_key"] = config.get('keys.spaceOwnerPrivateKey', 'b67bffcebaa19782243b27d8b940ee011cd4e432d40769f788f174fad53f870b');
      this.obj["user"] = config.get('keys.user', '0xbb1039015306e4239c844f47ce0655f27b6744ae');
      this.obj["user_private_key"] = config.get('keys.userPrivateKey', '8abeb47a19727df68d71c7eeb0ea603a25d622346d94f5acd2ea4f0796636906');
      this.obj["kms_account"] = config.get('keys.kmsAccount', '0xd9dc97b58c5f2584062cf69775d160ed9a3bfbc4');
      this.obj["kms_id"] = config.get('keys.kmsId', 'ikms433LwsH2LqfSvYtAFL7hnNWikLXd');
      this.obj["kms_public_key"] = config.get('keys.kmsPublicKey', 'kepkscLtX6mfBHpQUsZCEDK8rZ3VN2wKBkPC4ucVXrBZQxg3');
      this.obj["kms_private_key"] = config.get('keys.kmsPrivateKey', '5a59693d04b5066d96bfe77a01ed0d719169c198d9243c4c0a4d9bc06329c1d8');
      this.obj["qfab_node_account"] = config.get('keys.qfabNodeAccount', '26189c21e8387b9c50b780b91ce012ff676eb050');
      this.obj["qfab_node_id"] = config.get('keys.qfabNodeId', 'inodXnRMo5b4svum81wHZtvpDq9DtUf');
      this.obj["qfab_node_passphrase"] = config.get('keys.qfabNodePassphrase', 'test');
      this.obj["network_id"] = config.get('fabric.networkId', 955101);
      this.obj["chain_id"] = config.get('fabric.chainId', 955101);
      this.obj["port"] = config.get('ports.elvmaster', 40403);
      this.obj["rpcport"] = config.get('ports.rpc', 8545);
      this.obj["elvport"] = config.get('ports.elv', 6545);
      this.obj["qfabport"] = config.get('ports.qfab', 8008);
      this.obj["peer_enc_block"] = `H4sIAAAAA26189c21e8387b9c50b780b91ce012ff676eb050AAA/6yUQY8rNwjHv4vPcwDbGDvHqodW6rUfADDeHTXJpMlE2tenfPcqL21W2tM87XID2z/4C8z3YMtxzC9h9z3Yq8zH33vYNSIEnMLrcvDL6tJ/2S/2V9jBFHw+IcFH/ze5vIZdgDf4pIX/iPQhQ3339ds/clzn6+E9ZPv576vfJZz8PC/98e602GvYIQDcblM4LkfzR41hCut8VyaH0zPib+tZfpVVvkRHxcLNUQFFUjXIJiRuTJxT7AijC2Af/bN5Pm9hCi9y+WM+zOsP5Zgw9h/hPo8x23W/fnschCkc5revbLUt81Hl4j/FC1OQ/X6xe7tjwdosotdUWZsRKFfQhuaAcYzCxRUI7ndV9vL/CEjn6mokVuIDeptCxpIko+aUTAeRUU0lcbGMfCdpzw7dt8G2DsBHGJIM7FyVquUnrfWIllyl8eCKCQoyOFVOiTBiVq+ZWqmbSlNFSA2QEhTPMTWrOY/M5lCIRmQtnLP4Jlhv3Rrfq6URqWYo0UZpzNSxgPcmSYda3gYbCkUtu0UFRKqYlbMXK9zFINdOjZOnTTBvrNXMRx6OKTG3FlNqHsdorDiYkCHS2AYb2UsioTEqxz6SUITecm/YrUSkJsVLlk2wwalmj0ARS+mluErFGnMaOamwUgJsibfA7ovtelA/P/fYi1z+vHh/+ic5+3H9ul97+zcAAP//HrSLxjIGAAA=`;
      this.obj["peer_port"] = 40404;
      this.obj["peer_rpcport"] = 8546;
      this.obj["peer_elvport"] = 6546;
      this.obj["peer_mnemonic"] = "yard fix balance mirror produce cannon swap ride enter orbit castle tiger";
      this.obj["peer_passphrase"] = "test";
      this.obj["peer_accounts"] = 2;
      this.obj["static_nodes"] = "enode://9f8c40c9dc309e11a51e833a811991e105836f9a776cf938734db6c87d0dce7d6b4a6ae100b61987d8deec7f71d0a7c73c5fce5b84c57940fb536944fa2ba09d@127.0.0.1:40304";
      this.obj["eth_url"] = `http://localhost:${this.obj["rpcport"]}`;
      this.obj["qfab_url"] = `http://localhost:${this.obj["qfabport"]}`;

      this.outputChannel?.appendLine('[FabricRunner] Configuration loaded, checking binaries...');
      console.log("building mock fabric");

      // Validate binaries exist
      if (!fs.existsSync(this.elvmaster) || !fs.existsSync(this.qfab) || !fs.existsSync(this.qfabCli)) {
        this.outputChannel?.appendLine('[FabricRunner] ERROR: Binaries not found!');
        vscode.window.showErrorMessage('Fabric binaries not found. Please install binaries first.');
        return;
      }

      this.outputChannel?.appendLine('[FabricRunner] Binaries found, checking target directory...');

      try {
        let td = fs.statSync(this.targetDir);
        if (td === undefined) {
          fs.mkdirSync(this.targetDir, { recursive: true });
        }
      } catch (e) {
        fs.mkdirSync(this.targetDir, { recursive: true });
      }

      this.outputChannel?.appendLine('[FabricRunner] Checking for existing configuration...');
      try {
        let js = fs.statSync(this.cfg);
        if (js !== null && !forceRegen) {
          this.outputChannel?.appendLine('[FabricRunner] Configuration already exists');
          console.log("already configured");
          let s = await fs.readFileSync(this.cfg);
          vscode.window.showInformationMessage('Fabric already installed');
          return s;
        }
      } catch (e) {
        this.outputChannel?.appendLine('[FabricRunner] No existing config, creating new...');
        console.log(`no config json present, creating new: ${e}`);
      }

      this.outputChannel?.appendLine('[FabricRunner] Setting up directories and checking ports...');
      let runDir = path.join(this.targetDir, "RUN");
      try {
        let rd = fs.statSync(runDir, {});
        if (rd !== null) {
          fs.rmSync(runDir, { recursive: true });
        }
      } catch (e) {
        console.log(`run dir cleanup: ${e}`);
      }

      // Check ports AFTER loading config
      this.outputChannel?.appendLine('[FabricRunner] Checking if required ports are available...');
      if (!await this.checkAllPorts()) {
        this.outputChannel?.appendLine('[FabricRunner] ERROR: Required ports are in use!');
        throw new Error('Required ports are in use');
      }

      this.outputChannel?.appendLine('[FabricRunner] Ports available, building local fabric...');
      await this.buildLocalFabric();
      this.outputChannel?.appendLine('[FabricRunner] Fabric installation completed successfully!');
      vscode.window.showInformationMessage('Fabric installed successfully');
    } catch (error) {
      console.error(`Installation failed: ${error}`);
      vscode.window.showErrorMessage(`Fabric installation failed: ${error}`);
      throw error;
    }
  }
  public clientExecute(params: string[]) {
    if (!fs.existsSync(this.qfabCli)) {
      vscode.window.showErrorMessage('qfab_cli binary not found. Please install binaries first.');
      return;
    }

    try {
      const env = this.getExecutionEnvironment();
      const child = spawnSync(this.qfabCli, params, { env });
      if (child.status !== 0) {
        const stderr = String.fromCharCode(...child.stderr);
        console.error(`Failed to execute qfab_cli: ${stderr}`);

        // Check for missing library errors
        if (stderr.includes('error while loading shared libraries')) {
          const libMatch = stderr.match(/cannot open shared object file: ([^:]+)/);
          const missingLib = libMatch ? libMatch[0] : 'system libraries';
          vscode.window.showErrorMessage(
            `qfab_cli requires system libraries that are not installed. ${missingLib}. ` +
            `Please install tools bundle or FFmpeg libraries: sudo apt-get install ffmpeg libavcodec-dev libavformat-dev (Ubuntu/Debian) ` +
            `or brew install ffmpeg (macOS)`
          );
        } else {
          vscode.window.showErrorMessage(`qfab_cli error: ${stderr}`);
        }
        return;
      }
      return child.stdout.toJSON();
    } catch (error) {
      console.error(`Exception executing qfab_cli: ${error}`);
      vscode.window.showErrorMessage(`Failed to execute qfab_cli: ${error}`);
      return;
    }
  }

  public executeElvMaster() {
    if (this.elvMasterProcess === undefined) {
      if (!fs.existsSync(this.elvmaster)) {
        vscode.window.showErrorMessage('elvmasterd binary not found. Please install binaries first.');
        return;
      }

      if (this.obj["elvmasterd_dev_config_file"] === undefined) {
        try {
          if (!fs.existsSync(this.cfg)) {
            vscode.window.showErrorMessage('Fabric not installed. Please run install first.');
            return;
          }
          this.obj = JSON.parse(fs.readFileSync(this.cfg));
        }
        catch (e) {
          console.error(`unable to parse json from ${this.cfg}: ${e}`);
          vscode.window.showErrorMessage(`Failed to read fabric config: ${e}`);
          return;
        }
      }

      try {
        const env = this.getExecutionEnvironment();
        this.elvMasterProcess = spawn(this.elvmaster, ["start", "dev", "--config", this.obj["elvmasterd_dev_config_file"]], { env });
        if (this.elvMasterProcess !== undefined) {
          this.elvMasterProcess.on('exit', (code) => {
            console.log(`Executable elvmasterd exited with code ${code}`);
            this.elvMasterProcess = undefined; // Clean up the reference
            if (code !== 0 && code !== null) {
              vscode.window.showWarningMessage(`elvmasterd exited unexpectedly with code ${code}`);
            }
          });

          this.elvMasterProcess.on('error', (err) => {
            console.error(`elvmasterd error: ${err}`);
            vscode.window.showErrorMessage(`elvmasterd failed: ${err.message}`);
          });

          process.on('exit', () => {
            console.log('Node.js has exited, closing elvmaster');
            if (this.elvMasterProcess !== undefined) {
              this.elvMasterProcess?.kill('SIGTERM');
              this.elvMasterProcess = undefined;
            }
          });
        }
      } catch (error) {
        console.error(`Failed to start elvmasterd: ${error}`);
        vscode.window.showErrorMessage(`Failed to start elvmasterd: ${error}`);
      }
    }
  }

  public executeQfab() {
    this.outputChannel?.appendLine('[FabricRunner] executeQfab() called');
    if (!fs.existsSync(this.qfab)) {
      this.outputChannel?.appendLine('[FabricRunner] ERROR: qfab binary not found!');
      vscode.window.showErrorMessage('qfab binary not found. Please install binaries first.');
      return;
    }

    if (!fs.existsSync(this.qfabCfg)) {
      this.outputChannel?.appendLine('[FabricRunner] ERROR: qfab config not found!');
      vscode.window.showErrorMessage('qfab config not found. Please run install first.');
      return;
    }

    const env = this.getExecutionEnvironment();

    if (this.qfabProcess === undefined) {
      try {
        this.outputChannel?.appendLine(`[FabricRunner] Spawning qfab daemon with config: ${this.qfabCfg}`);
        this.qfabProcess = spawn(this.qfab, ["daemon", "--config", this.qfabCfg], { env });
        if (this.qfabProcess !== undefined) {
          this.outputChannel?.appendLine('[FabricRunner] qfab process started successfully');
          this.qfabProcess.on('exit', (code) => {
            this.outputChannel?.appendLine(`[FabricRunner] qfab exited with code ${code}`);
            console.log(`Executable qfab exited with code ${code}`);
            if (code !== 0 && code !== null) {
              vscode.window.showWarningMessage(`qfab exited unexpectedly with code ${code}`);
            }
          });

          this.qfabProcess.on('error', (err) => {
            this.outputChannel?.appendLine(`[FabricRunner] qfab error: ${err}`);
            console.error(`qfab error: ${err}`);
            vscode.window.showErrorMessage(`qfab failed: ${err.message}`);
          });

          this.qfabProcess.stderr.on('data', (data) => {
            this.outputChannel?.appendLine(`[qfab stderr] ${data.toString().trim()}`);
            console.error(`qfab stderr: ${data}`);
          });

          this.qfabProcess.stdout.on('data', (data) => {
            this.outputChannel?.appendLine(`[qfab stdout] ${data.toString().trim()}`);
            console.log(`qfab stdout: ${data}`);
          });
        }

        process.on('exit', () => {
          console.log('Node.js has exited');
          this.qfabProcess?.kill('SIGTERM');
          this.qfabProcess = undefined;
        });
      } catch (error) {
        this.outputChannel?.appendLine(`[FabricRunner] Failed to start qfab: ${error}`);
        console.error(`Failed to start qfab: ${error}`);
        vscode.window.showErrorMessage(`Failed to start qfab: ${error}`);
      }
    }
  }

  private async waitForElvmasterdReady(timeoutMs: number = 30000): Promise<boolean> {
    this.outputChannel?.appendLine('[FabricRunner] Waiting for elvmasterd to be ready...');
    const startTime = Date.now();
    const rpcPort = this.obj["rpc_port"] || 8545;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const inUse = await tcpPortUsed.check(rpcPort, '127.0.0.1');
        if (inUse) {
          // Port is listening, give it significant time to initialize blockchain/genesis
          this.outputChannel?.appendLine('[FabricRunner] RPC port is listening, waiting 10s for blockchain initialization...');
          await new Promise(resolve => setTimeout(resolve, 10000));
          this.outputChannel?.appendLine('[FabricRunner] elvmasterd should be ready now');
          return true;
        }
      } catch (error) {
        this.outputChannel?.appendLine(`[FabricRunner] Port check error: ${error}`);
      }

      // Wait 500ms before checking again
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    this.outputChannel?.appendLine('[FabricRunner] Timeout waiting for elvmasterd to be ready');
    return false;
  }

  public async execute() {
    this.outputChannel?.appendLine('[FabricRunner] Starting fabric execution...');
    this.outputChannel?.appendLine('[FabricRunner] Starting elvmasterd...');
    this.executeElvMaster();

    // Wait for elvmasterd to be ready before starting qfab
    const ready = await this.waitForElvmasterdReady();
    if (!ready) {
      vscode.window.showErrorMessage('elvmasterd failed to start within 30 seconds');
      return;
    }

    this.outputChannel?.appendLine('[FabricRunner] Starting qfab...');
    this.executeQfab();
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
