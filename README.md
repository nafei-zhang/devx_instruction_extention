# GitHub File Puller (VS Code Extension)

English | [简体中文](./README.zh-CN.md)

Pull only the files you need from GitHub or GitHub Enterprise into a specific folder in your workspace. The extension preserves folder structure, handles conflicts, detects encodings, and provides a collapsible tree for file selection with progress and error reporting.

## Features

- Fetch selected files without cloning the entire repository
- Works with GitHub and GitHub Enterprise (configurable baseUrl / apiBaseUrl)
- Private repositories supported via token auth (securely stored in VS Code Secret Storage; public repos can be used without a token)
- Collapsible tree selector: select by folder, Select All/None, Expand/Collapse All, and path filter
- Preserve remote folder structure on write
- Conflict strategies: rename / overwrite / skip
- Encoding detection and transcoding via chardet + iconv-lite
- Progress and result summary notifications
- Status bar entry to quickly open the panel

## Quick Start

1. Install and build

```bash
npm install
npm run compile
```

2. Launch the Extension Development Host  
Press F5 in VS Code (Run Extension). A new window opens with the extension available.

3. Open the puller panel  
Run the command:

- GitHub: Fetch Selected Files to Workspace  
- Or click the “GitHub Puller” item in the status bar

## Usage

1) Repository input
- Supported formats:
  - owner/repo
  - https://host/owner/repo
  - Optional `#ref` fragment (or use the “Branch/Tag (ref)” field), defaults to `main`

2) Load file tree  
Click “Load Tree” to fetch and display the repository file tree (only files are selectable).

3) Select files
- Check files; checking a folder selects all descendant files (indeterminate state supported)
- Toolbar:
  - Filter file paths (prefix/contains)
  - Select All / Select None
  - Expand All / Collapse All

4) Target and options
- Target Directory: choose or type an absolute path (can be inside your workspace)
- Preserve structure: keep repository folder structure
- Conflict Strategy: rename / overwrite / skip

5) Fetch  
Click “Fetch”. A progress notification appears. When finished, a success/failure summary is shown and the panel status updates.

## Authentication & Token (Optional)

- When you don’t need a token
  - Public repositories work without a token, suitable for low-frequency usage
  - Small/occasional operations that do not hit GitHub’s unauthenticated rate limit (~60 req/hour)

- When a token is recommended/required
  - Private or organization repositories
  - Higher-frequency usage (authenticated rate limits are much higher)
  - GitHub Enterprise environments often require a token (depends on admin policy)

- How to set a token
  - Run the command: GitHub: Set Token (Secret Storage)
  - Paste a token with read access to repo; saving an empty value clears the token
  - The token is stored in VS Code Secret Storage and is never written to disk

## GitHub Enterprise

Set in VS Code settings:

```json
{
  "githubPuller.baseUrl": "https://github.example.com",
  "githubPuller.apiBaseUrl": "" // Optional; defaults to baseUrl + /api/v3
}
```

Rules:
- If baseUrl is https://github.com → use https://api.github.com
- If baseUrl is a GHES domain → default to `${baseUrl}/api/v3`
- If your GHES API path differs, set `githubPuller.apiBaseUrl` explicitly

## VS Code Settings

Search “GitHub File Puller” in Settings or set via settings.json:

```json
{
  "githubPuller.showStatusBar": true,
  "githubPuller.defaultTargetDir": "",
  "githubPuller.conflictResolution": "rename",   // overwrite | skip | rename
  "githubPuller.preserveStructure": true,
  "githubPuller.baseUrl": "https://github.com",
  "githubPuller.apiBaseUrl": "",
  "githubPuller.defaultRef": "main",
  "githubPuller.token": ""
}
```

## Commands

- GitHub: Fetch Selected Files to Workspace (open the panel)
-
- GitHub: Set Token (Secret Storage) (set/clear token)

## Conflict Strategy

- rename: if destination exists, auto-rename (append an index) and write
- overwrite: overwrite the existing file
- skip: skip writing and report in results

## Troubleshooting

- 401 Unauthorized  
  - Invalid token or insufficient permission; ensure `repo` read access  
  - On GHES, verify baseUrl/apiBaseUrl configuration
- 404 Not Found / invalid ref  
  - Branch/tag not found; check your ref  
  - URL format incorrect (must be owner/repo or a full URL)
- Rate limit / access restricted  
  - Configure and use a token  
  - Ensure connectivity to GHES API
- Garbled text  
  - The extension detects common encodings; if issues persist, verify the source file encoding locally

## Known Limitations

- Very large repositories may have slow tree retrieval (recursive API size)
- Git LFS pointers are not resolved; content is downloaded as-is
- Symlinks and other special file types are treated as regular files

## Development & Debugging

Key files:

- Entry/commands: src/extension.ts  
- Webview and tree UI: src/webview/fetchPanel.ts  
- GitHub API calls: src/github.ts  
- File writing & encoding: src/utils/fs.ts

Scripts:

```bash
npm run compile
npm run typecheck
# Press F5 to run the Extension Development Host
```

## Security & Privacy

- Token is stored in VS Code Secret Storage; never written to files or logs  
- Avoid placing tokens in settings.json unless for temporary testing
