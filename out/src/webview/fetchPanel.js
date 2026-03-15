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
const secrets_1 = require("../secrets");
const targetDirs_1 = require("../utils/targetDirs");
const fetchPanelTemplate_1 = require("./fetchPanelTemplate");
const PUBLIC_BASE_URL = 'https://github.com';
const ENTERPRISE_BASE_URL = 'https://alm-github.com.hsbc/';
class FetchPanel {
    constructor(ctx) {
        this.ctx = ctx;
        this.panel = null;
        this.cfgWatcher = null;
    }
    fallbackKey(key) {
        return `githubPuller.fallback.${key}`;
    }
    readFallback(key) {
        const fallback = this.fallbackKey(key);
        const workspaceValue = this.ctx.workspaceState.get(fallback);
        if (workspaceValue !== undefined)
            return workspaceValue;
        return this.ctx.globalState.get(fallback);
    }
    async writeFallback(key, value, preferWorkspace) {
        const fallback = this.fallbackKey(key);
        if (preferWorkspace) {
            await this.ctx.workspaceState.update(fallback, value);
            return;
        }
        await this.ctx.globalState.update(fallback, value);
    }
    getConfigWriter() {
        const cfg = vscode.workspace.getConfiguration();
        const panel = this;
        const preferWorkspace = !!vscode.workspace.workspaceFolders?.length;
        const isNotRegisteredError = (error) => {
            const message = (error?.message || String(error)).toLowerCase();
            return message.includes('not a registered configuration');
        };
        return {
            get(key) {
                const value = cfg.get(key);
                if (value !== undefined)
                    return value;
                return panel.readFallback(key);
            },
            async update(key, value) {
                if (preferWorkspace) {
                    try {
                        await cfg.update(key, value, vscode.ConfigurationTarget.Workspace);
                        return;
                    }
                    catch (error) {
                        if (!isNotRegisteredError(error))
                            throw error;
                    }
                }
                try {
                    await cfg.update(key, value, vscode.ConfigurationTarget.Global);
                    return;
                }
                catch (error) {
                    if (!isNotRegisteredError(error))
                        throw error;
                }
                await panel.writeFallback(key, value, preferWorkspace);
            }
        };
    }
    show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }
        this.panel = vscode.window.createWebviewPanel('githubPuller.fetchPanel', 'Puller Config', vscode.ViewColumn.Active, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        this.panel.webview.html = (0, fetchPanelTemplate_1.renderFetchPanelHtml)(this.ctx.extensionUri, this.panel.webview);
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
        const cfg = this.getConfigWriter();
        const configured = (0, targetDirs_1.readTargetDirsFromConfig)(cfg);
        const baseUrl = cfg.get('githubPuller.baseUrl') || ENTERPRISE_BASE_URL;
        const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '').toLowerCase();
        const normalizedPublic = PUBLIC_BASE_URL.replace(/\/+$/, '').toLowerCase();
        this.post({
            type: 'defaults',
            defaultRepoUrl: cfg.get('githubPuller.syncRepoUrl') || '',
            defaultRef: cfg.get('githubPuller.syncRef') || cfg.get('githubPuller.defaultRef') || 'main',
            defaultSyncPaths: cfg.get('githubPuller.syncPaths') || '',
            preserve: cfg.get('githubPuller.preserveStructure') ?? true,
            conflict: cfg.get('githubPuller.conflictResolution') || 'rename',
            defaultTargetDirs: configured,
            defaultHostType: normalizedBaseUrl === normalizedPublic ? 'public' : 'enterprise'
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
                    const cfg = this.getConfigWriter();
                    const defaultRef = cfg.get('githubPuller.defaultRef') || 'main';
                    const info = (0, github_1.parseRepoUrl)(msg.repoUrl, msg.ref || defaultRef);
                    const token = (await (0, secrets_1.getSecretToken)(this.ctx.secrets)) || (cfg.get('githubPuller.token') || '');
                    const baseUrl = msg.hostType === 'enterprise' ? ENTERPRISE_BASE_URL : PUBLIC_BASE_URL;
                    const apiBaseOverride = cfg.get('githubPuller.apiBaseUrl') || '';
                    const apiBase = (0, github_1.deriveApiBase)(baseUrl, apiBaseOverride);
                    this.post({ type: 'loading', text: 'Loading file tree…' });
                    const tree = await (0, github_1.fetchRepoTreeWithApi)(info, token || undefined, apiBase);
                    const files = tree.filter(t => t.type === 'blob').map(t => t.path);
                    this.post({ type: 'treeLoaded', files });
                    break;
                }
                case 'saveConfig': {
                    const cfg = vscode.workspace.getConfiguration();
                    const defaultRef = cfg.get('githubPuller.defaultRef') || 'main';
                    const info = (0, github_1.parseRepoUrl)(msg.repoUrl, msg.ref || defaultRef);
                    const parsedTargetDirs = (0, targetDirs_1.parseTargetDirs)(msg.targetDir || '', { requireAbsolute: true, requireExists: true });
                    if (parsedTargetDirs.issues.length > 0) {
                        throw new Error(`Invalid target directory: ${parsedTargetDirs.issues[0].path} (${parsedTargetDirs.issues[0].reason})`);
                    }
                    const selected = Array.isArray(msg.selected) ? msg.selected : [];
                    const normalizedSelected = Array.from(new Set(selected.map(s => s.trim()).filter(Boolean)));
                    if (normalizedSelected.length === 0)
                        throw new Error('Please select at least one file');
                    const writableCfg = this.getConfigWriter();
                    await writableCfg.update('githubPuller.syncRepoUrl', (msg.repoUrl || '').trim());
                    await writableCfg.update('githubPuller.syncRef', info.ref);
                    await writableCfg.update('githubPuller.syncPaths', normalizedSelected.join(','));
                    await writableCfg.update('githubPuller.preserveStructure', !!msg.preserve);
                    await writableCfg.update('githubPuller.conflictResolution', msg.conflict || 'rename');
                    await writableCfg.update('githubPuller.baseUrl', msg.hostType === 'enterprise' ? ENTERPRISE_BASE_URL : PUBLIC_BASE_URL);
                    const serialized = (0, targetDirs_1.serializeTargetDirs)(parsedTargetDirs.normalized);
                    await (0, targetDirs_1.writeTargetDirsToConfig)(writableCfg, serialized);
                    this.post({ type: 'configSaved' });
                    vscode.window.showInformationMessage('Puller sync config saved.');
                    break;
                }
                case 'setToken': {
                    await vscode.commands.executeCommand('githubPuller.setToken');
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
}
exports.FetchPanel = FetchPanel;
//# sourceMappingURL=fetchPanel.js.map