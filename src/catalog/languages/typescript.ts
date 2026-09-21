import type { LanguageSpec } from '../types.js';

/**
 * TypeScript / JavaScript.
 *
 * The formatter/linter pair is selected by `variants`: an ESLint config file
 * or an `eslint` devDependency selects the prettier+eslint pair; the biome
 * variant carries an empty `when`, which the resolver reads as "default".
 */
export const typescript: LanguageSpec = {
  id: 'typescript',
  label: 'TypeScript / JavaScript',
  detect: ['package.json'],
  fileGlob: '*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,json,jsonc,css}',
  ciSetup: ['node'],
  dependabot: ['npm'],
  ciInstall: ['npm ci'],
  tools: [],
  variants: [
    {
      id: 'eslint',
      when: [
        {
          anyPath: [
            'eslint.config.js',
            'eslint.config.mjs',
            'eslint.config.cjs',
            'eslint.config.ts',
            '.eslintrc',
            '.eslintrc.js',
            '.eslintrc.cjs',
            '.eslintrc.mjs',
            '.eslintrc.json',
            '.eslintrc.yml',
            '.eslintrc.yaml',
          ],
        },
        { dep: { file: 'package.json', names: ['eslint'] } },
      ],
      tools: [
        {
          id: 'prettier-write',
          category: 'format',
          hook: 'pre-commit',
          argv: 'prettier --write --ignore-unknown {staged_files}',
          ciArgv: 'xargs -0 -r prettier --check',
          ciFiles: true,
          priority: 1,
          stageFixed: true,
          install: {
            npm: 'npm install -D prettier',
            brew: 'brew install prettier',
            url: 'https://prettier.io',
          },
        },
        {
          id: 'eslint-fix',
          category: 'lint',
          hook: 'pre-commit',
          argv: 'eslint --fix --max-warnings=0 --no-warn-ignored {staged_files}',
          priority: 2,
          stageFixed: true,
          install: { npm: 'npm install -D eslint', url: 'https://eslint.org' },
        },
        {
          id: 'eslint',
          category: 'lint',
          hook: 'pre-push',
          argv: 'eslint --max-warnings=0 .',
          ciArgv: 'xargs -0 -r eslint --max-warnings=0',
          ciFiles: true,
          priority: 6,
          install: { npm: 'npm install -D eslint', url: 'https://eslint.org' },
        },
      ],
    },
    {
      id: 'biome',
      when: [],
      tools: [
        {
          id: 'biome-format',
          category: 'format',
          hook: 'pre-commit',
          argv: 'biome format --write --no-errors-on-unmatched {staged_files}',
          priority: 1,
          stageFixed: true,
          install: {
            npm: 'npm install -D @biomejs/biome',
            brew: 'brew install biome',
            url: 'https://biomejs.dev',
          },
        },
        {
          id: 'biome-lint',
          category: 'lint',
          hook: 'pre-commit',
          argv: 'biome lint --write --no-errors-on-unmatched --error-on-warnings {staged_files}',
          priority: 2,
          install: {
            npm: 'npm install -D @biomejs/biome',
            brew: 'brew install biome',
            url: 'https://biomejs.dev',
          },
        },
        {
          id: 'biome-check',
          category: 'lint',
          hook: 'pre-push',
          argv: 'biome check --error-on-warnings .',
          ciArgv: 'xargs -0 -r biome ci --error-on-warnings',
          ciFiles: true,
          priority: 6,
          install: {
            npm: 'npm install -D @biomejs/biome',
            brew: 'brew install biome',
            url: 'https://biomejs.dev',
          },
        },
      ],
    },
  ],
  conditionalTools: [
    {
      when: [{ anyPath: ['tsconfig.json'] }],
      tool: {
        id: 'tsc',
        category: 'typecheck',
        hook: 'pre-push',
        argv: 'tsc --noEmit',
        ciArgv: 'tsc --noEmit',
        priority: 4,
        install: {
          npm: 'npm install -D typescript',
          url: 'https://www.typescriptlang.org',
        },
      },
    },
    {
      when: [{ dep: { file: 'package.json', names: ['knip'] } }],
      tool: {
        id: 'knip',
        category: 'deadcode',
        hook: 'pre-push',
        argv: 'knip --no-progress',
        ciArgv: 'knip --no-progress',
        priority: 3,
        install: { npm: 'npm install -D knip', url: 'https://knip.dev' },
      },
    },
    {
      when: [{ anyPath: ['package-lock.json'] }],
      tool: {
        id: 'npm-audit',
        category: 'deps',
        hook: 'pre-push',
        argv: 'npm audit --audit-level=high',
        ciArgv: 'npm audit --audit-level=high',
        priority: 1,
        install: {
          npm: 'shipped with npm',
          url: 'https://docs.npmjs.com/cli/commands/npm-audit',
        },
      },
    },
    {
      when: [{ anyPath: ['pnpm-lock.yaml'] }],
      tool: {
        id: 'pnpm-audit',
        category: 'deps',
        hook: 'pre-push',
        argv: 'pnpm audit --audit-level high',
        ciArgv: 'pnpm audit --audit-level high',
        priority: 1,
        install: { npm: 'shipped with pnpm', url: 'https://pnpm.io/cli/audit' },
      },
    },
    {
      when: [{ anyPath: ['yarn.lock'] }],
      tool: {
        id: 'yarn-audit',
        category: 'deps',
        hook: 'pre-push',
        argv: 'yarn npm audit --severity high',
        ciArgv: 'yarn npm audit --severity high',
        priority: 1,
        install: {
          npm: 'shipped with yarn',
          url: 'https://yarnpkg.com/cli/npm/audit',
        },
      },
    },
    {
      when: [{ anyPath: ['bun.lockb', 'bun.lock'] }],
      tool: {
        id: 'bun-audit',
        category: 'deps',
        hook: 'pre-push',
        argv: 'bun audit',
        ciArgv: 'bun audit',
        priority: 1,
        install: {
          npm: 'shipped with bun',
          url: 'https://bun.sh/docs/cli/audit',
        },
      },
    },
    {
      when: [{ dep: { file: 'package.json', names: ['vitest'] } }],
      tool: {
        id: 'vitest',
        category: 'test',
        hook: 'pre-push',
        argv: 'vitest run --coverage',
        ciArgv: 'vitest run --coverage',
        priority: 2,
        coverageArtifact: 'lcov',
        coveragePath: 'coverage/lcov.info',
        install: {
          npm: 'npm install -D vitest @vitest/coverage-v8',
          url: 'https://vitest.dev',
        },
      },
    },
    {
      when: [{ dep: { file: 'package.json', names: ['jest'] } }],
      tool: {
        id: 'jest',
        category: 'test',
        hook: 'pre-push',
        argv: 'jest --coverage',
        ciArgv: 'jest --coverage',
        priority: 2,
        coverageArtifact: 'lcov',
        coveragePath: 'coverage/lcov.info',
        install: { npm: 'npm install -D jest', url: 'https://jestjs.io' },
      },
    },
    {
      // A repository that defines its own `test` script knows better than a
      // bare runner invocation, so that script is what hooks and CI run.
      when: [
        {
          dep: { file: 'package.json', names: ['test'] },
          noDep: { file: 'package.json', names: ['vitest', 'jest'] },
        },
      ],
      tool: {
        id: 'npm-test',
        category: 'test',
        hook: 'pre-push',
        argv: 'npm test',
        ciArgv: 'npm test',
        testArgv: 'npm test',
        priority: 2,
        install: {
          npm: 'shipped with npm',
          url: 'https://docs.npmjs.com/cli/commands/npm-test',
        },
      },
    },
    {
      // Last resort: no configured runner and no test script of its own.
      when: [{ noDep: { file: 'package.json', names: ['vitest', 'jest', 'test'] } }],
      tool: {
        id: 'node-test',
        category: 'test',
        hook: 'pre-push',
        argv: 'node --test',
        ciArgv: 'node --test',
        priority: 2,
        // Node's own coverage reporter has no Cobertura/lcov output, so the
        // gate reports this language as SKIP rather than a silent pass — and
        // with no other producer the gate job is omitted entirely.
        install: {
          npm: 'shipped with Node.js',
          url: 'https://nodejs.org/api/test.html',
        },
      },
    },
  ],
};
