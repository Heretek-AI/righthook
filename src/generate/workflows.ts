import type { ToolSpec } from '../catalog/types.js';
import type { DetectedLanguage } from '../detect.js';
import type { ManifestOptions } from '../manifest.js';
import { GENERATED_EXCLUDES } from './lefthook.js';

/**
 * GitHub Actions generation.
 *
 * One job builder serves both delivery modes. The only differences are:
 *
 *  - **vendored** (`.github/workflows/righthook.yml`, the default) contains
 *    only the detected languages, with thresholds baked in from the manifest.
 *  - **caller** (`--ci-mode=caller`) is a thin `uses:` of the reusable
 *    workflow below, with thresholds passed as inputs.
 *  - **reusable** (`workflows/ci.yml`, shipped in the package and mirrored to
 *    the package repo's `.github/workflows/ci.yml`) contains every language,
 *    each job gated by `contains(fromJSON(inputs.languages), '<id>')`, so one
 *    published artifact serves every consumer.
 *
 * Every `uses:` is pinned to a 40-character commit SHA with the tag in a
 * trailing comment, which is what `zizmor --pedantic` demands — the generated
 * workflow therefore passes the very `zizmor` job it deploys.
 */

/** Pinned action references, resolved from the upstream repositories. */
export const ACTIONS = {
  checkout: {
    repo: 'actions/checkout',
    sha: '11d5960a326750d5838078e36cf38b85af677262',
    tag: 'v4',
  },
  setupNode: {
    repo: 'actions/setup-node',
    sha: '49933ea5288caeca8642d1e84afbd3f7d6820020',
    tag: 'v4',
  },
  setupPython: {
    repo: 'actions/setup-python',
    sha: 'a26af69be951a213d495a4c3e4e4022e16d87065',
    tag: 'v5',
  },
  setupGo: {
    repo: 'actions/setup-go',
    sha: '40f1582b2485089dde7abd97c1529aa768e1baff',
    tag: 'v5',
  },
  setupJava: {
    repo: 'actions/setup-java',
    sha: 'cf277c60eb25467037889841efdb72551f06f6c3',
    tag: 'v4',
  },
  uploadArtifact: {
    repo: 'actions/upload-artifact',
    sha: 'ea165f8d65b6e75b540449e92b4886f43607fa02',
    tag: 'v4',
  },
  downloadArtifact: {
    repo: 'actions/download-artifact',
    sha: 'd3f86a106a0bac45b974a628896c90dbdf5c8093',
    tag: 'v4',
  },
  dependencyReview: {
    repo: 'actions/dependency-review-action',
    sha: '2031cfc080254a8a887f58cffee85186f0e49e48',
    tag: 'v4',
  },
  codeql: {
    repo: 'github/codeql-action',
    sha: '3ea06614dafe36dec890db3446326e0d40ce53d4',
    tag: 'v3',
  },
  setupRuby: {
    repo: 'ruby/setup-ruby',
    sha: 'a0102e0972be65f351c307e2d64b9314a57c8073',
    tag: 'v1',
  },
  rustToolchain: {
    repo: 'dtolnay/rust-toolchain',
    sha: '6bed0761d98439e5a578e2877258200ad565ba87',
    tag: 'stable',
  },
  setupDotnet: {
    repo: 'actions/setup-dotnet',
    sha: '67a3573c9a986a3f9c594539f4ab511d57bb3ce9',
    tag: 'v4',
  },
  setupSwift: {
    repo: 'swift-actions/setup-swift',
    sha: '7ca6abe6b3b0e8b5421b88be48feee39cbf52c6a',
    tag: 'v2',
  },
  setupDart: {
    repo: 'dart-lang/setup-dart',
    sha: '6afc89df92d6eb3834022f73cd65adc8cdfcb92d',
    tag: 'v1',
  },
  setupBiome: {
    repo: 'biomejs/setup-biome',
    sha: '4c91541eaada48f67d7dbd7833600ce162b68f51',
    tag: 'v2',
  },
  setupUv: {
    repo: 'astral-sh/setup-uv',
    sha: 'd4b2f3b6ecc6e67c4457f6d3e41ec42d3d0fcb86',
    tag: 'v5',
  },
  golangciAction: {
    repo: 'golangci/golangci-lint-action',
    sha: '55c2c1448f86e01eaae002a5a3a9624417608d84',
    tag: 'v6',
  },
} as const;

