import { strict as assert } from 'assert';
import { deriveApiBase, parseRepoUrl } from '../src/github';

describe('GitHub Enterprise support', () => {
  it('deriveApiBase for github.com defaults to api.github.com', () => {
    assert.equal(deriveApiBase('https://github.com', ''), 'https://api.github.com');
  });
  it('deriveApiBase for enterprise host appends /api/v3', () => {
    assert.equal(deriveApiBase('https://ghe.example.com', ''), 'https://ghe.example.com/api/v3');
  });
  it('deriveApiBase respects override', () => {
    assert.equal(deriveApiBase('https://ghe.example.com', 'https://api.ghe.example.com'), 'https://api.ghe.example.com');
  });
  it('parseRepoUrl accepts non-github hosts', () => {
    const r = parseRepoUrl('https://ghe.example.com/org/proj/tree/release', 'main');
    assert.equal(r.owner, 'org');
    assert.equal(r.repo, 'proj');
    assert.equal(r.ref, 'release');
  });
});
