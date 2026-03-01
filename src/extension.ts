import * as vscode from 'vscode';
import { FetchPanel } from './webview/fetchPanel';
import { getSecretToken, setSecretToken } from './secrets';

export function activate(context: vscode.ExtensionContext) {
  // Status bar quick entry
  const cfg = vscode.workspace.getConfiguration();
  const createStatusBar = () => {
    const show = cfg.get<boolean>('githubPuller.showStatusBar') ?? true;
    if (!show) return;
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    item.text = '$(cloud-download) GitHub Puller';
    item.tooltip = 'Open GitHub File Puller';
    item.command = 'githubPuller.fetchFiles';
    item.show();
    context.subscriptions.push(item);
  };
  createStatusBar();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('githubPuller.showStatusBar')) {
        // Recreate on toggle
        createStatusBar();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('githubPuller.fetchFiles', async () => {
      const panel = new FetchPanel(context);
      panel.show();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('githubPuller.setToken', async () => {
      const token = await vscode.window.showInputBox({
        title: 'Enter GitHub Token (securely stored in Secret Storage)',
        prompt: 'Repo read access is sufficient; leave empty to clear.',
        password: true,
        ignoreFocusOut: true
      });
      if (token === undefined) {
        return;
      }
      if (!token) {
        await setSecretToken(context.secrets, undefined);
        vscode.window.showInformationMessage('Cleared Token from Secret Storage.');
      } else {
        await setSecretToken(context.secrets, token);
        vscode.window.showInformationMessage('Token saved to Secret Storage.');
      }
    })
  );
}

export function deactivate() {
  // no-op
}
