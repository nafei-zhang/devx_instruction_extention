import * as vscode from 'vscode';
import { fetchRepoTreeWithApi, parseRepoUrl, deriveApiBase } from '../github';
import { getSecretToken } from '../secrets';
import { appendTargetDir, parseTargetDirs, readTargetDirsFromConfig, serializeTargetDirs, writeTargetDirsToConfig } from '../utils/targetDirs';
import { renderFetchPanelHtml } from './fetchPanelTemplate';

export class FetchPanel {
  private panel: vscode.WebviewPanel | null = null;
  private cfgWatcher: vscode.Disposable | null = null;
  constructor(private readonly ctx: vscode.ExtensionContext) {}
  private getConfigWriter() {
    const cfg = vscode.workspace.getConfiguration();
    const target = vscode.workspace.workspaceFolders?.length ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    return {
      get<T>(key: string): T | undefined {
        return cfg.get<T>(key);
      },
      update(key: string, value: unknown) {
        return cfg.update(key, value, target);
      }
    };
  }

  public show() {
    if (this.panel) {
      this.panel.reveal();
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      'githubPuller.fetchPanel',
      'Puller Config',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    this.panel.webview.html = renderFetchPanelHtml(this.ctx.extensionUri, this.panel.webview);
    this.panel.onDidDispose(() => {
      this.panel = null;
      this.cfgWatcher?.dispose();
      this.cfgWatcher = null;
    });
    this.panel.webview.onDidReceiveMessage((msg: WebviewInMessage) => this.handleMessage(msg));
    this.pushDefaults();
    this.cfgWatcher = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('githubPuller.targetDirs') || e.affectsConfiguration('githubPuller.defaultTargetDir')) {
        this.pushDefaults();
      }
    });
  }

  private post(message: WebviewOutMessage) {
    this.panel?.webview.postMessage(message);
  }

  private pushDefaults() {
    const cfg = vscode.workspace.getConfiguration();
    const configured = readTargetDirsFromConfig(cfg);
    this.post({
      type: 'defaults',
      defaultRepoUrl: cfg.get<string>('githubPuller.syncRepoUrl') || '',
      defaultRef: cfg.get<string>('githubPuller.syncRef') || cfg.get<string>('githubPuller.defaultRef') || 'main',
      defaultSyncPaths: cfg.get<string>('githubPuller.syncPaths') || '',
      preserve: cfg.get<boolean>('githubPuller.preserveStructure') ?? true,
      conflict: cfg.get<string>('githubPuller.conflictResolution') || 'rename',
      defaultTargetDirs: configured
    });
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
          if (!p) break;
          const writableCfg = this.getConfigWriter();
          const currentInput = msg.currentValue || readTargetDirsFromConfig(writableCfg);
          const appended = appendTargetDir(currentInput, p, { requireAbsolute: true, requireExists: true });
          if (appended.issues.length > 0) {
            throw new Error(`Invalid target path: ${appended.issues[0].path} (${appended.issues[0].reason})`);
          }
          const serialized = serializeTargetDirs(appended.normalized);
          await writeTargetDirsToConfig(writableCfg, serialized);
          this.post({ type: 'targetDir', path: serialized });
          break;
        }
        case 'syncTargetDirs': {
          const writableCfg = this.getConfigWriter();
          const parsed = parseTargetDirs(msg.value || '', { requireAbsolute: true, requireExists: false });
          if (parsed.issues.length > 0) {
            throw new Error(parsed.issues.map(i => `${i.path || '<empty>'}: ${i.reason}`).join('; '));
          }
          const serialized = serializeTargetDirs(parsed.normalized);
          await writeTargetDirsToConfig(writableCfg, serialized);
          this.post({ type: 'targetDirsSynced', value: serialized });
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
        case 'saveConfig': {
          const cfg = vscode.workspace.getConfiguration();
          const defaultRef = cfg.get<string>('githubPuller.defaultRef') || 'main';
          const info = parseRepoUrl(msg.repoUrl, msg.ref || defaultRef);
          const parsedTargetDirs = parseTargetDirs(msg.targetDir || '', { requireAbsolute: true, requireExists: true });
          if (parsedTargetDirs.issues.length > 0) {
            throw new Error(`Invalid target directory: ${parsedTargetDirs.issues[0].path} (${parsedTargetDirs.issues[0].reason})`);
          }
          if (parsedTargetDirs.normalized.length === 0) throw new Error('Please select target directory for sync');
          const selected: string[] = Array.isArray(msg.selected) ? msg.selected : [];
          const normalizedSelected = Array.from(new Set(selected.map(s => s.trim()).filter(Boolean)));
          if (normalizedSelected.length === 0) throw new Error('Please select at least one file');
          const writableCfg = this.getConfigWriter();
          await writableCfg.update('githubPuller.syncRepoUrl', (msg.repoUrl || '').trim());
          await writableCfg.update('githubPuller.syncRef', info.ref);
          await writableCfg.update('githubPuller.syncPaths', normalizedSelected.join(','));
          await writableCfg.update('githubPuller.preserveStructure', !!msg.preserve);
          await writableCfg.update('githubPuller.conflictResolution', msg.conflict || 'rename');
          const serialized = serializeTargetDirs(parsedTargetDirs.normalized);
          await writeTargetDirsToConfig(writableCfg, serialized);
          this.post({ type: 'configSaved' });
          vscode.window.showInformationMessage('Puller sync config saved.');
          break;
        }
        case 'setToken': {
          await vscode.commands.executeCommand('githubPuller.setToken');
          break;
        }
      }
    } catch (e: any) {
      const msgText = e?.message || String(e);
      this.post({ type: 'error', message: msgText });
      vscode.window.showErrorMessage(`GitHub File Puller failed: ${msgText}`);
    }
  }

}

type WebviewInMessage =
  | { type: 'selectTargetDir'; currentValue?: string }
  | { type: 'syncTargetDirs'; value: string }
  | { type: 'setToken' }
  | { type: 'loadTree'; repoUrl: string; ref?: string }
  | { type: 'saveConfig'; repoUrl: string; ref?: string; targetDir: string; preserve: boolean; conflict: 'overwrite' | 'skip' | 'rename'; selected: string[] };

type WebviewOutMessage =
  | { type: 'defaults'; defaultRepoUrl: string; defaultRef: string; defaultSyncPaths: string; preserve: boolean; conflict: string; defaultTargetDirs: string }
  | { type: 'loading'; text: string }
  | { type: 'treeLoaded'; files: string[] }
  | { type: 'targetDir'; path: string }
  | { type: 'targetDirsSynced'; value: string }
  | { type: 'configSaved' }
  | { type: 'error'; message: string };
