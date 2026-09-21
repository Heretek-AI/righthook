import type { LanguageSpec, ToolSpec } from '../types.js';

/**
 * Lower-frequency languages. Each entry is deliberately small: detection plus
 * the one or two tools that dominate that ecosystem.
 */

function tool(
  id: string,
  category: ToolSpec['category'],
  hook: ToolSpec['hook'],
  argv: string,
  priority: number,
  extra: Partial<ToolSpec> = {},
): ToolSpec {
  return { id, category, hook, argv, priority, install: {}, ...extra };
}

export const elixir: LanguageSpec = {
  id: 'elixir',
  label: 'Elixir',
  detect: ['mix.exs'],
  fileGlob: '*.{ex,exs}',
  ciSetup: ['elixir'],
  ciInstall: ['mix deps.get'],
  tools: [
    tool('mix-format', 'format', 'pre-commit', 'mix format', 1, {
      ciArgv: 'mix format --check-formatted',
      stageFixed: true,
      install: { brew: 'brew install elixir', url: 'https://hexdocs.pm/mix' },
    }),
    tool('credo', 'lint', 'pre-push', 'mix credo --strict', 6, {
      ciArgv: 'mix credo --strict',
      install: { url: 'https://github.com/rrrene/credo' },
    }),
    tool('dialyzer', 'typecheck', 'pre-push', 'mix dialyzer', 5, {
      ciArgv: 'mix dialyzer',
      install: { url: 'https://github.com/jeremyjh/dialyxir' },
    }),
    tool('mix-test', 'test', 'pre-push', 'mix test', 2, {
      ciArgv: 'mix test --cover',
      install: { url: 'https://hexdocs.pm/mix' },
    }),
  ],
};

export const scala: LanguageSpec = {
  id: 'scala',
  label: 'Scala',
  detect: ['build.sbt'],
  fileGlob: '*.scala',
  ciSetup: ['java', 'scala'],
  tools: [
    tool('scalafmt', 'format', 'pre-commit', 'scalafmt --non-interactive', 1, {
      ciArgv: 'scalafmt --test',
      stageFixed: true,
      install: {
        brew: 'brew install scalafmt',
        url: 'https://scalameta.org/scalafmt',
      },
    }),
    tool('scalafix', 'lint', 'pre-push', 'sbt scalafixAll', 6, {
      ciArgv: 'sbt "scalafixAll --check"',
      install: { url: 'https://scalacenter.github.io/scalafix' },
    }),
    tool('sbt-test', 'test', 'pre-push', 'sbt test', 2, {
      ciArgv: 'sbt test',
      install: { url: 'https://www.scala-sbt.org' },
    }),
  ],
};

export const clojure: LanguageSpec = {
  id: 'clojure',
  label: 'Clojure',
  detect: ['deps.edn', 'project.clj'],
  fileGlob: '*.clj',
  ciSetup: ['clojure'],
  tools: [
    tool('cljstyle', 'format', 'pre-commit', 'cljstyle fix --report', 1, {
      ciArgv: 'cljstyle check',
      stageFixed: true,
      install: { brew: 'brew install cljstyle', url: 'https://github.com/greglook/cljstyle' },
    }),
    tool('clj-kondo', 'lint', 'pre-commit', 'clj-kondo --lint src test', 2, {
      ciArgv: 'clj-kondo --lint src test',
      install: { brew: 'brew install clj-kondo', url: 'https://github.com/clj-kondo/clj-kondo' },
    }),
  ],
};

export const haskell: LanguageSpec = {
  id: 'haskell',
  label: 'Haskell',
  detect: ['*.cabal', 'stack.yaml'],
  fileGlob: '*.hs',
  ciSetup: ['haskell'],
  tools: [
    tool('fourmolu', 'format', 'pre-commit', 'fourmolu -i {staged_files}', 1, {
      ciArgv: 'fourmolu --mode check .',
      stageFixed: true,
      install: { brew: 'brew install fourmolu', url: 'https://github.com/fourmolu/fourmolu' },
    }),
    tool('hlint', 'lint', 'pre-commit', 'hlint .', 2, {
      ciArgv: 'hlint .',
      install: { brew: 'brew install hlint', url: 'https://github.com/ndmitchell/hlint' },
    }),
    tool('cabal-test', 'test', 'pre-push', 'cabal test', 2, {
      ciArgv: 'cabal test',
      install: { url: 'https://www.haskell.org/cabal' },
    }),
  ],
};

