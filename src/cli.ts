import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { knownLanguageIds, LANGUAGES } from './catalog/index.js';
import type { InstallHints, ToolSpec } from './catalog/types.js';
import { detectLanguages, parseLanguageList } from './detect.js';
import type { CiMode } from './manifest.js';
import {
  checkDrift,
  hashContent,
  MANIFEST_PATH,
  type Manifest,
  type ManifestOptions,
  readManifest,
  serializeManifest,
  writeFileAtomic,
} from './manifest.js';
import {
  gitRoot,
  joinRoot,
  MANAGED_PATHS,
  packageVersion,
  pinRemoteRef,
  type RenderedFiles,
  renderAll,
} from './render.js';
import { report } from './report.js';
import { generate as generatePresets } from './scripts/emit-presets.js';

/**
 * The `righthook` command line.
 *
 * Hand-rolled argument parsing: the surface is nine flags for one job, and
 * pulling a parser in would be more code than the parsing itself.
 */

const USAGE = `righthook - deploy lefthook hooks and a GitHub Actions pipeline

Usage
  righthook init   [options]   write the managed files and install git hooks
  righthook sync   [options]   re-render the managed files (alias of init)
  righthook doctor [--json]    report which tools are installed locally
  righthook presets            print the reusable workflow and preset YAML

Options
  --languages a,b       override detection entirely
  --add-languages x,y   union with the detected languages
  --coverage-threshold  minimum total line coverage percentage (default 80)
  --diff-coverage       minimum changed-line coverage on PRs (default 80)
  --ci-mode             vendored (default), caller, or local
  --secrets-tool        betterleaks (default) or gitleaks
  --root <dir>          write lefthook.yml and .righthook/ under <dir>
  --force               overwrite files that were modified locally
  --no-install          skip 'lefthook install'
  --dry-run             print what would change, write nothing
  --json                doctor: emit machine-readable output
  -h, --help            show this help
  -v, --version         show the righthook version
`;

export interface CliOptions {
  languages?: string[];
  addLanguages?: string[];
  /** Unset when the flag was not given, so a recorded value can win. */
  coverageThreshold?: number;
  diffCoverage?: number;
  ciMode?: CiMode;
  secretsTool?: 'betterleaks' | 'gitleaks';
  root: string;
  force: boolean;
  install: boolean;
  dryRun: boolean;
  json: boolean;
}

interface ParsedArgs {
  command: string;
  options: CliOptions;
  errors: string[];
}

const DEFAULTS: CliOptions = {
  root: '.',
  force: false,
  install: true,
  dryRun: false,
  json: false,
};

/** Parse one numeric flag, recording a friendly error on malformed input. */
function parseNumber(
  value: string | undefined,
  flag: string,
  errors: string[],
): number | undefined {
  if (value === undefined) {
    errors.push(`${flag} requires a value`);
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    errors.push(`${flag} must be a percentage between 0 and 100 (got "${value}")`);
    return undefined;
  }
  return parsed;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const options: CliOptions = { ...DEFAULTS };
  const errors: string[] = [];
  let command = 'init';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const next = (): string | undefined => argv[++i];
    switch (arg) {
      case 'init':
      case 'sync':
      case 'doctor':
      case 'presets':
        command = arg;
        break;
      case '--languages':
        options.languages = parseLanguageList(next() ?? '');
        break;
      case '--add-languages':
        options.addLanguages = parseLanguageList(next() ?? '');
        break;
      case '--coverage-threshold': {
        const value = parseNumber(next(), '--coverage-threshold', errors);
        if (value !== undefined) options.coverageThreshold = value;
        break;
      }
      case '--diff-coverage': {
        const value = parseNumber(next(), '--diff-coverage', errors);
        if (value !== undefined) options.diffCoverage = value;
        break;
      }
      case '--ci-mode': {
        const value = next();
        if (value !== 'vendored' && value !== 'caller' && value !== 'local') {
          errors.push('--ci-mode must be "vendored", "caller" or "local"');
        } else {
          options.ciMode = value;
        }
        break;
      }
      case '--secrets-tool': {
        const value = next();
        if (value !== 'betterleaks' && value !== 'gitleaks') {
          errors.push('--secrets-tool must be "betterleaks" or "gitleaks"');
        } else {
          options.secretsTool = value;
        }
        break;
      }
      case '--root': {
        const value = next();
        if (value === undefined) errors.push('--root requires a value');
        else options.root = value;
        break;
      }
      case '--force':
        options.force = true;
        break;
      case '--no-install':
        options.install = false;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '-h':
      case '--help':
        command = 'help';
        break;
      case '-v':
      case '--version':
        command = 'version';
        break;
      default:
        if (arg.startsWith('--') && arg.includes('=')) {
          argv.splice(i, 1, arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1));
          i -= 1;
        } else {
          errors.push(`unknown argument "${arg}"`);
        }
    }
  }

  return { command, options, errors };
}

