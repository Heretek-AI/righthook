import type { HookName, ToolSpec } from '../catalog/types.js';
import type { DetectedLanguage } from '../detect.js';

/**
 * `lefthook.yml` generation.
 *
 * Three lefthook behaviours drive the shape of this file, all verified against
 * lefthook v2.1.11 (`review/lefthook`):
 *
 * 1. `pre-commit`/`pre-push` use the `commands:` map, not `jobs:`, because
 *    `priority` exists on `Command` but not on `Job`. With `parallel: false`
 *    plus `priority`, formatters run before linters deterministically.
 * 2. `glob` is emitted only for commands whose `argv` contains a file
 *    placeholder. lefthook skips a command whose filtered file list is empty,
 *    which is what makes a polyglot pre-commit cheap.
 * 3. `{staged_files}` is shell-escaped and substituted *after* the command
 *    string is assembled, so it must never appear inside a nested quoted
 *    `sh -c '...'` (the escaping breaks the inner quoting).
 */

export interface GenerateOptions {
  version: string;
  /**
   * Git-root-relative path of the generated `.righthook/` directory, e.g.
   * `.righthook`, `services/api/.righthook`, or
   * `node_modules/righthook/.righthook` for a preset. Every generated `run:`
   * line goes through this directory, because lefthook executes commands with
   * cwd at the git root regardless of where `lefthook.yml` lives.
   */
  righthookDir: string;
  /**
   * lefthook `root:` for every emitted command.
   *
   * lefthook executes commands with cwd at the **git root**, and globs always
   * resolve from there — so for a `--root <subdir>` install every command
   * declares `root: <subdir>`. Without it, whole-repo tools (`golangci-lint`,
   * `typos`) would run against the wrong tree. Omitted at the repository root,
   * where the default already is the root.
   */
  commandRoot?: string;
}

/** Commands that are emitted into `lefthook.yml`, in hook order. */
export interface EmittedCommand {
  id: string;
  tool: ToolSpec;
  language: string;
  /** The effective lefthook `glob`, explicit or inherited from the language. */
  glob?: string;
  /** lefthook `exclude` patterns, always including righthook's own output. */
  exclude: string[];
}

/**
 * Paths righthook itself owns.
 *
 * A generated helper must never be linted or reformatted as if it were the
 * consumer's code — otherwise `ruff check` fails on `coverage_gate.py` and
 * `prettier` rewrites `lefthook.yml`, blocking every commit for a file the
 * user never wrote. CI applies the same exclusions.
 */
export const GENERATED_EXCLUDES = [
  '.righthook/**',
  '.github/workflows/righthook.yml',
  '.github/dependabot.yml',
  'lefthook.yml',
  '.editorconfig',
  '.yamllint.yaml',
  'commitlint.config.mjs',
];

/** Does this argv need a per-file `glob` filter? */
export function needsGlob(tool: ToolSpec): boolean {
  return tool.argv.includes('{staged_files}') || tool.argv.includes('{push_files}');
}

/**
 * Flatten every detected language's tools into an ordered command list.
 *
 * Name collisions across languages get a `-<language>` suffix so the YAML keys
 * stay unique. Universal tools never collide because they are emitted once,
 * from the `universal` entry.
 *
 * The effective glob is the tool's own `glob` when it declares one, otherwise
 * the owning language's `fileGlob`. Without that fallback a tool such as
 * `gofmt` would receive every staged file — including YAML and JSON — and fail.
 * `universal` is the exception: its `fileGlob` is `*`, and each of its tools
 * either declares a glob or genuinely operates on any file.
 */
