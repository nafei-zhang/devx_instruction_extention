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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fetchPanel_1 = require("./webview/fetchPanel");
const secrets_1 = require("./secrets");
const github_1 = require("./github");
const targetDirs_1 = require("./utils/targetDirs");
const sync_1 = require("./utils/sync");
const fs_1 = require("./utils/fs");
function activate(context) {
    const output = vscode.window.createOutputChannel('GitHub Puller Sync');
    context.subscriptions.push(output);
    const fallbackKey = (key) => `githubPuller.fallback.${key}`;
    const getSetting = (key, defaultValue) => {
        const cfgValue = vscode.workspace.getConfiguration().get(key);
        if (cfgValue !== undefined)
            return cfgValue;
        const workspaceValue = context.workspaceState.get(fallbackKey(key));
        if (workspaceValue !== undefined)
            return workspaceValue;
        const globalValue = context.globalState.get(fallbackKey(key));
        if (globalValue !== undefined)
            return globalValue;
        return defaultValue;
    };
    const setTokenCommand = async () => {
        const token = await vscode.window.showInputBox({
            title: 'Enter GitHub Token (securely stored in Secret Storage)',
            prompt: 'Repo read access is sufficient; leave empty to clear.',
            password: true,
            ignoreFocusOut: true
        });
        if (token === undefined)
            return;
        if (!token) {
            await (0, secrets_1.setSecretToken)(context.secrets, undefined);
            vscode.window.showInformationMessage('Cleared Token from Secret Storage.');
            return;
        }
        await (0, secrets_1.setSecretToken)(context.secrets, token);
        vscode.window.showInformationMessage('Token saved to Secret Storage.');
    };
    const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusItem.command = 'githubPuller.runAutoSync';
    statusItem.tooltip = 'Run Puller Auto Sync';
    const setSyncVisual = (busy, text) => {
        statusItem.text = busy ? '$(sync~spin) Puller Sync' : '$(cloud-download) Puller Sync';
        statusItem.backgroundColor = busy ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
        statusItem.tooltip = text || 'Run Puller Auto Sync';
    };
    const openConfigPanel = () => {
        const panel = new fetchPanel_1.FetchPanel(context);
        panel.show();
    };
    const runAutoSync = async () => {
        const repoUrl = (getSetting('githubPuller.syncRepoUrl', '') || '').trim();
        const ref = (getSetting('githubPuller.syncRef', getSetting('githubPuller.defaultRef', 'main') || 'main') || 'main').trim();
        const paths = (0, sync_1.splitSyncPaths)(getSetting('githubPuller.syncPaths', '') || '');
        const token = (0, sync_1.pickToken)(await (0, secrets_1.getSecretToken)(context.secrets), getSetting('githubPuller.token', '') || '');
        if (!token || !repoUrl || paths.length === 0) {
            setSyncVisual(false, 'Configure Puller Sync');
            openConfigPanel();
            if (!token) {
                await vscode.commands.executeCommand('githubPuller.setToken');
            }
            const missing = [];
            if (!token)
                missing.push('token');
            if (!repoUrl)
                missing.push('repository');
            if (paths.length === 0)
                missing.push('sync paths');
            vscode.window.showWarningMessage(`Please complete Puller Config (${missing.join(', ')}) and click Save Config before syncing.`);
            return;
        }
        setSyncVisual(true, 'Sync in progress');
        try {
            const configuredTargets = (0, targetDirs_1.splitTargetDirs)(getSetting('githubPuller.targetDirs', '') || getSetting('githubPuller.defaultTargetDir', '') || '');
            const workspaceRoots = (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath);
            const targetResolution = (0, sync_1.resolveSyncTargets)(configuredTargets, workspaceRoots);
            const targetRoots = targetResolution.targets;
            if (targetRoots.length === 0) {
                setSyncVisual(false, 'Configure Puller Sync');
                openConfigPanel();
                vscode.window.showWarningMessage('No sync target found. Open a workspace or configure target directories in Puller Config.');
                return;
            }
            const invalidTargets = (0, targetDirs_1.parseTargetDirs)(targetRoots.join(','), { requireAbsolute: true, requireExists: false });
            if (invalidTargets.issues.length > 0) {
                throw new Error(`Invalid target directories: ${invalidTargets.issues.map(i => `${i.path}(${i.reason})`).join(', ')}`);
            }
            output.appendLine(`[sync] targetSource=${targetResolution.source}`);
            output.appendLine('[preflight] ensuring .github in all target roots');
            const preparedTargets = [];
            for (const targetRoot of targetRoots) {
                try {
                    const result = await (0, fs_1.prepareGithubDir)(targetRoot);
                    preparedTargets.push({ targetRoot: result.targetRoot, githubDir: result.githubDir });
                    output.appendLine(`[preflight] ${result.status === 'exists' ? 'exists' : 'created'} ${result.githubDir}`);
                }
                catch (e) {
                    const message = e?.message || String(e);
                    output.appendLine(`[preflight] failed ${targetRoot} : ${message}`);
                    throw e;
                }
            }
            const baseUrl = getSetting('githubPuller.baseUrl', 'https://github.com') || 'https://github.com';
            const apiBase = (0, github_1.deriveApiBase)(baseUrl, getSetting('githubPuller.apiBaseUrl', '') || '');
            const repo = (0, github_1.parseRepoUrl)(repoUrl, ref);
            output.appendLine(`[sync] repo=${repo.owner}/${repo.repo} ref=${repo.ref}`);
            output.appendLine(`[sync] targetRoots=${targetRoots.join(',')}`);
            const tree = await (0, github_1.fetchRepoTreeWithApi)(repo, token || undefined, apiBase);
            const allFiles = tree.filter(t => t.type === 'blob').map(t => t.path);
            const expanded = (0, sync_1.expandSelectedRepoPaths)(allFiles, paths);
            if (expanded.files.length === 0) {
                throw new Error(`No files matched by sync paths: ${paths.join(', ')}`);
            }
            if (expanded.issues.length > 0) {
                output.appendLine(`[sync] unmatched paths=${expanded.issues.map(i => i.value).join(',')}`);
            }
            const preserve = getSetting('githubPuller.preserveStructure', true) ?? true;
            const conflict = getSetting('githubPuller.conflictResolution', 'rename') || 'rename';
            let ok = 0;
            let fail = 0;
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Puller Sync', cancellable: false }, async (progress) => {
                const total = expanded.files.length * preparedTargets.length;
                let done = 0;
                for (const target of preparedTargets) {
                    for (const repoPath of expanded.files) {
                        done++;
                        progress.report({ increment: (1 / total) * 100, message: `${repoPath}` });
                        try {
                            const file = await (0, github_1.fetchFileContent)(repo, repoPath, token || undefined, apiBase);
                            const dest = (0, fs_1.resolveTargetPath)(target.githubDir, repoPath, preserve);
                            const result = (0, fs_1.writeFileSmart)(dest, file.content, conflict);
                            if (!result.wrote) {
                                fail++;
                                output.appendLine(`[skip] ${repoPath} -> ${dest}`);
                            }
                            else {
                                ok++;
                                output.appendLine(`[ok] ${repoPath} -> ${result.path || dest}`);
                            }
                        }
                        catch (e) {
                            fail++;
                            output.appendLine(`[fail] ${repoPath} -> ${target.githubDir} : ${e?.message || String(e)}`);
                        }
                    }
                }
            });
            vscode.window.showInformationMessage(`Puller Sync complete: ${ok} succeeded, ${fail} failed.`);
            setSyncVisual(false, `Last sync: ${ok} ok, ${fail} failed`);
        }
        catch (e) {
            const message = e?.message || String(e);
            output.appendLine(`[error] ${message}`);
            setSyncVisual(false, `Sync failed: ${message}`);
            vscode.window.showErrorMessage(`Puller Sync failed: ${message}`);
            throw e;
        }
        finally {
            if (!statusItem.tooltip?.toString().startsWith('Last sync')) {
                setSyncVisual(false);
            }
        }
    };
    const updateStatusBarVisibility = () => {
        const show = getSetting('githubPuller.showStatusBar', true) ?? true;
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
        if (e.affectsConfiguration('githubPuller.showStatusBar'))
            updateStatusBarVisibility();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('githubPuller.fetchFiles', async () => {
        const panel = new fetchPanel_1.FetchPanel(context);
        panel.show();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('githubPuller.runAutoSync', runAutoSync));
    context.subscriptions.push(vscode.commands.registerCommand('githubPuller.setToken', setTokenCommand));
    context.subscriptions.push(vscode.commands.registerCommand('githubPuller.configureToken', setTokenCommand));
}
function deactivate() {
    // no-op
}
//# sourceMappingURL=extension.js.map