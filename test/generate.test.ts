import assert from 'node:assert/strict';
import { test } from 'node:test';

import { detectLanguages } from '../src/detect.js';
import type { EmittedCommand } from '../src/generate/lefthook.js';
import { collectCommands, renderLefthook } from '../src/generate/lefthook.js';
import { makeFixture, packageJson } from './helpers.js';

const OPTIONS = { version: '0.0.0-test', righthookDir: '.righthook' };

test('commands are ordered by hook, then priority, then id', () => {
  const fixture = makeFixture({
    'package.json': packageJson({ '@biomejs/biome': '^2.0.0' }),
    'tsconfig.json': '{}\n',
  });
  try {
    const commands = collectCommands(detectLanguages(fixture.root).languages);
    const hooks = commands.map((command) => command.tool.hook);
    const firstPush = hooks.indexOf('pre-push');
    const lastCommit = hooks.indexOf('commit-msg');
    assert.ok(firstPush === -1 || firstPush >= hooks.lastIndexOf('pre-commit'), 'pre-commit first');
    assert.ok(lastCommit === -1 || lastCommit >= hooks.lastIndexOf('pre-push'), 'commit-msg last');

    for (let i = 1; i < commands.length; i += 1) {
      const previous = commands[i - 1] as EmittedCommand;
      const current = commands[i] as EmittedCommand;
      if (previous.tool.hook !== current.tool.hook) continue;
      assert.ok(
        previous.tool.priority <= current.tool.priority,
        `${previous.id}(${previous.tool.priority}) must not follow ${current.id}(${current.tool.priority})`,
      );
    }
  } finally {
    fixture.cleanup();
  }
});

test('formatters run before linters inside pre-commit', () => {
  const fixture = makeFixture({ 'go.mod': 'module x\n' });
  try {
    const preCommit = collectCommands(detectLanguages(fixture.root).languages).filter(
      (command) => command.tool.hook === 'pre-commit',
    );
    const gofmt = preCommit.findIndex((command) => command.id === 'gofmt');
    const golangci = preCommit.findIndex((command) => command.id === 'golangci');
    assert.ok(gofmt >= 0 && golangci >= 0);
    assert.ok(gofmt < golangci, `gofmt (${gofmt}) must precede golangci (${golangci})`);
    assert.equal((preCommit[gofmt] as EmittedCommand).tool.priority, 1);
    assert.equal((preCommit[golangci] as EmittedCommand).tool.priority, 2);
  } finally {
    fixture.cleanup();
  }
});

test('glob is emitted only for commands that take a file placeholder', () => {
  const fixture = makeFixture({
    'package.json': packageJson(),
    'tsconfig.json': '{}\n',
    'pyproject.toml': '[project]\nname = "x"\n',
  });
  try {
    const detectedResult = detectLanguages(fixture.root);
    const detected = detectedResult.languages;
    const yaml = renderLefthook(detected, OPTIONS);
    const commands = collectCommands(detected);

    const wholeRepo = commands.filter(
      (command) =>
        !command.tool.argv.includes('{staged_files}') &&
        !command.tool.argv.includes('{push_files}'),
    );
    assert.ok(wholeRepo.length > 0, 'fixture must have whole-repo tools');
    for (const command of wholeRepo) {
      const lines = yaml.split('\n');
      const start = lines.indexOf(`    ${command.id}:`);
      assert.ok(start >= 0, `${command.id} is missing from the YAML`);
      // A command's body is every following line indented deeper than its key.
      const body: string[] = [];
      for (let i = start + 1; i < lines.length; i += 1) {
        const line = lines[i]!;
        if (line.trim() === '' || !line.startsWith('      ')) break;
        body.push(line);
      }
      assert.ok(
        !body.some((line) => line.startsWith('      glob:')),
        `${command.id} takes no files, so it must have no glob; body was ${JSON.stringify(body)}`,
      );
    }
  } finally {
    fixture.cleanup();
  }
});

test('a file-based tool inherits its language glob instead of seeing every staged file', () => {
  const fixture = makeFixture({
    'go.mod': 'module x\n',
    'README.md': '# hi\n',
    '.editorconfig': 'root = true\n',
  });
  try {
    const commands = collectCommands(detectLanguages(fixture.root).languages);
    const gofmt = commands.find((command) => command.id === 'gofmt')!;
    assert.equal(gofmt.glob, '*.go', 'gofmt must be limited to Go sources');

    // A universal tool keeps its own explicit glob (or none at all).
    const editorconfig = commands.find((command) => command.id === 'editorconfig')!;
    assert.equal(
      editorconfig.glob,
      undefined,
      'editorconfig-checker legitimately checks any text file',
    );
  } finally {
    fixture.cleanup();
  }
});

