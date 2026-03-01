import * as vscode from 'vscode';
import { fetchRepoTreeWithApi, parseRepoUrl, fetchFileContent, deriveApiBase } from '../github';
import { resolveTargetPath, writeFileSmart } from '../utils/fs';
import { getSecretToken } from '../secrets';

export class FetchPanel {
  private panel: vscode.WebviewPanel | null = null;
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  public show() {
    if (this.panel) {
      this.panel.reveal();
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      'githubPuller.fetchPanel',
      'GitHub File Puller',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    this.panel.webview.html = this.renderHtml(this.panel.webview);
    this.panel.onDidDispose(() => (this.panel = null));
    this.panel.webview.onDidReceiveMessage((msg: WebviewInMessage) => this.handleMessage(msg));
    // Push defaults
    const cfg = vscode.workspace.getConfiguration();
    this.post({
      type: 'defaults',
      defaultRef: cfg.get<string>('githubPuller.defaultRef') || 'main',
      preserve: cfg.get<boolean>('githubPuller.preserveStructure') ?? true,
      conflict: cfg.get<string>('githubPuller.conflictResolution') || 'rename',
      defaultTargetDir: cfg.get<string>('githubPuller.defaultTargetDir') || ''
    });
  }

  private post(message: WebviewOutMessage) {
    this.panel?.webview.postMessage(message);
  }

  private async handleMessage(msg: WebviewInMessage) {
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
          this.post({ type: 'targetDir', path: p || '' });
          break;
        }
        case 'loadTree': {
          const cfg = vscode.workspace.getConfiguration();
          const defaultRef = cfg.get<string>('githubPuller.defaultRef') || 'main';
          const info = parseRepoUrl(msg.repoUrl, msg.ref || defaultRef);
          const token = (await getSecretToken(this.ctx.secrets)) || (cfg.get<string>('githubPuller.token') || '');
          const baseUrl = cfg.get<string>('githubPuller.baseUrl') || 'https://github.com';
          const apiBaseOverride = cfg.get<string>('githubPuller.apiBaseUrl') || '';
          const apiBase = deriveApiBase(baseUrl, apiBaseOverride);
          this.post({ type: 'loading', text: 'Loading file tree…' });
          const tree = await fetchRepoTreeWithApi(info, token || undefined, apiBase);
          const files = tree.filter(t => t.type === 'blob').map(t => t.path);
          this.post({ type: 'treeLoaded', files });
          break;
        }
        case 'fetchFiles': {
          const cfg = vscode.workspace.getConfiguration();
          const defaultRef = cfg.get<string>('githubPuller.defaultRef') || 'main';
          const info = parseRepoUrl(msg.repoUrl, msg.ref || defaultRef);
          const token = (await getSecretToken(this.ctx.secrets)) || (cfg.get<string>('githubPuller.token') || '');
          const baseUrl = cfg.get<string>('githubPuller.baseUrl') || 'https://github.com';
          const apiBaseOverride = cfg.get<string>('githubPuller.apiBaseUrl') || '';
          const apiBase = deriveApiBase(baseUrl, apiBaseOverride);
          const targetDir: string = msg.targetDir;
          if (!targetDir) throw new Error('Please select target directory');
          const preserve: boolean = !!msg.preserve;
          const conflict: 'overwrite' | 'skip' | 'rename' = msg.conflict || 'rename';
          const selected: string[] = Array.isArray(msg.selected) ? msg.selected : [];
          if (selected.length === 0) throw new Error('Please select at least one file');

          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'GitHub File Puller',
              cancellable: false
            },
            async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
              let done = 0;
              const total = selected.length;
              const results: { ok: boolean; path: string; message?: string }[] = [];
              for (const relPath of selected) {
                progress.report({ message: `${relPath}`, increment: (1 / total) * 100 });
                try {
                  const file = await fetchFileContent(info, relPath, token || undefined, apiBase);
                  const dst = resolveTargetPath(targetDir, relPath, preserve);
                  const w = writeFileSmart(dst, file.content, conflict);
                  if (w.wrote) {
                    results.push({ ok: true, path: w.path! });
                  } else {
                    results.push({ ok: false, path: dst, message: 'Not written due to conflict policy (skip/rename failed)' });
                  }
                } catch (e: any) {
                  results.push({ ok: false, path: relPath, message: e?.message || String(e) });
                } finally {
                  done++;
                }
              }
              const okCnt = results.filter(r => r.ok).length;
              const failCnt = results.length - okCnt;
              this.post({ type: 'fetchDone', results });
              vscode.window.showInformationMessage(`Fetch complete: ${okCnt} succeeded, ${failCnt} failed.`);
            }
          );
          break;
        }
      }
    } catch (e: any) {
      const msgText = e?.message || String(e);
      this.post({ type: 'error', message: msgText });
      vscode.window.showErrorMessage(`GitHub File Puller failed: ${msgText}`);
    }
  }

  private renderHtml(webview: vscode.Webview): string {
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
    .item { display: flex; align-items: center; gap: 8px; padding: 2px 4px; border-radius: 4px; height: 26px; }
    .item:hover { background: var(--vscode-editor-selectionHighlightBackground, rgba(90, 93, 94, 0.2)); }
    details > summary { height: 26px; border-radius: 4px; }
    details > summary:hover { background: var(--vscode-editor-selectionHighlightBackground, rgba(90, 93, 94, 0.2)); }
    .path { font-family: var(--vscode-editor-font-family); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dirname { font-weight: 600; }
    .file .path::before { content: '•'; display: inline-block; width: 10px; margin-right: 6px; color: var(--vscode-descriptionForeground); }
    details.dir > div { margin-left: 18px; padding-left: 10px; border-left: 1px dashed var(--vscode-panel-border); }
    .item input[type="checkbox"], summary input[type="checkbox"] { margin-right: 6px; }
    summary .path, .item .path { min-width: 0; }
    summary input:checked + .path, .item input:checked + .path { color: var(--vscode-textLink-activeForeground, var(--vscode-foreground)); }
    .options { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .options label { display: inline-flex; align-items: center; gap: 6px; margin: 0; white-space: nowrap; }
    .options select { height: 28px; line-height: 28px; padding: 0 8px; }
    .footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 8px; }
    .status { font-size: 12px; opacity: .8; }
    details > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 4px; }
    details > summary::-webkit-details-marker { display: none; }
    .twisty { display: inline-block; width: 10px; height: 10px; transform: rotate(0deg); transition: transform .12s ease; border-right: 2px solid var(--vscode-foreground); border-bottom: 2px solid var(--vscode-foreground); transform: rotate(-45deg); margin-right: 4px; }
    details[open] > summary .twisty { transform: rotate(45deg); }
    .dir { margin-left: 12px; }
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
          <label>Target Directory</label>
          <input id="targetDir" type="text" class="path" placeholder="Choose or enter an absolute path">
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

    const state = { files: [], selected: new Set(), tree: null, openDirs: new Set() };
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
      fetchBtn.disabled = state.selected.size === 0 || !targetDir.value;
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
      vscode.postMessage({ type: 'selectTargetDir' });
    });
    targetDir.addEventListener('input', () => {
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
        if (msg.defaultTargetDir) targetDir.value = msg.defaultTargetDir;
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

type WebviewInMessage =
  | { type: 'selectTargetDir' }
  | { type: 'loadTree'; repoUrl: string; ref?: string }
  | { type: 'fetchFiles'; repoUrl: string; ref?: string; targetDir: string; preserve: boolean; conflict: 'overwrite' | 'skip' | 'rename'; selected: string[] };

type WebviewOutMessage =
  | { type: 'defaults'; defaultRef: string; preserve: boolean; conflict: string; defaultTargetDir: string }
  | { type: 'loading'; text: string }
  | { type: 'treeLoaded'; files: string[] }
  | { type: 'targetDir'; path: string }
  | { type: 'fetchDone'; results: { ok: boolean; path: string; message?: string }[] }
  | { type: 'error'; message: string };
