import { LANGUAGES, requireLanguage } from './catalog/index.js';
import type { LanguageSpec, ToolSpec } from './catalog/types.js';
import {
  buildRepoIndex,
  declaredDeps,
  detectionMarkers,
  matchIndex,
  type RepoIndex,
  resolveTools,
  selectVariant,
} from './variants.js';

export interface DetectOptions {
  /** Explicit language ids; overrides detection entirely. */
  languages?: string[];
  /** Additional language ids unioned with detection. */
  addLanguages?: string[];
}

export interface DetectedLanguage {
  language: LanguageSpec;
  /** Detection markers that selected it, for `doctor` and the manifest. */
  markers: string[];
  /** Variant id, when the language has variants. */
  variant?: string;
  /** Fully resolved tools, sorted by hook/priority/id. */
  tools: ToolSpec[];
}

export interface DetectResult {
  languages: DetectedLanguage[];
  /** Every variant-selecting fact, flattened for the manifest. */
  markers: Record<string, string>;
  index: RepoIndex;
}

/**
 * A language is selected when any `detect` entry matches at the repo root
 * (exact path, directory, or glob) and — when present — `detectAll` matches at
 * least one file.
 */
function isDetected(index: RepoIndex, language: LanguageSpec): boolean {
  if (language.id === 'universal') return true;
  const matched = language.detect.some((pattern) => matchIndex(index, pattern));
  if (!matched) return false;
  if (language.detectAll && !language.detectAll.some((pattern) => matchIndex(index, pattern))) {
    return false;
  }
  return true;
}

/** Marker facts recorded in the manifest so `doctor` can explain decisions. */
function collectMarkers(index: RepoIndex, detected: DetectedLanguage[]): Record<string, string> {
  const markers: Record<string, string> = {};
  for (const entry of detected) {
    if (entry.variant) markers[`${entry.language.id}.variant`] = entry.variant;
    if (entry.language.id !== 'universal') {
      markers[`${entry.language.id}.detect`] = entry.markers.join(',');
    }
  }

  const packageManager = [
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lockb',
    'bun.lock',
    'package-lock.json',
  ].find((pattern) => matchIndex(index, pattern));
  if (packageManager) markers['typescript.packageManager'] = packageManager;

  const tsDeps = declaredDeps(index, 'package.json');
  const testRunner = ['vitest', 'jest'].find((name) => tsDeps.has(name));
  if (testRunner) markers['typescript.testRunner'] = testRunner;

  return markers;
}

/** Split a `--languages a,b` value into trimmed ids. */
export function parseLanguageList(value: string): string[] {
  return value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Detect the languages present in a repository and resolve their tools.
 *
 * `universal` is always first. `--languages` replaces detection entirely;
 * `--add-languages` unions with the detected set.
 */
export function detectLanguages(gitRoot: string, options: DetectOptions = {}): DetectResult {
  const index = buildRepoIndex(gitRoot);

  const forced = new Set(
    [...(options.languages ?? []), ...(options.addLanguages ?? [])].map(
      (id) => requireLanguage(id).id,
    ),
  );

  // Catalog order, always with `universal` first: the manifest and the CLI
  // help stay stable regardless of how the language set was chosen.
  const ordered = LANGUAGES.filter(
    (language) =>
      language.id === 'universal' ||
      (options.languages && options.languages.length > 0
        ? forced.has(language.id)
        : isDetected(index, language) || forced.has(language.id)),
  );

  const languages: DetectedLanguage[] = ordered.map((language) => {
    const variant = selectVariant(index, language);
    return {
      language,
      markers: language.id === 'universal' ? ['always'] : detectionMarkers(index, language),
      variant: variant?.id,
      tools: resolveTools(index, language),
    };
  });

  return { languages, markers: collectMarkers(index, languages), index };
}
