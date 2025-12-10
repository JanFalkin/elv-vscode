# elv-vscode README

elv-vscode is an extension that installs and manages a local copy of the Eluvio content fabric

## Features

The extension provides UI for both installing and running the fabric.  It is a user setting to determine if the fabric will continue to run after closing vscode.  In addition to managing the fabric, the extension provides UI for adding content and meta to local content objects, and most importantly enabling content types that are constructed from locally built WASM bitcode.  The extension will wire up the given debugger to enable step debugging of the wasm bitcode.  Finally the extension provides basic wallet and Fabric Browser access to our Demo and Production nodes facilitating easy deployment of debugged bitcode to real fabric nodes.

\!\[feature X\]\(images/feature-x.png\)

> Tip: Some cool animations will go here

## Storage Locations

The extension stores all fabric-related files in VS Code's global storage directory. This keeps everything isolated and makes it easy to clean up if needed.

**Base Location:** `~/.config/Code/User/globalStorage/<publisher>.<extension-name>/`

**Directory Structure:**
```
globalStorage/<extension-id>/
├── bin/                           # Fabric binaries (downloaded from GitHub)
│   ├── qfab                       # QFab daemon binary
│   ├── elvmasterd                 # Eluvio master daemon binary
│   └── qfab_cli                   # QFab CLI tool
│
└── builds/                        # Fabric runtime and data
    ├── config-env.json            # Environment configuration
    └── RUN/                       # Active fabric instance
        ├── QDATA/                 # Content fabric storage
        │   ├── PARTS/             # Content parts
        │   ├── TEMP/              # Temporary files
        │   ├── LIBS/              # Library data
        │   ├── LOCAL/             # Local node data
        │   ├── CACHE/             # Cache files
        │   └── SEARCH/            # Search index
        └── config/                # Runtime configuration
            ├── qfab.json          # QFab configuration
            ├── elvmasterd_dev_config.toml
            └── qfab_cli.json      # CLI configuration
```

**To Clean Up:**
If you need to reset the extension or free up space, you can safely delete the entire `globalStorage/<extension-id>/` directory. The extension will re-download binaries and recreate configs on next run.

## Requirements

Linux, Mac or WSL

## Extension Settings

This extension contributes the following settings:

**Fabric Management:**
* `elv-vscode.fabric.autoStart`: Automatically start the local fabric when VS Code opens (default: false)
* `elv-vscode.fabric.autoCloseOnExit`: Stop the fabric when VS Code closes (default: true)

**Fabric Browser:**
* `elv-vscode.browser.autoStart`: Automatically start the Fabric Browser when fabric starts (default: false)
* `elv-vscode.browser.port`: Port for the Fabric Browser dev server (default: 8080)
* `elv-vscode.browser.path`: Custom path to elv-fabric-browser installation (optional)

**Network Ports:**
* `elv-vscode.ports.elvmaster`: Elvmaster daemon port (default: 40403)
* `elv-vscode.ports.rpc`: RPC port (default: 8545)
* `elv-vscode.ports.elv`: ELV port (default: 6545)
* `elv-vscode.ports.qfab`: QFab daemon port (default: 8008)

**Network IDs:**
* `elv-vscode.fabric.networkId`: Network ID (default: 955101)
* `elv-vscode.fabric.chainId`: Chain ID (default: 955101)

**Binary Management:**
* `elv-vscode.binaries.repository`: GitHub repository for fabric binaries (format: owner/repo)
* `elv-vscode.binaries.version`: Version/tag of binaries to download
* `elv-vscode.binaries.autoUpdate`: Check for binary updates on startup (default: false)

**Development Keys** (configured with secure defaults for local development)

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for:

**Fabric Management:**
* `Eluvio: Download Binaries` - Download fabric binaries from GitHub (requires GitHub PAT for private repos)
* `Eluvio: Set GitHub Token` - Configure GitHub Personal Access Token for binary downloads
* `Eluvio: Clear GitHub Token` - Remove stored GitHub token

**Fabric Browser:**
* `Eluvio: Start Fabric Browser` - Start the Fabric Browser dev server
* `Eluvio: Stop Fabric Browser` - Stop the Fabric Browser dev server
* `Eluvio: Open Fabric Browser` - Open the Fabric Browser in VS Code

**Content Operations:**
* `Bitcode Publish` - Publish WASM bitcode to the local content fabric
* `Decode Token` - Decode a fabric token from selected text
* `Decode Clipboard` - Decode a fabric token from clipboard

## Known Issues

Not ready yet

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

