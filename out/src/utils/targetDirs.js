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
exports.splitTargetDirs = splitTargetDirs;
exports.parseTargetDirs = parseTargetDirs;
exports.serializeTargetDirs = serializeTargetDirs;
exports.appendTargetDir = appendTargetDir;
exports.readTargetDirsFromConfig = readTargetDirsFromConfig;
exports.writeTargetDirsToConfig = writeTargetDirsToConfig;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function stripTrailingSeparator(input) {
    if (input.length <= 1)
        return input;
    return input.replace(/[\\/]+$/, '');
}
function normalizeSinglePath(rawPath) {
    const normalized = path.normalize(rawPath.trim());
    if (!normalized)
        return '';
    if (normalized === path.parse(normalized).root)
        return normalized;
    return stripTrailingSeparator(normalized);
}
function isValidPathFormat(p) {
    if (!p || p.includes('\u0000'))
        return false;
    return true;
}
function splitTargetDirs(input) {
    return (input || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
}
function parseTargetDirs(input, options) {
    const requireAbsolute = options?.requireAbsolute ?? true;
    const requireExists = options?.requireExists ?? true;
    const rawList = splitTargetDirs(input);
    const issues = [];
    const deduped = new Set();
    for (const item of rawList) {
        const normalized = normalizeSinglePath(item);
        if (!normalized) {
            issues.push({ path: item, reason: 'Path is empty' });
            continue;
        }
        if (!isValidPathFormat(normalized)) {
            issues.push({ path: item, reason: 'Path format is invalid' });
            continue;
        }
        if (requireAbsolute && !path.isAbsolute(normalized)) {
            issues.push({ path: item, reason: 'Path must be absolute' });
            continue;
        }
        if (requireExists && !fs.existsSync(normalized)) {
            issues.push({ path: item, reason: 'Path does not exist' });
            continue;
        }
        deduped.add(normalized);
    }
    return { raw: rawList, normalized: Array.from(deduped), issues };
}
function serializeTargetDirs(paths) {
    return Array.from(new Set(paths.map(p => normalizeSinglePath(p)).filter(Boolean))).join(',');
}
function appendTargetDir(currentInput, newPath, options) {
    const current = splitTargetDirs(currentInput);
    const merged = [...current, newPath];
    return parseTargetDirs(merged.join(','), options);
}
function readTargetDirsFromConfig(config) {
    const multi = config.get('githubPuller.targetDirs') || '';
    if (multi.trim())
        return multi;
    const legacy = config.get('githubPuller.defaultTargetDir') || '';
    return legacy.trim();
}
async function writeTargetDirsToConfig(config, serialized) {
    await config.update('githubPuller.targetDirs', serialized);
    const first = splitTargetDirs(serialized)[0] || '';
    await config.update('githubPuller.defaultTargetDir', first);
}
//# sourceMappingURL=targetDirs.js.map