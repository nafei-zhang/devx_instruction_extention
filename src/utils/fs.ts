import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as chardet from 'chardet';
import * as iconv from 'iconv-lite';
import { isText, isBinary } from 'istextorbinary';

export type ConflictPolicy = 'overwrite' | 'skip' | 'rename';

export function resolveTargetPath(baseDir: string, repoRelativePath: string, preserve: boolean): string {
  return preserve ? path.join(baseDir, repoRelativePath) : path.join(baseDir, path.basename(repoRelativePath));
}

export function ensureDirExists(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

export function fileExists(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function applyConflictPolicy(target: string, policy: ConflictPolicy): string | null {
  if (!fileExists(target)) return target;
  if (policy === 'overwrite') return target;
  if (policy === 'skip') return null;
  // rename
  const { dir, name, ext } = path.parse(target);
  let i = 1;
  // Avoid infinite loop; cap at 1000
  while (i < 1000) {
    const candidate = path.join(dir, `${name}.github-${i}${ext}`);
    if (!fileExists(candidate)) return candidate;
    i++;
  }
  return null;
}

export interface WriteResult {
  wrote: boolean;
  path?: string;
  encoding?: string;
  binary?: boolean;
}

export function detectAndNormalizeEncoding(buf: Buffer): { text: string | null; encoding?: string; binary: boolean } {
  // Quick binary check
  const maybeBinary = isBinary(null, buf);
  if (maybeBinary) {
    return { text: null, encoding: undefined, binary: true };
  }
  const detected = chardet.detect(buf) || 'utf-8';
  try {
    const text = iconv.decode(buf, detected as any);
    return { text, encoding: detected, binary: false };
  } catch {
    // Fallback to UTF-8
    try {
      const text = buf.toString('utf8');
      return { text, encoding: 'utf-8', binary: false };
    } catch {
      return { text: null, encoding: undefined, binary: true };
    }
  }
}

export function writeFileSmart(target: string, content: Buffer, policy: ConflictPolicy): WriteResult {
  const finalPath = applyConflictPolicy(target, policy);
  if (!finalPath) return { wrote: false };
  ensureDirExists(finalPath);
  const { text, encoding, binary } = detectAndNormalizeEncoding(content);
  if (binary || text === null) {
    fs.writeFileSync(finalPath, content);
    return { wrote: true, path: finalPath, binary: true };
    }
  fs.writeFileSync(finalPath, text, { encoding: 'utf8' });
  return { wrote: true, path: finalPath, encoding, binary: false };
}