/**
 * `owner/repo[/subpath]@<sha> # tag` — the hardened `uses:` form.
 *
 * The subpath has to precede the `@`, and the trailing comment records the
 * human-readable tag that the SHA stands for.
 */
export function actionRef(name: keyof typeof ACTIONS, subpath?: string): string {
  const { repo, sha, tag } = ACTIONS[name];
  return `${subpath ? `${repo}/${subpath}` : repo}@${sha} # ${tag}`;
}

/** Languages that get a `lint-<id>` job, in emission order. */
const CI_LANGUAGES = [
  'typescript',
  'python',
  'go',
  'rust',
  'ruby',
  'php',
  'java',
  'kotlin',
  'dotnet',
  'swift',
  'dart',
  'cpp',
  'terraform',
] as const;

type CiLanguage = (typeof CI_LANGUAGES)[number];

/** Language id -> the toolchain version knob its setup step reads. */
const LANGUAGE_VERSION_INPUT: Partial<Record<CiLanguage, string>> = {
  typescript: 'node-version',
  python: 'python-version',
  go: 'go-version',
  java: 'java-version',
  kotlin: 'java-version',
  ruby: 'ruby-version',
};

/** Directory the per-language coverage artifact is normalised into. */
export const ARTIFACT_ROOT = '.righthook-coverage';

/**
 * Where a language's coverage artifact is normalised to.
 *
 * The declared `coveragePath` may be a glob — coverlet writes a Cobertura file
 * under a nested `TestResults` directory — so every `test-<lang>` job copies
 * whatever matches into one directory under one file name. The path the gate
 * then reads is therefore a constant, not a guess about how
 * `upload-artifact` chose to flatten the tree.
 */
export function artifactLayout(
  language: string,
  coveragePath: string,
): { dir: string; file: string } {
  return {
    dir: `${ARTIFACT_ROOT}/${language}`,
    file: coveragePath.split('/').pop()!,
  };
}

/**
 * Toolchain versions baked into a vendored workflow.
 *
 * They live in a workflow-level `env:` block rather than inline literals so a
 * consumer bumps every occurrence in one place.
 */
const DEFAULT_VERSIONS: Record<string, string> = {
  'node-version': '22',
  'python-version': '3.13',
  'go-version': '1.24',
  'java-version': '21',
  'ruby-version': '3.4',
};

/** How a setup step spells a toolchain version: `${{ inputs.x }}` or `${{ env.X }}`. */
type VersionExpr = (input: string) => string;

/** Reusable-workflow form: versions arrive as `workflow_call` inputs. */
const inputVersion: VersionExpr = (input) => `\${{ inputs.${input} }}`;

/** Vendored form: versions come from the workflow-level `env:` block. */
const envVersion: VersionExpr = (input) => `\${{ env.${input.replace(/-/g, '_').toUpperCase()} }}`;

/** A YAML step, rendered as indented lines. */
interface Step {
  /** `uses:` value; mutually exclusive with `run`. */
  uses?: string;
  /** Inline `run:` command(s), one shell line each. */
  run?: string[];
  /** `if:` condition, emitted verbatim. */
  if?: string;
  /** `with:` entries as `[key, value]` pairs. */
  with?: [string, string][];
  /** `env:` entries as `[key, value]` pairs. */
  env?: [string, string][];
  /** Step name, emitted as `name:`. */
  name?: string;
}

const indentLines = (lines: string[], indent: string): string[] =>
  lines.map((line) => (line.length === 0 ? line : `${indent}${line}`));

/** Render one step with all its sub-keys, first key on the `- ` line. */
function renderStep(step: Step, indent: string): string[] {
  const body: string[] = [];
  if (step.name) body.push(`name: ${step.name}`);
  if (step.if) body.push(`if: ${step.if}`);
  if (step.uses) body.push(`uses: ${step.uses}`);
  if (step.run) {
    if (step.run.length === 1) {
      body.push(`run: ${step.run[0]}`);
    } else {
      body.push('run: |');
      body.push(...indentLines(step.run, '  '));
    }
  }
  if (step.with) {
    body.push('with:');
    for (const [key, value] of step.with) body.push(`  ${key}: ${value}`);
  }
  if (step.env) {
    body.push('env:');
    for (const [key, value] of step.env) body.push(`  ${key}: ${value}`);
  }
  const [first, ...rest] = body;
  const lines = [`- ${first ?? ''}`, ...rest.map((line) => `  ${line}`)];
  return indentLines(lines, indent);
}

