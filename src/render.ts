import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { DetectedLanguage } from './detect.js';
import {
  COMMITLINT_CONFIG,
  EDITORCONFIG,
  GITLEAKS_PLACEHOLDER,
  JSCPD_CONFIG,
  OSV_SCANNER_CONFIG,
  YAMLLINT_CONFIG,
  renderDependabot,
} from './generate/aux.js';
import { LOCAL_RIGHTHOOK_DIR, renderLefthook } from './generate/lefthook.js';
import { COVERAGE_GATE_PY, MERGE_CONFLICTS_SH, RUN_SH, SIMPLECOV_RB } from './generate/runSh.js';
import { renderCaller, renderVendored } from './generate/workflows.js';
import type { ManifestOptions } from './manifest.js';

/**
 * The render pipeline.
 *
 * Every managed file is produced in memory first, keyed by repo-root-relative
 * path. That is what makes `--dry-run` exact and lets `sync` decide what it may
 * overwrite before touching the filesystem.
 */

export interface RenderInput {
  version: string;
  /** Absolute path of the git root. */
  gitRoot: string;
  /** Absolute path of the directory `lefthook.yml` is written into. */
  jobRoot: string;
  /** Git-root-relative path of `jobRoot`; `''` for the root itself. */
  root: string;
  detected: DetectedLanguage[];
  options: ManifestOptions;
  /** `owner/repo/.github/workflows/ci.yml@<sha>`, for `--ci-mode=caller`. */
  packageRef: string;
}

/** Managed paths that live beside `lefthook.yml` (`--root`-relative). */
export const MANAGED_PATHS = {
  lefthook: 'lefthook.yml',
  runSh: '.righthook/run.sh',
  mergeConflicts: '.righthook/merge-conflicts.sh',
  coverageGate: '.righthook/coverage_gate.py',
  jscpd: '.righthook/jscpd.json',
  osvScanner: '.righthook/osv-scanner.toml',
  simplecov: '.righthook/simplecov.rb',
  editorconfig: '.editorconfig',
  yamllint: '.yamllint.yaml',
  commitlint: 'commitlint.config.mjs',
  gitleaks: '.gitleaks.toml',
} as const;

/** Managed paths that GitHub alone looks for, always at the git root. */
export const GITHUB_PATHS = {
  workflow: '.github/workflows/righthook.yml',
  dependabot: '.github/dependabot.yml',
} as const;

/** Join a git-root-relative prefix with a relative path. */
export function joinRoot(root: string, rel: string): string {
  const prefix = root.replace(/^\.\/+/, '').replace(/\/+$/, '');
  return prefix === '' || prefix === '.' ? rel : `${prefix}/${rel}`;
}

/** Everything to write, keyed by git-root-relative path in write order. */
export type RenderedFiles = Map<string, string>;

/**
 * Render every managed file.
 *
 * `lefthook.yml`, `.righthook/run.sh` and `.righthook/coverage_gate.py` are
 * unconditional. Each remaining file exists because a generated command (or a
 * CI job) names it, so a Go-only repository never receives a
 * `commitlint.config.mjs` it cannot use.
 */
export function renderAll(input: RenderInput): RenderedFiles {
  const { detected, options, version, root } = input;
  const files: RenderedFiles = new Map();
  const ids = new Set(detected.map((entry) => entry.language.id));
  const tools = detected.flatMap((entry) => entry.tools);
  const hasTool = (id: string): boolean => tools.some((tool) => tool.id === id);

  const local = (rel: string): string => joinRoot(root, rel);

  files.set(
    local(MANAGED_PATHS.lefthook),
    renderLefthook(detected, {
      version,
      righthookDir: LOCAL_RIGHTHOOK_DIR,
      commandRoot: root === '.' ? undefined : root,
    }),
  );
  files.set(local(MANAGED_PATHS.runSh), RUN_SH);
  files.set(local(MANAGED_PATHS.mergeConflicts), MERGE_CONFLICTS_SH);
  files.set(local(MANAGED_PATHS.coverageGate), COVERAGE_GATE_PY);
  files.set(local(MANAGED_PATHS.jscpd), JSCPD_CONFIG);
  files.set(local(MANAGED_PATHS.osvScanner), OSV_SCANNER_CONFIG);
  files.set(local(MANAGED_PATHS.editorconfig), EDITORCONFIG);

  if (ids.has('ruby')) files.set(local(MANAGED_PATHS.simplecov), SIMPLECOV_RB);
  if (hasTool('yamllint') || hasTool('markdownlint')) {
    files.set(local(MANAGED_PATHS.yamllint), YAMLLINT_CONFIG);
  }
  if (hasTool('commitlint')) files.set(local(MANAGED_PATHS.commitlint), COMMITLINT_CONFIG);
  if (options.secretsTool === 'gitleaks') {
    files.set(local(MANAGED_PATHS.gitleaks), GITLEAKS_PLACEHOLDER);
  }

  // GitHub reads workflows and dependabot config only at the repository root.
  files.set(
    GITHUB_PATHS.workflow,
    options.ciMode === 'caller'
      ? renderCaller(detected, options, input.packageRef, version)
      : renderVendored(detected, options, version),
  );
  files.set(GITHUB_PATHS.dependabot, renderDependabot(detected));

  return files;
}

/**
 * Pin a reusable-workflow reference to a commit SHA.
 *
 * Emitting a tag would fail the very `zizmor --pedantic` job the generated
 * workflow deploys, so the tag is resolved against the remote here. When the
 * remote cannot be reached the tag is kept and the caller is told to pin it,
 * because inventing a SHA would be worse than an obvious unpinned ref.
 */
export interface PinnedRef {
  /** The `uses:` value, pinned to a commit SHA when resolution succeeded. */
  ref: string;
  /** False when the tag could not be resolved and was emitted verbatim. */
  pinned: boolean;
}

export function pinRemoteRef(ownerRepo: string, ref: string): PinnedRef {
  const [owner, name] = ownerRepo.split('/');
  if (!owner || !name) return { ref: `${ownerRepo}@${ref}`, pinned: false };
  try {
    const out = execFileSync('git', ['ls-remote', `https://github.com/${owner}/${name}`, `refs/tags/${ref}`, ref], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15_000,
    });
    const sha = out
      .split('\n')
      .map((line) => line.trim().split(/\s+/)[0])
      .find((candidate) => candidate && /^[0-9a-f]{40}$/.test(candidate));
    if (sha) {
      return { ref: `${ownerRepo}/.github/workflows/ci.yml@${sha} # ${ref}`, pinned: true };
    }
  } catch {
    // Offline, or the repository is not published yet.
  }
  return { ref: `${ownerRepo}/.github/workflows/ci.yml@${ref}`, pinned: false };
}

/** Locate the git repository root, or throw a CLI-friendly error. */
export function gitRoot(cwd: string): string {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim();
  } catch {
    throw new Error('not a git repository (run righthook inside a git working tree)');
  }
}

/** Read the package version from the installed `package.json`. */
export function packageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** True when a path exists on disk. */
export function fileExists(abs: string): boolean {
  return existsSync(abs);
}

export { path };
