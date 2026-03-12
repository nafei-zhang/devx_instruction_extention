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
exports.resolveTargetPath = resolveTargetPath;
exports.ensureDirExists = ensureDirExists;
exports.fileExists = fileExists;
exports.applyConflictPolicy = applyConflictPolicy;
exports.resolveGithubSyncBase = resolveGithubSyncBase;
exports.detectAndNormalizeEncoding = detectAndNormalizeEncoding;
exports.writeFileSmart = writeFileSmart;
exports.prepareGithubDir = prepareGithubDir;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const chardet = __importStar(require("chardet"));
const iconv = __importStar(require("iconv-lite"));
const istextorbinary_1 = require("istextorbinary");
function resolveTargetPath(baseDir, repoRelativePath, preserve) {
    return preserve ? path.join(baseDir, repoRelativePath) : path.join(baseDir, path.basename(repoRelativePath));
}
function ensureDirExists(filePath) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
}
function fileExists(p) {
    try {
        fs.accessSync(p, fs.constants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
function applyConflictPolicy(target, policy) {
    if (!fileExists(target))
        return target;
    if (policy === 'overwrite')
        return target;
    if (policy === 'skip')
        return null;
    // rename
    const { dir, name, ext } = path.parse(target);
    let i = 1;
    // Avoid infinite loop; cap at 1000
    while (i < 1000) {
        const candidate = path.join(dir, `${name}.github-${i}${ext}`);
        if (!fileExists(candidate))
            return candidate;
        i++;
    }
    return null;
}
function resolveGithubSyncBase(targetRoot) {
    const root = path.resolve(targetRoot);
    return path.basename(root) === '.github' ? root : path.join(root, '.github');
}
function detectAndNormalizeEncoding(buf) {
    // Quick binary check
    const maybeBinary = (0, istextorbinary_1.isBinary)(null, buf);
    if (maybeBinary) {
        return { text: null, encoding: undefined, binary: true };
    }
    const detected = chardet.detect(buf) || 'utf-8';
    try {
        const text = iconv.decode(buf, detected);
        return { text, encoding: detected, binary: false };
    }
    catch {
        // Fallback to UTF-8
        try {
            const text = buf.toString('utf8');
            return { text, encoding: 'utf-8', binary: false };
        }
        catch {
            return { text: null, encoding: undefined, binary: true };
        }
    }
}
function writeFileSmart(target, content, policy) {
    const finalPath = applyConflictPolicy(target, policy);
    if (!finalPath)
        return { wrote: false };
    ensureDirExists(finalPath);
    const { text, encoding, binary } = detectAndNormalizeEncoding(content);
    if (binary || text === null) {
        fs.writeFileSync(finalPath, content);
        return { wrote: true, path: finalPath, binary: true };
    }
    fs.writeFileSync(finalPath, text, { encoding: 'utf8' });
    return { wrote: true, path: finalPath, encoding, binary: false };
}
async function prepareGithubDir(targetRoot) {
    const root = path.resolve(targetRoot);
    const githubDir = resolveGithubSyncBase(root);
    try {
        const stat = await fs.promises.stat(githubDir);
        if (!stat.isDirectory()) {
            throw new Error(`Path exists but is not a directory: ${githubDir}`);
        }
        return { targetRoot: root, githubDir, status: 'exists' };
    }
    catch (error) {
        if (error?.code !== 'ENOENT') {
            throw new Error(`Failed to inspect .github directory at ${githubDir}: ${error?.message || String(error)}`);
        }
    }
    try {
        await fs.promises.mkdir(githubDir, { recursive: true });
    }
    catch (error) {
        throw new Error(`Failed to create .github directory at ${githubDir}: ${error?.message || String(error)}`);
    }
    try {
        const stat = await fs.promises.stat(githubDir);
        if (!stat.isDirectory()) {
            throw new Error('Path is not a directory after creation');
        }
        return { targetRoot: root, githubDir, status: 'created' };
    }
    catch (error) {
        throw new Error(`Created .github but verification failed at ${githubDir}: ${error?.message || String(error)}`);
    }
}
//# sourceMappingURL=fs.js.map