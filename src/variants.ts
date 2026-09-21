import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import type { LanguageSpec, ToolSpec, VariantRule, VariantSpec } from './catalog/types.js';
import { compareCommands } from './catalog/types.js';

/**
 * Variant and conditional-tool resolution.
 *
 * Rules are evaluated against a lazy index of the repository: the set of
 * tracked-ish paths (root-relative, `/`-separated) plus the parsed contents of
 * a few JSON manifests. Nothing here touches the network, and the whole
 * resolution is deterministic for a given working tree.
 */

/** Lazily-built view of the repository that rules are evaluated against. */
export interface RepoIndex {
  root: string;
  /** Root-relative paths, `/`-separated, sorted. */
  paths: Set<string>;
  /** Cached parsed JSON manifests, keyed by root-relative path. */
  json: Map<string, unknown>;
  /** Cached file text, keyed by root-relative path. */
  text: Map<string, string | undefined>;
}

/**
 * Build the path index by walking the repository once.
 *
 * The walk is depth- and count-bounded: a standards tool must stay fast in
 * huge monorepos, and every rule in the catalog matches on shallow,
 * well-known markers.
 */
export function buildRepoIndex(root: string): RepoIndex {
  const paths = new Set<string>();
  const maxEntries = 200_000;
  const skipDirs = new Set(['node_modules', '.git', 'vendor', 'target', 'dist', 'build', '.venv', '.tox', '.next', '.gradle']);

  const walk = (dir: string, depth: number): void => {
    if (depth > 6 || paths.size >= maxEntries) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = path.relative(root, path.join(dir, entry.name)).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        paths.add(`${rel}/`);
        walk(path.join(dir, entry.name), depth + 1);
      } else {
        paths.add(rel);
      }
    }
  };

  walk(root, 0);
  return { root, paths, json: new Map(), text: new Map() };
}

/** Read and cache a file's text; `undefined` when absent or unreadable. */
function readIndexedText(index: RepoIndex, rel: string): string | undefined {
  const cached = index.text.get(rel);
  if (cached !== undefined) return cached;
  let value: string | undefined;
  try {
    value = readFileSync(path.join(index.root, rel), 'utf8');
  } catch {
    value = undefined;
  }
  index.text.set(rel, value);
  return value;
}

/** Read and cache a JSON manifest; `undefined` when absent or invalid. */
function readIndexedJson(index: RepoIndex, rel: string): unknown {
  if (index.json.has(rel)) return index.json.get(rel);
  const text = readIndexedText(index, rel);
  let parsed: unknown;
  if (text !== undefined) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
  }
  index.json.set(rel, parsed);
  return parsed;
}

/**
 * Glob match against the index.
 *
 * `node:fs.globSync` would re-walk the filesystem per call; matching the
 * pre-built index with a small translator keeps variant resolution O(paths).
 */
