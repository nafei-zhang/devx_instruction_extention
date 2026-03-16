# GitHub File Puller (VS Code Extension)

[English](./README.md) | 简体中文

用于从 GitHub / GitHub Enterprise 按需拉取文件到本地目标目录，无需完整 clone 仓库。

## 最新状态

- 配置页主按钮已改为 **Save**
- **Registry Type** 在面板中已临时隐藏
- `Token` 按钮前增加状态复选框（已设置 Token 时勾选）
- 自动同步先检查 Token，未设置会先弹出设置 Token 输入框
- 若未打开任何项目/工作区，同步会弹模态提示并引导打开项目
- 冲突策略默认值为 **overwrite**
- 保留目录结构默认值为 **true**
- baseUrl 默认值为 `https://alm-github.com.hsbc/`

## 命令

- Bridge: Open Puller Config
- Bridge: Set Token
- Bridge: Puller Configure Token
- Bridge: Run Puller Auto Sync

## 快速开始

1. 安装并编译

```bash
npm install
npm run compile
```

2. 按 F5 启动 Extension Development Host
3. 在命令面板执行 **Bridge: Open Puller Config**
4. 配置仓库/ref/同步路径后点击 **Save**
5. 执行 **Bridge: Run Puller Auto Sync**

## 配置页流程

1) 仓库信息
- 支持 `owner/repo` 或 `https://host/owner/repo`
- 支持 `#ref`，也可填写 `Branch/Tag (ref)`

2) 加载并选择文件
- 点击 **Load Tree**
- 在树中勾选文件或目录
- 支持过滤、全选/全不选、展开/折叠

3) 目标与策略
- `Target Directory` 为可选，支持逗号分隔多个绝对路径
- `Preserve structure` 默认勾选
- `Conflict Strategy` 默认 `Overwrite`

4) 保存配置
- 点击 **Save** 持久化同步配置

## 自动同步前置检查

执行自动同步时按以下顺序检查：

1. 先检查 Token  
   - 未设置时先弹 Token 输入框
2. 再检查必要配置  
   - 仓库地址与同步路径
3. 再检查项目环境  
   - 未打开项目/工作区时弹模态按钮 **Open Project**

## Token 说明

- 优先使用 VS Code Secret Storage
- 可回退到 `githubPuller.token` 设置项
- 配置页头部的 Token Set 复选框反映当前是否可用

## VS Code 配置项（当前默认值）

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

## 企业 API 规则

- `baseUrl = https://github.com` 时，API 默认 `https://api.github.com`
- 其他域名时，API 默认 `${baseUrl}/api/v3`
- 可通过 `githubPuller.apiBaseUrl` 覆盖

## 开发

```bash
npm run compile
npm run typecheck
npm test
```
