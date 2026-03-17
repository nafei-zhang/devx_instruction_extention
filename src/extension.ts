import * as vscode from 'vscode';
import { FetchPanel } from './webview/fetchPanel';
import { getSecretToken, setSecretToken } from './secrets';
import { deriveApiBase, fetchFileContent, fetchRepoTreeWithApi, parseRepoUrl } from './github';
import { parseTargetDirs, splitTargetDirs } from './utils/targetDirs';
import { pickToken, resolveSyncTargets, splitSyncPaths, expandSelectedRepoPaths } from './utils/sync';
import { prepareGithubDir, resolveTargetPath, writeFileSmart } from './utils/fs';

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('GitHub Puller Sync');
  context.subscriptions.push(output);
  const fallbackKey = (key: string) => `githubPuller.fallback.${key}`;
  const getSetting = <T>(key: string, defaultValue?: T): T | undefined => {
    const cfgValue = vscode.workspace.getConfiguration().get<T>(key);
    if (cfgValue !== undefined) return cfgValue;
    const workspaceValue = context.workspaceState.get<T>(fallbackKey(key));
    if (workspaceValue !== undefined) return workspaceValue;
    const globalValue = context.globalState.get<T>(fallbackKey(key));
    if (globalValue !== undefined) return globalValue;
    return defaultValue;
  };

  const setTokenCommand = async () => {
    const token = await vscode.window.showInputBox({
      title: 'Enter GitHub Token (securely stored in Secret Storage)',
      prompt: 'Repo read access is sufficient; leave empty to clear.',
      password: true,
      ignoreFocusOut: true
    });
    if (token === undefined) return;
    if (!token) {
      await setSecretToken(context.secrets, undefined);
      vscode.window.showInformationMessage('Cleared Token from Secret Storage.');
      return;
    }
    await setSecretToken(context.secrets, token);
    vscode.window.showInformationMessage('Token saved to Secret Storage.');
  };

  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.command = 'githubPuller.runAutoSync';
  statusItem.tooltip = 'Run Puller Auto Sync';

  const setSyncVisual = (busy: boolean, text?: string) => {
    statusItem.text = busy ? '$(sync~spin) Puller Sync' : '$(cloud-download) Puller Sync';
    statusItem.backgroundColor = busy ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    statusItem.tooltip = text || 'Run Puller Auto Sync';
  };

  const openConfigPanel = () => {
    const panel = new FetchPanel(context);
    panel.show();
  };

  const runAutoSync = async () => {
    const repoUrl = (getSetting<string>('githubPuller.syncRepoUrl', '') || '').trim();
    const ref = (getSetting<string>('githubPuller.syncRef', getSetting<string>('githubPuller.defaultRef', 'main') || 'main') || 'main').trim();
    const paths = splitSyncPaths(getSetting<string>('githubPuller.syncPaths', '') || '');
    let token = pickToken(await getSecretToken(context.secrets), getSetting<string>('githubPuller.token', '') || '');

    if (!token) {
      await vscode.commands.executeCommand('githubPuller.setToken');
      token = pickToken(await getSecretToken(context.secrets), getSetting<string>('githubPuller.token', '') || '');
      if (!token) {
        setSyncVisual(false, 'Configure Puller Sync');
        vscode.window.showWarningMessage('Token is required before syncing. Please set token and try again.');
        return;
      }
    }

    if (!repoUrl) {
      setSyncVisual(false, 'Configure Puller Sync');
      openConfigPanel();
      const missing: string[] = [];
      if (!repoUrl) missing.push('repository');
      vscode.window.showWarningMessage(`Please complete Puller Config (${missing.join(', ')}) and click Save Config before syncing.`);
      return;
    }
    const workspaceRoots = (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath);
    if (workspaceRoots.length === 0) {
      setSyncVisual(false, 'Open project first');
      const action = await vscode.window.showWarningMessage(
        'No valid project environment is detected. Please open a project folder or workspace before running sync.',
        { modal: true },
        'Open Project'
      );
      if (action === 'Open Project') {
        await vscode.commands.executeCommand('vscode.openFolder');
      }
      return;
    }

    setSyncVisual(true, 'Sync in progress');
    try {
      const configuredTargets = splitTargetDirs(getSetting<string>('githubPuller.targetDirs', '') || getSetting<string>('githubPuller.defaultTargetDir', '') || '');
      const targetResolution = resolveSyncTargets(configuredTargets, workspaceRoots);
      const targetRoots = targetResolution.targets;
      if (targetRoots.length === 0) {
        setSyncVisual(false, 'Configure Puller Sync');
        openConfigPanel();
        vscode.window.showWarningMessage('No sync target found. Open a workspace or configure target directories in Puller Config.');
        return;
      }
      const invalidTargets = parseTargetDirs(targetRoots.join(','), { requireAbsolute: true, requireExists: false });
      if (invalidTargets.issues.length > 0) {
        throw new Error(`Invalid target directories: ${invalidTargets.issues.map(i => `${i.path}(${i.reason})`).join(', ')}`);
      }
      output.appendLine(`[sync] targetSource=${targetResolution.source}`);
      output.appendLine('[preflight] ensuring .github in all target roots');
      const preparedTargets: Array<{ targetRoot: string; githubDir: string }> = [];
      for (const targetRoot of targetRoots) {
        try {
          const result = await prepareGithubDir(targetRoot);
          preparedTargets.push({ targetRoot: result.targetRoot, githubDir: result.githubDir });
          output.appendLine(`[preflight] ${result.status === 'exists' ? 'exists' : 'created'} ${result.githubDir}`);
        } catch (e: any) {
          const message = e?.message || String(e);
          output.appendLine(`[preflight] failed ${targetRoot} : ${message}`);
          throw e;
        }
      }
      const baseUrl = getSetting<string>('githubPuller.baseUrl', 'https://alm-github.com.hsbc/') || 'https://alm-github.com.hsbc/';
      const apiBase = deriveApiBase(baseUrl, getSetting<string>('githubPuller.apiBaseUrl', '') || '');
      const repo = parseRepoUrl(repoUrl, ref);
      output.appendLine(`[sync] repo=${repo.owner}/${repo.repo} ref=${repo.ref}`);
      output.appendLine(`[sync] targetRoots=${targetRoots.join(',')}`);
      const tree = await fetchRepoTreeWithApi(repo, token || undefined, apiBase);
      const allFiles = tree.filter(t => t.type === 'blob').map(t => t.path);
      const expanded = paths.length === 0
        ? { files: allFiles, issues: [] as Array<{ value: string; reason: string }> }
        : expandSelectedRepoPaths(allFiles, paths);
      if (expanded.files.length === 0) {
        if (paths.length === 0) throw new Error('No files found in repository tree');
        throw new Error(`No files matched by sync paths: ${paths.join(', ')}`);
      }
      if (paths.length === 0) output.appendLine('[sync] sync paths not configured, syncing all repository files');
      if (expanded.issues.length > 0) {
        output.appendLine(`[sync] unmatched paths=${expanded.issues.map(i => i.value).join(',')}`);
      }
      const preserve = getSetting<boolean>('githubPuller.preserveStructure', true) ?? true;
      const conflict: 'overwrite' | 'skip' | 'rename' = (getSetting<string>('githubPuller.conflictResolution', 'overwrite') as any) || 'overwrite';
      let ok = 0;
      let fail = 0;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Puller Sync', cancellable: false },
        async progress => {
          const total = expanded.files.length * preparedTargets.length;
          let done = 0;
          for (const target of preparedTargets) {
            for (const repoPath of expanded.files) {
              done++;
              progress.report({ increment: (1 / total) * 100, message: `${repoPath}` });
              try {
                const file = await fetchFileContent(repo, repoPath, token || undefined, apiBase);
                const dest = resolveTargetPath(target.githubDir, repoPath, preserve);
                const result = writeFileSmart(dest, file.content, conflict);
                if (!result.wrote) {
                  fail++;
                  output.appendLine(`[skip] ${repoPath} -> ${dest}`);
                } else {
                  ok++;
                  output.appendLine(`[ok] ${repoPath} -> ${result.path || dest}`);
                }
              } catch (e: any) {
                fail++;
                output.appendLine(`[fail] ${repoPath} -> ${target.githubDir} : ${e?.message || String(e)}`);
              }
            }
          }
        }
      );
      if (fail === 0) {
        vscode.window.showInformationMessage(`Puller Sync succeeded: ${ok} succeeded, ${fail} failed.`);
      } else if (ok === 0) {
        vscode.window.showErrorMessage(`Puller Sync failed: ${ok} succeeded, ${fail} failed.`);
      } else {
        vscode.window.showWarningMessage(`Puller Sync partially succeeded: ${ok} succeeded, ${fail} failed.`);
      }
      setSyncVisual(false, `Last sync: ${ok} ok, ${fail} failed`);
    } catch (e: any) {
      const message = e?.message || String(e);
      output.appendLine(`[error] ${message}`);
      setSyncVisual(false, `Sync failed: ${message}`);
      vscode.window.showErrorMessage(`Puller Sync failed: ${message}`);
      throw e;
    } finally {
      if (!statusItem.tooltip?.toString().startsWith('Last sync')) {
        setSyncVisual(false);
      }
    }
  };

  const updateStatusBarVisibility = () => {
    const show = getSetting<boolean>('githubPuller.showStatusBar', true) ?? true;
    if (!show) {
      statusItem.hide();
      return;
    }
    setSyncVisual(false);
    statusItem.show();
  };
  updateStatusBarVisibility();
  context.subscriptions.push(statusItem);
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('githubPuller.showStatusBar')) updateStatusBarVisibility();
  }));

  context.subscriptions.push(
    vscode.commands.registerCommand('githubPuller.fetchFiles', async () => {
      const panel = new FetchPanel(context);
      panel.show();
    })
  );

  context.subscriptions.push(vscode.commands.registerCommand('githubPuller.runAutoSync', runAutoSync));

  context.subscriptions.push(
    vscode.commands.registerCommand('githubPuller.setToken', setTokenCommand)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('githubPuller.configureToken', setTokenCommand)
  );
}

export function deactivate() {
  // no-op
}
