import type { LanguageSpec, ToolSpec } from '../types.js';

/**
 * Emitted for every repository, regardless of detected languages.
 *
 * `universal` is not detectable: it is unconditionally included by
 * `detectLanguages()` and always sorts first in the manifest.
 */
export const universal: LanguageSpec = {
  id: 'universal',
  label: 'Universal',
  detect: [],
  fileGlob: '*',
  ciSetup: [],
  dependabot: ['github-actions'],
  tools: [
    {
      id: 'betterleaks',
      category: 'sast',
      hook: 'pre-commit',
      argv: 'betterleaks git --pre-commit --staged --redact --verbose',
      priority: 3,
      install: {
        brew: 'brew install betterleaks',
        go: 'go install github.com/betterleaks/betterleaks/v2@latest',
        url: 'https://github.com/betterleaks/betterleaks',
      },
    },
    {
      id: 'betterleaks-deep',
      category: 'sast',
      hook: 'pre-push',
      argv: 'betterleaks git . --redact --verbose',
      priority: 3,
      install: {
        brew: 'brew install betterleaks',
        go: 'go install github.com/betterleaks/betterleaks/v2@latest',
        url: 'https://github.com/betterleaks/betterleaks',
      },
    },
    {
      id: 'typos-fix',
      category: 'lint',
      hook: 'pre-commit',
      argv: 'typos --write-changes --force-exclude {staged_files}',
      ciArgv: 'xargs -0 -r typos --force-exclude',
      ciFiles: true,
      priority: 2,
      stageFixed: true,
      install: {
        brew: 'brew install typos-cli',
        cargo: 'cargo install typos-cli',
        npm: 'npm install -D typos-cli',
        url: 'https://github.com/crate-ci/typos',
      },
    },
    {
      id: 'typos',
      category: 'lint',
      hook: 'pre-push',
      argv: 'typos --force-exclude .',
      priority: 4,
      install: {
        brew: 'brew install typos-cli',
        cargo: 'cargo install typos-cli',
        url: 'https://github.com/crate-ci/typos',
      },
    },
    {
      id: 'editorconfig',
      category: 'format',
      hook: 'pre-commit',
      argv: 'editorconfig-checker {staged_files}',
      ciArgv: 'xargs -0 -r editorconfig-checker',
      ciFiles: true,
      priority: 4,
      install: {
        brew: 'brew install editorconfig-checker',
        go: 'go install github.com/editorconfig-checker/editorconfig-checker/v3/cmd/editorconfig-checker@latest',
        npm: 'npm install -D editorconfig-checker',
        url: 'https://github.com/editorconfig-checker/editorconfig-checker',
      },
    },
    {
      id: 'merge-conflicts',
      category: 'lint',
      hook: 'pre-commit',
      // The literal `sh -c 'for f in {staged_files}; ...'` form does not survive
      // lefthook's shell escaping of `{staged_files}`, which is applied inside
      // the nested single quotes and breaks the `for` loop. A helper script
      // receives the escaped file list as ordinary positional arguments
      // instead. See test/generate.test.ts for the regression check.
      argv: 'sh {righthook}/merge-conflicts.sh {staged_files}',
      priority: 1,
      install: { url: 'shipped by righthook' },
    },
    {
      id: 'yamllint',
      category: 'lint',
      hook: 'pre-commit',
      argv: 'yamllint -c .yamllint.yaml {staged_files}',
      ciArgv: 'xargs -0 -r yamllint -c .yamllint.yaml',
      ciFiles: true,
      glob: '*.{yml,yaml}',
      priority: 5,
      install: {
        brew: 'brew install yamllint',
        uv: 'uv tool install yamllint',
        url: 'https://github.com/adrienverge/yamllint',
      },
    },
    {
      id: 'markdownlint',
      category: 'lint',
      hook: 'pre-commit',
      argv: 'markdownlint-cli2 {staged_files}',
      ciArgv: 'xargs -0 -r markdownlint-cli2',
      ciFiles: true,
      glob: '*.{md,mdx}',
      priority: 5,
      install: {
        npm: 'npm install -D markdownlint-cli2',
        brew: 'brew install markdownlint-cli2',
        url: 'https://github.com/DavidAnson/markdownlint-cli2',
      },
    },
    {
      id: 'prettier-other',
      category: 'format',
      hook: 'pre-commit',
      argv: 'prettier --write --ignore-unknown {staged_files}',
      ciArgv: 'xargs -0 -r prettier --check',
      ciFiles: true,
      glob: '*.{md,mdx,yml,yaml,json,jsonc,css,scss,html}',
      priority: 1,
      stageFixed: true,
      install: {
        npm: 'npm install -D prettier',
        brew: 'brew install prettier',
        url: 'https://prettier.io',
      },
    },
    {
      id: 'shellcheck',
      category: 'lint',
      hook: 'pre-commit',
      argv: 'shellcheck {staged_files}',
      ciArgv: 'xargs -0 -r shellcheck',
      ciFiles: true,
      glob: '*.{sh,bash}',
      priority: 5,
      install: {
        brew: 'brew install shellcheck',
        url: 'https://github.com/koalaman/shellcheck',
      },
    },
    {
      id: 'shfmt',
      category: 'format',
      hook: 'pre-commit',
      argv: 'shfmt -w -i 2 -ci {staged_files}',
      ciArgv: 'xargs -0 -r shfmt -d -i 2 -ci',
      ciFiles: true,
      glob: '*.{sh,bash}',
      priority: 1,
      stageFixed: true,
      install: {
        brew: 'brew install shfmt',
        go: 'go install mvdan.cc/sh/v3/cmd/shfmt@latest',
        url: 'https://github.com/mvdan/sh',
      },
    },
    {
      id: 'hadolint',
      category: 'lint',
      hook: 'pre-commit',
      argv: 'hadolint {staged_files}',
      ciArgv: 'xargs -0 -r hadolint',
      ciFiles: true,
      glob: 'Dockerfile*',
      priority: 5,
      install: {
        brew: 'brew install hadolint',
        url: 'https://github.com/hadolint/hadolint',
      },
    },
    {
      id: 'actionlint',
      category: 'lint',
      hook: 'pre-push',
      argv: 'actionlint',
      priority: 5,
      install: {
        brew: 'brew install actionlint',
        go: 'go install github.com/rhysd/actionlint/cmd/actionlint@latest',
        url: 'https://github.com/rhysd/actionlint',
      },
    },
    {
      id: 'zizmor',
      category: 'sast',
      hook: 'pre-push',
      // `--pedantic` and `--persona` are mutually exclusive in zizmor, and
      // `--pedantic` promotes informational advisories (an unpinned action, a
      // job without a name) into failures. `--min-severity=low` keeps real
      // problems fatal while letting those advisories through, which is the
      // only setting a generated workflow can realistically satisfy.
      argv: 'zizmor --pedantic --min-severity=low .github/workflows',
      ciArgv: 'zizmor --pedantic --min-severity=low .github/workflows',
      priority: 6,
      install: {
        brew: 'brew install zizmor',
        cargo: 'cargo install zizmor',
        uv: 'uv tool install zizmor',
        url: 'https://github.com/woodruffw/zizmor',
      },
    },
    {
      id: 'osv-scanner',
      category: 'deps',
      hook: 'pre-push',
      argv: 'osv-scanner scan source --recursive --config .righthook/osv-scanner.toml .',
      priority: 1,
      install: {
        brew: 'brew install osv-scanner',
        go: 'go install github.com/google/osv-scanner/v2/cmd/osv-scanner@latest',
        url: 'https://github.com/google/osv-scanner',
      },
    },
    {
      id: 'jscpd',
      category: 'deadcode',
      hook: 'pre-push',
      argv: 'jscpd --config .righthook/jscpd.json --threshold 5 .',
      priority: 2,
      install: {
        npm: 'npm install -D jscpd',
        url: 'https://github.com/kucherenko/jscpd',
      },
    },
    {
      id: 'trivy-config',
      category: 'sast',
      hook: 'pre-push',
      argv: 'trivy config --exit-code 1 --severity HIGH,CRITICAL --skip-dirs .git .',
      priority: 7,
      install: {
        brew: 'brew install trivy',
        url: 'https://github.com/aquasecurity/trivy',
      },
    },
    {
      id: 'commitlint',
      category: 'lint',
      hook: 'commit-msg',
      // `{1}` is substituted by the generator with lefthook's positional git
      // argument template for the commit message file.
      argv: 'commitlint --edit {1}',
      priority: 1,
      install: {
        npm: 'npm install -D @commitlint/cli @commitlint/config-conventional',
        url: 'https://commitlint.js.org',
      },
    },
  ],
};

export const universalTools = (): ToolSpec[] => universal.tools;
