"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FetchPanel = void 0;
const vscode = __importStar(require("vscode"));
const github_1 = require("../github");
const fs_1 = require("../utils/fs");
const secrets_1 = require("../secrets");
const targetDirs_1 = require("../utils/targetDirs");
class FetchPanel {
    constructor(ctx) {
        this.ctx = ctx;
        this.panel = null;
        this.cfgWatcher = null;
    }
    getConfigWriter() {
        const cfg = vscode.workspace.getConfiguration();
        const target = vscode.workspace.workspaceFolders?.length ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
        return {
            get(key) {
                return cfg.get(key);
            },
            update(key, value) {
                return cfg.update(key, value, target);
            }
        };
    }
    show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }
        this.panel = vscode.window.createWebviewPanel('githubPuller.fetchPanel', 'GitHub File Puller', vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        this.panel.webview.html = this.renderHtml(this.panel.webview);
        this.panel.onDidDispose(() => {
            this.panel = null;
            this.cfgWatcher?.dispose();
            this.cfgWatcher = null;
        });
        this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));
        this.pushDefaults();
        this.cfgWatcher = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('githubPuller.targetDirs') || e.affectsConfiguration('githubPuller.defaultTargetDir')) {
                this.pushDefaults();
            }
        });
    }
    post(message) {
        this.panel?.webview.postMessage(message);
    }
    pushDefaults() {
        const cfg = vscode.workspace.getConfiguration();
        const configured = (0, targetDirs_1.readTargetDirsFromConfig)(cfg);
        this.post({
            type: 'defaults',
            defaultRef: cfg.get('githubPuller.defaultRef') || 'main',
            preserve: cfg.get('githubPuller.preserveStructure') ?? true,
            conflict: cfg.get('githubPuller.conflictResolution') || 'rename',
            defaultTargetDirs: configured
        });
    }
    async handleMessage(msg) {
        try {
            switch (msg?.type) {
                case 'selectTargetDir': {
                    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    const result = await vscode.window.showOpenDialog({
                        canSelectFiles: false,
                        canSelectFolders: true,
                        canSelectMany: false,
                        defaultUri: ws ? vscode.Uri.file(ws) : undefined,
                        openLabel: 'Select Folder'
                    });
                    const p = result?.[0]?.fsPath;
                    if (!p)
                        break;
                    const writableCfg = this.getConfigWriter();
                    const currentInput = msg.currentValue || (0, targetDirs_1.readTargetDirsFromConfig)(writableCfg);
                    const appended = (0, targetDirs_1.appendTargetDir)(currentInput, p, { requireAbsolute: true, requireExists: true });
                    if (appended.issues.length > 0) {
                        throw new Error(`Invalid target path: ${appended.issues[0].path} (${appended.issues[0].reason})`);
                    }
                    const serialized = (0, targetDirs_1.serializeTargetDirs)(appended.normalized);
                    await (0, targetDirs_1.writeTargetDirsToConfig)(writableCfg, serialized);
                    this.post({ type: 'targetDir', path: serialized });
                    break;
                }
                case 'syncTargetDirs': {
                    const writableCfg = this.getConfigWriter();
                    const parsed = (0, targetDirs_1.parseTargetDirs)(msg.value || '', { requireAbsolute: true, requireExists: false });
                    if (parsed.issues.length > 0) {
                        throw new Error(parsed.issues.map(i => `${i.path || '<empty>'}: ${i.reason}`).join('; '));
                    }
                    const serialized = (0, targetDirs_1.serializeTargetDirs)(parsed.normalized);
                    await (0, targetDirs_1.writeTargetDirsToConfig)(writableCfg, serialized);
                    this.post({ type: 'targetDirsSynced', value: serialized });
                    break;
                }
                case 'loadTree': {
                    const cfg = vscode.workspace.getConfiguration();
                    const defaultRef = cfg.get('githubPuller.defaultRef') || 'main';
                    const info = (0, github_1.parseRepoUrl)(msg.repoUrl, msg.ref || defaultRef);
                    const token = (await (0, secrets_1.getSecretToken)(this.ctx.secrets)) || (cfg.get('githubPuller.token') || '');
                    const baseUrl = cfg.get('githubPuller.baseUrl') || 'https://github.com';
                    const apiBaseOverride = cfg.get('githubPuller.apiBaseUrl') || '';
                    const apiBase = (0, github_1.deriveApiBase)(baseUrl, apiBaseOverride);
                    this.post({ type: 'loading', text: 'Loading file tree…' });
                    const tree = await (0, github_1.fetchRepoTreeWithApi)(info, token || undefined, apiBase);
                    const files = tree.filter(t => t.type === 'blob').map(t => t.path);
                    this.post({ type: 'treeLoaded', files });
                    break;
                }
                case 'fetchFiles': {
                    const cfg = vscode.workspace.getConfiguration();
                    const defaultRef = cfg.get('githubPuller.defaultRef') || 'main';
                    const info = (0, github_1.parseRepoUrl)(msg.repoUrl, msg.ref || defaultRef);
                    const token = (await (0, secrets_1.getSecretToken)(this.ctx.secrets)) || (cfg.get('githubPuller.token') || '');
                    const baseUrl = cfg.get('githubPuller.baseUrl') || 'https://github.com';
                    const apiBaseOverride = cfg.get('githubPuller.apiBaseUrl') || '';
                    const apiBase = (0, github_1.deriveApiBase)(baseUrl, apiBaseOverride);
                    const parsedTargetDirs = (0, targetDirs_1.parseTargetDirs)(msg.targetDir || '', { requireAbsolute: true, requireExists: true });
                    if (parsedTargetDirs.issues.length > 0) {
                        throw new Error(`Invalid target directory: ${parsedTargetDirs.issues[0].path} (${parsedTargetDirs.issues[0].reason})`);
                    }
                    if (parsedTargetDirs.normalized.length === 0)
                        throw new Error('Please select target directory');
                    const targetDirs = parsedTargetDirs.normalized;
                    const preserve = !!msg.preserve;
                    const conflict = msg.conflict || 'rename';
                    const selected = Array.isArray(msg.selected) ? msg.selected : [];
                    if (selected.length === 0)
                        throw new Error('Please select at least one file');
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: 'GitHub File Puller',
                        cancellable: false
                    }, async (progress) => {
                        let done = 0;
                        const total = selected.length * targetDirs.length;
                        const results = [];
                        for (const targetDir of targetDirs) {
                            for (const relPath of selected) {
                                progress.report({ message: `${targetDir} ← ${relPath}`, increment: (1 / total) * 100 });
                                try {
                                    const file = await (0, github_1.fetchFileContent)(info, relPath, token || undefined, apiBase);
                                    const dst = (0, fs_1.resolveTargetPath)(targetDir, relPath, preserve);
                                    const w = (0, fs_1.writeFileSmart)(dst, file.content, conflict);
                                    if (w.wrote) {
                                        results.push({ ok: true, path: w.path });
                                    }
                                    else {
                                        results.push({ ok: false, path: dst, message: 'Not written due to conflict policy (skip/rename failed)' });
                                    }
                                }
                                catch (e) {
                                    results.push({ ok: false, path: `${targetDir}:${relPath}`, message: e?.message || String(e) });
                                }
                                finally {
                                    done++;
                                }
                            }
                        }
                        const okCnt = results.filter(r => r.ok).length;
                        const failCnt = results.length - okCnt;
                        this.post({ type: 'fetchDone', results });
                        vscode.window.showInformationMessage(`Fetch complete: ${okCnt} succeeded, ${failCnt} failed.`);
                    });
                    break;
                }
            }
        }
        catch (e) {
            const msgText = e?.message || String(e);
            this.post({ type: 'error', message: msgText });
            vscode.window.showErrorMessage(`GitHub File Puller failed: ${msgText}`);
        }
    }
    renderHtml(webview) {
        const nonce = String(Date.now());
        const csp = `default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';`;
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitHub File Puller</title>
  <style>
    :root { --sp: 10px; --radius: 6px; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; background: var(--vscode-editor-background); }
    .card { max-width: 860px; margin: 0 auto; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); border-radius: var(--radius); box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
    .header { padding: 14px var(--sp); border-bottom: 1px solid var(--vscode-panel-border); display: flex; align-items: center; justify-content: space-between; }
    .title { font-size: 16px; font-weight: 600; }
    .container { padding: 14px; display: grid; grid-template-columns: 1fr; gap: var(--sp); }
    label { font-size: 12px; opacity: .9; display: block; margin-bottom: 4px; }
    input[type="text"], select { width: 100%; padding: 8px 10px; box-sizing: border-box; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: var(--radius); }
    .row { display: grid; grid-template-columns: 1fr; gap: var(--sp); }
    .row-inline { display: grid; grid-template-columns: 1fr auto; gap: var(--sp); align-items: end; }
    .toolbar { display: flex; gap: 8px; align-items: center; }
    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 0 12px; height: 28px; line-height: 28px; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: var(--radius); cursor: pointer; }
    .btn:disabled { opacity: .6; cursor: default; }
    .btn-secondary { background: var(--vscode-editorWidget-background); color: var(--vscode-foreground); border-color: var(--vscode-panel-border); }
    .files { border: 1px solid var(--vscode-editorWidget-border); background: var(--vscode-editorWidget-background); border-radius: var(--radius); overflow: hidden; }
    .files-header { display: grid; grid-template-columns: minmax(160px, 1fr) repeat(4, auto) auto; gap: 8px; align-items: center; padding: 8px; border-bottom: 1px solid var(--vscode-editorWidget-border); }
    .files-header input[type="text"] { height: 28px; line-height: 28px; padding: 0 10px; }
    .chips { font-size: 12px; opacity: .85; }
    .list { height: 300px; overflow: auto; padding: 6px 8px; }
    .item { display: grid; grid-template-columns: 14px 18px minmax(0, 1fr); align-items: center; column-gap: 8px; padding: 2px 4px; border-radius: 4px; height: 26px; }
    .item:hover { background: var(--vscode-editor-selectionHighlightBackground, rgba(90, 93, 94, 0.2)); }
    details > summary { height: 26px; border-radius: 4px; display: grid; grid-template-columns: 14px 18px minmax(0, 1fr); align-items: center; column-gap: 8px; }
    details > summary:hover { background: var(--vscode-editor-selectionHighlightBackground, rgba(90, 93, 94, 0.2)); }
    .path { font-family: var(--vscode-editor-font-family); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dirname { font-weight: 600; }
    details.dir > div { margin-left: 24px; padding-left: 0; border-left: 1px dashed var(--vscode-panel-border); }
    .item input[type="checkbox"], summary input[type="checkbox"] { margin: 0; justify-self: center; }
    summary .path, .item .path { min-width: 0; }
    summary input:checked ~ .path, .item input:checked ~ .path { color: var(--vscode-textLink-activeForeground, var(--vscode-foreground)); }
    .options { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .options label { display: inline-flex; align-items: center; gap: 6px; margin: 0; white-space: nowrap; }
    .options select { height: 28px; line-height: 28px; padding: 0 8px; }
    .footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 8px; }
    .status { font-size: 12px; opacity: .8; }
    details > summary { list-style: none; cursor: pointer; padding: 4px; }
    details > summary::-webkit-details-marker { display: none; }
    .twisty { display: inline-block; width: 10px; height: 10px; justify-self: center; transition: transform .12s ease; border-right: 2px solid var(--vscode-foreground); border-bottom: 2px solid var(--vscode-foreground); }
    details:not([open]) > summary .twisty { transform: translateX(-3px) rotate(-45deg); }
    details[open] > summary .twisty { transform: rotate(45deg); }
    .bullet { width: 10px; height: 10px; border-radius: 50%; justify-self: center; background: var(--vscode-descriptionForeground); opacity: .9; }
    .dir { margin-left: 0; }
    .row-inline input[type="text"] { height: 28px; line-height: 28px; padding: 0 10px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="title">GitHub File Puller</div>
    </div>
    <div class="container">
      <div class="row">
        <div>
          <label>Repository</label>
          <input id="repoUrl" type="text" placeholder="owner/repo or https://host/owner/repo">
        </div>
      </div>
      <div class="row-inline">
        <div>
          <label>Branch/Tag (ref)</label>
          <input id="ref" type="text" placeholder="main">
        </div>
        <button class="btn" id="loadTree">Load Tree</button>
      </div>
      <div class="files">
        <div class="files-header">
          <input id="filter" type="text" placeholder="Filter file paths (prefix/contains)">
          <button class="btn btn-secondary" id="selectAll">Select All</button>
          <button class="btn btn-secondary" id="clearAll">Select None</button>
          <button class="btn btn-secondary" id="expandAll">Expand All</button>
          <button class="btn btn-secondary" id="collapseAll">Collapse All</button>
          <div class="chips" id="counts">0/0</div>
        </div>
        <div class="list" id="fileList">Load the file tree first</div>
      </div>
      <div class="row-inline">
        <div>
          <label>Target Directory (comma separated)</label>
          <input id="targetDir" type="text" class="path" placeholder="Choose or enter absolute paths, separated by commas">
        </div>
        <button class="btn btn-secondary" id="pickDir">Browse</button>
      </div>
      <div class="options">
        <label><input id="preserve" type="checkbox" checked> Preserve structure</label>
        <label>Conflict Strategy
          <select id="conflict">
            <option value="rename">Rename</option>
            <option value="overwrite">Overwrite</option>
            <option value="skip">Skip</option>
          </select>
        </label>
      </div>
      <div class="footer">
        <div class="status" id="status"></div>
        <button class="btn" id="fetch" disabled>Fetch</button>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const repoUrl = document.getElementById('repoUrl');
    const ref = document.getElementById('ref');
    const fileList = document.getElementById('fileList');
    const filter = document.getElementById('filter');
    const selectAllBtn = document.getElementById('selectAll');
    const clearAllBtn = document.getElementById('clearAll');
    const expandAllBtn = document.getElementById('expandAll');
    const collapseAllBtn = document.getElementById('collapseAll');
    const counts = document.getElementById('counts');
    const targetDir = document.getElementById('targetDir');
    const preserve = document.getElementById('preserve');
    const conflict = document.getElementById('conflict');
    const loadTree = document.getElementById('loadTree');
    const pickDir = document.getElementById('pickDir');
    const fetchBtn = document.getElementById('fetch');
    const status = document.getElementById('status');

    const state = { files: [], selected: new Set(), tree: null, openDirs: new Set(), syncTimer: null };
    function splitDirs(value) {
      return (value || '').split(',').map(v => v.trim()).filter(Boolean);
    }
    function uniqueDirs(value) {
      const arr = splitDirs(value);
      return Array.from(new Set(arr)).join(',');
    }
    function scheduleSyncTargetDirs() {
      if (state.syncTimer) clearTimeout(state.syncTimer);
      state.syncTimer = setTimeout(() => {
        vscode.postMessage({ type: 'syncTargetDirs', value: targetDir.value });
      }, 250);
    }
    function captureOpenDirs() {
      const arr = Array.from(fileList.querySelectorAll('details.dir[open]'));
      const s = new Set();
      for (const d of arr) {
        const p = d.getAttribute('data-path');
        if (p) s.add(p);
      }
      state.openDirs = s;
    }
    function buildTree(paths) {
      const root = { n: '', t: 'dir', c: new Map(), p: null, x: true, path: '' };
      for (const p of paths) {
        const parts = p.split('/');
        let cur = root;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const leaf = i === parts.length - 1;
          let child = cur.c.get(part);
          if (!child) {
            child = leaf ? { n: part, t: 'file', p: cur, path: parts.slice(0, i + 1).join('/') } : { n: part, t: 'dir', c: new Map(), p: cur, x: false, path: parts.slice(0, i + 1).join('/') };
            cur.c.set(part, child);
          }
          cur = child;
        }
      }
      return root;
    }
    function sumSelected(node) {
      if (!node) return { total: 0, sel: 0 };
      if (node.t === 'file') return { total: 1, sel: state.selected.has(node.path) ? 1 : 0 };
      let total = 0, sel = 0;
      for (const ch of node.c.values()) {
        const r = sumSelected(ch);
        total += r.total;
        sel += r.sel;
      }
      return { total, sel };
    }
    function shouldShowNode(node, q) {
      if (!q) return true;
      if (node.t === 'file') return node.path.toLowerCase().includes(q);
      for (const ch of node.c.values()) {
        if (shouldShowNode(ch, q)) return true;
      }
      return false;
    }
    function updateCounts() {
      counts.textContent = state.selected.size + '/' + state.files.length;
    }
    function updateActions() {
      fetchBtn.disabled = state.selected.size === 0 || splitDirs(targetDir.value).length === 0;
      selectAllBtn.disabled = state.files.length === 0;
      clearAllBtn.disabled = state.selected.size === 0;
      expandAllBtn.disabled = state.files.length === 0;
      collapseAllBtn.disabled = state.files.length === 0;
    }
    function renderFiles() {
      captureOpenDirs();
      if (!state.files.length) {
        fileList.textContent = 'No files';
        updateCounts();
        updateActions();
        return;
      }
      if (!state.tree) state.tree = buildTree(state.files);
      const q = (filter.value || '').trim().toLowerCase();
      function renderNode(node) {
        if (!shouldShowNode(node, q)) return null;
        if (node.t === 'file') {
          const row = document.createElement('div');
          row.className = 'item file';
          const bullet = document.createElement('span');
          bullet.className = 'bullet';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = state.selected.has(node.path);
          cb.addEventListener('change', () => {
            if (cb.checked) state.selected.add(node.path); else state.selected.delete(node.path);
            renderFiles();
          });
          const span = document.createElement('span');
          span.textContent = node.path;
          span.className = 'path';
          row.appendChild(bullet);
          row.appendChild(cb);
          row.appendChild(span);
          return row;
        } else {
          const det = document.createElement('details');
          det.className = 'dir';
          det.setAttribute('data-path', node.path || '');
          det.open = q ? true : (state.openDirs.size ? state.openDirs.has(node.path || '') : node.x);
          det.addEventListener('toggle', () => {
            const p = node.path || '';
            if (det.open) state.openDirs.add(p); else state.openDirs.delete(p);
          });
          const sum = document.createElement('summary');
          const twist = document.createElement('span');
          twist.className = 'twisty';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          const s = sumSelected(node);
          if (s.sel === 0) cb.checked = false;
          if (s.sel === s.total && s.total !== 0) cb.checked = true;
          if (s.sel > 0 && s.sel < s.total) cb.indeterminate = true;
          cb.addEventListener('change', () => {
            const check = cb.checked;
            function visit(n) {
              if (n.t === 'file') {
                if (check) state.selected.add(n.path); else state.selected.delete(n.path);
              } else {
                for (const c of n.c.values()) visit(c);
              }
            }
            visit(node);
            renderFiles();
          });
          const label = document.createElement('span');
          label.textContent = node.n || '/';
          label.className = 'path dirname';
          sum.appendChild(twist);
          sum.appendChild(cb);
          sum.appendChild(label);
          det.appendChild(sum);
          const wrap = document.createElement('div');
          for (const ch of node.c.values()) {
            const el = renderNode(ch);
            if (el) wrap.appendChild(el);
          }
          det.appendChild(wrap);
          return det;
        }
      }
      const root = state.tree;
      const container = document.createElement('div');
      for (const ch of root.c.values()) {
        const el = renderNode(ch);
        if (el) container.appendChild(el);
      }
      fileList.innerHTML = '';
      fileList.appendChild(container);
      updateCounts();
      updateActions();
    }
    filter.addEventListener('input', () => {
      renderFiles();
    });
    selectAllBtn.addEventListener('click', () => {
      state.files.forEach(p => state.selected.add(p));
      renderFiles();
    });
    clearAllBtn.addEventListener('click', () => {
      state.selected.clear();
      renderFiles();
    });
    expandAllBtn.addEventListener('click', () => {
      const ds = fileList.querySelectorAll('details');
      ds.forEach(d => d.open = true);
      renderFiles();
    });
    collapseAllBtn.addEventListener('click', () => {
      const ds = fileList.querySelectorAll('details');
      ds.forEach(d => d.open = false);
      renderFiles();
    });
    loadTree.addEventListener('click', () => {
      status.textContent = 'Loading…';
      vscode.postMessage({ type: 'loadTree', repoUrl: repoUrl.value, ref: ref.value });
    });
    pickDir.addEventListener('click', () => {
      vscode.postMessage({ type: 'selectTargetDir', currentValue: targetDir.value });
    });
    targetDir.addEventListener('input', () => {
      targetDir.value = uniqueDirs(targetDir.value);
      scheduleSyncTargetDirs();
      updateActions();
    });
    targetDir.addEventListener('blur', () => {
      targetDir.value = uniqueDirs(targetDir.value);
      vscode.postMessage({ type: 'syncTargetDirs', value: targetDir.value });
      updateActions();
    });
    fetchBtn.addEventListener('click', () => {
      status.textContent = 'Fetching…';
      vscode.postMessage({
        type: 'fetchFiles',
        repoUrl: repoUrl.value,
        ref: ref.value,
        targetDir: targetDir.value,
        preserve: preserve.checked,
        conflict: conflict.value,
        selected: Array.from(state.selected)
      });
    });
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'defaults') {
        ref.value = msg.defaultRef || '';
        preserve.checked = !!msg.preserve;
        conflict.value = msg.conflict || 'rename';
        if (typeof msg.defaultTargetDirs === 'string') targetDir.value = msg.defaultTargetDirs;
        if (!repoUrl.value) repoUrl.value = 'https://github.com/nafei-zhang/devx_instruction_extention';
        updateActions();
      } else if (msg.type === 'loading') {
        status.textContent = msg.text || 'Loading…';
      } else if (msg.type === 'treeLoaded') {
        state.files = msg.files || [];
        state.selected = new Set();
        state.tree = null;
        status.textContent = 'File tree loaded';
        renderFiles();
      } else if (msg.type === 'targetDir') {
        targetDir.value = msg.path || '';
        status.textContent = 'Target directories updated';
        updateActions();
      } else if (msg.type === 'targetDirsSynced') {
        targetDir.value = msg.value || '';
        status.textContent = 'Target directories synced';
        updateActions();
      } else if (msg.type === 'fetchDone') {
        status.textContent = 'Fetch complete';
      } else if (msg.type === 'error') {
        status.textContent = 'Error: ' + msg.message;
      }
    });
  </script>
</body>
</html>`;
    }
}
exports.FetchPanel = FetchPanel;
//# sourceMappingURL=fetchPanel.js.map