export function matchIndex(index: RepoIndex, pattern: string): boolean {
  const normalized = pattern.replace(/^\.\//, '');
  if (index.paths.has(normalized)) return true;
  if (!normalized.includes('*')) return index.paths.has(`${normalized}/`);

  const regex = globToRegExp(normalized);
  for (const candidate of index.paths) {
    if (regex.test(candidate)) return true;
  }
  return false;
}

/** Translate a glob (`*`, `**`, `?`, `{a,b}`) into an anchored RegExp. */
export function globToRegExp(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]!;
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // `**/` matches zero or more path segments.
        if (pattern[i + 2] === '/') {
          out += '(?:[^/]*/)*';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (char === '?') {
      out += '[^/]';
    } else if (char === '{') {
      const close = pattern.indexOf('}', i);
      if (close === -1) {
        out += '\\{';
      } else {
        const body = pattern.slice(i + 1, close);
        out += `(?:${body
          .split(',')
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('|')})`;
        i = close;
      }
    } else {
      out += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

/** Declared dependency names of the JSON manifest at `rel`. */
export function declaredDeps(index: RepoIndex, rel: string): Set<string> {
  const parsed = readIndexedJson(index, rel);
  const names = new Set<string>();
  if (!parsed || typeof parsed !== 'object') return names;
  const manifest = parsed as Record<string, unknown>;
  const keys = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
    'packageManager',
  ];
  for (const key of keys) {
    const deps = manifest[key];
    if (deps && typeof deps === 'object') {
      for (const name of Object.keys(deps as Record<string, unknown>)) names.add(name);
    }
  }
  // Python `pyproject.toml` dependency tables are matched textually instead
  // (see VariantRule.text); only JSON manifests are inspected structurally.
  const scripts = manifest.scripts;
  if (scripts && typeof scripts === 'object') {
    for (const name of Object.keys(scripts as Record<string, unknown>)) names.add(name);
  }
  return names;
}

/** Evaluate a single rule against the index. */
export function evaluateRule(index: RepoIndex, rule: VariantRule): boolean {
  if (rule.anyPath && !rule.anyPath.some((pattern) => matchIndex(index, pattern))) return false;
  if (rule.nonePath && rule.nonePath.some((pattern) => matchIndex(index, pattern))) return false;
  if (rule.dep) {
    const deps = declaredDeps(index, rule.dep.file);
    if (!rule.dep.names.some((name) => deps.has(name))) return false;
  }
  if (rule.noDep) {
    const deps = declaredDeps(index, rule.noDep.file);
    if (rule.noDep.names.some((name) => deps.has(name))) return false;
  }
  if (rule.text) {
    const text = readIndexedText(index, rule.text.file);
    if (text === undefined || !new RegExp(rule.text.pattern, 'm').test(text)) return false;
  }
  if (rule.notText) {
    const text = readIndexedText(index, rule.notText.file);
    if (text !== undefined && new RegExp(rule.notText.pattern, 'm').test(text)) return false;
  }
  return true;
}

/** Evaluate an OR-list of rules; an empty list means "always". */
export function evaluateRules(index: RepoIndex, rules: VariantRule[]): boolean {
  if (rules.length === 0) return true;
  return rules.some((rule) => evaluateRule(index, rule));
}

/** The variant selected for a language, or `undefined` when it has no variants. */
export function selectVariant(index: RepoIndex, language: LanguageSpec): VariantSpec | undefined {
  return language.variants ? defaultVariantOf(index, language) : undefined;
}

/**
 * The variant whose rules hold, falling back to the language's default.
 *
 * The fallback matters for `--languages java` in a tree with no build file: no
 * variant rule matches, and without a default the language would silently
 * contribute zero commands.
 */
function defaultVariantOf(index: RepoIndex, language: LanguageSpec): VariantSpec | undefined {
  const variants = language.variants ?? [];
  for (const variant of variants) {
    if (evaluateRules(index, variant.when)) return variant;
  }
  return variants.find((variant) => variant.when.length === 0) ?? variants[0];
}

/**
 * Resolve the concrete tool list for one language: the selected variant's
 * tools (or the language's own) plus every conditional tool whose rule holds,
 * with `ciOnly` tools retained (they are filtered at emission time).
 */
export function resolveTools(index: RepoIndex, language: LanguageSpec): ToolSpec[] {
  const variant = selectVariant(index, language);
  const tools: ToolSpec[] = [...(variant ? variant.tools : language.tools)];
  for (const conditional of language.conditionalTools ?? []) {
    if (evaluateRules(index, conditional.when)) tools.push(conditional.tool);
  }
  return tools.sort(compareCommands);
}

/** The universal `detect` path list, used by `doctor` to explain selection. */
export function detectionMarkers(index: RepoIndex, language: LanguageSpec): string[] {
  return language.detect.filter((pattern) => matchIndex(index, pattern));
}

/**
 * Resolve a language's tool list as if every marker matched.
 *
 * This is the source for the shipped reusable workflow and the `presets/`
 * files: it must be identical on every machine, so it ignores the working
 * tree entirely. Variants collapse to their first entry (the catalog orders
 * the specific variant before the default), and every conditional tool is
 * included.
 */
export function allToolsFor(language: LanguageSpec): ToolSpec[] {
  const variants = language.variants ?? [];
  // Prefer the language's own default variant (the one with no `when`), so the
  // shipped preset matches what a repository without any marker file gets.
  const chosen = variants.find((variant) => variant.when.length === 0) ?? variants[0];
  const tools: ToolSpec[] = [...(chosen ? chosen.tools : language.tools)];

  // Conditional tools are deduplicated by id, keeping the first declared. Some
  // are genuinely mutually exclusive — Dart's `dart test` and its Flutter
  // counterpart share an id and a language, so listing both would emit the same
  // lefthook command key twice and lefthook would reject the document.
  const seen = new Set(tools.map((tool) => tool.id));
  for (const conditional of language.conditionalTools ?? []) {
    if (seen.has(conditional.tool.id)) continue;
    seen.add(conditional.tool.id);
    tools.push(conditional.tool);
  }
  return tools.sort(compareCommands);
}

/** Every language whose tools may appear in a shipped artifact. */
export function allLanguagesWithTools(languages: LanguageSpec[]): {
  language: LanguageSpec;
  tools: ToolSpec[];
}[] {
  return languages
    .filter((language) => !language.doctorOnly)
    .map((language) => ({ language, tools: allToolsFor(language) }));
}