export const lua: LanguageSpec = {
  id: 'lua',
  label: 'Lua',
  detect: ['.luacheckrc', '*.lua', 'stylua.toml'],
  fileGlob: '*.lua',
  ciSetup: ['lua'],
  tools: [
    tool('stylua', 'format', 'pre-commit', 'stylua {staged_files}', 1, {
      ciArgv: 'stylua --check .',
      stageFixed: true,
      install: { cargo: 'cargo install stylua', brew: 'brew install stylua', url: 'https://github.com/JohnnyMorganz/StyLua' },
    }),
    tool('luacheck', 'lint', 'pre-commit', 'luacheck {staged_files}', 2, {
      ciArgv: 'luacheck .',
      install: { brew: 'brew install luacheck', url: 'https://github.com/lunarmodules/luacheck' },
    }),
  ],
};

export const perl: LanguageSpec = {
  id: 'perl',
  label: 'Perl',
  detect: ['cpanfile', 'Makefile.PL', '*.pl', '*.pm'],
  fileGlob: '*.{pl,pm,t}',
  ciSetup: ['perl'],
  tools: [
    tool('perlcritic', 'lint', 'pre-commit', 'perlcritic --severity 3 {staged_files}', 2, {
      ciArgv: 'perlcritic --severity 3 .',
      install: { brew: 'brew install perlcritic', url: 'https://github.com/Perl-Critic/Perl-Critic' },
    }),
    tool('prove', 'test', 'pre-push', 'prove -lr t', 2, {
      ciArgv: 'prove -lr t',
      install: { url: 'https://perldoc.perl.org/prove' },
    }),
  ],
};

export const r: LanguageSpec = {
  id: 'r',
  label: 'R',
  detect: ['DESCRIPTION'],
  fileGlob: '*.R',
  ciSetup: ['r'],
  tools: [
    tool('styler', 'format', 'pre-commit', 'Rscript -e \'styler::style_dir("R")\'', 1, {
      ciArgv: 'Rscript -e \'stopifnot(length(styler::style_dir("R", dry = "on")) == 0)\'',
      stageFixed: true,
      install: { url: 'https://styler.r-lib.org' },
    }),
    tool('lintr', 'lint', 'pre-commit', 'Rscript -e \'lintr::lint_dir("R")\'', 2, {
      ciArgv: 'Rscript -e \'lintr::lint_dir("R")\'',
      install: { url: 'https://lintr.r-lib.org' },
    }),
    tool('testthat', 'test', 'pre-push', 'Rscript -e \'testthat::test_local()\'', 2, {
      ciArgv: 'Rscript -e \'testthat::test_local()\'',
      install: { url: 'https://testthat.r-lib.org' },
    }),
  ],
};

export const nix: LanguageSpec = {
  id: 'nix',
  label: 'Nix',
  detect: ['flake.nix', 'default.nix'],
  fileGlob: '*.nix',
  ciSetup: ['nix'],
  tools: [
    tool('nixfmt', 'format', 'pre-commit', 'nixfmt {staged_files}', 1, {
      ciArgv: 'nixfmt --check .',
      stageFixed: true,
      install: { brew: 'brew install nixfmt', url: 'https://github.com/NixOS/nixfmt' },
    }),
    tool('statix', 'lint', 'pre-commit', 'statix check', 2, {
      ciArgv: 'statix check',
      install: { brew: 'brew install statix', url: 'https://github.com/oppiliappan/statix' },
    }),
    tool('deadnix', 'deadcode', 'pre-push', 'deadnix --fail', 3, {
      ciArgv: 'deadnix --fail',
      install: { brew: 'brew install deadnix', url: 'https://github.com/astro/deadnix' },
    }),
  ],
};

export const zig: LanguageSpec = {
  id: 'zig',
  label: 'Zig',
  detect: ['build.zig'],
  fileGlob: '*.zig',
  ciSetup: ['zig'],
  tools: [
    tool('zig-fmt', 'format', 'pre-commit', 'zig fmt {staged_files}', 1, {
      ciArgv: 'zig fmt --check .',
      stageFixed: true,
      install: { brew: 'brew install zig', url: 'https://ziglang.org' },
    }),
    tool('zig-test', 'test', 'pre-push', 'zig build test', 2, {
      ciArgv: 'zig build test',
      install: { brew: 'brew install zig', url: 'https://ziglang.org' },
    }),
  ],
};

