import assert from 'node:assert/strict';
import { test } from 'node:test';
import { knownLanguageIds, languageById } from '../src/catalog/index.js';
import { detectLanguages } from '../src/detect.js';
import {
  allToolsFor,
  buildRepoIndex,
  evaluateRules,
  matchIndex,
  resolveTools,
  selectVariant,
} from '../src/variants.js';
import { makeFixture, packageJson } from './helpers.js';

test('detection picks each core language from its marker file', () => {
  const cases: [string, Record<string, string>, string[]][] = [
    ['typescript', { 'package.json': packageJson() }, ['typescript']],
    ['python', { 'pyproject.toml': '[project]\nname = "x"\n' }, ['python']],
    ['go', { 'go.mod': 'module x\n' }, ['go']],
    ['rust', { 'Cargo.toml': '[package]\nname = "x"\n' }, ['rust']],
    ['ruby', { Gemfile: "source 'https://rubygems.org'\n" }, ['ruby']],
    ['php', { 'composer.json': '{}\n' }, ['php']],
    ['java', { 'pom.xml': '<project/>\n' }, ['java']],
    ['dotnet', { 'App.csproj': '<Project/>\n' }, ['dotnet']],
    ['swift', { 'Package.swift': '// swift\n' }, ['swift']],
    ['dart', { 'pubspec.yaml': 'name: x\n' }, ['dart']],
    ['cpp', { 'CMakeLists.txt': 'project(x)\n' }, ['cpp']],
    ['terraform', { 'main.tf': 'resource "x" "y" {}\n' }, ['terraform']],
    ['sql', { 'q.sql': 'select 1;\n' }, ['sql']],
    ['nix', { 'flake.nix': '{}\n' }, ['nix']],
  ];

  for (const [language, files, expected] of cases) {
    const fixture = makeFixture(files);
    try {
      const result = detectLanguages(fixture.root);
      const ids = result.languages.map((entry) => entry.language.id);
      assert.ok(ids.includes('universal'), `${language}: universal must always be first`);
      assert.equal(ids[0], 'universal', `${language}: universal must sort first`);
      for (const id of expected) {
        assert.ok(ids.includes(id), `${language}: expected ${id} in ${ids.join(',')}`);
      }
    } finally {
      fixture.cleanup();
    }
  }
});

test('kotlin needs a .kt file, and a Gradle build script alone selects neither JVM language', () => {
  const gradleOnly = makeFixture({ 'build.gradle.kts': 'plugins {}\n' });
  const kotlinSource = makeFixture({
    'build.gradle.kts': 'plugins {}\n',
    'src/Main.kt': 'fun main() {}\n',
  });
  const javaSource = makeFixture({
    'build.gradle.kts': 'plugins {}\n',
    'src/App.java': 'package app;\nclass App {}\n',
  });
  try {
    const idsOf = (root: string): string[] =>
      detectLanguages(root).languages.map((entry) => entry.language.id);
    assert.ok(!idsOf(gradleOnly.root).includes('kotlin'), 'no .kt file, no kotlin');
    assert.ok(
      !idsOf(gradleOnly.root).includes('java'),
      'a bare Gradle script is ambiguous, so java must not be assumed either',
    );
    assert.ok(idsOf(kotlinSource.root).includes('kotlin'), 'a .kt file selects kotlin');
    assert.ok(
      !idsOf(kotlinSource.root).includes('java'),
      'a Kotlin-only Gradle project must not also run the Java analyzers',
    );
    assert.ok(idsOf(javaSource.root).includes('java'), 'a .java file selects java');
  } finally {
    gradleOnly.cleanup();
    kotlinSource.cleanup();
    javaSource.cleanup();
  }
});

test('a polyglot repository detects every language present', () => {
  const fixture = makeFixture({
    'package.json': packageJson(),
    'pyproject.toml': '[project]\nname = "x"\n',
    'go.mod': 'module x\n',
    Dockerfile: 'FROM scratch\n',
    'run.sh': '#!/bin/sh\necho hi\n',
  });
  try {
    const ids = detectLanguages(fixture.root).languages.map((entry) => entry.language.id);
    for (const id of ['universal', 'typescript', 'python', 'go', 'docker', 'shell']) {
      assert.ok(ids.includes(id), `expected ${id} in ${ids.join(',')}`);
    }
  } finally {
    fixture.cleanup();
  }
});

test('--languages overrides detection and still includes universal', () => {
  const fixture = makeFixture({ 'go.mod': 'module x\n' });
  try {
    const result = detectLanguages(fixture.root, { languages: ['ruby'] });
    assert.deepEqual(
      result.languages.map((entry) => entry.language.id),
      ['universal', 'ruby'],
    );
  } finally {
    fixture.cleanup();
  }
});

test('--add-languages unions with detection', () => {
  const fixture = makeFixture({ 'go.mod': 'module x\n' });
  try {
    // Manifest order is catalog order, not the order the flags were given.
    const ids = detectLanguages(fixture.root, {
      addLanguages: ['python'],
    }).languages.map((entry) => entry.language.id);
    assert.deepEqual(ids, ['universal', 'python', 'go']);
  } finally {
    fixture.cleanup();
  }
});

test('an unknown language id is rejected with the known list', () => {
  const fixture = makeFixture({});
  try {
    assert.throws(
      () => detectLanguages(fixture.root, { languages: ['nope'] }),
      /unknown language "nope"; known: .*typescript/,
    );
    assert.ok(knownLanguageIds().includes('typescript'));
    assert.ok(!knownLanguageIds().includes('universal'), 'universal is not selectable');
  } finally {
    fixture.cleanup();
  }
});