/** Fail early on an unknown `--languages` id, before any file is written. */
function validateLanguages(options: CliOptions): void {
  const known = new Set(LANGUAGES.map((language) => language.id));
  for (const id of [...(options.languages ?? []), ...(options.addLanguages ?? [])]) {
    if (!known.has(id)) {
      throw new Error(`unknown language "${id}"; known: ${knownLanguageIds().join(', ')}`);
    }
  }
}

interface WritePlan {
  path: string;
  action: 'write' | 'skip-modified' | 'skip-unmanaged' | 'keep';
  reason?: string;
}

/**
 * Decide what to do with each rendered file.
 *
 * Three cases matter, and the middle one is subtle:
 *
 * - On disk unmodified and the generated content is identical → nothing to do.
 * - On disk unmodified, but the generated content *changed* (a flag, a detected
 *   language, or a package upgrade altered the template) → write. This is what
 *   `sync` exists for; refusing it would make upgrades impossible.
 * - On disk differing from what the manifest recorded → a local edit. Refuse,
 *   unless `--force`.
 *
 * A file present on disk but never recorded is a hand-written file from before
 * righthook was installed, and is protected the same way.
 *
 * `lefthook.yml` is always rewritten: it is wholly owned by righthook, and
 * local customization has its own sanctioned home (`lefthook-local.yml`).
 */
export function planWrites(
  root: string,
  files: RenderedFiles,
  manifest: Manifest | undefined,
  force: boolean,
  whitelist: string[] = [],
): WritePlan[] {
  const plan: WritePlan[] = [];
  const recorded = manifest?.files ?? {};
  const always = new Set(whitelist);

  for (const [rel, content] of files) {
    const existing = hashFileSafe(path.join(root, rel));
    const expected = recorded[rel];
    const newHash = hashContent(content);

    if (existing === undefined) {
      plan.push({ path: rel, action: 'write' });
    } else if (existing === newHash) {
      plan.push({ path: rel, action: 'keep' });
    } else if (force || always.has(rel)) {
      plan.push({ path: rel, action: 'write' });
    } else if (expected === undefined) {
      plan.push({
        path: rel,
        action: 'skip-unmanaged',
        reason: 'exists, not managed by righthook',
      });
    } else if (existing !== expected) {
      plan.push({
        path: rel,
        action: 'skip-modified',
        reason: 'modified locally',
      });
    } else {
      plan.push({ path: rel, action: 'write' });
    }
  }
  return plan;
}

function hashFileSafe(abs: string): string | undefined {
  try {
    return hashContent(readFileSync(abs));
  } catch {
    return undefined;
  }
}

