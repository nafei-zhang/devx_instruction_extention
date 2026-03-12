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
    const cfg = vscode.workspace.getConfiguration();
    const repoUrl = (cfg.get<string>('githubPuller.syncRepoUrl') || '').trim();
    const ref = (cfg.get<string>('githubPuller.syncRef') || cfg.get<string>('githubPuller.defaultRef') || 'main').trim();
    const paths = splitSyncPaths(cfg.get<string>('githubPuller.syncPaths') || '');
    const token = pickToken(await getSecretToken(context.secrets), cfg.get<string>('githubPuller.token') || '');

    if (!token || !repoUrl || paths.length === 0) {
      setSyncVisual(false, 'Configure Puller Sync');
      openConfigPanel();
      if (!token) {
        await vscode.commands.executeCommand('githubPuller.setToken');
      }
      const missing: string[] = [];
      if (!token) missing.push('token');
      if (!repoUrl) missing.push('repository');
      if (paths.length === 0) missing.push('sync paths');
      vscode.window.showWarningMessage(`Please complete Puller Config (${missing.join(', ')}) and click Save Config before syncing.`);
      return;
    }

    setSyncVisual(true, 'Sync in progress');
    try {
      const configuredTargets = splitTargetDirs(cfg.get<string>('githubPuller.targetDirs') || cfg.get<string>('githubPuller.defaultTargetDir') || '');
      const workspaceRoots = (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath);
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
      const baseUrl = cfg.get<string>('githubPuller.baseUrl') || 'https://github.com';
      const apiBase = deriveApiBase(baseUrl, cfg.get<string>('githubPuller.apiBaseUrl') || '');
      const repo = parseRepoUrl(repoUrl, ref);
      output.appendLine(`[sync] repo=${repo.owner}/${repo.repo} ref=${repo.ref}`);
      output.appendLine(`[sync] targetRoots=${targetRoots.join(',')}`);
      const tree = await fetchRepoTreeWithApi(repo, token || undefined, apiBase);
      const allFiles = tree.filter(t => t.type === 'blob').map(t => t.path);
      const expanded = expandSelectedRepoPaths(allFiles, paths);
      if (expanded.files.length === 0) {
        throw new Error(`No files matched by sync paths: ${paths.join(', ')}`);
      }
      if (expanded.issues.length > 0) {
        output.appendLine(`[sync] unmatched paths=${expanded.issues.map(i => i.value).join(',')}`);
      }
      const preserve = cfg.get<boolean>('githubPuller.preserveStructure') ?? true;
      const conflict: 'overwrite' | 'skip' | 'rename' = (cfg.get<string>('githubPuller.conflictResolution') as any) || 'rename';
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
      vscode.window.showInformationMessage(`Puller Sync complete: ${ok} succeeded, ${fail} failed.`);
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
    const show = vscode.workspace.getConfiguration().get<boolean>('githubPuller.showStatusBar') ?? true;
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
