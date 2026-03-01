"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRepoUrl = parseRepoUrl;
exports.fetchRepoTree = fetchRepoTree;
exports.deriveApiBase = deriveApiBase;
exports.fetchRepoTreeWithApi = fetchRepoTreeWithApi;
exports.fetchFileContent = fetchFileContent;
const node_fetch_1 = __importDefault(require("node-fetch"));
function parseRepoUrl(input, defaultRef = 'main') {
    let url = input.trim();
    // Allow owner/repo shorthand
    const shorthand = url.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:#(.+))?$/);
    if (shorthand) {
        return {
            owner: shorthand[1],
            repo: shorthand[2].replace(/\.git$/, ''),
            ref: shorthand[3] || defaultRef
        };
    }
    // Full URL
    try {
        if (!/^https?:\/\//i.test(url)) {
            url = `https://${url}`;
        }
        const u = new URL(url);
        const parts = u.pathname.replace(/^\/+|\/+$/g, '').split('/');
        if (parts.length < 2)
            throw new Error('Unable to parse repository path');
        const owner = parts[0];
        const repo = parts[1].replace(/\.git$/, '');
        // Allow /tree/<ref> or fragment #<ref>
        let ref = defaultRef;
        if (parts[2] === 'tree' && parts[3]) {
            ref = decodeURIComponent(parts.slice(3).join('/'));
        }
        if (u.hash && u.hash.startsWith('#')) {
            ref = decodeURIComponent(u.hash.slice(1));
        }
        return { owner, repo, ref };
    }
    catch {
        throw new Error('Invalid repository URL. Supported: https://<host>/owner/repo or owner/repo');
    }
}
async function fetchRepoTree(info, token) {
    // Backward-compatible default to public GitHub
    return fetchRepoTreeWithApi(info, token, 'https://api.github.com');
}
function deriveApiBase(baseUrl, apiBaseOverride) {
    if (apiBaseOverride && apiBaseOverride.trim())
        return apiBaseOverride.trim().replace(/\/+$/, '');
    const b = baseUrl.trim().replace(/\/+$/, '');
    if (/^https?:\/\/github\.com$/i.test(b)) {
        return 'https://api.github.com';
    }
    return `${b}/api/v3`;
}
async function fetchRepoTreeWithApi(info, token, apiBaseUrl) {
    // Resolve branch -> commit sha
    const headers = {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'vscode-github-file-puller'
    };
    if (token)
        headers['Authorization'] = `token ${token}`;
    const base = apiBaseUrl.replace(/\/+$/, '');
    const branchResp = await (0, node_fetch_1.default)(`${base}/repos/${info.owner}/${info.repo}/branches/${encodeURIComponent(info.ref)}`, { headers });
    if (branchResp.status === 404) {
        // Try tags endpoint
        const tagResp = await (0, node_fetch_1.default)(`${base}/repos/${info.owner}/${info.repo}/git/refs/tags/${encodeURIComponent(info.ref)}`, { headers });
        if (tagResp.ok) {
            const tagData = await tagResp.json();
            const sha = Array.isArray(tagData) ? tagData[0]?.object?.sha : tagData?.object?.sha;
            if (!sha)
                throw new Error('Unable to resolve commit SHA for the tag');
            return await fetchTreeBySha(info, sha, headers, base);
        }
    }
    if (!branchResp.ok) {
        const text = await branchResp.text();
        throw new Error(`Failed to fetch branch info: ${branchResp.status} ${text}`);
    }
    const branchData = await branchResp.json();
    const sha = branchData?.commit?.sha;
    if (!sha)
        throw new Error('Missing commit SHA for the branch');
    return await fetchTreeBySha(info, sha, headers, base);
}
async function fetchTreeBySha(info, sha, headers, base) {
    const treeResp = await (0, node_fetch_1.default)(`${base}/repos/${info.owner}/${info.repo}/git/trees/${sha}?recursive=1`, { headers });
    if (!treeResp.ok) {
        const text = await treeResp.text();
        throw new Error(`Failed to fetch repository tree: ${treeResp.status} ${text}`);
    }
    const json = await treeResp.json();
    const tree = (json.tree || []);
    return tree.map(t => ({
        path: t.path,
        type: t.type,
        sha: t.sha,
        size: t.size
    })).filter(t => !!t.path);
}
async function fetchFileContent(info, filePath, token, apiBaseUrl) {
    const headers = {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'vscode-github-file-puller'
    };
    if (token)
        headers['Authorization'] = `token ${token}`;
    const base = (apiBaseUrl || 'https://api.github.com').replace(/\/+$/, '');
    const url = `${base}/repos/${info.owner}/${info.repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(info.ref)}`;
    const resp = await (0, node_fetch_1.default)(url, { headers });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Failed to download ${filePath}: ${resp.status} ${text}`);
    }
    const data = await resp.json();
    if (Array.isArray(data)) {
        throw new Error(`${filePath} is a directory, not a file`);
    }
    if (data.encoding === 'base64' && typeof data.content === 'string') {
        const buf = Buffer.from(data.content, 'base64');
        return { path: filePath, content: buf, encoding: 'base64' };
    }
    // Fallback to download_url if provided
    if (data.download_url) {
        const raw = await (0, node_fetch_1.default)(data.download_url, { headers });
        if (!raw.ok) {
            const text = await raw.text();
            throw new Error(`Failed to download ${filePath}: ${raw.status} ${text}`);
        }
        const buf = Buffer.from(await raw.arrayBuffer());
        return { path: filePath, content: buf };
    }
    throw new Error(`Unable to parse content of ${filePath}`);
}
//# sourceMappingURL=github.js.map