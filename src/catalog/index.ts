import type { LanguageSpec } from './types.js';

import { universal } from './languages/universal.js';
import { typescript } from './languages/typescript.js';
import { python } from './languages/python.js';
import { go } from './languages/go.js';
import { rust } from './languages/rust.js';
import { ruby } from './languages/ruby.js';
import { php } from './languages/php.js';
import { java, kotlin } from './languages/jvm.js';
import { dotnet, swift, dart, cpp, terraform } from './languages/compiled.js';
import {
  ansible,
  clojure,
  docker,
  elixir,
  haskell,
  kubernetes,
  lua,
  nix,
  openapi,
  perl,
  protobuf,
  r,
  scala,
  shell,
  sql,
  zig,
} from './languages/extended.js';

/**
 * The tool matrix.
 *
 * `universal` comes first and is always included; every other entry is
 * optional and selected by `detectLanguages()`. The order of the rest is the
 * order languages appear in the manifest and the CLI's help output.
 */
export const LANGUAGES: LanguageSpec[] = [
  universal,
  typescript,
  python,
  go,
  rust,
  ruby,
  php,
  java,
  kotlin,
  dotnet,
  swift,
  dart,
  cpp,
  terraform,
  elixir,
  scala,
  clojure,
  haskell,
  lua,
  perl,
  r,
  nix,
  zig,
  sql,
  protobuf,
  openapi,
  ansible,
  kubernetes,
  shell,
  docker,
];

const byId = new Map(LANGUAGES.map((language) => [language.id, language]));

/** The always-included language; it has no detection markers. */
export const UNIVERSAL = universal;

/** Look up a language by its stable id, or `undefined`. */
export function languageById(id: string): LanguageSpec | undefined {
  return byId.get(id);
}

/** Look up a language by id, throwing a CLI-friendly error when unknown. */
export function requireLanguage(id: string): LanguageSpec {
  const language = byId.get(id);
  if (!language) {
    throw new Error(`unknown language "${id}"; known: ${knownLanguageIds().join(', ')}`);
  }
  return language;
}

/** Sorted, comma-joined list of selectable language ids (excludes `universal`). */
export function knownLanguageIds(): string[] {
  return LANGUAGES.filter((language) => language.id !== 'universal')
    .map((language) => language.id)
    .sort();
}
