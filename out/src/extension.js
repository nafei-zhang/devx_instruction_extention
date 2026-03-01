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
function activate(context) {
    // Status bar quick entry
    const cfg = vscode.workspace.getConfiguration();
    const createStatusBar = () => {
        const show = cfg.get('githubPuller.showStatusBar') ?? true;
        if (!show)
            return;
        const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        item.text = '$(cloud-download) GitHub Puller';
        item.tooltip = 'Open GitHub File Puller';
        item.command = 'githubPuller.fetchFiles';
        item.show();
        context.subscriptions.push(item);
    };
    createStatusBar();
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('githubPuller.showStatusBar')) {
            // Recreate on toggle
            createStatusBar();
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('githubPuller.fetchFiles', async () => {
        const panel = new fetchPanel_1.FetchPanel(context);
        panel.show();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('githubPuller.setToken', async () => {
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
            await (0, secrets_1.setSecretToken)(context.secrets, undefined);
            vscode.window.showInformationMessage('Cleared Token from Secret Storage.');
        }
        else {
            await (0, secrets_1.setSecretToken)(context.secrets, token);
            vscode.window.showInformationMessage('Token saved to Secret Storage.');
        }
    }));
}
function deactivate() {
    // no-op
}
//# sourceMappingURL=extension.js.map