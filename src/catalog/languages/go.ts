import type { LanguageSpec } from '../types.js';

export const go: LanguageSpec = {
  id: 'go',
  label: 'Go',
  detect: ['go.mod'],
  fileGlob: '*.go',
  ciSetup: ['go', 'golangci'],
  dependabot: ['gomod'],
  ciInstall: ['go mod download'],
  tools: [
    {
      id: 'gofmt',
      category: 'format',
      hook: 'pre-commit',
      argv: 'gofmt -w {staged_files}',
      priority: 1,
      stageFixed: true,
      install: {
        go: 'shipped with Go',
        brew: 'brew install go',
        url: 'https://pkg.go.dev/cmd/gofmt',
      },
    },
    {
      id: 'goimports',
      category: 'format',
      hook: 'pre-commit',
      argv: 'goimports -w -local "" {staged_files}',
      ciArgv: 'test -z "$(goimports -l .)"',
      priority: 1,
      stageFixed: true,
      install: {
        go: 'go install golang.org/x/tools/cmd/goimports@latest',
        url: 'https://pkg.go.dev/golang.org/x/tools/cmd/goimports',
      },
    },
    {
      id: 'golangci',
      category: 'lint',
      hook: 'pre-commit',
      argv: 'golangci-lint run --fix --new-from-rev=HEAD --timeout 5m',
      ciArgv: 'golangci-lint run --timeout 10m',
      priority: 2,
      install: {
        brew: 'brew install golangci-lint',
        go: 'go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest',
        url: 'https://golangci-lint.run',
      },
    },
    {
      id: 'govulncheck',
      category: 'deps',
      hook: 'pre-push',
      argv: 'govulncheck ./...',
      ciArgv: 'govulncheck ./...',
      priority: 1,
      install: {
        go: 'go install golang.org/x/vuln/cmd/govulncheck@latest',
        brew: 'brew install govulncheck',
        url: 'https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck',
      },
    },
    {
      id: 'go-test',
      category: 'test',
      hook: 'pre-push',
      argv:
        'mkdir -p coverage && go test -race ./... ' +
        '-coverprofile=coverage/cover.out -covermode=atomic',
      ciArgv:
        'mkdir -p coverage && go test -race ./... ' +
        '-coverprofile=coverage/cover.out -covermode=atomic',
      priority: 2,
      // Go emits its own profile format; convert it to Cobertura so the same
      // coverage gate can parse every language. See the README's contingency
      // note about dropping `--report go=` when these modules cannot resolve.
      after: [
        'go run github.com/axw/gocov/gocov@latest convert coverage/cover.out > coverage/cover.json',
        'go run github.com/AlekSi/gocov-xml@latest < coverage/cover.json > coverage/cobertura.xml',
      ],
      coverageArtifact: 'cobertura',
      coveragePath: 'coverage/cobertura.xml',
      install: { go: 'shipped with Go', url: 'https://pkg.go.dev/cmd/go' },
    },
  ],
  conditionalTools: [
    {
      when: [{ anyPath: ['golangci.yml', 'golangci.yaml', '.golangci.yml', '.golangci.yaml'] }],
      tool: {
        id: 'golangci-full',
        category: 'lint',
        hook: 'pre-push',
        argv: 'golangci-lint run --timeout 10m',
        priority: 6,
        install: {
          brew: 'brew install golangci-lint',
          url: 'https://golangci-lint.run',
        },
      },
    },
  ],
};
