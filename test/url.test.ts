import { strict as assert } from 'assert';
import { parseRepoUrl } from '../src/github';

describe('parseRepoUrl', () => {
  it('parses owner/repo', () => {
    const r = parseRepoUrl('octocat/Hello-World', 'main');
    assert.equal(r.owner, 'octocat');
    assert.equal(r.repo, 'Hello-World');
    assert.equal(r.ref, 'main');
  });
  it('parses full URL with branch', () => {
    const r = parseRepoUrl('https://github.com/octocat/Hello-World/tree/dev', 'main');
    assert.equal(r.owner, 'octocat');
    assert.equal(r.repo, 'Hello-World');
    assert.equal(r.ref, 'dev');
  });
  it('parses fragment ref', () => {
    const r = parseRepoUrl('https://github.com/octocat/Hello-World#test', 'main');
    assert.equal(r.ref, 'test');
  });
});
