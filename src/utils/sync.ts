export interface SyncPathIssue {
  value: string;
  reason: string;
}

export type SyncTargetSource = 'configured' | 'workspace-single' | 'workspace-multi' | 'none';

export function splitSyncPaths(input: string): string[] {
  return (input || '').split(',').map(v => v.trim()).filter(Boolean);
}

export function expandSelectedRepoPaths(allFiles: string[], selected: string[]): { files: string[]; issues: SyncPathIssue[] } {
  const issues: SyncPathIssue[] = [];
  const files = new Set<string>();
  const dedupedSelected = Array.from(new Set(selected.map(s => s.trim()).filter(Boolean)));
  for (const raw of dedupedSelected) {
    const normalized = raw.replace(/^\/+|\/+$/g, '');
    if (!normalized) continue;
    const exact = allFiles.includes(normalized);
    if (exact) {
      files.add(normalized);
      continue;
    }
    const prefix = `${normalized}/`;
    const matched = allFiles.filter(f => f === normalized || f.startsWith(prefix));
    if (matched.length === 0) {
      issues.push({ value: raw, reason: 'No file matched in repository tree' });
      continue;
    }
    for (const m of matched) files.add(m);
  }
  return { files: Array.from(files), issues };
}

export function resolveSyncTargetRoots(configuredTargets: string[], workspaceRoots: string[]): string[] {
  return resolveSyncTargets(configuredTargets, workspaceRoots).targets;
}

export function resolveSyncTargets(configuredTargets: string[], workspaceRoots: string[]): { targets: string[]; source: SyncTargetSource } {
  const configured = Array.from(new Set(configuredTargets.map(t => t.trim()).filter(Boolean)));
  if (configured.length > 0) return { targets: configured, source: 'configured' };
  const workspace = Array.from(new Set(workspaceRoots.map(t => t.trim()).filter(Boolean)));
  if (workspace.length === 0) return { targets: [], source: 'none' };
  if (workspace.length === 1) return { targets: workspace, source: 'workspace-single' };
  return { targets: workspace, source: 'workspace-multi' };
}

export function pickToken(secretToken: string | undefined, fallbackToken: string): string {
  if (secretToken && secretToken.trim()) return secretToken.trim();
  return (fallbackToken || '').trim();
}
