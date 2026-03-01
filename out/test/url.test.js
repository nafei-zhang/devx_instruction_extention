"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const github_1 = require("../src/github");
describe('parseRepoUrl', () => {
    it('parses owner/repo', () => {
        const r = (0, github_1.parseRepoUrl)('octocat/Hello-World', 'main');
        assert_1.strict.equal(r.owner, 'octocat');
        assert_1.strict.equal(r.repo, 'Hello-World');
        assert_1.strict.equal(r.ref, 'main');
    });
    it('parses full URL with branch', () => {
        const r = (0, github_1.parseRepoUrl)('https://github.com/octocat/Hello-World/tree/dev', 'main');
        assert_1.strict.equal(r.owner, 'octocat');
        assert_1.strict.equal(r.repo, 'Hello-World');
        assert_1.strict.equal(r.ref, 'dev');
    });
    it('parses fragment ref', () => {
        const r = (0, github_1.parseRepoUrl)('https://github.com/octocat/Hello-World#test', 'main');
        assert_1.strict.equal(r.ref, 'test');
    });
});
//# sourceMappingURL=url.test.js.map