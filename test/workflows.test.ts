import assert from 'node:assert/strict';
import { test } from 'node:test';

import { detectLanguages } from '../src/detect.js';
import { GENERATED_EXCLUDES } from '../src/generate/lefthook.js';
import { COVERAGE_GATE_PY } from '../src/generate/runSh.js';
import { actionRef, renderVendored } from '../src/generate/workflows.js';
import type { ManifestOptions } from '../src/manifest.js';
import { makeFixture, packageJson } from './helpers.js';

const OPTIONS: ManifestOptions = {
  coverageThreshold: 80,
  diffCoverage: 80,
  ciMode: 'vendored',
  secretsTool: 'betterleaks',
  root: '.',
};

function vendored(overrides: Partial<ManifestOptions> = {}): string {
  const fixture = makeFixture({
    'package.json': packageJson({ typescript: '^5.7.0', '@biomejs/biome': '^2.0.0' }),
    'tsconfig.json': '{}\n',
    'pyproject.toml': '[project]\nname = "x"\n',
    'go.mod': 'module x\n',
  });
  try {
    return renderVendored(
      detectLanguages(fixture.root).languages,
      { ...OPTIONS, ...overrides },
      '0.0.0-test',
    );
  } finally {
    fixture.cleanup();
  }
}

test('every action reference is pinned to a 40-character commit SHA', () => {
  for (const name of ['checkout', 'setupNode', 'codeql', 'uploadArtifact'] as const) {
    assert.match(actionRef(name), /@[0-9a-f]{40} # /, `${name} must be SHA-pinned`);
  }
  const yaml = vendored();
  const uses = yaml.split('\n').filter((line) => line.trimStart().startsWith('uses: '));
  assert.ok(uses.length > 0);
  for (const line of uses) {
    assert.match(line, /uses: [\w.-]+(?:\/[\w.-]+)+@[0-9a-f]{40} # \S/, `unpinned: ${line}`);
  }
});

test('no workflow input or context is interpolated directly into a shell script', () => {
  const yaml = vendored();
  const runBlocks = yaml.split('\n').filter((line) => line.includes('run:'));
  assert.ok(runBlocks.length > 0);
  // Interpolating `${{ }}` inside a `run:` body is a code-injection sink even
  // for values GitHub assembles; zizmor's template-injection audit fails on it.
  for (const line of runBlocks) {
    assert.ok(
      !/\$\{\{\s*(inputs|github)\./.test(line),
      `expression interpolated into a script: ${line}`,
    );
  }
});

test('every checkout keeps the token out of the workspace', () => {
  const yaml = vendored();
  const checkouts = yaml.split('- uses: ').slice(1).filter((chunk) => chunk.startsWith('actions/checkout'));
  assert.ok(checkouts.length >= 4, 'the fixture should produce several jobs');
  for (const chunk of checkouts) {
    assert.match(chunk.slice(0, 400), /persist-credentials: false/, 'artifacts would capture the token');
  }
});

test('the security job documents its elevated permissions', () => {
  const yaml = vendored();
  assert.match(yaml, /security-events: write # \S/, 'zizmor requires an inline explanation');
  assert.match(yaml, /actions: read # \S/);
});

test('CI checks never inspect the files righthook generated', () => {
  const yaml = vendored();
  for (const pattern of GENERATED_EXCLUDES) {
    assert.ok(yaml.includes(`:(exclude)${pattern}`), `CI must exclude ${pattern}`);
  }
  // A whole-repo invocation would lint righthook's own output.
  assert.ok(
    !/^\s+prettier --check \.$/m.test(yaml),
    'prettier must be restricted to the repository sources',
  );
  assert.ok(!/^\s+biome ci --error-on-warnings \.$/m.test(yaml));
  assert.ok(!/^\s+ruff check --force-exclude \.$/m.test(yaml));
});

test('the coverage gate is invoked without a shebang, since it runs via python3', () => {
  assert.ok(
    !COVERAGE_GATE_PY.startsWith('#!'),
    'a shebang on a non-executable file fails ruff EXE001 in every Python repository',
  );
  assert.match(COVERAGE_GATE_PY, /^"""/);
});

test('coverage thresholds from the manifest reach the gate unchanged', () => {
  assert.match(vendored({ coverageThreshold: 91 }), /coverage_gate\.py --threshold 91/);
  assert.match(vendored({ diffCoverage: 42 }), /--fail-under=42/);
});