/**
 * The setup steps a language needs, in order.
 *
 * `golangci-lint-action` replaces a manual golangci-lint install in CI;
 * `setup-biome`/`setup-uv` mirror the local tool set. C/C++ and Terraform have
 * no runner-provided toolchain, so their setup installs what the checks need.
 */
function setupSteps(
  language: CiLanguage,
  variant: string | undefined,
  versionExpr: VersionExpr,
): Step[] {
  const versionInput = LANGUAGE_VERSION_INPUT[language];
  const version: [string, string] | undefined = versionInput
    ? [versionInput, versionExpr(versionInput)]
    : undefined;
  switch (language) {
    case 'typescript':
      return [
        ...(variant === 'biome' ? [{ uses: actionRef('setupBiome') }] : []),
        { uses: actionRef('setupNode'), with: version ? [version] : [] },
      ];
    case 'python':
      return [
        { uses: actionRef('setupUv'), with: version ? [version] : [] },
        { uses: actionRef('setupPython'), with: version ? [version] : [] },
      ];
    case 'go':
      return [
        { uses: actionRef('setupGo'), with: version ? [version] : [] },
        { uses: actionRef('golangciAction'), with: [['version', 'latest']] },
      ];
    case 'rust':
      return [
        {
          uses: actionRef('rustToolchain'),
          with: [['components', 'rustfmt, clippy, llvm-tools-preview']],
        },
      ];
    case 'ruby':
      return [
        {
          uses: actionRef('setupRuby'),
          with: [...(version ? [version] : []), ['bundler-cache', 'false']],
        },
      ];
    case 'java':
    case 'kotlin':
      return [
        {
          uses: actionRef('setupJava'),
          with: [['distribution', 'temurin'], ...(version ? [version] : [])],
        },
      ];
    case 'dotnet':
      return [{ uses: actionRef('setupDotnet') }];
    case 'swift':
      return [{ uses: actionRef('setupSwift') }];
    case 'dart':
      return [{ uses: actionRef('setupDart') }];
    case 'cpp':
      return [
        {
          run: ['sudo apt-get update', 'sudo apt-get install -y cppcheck gcovr clang-format'],
        },
      ];
    case 'terraform':
      return [
        {
          run: [
            'TERRAFORM_VERSION=1.9.8',
            'curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" -o /tmp/terraform.zip',
            'sudo unzip -o /tmp/terraform.zip -d /usr/local/bin',
          ],
        },
      ];
    default:
      return [];
  }
}

/**
 * A `git ls-files` invocation restricted to a language's own sources.
 *
 * CI checks run over the repository, but must never inspect the files righthook
 * generated — `prettier --check .` would otherwise flag `.righthook/manifest.json`
 * and `lefthook.yml`, and `ruff check .` would report the coverage gate. The
 * `:(exclude)` pathspecs keep the exclusion list identical to the local hooks'.
 */
function gitLsFiles(patterns: string[]): string {
  const args = [
    'git ls-files -z --',
    ...patterns.map((pattern) => `'${pattern}'`),
    ...GENERATED_EXCLUDES.map((pattern) => `':(exclude)${pattern}'`),
  ];
  return args.join(' ');
}

/**
 * The file pattern a tool's CI check should be limited to.
 *
 * A tool declaring its own `glob` is already scoped by it in the hooks, so CI
 * uses the same pattern. Otherwise the language's `fileGlob` applies, except
 * for `universal`, whose tools are the ones that legitimately span formats.
 */
function commandGlobFor(entry: DetectedLanguage, tool: ToolSpec): string | undefined {
  if (tool.glob) return tool.glob;
  if (entry.language.id === 'universal') return undefined;
  return entry.language.fileGlob;
}

/** The `lint-<lang>` job body: setup, install, then every unguarded check.
 *
 * CI never auto-fixes. A tool with no `ciArgv` (a formatter whose only form is
 * a rewrite) is simply absent from CI, and the corresponding check runs in its
 * non-mutating form where the tool provides one.
 */
