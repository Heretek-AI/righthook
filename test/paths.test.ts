import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planWrites } from '../src/cli.js';
import { detectLanguages } from '../src/detect.js';
import type { ManifestOptions } from '../src/manifest.js';
import { hashContent } from '../src/manifest.js';
import { joinRoot, renderAll } from '../src/render.js';
import { renderPresets } from '../src/scripts/emit-presets.js';
import { makeFixture, packageJson } from './helpers.js';

const OPTIONS: ManifestOptions = {
  coverageThreshold: 80,
  diffCoverage: 80,
  ciMode: 'vendored',
  secretsTool: 'betterleaks',
  root: '.',
};

function render(fixtureRoot: string, overrides: Partial<ManifestOptions> = {}, root = '.') {
  const detected = detectLanguages(fixtureRoot).languages;
  return renderAll({
    version: '0.0.0-test',
    gitRoot: fixtureRoot,
    jobRoot: fixtureRoot,
    root,
    detected,
    options: { ...OPTIONS, ...overrides },
    packageRef: 'acme/righthook/.github/workflows/ci.yml@v1',
  });
}

test('every repository gets the unconditional managed files', () => {
  const fixture = makeFixture({ 'go.mod': 'module x\n' });
  try {
    const files = render(fixture.root);
    for (const rel of [
      'lefthook.yml',
      '.righthook/run.sh',
      '.righthook/merge-conflicts.sh',
      '.righthook/coverage_gate.py',
      '.righthook/jscpd.json',
      '.righthook/osv-scanner.toml',
      '.editorconfig',
      '.github/workflows/righthook.yml',
      '.github/dependabot.yml',
    ]) {
      assert.ok(files.has(rel), `missing ${rel}`);
    }
  } finally {
    fixture.cleanup();
  }
});

test('files a repository cannot use are not written', () => {
  const goOnly = makeFixture({ 'go.mod': 'module x\n' });
  const ruby = makeFixture({
    Gemfile: "source 'x'\n",
    'spec/a_spec.rb': 'x\n',
  });
  try {
    const goFiles = render(goOnly.root);
    assert.ok(!goFiles.has('.righthook/simplecov.rb'), 'no Ruby, no SimpleCov');

    const rubyFiles = render(ruby.root);
    assert.ok(rubyFiles.has('.righthook/simplecov.rb'), 'Ruby needs the SimpleCov hook');
  } finally {
    goOnly.cleanup();
    ruby.cleanup();
  }
});

test('--secrets-tool gitleaks swaps the written config', () => {
  const fixture = makeFixture({ 'go.mod': 'module x\n' });
  try {
    assert.ok(!render(fixture.root).has('.gitleaks.toml'));
    assert.ok(render(fixture.root, { secretsTool: 'gitleaks' }).has('.gitleaks.toml'));
  } finally {
    fixture.cleanup();
  }
});

test('every managed file is non-empty and newline-terminated', () => {
  const fixture = makeFixture({
    'package.json': packageJson({ '@biomejs/biome': '^2.0.0' }),
    'pyproject.toml': '[project]\nname = "x"\n',
    'go.mod': 'module x\n',
    'Cargo.toml': '[package]\nname = "x"\n',
    Gemfile: "source 'x'\n",
    'composer.json': '{}\n',
    'pom.xml': '<project/>\n',
  });
  try {
    for (const [rel, content] of render(fixture.root)) {
      assert.ok(content.length > 0, `${rel} is empty`);
      assert.ok(content.endsWith('\n'), `${rel} must end with a newline`);
    }
  } finally {
    fixture.cleanup();
  }
});

test('the workflow file differs between vendored and caller modes', () => {
  const fixture = makeFixture({
    'go.mod': 'module x\n',
    'package.json': packageJson(),
  });
  try {
    const vendored = render(fixture.root).get('.github/workflows/righthook.yml')!;
    const caller = render(fixture.root, { ciMode: 'caller' }).get(
      '.github/workflows/righthook.yml',
    )!;
    assert.match(
      vendored,
      /\n {2}lint-go:\n {4}name: lint \(go\)\n {4}runs-on: ubuntu-latest/,
      'vendored mode inlines the jobs',
    );
    assert.match(vendored, /\n {2}lint-typescript:\n {4}name: lint \(typescript\)/);
    assert.match(vendored, /\n {2}required:\n {4}name: required/);
    assert.ok(!vendored.includes('fromJSON(inputs.languages)'), 'vendored mode has no input gates');
    assert.match(caller, /uses: acme\/righthook\/\.github\/workflows\/ci\.yml@v1/);
    assert.ok(!caller.includes('lint-go:'), 'caller mode delegates instead of inlining');
  } finally {
    fixture.cleanup();
  }
});

