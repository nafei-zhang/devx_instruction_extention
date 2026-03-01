import * as vscode from 'vscode';

const SECRET_KEY = 'githubPuller.token';

export async function setSecretToken(storage: vscode.SecretStorage, token: string | undefined) {
  if (!token) {
    await storage.delete(SECRET_KEY);
    return;
  }
  await storage.store(SECRET_KEY, token);
}

export async function getSecretToken(storage: vscode.SecretStorage): Promise<string | undefined> {
  return await storage.get(SECRET_KEY);
}