function lintJob(
  entry: DetectedLanguage,
  variant: string | undefined,
  versionExpr: VersionExpr,
  gate?: string,
): string[] {
  const language = entry.language.id as CiLanguage;
  const steps: Step[] = [
    {
      uses: actionRef('checkout'),
      // `persist-credentials: false` keeps the checkout token out of
      // `.git/config`, which would otherwise be captured by any artifact or
      // cache written later in the job (zizmor's artipacked audit).
      with: [
        ['fetch-depth', '0'],
        ['persist-credentials', 'false'],
      ],
    },
    ...setupSteps(language, variant, versionExpr),
  ];
  for (const command of entry.language.ciInstall ?? []) steps.push({ run: [command] });

  // Only the tool's own CI command belongs in the lint job; a tool that needs
  // a build or an index (or has no non-mutating form) is exercised elsewhere.
  const checks: string[] = [];
  for (const tool of entry.tools) {
    if (tool.ciOnly || !tool.ciArgv) continue;
    if (tool.ciFiles && commandGlobFor(entry, tool)) {
      checks.push(`${gitLsFiles([commandGlobFor(entry, tool)!])} | ${tool.ciArgv}`);
    } else {
      checks.push(tool.ciArgv);
    }
  }
  if (checks.length > 0) steps.push({ run: checks });

  const lines: string[] = [`  lint-${language}:`, `    name: lint (${language})`];
  if (gate) lines.push(`    if: ${gate}`);
  lines.push('    runs-on: ubuntu-latest', '    steps:');
  for (const step of steps) lines.push(...renderStep(step, '      '));
  return lines;
}

/** The `test-<lang>` job: the coverage-producing run plus artifact upload. */
function testJob(
  entry: DetectedLanguage,
  variant: string | undefined,
  versionExpr: VersionExpr,
  gate?: string,
): string[] {
  const language = entry.language.id as CiLanguage;
  const producer = coverageProducer(entry);
  if (!producer) return [];

  const steps: Step[] = [
    {
      uses: actionRef('checkout'),
      with: [
        ['fetch-depth', '0'],
        ['persist-credentials', 'false'],
      ],
    },
    ...setupSteps(language, variant, versionExpr),
  ];
  for (const command of entry.language.ciInstall ?? []) steps.push({ run: [command] });
  if (language === 'ruby') {
    steps.push({
      run: ['echo "RUBYOPT=-r./.righthook/simplecov.rb" >> "$GITHUB_ENV"'],
    });
  }
  const testCommand = producer.testArgv ?? producer.ciArgv ?? producer.argv;
  steps.push({ run: [...(producer.before ?? []), testCommand] });
  if (producer.after?.length) steps.push({ run: producer.after });

  // Normalise before uploading: `coveragePath` may be a glob (coverlet), and
  // `download-artifact` flattens in its own way. Copying to a fixed directory
  // and file name makes the path the gate reads a constant.
  const layout = producer.coveragePath
    ? artifactLayout(language, producer.coveragePath)
    : undefined;
  if (layout) {
    steps.push({
      if: 'always()',
      run: [
        `mkdir -p ${layout.dir}`,
        // `-print0 | xargs -0` avoids find's `-exec ... ';'` terminator, which
        // `shellcheck` (via actionlint) rejects and which does not survive a
        // template literal cleanly.
        `find . -name '${layout.file}' -not -path './${layout.dir}/*' -print0` +
          ` | xargs -0 -r -I{} cp {} ${layout.dir}/`,
        `ls -la ${layout.dir} || true`,
      ],
    });
  }

  const lines: string[] = [`  test-${language}:`, `    name: test (${language})`];
  if (gate) lines.push(`    if: ${gate}`);
  lines.push('    runs-on: ubuntu-latest', '    steps:');
  for (const step of steps) lines.push(...renderStep(step, '      '));
  lines.push(
    ...renderStep(
      {
        if: 'always()',
        uses: actionRef('uploadArtifact'),
        with: [
          ['name', `coverage-${language}`],
          ['path', layout?.dir ?? 'coverage/'],
          ['if-no-files-found', 'warn'],
        ],
      },
      '      ',
    ),
  );
  return lines;
}

