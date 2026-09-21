/**
 * The catalog contract.
 *
 * Every language in the matrix is described by a `LanguageSpec`. The spec is
 * static data: variant selection (biome vs eslint, maven vs gradle, ...) is
 * expressed declaratively as `VariantRule`s and resolved by `src/variants.ts`
 * against the target repository. Nothing here reads the filesystem.
 *
 * CI commands live on the tool, not on the language: `ciArgv` is the
 * unguarded, non-auto-fixing form of `argv` that `.github/workflows/` runs.
 * A tool with no `ciArgv` is simply not run by CI's lint job.
 */

/** The quality dimension a tool covers. */
export type Category =
  | 'format'
  | 'lint'
  | 'typecheck'
  | 'deadcode'
  | 'deps'
  | 'sast'
  | 'test'
  | 'coverage';

/** Which lefthook hook runs a tool. */
export type HookName = 'pre-commit' | 'pre-push' | 'commit-msg';

/**
 * A declarative predicate over a repository. All supplied clauses are ANDed;
 * several rules inside `VariantSpec.when` are ORed.
 */
export interface VariantRule {
  /** At least one glob must match a path in the repository. */
  anyPath?: string[];
  /** No listed glob may match any path in the repository. */
  nonePath?: string[];
  /** The named JSON file must exist and declare one of `names`. */
  dep?: { file: string; names: string[] };
  /** The named JSON file must exist and declare none of `names`. */
  noDep?: { file: string; names: string[] };
  /** The named file must exist and its contents must match `pattern`. */
  text?: { file: string; pattern: string };
  /** The named file must exist and its contents must not match `pattern`. */
  notText?: { file: string; pattern: string };
}

/** A named alternative tool set; the first variant whose rule holds wins. */
export interface VariantSpec {
  id: string;
  /** OR list of rules; a selected variant with an empty list is the default. */
  when: VariantRule[];
  tools: ToolSpec[];
}

/** A tool emitted only when its rule holds. */
export interface ConditionalTool {
  tool: ToolSpec;
  when: VariantRule[];
}

export interface ToolSpec {
  /** Stable id; becomes the lefthook command name, e.g. "biome". */
  id: string;
  category: Category;
  hook: HookName;
  /** Exact argv after the launcher; `{staged_files}` where applicable. */
  argv: string;
  /**
   * Unguarded CI command (no `--write`/`--fix`). Omitted => not run in CI.
   *
   * When `ciFiles` is set, this is the **xargs** form — the generator prefixes
   * `git ls-files -z` restricted to the repository's own sources, so a check
   * never lints the files righthook generated.
   */
  ciArgv?: string;
  /** `ciArgv` consumes a NUL-separated file list on stdin. */
  ciFiles?: boolean;
  /** Shell commands run before the CI run (e.g. `mkdir -p coverage`). */
  before?: string[];
  /** Shell commands run after the CI run (e.g. converting a Go profile). */
  after?: string[];
  /** lefthook `glob`; a single pattern, or omitted for whole-repo tools. */
  glob?: string;
  /** lefthook `exclude`, when the tool must ignore generated paths. */
  exclude?: string[];
  /** lefthook order within the hook; lower runs first. `format` is 1. */
  priority: number;
  /** Pass `stage_fixed: true` (pre-commit only). */
  stageFixed?: boolean;
  /** Never emitted into lefthook.yml; needs a full build or index. */
  ciOnly?: boolean;
  /**
   * This tool only post-processes another tool's output.
   *
   * It never owns the CI test job: the job runs the real test command and then
   * this command through the owning tool's `after`.
   */
  afterOnly?: boolean;
  /** Coverage artifact this tool's CI job writes. */
  coverageArtifact?: 'cobertura' | 'lcov';
  /** Repo-root-relative artifact path, when deterministic. */
  coveragePath?: string;
  /** Human install hints surfaced by `righthook doctor`. */
  install?: InstallHints;
}

export interface InstallHints {
  brew?: string;
  npm?: string;
  uv?: string;
  cargo?: string;
  go?: string;
  url?: string;
}

export interface LanguageSpec {
  /** Stable id used on the CLI and in the manifest, e.g. "go". */
  id: string;
  /** Display name for logs. */
  label: string;
  /** Repo-root-relative paths whose presence selects this language. */
  detect: string[];
  /** Extra globs that must also match at least one file. */
  detectAll?: string[];
  /** lefthook `glob` for "any file of this language". */
  fileGlob: string;
  /** GitHub Actions setup step identifiers this language's CI job needs. */
  ciSetup: string[];
  /** Shell commands run after setup to install dependencies. */
  ciInstall?: string[];
  /** Tools emitted for every repository in which this language is detected. */
  tools: ToolSpec[];
  /** Alternative tool sets; the first matching variant replaces `tools`. */
  variants?: VariantSpec[];
  /** Tools appended when their rule holds. */
  conditionalTools?: ConditionalTool[];
  /** Registered for `doctor` only; contributes no hook commands. */
  doctorOnly?: boolean;
  /** Universal tool ids `doctor` should report for this language. */
  doctorTools?: string[];
  /** The ecosystem names this language adds to `.github/dependabot.yml`. */
  dependabot?: string[];
}

/** The order commands are emitted in: hook, then priority, then id. */
export function compareCommands(
  a: Pick<ToolSpec, 'hook' | 'priority' | 'id'>,
  b: Pick<ToolSpec, 'hook' | 'priority' | 'id'>,
): number {
  const hooks: HookName[] = ['pre-commit', 'pre-push', 'commit-msg'];
  const hookDelta = hooks.indexOf(a.hook) - hooks.indexOf(b.hook);
  if (hookDelta !== 0) return hookDelta;
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
