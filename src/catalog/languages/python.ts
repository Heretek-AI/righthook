import type { LanguageSpec, ToolSpec } from '../types.js';

const ruffFormat: ToolSpec = {
  id: 'ruff-format',
  category: 'format',
  hook: 'pre-commit',
  argv: 'ruff format {staged_files}',
  ciArgv: 'xargs -0 -r ruff format --check',
  ciFiles: true,
  priority: 1,
  stageFixed: true,
  install: {
    uv: 'uv tool install ruff',
    brew: 'brew install ruff',
    npm: 'npm install -D ruff',
    url: 'https://docs.astral.sh/ruff',
  },
};

const ruffCheck: ToolSpec = {
  id: 'ruff-check',
  category: 'lint',
  hook: 'pre-commit',
  argv: 'ruff check --fix --force-exclude {staged_files}',
  ciArgv: 'xargs -0 -r ruff check --force-exclude',
  ciFiles: true,
  priority: 2,
  stageFixed: true,
  install: {
    uv: 'uv tool install ruff',
    brew: 'brew install ruff',
    url: 'https://docs.astral.sh/ruff',
  },
};

const vulture: ToolSpec = {
  id: 'vulture',
  category: 'deadcode',
  hook: 'pre-push',
  argv: 'vulture --min-confidence 80 .',
  ciArgv: 'xargs -0 -r vulture --min-confidence 80',
  ciFiles: true,
  priority: 3,
  install: {
    uv: 'uv tool install vulture',
    brew: 'brew install vulture',
    url: 'https://github.com/jendrikseipp/vulture',
  },
};

const bandit: ToolSpec = {
  id: 'bandit',
  category: 'sast',
  hook: 'pre-push',
  argv: 'bandit -q -r . -x ./tests,./test,./.venv',
  ciArgv: 'bandit -q -r . -x ./tests,./test,./.venv',
  priority: 2,
  install: {
    uv: 'uv tool install bandit',
    brew: 'brew install bandit',
    url: 'https://github.com/PyCQA/bandit',
  },
};

const pipAudit: ToolSpec = {
  id: 'pip-audit',
  category: 'deps',
  hook: 'pre-push',
  argv: 'pip-audit --strict --progress-spinner off',
  ciArgv: 'pip-audit --strict --progress-spinner off',
  priority: 1,
  install: {
    uv: 'uv tool install pip-audit',
    brew: 'brew install pip-audit',
    url: 'https://github.com/pypa/pip-audit',
  },
};

const pytest: ToolSpec = {
  id: 'pytest',
  category: 'test',
  hook: 'pre-push',
  argv: 'pytest -q --cov --cov-report=xml:coverage/cobertura.xml --cov-report=term',
  ciArgv: 'pytest -q --cov --cov-report=xml:coverage/cobertura.xml --cov-report=term',
  priority: 2,
  coverageArtifact: 'cobertura',
  coveragePath: 'coverage/cobertura.xml',
  install: {
    uv: 'uv tool install pytest pytest-cov',
    brew: 'brew install pytest',
    url: 'https://docs.pytest.org',
  },
};

/**
 * Python.
 *
 * The type checker is the one genuine variant: `mypy` by default, `pyright`
 * when a pyright config or `[tool.pyright]` table is present.
 */
export const python: LanguageSpec = {
  id: 'python',
  label: 'Python',
  detect: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'],
  fileGlob: '*.py',
  ciSetup: ['python', 'uv'],
  dependabot: ['pip'],
  ciInstall: [
    'pip install -e ".[dev]" || pip install -e . || pip install -r requirements.txt || true',
  ],
  tools: [ruffFormat, ruffCheck, vulture, bandit, pipAudit, pytest],
  variants: [
    {
      id: 'pyright',
      when: [
        { anyPath: ['pyrightconfig.json', 'pyrightconfig.jsonc'] },
        { text: { file: 'pyproject.toml', pattern: '\\[tool\\.pyright\\]' } },
        { dep: { file: 'pyproject.toml', names: ['pyright'] } },
      ],
      tools: [
        ruffFormat,
        ruffCheck,
        vulture,
        bandit,
        pipAudit,
        pytest,
        {
          id: 'mypy',
          category: 'typecheck',
          hook: 'pre-push',
          argv: 'pyright .',
          ciArgv: 'xargs -0 -r pyright',
          ciFiles: true,
          priority: 5,
          install: {
            uv: 'uv tool install pyright',
            npm: 'npm install -D pyright',
            url: 'https://github.com/RobertCraigie/pyright-python',
          },
        },
      ],
    },
    {
      id: 'mypy',
      when: [],
      tools: [
        ruffFormat,
        ruffCheck,
        vulture,
        bandit,
        pipAudit,
        pytest,
        {
          id: 'mypy',
          category: 'typecheck',
          hook: 'pre-push',
          argv: 'mypy --install-types --non-interactive .',
          ciArgv: 'xargs -0 -r mypy --install-types --non-interactive',
          ciFiles: true,
          priority: 5,
          install: {
            uv: 'uv tool install mypy',
            brew: 'brew install mypy',
            url: 'https://mypy-lang.org',
          },
        },
      ],
    },
  ],
};
