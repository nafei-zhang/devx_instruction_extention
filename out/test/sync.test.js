"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const sync_1 = require("../src/utils/sync");
describe('sync utilities', () => {
    it('selects configured targets before workspace roots', () => {
        const targets = (0, sync_1.resolveSyncTargetRoots)(['/a', '/b'], ['/workspace/a', '/workspace/b']);
        assert_1.strict.deepEqual(targets, ['/a', '/b']);
    });
    it('falls back to workspace roots when no configured target', () => {
        const targets = (0, sync_1.resolveSyncTargetRoots)([], ['/workspace/a', '/workspace/b']);
        assert_1.strict.deepEqual(targets, ['/workspace/a', '/workspace/b']);
    });
    it('detects workspace single-root target source', () => {
        const resolved = (0, sync_1.resolveSyncTargets)([], ['/workspace/project']);
        assert_1.strict.deepEqual(resolved.targets, ['/workspace/project']);
        assert_1.strict.equal(resolved.source, 'workspace-single');
    });
    it('detects workspace multi-root target source', () => {
        const resolved = (0, sync_1.resolveSyncTargets)([], ['/workspace/a', '/workspace/b']);
        assert_1.strict.deepEqual(resolved.targets, ['/workspace/a', '/workspace/b']);
        assert_1.strict.equal(resolved.source, 'workspace-multi');
    });
    it('expands directory and file selections', () => {
        const files = ['instructions/a.md', 'skills/x.sh', 'src/app.ts', 'src/lib/a.ts'];
        const selected = (0, sync_1.expandSelectedRepoPaths)(files, (0, sync_1.splitSyncPaths)('src,skills/x.sh'));
        assert_1.strict.deepEqual(selected.files.sort(), ['skills/x.sh', 'src/app.ts', 'src/lib/a.ts']);
        assert_1.strict.equal(selected.issues.length, 0);
    });
    it('prefers secret token over fallback token', () => {
        assert_1.strict.equal((0, sync_1.pickToken)(' secret ', 'fallback'), 'secret');
        assert_1.strict.equal((0, sync_1.pickToken)('', ' fallback '), 'fallback');
    });
});
//# sourceMappingURL=sync.test.js.map