/** Run `init` or `sync`. */
async function runInit(cli: CliOptions, cwd: string, mode: 'init' | 'sync'): Promise<number> {
  validateLanguages(cli);
  const root = gitRoot(cwd);
  const jobRoot = path.resolve(root, cli.root);
  const relRoot = path.relative(root, jobRoot).split(path.sep).join('/');

  const version = packageVersion();
  const detectedResult = detectLanguages(jobRoot, {
    languages: cli.languages,
    addLanguages: cli.addLanguages,
  });
  const detected = detectedResult.languages;

  const existingManifest = readManifest(root);

  // A command-line flag wins; otherwise a previously recorded choice is
  // honoured, so `righthook sync` re-renders the configuration the repository
  // was actually set up with rather than silently reverting it to defaults.
  const options: ManifestOptions = {
    coverageThreshold: cli.coverageThreshold ?? existingManifest?.options.coverageThreshold ?? 80,
    diffCoverage: cli.diffCoverage ?? existingManifest?.options.diffCoverage ?? 80,
    ciMode: cli.ciMode ?? existingManifest?.options.ciMode ?? 'vendored',
    secretsTool: cli.secretsTool ?? existingManifest?.options.secretsTool ?? 'betterleaks',
    root: relRoot === '' ? '.' : relRoot,
  };
  // The caller mode must reference a pinned commit, so the release tag is
  // resolved against the published repository rather than emitted verbatim.
  const pinned = pinRemoteRef('Heretek-AI/righthook', 'v1');

  // `init` into a repository that already has a hand-written lefthook.yml is
  // refused, because the write would silently discard it.
  const lefthookRel = joinRoot(relRoot === '' ? '.' : relRoot, MANAGED_PATHS.lefthook);
  if (existingManifest === undefined && !cli.force && fileExistsAt(path.join(root, lefthookRel))) {
    process.stderr.write(`${report.alreadyExists(lefthookRel)}\n`);
    return 1;
  }

  const files = renderAll({
    version,
    gitRoot: root,
    jobRoot,
    root: relRoot === '' ? '.' : relRoot,
    detected,
    options,
    packageRef: pinned.ref,
  });

  const plan = planWrites(root, files, existingManifest, cli.force, [lefthookRel]);
  process.stdout.write(`${report.banner(version)}\n`);
  process.stdout.write(`${report.detected(detected.map((entry) => entry.language.id))}\n`);
  if (existingManifest && mode === 'sync') {
    const drift = checkDrift(root, existingManifest);
    const drifted = drift.filter((entry) => entry.state !== 'ok');
    if (drifted.length === 0) process.stdout.write(`${report.driftOk(drift.length)}\n`);
    else process.stdout.write(`${report.driftListed()}\n`);
  }

  let refused = 0;
  for (const decision of plan) {
    if (cli.dryRun) {
      if (decision.action === 'write')
        process.stdout.write(`${report.wouldWrite(decision.path)}\n`);
      else if (decision.action === 'keep')
        process.stdout.write(`${report.keeping(decision.path)}\n`);
      else process.stdout.write(`${report.wouldSkip(decision.path, decision.reason ?? '')}\n`);
      continue;
    }
    if (decision.action === 'write') {
      writeFileAtomic(path.join(root, decision.path), files.get(decision.path)!);
      process.stdout.write(`${report.writing(decision.path)}\n`);
    } else if (decision.action === 'keep') {
      process.stdout.write(`${report.keeping(decision.path)}\n`);
    } else {
      process.stdout.write(`${report.skipping(decision.path, decision.reason ?? '')}\n`);
      refused += 1;
    }
  }

  if (cli.dryRun) {
    process.stdout.write(`${report.localOverrideNote()}\n`);
    return refused > 0 && mode === 'sync' ? 1 : 0;
  }

  // The manifest records only what righthook actually wrote this run.
  // A skipped file stays in the manifest only when a previous run recorded it:
  // the hash is carried forward so a later `--force` can still detect drift.
  const written: Record<string, string> = {};
  for (const decision of plan) {
    if (decision.action === 'write' || decision.action === 'keep') {
      written[decision.path] = hashContent(files.get(decision.path)!);
    } else if (existingManifest?.files[decision.path]) {
      written[decision.path] = existingManifest.files[decision.path]!;
    }
  }

  const manifest: Manifest = {
    version,
    generatedAt: new Date().toISOString(),
    languages: detected.map((entry) => entry.language.id),
    markers: detectedResult.markers,
    options,
    files: written,
  };
  process.stdout.write('');
  writeFileAtomic(path.join(root, MANIFEST_PATH), serializeManifest(manifest));
  process.stdout.write(`${report.manifestWritten(MANIFEST_PATH, Object.keys(written).length)}\n`);
  process.stdout.write(`${report.localOverrideNote()}\n`);

  // lefthook only discovers its config at the git root, so a `--root <subdir>`
  // install must name the generated file through `$LEFTHOOK_CONFIG`.
  const configRel = path.relative(root, path.join(root, lefthookRel)).split(path.sep).join('/');
  const needsConfigEnv = configRel !== 'lefthook.yml';
  if (needsConfigEnv) {
    process.stdout.write(`${report.installEnvNote(configRel)}\n`);
  }

  if (cli.ciMode === 'caller' && !pinned.pinned) {
    process.stdout.write(`${report.unpinnedCaller(pinned.ref)}\n`);
  }

  if (cli.install) {
    const command = needsConfigEnv
      ? `LEFTHOOK_CONFIG=${configRel} npx --yes lefthook install`
      : 'npx --yes lefthook install';
    process.stdout.write(`${report.installStarted(command)}\n`);
    const result = spawnSync('npx', ['--yes', 'lefthook', 'install'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: needsConfigEnv ? { ...process.env, LEFTHOOK_CONFIG: configRel } : process.env,
    });
    if (result.status === 0) {
      process.stdout.write(`${report.installOk()}\n`);
    } else {
      const message = (result.stderr || result.stdout || 'unknown error').trim().split('\n')[0]!;
      process.stdout.write(`${report.installFailed(message, command)}\n`);
    }
  }

  return refused > 0 && mode === 'sync' ? 1 : 0;
}

