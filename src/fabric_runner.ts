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
  //    script:string;
  binDir: string;
  elvmaster: string;
  qfab: string;
  qfabCli: string;
  cfg: string;
  qfabCfg: string;
  elvmasterCfg: string;
  runDir: string;
  obj: { [key: string]: any };
  fabric: LocalFabric;


  // children represent branches, which are also items

  // add all members here, file and line we'll need later
  // the label represent the text which is displayed in the tree
  // and is passed to the base class
  constructor() {
    this.targetDir = path.join(__dirname, "..", 'builds');
    //      this.script = path.join(__dirname, "..", "bin", "build-devsetup.sh");
    this.binDir = path.join(__dirname, "..", "..", 'bin');
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
    let client = this.clientExecute(["tools", "decode", token,
      "--config", "builds/RUN/config/qfab_cli.json"]);
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
    let client = this.clientExecute(["space", "bitcode", wasmFilePath,
      "--library", "ilib2nLKiR5p2yiGqCNicszxQYyvu9W4", "--space", "ispc36s3uwY9voTx6gXcXENn4KfY29fC",
      "--config", "builds/RUN/config/qfab_cli.json"]);
    if (client !== undefined) {
      let s = String.fromCharCode(...client.data);
      let j = JSON.parse(s);
    }
  }
  //${qfab_node_id} ${qfab_url} ${eth_url} ${qfab_cli_space_owner_config_file} ${kms_id}
  qfabCliNodeAdd(qfabNodeId: string, qfabUrl: string, ethUrl: string, qfabCliSpaceOwnerConfigFile: string, kmsId: string) {
    let res = spawnSync(this.qfabCli, ["space", "node", "add", qfabNodeId, "fab" + qfabUrl, "eth" + ethUrl, "--config", qfabCliSpaceOwnerConfigFile, "--kms", kmsId]);
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
    let res = spawnSync(this.qfabCli, ["space", "kms", "add", kmsId, ethUrl, "--pubkey", kmsPublicKey, "--config", cfg]);
    if (res.status === 0) {
      console.log("SUCCESS: space kms added...");
    }
    else {
      console.error("Failed: space kms added...");
    }
  }

  qfabCliSpaceCreate(cfg: string) {
    let res = spawnSync(this.qfabCli, ["space", "create", "--config", cfg]);
    let se = String.fromCharCode(...res.stderr);
    let so = String.fromCharCode(...res.stdout);

    if (res.status === 0) {
      console.log("space created");
      let sdata = content(cfg);
      let s = String.fromCharCode(...sdata);
      let rep = `"space_id": ${so}`;
      let from = `"space_id": ""`;
      s = s.replace(from, rep);
      fs.writeFileSync(cfg, s);
      return so;
    } else {
      console.error(`failed space created stderr = ${se}, stdout = ${so}`);
    }
  }

  elvmasterdWalletCreate(cfg: string) {
    let res = spawnSync(this.elvmaster, ["wallet", "create", "dev", "--config", cfg]);
    let se = String.fromCharCode(...res.stderr);
    let so = String.fromCharCode(...res.stdout);
    if (res.status !== 0) {
      return "";
    }
    return so;
  }

  elvmasterdInit(cfg: string) {
    let res = spawnSync(this.elvmaster, ["init", "dev", "--config", cfg]);
    let se = String.fromCharCode(...res.stderr);
    let so = String.fromCharCode(...res.stdout);
    if (res.status !== 0) {
      return "";
    }
    return so;
  }

  elvmasterdDevConfig(emLog: string, emDir: string) {
    return `\n\[node]\n\log_file="${emLog}"\ndatadir="${emDir}"\nnodekey=true\n\port=${this.obj["port"]}\nrpcport=${this.obj["rpcport"]}\nelvport=${this.obj["elvport"]}\nnetworkid=${this.obj["network_id"]}\n\n[svc_config]\nfabric_url="${this.obj["qfab_url"]}"\n\n[genesis]\nchainid=${this.obj["chain_id"]}\n`;
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
      qfabBaseConfig["paths"] = this.obj["path"];
      qfabBaseConfig["log"]["file"]["filename"] = this.obj["qfab_log_file"];
      qfabBaseConfig["avpipe"]["cache"]["path"] = path.join(this.obj["path"]["install_path"], "pogreb.db");
      qfabBaseConfig["fabric"]["node_id"] = this.obj["qfab_node_id"];
      qfabBaseConfig["qspaces"][0]["id"] = this.obj["user_space_id"];
      qfabBaseConfig["qspaces"][0]["ethereum"]["wallet_file"] = this.obj["wallet_file"];
      fs.writeFileSync(this.obj["qfab_config_file"], JSON.stringify(qfabBaseConfig));
    } catch (e) {
      console.error(`failed to generate ${this.obj["qfab_config_file"]}`);
    }
  }


  buildLocalFabric() {
    try {
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

      let emTOML = this.elvmasterdDevConfig(this.obj["elvmasterd_log"], this.obj["elvmaster_dir"]);
      fs.writeFileSync(this.obj["elvmasterd_dev_config_file"], emTOML);
      fs.chmodSync(this.obj["elvmasterd_dev_config_file"], '600');
      this.elvmasterdWalletCreate(this.obj["elvmasterd_dev_config_file"]);
      // if (wallet === ""){
      //   console.error("failed to create wallet");
      //   return;
      // }
      this.elvmasterdInit(this.obj["elvmasterd_dev_config_file"]);
      const files = fs.readdirSync(this.obj["elvmaster_keystore_dir"]);
      const fileNameSubstring = this.obj["qfab_node_account"]; // the substring you want to match

      const wildcard = "*";
      const matchingFiles = files.filter((file: string) => {
        const filename = file;
        return file.includes(fileNameSubstring);
      });
      this.obj["wallet_file"] = path.join(this.obj["elvmaster_keystore_dir"], matchingFiles[0]);
      this.executeElvMaster();
      execSync('sleep 5');

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

      this.qfabCliKmsAdd(this.obj["kms_id"], this.obj["eth_url"], this.obj["kms_public_key"], this.obj["qfab_cli_space_owner_config_file"]);
      this.qfabCliNodeAdd(this.obj["qfab_node_id"], this.obj["qfab_url"], this.obj["eth_url"], this.obj["qfab_cli_space_owner_config_file"], this.obj["kms_id"]);

      this.buildQfabConfig();
      this.executeQfab();


      try {
        fs.writeFileSync(this.cfg, JSON.stringify(this.obj));
      } catch (err) {
        console.error(err);
      }
      //        process.chdir(oldDir);
    } catch (e) {
      console.error(e);
    }
  }

  async checkPort(portId: number) {
    let b = await tcpPortUsed.check(portId, '127.0.0.1').then(function (inUse: boolean) {
      console.log('Port 44201 usage: ' + inUse);
      return inUse;
    }, function (err: Error) {
      console.error('Error on check:', err.message);
      return true;
    });
    return b;
  }

  async checkAllPorts() {
    if (await this.checkPort(this.obj["port"])) {
      vscode.window.showErrorMessage(`Port ${this.obj["port"]} in use`);
      return false;
    }
    if (await this.checkPort(this.obj["rpcport"])) {
      vscode.window.showErrorMessage(`Port ${this.obj["rpcport"]} in use`);
      return false;
    }
    if (await this.checkPort(this.obj["elvport"])) {
      vscode.window.showErrorMessage(`Port ${this.obj["elvport"]} in use`);
      return false;
    }
    if (await this.checkPort(this.obj["qfabport"])) {
      vscode.window.showErrorMessage(`Port ${this.obj["qfabport"]} in use`);
      return false;
    }
    return true;
  }

  public async install(forceRegen: boolean) {
    this.obj["space_owner"] = "0x81679e1b01aa38c04ca5aec757432d10fda01dfd";
    this.obj["space_owner_private_key"] = "b67bffcebaa19782243b27d8b940ee011cd4e432d40769f788f174fad53f870b";
    this.obj["user"] = "0xbb1039015306e4239c844f47ce0655f27b6744ae";
    this.obj["user_private_key"] = "8abeb47a19727df68d71c7eeb0ea603a25d622346d94f5acd2ea4f0796636906";
    this.obj["kms_account"] = "0xd9dc97b58c5f2584062cf69775d160ed9a3bfbc4";
    this.obj["kms_id"] = "ikms433LwsH2LqfSvYtAFL7hnNWikLXd";
    this.obj["kms_public_key"] = "kepkscLtX6mfBHpQUsZCEDK8rZ3VN2wKBkPC4ucVXrBZQxg3";
    this.obj["kms_private_key"] = "5a59693d04b5066d96bfe77a01ed0d719169c198d9243c4c0a4d9bc06329c1d8";
    this.obj["qfab_node_account"] = "26189c21e8387b9c50b780b91ce012ff676eb050";
    this.obj["qfab_node_id"] = "inodXnRMo5b4svum81wHZtvpDq9DtUf";
    this.obj["qfab_node_passphrase"] = "test";
    this.obj["network_id"] = 955101;
    this.obj["chain_id"] = 955101;
    this.obj["port"] = 40403;
    this.obj["rpcport"] = 8545;
    this.obj["elvport"] = 6545;
    this.obj["qfabport"] = 8008;
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


    console.log("building mock fabric");

    try {
      let td = fs.statSync(this.targetDir);
      if (td === undefined) {
        fs.mkdirSync(this.targetDir, { recursive: true });
      }
    } catch (e) {
      fs.mkdirSync(this.targetDir, { recursive: true });
    }
    try {
      let js = fs.statSync(this.cfg);
      if (js !== null && !forceRegen) {
        console.log("already configured");
        let s = await fs.readFileSync(this.cfg);
        return s;
      }
    } catch (e) {
      console.log(`no config json present exception ${e}`);
    }
    let runDir = path.join(this.targetDir, "RUN");
    try {
      let rd = fs.statSync(runDir, {});
      if (rd !== null) {
        fs.rmSync(runDir, { recursive: true });
      }
    } catch (e) {
      console.log(`exception ${e}`);
    }
    if (!await this.checkAllPorts()) {
      vscode.window.showErrorMessage(`Critical port in use`);
      return;
    }
    this.buildLocalFabric();
  }
  public clientExecute(params: string[]) {
    const child = spawnSync(this.qfabCli, params);
    if (child.status !== 0) {
      console.error(`Failed to get space nod list`);
      return;
    }
    return child.stdout.toJSON();
  }

  public executeElvMaster() {
    if (this.elvMasterProcess === undefined) {
      if (this.obj["elvmasterd_dev_config_file"] === undefined) {
        try {
          this.obj = JSON.parse(fs.readFileSync(this.cfg));
        }
        catch (e) {
          console.error(`unable to parse json from ${this.cfg}`);
          return;
        }
      }
      this.elvMasterProcess = spawn(this.elvmaster, ["start", "dev", "--config", this.obj["elvmasterd_dev_config_file"]]);
      if (this.elvMasterProcess !== undefined) {
        this.elvMasterProcess.on('exit', (code) => {
          console.log(`Executable elvmasterd exited with code ${code}`);
        });
        process.on('exit', () => {
          console.log('Node.js has exited, closing elvmaster');
          if (this.elvMasterProcess !== undefined) {
            this.elvMasterProcess?.kill('SIGTERM');
            this.elvMasterProcess = undefined;
          }
        });
      }
    }
  }

  public executeQfab() {
    const env = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      ELV_WALLET_PASSPHRASE: 'test',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      //LD_LIBRARY_PATH: '/home/jan/ELV/elv-toolchain/dist/linux-glibc.2.31/../../FFmpeg/FFmpeg/dist/lib:/home/jan/ELV/deps/sqlite/.libs/:/home/jan/ELV/deps/libco/:/home/jan/ELV/deps/raft/.libs/:/home/jan/ELV/deps/dqlite/.libs//home/jan/ELV/deps/sqlite/.libs/:/home/jan/ELV/deps/libco/:/home/jan/ELV/deps/raft/.libs/:/home/jan/ELV/deps/dqlite/.libs/'
    };
    if (this.qfabProcess === undefined) {
      this.qfabProcess = spawn(this.qfab, ["daemon", "--config", this.qfabCfg], { env });
      if (this.qfabProcess !== undefined) {
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
        this.qfabProcess?.kill('SIGTERM');
        this.qfabProcess = undefined;
      });
    }
  }

  public execute() {
    this.executeElvMaster();
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