/** The `security` job: secret scanning plus filesystem/secret SARIF upload. */
function securityJob(): string[] {
  return [
    '  security:',
    '    name: security scan',
    '    runs-on: ubuntu-latest',
    '    permissions:',
    '      contents: read # needed to check out the repository',
    '      security-events: write # needed by upload-sarif to publish findings',
    '      actions: read # required by upload-sarif on private repositories',
    '    steps:',
    ...renderStep(
      { uses: actionRef('checkout'), with: [['persist-credentials', 'false']] },
      '      ',
    ),
    ...renderStep(
      {
        run: [
          'curl -fsSL https://raw.githubusercontent.com/betterleaks/betterleaks/main/scripts/install.sh | sh',
          './bin/betterleaks git . --redact --report-format sarif --report-path leaks.sarif || true',
        ],
      },
      '      ',
    ),
    ...renderStep(
      {
        run: [
          'curl -fsSL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin',
          'trivy fs --format sarif --output trivy.sarif --scanners vuln,misconfig,secret . || true',
        ],
      },
      '      ',
    ),
    ...renderStep(
      {
        if: 'always()',
        uses: actionRef('codeql', 'upload-sarif'),
        with: [
          ['sarif_file', 'leaks.sarif'],
          ['category', 'betterleaks'],
        ],
      },
      '      ',
    ),
    ...renderStep(
      {
        if: 'always()',
        uses: actionRef('codeql', 'upload-sarif'),
        with: [
          ['sarif_file', 'trivy.sarif'],
          ['category', 'trivy'],
        ],
      },
      '      ',
    ),
  ];
}

/** The `workflow-lint` job: actionlint and zizmor over `.github/workflows`. */
function workflowLintJob(): string[] {
  return [
    '  workflow-lint:',
    '    name: workflow lint',
    '    runs-on: ubuntu-latest',
    '    steps:',
    ...renderStep(
      { uses: actionRef('checkout'), with: [['persist-credentials', 'false']] },
      '      ',
    ),
    ...renderStep(
      {
        run: [
          'go install github.com/rhysd/actionlint/cmd/actionlint@latest',
          '"$(go env GOPATH)/bin/actionlint"',
        ],
      },
      '      ',
    ),
    // `--pedantic` plus `--min-severity=low`: real findings fail the job, and
    // informational advisories do not.
    ...renderStep(
      {
        run: ['pipx run zizmor --pedantic --min-severity=low .github/workflows'],
      },
      '      ',
    ),
  ];
}

/** The `deps-review` job: GitHub's vulnerability review, pull requests only. */
function depsReviewJob(): string[] {
  return [
    '  deps-review:',
    '    name: dependency review',
    "    if: github.event_name == 'pull_request'",
    '    runs-on: ubuntu-latest',
    '    steps:',
    ...renderStep(
      { uses: actionRef('checkout'), with: [['persist-credentials', 'false']] },
      '      ',
    ),
    ...renderStep({ uses: actionRef('dependencyReview') }, '      '),
  ];
}

/**
 * The tool whose CI job both runs the tests and writes the coverage artifact.
 *
 * A post-processing tool (`gcovr`, `llvm-cov export`, Dart's
 * `format_coverage`) is never the producer: its command cannot run on its own.
 * Those are attached to the test runner through `after`, so the CI job always
 * starts from a real test run.
 */
export function coverageProducer(entry: DetectedLanguage): ToolSpec | undefined {
  return entry.tools.find((tool) => tool.coverageArtifact && !tool.afterOnly);
}

/**
 * Coverage report arguments, keyed by language.
 *
 * `download-artifact` with `pattern` extracts each artifact into
 * `<path>/<artifact-name>/`, and each artifact holds exactly one normalised
 * file, so the path is fully determined.
 */
function coverageReportArgs(detected: DetectedLanguage[]): string[] {
  const args: string[] = [];
  for (const entry of detected) {
    const producer = coverageProducer(entry);
    if (!producer?.coveragePath) continue;
    const { file } = artifactLayout(entry.language.id, producer.coveragePath);
    args.push(`${entry.language.id}=coverage/coverage-${entry.language.id}/${file}`);
  }
  return args;
}

/**
 * The `coverage-gate` job: aggregate the per-language artifacts, then enforce
 * the total threshold and, on pull requests, the changed-line threshold.
 */