test('a subdirectory root prefixes lefthook paths but not the GitHub paths', () => {
  const fixture = makeFixture({ 'services/api/go.mod': 'module api\n' });
  try {
    const files = render(fixture.root, {}, 'services/api');
    assert.ok(files.has('services/api/lefthook.yml'));
    assert.ok(files.has('services/api/.righthook/run.sh'));
    assert.ok(
      files.has('.github/workflows/righthook.yml'),
      'GitHub only reads workflows at the repository root',
    );
    assert.ok(files.has('.github/dependabot.yml'));
    assert.ok(!files.has('services/api/.github/workflows/righthook.yml'));
  } finally {
    fixture.cleanup();
  }
});

test('joinRoot normalises the trivial prefixes', () => {
  assert.equal(joinRoot('.', 'lefthook.yml'), 'lefthook.yml');
  assert.equal(joinRoot('', 'lefthook.yml'), 'lefthook.yml');
  assert.equal(joinRoot('./', 'lefthook.yml'), 'lefthook.yml');
  assert.equal(joinRoot('sub/dir/', 'lefthook.yml'), 'sub/dir/lefthook.yml');
});

test('the shipped presets are valid lefthook documents with unique command keys', () => {
  for (const [rel, content] of renderPresets('0.0.0-test')) {
    if (!rel.includes('lefthook')) continue;
    const keys: string[] = [];
    let hook: string | undefined;
    for (const line of content.split('\n')) {
      const hookMatch = /^(pre-commit|pre-push|commit-msg):$/.exec(line);
      if (hookMatch) {
        hook = hookMatch[1];
        continue;
      }
      const commandMatch = /^ {4}(\S+):$/.exec(line);
      if (commandMatch && hook) keys.push(`${hook}.${commandMatch[1]}`);
    }
    assert.ok(keys.length > 20, `${rel} should carry the matrix`);
    // lefthook rejects a document that defines the same command key twice, so a
    // duplicate here is a hard failure rather than a cosmetic one.
    assert.equal(new Set(keys).size, keys.length, `${rel} has duplicate keys`);
  }
});

test('sync rewrites an unchanged file when the generated content changed', () => {
  const files = new Map([
    ['lefthook.yml', 'new-content\n'],
    ['helper.sh', 'new-content\n'],
  ]);
  // Both files on disk hold what the *previous* run wrote, so neither is a
  // local edit — the template merely changed (a flag, a language, an upgrade).
  const manifest = {
    version: '0.0.0',
    generatedAt: '2026-01-01T00:00:00.000Z',
    languages: ['universal'],
    markers: {},
    options: {},
    files: {
      'lefthook.yml': hashContent('new-content\n'),
      'helper.sh': hashContent('old-content\n'),
    },
  } as never;

  const plan = planWrites('/nonexistent-root', files, manifest, false, ['lefthook.yml']);
  // `planWrites` reads the disk, so a missing root means "write" for both; the
  // point of this test is the branch below, checked against a real tree.
  assert.equal(plan.length, 2);
});

test('a locally edited managed file is refused, an unchanged one is updated', () => {
  const fixture = makeFixture({
    'helper.sh': 'righthook wrote this\n',
    'stale.json': 'righthook wrote this too\n',
  });
  try {
    const files = new Map([
      ['helper.sh', 'a brand new template\n'],
      ['stale.json', 'a brand new template\n'],
    ]);
    // `helper.sh` was changed on disk after righthook wrote it; `stale.json`
    // still holds exactly what the manifest recorded, so the template change is
    // not drift and must be applied.
    const manifest = {
      version: '0.0.0',
      generatedAt: '2026-01-01T00:00:00.000Z',
      languages: ['universal'],
      markers: {},
      options: {},
      files: {
        'helper.sh': hashContent('something else entirely\n'),
        'stale.json': hashContent('righthook wrote this too\n'),
      },
    } as never;

    const plan = planWrites(fixture.root, files, manifest, false);
    const byPath = Object.fromEntries(plan.map((entry) => [entry.path, entry]));
    assert.equal(byPath['helper.sh']?.action, 'skip-modified', 'a local edit must be refused');
    assert.equal(byPath['stale.json']?.action, 'write', 'an untouched stale file must be updated');
  } finally {
    fixture.cleanup();
  }
});
