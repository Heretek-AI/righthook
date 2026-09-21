import type { LanguageSpec, ToolSpec } from '../types.js';

/**
 * Ruby.
 *
 * `rspec` is emitted when `spec/` exists, otherwise `rake test` when `test/`
 * exists. Both are expressed as conditional tools so the same generator path
 * covers them.
 */
export const ruby: LanguageSpec = {
  id: 'ruby',
  label: 'Ruby',
  detect: ['Gemfile', '*.gemspec'],
  fileGlob: '*.rb',
  ciSetup: ['ruby'],
  dependabot: ['bundler'],
  ciInstall: ['bundle install --jobs 4 --retry 3'],
  tools: [
    {
      id: 'rubocop',
      category: 'format',
      hook: 'pre-commit',
      argv: 'rubocop -A --force-exclusion -- {staged_files}',
      ciArgv: 'rubocop --force-exclusion',
      priority: 1,
      stageFixed: true,
      install: {
        brew: 'brew install rubocop',
        url: 'https://github.com/rubocop/rubocop',
      },
    },
    {
      id: 'bundler-audit',
      category: 'deps',
      hook: 'pre-push',
      argv: 'bundler-audit check --update',
      ciArgv: 'bundler-audit check --update',
      priority: 1,
      install: {
        brew: 'brew install bundler-audit',
        url: 'https://github.com/rubysec/bundler-audit',
      },
    },
  ],
  conditionalTools: [
    {
      when: [{ anyPath: ['config/application.rb'] }],
      tool: {
        id: 'brakeman',
        category: 'sast',
        hook: 'pre-push',
        argv: 'brakeman -q --no-pager',
        ciArgv: 'brakeman -q --no-pager',
        priority: 2,
        install: { brew: 'brew install brakeman', url: 'https://brakemanscanner.org' },
      },
    },
    {
      when: [{ anyPath: ['spec/**/*.rb', 'spec'] }],
      tool: {
        id: 'rspec',
        category: 'test',
        hook: 'pre-push',
        argv: 'bundle exec rspec',
        ciArgv: 'bundle exec rspec',
        priority: 2,
        install: { url: 'https://rspec.info' },
      },
    },
    {
      when: [{ anyPath: ['spec/**/*.rb', 'spec'] }],
      tool: {
        id: 'simplecov',
        category: 'coverage',
        hook: 'pre-push',
        argv: 'bundle exec rspec',
        ciArgv: 'bundle exec rspec',
        priority: 2,
        ciOnly: true,
        before: ['mkdir -p coverage'],
        coverageArtifact: 'cobertura',
        coveragePath: 'coverage/cobertura.xml',
        install: {
          url: 'https://github.com/simplecov-ruby/simplecov',
        },
      },
    },
    {
      when: [{ anyPath: ['test/**/*.rb', 'test'], nonePath: ['spec/**/*.rb', 'spec'] }],
      tool: {
        id: 'rake-test',
        category: 'test',
        hook: 'pre-push',
        argv: 'bundle exec rake test',
        ciArgv: 'bundle exec rake test',
        priority: 2,
        install: { url: 'https://github.com/ruby/rake' },
      },
    },
  ],
};

/** Extra env a CI coverage run for Ruby needs (see `.righthook/simplecov.rb`). */
export const rubyCoverageEnv = { RUBYOPT: '-r./.righthook/simplecov.rb', COVERAGE: '1' };

export const rubyTools = (): ToolSpec[] => ruby.tools;
