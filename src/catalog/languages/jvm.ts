import type { LanguageSpec, ToolSpec } from '../types.js';

/**
 * Java.
 *
 * Build tool is a variant: Maven (`pom.xml`) or Gradle (`build.gradle`,
 * `build.gradle.kts`). A Gradle project containing Kotlin sources is left to
 * the `kotlin` language entry, so the Kotlin toolchain owns it.
 */
export const java: LanguageSpec = {
  id: 'java',
  label: 'Java',
  detect: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
  // A Gradle build script alone is ambiguous — it may be a Kotlin project. The
  // language is selected only when a Maven build or an actual Java source is
  // present, which keeps a Kotlin-only repository from also running the Java
  // analyzers (and from colliding on `gradle-test`).
  detectAll: ['pom.xml', '**/*.java'],
  fileGlob: '*.java',
  ciSetup: ['java'],
  dependabot: ['maven', 'gradle'],
  tools: [],
  variants: [
    {
      id: 'maven',
      when: [{ anyPath: ['pom.xml'] }],
      tools: [
        {
          id: 'spotless',
          category: 'format',
          hook: 'pre-commit',
          argv: 'mvn -q -DskipTests spotless:apply',
          ciArgv: 'mvn -q -DskipTests spotless:check',
          priority: 1,
          stageFixed: true,
          install: { url: 'https://github.com/diffplug/spotless' },
        },
        {
          id: 'checkstyle',
          category: 'lint',
          hook: 'pre-commit',
          argv: 'mvn -q -DskipTests checkstyle:check',
          ciArgv: 'mvn -q -DskipTests checkstyle:check',
          priority: 2,
          install: { url: 'https://checkstyle.org' },
        },
        {
          id: 'spotbugs',
          category: 'lint',
          hook: 'pre-push',
          argv: 'mvn -q -DskipTests spotbugs:check',
          ciArgv: 'mvn -q -DskipTests spotbugs:check',
          priority: 6,
          install: { url: 'https://spotbugs.github.io' },
        },
        {
          id: 'pmd',
          category: 'lint',
          hook: 'pre-push',
          argv: 'mvn -q -DskipTests pmd:check',
          ciArgv: 'mvn -q -DskipTests pmd:check',
          priority: 6,
          install: { url: 'https://pmd.github.io' },
        },
        {
          id: 'maven-test',
          category: 'test',
          hook: 'pre-push',
          argv: 'mvn -B -q test',
          ciArgv: 'mvn -B -q test',
          priority: 2,
          install: { url: 'https://maven.apache.org' },
        },
        {
          id: 'jacoco',
          category: 'coverage',
          hook: 'pre-push',
          argv: 'mvn -B -q verify -Pjacoco',
          ciArgv: 'mvn -B -q verify -Pjacoco',
          priority: 2,
          ciOnly: true,
          coverageArtifact: 'cobertura',
          coveragePath: 'coverage/jacoco.xml',
          install: { url: 'https://www.jacoco.org/jacoco' },
        },
      ],
    },
    {
      id: 'gradle',
      // Selection between Maven and Gradle is by build file only; the language
      // itself is already narrowed by `detectAll`, so a Kotlin source in the
      // tree no longer needs to disqualify the Gradle variant here.
      when: [{ anyPath: ['build.gradle', 'build.gradle.kts'] }],
      tools: [
        {
          id: 'spotless',
          category: 'format',
          hook: 'pre-commit',
          argv: './gradlew spotlessApply',
          ciArgv: './gradlew spotlessCheck',
          priority: 1,
          stageFixed: true,
          install: { url: 'https://github.com/diffplug/spotless' },
        },
        {
          id: 'checkstyle',
          category: 'lint',
          hook: 'pre-commit',
          argv: './gradlew checkstyleMain checkstyleTest',
          ciArgv: './gradlew checkstyleMain checkstyleTest',
          priority: 2,
          install: { url: 'https://checkstyle.org' },
        },
        {
          id: 'spotbugs',
          category: 'lint',
          hook: 'pre-push',
          argv: './gradlew spotbugsMain',
          ciArgv: './gradlew spotbugsMain',
          priority: 6,
          install: { url: 'https://spotbugs.github.io' },
        },
        {
          id: 'pmd',
          category: 'lint',
          hook: 'pre-push',
          argv: './gradlew pmdMain',
          ciArgv: './gradlew pmdMain',
          priority: 6,
          install: { url: 'https://pmd.github.io' },
        },
        {
          id: 'gradle-test',
          category: 'test',
          hook: 'pre-push',
          argv: './gradlew test',
          ciArgv: './gradlew test',
          priority: 2,
          install: { url: 'https://docs.gradle.org' },
        },
        {
          id: 'jacoco',
          category: 'coverage',
          hook: 'pre-push',
          argv: './gradlew test jacocoTestReport',
          ciArgv: './gradlew test jacocoTestReport',
          priority: 2,
          ciOnly: true,
          coverageArtifact: 'cobertura',
          coveragePath: 'build/reports/jacoco/test/jacocoTestReport.xml',
          install: { url: 'https://www.jacoco.org/jacoco' },
        },
      ],
    },
  ],
};

/**
 * Kotlin. Shares the JVM toolchain with Java but is selected by `*.kt`
 * sources, so a Kotlin/Gradle repository gets detekt + ktlint instead of the
 * Java analyzers.
 */
export const kotlin: LanguageSpec = {
  id: 'kotlin',
  label: 'Kotlin',
  detect: ['build.gradle.kts', 'build.gradle'],
  detectAll: ['**/*.kt'],
  fileGlob: '*.kt',
  ciSetup: ['java', 'kotlin'],
  dependabot: ['gradle'],
  tools: [
    {
      id: 'ktlint-fix',
      category: 'format',
      hook: 'pre-commit',
      argv: 'ktlint --format {staged_files}',
      ciArgv: 'ktlint',
      priority: 1,
      stageFixed: true,
      install: {
        brew: 'brew install ktlint',
        url: 'https://github.com/pinterest/ktlint',
      },
    },
    {
      id: 'detekt',
      category: 'lint',
      hook: 'pre-commit',
      argv: 'detekt --build-upon-default-config',
      ciArgv: 'detekt --build-upon-default-config',
      priority: 2,
      install: {
        brew: 'brew install detekt',
        url: 'https://detekt.dev',
      },
    },
    {
      id: 'gradle-test',
      category: 'test',
      hook: 'pre-push',
      argv: './gradlew test',
      ciArgv: './gradlew test',
      priority: 2,
      install: { url: 'https://docs.gradle.org' },
    },
    {
      id: 'jacoco',
      category: 'coverage',
      hook: 'pre-push',
      argv: './gradlew test jacocoTestReport',
      ciArgv: './gradlew test jacocoTestReport',
      priority: 2,
      ciOnly: true,
      coverageArtifact: 'cobertura',
      coveragePath: 'build/reports/jacoco/test/jacocoTestReport.xml',
      install: { url: 'https://www.jacoco.org/jacoco' },
    },
  ],
};

export const jvmTools = (): ToolSpec[] => java.tools;
