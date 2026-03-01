"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const github_1 = require("../src/github");
describe('GitHub Enterprise support', () => {
    it('deriveApiBase for github.com defaults to api.github.com', () => {
        assert_1.strict.equal((0, github_1.deriveApiBase)('https://github.com', ''), 'https://api.github.com');
    });
    it('deriveApiBase for enterprise host appends /api/v3', () => {
        assert_1.strict.equal((0, github_1.deriveApiBase)('https://ghe.example.com', ''), 'https://ghe.example.com/api/v3');
    });
    it('deriveApiBase respects override', () => {
        assert_1.strict.equal((0, github_1.deriveApiBase)('https://ghe.example.com', 'https://api.ghe.example.com'), 'https://api.ghe.example.com');
    });
    it('parseRepoUrl accepts non-github hosts', () => {
        const r = (0, github_1.parseRepoUrl)('https://ghe.example.com/org/proj/tree/release', 'main');
        assert_1.strict.equal(r.owner, 'org');
        assert_1.strict.equal(r.repo, 'proj');
        assert_1.strict.equal(r.ref, 'release');
    });
});
//# sourceMappingURL=enterprise.test.js.map