import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

let cachedTemplate: string | null = null;

function readTemplate(extensionUri: vscode.Uri): string {
  if (cachedTemplate) return cachedTemplate;
  const filePath = path.join(extensionUri.fsPath, 'src', 'webview', 'fetchPanel.html');
  cachedTemplate = fs.readFileSync(filePath, 'utf8');
  return cachedTemplate;
}

export function renderFetchPanelHtml(extensionUri: vscode.Uri, webview: vscode.Webview): string {
  const nonce = String(Date.now());
  const csp = `default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';`;
  return readTemplate(extensionUri)
    .split('__CSP__').join(csp)
    .split('__NONCE__').join(nonce);
}