function fileExistsAt(abs: string): boolean {
  return existsSync(abs);
}

/** First applicable install hint, in the documented preference order. */
export function installHint(hints: InstallHints | undefined): string {
  if (!hints) return 'see the tool documentation';
  return (
    hints.brew ??
    hints.npm ??
    hints.uv ??
    hints.cargo ??
    hints.go ??
    hints.url ??
    'see the tool documentation'
  );
}

/** Is `tool` resolvable on PATH (or in `node_modules/.bin`)? */
export function toolInstalled(tool: string, cwd: string): boolean {
  if (tool.includes('/')) {
    return fileExistsAt(path.resolve(cwd, tool));
  }
  const local = path.join(cwd, 'node_modules', '.bin', tool);
  if (fileExistsAt(local)) return true;
  const result = spawnSync('sh', ['-c', `command -v ${shellQuote(tool)}`], {
    cwd,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  return result.status === 0;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Run `doctor`: report local tool availability per detected language. */
function runDoctor(cli: CliOptions, cwd: string): number {
  const root = gitRoot(cwd);
  const jobRoot = path.resolve(root, cli.root);
  const detectedResult = detectLanguages(jobRoot, {
    languages: cli.languages,
    addLanguages: cli.addLanguages,
  });
  const detected = detectedResult.languages;

  const universalTools = new Map(
    detected.flatMap((entry) => entry.tools).map((tool) => [tool.id, tool]),
  );
  const rows: {
    id: string;
    language: string;
    installed: boolean;
    install: string;
  }[] = [];

  for (const entry of detected) {
    const tools: ToolSpec[] = [...entry.tools];
    for (const id of entry.language.doctorTools ?? []) {
      const tool = universalTools.get(id);
      if (tool && !tools.some((candidate) => candidate.id === id)) tools.push(tool);
    }
    for (const tool of tools) {
      const executable = tool.argv.split(' ')[0]!;
      rows.push({
        id: `${tool.id} (${executable})`,
        language: entry.language.id,
        installed: toolInstalled(executable, jobRoot),
        install: installHint(tool.install),
      });
    }
  }

  if (cli.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          languages: detected.map((entry) => entry.language.id),
          markers: detectedResult.markers,
          tools: rows,
        },
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  process.stdout.write(`${report.doctorHeader()}\n`);
  process.stdout.write(`${report.detected(detected.map((entry) => entry.language.id))}\n`);
  for (const row of rows) {
    process.stdout.write(
      row.installed
        ? `${report.toolInstalled(row.id, row.language)}\n`
        : `${report.toolMissing(row.id, row.language, row.install)}\n`,
    );
  }
  process.stdout.write(
    `${report.color.dim('  missing tools are skipped locally; CI runs every check unguarded')}\n`,
  );
  return 0;
}

/** Entry point used by `bin/righthook.js`. */
export async function run(argv: string[], cwd = process.cwd()): Promise<number> {
  const { command, options, errors } = parseArgs(argv);

  if (command === 'help') {
    process.stdout.write(USAGE);
    return 0;
  }
  if (command === 'version') {
    process.stdout.write(`${packageVersion()}\n`);
    return 0;
  }
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`righthook: ${error}\n`);
    process.stderr.write(USAGE);
    return 2;
  }

  switch (command) {
    case 'doctor':
      return runDoctor(options, cwd);
    case 'presets':
      process.stdout.write(generatePresets(packageVersion()));
      return 0;
    default:
      return runInit(options, cwd, command === 'sync' ? 'sync' : 'init');
  }
}
