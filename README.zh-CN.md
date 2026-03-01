# GitHub File Puller (VS Code Extension)

[English](./README.md) | 简体中文

将 GitHub 或 GitHub Enterprise 仓库中的“指定文件”拉取到本地工作区指定目录，并保留目录结构与编码正确性。支持私有仓库（可选 Token 认证）、冲突处理、树形文件选择、进度与错误提示。

## 功能特性

- 按需拉取指定文件：不必克隆整个仓库，只取所需文件
- 支持 GitHub 与 GitHub Enterprise（可配置 baseUrl / apiBaseUrl）
- 支持私有仓库：通过 Token 认证（安全存储于 VS Code Secret Storage，公共仓库可不设置）
- 树形文件选择器：可折叠、全选/全不选、全部展开/全部折叠、路径过滤
- 目录结构保持：按远程路径写入到工作区目标目录
- 冲突策略：rename / overwrite / skip
- 编码检测与转码：自动识别文本编码（chardet）并使用 iconv-lite 处理
- 进度与结果提示：展示下载进度与成功/失败统计
- 状态栏快捷入口：一键打开拉取面板

## 快速开始

1. 安装依赖并编译

```bash
npm install
npm run compile
```

2. 启动扩展开发主机  
在 VS Code 中按 F5（Run Extension），启动后在新窗口使用本扩展。

3. 打开拉取界面  
按下快捷键或命令面板执行：

- 命令：GitHub: Fetch Selected Files to Workspace
- 或点击状态栏“GitHub Puller”按钮

## 使用说明

1) 填写仓库
- 支持格式：
  - owner/repo
  - https://host/owner/repo
  - 可使用 `#ref`（或右侧 “Branch/Tag (ref)” 输入框）指定分支/标签，默认 `main`

2) 加载文件树  
点击 “Load Tree”，左侧展示仓库的目录树（仅文件可选）。

3) 选择文件
- 可勾选文件；勾选目录将级联选中其全部子文件（支持半选态）
- 顶部工具栏：
  - Filter file paths (prefix/contains)
  - Select All / Select None
  - Expand All / Collapse All

4) 设置目标目录与策略
- Target Directory：选择或输入绝对路径（可位于工作区中）
- Preserve structure：是否按远程路径保留目录结构
- Conflict Strategy：rename / overwrite / skip

5) 执行拉取  
点击 “Fetch”，等待进度条完成。完成后会提示成功/失败统计，并在面板底部显示状态。

## 认证与 Token（可选）

- 什么时候不需要 Token
  - 公共仓库：默认无需 Token 即可读取，适合低频使用
  - 临时/少量文件拉取：未触发 GitHub API 速率限制（未认证约 60 次/小时）

- 什么时候建议/需要 Token
  - 私有仓库或组织仓库需要权限验证
  - 使用频率较高、或一次操作涉及较多 API 请求（认证后速率限制显著提升）
  - GitHub Enterprise 环境通常需要 Token（由管理员策略决定）

- 如何设置 Token
  - 使用命令：GitHub: Set Token (Secret Storage)
  - 在输入框中粘贴 Token（仅需 repo 读取权限），为空保存则清除 Token
  - Token 保存在 VS Code 的 Secret Storage 中，不会写入文件

## GitHub Enterprise 配置

在 VS Code 设置中配置：

```json
{
  "githubPuller.baseUrl": "https://github.example.com",
  "githubPuller.apiBaseUrl": "" // 可选，不填则默认 baseUrl + /api/v3
}
```

规则：
- 当 baseUrl 为 https://github.com：自动使用 https://api.github.com
- 当 baseUrl 为企业域名：默认使用 `${baseUrl}/api/v3`
- 如企业环境 API 路径不同，可显式设置 `githubPuller.apiBaseUrl`

## VS Code 配置项

可在 Settings 搜索 “GitHub File Puller”，或在 settings.json 中修改：

```json
{
  "githubPuller.showStatusBar": true,
  "githubPuller.defaultTargetDir": "",
  "githubPuller.conflictResolution": "rename",   // overwrite | skip | rename
  "githubPuller.preserveStructure": true,
  "githubPuller.baseUrl": "https://github.com",
  "githubPuller.apiBaseUrl": "",
  "githubPuller.defaultRef": "main",
  "githubPuller.token": ""                       // 明文备用 Token（不推荐）
}
```

## 命令

- GitHub: Fetch Selected Files to Workspace（打开拉取面板）
- GitHub: Set Token (Secret Storage)（设置/清除 Token）

## 冲突策略说明

- rename：若目标存在，自动重命名（追加序号）写入
- overwrite：覆盖写入
- skip：跳过写入，结果中会提示

## 故障排查

- 401 Unauthorized  
  - Token 无效或权限不足；确认 `repo` 读取权限  
  - GHES 下确认 baseUrl/apiBaseUrl 配置正确
- 404 Not Found / ref 无效  
  - 分支/标签不存在；检查 ref 值  
  - URL 写法错误（owner/repo 或完整 URL）
- Rate Limit / 访问受限  
  - 配置并使用 Token  
  - 企业环境确保能访问 API
- 编码显示异常  
  - 插件已检测常见文本编码；如仍异常，请在本地另行转码确认源文件编码

## 已知限制

- 超大仓库的文件树加载可能较慢（API 递归树返回量大）  
- 不处理 Git LFS 指针解析，仅按内容下载  
- 符号链接等特殊文件类型按普通文件处理

## 开发与调试

项目结构（关键文件）：

- 入口与命令：src/extension.ts  
- Webview 面板与树视图：src/webview/fetchPanel.ts  
- GitHub API 调用：src/github.ts  
- 文件写入与编码：src/utils/fs.ts

常用脚本：

```bash
npm run compile     # 编译
npm run typecheck   # 类型检查
# F5 运行扩展开发主机
```

## 安全与隐私

- Token 存储于 VS Code Secret Storage，不会写入文件或日志  
- 请勿将 Token 写入 settings.json（除非临时测试）