test('colliding command ids get a language suffix so YAML keys stay unique', () => {
  const fixture = makeFixture({
    'build.gradle': 'plugins {}\n',
    'src/Main.kt': 'fun main() {}\n',
    'src/App.java': 'package app;\nclass App {}\n',
  });
  try {
    // Both languages resolve to the Gradle variant and share `gradle-test`, so
    // the keys must differ or one job would silently vanish from the YAML map.
    const commands = collectCommands(detectLanguages(fixture.root).languages);
    const ids = commands.map((command) => command.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate keys would drop jobs: ${ids}`);
    assert.ok(ids.includes('gradle-test-kotlin'), 'the kotlin gradle-test is disambiguated');
    assert.ok(ids.includes('gradle-test-java'), 'the java gradle-test is disambiguated');
  } finally {
    fixture.cleanup();
  }
});

test('the generated document declares the required top-level settings', () => {
  const fixture = makeFixture({ 'go.mod': 'module x\n' });
  try {
    const yaml = renderLefthook(detectLanguages(fixture.root).languages, OPTIONS);
    assert.match(yaml, /^min_version: 1\.10\.0$/m);
    assert.match(yaml, /^assert_lefthook_installed: true$/m);
    assert.match(yaml, /^skip_lfs: false$/m);
    assert.match(yaml, /^glob_matcher: gobwas$/m);
    assert.match(yaml, /^pre-commit:\n {2}parallel: false\n {2}commands:$/m);
    assert.match(yaml, /^pre-push:\n {2}parallel: false\n {2}commands:$/m);
    assert.match(yaml, /^commit-msg:\n {2}parallel: false\n {2}commands:$/m);
    assert.ok(!yaml.includes('extends:'), 'the file must be self-contained');
  } finally {
    fixture.cleanup();
  }
});

test('every run line goes through the launcher, and stage_fixed is pre-commit only', () => {
  const fixture = makeFixture({
    'go.mod': 'module x\n',
    'package.json': packageJson(),
  });
  try {
    const yaml = renderLefthook(detectLanguages(fixture.root).languages, OPTIONS);
    for (const line of yaml
      .split('\n')
      .filter((candidate) => candidate.trimStart().startsWith('run: '))) {
      assert.match(line, /run: "?sh \.righthook\/run\.sh /, `not launched: ${line}`);
    }
    // `stage_fixed` only makes sense while files are staged.
    const prePush = yaml.slice(yaml.indexOf('pre-push:'));
    assert.ok(!prePush.includes('stage_fixed'), 'pre-push must not declare stage_fixed');
  } finally {
    fixture.cleanup();
  }
});

test('the merge-conflict check never nests a file placeholder inside a quoted shell string', () => {
  const fixture = makeFixture({ 'go.mod': 'module x\n' });
  try {
    const yaml = renderLefthook(detectLanguages(fixture.root).languages, OPTIONS);
    const command = collectCommands(detectLanguages(fixture.root).languages).find(
      (candidate) => candidate.id === 'merge-conflicts',
    )!;
    // lefthook escapes `{staged_files}` after assembling the command string, so
    // a `sh -c '... {staged_files} ...'` form receives a mangled list and dies
    // with "syntax error: unexpected end of file" (reproduced against
    // lefthook v2.1.11). A helper script receives the list as positional
    // arguments instead.
    assert.ok(
      !command.tool.argv.includes("'"),
      'the placeholder must not sit inside a quoted shell string',
    );
    assert.equal(command.tool.argv, 'sh {righthook}/merge-conflicts.sh {staged_files}');
    assert.match(
      yaml,
      /run: "?sh \.righthook\/run\.sh sh \.righthook\/merge-conflicts\.sh \{staged_files\}"?/,
    );
  } finally {
    fixture.cleanup();
  }
});

test('a --root install pins root on every command and reaches .righthook relatively', () => {
  const fixture = makeFixture({ 'services/api/go.mod': 'module api\n' });
  try {
    const detected = detectLanguages(`${fixture.root}/services/api`).languages;
    const yaml = renderLefthook(detected, {
      ...OPTIONS,
      commandRoot: 'services/api',
    });
    const runLines = yaml.split('\n').filter((line) => line.trimStart().startsWith('run: '));
    assert.ok(runLines.length > 0);
    for (const line of runLines) {
      assert.match(line, /run: "?sh \.righthook\/run\.sh /, `subdir run line: ${line}`);
    }
    const roots = yaml.match(/^ {6}root: services\/api$/gm) ?? [];
    assert.equal(roots.length, yaml.match(/^ {4}\S+:$/gm)!.length, 'every command declares root');
  } finally {
    fixture.cleanup();
  }
});

test('ciOnly tools are absent from lefthook.yml but present in CI inputs', () => {
  const fixture = makeFixture({ 'Cargo.toml': '[package]\nname = "x"\n' });
  try {
    const detectedResult = detectLanguages(fixture.root);
    const detected = detectedResult.languages;
    const yaml = renderLefthook(detected, OPTIONS);
    assert.ok(
      !yaml.includes('cargo-llvm-cov'),
      'coverage-only tools need an index, so they stay out of hooks',
    );
    assert.ok(
      detected.flatMap((entry) => entry.tools).some((tool) => tool.id === 'cargo-llvm-cov'),
      'the resolved tool list still carries it for CI',
    );
  } finally {
    fixture.cleanup();
  }
});
