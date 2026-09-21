#!/usr/bin/env node
// Entry point for `npx righthook`. All logic lives in the compiled CLI.
import { run } from '../dist/cli.js';

try {
  const code = await run(process.argv.slice(2));
  process.exit(code ?? 0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`righthook: ${message}\n`);
  process.exit(1);
}
