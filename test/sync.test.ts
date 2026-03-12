import { strict as assert } from 'assert';
import { expandSelectedRepoPaths, pickToken, resolveSyncTargetRoots, resolveSyncTargets, splitSyncPaths } from '../src/utils/sync';

describe('sync utilities', () => {
  it('selects configured targets before workspace roots', () => {
    const targets = resolveSyncTargetRoots(['/a', '/b'], ['/workspace/a', '/workspace/b']);
    assert.deepEqual(targets, ['/a', '/b']);
  });

  it('falls back to workspace roots when no configured target', () => {
    const targets = resolveSyncTargetRoots([], ['/workspace/a', '/workspace/b']);
    assert.deepEqual(targets, ['/workspace/a', '/workspace/b']);
  });

  it('detects workspace single-root target source', () => {
    const resolved = resolveSyncTargets([], ['/workspace/project']);
    assert.deepEqual(resolved.targets, ['/workspace/project']);
    assert.equal(resolved.source, 'workspace-single');
  });

  it('detects workspace multi-root target source', () => {
    const resolved = resolveSyncTargets([], ['/workspace/a', '/workspace/b']);
    assert.deepEqual(resolved.targets, ['/workspace/a', '/workspace/b']);
    assert.equal(resolved.source, 'workspace-multi');
  });

  it('expands directory and file selections', () => {
    const files = ['instructions/a.md', 'skills/x.sh', 'src/app.ts', 'src/lib/a.ts'];
    const selected = expandSelectedRepoPaths(files, splitSyncPaths('src,skills/x.sh'));
    assert.deepEqual(selected.files.sort(), ['skills/x.sh', 'src/app.ts', 'src/lib/a.ts']);
    assert.equal(selected.issues.length, 0);
  });

  it('prefers secret token over fallback token', () => {
    assert.equal(pickToken(' secret ', 'fallback'), 'secret');
    assert.equal(pickToken('', ' fallback '), 'fallback');
  });
});
