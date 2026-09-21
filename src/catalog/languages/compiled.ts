import type { LanguageSpec } from '../types.js';

/** C# / .NET. */
export const dotnet: LanguageSpec = {
  id: 'dotnet',
  label: 'C# / .NET',
  detect: ['*.sln', '*.csproj', '*.fsproj'],
  fileGlob: '*.cs',
  ciSetup: ['dotnet'],
  dependabot: ['nuget'],
  ciInstall: ['dotnet restore'],
  tools: [
    {
      id: 'dotnet-format',
      category: 'format',
      hook: 'pre-commit',
      argv: 'dotnet format whitespace',
      ciArgv: 'dotnet format whitespace --verify-no-changes',
      priority: 1,
      stageFixed: true,
      install: { url: 'https://learn.microsoft.com/dotnet/core/tools/dotnet-format' },
    },
    {
      id: 'dotnet-analyzers',
      category: 'lint',
      hook: 'pre-commit',
      argv: 'dotnet format analyzers --verify-no-changes',
      ciArgv: 'dotnet format analyzers --verify-no-changes',
      priority: 2,
      install: { url: 'https://learn.microsoft.com/dotnet/core/tools/dotnet-format' },
    },
    {
      id: 'dotnet-build',
      category: 'typecheck',
      hook: 'pre-push',
      argv: 'dotnet build --no-restore -warnaserror',
      ciArgv: 'dotnet build --no-restore -warnaserror',
      priority: 4,
      install: { url: 'https://learn.microsoft.com/dotnet/core/tools/dotnet-build' },
    },
    {
      id: 'dotnet-test',
      category: 'test',
      hook: 'pre-push',
      argv: 'dotnet test --collect:"XPlat Code Coverage"',
      ciArgv: 'dotnet test --collect:"XPlat Code Coverage"',
      priority: 2,
      coverageArtifact: 'cobertura',
      coveragePath: 'TestResults/**/coverage.cobertura.xml',
      install: { url: 'https://learn.microsoft.com/dotnet/core/tools/dotnet-test' },
    },
  ],
};

/** Swift. */
export const swift: LanguageSpec = {
  id: 'swift',
  label: 'Swift',
  detect: ['Package.swift', '*.xcodeproj'],
  fileGlob: '*.swift',
  ciSetup: ['swift'],
  dependabot: ['swift'],
  ciInstall: ['swift package resolve'],
  tools: [
    {
      id: 'swiftformat',
      category: 'format',
      hook: 'pre-commit',
      argv: 'swiftformat --quiet {staged_files}',
      ciArgv: 'swiftformat --lint .',
      priority: 1,
      stageFixed: true,
      install: {
        brew: 'brew install swiftformat',
        url: 'https://github.com/nicklockwood/SwiftFormat',
      },
    },
    {
      id: 'swiftlint',
      category: 'lint',
      hook: 'pre-commit',
      argv: 'swiftlint --fix --quiet {staged_files}',
      priority: 2,
      stageFixed: true,
      install: {
        brew: 'brew install swiftlint',
        url: 'https://github.com/realm/SwiftLint',
      },
    },
    {
      id: 'swiftlint-lint',
      category: 'lint',
      hook: 'pre-push',
      argv: 'swiftlint --strict --quiet',
      ciArgv: 'swiftlint --strict --quiet',
      priority: 6,
      install: {
        brew: 'brew install swiftlint',
        url: 'https://github.com/realm/SwiftLint',
      },
    },
    {
      id: 'swift-test',
      category: 'test',
      hook: 'pre-push',
      argv: 'swift test --enable-code-coverage',
      ciArgv: 'swift test --enable-code-coverage',
      priority: 2,
      // `llvm-cov export` only post-processes what the test run produced, so
      // the artifact is declared here and produced through `after`.
      after: [
        'mkdir -p coverage',
        'xcrun llvm-cov export -format=lcov .build/debug/*.xctest/Contents/MacOS/* ' +
          '-instr-profile .build/debug/codecov/default.profdata > coverage/lcov.info',
      ],
      coverageArtifact: 'lcov',
      coveragePath: 'coverage/lcov.info',
      install: { url: 'https://www.swift.org/documentation/package-manager' },
    },
  ],
};

