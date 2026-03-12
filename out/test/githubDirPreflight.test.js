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
const assert_1 = require("assert");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const fs_1 = require("../src/utils/fs");
describe('.github preflight', () => {
    let tmpRoot;
    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'puller-preflight-'));
    });
    afterEach(() => {
        try {
            fs.chmodSync(tmpRoot, 0o700);
        }
        catch { }
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });
    it('returns exists when .github already exists', async () => {
        const root = path.join(tmpRoot, 'exists-case');
        const githubDir = path.join(root, '.github');
        fs.mkdirSync(githubDir, { recursive: true });
        const result = await (0, fs_1.prepareGithubDir)(root);
        assert_1.strict.equal(result.status, 'exists');
        assert_1.strict.equal(result.githubDir, githubDir);
    });
    it('creates .github when missing', async () => {
        const root = path.join(tmpRoot, 'create-case');
        fs.mkdirSync(root, { recursive: true });
        const result = await (0, fs_1.prepareGithubDir)(root);
        assert_1.strict.equal(result.status, 'created');
        assert_1.strict.ok(fs.existsSync(path.join(root, '.github')));
    });
    it('creates target root and .github when target root does not exist', async () => {
        const root = path.join(tmpRoot, 'nested', 'new-target');
        const result = await (0, fs_1.prepareGithubDir)(root);
        assert_1.strict.equal(result.status, 'created');
        assert_1.strict.ok(fs.existsSync(root));
        assert_1.strict.ok(fs.existsSync(path.join(root, '.github')));
    });
    it('uses target itself when target is .github', async () => {
        const githubRoot = path.join(tmpRoot, 'project', '.github');
        assert_1.strict.equal((0, fs_1.resolveGithubSyncBase)(githubRoot), githubRoot);
        const result = await (0, fs_1.prepareGithubDir)(githubRoot);
        assert_1.strict.equal(result.githubDir, githubRoot);
        assert_1.strict.ok(fs.existsSync(githubRoot));
        assert_1.strict.ok(!fs.existsSync(path.join(githubRoot, '.github')));
    });
    it('throws with path when creation fails because of permissions', async function () {
        if (process.platform === 'win32') {
            this.skip();
            return;
        }
        const root = path.join(tmpRoot, 'readonly-case');
        fs.mkdirSync(root, { recursive: true });
        fs.chmodSync(root, 0o500);
        await assert_1.strict.rejects((0, fs_1.prepareGithubDir)(root), (error) => {
            const message = error?.message || '';
            return message.includes(path.join(root, '.github')) && message.includes('Failed to create .github directory');
        });
        fs.chmodSync(root, 0o700);
    });
});
//# sourceMappingURL=githubDirPreflight.test.js.map