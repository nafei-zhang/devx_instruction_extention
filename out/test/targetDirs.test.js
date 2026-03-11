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
const targetDirs_1 = require("../src/utils/targetDirs");
describe('target directory management', () => {
    let tmpRoot;
    let dirA;
    let dirB;
    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'puller-target-dirs-'));
        dirA = path.join(tmpRoot, 'a');
        dirB = path.join(tmpRoot, 'b');
        fs.mkdirSync(dirA, { recursive: true });
        fs.mkdirSync(dirB, { recursive: true });
    });
    afterEach(() => {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });
    it('adds selected path with de-duplication', () => {
        const base = `${dirA},${dirA}`;
        const result = (0, targetDirs_1.appendTargetDir)(base, dirB, { requireAbsolute: true, requireExists: true });
        assert_1.strict.equal(result.issues.length, 0);
        assert_1.strict.deepEqual(result.normalized, [dirA, dirB]);
    });
    it('supports manual edit semantics via split and serialize', () => {
        const manualInput = `${dirB}, ${dirA}, ${dirB}`;
        assert_1.strict.deepEqual((0, targetDirs_1.splitTargetDirs)(manualInput), [dirB, dirA, dirB]);
        assert_1.strict.equal((0, targetDirs_1.serializeTargetDirs)((0, targetDirs_1.splitTargetDirs)(manualInput)), `${dirB},${dirA}`);
    });
    it('validates path format and existence', () => {
        const missing = path.join(tmpRoot, 'missing');
        const parsed = (0, targetDirs_1.parseTargetDirs)(`${dirA},relative/path,${missing}`, { requireAbsolute: true, requireExists: true });
        assert_1.strict.deepEqual(parsed.normalized, [dirA]);
        assert_1.strict.equal(parsed.issues.length, 2);
        assert_1.strict.ok(parsed.issues.some(i => i.path === 'relative/path' && i.reason.includes('absolute')));
        assert_1.strict.ok(parsed.issues.some(i => i.path === missing && i.reason.includes('exist')));
    });
    it('reads and writes comma-separated settings', async () => {
        const data = new Map();
        const cfg = {
            get(key) {
                return data.get(key);
            },
            update(key, value) {
                data.set(key, value);
                return Promise.resolve();
            }
        };
        data.set('githubPuller.defaultTargetDir', dirA);
        assert_1.strict.equal((0, targetDirs_1.readTargetDirsFromConfig)(cfg), dirA);
        await (0, targetDirs_1.writeTargetDirsToConfig)(cfg, `${dirA},${dirB}`);
        assert_1.strict.equal(data.get('githubPuller.targetDirs'), `${dirA},${dirB}`);
        assert_1.strict.equal(data.get('githubPuller.defaultTargetDir'), dirA);
        assert_1.strict.equal((0, targetDirs_1.readTargetDirsFromConfig)(cfg), `${dirA},${dirB}`);
    });
});
//# sourceMappingURL=targetDirs.test.js.map