/** Dart / Flutter. */
export const dart: LanguageSpec = {
  id: 'dart',
  label: 'Dart / Flutter',
  detect: ['pubspec.yaml'],
  fileGlob: '*.dart',
  ciSetup: ['dart'],
  dependabot: ['pub'],
  ciInstall: ['dart pub get || flutter pub get'],
  conditionalTools: [
    {
      // Flutter owns the test runner: `dart test` does not work inside a
      // Flutter package, so the two are mutually exclusive rather than both
      // being emitted. This rule must precede the `notText` one below.
      when: [{ text: { file: 'pubspec.yaml', pattern: '^\\s*flutter\\s*:' } }],
      tool: {
        id: 'dart-test',
        category: 'test',
        hook: 'pre-push',
        argv: 'flutter test --coverage',
        ciArgv: 'flutter test --coverage',
        priority: 2,
        before: ['rm -rf coverage'],
        coverageArtifact: 'lcov',
        coveragePath: 'coverage/lcov.info',
        install: { url: 'https://docs.flutter.dev/testing' },
      },
    },
    {
      when: [{ notText: { file: 'pubspec.yaml', pattern: '^\\s*flutter\\s*:' } }],
      tool: {
        id: 'dart-test',
        category: 'test',
        hook: 'pre-push',
        argv: 'dart test --coverage=coverage',
        ciArgv: 'dart test --coverage=coverage',
        priority: 2,
        before: ['rm -rf coverage coverage/lcov.info'],
        // `format_coverage` converts the directory `dart test` wrote.
        after: [
          'dart run coverage:format_coverage --lcov --in=coverage --out=coverage/lcov.info --report-on=lib',
        ],
        coverageArtifact: 'lcov',
        coveragePath: 'coverage/lcov.info',
        install: { url: 'https://dart.dev/tools/dart-test' },
      },
    },
  ],
  tools: [
    {
      id: 'dart-format',
      category: 'format',
      hook: 'pre-commit',
      argv: 'dart format {staged_files}',
      ciArgv: "xargs -0 -r dart format --output=none --set-exit-if-changed", ciFiles: true,
      priority: 1,
      stageFixed: true,
      install: { url: 'https://dart.dev/tools/dart-format' },
    },
    {
      id: 'dart-analyze',
      category: 'lint',
      hook: 'pre-commit',
      argv: 'dart analyze --fatal-infos --fatal-warnings',
      ciArgv: 'dart analyze --fatal-infos --fatal-warnings',
      priority: 2,
      install: { url: 'https://dart.dev/tools/dart-analyze' },
    },
  ],
};

/** C / C++. */
export const cpp: LanguageSpec = {
  id: 'cpp',
  label: 'C / C++',
  detect: ['CMakeLists.txt', '*.cc', '*.cpp', '*.c', '*.h', '*.hpp'],
  fileGlob: '*.{c,cc,cpp,cxx,h,hpp,hh}',
  ciSetup: ['cpp'],
  tools: [
    {
      id: 'clang-format',
      category: 'format',
      hook: 'pre-commit',
      argv: 'clang-format -i {staged_files}',
      ciArgv:
        'git ls-files "*.c" "*.cc" "*.cpp" "*.h" "*.hpp" | ' +
        'xargs -r clang-format --dry-run --Werror',
      priority: 1,
      stageFixed: true,
      install: { brew: 'brew install clang-format', url: 'https://clang.llvm.org/docs/ClangFormat.html' },
    },
    {
      id: 'cppcheck',
      category: 'lint',
      hook: 'pre-commit',
      argv:
        'cppcheck --enable=warning,style,performance,portability --inline-suppr ' +
        '--error-exitcode=1 --suppress=missingIncludeSystem {staged_files}',
      ciArgv:
        'cppcheck --enable=warning,style,performance,portability --inline-suppr ' +
        '--error-exitcode=1 --suppress=missingIncludeSystem .',
      priority: 2,
      install: { brew: 'brew install cppcheck', url: 'https://github.com/cppcheck-qa/cppcheck' },
    },
    {
      id: 'clang-tidy',
      category: 'lint',
      hook: 'pre-push',
      argv: 'clang-tidy -p build {staged_files}',
      ciArgv: 'git ls-files "*.c" "*.cc" "*.cpp" | xargs -r clang-tidy -p build',
      priority: 6,
      ciOnly: true,
      install: { brew: 'brew install llvm', url: 'https://clang.llvm.org/extra/clang-tidy' },
    },
    {
      id: 'cmake-test',
      category: 'test',
      hook: 'pre-push',
      argv: 'ctest --test-dir build --output-on-failure',
      ciArgv:
        'cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug -DCMAKE_CXX_FLAGS=--coverage && ' +
        'cmake --build build && ctest --test-dir build --output-on-failure',
      priority: 2,
      // gcovr reads the `.gcda` files the instrumented build produced.
      after: ['mkdir -p coverage', 'gcovr --cobertura coverage/cobertura.xml --exclude tests/'],
      coverageArtifact: 'cobertura',
      coveragePath: 'coverage/cobertura.xml',
      install: { url: 'https://cmake.org' },
    },
  ],
};

/** Terraform / IaC. */
export const terraform: LanguageSpec = {
  id: 'terraform',
  label: 'Terraform',
  detect: ['*.tf', '*.tfvars'],
  fileGlob: '*.{tf,tfvars,hcl}',
  ciSetup: ['terraform'],
  tools: [
    {
      id: 'terraform-fmt',
      category: 'format',
      hook: 'pre-commit',
      argv: 'terraform fmt -recursive',
      ciArgv: "xargs -0 -r terraform fmt -check", ciFiles: true,
      priority: 1,
      stageFixed: true,
      install: { brew: 'brew install terraform', url: 'https://developer.hashicorp.com/terraform/cli' },
    },
    {
      id: 'tflint',
      category: 'lint',
      hook: 'pre-commit',
      argv: 'tflint --recursive',
      ciArgv: 'tflint --recursive',
      priority: 2,
      install: { brew: 'brew install tflint', url: 'https://github.com/terraform-linters/tflint' },
    },
    {
      id: 'terraform-validate',
      category: 'lint',
      hook: 'pre-push',
      argv: 'terraform validate',
      ciArgv: 'terraform validate',
      priority: 6,
      install: { brew: 'brew install terraform', url: 'https://developer.hashicorp.com/terraform/cli' },
    },
  ],
};
