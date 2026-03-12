import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { prepareGithubDir, resolveGithubSyncBase } from '../src/utils/fs';

describe('.github preflight', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'puller-preflight-'));
  });

  afterEach(() => {
    try {
      fs.chmodSync(tmpRoot, 0o700);
    } catch {}
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('returns exists when .github already exists', async () => {
    const root = path.join(tmpRoot, 'exists-case');
    const githubDir = path.join(root, '.github');
    fs.mkdirSync(githubDir, { recursive: true });
    const result = await prepareGithubDir(root);
    assert.equal(result.status, 'exists');
    assert.equal(result.githubDir, githubDir);
  });

  it('creates .github when missing', async () => {
    const root = path.join(tmpRoot, 'create-case');
    fs.mkdirSync(root, { recursive: true });
    const result = await prepareGithubDir(root);
    assert.equal(result.status, 'created');
    assert.ok(fs.existsSync(path.join(root, '.github')));
  });

  it('creates target root and .github when target root does not exist', async () => {
    const root = path.join(tmpRoot, 'nested', 'new-target');
    const result = await prepareGithubDir(root);
    assert.equal(result.status, 'created');
    assert.ok(fs.existsSync(root));
    assert.ok(fs.existsSync(path.join(root, '.github')));
  });

  it('uses target itself when target is .github', async () => {
    const githubRoot = path.join(tmpRoot, 'project', '.github');
    assert.equal(resolveGithubSyncBase(githubRoot), githubRoot);
    const result = await prepareGithubDir(githubRoot);
    assert.equal(result.githubDir, githubRoot);
    assert.ok(fs.existsSync(githubRoot));
    assert.ok(!fs.existsSync(path.join(githubRoot, '.github')));
  });

  it('throws with path when creation fails because of permissions', async function () {
    if (process.platform === 'win32') {
      this.skip();
      return;
    }
    const root = path.join(tmpRoot, 'readonly-case');
    fs.mkdirSync(root, { recursive: true });
    fs.chmodSync(root, 0o500);
    await assert.rejects(
      prepareGithubDir(root),
      (error: any) => {
        const message = error?.message || '';
        return message.includes(path.join(root, '.github')) && message.includes('Failed to create .github directory');
      }
    );
    fs.chmodSync(root, 0o700);
  });
});