function coverageGateJob(
  detected: DetectedLanguage[],
  threshold: string,
  diffCoverage: string,
): string[] {
  const withCoverage = detected.filter((entry) => coverageProducer(entry) !== undefined);
  // Nothing produces a report, so there is no threshold to enforce. Emitting a
  // gate here would fail on "no coverage data" and block every pull request for
  // a gate that has nothing to measure.
  if (withCoverage.length === 0) return [];
  const needs = withCoverage.map((entry) => `test-${entry.language.id}`);
  const reports = coverageReportArgs(detected);
  const lines: string[] = [
    '  coverage-gate:',
    '    name: coverage gate',
    '    if: always()',
    '    runs-on: ubuntu-latest',
    `    needs: [${needs.join(', ')}]`,
    '    steps:',
    ...renderStep(
      { uses: actionRef('checkout'), with: [['persist-credentials', 'false']] },
      '      ',
    ),
    ...renderStep(
      {
        uses: actionRef('downloadArtifact'),
        with: [
          ['pattern', 'coverage-*'],
          ['path', 'coverage'],
        ],
      },
      '      ',
    ),
    ...renderStep({ run: ['find coverage -type f | sort'] }, '      '),
    ...renderStep(
      {
        run: [
          `python3 .righthook/coverage_gate.py --threshold ${threshold}${reports
            .map((report) => ` --report ${report}`)
            .join('')}`,
        ],
      },
      '      ',
    ),
  ];

  if (reports.length > 0) {
    // One invocation per language, so a failure names the language.
    lines.push(
      ...renderStep(
        {
          if: "github.event_name == 'pull_request'",
          // The base ref reaches the shell through `env:`; interpolating
          // `${{ github.base_ref }}` into a `run:` block is a code-injection
          // sink, which zizmor's template-injection audit reports.
          env: [['BASE_REF', '${{ github.base_ref }}']],
          run: [
            'if ! command -v pipx >/dev/null; then',
            '  echo "pipx unavailable; skipping diff coverage"',
            '  exit 0',
            'fi',
            ...reports.map(
              (report) =>
                `pipx run diff-cover "${report.split('=')[1]}"` +
                ` --compare-branch="origin/$BASE_REF" --fail-under=${diffCoverage}`,
            ),
          ],
        },
        '      ',
      ),
    );
  }
  return lines;
}

/** The single aggregating job that branch protection points at. */
function requiredJob(needs: string[], alwaysRun: string[] = []): string[] {
  return [
    '  required:',
    '    name: required',
    '    if: always()',
    '    runs-on: ubuntu-latest',
    `    needs: [${[...needs, ...alwaysRun].join(', ')}]`,
    '    steps:',
    ...renderStep(
      {
        name: 'Every required job succeeded',
        // The expression is passed through `env:` rather than interpolated into
        // the script, which is what zizmor's template-injection audit requires
        // even for a value assembled from job results.
        env: [['JOB_RESULTS', "${{ join(needs.*.result, ' ') }}"]],
        run: [
          'for result in $JOB_RESULTS; do',
          '  case "$result" in',
          '    success|skipped) ;;',
          '    *) echo "a required job reported $result"; exit 1 ;;',
          '  esac',
          'done',
          'echo "all required jobs succeeded"',
        ],
      },
      '      ',
    ),
  ];
}

/**
 * The language ids the reusable workflow can act on.
 *
 * Kept in sync with `CI_LANGUAGES`: an id here without a job would let a
 * caller request something that silently does nothing.
 */
export function ciLanguageIds(): string[] {
  return ['universal', ...CI_LANGUAGES];
}

/** The detected languages in CI order, with their variant ids. */
function ciEntries(detected: DetectedLanguage[]): { entry: DetectedLanguage; variant?: string }[] {
  const byId = new Map(detected.map((entry) => [entry.language.id, entry]));
  return CI_LANGUAGES.flatMap((id) => {
    const entry = byId.get(id);
    if (!entry) return [];
    return [{ entry, variant: id === 'typescript' ? entry.variant : undefined }];
  });
}

/**
 * Render `.github/workflows/righthook.yml` for the detected language set.
 *
 * No `if:` gates and no inputs: the languages and thresholds are fixed at
 * generation time, so the file is directly runnable after `git push`.
 */
