import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Managed-file bookkeeping.
 *
 * Every file righthook writes is hashed into `.righthook/manifest.json`. On a
 * later `sync`, a file whose on-disk hash differs from the recorded one is
 * treated as locally edited and left alone unless `--force`.
 */

/**
 * How the GitHub Actions pipeline is delivered.
 *
 * - `vendored` (the default) — the jobs are written into the consumer's
 *   repository. This is the mode righthook's own repository uses, and the only
 *   one verified end to end.
 * - `caller` — a thin call to the reusable workflow, pinned to a commit SHA.
 *   Documented and generated, but not yet verified green on a live repository:
 *   see the README's limitations section.
 */
export type CiMode = 'vendored' | 'caller';

export interface ManifestOptions {
  coverageThreshold: number;
  diffCoverage: number;
  ciMode: CiMode;
  secretsTool: 'betterleaks' | 'gitleaks';
  root: string;
}

export interface Manifest {
  /** righthook package version that wrote the manifest. */
  version: string;
  /** ISO-8601 timestamp of the writing run. */
  generatedAt: string;
  /** Ordered language ids; `universal` first. */
  languages: string[];
  /** Variant-selecting facts, e.g. `{"typescript.variant":"biome"}`. */
  markers: Record<string, string>;
  options: ManifestOptions;
  /** Repo-root-relative path -> sha256 hex of the written contents. */
  files: Record<string, string>;
}

export const MANIFEST_PATH = '.righthook/manifest.json';

/** sha256 hex digest of a buffer or string. */
export function hashContent(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** sha256 hex digest of a file's bytes; `undefined` when unreadable. */
export function hashFile(absPath: string): string | undefined {
  try {
    return hashContent(readFileSync(absPath));
  } catch {
    return undefined;
  }
}

export function readManifest(root: string): Manifest | undefined {
  const abs = path.join(root, MANIFEST_PATH);
  if (!existsSync(abs)) return undefined;
  try {
    return JSON.parse(readFileSync(abs, 'utf8')) as Manifest;
  } catch {
    return undefined;
  }
}

export type DriftState = 'ok' | 'modified' | 'missing' | 'untracked';

export interface DriftEntry {
  path: string;
  state: DriftState;
  /** Hash of the file on disk, when it exists. */
  actual?: string;
  /** Hash the manifest recorded, when the file is tracked. */
  expected?: string;
}

/**
 * Compare every recorded file against the working tree.
 *
 * `untracked` is reported for a file that exists on disk but is not recorded
 * in the manifest — for `init`, that is a pre-existing user file.
 */
export function checkDrift(root: string, manifest: Manifest): DriftEntry[] {
  const entries: DriftEntry[] = [];
  for (const [rel, expected] of Object.entries(manifest.files).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    const actual = hashFile(path.join(root, rel));
    if (actual === undefined) {
      entries.push({ path: rel, state: 'missing', expected });
    } else if (actual !== expected) {
      entries.push({ path: rel, state: 'modified', actual, expected });
    } else {
      entries.push({ path: rel, state: 'ok', actual, expected });
    }
  }
  return entries;
}

/** Atomic write: `<path>.righthook-tmp` then rename over the target. */
export function writeFileAtomic(absPath: string, content: string): void {
  mkdirSync(path.dirname(absPath), { recursive: true });
  const tmp = `${absPath}.righthook-tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, absPath);
}

/** Serialize the manifest deterministically (stable key order, trailing NL). */
export function serializeManifest(manifest: Manifest): string {
  const files: Record<string, string> = {};
  for (const key of Object.keys(manifest.files).sort()) files[key] = manifest.files[key]!;
  const markers: Record<string, string> = {};
  for (const key of Object.keys(manifest.markers).sort()) markers[key] = manifest.markers[key]!;
  const normalized: Manifest = {
    version: manifest.version,
    generatedAt: manifest.generatedAt,
    languages: manifest.languages,
    markers,
    options: manifest.options,
    files,
  };
  return `${JSON.stringify(normalized, null, 2)}\n`;
}
