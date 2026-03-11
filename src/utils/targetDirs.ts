import * as fs from 'fs';
import * as path from 'path';

export interface PathIssue {
  path: string;
  reason: string;
}

export interface ParsedTargetDirs {
  raw: string[];
  normalized: string[];
  issues: PathIssue[];
}

export interface ConfigLike {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

function stripTrailingSeparator(input: string): string {
  if (input.length <= 1) return input;
  return input.replace(/[\\/]+$/, '');
}

function normalizeSinglePath(rawPath: string): string {
  const normalized = path.normalize(rawPath.trim());
  if (!normalized) return '';
  if (normalized === path.parse(normalized).root) return normalized;
  return stripTrailingSeparator(normalized);
}

function isValidPathFormat(p: string): boolean {
  if (!p || p.includes('\u0000')) return false;
  return true;
}

export function splitTargetDirs(input: string): string[] {
  return (input || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

export function parseTargetDirs(input: string, options?: { requireAbsolute?: boolean; requireExists?: boolean }): ParsedTargetDirs {
  const requireAbsolute = options?.requireAbsolute ?? true;
  const requireExists = options?.requireExists ?? true;
  const rawList = splitTargetDirs(input);
  const issues: PathIssue[] = [];
  const deduped = new Set<string>();
  for (const item of rawList) {
    const normalized = normalizeSinglePath(item);
    if (!normalized) {
      issues.push({ path: item, reason: 'Path is empty' });
      continue;
    }
    if (!isValidPathFormat(normalized)) {
      issues.push({ path: item, reason: 'Path format is invalid' });
      continue;
    }
    if (requireAbsolute && !path.isAbsolute(normalized)) {
      issues.push({ path: item, reason: 'Path must be absolute' });
      continue;
    }
    if (requireExists && !fs.existsSync(normalized)) {
      issues.push({ path: item, reason: 'Path does not exist' });
      continue;
    }
    deduped.add(normalized);
  }
  return { raw: rawList, normalized: Array.from(deduped), issues };
}

export function serializeTargetDirs(paths: string[]): string {
  return Array.from(new Set(paths.map(p => normalizeSinglePath(p)).filter(Boolean))).join(',');
}

export function appendTargetDir(currentInput: string, newPath: string, options?: { requireAbsolute?: boolean; requireExists?: boolean }): ParsedTargetDirs {
  const current = splitTargetDirs(currentInput);
  const merged = [...current, newPath];
  return parseTargetDirs(merged.join(','), options);
}

export function readTargetDirsFromConfig(config: ConfigLike): string {
  const multi = config.get<string>('githubPuller.targetDirs') || '';
  if (multi.trim()) return multi;
  const legacy = config.get<string>('githubPuller.defaultTargetDir') || '';
  return legacy.trim();
}

export async function writeTargetDirsToConfig(config: ConfigLike, serialized: string): Promise<void> {
  await config.update('githubPuller.targetDirs', serialized);
  const first = splitTargetDirs(serialized)[0] || '';
  await config.update('githubPuller.defaultTargetDir', first);
}