export function renderVendored(
  detected: DetectedLanguage[],
  options: ManifestOptions,
  version: string,
): string {
  const entries = ciEntries(detected);
  const hasCoverage = detected.some((entry) => coverageProducer(entry) !== undefined);
  const needs = [
    ...entries.map(({ entry }) => `lint-${entry.language.id}`),
    ...entries
      .filter(({ entry }) => coverageProducer(entry) !== undefined)
      .map(({ entry }) => `test-${entry.language.id}`),
  ];

  const lines: string[] = [
    `# Generated by righthook v${version}. Do not edit.`,
    '# Re-run `npx righthook sync` after changing languages or thresholds.',
    'name: righthook',
    'on:',
    '  push:',
    '    branches: [main]',
    '  pull_request:',
    'permissions:',
    '  contents: read',
    'env:',
    ...Object.entries(DEFAULT_VERSIONS).map(
      ([input, value]) => `  ${input.replace(/-/g, '_').toUpperCase()}: "${value}"`,
    ),
    'concurrency:',
    '  group: righthook-${{ github.ref }}',
    '  cancel-in-progress: true',
    'jobs:',
  ];

  for (const { entry, variant } of entries) lines.push(...lintJob(entry, variant, envVersion));
  for (const { entry, variant } of entries) lines.push(...testJob(entry, variant, envVersion));
  lines.push(...securityJob());
  lines.push(...workflowLintJob());
  lines.push(...depsReviewJob());
  lines.push(
    ...coverageGateJob(detected, String(options.coverageThreshold), String(options.diffCoverage)),
  );
  lines.push(
    ...requiredJob(needs, [
      'security',
      'workflow-lint',
      'deps-review',
      ...(hasCoverage ? ['coverage-gate'] : []),
    ]),
  );

  return `${lines.join('\n')}\n`;
}

/**
 * Render the reusable `workflow_call` workflow.
 *
 * Every language in the catalog is present, and each job is gated by the
 * `languages` input, so one published artifact serves every consumer.
 * Thresholds and toolchain versions arrive as inputs rather than being baked
 * in, and the coverage gate reports a path per language — the caller's
 * `test-<lang>` jobs upload artifacts under exactly those names.
 */
