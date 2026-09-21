/**
 * The published package name.
 *
 * Every generated file that refers to where righthook lives inside
 * `node_modules` (the preset `run:` paths, the reusable workflow's fallback to
 * its own coverage gate) derives from this constant, so renaming the package
 * cannot leave one of them pointing at a path that no longer exists.
 */
export const PACKAGE_NAME = '@heretek-ai/righthook';

/** `node_modules/<package>` — the path lefthook resolves preset `run:` lines against. */
export const PACKAGE_DIR = `node_modules/${PACKAGE_NAME}`;
