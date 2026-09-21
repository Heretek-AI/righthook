# righthook presets

Single, self-contained lefthook documents — for repositories that want
righthook's hook matrix through `extends` rather than by generating files.

| Preset | Contents |
| --- | --- |
| `lefthook.all.yml` | Every language in the matrix. |
| `lefthook-minimal.yml` | Universal hooks plus one language. |
| `workflows/ci.yml` | The reusable `workflow_call` pipeline. |

## Why these are single files

lefthook resolves `extends` paths against the **git repository root**, not
against the file that lists them:

```go
// review/lefthook/internal/config/loader.go — extendRecursive
if !filepath.IsAbs(pathOrGlob) {
    pathOrGlob = filepath.Join(root, pathOrGlob)  // root, not the includer
}
```

See also upstream [issue #1258](https://github.com/evilmartians/lefthook/issues/1258).
The consequences, which this package's layout is built around:

1. **Extends paths must start with `node_modules/<pkg>/...`.** A relative path
   like `./hooks/x.yaml` or `../shared/y.yaml` resolves against the consumer's
   git root and is silently ignored.
2. **Never extend a preset and a fragment the preset already extends.** Doing so
   fails with `possible recursion in extends: path X is specified multiple
   times`.
3. **`run:` paths resolve against the git root too**, so every command in these
   presets goes through
   `node_modules/@heretek-ai/righthook/.righthook/run.sh`.

Because a recursive `extends` graph is what triggers all three, righthook ships
one flattened document per preset instead. That is also why the **default**
delivery mode writes a generated `lefthook.yml` rather than extending anything.

## Use a preset

```sh
npm install -D @heretek-ai/righthook lefthook
```

```yaml
# lefthook.yaml
extends:
  - node_modules/@heretek-ai/righthook/presets/lefthook.all.yml
```

```sh
npx lefthook install
```

`presets/lefthook.all.yml` names every tool in the matrix, so tools that are not
installed are reported and skipped locally by `.righthook/run.sh`. CI must run
the same checks unguarded for the preset to be an actual gate.

## Use the reusable workflow

```yaml
# .github/workflows/righthook.yml
name: righthook
on:
  push: { branches: [main] }
  pull_request:
permissions: { contents: read }
jobs:
  righthook:
    uses: <owner>/righthook/.github/workflows/ci.yml@<40-char-sha> # v1
    with:
      languages: '["universal","typescript","go"]'
    secrets: inherit
```

Get the `languages` value from `npx @heretek-ai/righthook doctor --json`.

## Generated mode instead

`npx @heretek-ai/righthook init` writes a `lefthook.yml` and a workflow containing only the
languages the repository actually uses. That is the recommended path, and the
one the README documents in full.
