# GitHub Authentication for Eluvio VS Code Extension

## Overview

The Eluvio VS Code extension can download fabric binaries (qfab, elvmasterd, qfab_cli) from private GitHub repositories using Personal Access Tokens (PAT).

## Setup Instructions

### 1. Create GitHub Personal Access Token

1. Go to https://github.com/settings/tokens/new
2. Click **"Generate new token (classic)"**
3. Give it a descriptive name: `Eluvio VS Code Extension`
4. Set expiration (recommended: 90 days, or "No expiration" for convenience)
5. **Select scope: `repo`** (Full control of private repositories)
6. Click **"Generate token"** at the bottom
7. **Copy the token** (starts with `ghp_` or `github_pat_`)
   - ⚠️ Save it somewhere - you won't see it again!

### 2. Configure Extension

#### Option A: Automatic Prompt (Easiest)
1. Install the extension
2. Extension will automatically prompt for binaries
3. Click **"Download"**
4. Enter your GitHub token when prompted
5. Binaries download automatically ✓

#### Option B: Manual Setup
1. Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Run: **"Eluvio: Set GitHub Token"**
3. Paste your token
4. Configure download URL in settings (see below)
5. Run: **"Eluvio: Download Binaries"**

### 3. Configure Download URL

Set the GitHub releases URL in VS Code settings:

```json
{
  "elv-vscode.binaries.downloadUrl": "https://github.com/eluv-io/fabric-binaries/releases/download",
  "elv-vscode.binaries.version": "v3.2.1"
}
```

**URL Pattern:**
```
{downloadUrl}/{version}/{binary}-{platform}-{arch}
```

**Example:**
```
https://github.com/eluv-io/fabric-binaries/releases/download/v3.2.1/qfab-linux-amd64
```

## Commands

The extension provides these commands (via Command Palette):

- **Eluvio: Set GitHub Token** - Store your PAT securely
- **Eluvio: Clear GitHub Token** - Remove stored token
- **Eluvio: Download Binaries** - Manually trigger download

## Security

- ✅ Tokens stored in **VS Code Secrets API** (encrypted)
- ✅ Tokens **never logged** or sent anywhere except GitHub
- ✅ Only used for binary downloads
- ✅ Can be cleared anytime

## GitHub Repository Setup

### For Repository Administrators:

1. Create releases with platform-specific binaries
2. Add collaborators who need access:
   - Go to repo **Settings → Collaborators and teams**
   - Add users or create a team
   - Give **Read** permission (enough for downloads)

### Binary Naming Convention:

```
qfab-{version}-{platform}-{arch}
elvmasterd-{version}-{platform}-{arch}
qfab_cli-{version}-{platform}-{arch}
```

**Supported Platforms:**
- `linux-amd64` (Linux x64)
- `linux-arm64` (Linux ARM64)
- `darwin-amd64` (macOS Intel)
- `darwin-arm64` (macOS Apple Silicon)
- `windows-amd64.exe` (Windows x64)

**Example Release Assets:**
```
v3.2.1/
  ├── qfab-v3.2.1-linux-amd64
  ├── qfab-v3.2.1-darwin-arm64
  ├── elvmasterd-v3.2.1-linux-amd64
  ├── elvmasterd-v3.2.1-darwin-arm64
  ├── qfab_cli-v3.2.1-linux-amd64
  └── qfab_cli-v3.2.1-darwin-arm64
```

## Troubleshooting

### "GitHub authentication failed"
- Token may be expired or invalid
- Run: **"Eluvio: Clear GitHub Token"** and re-enter
- Verify token has `repo` scope

### "Binary not found"
- Check `downloadUrl` and `version` settings
- Verify release exists in GitHub
- Check binary naming matches convention

### "No binary download URL configured"
- Set `elv-vscode.binaries.downloadUrl` in settings
- Or use **"Specify Path"** to point to existing binaries

### Manual Installation (Alternative)
If you prefer not to use GitHub authentication:
1. Download binaries manually from GitHub releases
2. Place them in a directory (e.g., `~/eluvio-bin/`)
3. When extension prompts, choose **"Specify Path"**
4. Select the directory containing the binaries

## Support

For access issues, contact your Eluvio administrator or repository owner.