export const sql: LanguageSpec = {
  id: 'sql',
  label: 'SQL',
  detect: ['*.sql', '.sqlfluff'],
  fileGlob: '*.sql',
  ciSetup: ['python'],
  tools: [
    tool('sqlfluff-fix', 'format', 'pre-commit', 'sqlfluff fix --disable-progress-bar {staged_files}', 1, {
      ciArgv: 'sqlfluff lint --disable-progress-bar .',
      stageFixed: true,
      install: { uv: 'uv tool install sqlfluff', brew: 'brew install sqlfluff', url: 'https://sqlfluff.com' },
    }),
    tool('sqlfluff', 'lint', 'pre-push', 'sqlfluff lint --disable-progress-bar .', 6, {
      ciArgv: 'sqlfluff lint --disable-progress-bar .',
      install: { uv: 'uv tool install sqlfluff', url: 'https://sqlfluff.com' },
    }),
  ],
};

export const protobuf: LanguageSpec = {
  id: 'protobuf',
  label: 'Protobuf',
  detect: ['buf.yaml', 'buf.gen.yaml', '*.proto'],
  fileGlob: '*.proto',
  ciSetup: ['go'],
  tools: [
    tool('buf-format', 'format', 'pre-commit', 'buf format -w', 1, {
      ciArgv: 'buf format --diff --exit-code',
      stageFixed: true,
      install: { brew: 'brew install bufbuild/buf/buf', url: 'https://buf.build' },
    }),
    tool('buf-lint', 'lint', 'pre-commit', 'buf lint', 2, {
      ciArgv: 'buf lint',
      install: { brew: 'brew install bufbuild/buf/buf', url: 'https://buf.build' },
    }),
  ],
};

export const openapi: LanguageSpec = {
  id: 'openapi',
  label: 'OpenAPI',
  detect: ['.spectral.yaml', '.spectral.yml'],
  fileGlob: '*.{yaml,yml,json}',
  ciSetup: ['node'],
  tools: [
    tool('spectral', 'lint', 'pre-commit', 'spectral lint --fail-severity=warn', 2, {
      ciArgv: 'spectral lint --fail-severity=warn',
      install: { npm: 'npm install -D @stoplight/spectral-cli', url: 'https://github.com/stoplightio/spectral' },
    }),
  ],
};

export const ansible: LanguageSpec = {
  id: 'ansible',
  label: 'Ansible',
  detect: ['ansible.cfg', '.ansible-lint', 'roles/'],
  fileGlob: '*.{yml,yaml}',
  ciSetup: ['python'],
  tools: [
    tool('ansible-lint', 'lint', 'pre-push', 'ansible-lint', 6, {
      ciArgv: 'ansible-lint',
      install: { uv: 'uv tool install ansible-lint', brew: 'brew install ansible-lint', url: 'https://ansible.readthedocs.io/projects/lint' },
    }),
  ],
};

export const kubernetes: LanguageSpec = {
  id: 'kubernetes',
  label: 'Kubernetes',
  detect: ['k8s/', 'kubernetes/', 'manifests/', 'charts/'],
  fileGlob: '*.{yml,yaml}',
  ciSetup: ['go'],
  tools: [
    tool('kubeconform', 'lint', 'pre-push', 'kubeconform -strict -summary -ignore-missing-schemas', 6, {
      ciArgv: 'kubeconform -strict -summary -ignore-missing-schemas',
      install: { brew: 'brew install kubeconform', go: 'go install github.com/yannh/kubeconform/cmd/kubeconform@latest', url: 'https://github.com/yannh/kubeconform' },
    }),
  ],
};

/**
 * Shell and container repos are covered by the universal `shellcheck`,
 * `shfmt`, `hadolint` and `trivy-config` jobs. They are registered without
 * tools so `righthook doctor` still reports the required binaries.
 */
export const shell: LanguageSpec = {
  id: 'shell',
  label: 'Shell',
  detect: ['*.sh', '*.bash'],
  fileGlob: '*.{sh,bash}',
  ciSetup: [],
  doctorOnly: true,
  doctorTools: ['shellcheck', 'shfmt'],
  tools: [],
};

export const docker: LanguageSpec = {
  id: 'docker',
  label: 'Container',
  detect: ['Dockerfile', 'Dockerfile.*', '*.dockerfile'],
  fileGlob: 'Dockerfile*',
  ciSetup: [],
  doctorOnly: true,
  doctorTools: ['hadolint', 'trivy-config'],
  dependabot: ['docker'],
  tools: [],
};
