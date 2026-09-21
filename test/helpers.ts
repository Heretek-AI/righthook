import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Shared fixture helpers: build throwaway git repositories with a given file
 * set, so detection, generation and the drift check are exercised against real
 * trees rather than mocks.
 */

export interface Fixture {
  root: string;
  write(rel: string, content: string): void;
  git(...args: string[]): string;
  cleanup(): void;
}

/** Create a scratch directory with the given files (relative path -> content). */
export function makeFixture(files: Record<string, string> = {}, options: { git?: boolean } = {}): Fixture {
  const root = mkdtempSync(path.join(tmpdir(), 'righthook-test-'));
  const fixture: Fixture = {
    root,
    write(rel, content) {
      const abs = path.join(root, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, content, 'utf8');
    },
    git(...args) {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
  for (const [rel, content] of Object.entries(files)) fixture.write(rel, content);
  if (options.git !== false) {
    fixture.git('init', '-q', '-b', 'main', '.');
    fixture.git('add', '-A');
    fixture.git(
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Test',
      'commit',
      '-qm',
      'init',
      '--allow-empty',
    );
  }
  return fixture;
}

/** A `package.json` with the given dependency sets. */
export function packageJson(devDependencies: Record<string, string> = {}): string {
  return `${JSON.stringify({ name: 'fixture', version: '1.0.0', devDependencies }, null, 2)}\n`;
}