test('variant resolution: eslint config beats the biome default', () => {
  const eslint = makeFixture({
    'package.json': packageJson({ eslint: '^9.0.0' }),
    'eslint.config.js': 'export default [];\n',
  });
  const biome = makeFixture({
    'package.json': packageJson({ '@biomejs/biome': '^2.0.0' }),
  });
  const neither = makeFixture({ 'package.json': packageJson() });
  try {
    assert.equal(
      selectVariant(buildRepoIndex(eslint.root), languageById('typescript')!)?.id,
      'eslint',
    );
    assert.equal(
      selectVariant(buildRepoIndex(biome.root), languageById('typescript')!)?.id,
      'biome',
    );
    assert.equal(
      selectVariant(buildRepoIndex(neither.root), languageById('typescript')!)?.id,
      'biome',
      'no formatter config at all falls back to biome',
    );
  } finally {
    eslint.cleanup();
    biome.cleanup();
    neither.cleanup();
  }
});

test('variant resolution: mypy is the default, pyright needs a marker', () => {
  const plain = makeFixture({ 'pyproject.toml': '[project]\nname = "x"\n' });
  const pyright = makeFixture({
    'pyproject.toml': '[project]\nname = "x"\n[tool.pyright]\n',
  });
  const mypy = makeFixture({
    'pyproject.toml': '[project]\nname = "x"\n[tool.mypy]\nstrict = true\n',
  });
  try {
    const variantOf = (root: string): string | undefined =>
      selectVariant(buildRepoIndex(root), languageById('python')!)?.id;
    assert.equal(variantOf(plain.root), 'mypy');
    assert.equal(variantOf(pyright.root), 'pyright');
    assert.equal(variantOf(mypy.root), 'mypy', 'an explicit mypy config must not select pyright');
  } finally {
    plain.cleanup();
    pyright.cleanup();
    mypy.cleanup();
  }
});

test('variant resolution: Maven and Gradle are distinguished', () => {
  const maven = makeFixture({ 'pom.xml': '<project/>\n' });
  const gradle = makeFixture({ 'build.gradle': 'plugins {}\n' });
  try {
    assert.equal(selectVariant(buildRepoIndex(maven.root), languageById('java')!)?.id, 'maven');
    assert.equal(selectVariant(buildRepoIndex(gradle.root), languageById('java')!)?.id, 'gradle');
  } finally {
    maven.cleanup();
    gradle.cleanup();
  }
});

test("a Flutter pubspec swaps the Dart test runner for Flutter's", () => {
  const flutter = makeFixture({
    'pubspec.yaml': 'name: x\ndependencies:\n  flutter:\n    sdk: flutter\n',
  });
  const plain = makeFixture({ 'pubspec.yaml': 'name: x\n' });
  try {
    const toolsOf = (root: string): string[] =>
      resolveTools(buildRepoIndex(root), languageById('dart')!).map((tool) => tool.argv);
    assert.ok(
      toolsOf(flutter.root).some((argv) => argv.startsWith('flutter test')),
      'a Flutter package must run flutter test',
    );
    assert.ok(
      !toolsOf(flutter.root).some((argv) => argv === 'dart test --coverage=coverage'),
      'dart test does not work inside a Flutter package',
    );
    assert.ok(
      toolsOf(plain.root).some((argv) => argv === 'dart test --coverage=coverage'),
      'a plain Dart package keeps dart test',
    );
  } finally {
    flutter.cleanup();
    plain.cleanup();
  }
});

test('glob matching handles directories, wildcards and brace alternation', () => {
  const fixture = makeFixture({
    Dockerfile: 'FROM scratch\n',
    'Dockerfile.dev': 'FROM scratch\n',
    'a/b/deep.ts': 'export {};\n',
  });
  try {
    const index = buildRepoIndex(fixture.root);
    assert.ok(matchIndex(index, 'Dockerfile'), 'exact name');
    assert.ok(matchIndex(index, 'Dockerfile.*'), 'wildcard suffix');
    assert.ok(matchIndex(index, '**/*.ts'), 'recursive glob');
    assert.ok(!matchIndex(index, '*.rs'), 'absent extension');
    assert.ok(!matchIndex(index, 'node_modules'), 'absent directory');
  } finally {
    fixture.cleanup();
  }
});

test('rules combine with AND across clauses', () => {
  const fixture = makeFixture({
    'package.json': packageJson({ vitest: '^2.0.0' }),
    'tsconfig.json': '{}\n',
  });
  try {
    const index = buildRepoIndex(fixture.root);
    assert.ok(
      evaluateRules(index, [
        {
          anyPath: ['tsconfig.json'],
          dep: { file: 'package.json', names: ['vitest'] },
        },
      ]),
    );
    assert.ok(
      !evaluateRules(index, [
        {
          anyPath: ['tsconfig.json'],
          dep: { file: 'package.json', names: ['jest'] },
        },
      ]),
      'a failing clause disqualifies the whole rule',
    );
    assert.ok(evaluateRules(index, []), 'an empty rule list means always');
  } finally {
    fixture.cleanup();
  }
});

test('allToolsFor is repository-independent and includes conditional tools', () => {
  const first = allToolsFor(languageById('go')!);
  const second = allToolsFor(languageById('go')!);
  assert.deepEqual(
    first.map((t) => t.id),
    second.map((t) => t.id),
  );
  const ids = first.map((tool) => tool.id);
  assert.ok(ids.includes('golangci-full'), 'a conditional tool is included in the shipped matrix');
});
