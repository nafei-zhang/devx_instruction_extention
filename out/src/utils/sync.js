"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitSyncPaths = splitSyncPaths;
exports.expandSelectedRepoPaths = expandSelectedRepoPaths;
exports.resolveSyncTargetRoots = resolveSyncTargetRoots;
exports.resolveSyncTargets = resolveSyncTargets;
exports.pickToken = pickToken;
function splitSyncPaths(input) {
    return (input || '').split(',').map(v => v.trim()).filter(Boolean);
}
function expandSelectedRepoPaths(allFiles, selected) {
    const issues = [];
    const files = new Set();
    const dedupedSelected = Array.from(new Set(selected.map(s => s.trim()).filter(Boolean)));
    for (const raw of dedupedSelected) {
        const normalized = raw.replace(/^\/+|\/+$/g, '');
        if (!normalized)
            continue;
        const exact = allFiles.includes(normalized);
        if (exact) {
            files.add(normalized);
            continue;
        }
        const prefix = `${normalized}/`;
        const matched = allFiles.filter(f => f === normalized || f.startsWith(prefix));
        if (matched.length === 0) {
            issues.push({ value: raw, reason: 'No file matched in repository tree' });
            continue;
        }
        for (const m of matched)
            files.add(m);
    }
    return { files: Array.from(files), issues };
}
function resolveSyncTargetRoots(configuredTargets, workspaceRoots) {
    return resolveSyncTargets(configuredTargets, workspaceRoots).targets;
}
function resolveSyncTargets(configuredTargets, workspaceRoots) {
    const configured = Array.from(new Set(configuredTargets.map(t => t.trim()).filter(Boolean)));
    if (configured.length > 0)
        return { targets: configured, source: 'configured' };
    const workspace = Array.from(new Set(workspaceRoots.map(t => t.trim()).filter(Boolean)));
    if (workspace.length === 0)
        return { targets: [], source: 'none' };
    if (workspace.length === 1)
        return { targets: workspace, source: 'workspace-single' };
    return { targets: workspace, source: 'workspace-multi' };
}
function pickToken(secretToken, fallbackToken) {
    if (secretToken && secretToken.trim())
        return secretToken.trim();
    return (fallbackToken || '').trim();
}
//# sourceMappingURL=sync.js.map