export function renderReusable(detected: DetectedLanguage[], version: string): string {
  const entries = ciEntries(detected);
  const gate = (id: string): string => `contains(fromJSON(inputs.languages), '${id}')`;
  const gateFor = (id: string): string =>
    id === 'kotlin' ? `(${gate('kotlin')} || ${gate('java')})` : gate(id);

  const withCoverage = entries.filter(({ entry }) => coverageProducer(entry) !== undefined);
  const reports = coverageReportArgs(detected);

  const lines: string[] = [
    `# Generated by righthook v${version}. Do not edit.`,
    '#',
    '# Reusable pipeline. Consumers call it as:',
    '#   uses: <owner>/righthook/.github/workflows/ci.yml@<sha>',
    '# and declare the language ids their repository uses, as reported by',
    '# `npx righthook doctor --json`.',
    'name: righthook',
    'on:',
    '  workflow_call:',
    '    inputs:',
    '      languages:',
    '        description: JSON array of language ids, as reported by `npx righthook doctor --json`.',
    '        required: true',
    '        type: string',
    '      coverage-threshold:',
    '        description: Minimum total line coverage percentage.',
    '        required: false',
    '        default: 80',
    '        type: number',
    '      diff-coverage:',
    '        description: Minimum changed-line coverage percentage on pull requests.',
    '        required: false',
    '        default: 80',
    '        type: number',
    '      coverage-gate-script:',
    '        description: Path to coverage_gate.py, relative to the repository root.',
    '        required: false',
    '        default: .righthook/coverage_gate.py',
    '        type: string',
    '      node-version:',
    '        required: false',
    '        default: "22"',
    '        type: string',
    '      python-version:',
    '        required: false',
    '        default: "3.13"',
    '        type: string',
    '      go-version:',
    '        required: false',
    '        default: "1.24"',
    '        type: string',
    '      java-version:',
    '        required: false',
    '        default: "21"',
    '        type: string',
    '      ruby-version:',
    '        required: false',
    '        default: "3.4"',
    '        type: string',
    '    secrets:',
    '      CODECOV_TOKEN:',
    '        required: false',
    'permissions:',
    '  contents: read',
    'jobs:',
  ];

  for (const { entry, variant } of entries) {
    lines.push(...lintJob(entry, variant, inputVersion, gateFor(entry.language.id)));
  }
  for (const { entry, variant } of withCoverage) {
    lines.push(...testJob(entry, variant, inputVersion, gateFor(entry.language.id)));
  }
  lines.push(...securityJob());
  lines.push(...workflowLintJob());

  // The gate downloads the caller's artifacts, which are normalised into one
  // file per language by each `test-<lang>` job.
  const gateSteps: Step[] = [
    {
      uses: actionRef('checkout'),
      with: [['persist-credentials', 'false']],
    },
    {
      if: 'always()',
      uses: actionRef('downloadArtifact'),
      with: [
        ['pattern', 'coverage-*'],
        ['path', 'coverage'],
      ],
    },
    {
      // Every value reaching the shell arrives through `env:`. Substituting
      // `${{ ... }}` straight into a `run:` block is a code-injection sink
      // (zizmor's template-injection audit), even for a `workflow_call` input.
      env: [
        ['COVERAGE_THRESHOLD', '${{ inputs.coverage-threshold }}'],
        ['GATE_SCRIPT', '${{ inputs.coverage-gate-script }}'],
      ],
      run: [
        'ls -la coverage || true',
        // Prefer the caller's generated copy; fall back to the one shipped
        // beside the reusable workflow so a `--root <subdir>` caller works too.
        'if [ ! -f "$GATE_SCRIPT" ]; then',
        '  GATE_SCRIPT=node_modules/righthook/.righthook/coverage_gate.py',
        'fi',
        'python3 "$GATE_SCRIPT" --threshold "$COVERAGE_THRESHOLD"' +
          reports.map((report) => ` --report ${report}`).join(''),
      ],
    },
    {
      if: "github.event_name == 'pull_request'",
      // One invocation per language, so a failure names the language. The base
      // ref and threshold arrive through `env:` rather than being interpolated.
      env: [
        ['BASE_REF', '${{ github.base_ref }}'],
        ['DIFF_COVERAGE', '${{ inputs.diff-coverage }}'],
      ],
      run: [
        'if ! command -v pipx >/dev/null; then',
        '  echo "pipx unavailable; skipping diff coverage"',
        '  exit 0',
        'fi',
        ...reports.map(
          (report) =>
            `pipx run diff-cover "${report.split('=')[1]}"` +
            ' --compare-branch="origin/$BASE_REF"' +
            ' --fail-under="$DIFF_COVERAGE"',
        ),
      ],
    },
  ];
  // Only emitted when some language actually produces a report; otherwise
  // there is no threshold to enforce and the job would fail on "no data".
  if (withCoverage.length > 0) {
    lines.push('  coverage-gate:');
    lines.push('    name: coverage gate');
    lines.push('    if: always()');
    lines.push('    runs-on: ubuntu-latest');
    lines.push(
      `    needs: [${withCoverage.map(({ entry }) => `test-${entry.language.id}`).join(', ')}]`,
    );
    lines.push('    steps:');
    for (const step of gateSteps) lines.push(...renderStep(step, '      '));
  }

  lines.push(
    ...requiredJob(
      [
        ...entries.map(({ entry }) => `lint-${entry.language.id}`),
        ...withCoverage.map(({ entry }) => `test-${entry.language.id}`),
      ],
      withCoverage.length > 0
        ? ['security', 'workflow-lint', 'coverage-gate']
        : ['security', 'workflow-lint'],
    ),
  );

  return `${lines.join('\n')}\n`;
}

/** Render the thin caller workflow for `--ci-mode=caller`. */
export function renderCaller(
  detected: DetectedLanguage[],
  options: ManifestOptions,
  packageRef: string,
  version: string,
): string {
  const gateScript =
    options.root === '.'
      ? '.righthook/coverage_gate.py'
      : `${options.root}/.righthook/coverage_gate.py`;
  return [
    `# Generated by righthook v${version}. Do not edit.`,
    'name: righthook',
    'on:',
    '  push:',
    '    branches: [main]',
    '  pull_request:',
    'permissions:',
    '  contents: read',
    'jobs:',
    '  righthook:',
    `    uses: ${packageRef}`,
    '    with:',
    `      languages: '${JSON.stringify(detected.map((entry) => entry.language.id))}'`,
    `      coverage-threshold: ${options.coverageThreshold}`,
    `      diff-coverage: ${options.diffCoverage}`,
    `      coverage-gate-script: ${gateScript}`,
    '    secrets: inherit',
    '',
  ].join('\n');
}
