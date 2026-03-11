import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { appendTargetDir, parseTargetDirs, readTargetDirsFromConfig, serializeTargetDirs, splitTargetDirs, writeTargetDirsToConfig } from '../src/utils/targetDirs';

describe('target directory management', () => {
  let tmpRoot: string;
  let dirA: string;
  let dirB: string;

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
    const result = appendTargetDir(base, dirB, { requireAbsolute: true, requireExists: true });
    assert.equal(result.issues.length, 0);
    assert.deepEqual(result.normalized, [dirA, dirB]);
  });

  it('supports manual edit semantics via split and serialize', () => {
    const manualInput = `${dirB}, ${dirA}, ${dirB}`;
    assert.deepEqual(splitTargetDirs(manualInput), [dirB, dirA, dirB]);
    assert.equal(serializeTargetDirs(splitTargetDirs(manualInput)), `${dirB},${dirA}`);
  });

  it('validates path format and existence', () => {
    const missing = path.join(tmpRoot, 'missing');
    const parsed = parseTargetDirs(`${dirA},relative/path,${missing}`, { requireAbsolute: true, requireExists: true });
    assert.deepEqual(parsed.normalized, [dirA]);
    assert.equal(parsed.issues.length, 2);
    assert.ok(parsed.issues.some(i => i.path === 'relative/path' && i.reason.includes('absolute')));
    assert.ok(parsed.issues.some(i => i.path === missing && i.reason.includes('exist')));
  });

  it('reads and writes comma-separated settings', async () => {
    const data = new Map<string, unknown>();
    const cfg = {
      get<T>(key: string): T | undefined {
        return data.get(key) as T | undefined;
      },
      update(key: string, value: unknown) {
        data.set(key, value);
        return Promise.resolve();
      }
    };
    data.set('githubPuller.defaultTargetDir', dirA);
    assert.equal(readTargetDirsFromConfig(cfg), dirA);
    await writeTargetDirsToConfig(cfg, `${dirA},${dirB}`);
    assert.equal(data.get('githubPuller.targetDirs'), `${dirA},${dirB}`);
    assert.equal(data.get('githubPuller.defaultTargetDir'), dirA);
    assert.equal(readTargetDirsFromConfig(cfg), `${dirA},${dirB}`);
  });
});
