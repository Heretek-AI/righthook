import pc from 'picocolors';

/**
 * Every user-facing string.
 *
 * Colour is suppressed when `NO_COLOR` is set or stdout is not a TTY, matching
 * the convention every other CLI honours.
 */
const useColor = !process.env.NO_COLOR && process.stdout.isTTY === true;

const c = {
  bold: (value: string): string => (useColor ? pc.bold(value) : value),
  dim: (value: string): string => (useColor ? pc.dim(value) : value),
  green: (value: string): string => (useColor ? pc.green(value) : value),
  yellow: (value: string): string => (useColor ? pc.yellow(value) : value),
  red: (value: string): string => (useColor ? pc.red(value) : value),
  cyan: (value: string): string => (useColor ? pc.cyan(value) : value),
};

export const report = {
  color: c,

  banner(version: string): string {
    return `${c.bold('righthook')} ${c.dim(`v${version}`)}`;
  },

  notGitRepo(): string {
    return 'not a git repository (run righthook inside a git working tree)';
  },

  writing(path: string): string {
    return `  ${c.green('write')} ${path}`;
  },

  skipping(path: string, reason: string): string {
    return `  ${c.yellow('skip')}  ${path} ${c.dim(`(${reason})`)}`;
  },

  keeping(path: string): string {
    return `  ${c.dim('keep')}  ${path} ${c.dim('(unchanged)')}`;
  },

  wouldWrite(path: string): string {
    return `  ${c.cyan('would write')} ${path}`;
  },

  wouldSkip(path: string, reason: string): string {
    return `  ${c.cyan('would skip')}  ${path} ${c.dim(`(${reason})`)}`;
  },

  alreadyExists(path: string): string {
    return `${path} already exists; re-run with --force to overwrite`;
  },

  refusingModified(path: string): string {
    return `refusing to overwrite ${path} (modified locally); --force to overwrite`;
  },

  localOverrideNote(): string {
    return c.dim(
      '  lefthook.yml is wholly owned by righthook; put local tweaks in lefthook-local.yml' +
        " (lefthook's highest-precedence override file).",
    );
  },

  detected(languages: string[]): string {
    return `detected: ${c.cyan(languages.join(', '))}`;
  },

  unpinnedCaller(reference: string): string {
    return (
      `${c.yellow('warning')}: could not resolve the reusable workflow to a commit SHA\n` +
      `  the caller references ${c.cyan(reference)}\n` +
      `  pin it before relying on branch protection: ${c.dim('npx pinact run')}`
    );
  },

  manifestWritten(path: string, count: number): string {
    return `manifest: ${path} ${c.dim(`(${count} managed files)`)}`;
  },

  installStarted(command: string): string {
    return `installing git hooks: ${c.dim(command)}`;
  },

  /**
   * lefthook only looks for `lefthook.yml` at the git root (or at
   * `$LEFTHOOK_CONFIG`), so a `--root <subdir>` install has to point at the
   * generated file explicitly.
   */
  installEnvNote(configPath: string): string {
    return (
      `  note: lefthook looks for its config at the git root, so this directory ` +
      `needs LEFTHOOK_CONFIG=${configPath}\n` +
      `  export LEFTHOOK_CONFIG=${configPath}   # add this to your shell profile`
    );
  },

  installOk(): string {
    return c.green('git hooks installed');
  },

  installFailed(message: string, command: string): string {
    return (
      `${c.yellow('warning')}: could not install git hooks automatically (${message})\n` +
      `  run it yourself: ${c.cyan(command)}`
    );
  },

  doctorHeader(): string {
    return c.bold('righthook doctor');
  },

  toolInstalled(id: string, language: string): string {
    return `  ${c.green('ok')}      ${id.padEnd(22)} ${c.dim(language)}`;
  },

  toolMissing(id: string, language: string, hint: string): string {
    return `  ${c.red('missing')} ${id.padEnd(22)} ${c.dim(language)}  ${c.cyan(hint)}`;
  },

  driftOk(count: number): string {
    return `${c.green('in sync')} ${c.dim(`(${count} managed files match the manifest)`)}`;
  },

  driftListed(): string {
    return c.yellow('drift detected:');
  },
};