export function collectCommands(detected: DetectedLanguage[]): EmittedCommand[] {
  const commands: EmittedCommand[] = [];
  for (const entry of detected) {
    const { language } = entry;
    for (const tool of entry.tools) {
      if (tool.ciOnly) continue;
      const glob = tool.glob ?? (language.id === 'universal' ? undefined : language.fileGlob);
      commands.push({
        id: tool.id,
        tool,
        language: language.id,
        glob,
        exclude: [...new Set([...(tool.exclude ?? []), ...GENERATED_EXCLUDES])],
      });
    }
  }

  const counts = new Map<string, number>();
  for (const command of commands) counts.set(command.id, (counts.get(command.id) ?? 0) + 1);
  for (const command of commands) {
    if ((counts.get(command.id) ?? 0) > 1 && command.language !== 'universal') {
      command.id = `${command.id}-${command.language}`;
    }
  }

  commands.sort((a, b) => {
    const hooks: HookName[] = ['pre-commit', 'pre-push', 'commit-msg'];
    const hookDelta = hooks.indexOf(a.tool.hook) - hooks.indexOf(b.tool.hook);
    if (hookDelta !== 0) return hookDelta;
    if (a.tool.priority !== b.tool.priority) return a.tool.priority - b.tool.priority;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return commands;
}

/** YAML scalar quoting: only quote when the value needs it. */
function yamlScalar(value: string): string {
  if (/^[A-Za-z0-9_./@{}$*?,[\]-]+$/.test(value) && !/^[&*!|>%@`]/.test(value)) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** The `run:` value for one command. */
function renderRun(tool: ToolSpec, righthookDir: string): string {
  const argv = tool.argv.replaceAll('{righthook}', righthookDir);
  return `sh ${righthookDir}/run.sh ${argv}`;
}

/**
 * Render the complete `lefthook.yml`.
 *
 * The file is wholly owned by righthook; user customization belongs in
 * `lefthook-local.yml`, lefthook's highest-precedence override file.
 */
export function renderLefthook(detected: DetectedLanguage[], options: GenerateOptions): string {
  const commands = collectCommands(detected);
  const lines: string[] = [];

  lines.push(`# Generated by righthook v${options.version}. Do not edit.`);
  lines.push('# Local overrides belong in lefthook-local.yml (highest precedence).');
  lines.push('min_version: 1.10.0');
  lines.push('assert_lefthook_installed: true');
  lines.push('skip_lfs: false');
  lines.push('colors: true');
  lines.push("# lefthook's default glob engine; pinned so matching stays stable.");
  lines.push('glob_matcher: gobwas');

  const hooks: HookName[] = ['pre-commit', 'pre-push', 'commit-msg'];
  for (const hook of hooks) {
    const hookCommands = commands.filter((command) => command.tool.hook === hook);
    if (hookCommands.length === 0) continue;
    lines.push('');
    lines.push(`${hook}:`);
    lines.push('  parallel: false');
    lines.push('  commands:');
    for (const command of hookCommands) {
      lines.push(`    ${yamlScalar(command.id)}:`);
      lines.push(`      priority: ${command.tool.priority}`);
      if (options.commandRoot) lines.push(`      root: ${yamlScalar(options.commandRoot)}`);
      if (needsGlob(command.tool) && command.glob) {
        lines.push(`      glob: ${yamlScalar(command.glob)}`);
      }
      if (needsGlob(command.tool) && command.exclude.length > 0) {
        lines.push('      exclude:');
        for (const pattern of command.exclude) lines.push(`        - ${yamlScalar(pattern)}`);
      }
      if (command.tool.stageFixed && hook === 'pre-commit') lines.push('      stage_fixed: true');
      lines.push(`      run: ${yamlScalar(renderRun(command.tool, options.righthookDir))}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * The path every generated command uses to reach `.righthook/`.
 *
 * When the generated `lefthook.yml` declares `root: <subdir>` on each command,
 * lefthook runs them with cwd inside that subdirectory, so the scripts are
 * reached as plain `.righthook/...`. At the repository root the same holds,
 * because lefthook's cwd is the git root. Only the presets differ: their
 * scripts live inside the installed package, reached through `node_modules`.
 */
export const LOCAL_RIGHTHOOK_DIR = '.righthook';

/** The path a preset consumer's commands use, inside the installed package. */
export const PRESET_RIGHTHOOK_DIR = 'node_modules/righthook/.righthook';
