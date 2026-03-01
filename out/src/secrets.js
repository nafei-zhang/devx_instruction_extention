"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setSecretToken = setSecretToken;
exports.getSecretToken = getSecretToken;
const SECRET_KEY = 'githubPuller.token';
async function setSecretToken(storage, token) {
    if (!token) {
        await storage.delete(SECRET_KEY);
        return;
    }
    await storage.store(SECRET_KEY, token);
}
async function getSecretToken(storage) {
    return await storage.get(SECRET_KEY);
}
//# sourceMappingURL=secrets.js.map