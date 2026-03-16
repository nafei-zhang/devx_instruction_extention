# GitHub File Puller (VS Code Extension)

English | [简体中文](./README.zh-CN.md)

Pull selected files from GitHub/GitHub Enterprise into local target folders without cloning the full repository.

## What’s Current

- Config panel now uses **Save** (instead of Save Config)
- **Registry Type** field is currently hidden in the panel
- Token status is visible with a checkbox near the **Token** button
- Auto sync checks token first; if missing, it opens the token input immediately
- If no project/workspace is open, sync shows a modal prompt to open a project
- Default conflict strategy is **overwrite**
- Default preserve structure is **true**
- Default base URL is `https://alm-github.com.hsbc/`

## Commands

- Bridge: Open Puller Config
- Bridge: Set Token
- Bridge: Puller Configure Token
- Bridge: Run Puller Auto Sync

## Quick Start

1. Install and compile

```bash
npm install
npm run compile
```

2. Press F5 to launch Extension Development Host
3. Open command palette and run **Bridge: Open Puller Config**
4. Configure repository/ref/paths, then click **Save**
5. Run **Bridge: Run Puller Auto Sync**

## Config Panel Flow

1) Repository input
- Supports `owner/repo` or full URL `https://host/owner/repo`
- `#ref` is supported, or fill `Branch/Tag (ref)`

2) Load and select files
- Click **Load Tree**
- Select files/folders from the tree
- Use filter, Select All/None, Expand/Collapse

3) Target and strategy
- `Target Directory` is optional and supports comma-separated absolute paths
- `Preserve structure` default is checked
- `Conflict Strategy` default is `Overwrite`

4) Save config
- Click **Save** to persist sync settings

## Sync Preconditions

When running auto sync:

1. Token is checked first  
   - If missing, token input opens immediately
2. Required sync fields are validated  
   - repo URL and sync paths
3. Workspace/project is validated  
   - if not open, a modal prompts: **Open Project**

## Token

- Preferred storage: VS Code Secret Storage
- Fallback: `githubPuller.token` in settings
- In panel header, the Token Set checkbox reflects whether token is currently available

## VS Code Settings (Current Defaults)

```json
{
  "githubPuller.showStatusBar": true,
  "githubPuller.defaultTargetDir": "",
  "githubPuller.targetDirs": "",
  "githubPuller.conflictResolution": "overwrite",
  "githubPuller.preserveStructure": true,
  "githubPuller.baseUrl": "https://alm-github.com.hsbc/",
  "githubPuller.apiBaseUrl": "",
  "githubPuller.defaultRef": "main",
  "githubPuller.syncRepoUrl": "https://github.com/SebastienDegodez/copilot-instructions",
  "githubPuller.syncRef": "main",
  "githubPuller.syncPaths": "instructions,scripts,skills",
  "githubPuller.token": ""
}
```

## Enterprise API Behavior

- `baseUrl = https://github.com` → API defaults to `https://api.github.com`
- Other hosts → API defaults to `${baseUrl}/api/v3`
- You can override via `githubPuller.apiBaseUrl`

## Development

```bash
npm run compile
npm run typecheck
npm test
```
