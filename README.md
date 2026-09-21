# righthook

Deploy a [lefthook](https://github.com/evilmartians/lefthook) git-hook
configuration and a matching GitHub Actions pipeline into any repository.

```sh
npx @heretek-ai/righthook init
```

One command, and a polyglot repository gets format, lint, type-check, static
analysis, test, dead-code, vulnerable-dependency and secret scanning on every
commit and push — plus changed-line and total-coverage gates in CI.

---

## What it writes

| File                                                   | Purpose                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| `lefthook.yml`                                         | The hook configuration. Generated, wholly owned by righthook. |
| `.righthook/run.sh`                                    | Tool launcher. Skips a tool that is not installed locally.    |
| `.righthook/merge-conflicts.sh`                        | Blocks on leftover conflict markers.                          |
| `.righthook/coverage_gate.py`                          | Enforces the coverage threshold over mixed report formats.    |
| `.righthook/jscpd.json`, `.righthook/osv-scanner.toml` | Configs a generated command names.                            |
| `.github/workflows/righthook.yml`                      | The CI pipeline, narrowed to the detected languages.          |
| `.github/dependabot.yml`                               | One grouped, weekly entry per detected ecosystem.             |
| `.righthook/manifest.json`                             | sha256 of every file righthook wrote.                         |

`.editorconfig`, `.yamllint.yaml`, `commitlint.config.mjs` and
`.righthook/simplecov.rb` are written only when a generated command needs them.

## Commands

```text
righthook init   [options]   write the managed files and install git hooks
righthook sync   [options]   re-render the managed files (same pipeline as init)
righthook doctor [--json]    report which tools are installed locally
righthook presets            print the reusable workflow and preset YAML
```

| Option                                 | Meaning                                               |
| -------------------------------------- | ----------------------------------------------------- |
| `--languages a,b`                      | Override detection entirely.                          |
| `--add-languages x,y`                  | Union with what was detected.                         |
| `--coverage-threshold <pct>`           | Total-coverage gate in CI (default `80`).             |
| `--diff-coverage <pct>`                | Changed-line gate on pull requests (default `80`).    |
| `--ci-mode vendored\|caller`           | Inline the pipeline, or call the reusable workflow.   |
| `--secrets-tool betterleaks\|gitleaks` | Which secret scanner the hooks use.                   |
| `--root <dir>`                         | Write `lefthook.yml` and `.righthook/` under `<dir>`. |
| `--force`                              | Overwrite files that were modified locally.           |
| `--no-install`                         | Skip `lefthook install`.                              |
| `--dry-run`                            | Print what would change; write nothing.               |

## How enforcement works

**Locally, a missing tool is a skip; CI is the gate.** Every hook command goes
through `.righthook/run.sh`, which exits `0` with a message when the tool is not
installed:

```text
righthook: typos not installed - skipped locally (enforced in CI)
```

A tool that _is_ installed runs normally and its own exit status blocks the
commit. So the pre-commit hook is fast on a fresh clone, and nothing can be
hidden by not installing a linter — CI runs the same checks unguarded.

**Formatters fix, linters block.** Format commands carry `stage_fixed: true`,
so the repaired file is re-staged and the commit proceeds. Lint, type-check,
test and security failures block.

**Pre-commit is one pass over a small file set.** Commands run with
`parallel: false` and an explicit `priority`, so every formatter (priority 1)
runs before every linter (priority 2). lefthook skips a command whose filtered
file list is empty, so a polyglot repository pays only for the languages it
actually staged.

## The hook matrix

| Language       | pre-commit                                                                                                                                        | pre-push                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| _universal_    | `betterleaks`, `typos`, `merge-conflicts`, `editorconfig-checker`, `prettier`, `shfmt`, `yamllint`, `markdownlint-cli2`, `shellcheck`, `hadolint` | `betterleaks`, `typos`, `actionlint`, `zizmor`, `osv-scanner`, `jscpd`, `trivy config`               |
| TypeScript     | `biome format`+`biome lint` _(or_ `prettier`+`eslint --fix`_)_                                                                                    | `tsc --noEmit`, `knip`, `<pm> audit`, `biome check` _(or_ `eslint`_)_, `vitest`/`jest`/`node --test` |
| Python         | `ruff format`, `ruff check --fix`                                                                                                                 | `mypy` _(or_ `pyright`_)_, `vulture`, `bandit`, `pip-audit`, `pytest --cov`                          |
| Go             | `gofmt`, `goimports`, `golangci-lint --fix`                                                                                                       | `golangci-lint`, `govulncheck`, `go test -race`                                                      |
| Rust           | `cargo fmt`, `cargo clippy --fix`                                                                                                                 | `clippy -D warnings`, `cargo machete`, `cargo audit`, `cargo test`                                   |
| Ruby           | `rubocop -A`                                                                                                                                      | `rubocop`, `brakeman`, `bundler-audit`, `rspec`/`rake test`                                          |
| PHP            | `php-cs-fixer`, `phpcs`                                                                                                                           | `phpstan`, `composer audit`, `phpunit`                                                               |
| Java           | `spotless:apply`, `checkstyle`                                                                                                                    | `spotbugs`, `pmd`, `mvn test`                                                                        |
| Kotlin         | `ktlint --format`, `detekt`                                                                                                                       | `./gradlew test`                                                                                     |
| C# / .NET      | `dotnet format whitespace`                                                                                                                        | `dotnet format analyzers`, `dotnet build`, `dotnet test`                                             |
| Swift          | `swiftformat`, `swiftlint --fix`                                                                                                                  | `swiftlint --strict`, `swift test`                                                                   |
| Dart / Flutter | `dart format`, `dart analyze`                                                                                                                     | `dart test` / `flutter test`                                                                         |
| C / C++        | `clang-format`, `cppcheck`                                                                                                                        | `ctest`                                                                                              |
| Terraform      | `terraform fmt`, `tflint`                                                                                                                         | `terraform validate`                                                                                 |

Elixir, Scala, Clojure, Haskell, Lua, Perl, R, Nix, Zig, SQL, Protobuf, OpenAPI,
Ansible and Kubernetes are also covered. `righthook doctor` lists exactly what a
repository needs.

**Variants are chosen from the repository itself**, never guessed: an
`eslint.config.*` file selects prettier + ESLint, everything else falls back to
biome; `[tool.pyright]` selects pyright, otherwise mypy; `pom.xml` selects Maven,
Gradle selects Gradle; a `flutter:` dependency selects `flutter test`. Every
decision is recorded in `.righthook/manifest.json` under `markers`.

## Coverage

`righthook` writes `.righthook/coverage_gate.py`, a stdlib-only script that
parses Cobertura XML, JaCoCo XML and lcov, and aggregates by **line count**
(`sum(covered) / sum(total)`), so a language with more lines carries more
weight than a mostly-uncovered small one. It exits `2` when nothing parsed
rather than passing silently.

Only CI enforces the thresholds — a local pre-push run should not fail because
one language's coverage tooling is absent:

- total coverage, via the gate above;
- changed-line coverage, via [`diff-cover`](https://github.com/Bachmann1234/diff_cover)
  on pull requests, one invocation per language so a failure names it.

## Local overrides

`lefthook.yml` is generated and wholly owned; `righthook sync` rewrites it. Put
local customization in `lefthook-local.yml`, lefthook's highest-precedence
override file:

```yaml
# lefthook-local.yml
pre-push:
  commands:
    typos:
      skip: true
```

`LEFTHOOK_EXCLUDE=<tag>` disables commands for one run without touching any
file. righthook never emits `skip:` itself.

## Extending instead of generating

Generated mode is the default and is the recommended path, because lefthook
resolves `extends` paths against the **git root** rather than the including file
([loader.go, `extendRecursive`](https://github.com/evilmartians/lefthook/blob/master/internal/config/loader.go);
upstream [issue #1258](https://github.com/evilmartians/lefthook/issues/1258)).
Recursively extending fragments out of `node_modules` therefore requires
hand-written `node_modules/<pkg>/...` paths and a discipline of never extending a
preset _and_ a fragment it already pulls in.

```yaml
# lefthook.yaml — one self-contained preset, no recursion
extends:
  - node_modules/@heretek-ai/righthook/presets/lefthook.all.yml
```

`presets/lefthook-minimal.yml` is the same shape with universal hooks plus one
language. `presets/README.md` has the details.

## CI delivery modes

- **`--ci-mode vendored`** (default) writes `.github/workflows/righthook.yml`
  with the detected languages inlined and the thresholds baked in. Nothing else
  to set up.
- **`--ci-mode caller`** writes a thin caller of the reusable workflow:

  ```yaml
  jobs:
    righthook:
      uses: <owner>/<repo>/.github/workflows/ci.yml@<sha>
      with:
        languages: '["universal","typescript","go"]'
        coverage-threshold: 80
        diff-coverage: 80
      secrets: inherit
  ```

  `workflows/ci.yml` in this package is the reusable definition. Every `uses:`
  in every generated file is pinned to a 40-character commit SHA with the
  release tag in a trailing comment, so the output passes the same
  `zizmor --pedantic --min-severity=low` check it deploys.

righthook's own repository uses **vendored** mode, the only mode verified end
to end (see the limitations below).

Branch protection should point at the single **`required`** job, which fails
whenever any other job did not succeed. `deps-review` runs on pull requests
only; `security` uploads SARIF to the repository's code-scanning tab.

CI checks are scoped to the repository's own sources with
`git ls-files … ':(exclude)…'`, matching the local hooks' `exclude:` list, so a
check never inspects the files righthook generated. Workflow inputs and
`github.base_ref` are passed to shell steps through `env:` rather than
interpolated into `run:` blocks, and every checkout sets
`persist-credentials: false`.

`zizmor` is invoked as `zizmor --pedantic --min-severity=low`: `--pedantic` and
`--persona` are mutually exclusive in current zizmor, and `--pedantic` alone
promotes informational advisories (an unnamed job, an unpinned action) into
failures. The chosen flags keep real findings fatal while letting those through.

## Monorepos

`--root <subdir>` writes `lefthook.yml` and `.righthook/` under that directory
and puts `root: <subdir>` on every generated command, so whole-repo tools
(`golangci-lint`, `typos`) run against the subtree rather than the whole
repository. lefthook resolves its config at the git root, so the command also
prints the one line of environment setup the directory needs:

```sh
export LEFTHOOK_CONFIG=services/api/lefthook.yml
```

Run `righthook init` once per managed subdirectory.

## Drift and updates

`righthook sync` compares every managed file against the hashes in
`.righthook/manifest.json`:

- on disk identical to what would be written → left alone;
- on disk untouched but the _generated content changed_ → rewritten. This is
  the upgrade path: a new package version, a changed flag or a newly detected
  language legitimately changes the template, and that is not drift;
- on disk differing from what the manifest recorded → a local edit, **refused**
  with the file named. `--force` overwrites and updates the hash;
- present but never recorded (a hand-written `lefthook.yml`) → `init` refuses
  outright; `--force` takes ownership.

`lefthook.yml` is the exception: it is always rewritten, because it is wholly
owned and has its own override file.

## Notes and limitations

- **Generated helper files are excluded from linting.** `.righthook/**`,
  `lefthook.yml`, `.editorconfig`, `.yamllint.yaml`, `commitlint.config.mjs`
  and the generated workflow carry an `exclude:` in `lefthook.yml` and are
  filtered out of every CI check, because they are righthook's output rather
  than yours. Edit them and the next `sync` will refuse to overwrite (except
  `lefthook.yml`, which is wholly owned).
- **`--ci-mode caller` is generated but not proven.** The reusable workflow in
  `workflows/ci.yml` and the caller that references it are structurally
  validated (`actionlint`, `zizmor`) and the workflow's own jobs pass when
  vendored, but every caller-form run attempted on a live repository — whether
  `uses: owner/repo/.github/workflows/ci.yml@<sha>` or a same-repository
  `uses: ./.github/workflows/ci.yml` — failed with `startup_failure`, and a
  same-repository call to a _minimal_ reusable workflow succeeded, so the cause
  is not yet isolated. Use the default `vendored` mode unless you are prepared
  to debug that.
- **Tool configuration is not generated.** righthook emits hooks, not
  `biome.json`, `ruff.toml`, `.golangci.yml` or `phpstan.neon`. A repository's
  existing config applies unchanged; one with no config gets each tool's
  defaults. Three defaults are worth knowing before your first push, and this
  repository carries the config each one needed:
  - `markdownlint-cli2` enforces an 80-column limit (`MD013`) that trips on
    every table → `.markdownlint.jsonc`.
  - `biome check .` walks directories you have not gitignored → `vcs.useIgnoreFile`
    in `biome.jsonc`.
  - `prettier` and `biome` both claim `*.jsonc` and disagree on JSONC trailing
    commas, so they rewrite each other every commit → `.prettierignore`.
- **Go coverage is converted.** `go test` emits a Go-native profile, so the CI
  test job runs `gocov` then `gocov-xml` to produce Cobertura. If those modules
  cannot be fetched in your environment, drop the `--report go=` argument and
  the gate reports Go as `SKIP: no coverage data`.
- **Ruby coverage needs `simplecov-cobertura`.** Without it,
  `.righthook/simplecov.rb` falls back and the gate reports `SKIP ruby`.
  righthook does not add the gem to your `Gemfile`.
- **`pipx` drives diff coverage.** GitHub-hosted runners ship it; where it is
  missing the step prints a warning and only the total threshold applies.
- **Pre-push cost scales with the repository.** Whole-repo tools run on every
  push. Use `lefthook-local.yml` or `LEFTHOOK_EXCLUDE` if that is too slow
  locally — CI is unaffected.
- **Node.js ≥ 20.19** to run the generator; the generated hooks need only `sh`
  and whichever tools you have.

## Publishing

The package is published under the `@heretek-ai` scope as a public package. It
depends on no build host beyond a Node toolchain, and `prepublishOnly` runs the
full check (build + `biome ci` + tests) before anything is uploaded, so a
release cannot ship a broken tree.

```sh
npm login                       # an account that is a member of the @heretek-ai org
npm publish --access public     # publishConfig already sets access: public
```

`publishConfig.provenance` is deliberately **not** set. Provenance requires an
OIDC-attested publish from CI (`id-token: write` in a GitHub Actions job); with
it enabled, a local `npm publish` fails. Add `--provenance` on the CI run when
you want it:

```sh
npm publish --access public --provenance   # from GitHub Actions, id-token: write
```

Verify a release the way a consumer will, from a scratch repository:

```sh
npm pack                                        # build the tarball
npm install -D ./heretek-ai-righthook-0.1.0.tgz # in a scratch git repo
npx righthook init --no-install
lefthook validate
```

## Development

```sh
npm install
npm run build     # tsc + emit presets/ and workflows/ci.yml
npm run lint      # biome, over src/ test/ bin/
npm test          # type-check + unit tests
npm run check     # build + lint + test
```

This repository is itself managed by righthook: `lefthook.yml`,
`.righthook/` and `.github/workflows/righthook.yml` are generated artifacts
kept in sync with `node bin/righthook.js sync`. `.github/workflows/righthook.yml`
is a caller of the reusable definition in `workflows/ci.yml`, i.e. the package
dogfoods the delivery mode it documents. Additions specific to this repository
(its own typecheck and lint commands) live in `lefthook-local.yml`, exactly as
the README tells consumers to do it.

`npm run build` regenerates `presets/`, `workflows/ci.yml` and this
repository's own `.github/workflows/ci.yml` from the same generators the CLI
uses, so the shipped artifacts cannot drift from the tool.

## License

MIT.
