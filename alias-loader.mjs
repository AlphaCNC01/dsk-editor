// ============================================================================
// alias-loader.mjs — a Node ESM "resolve hook" (see node:module's
// register()) that resolves the same '@core/...', '@elements/...',
// '@render/...', '@export/...', '@ui-preview/...' bare-specifier aliases
// every app's own vite.config.js already defines via resolve.alias — so
// that source files can use one consistent import syntax (the '@x/...'
// aliases) whether they're loaded by Vite in a real browser or by plain
// `node` in a test file, with NO per-runtime branching or rewriting in
// the source files themselves.
//
// Without this, Node's own module resolution has no concept of these
// aliases at all (a bare specifier like '@core/geo.js' is indistinguishable
// from a real, scoped npm package named "@core" to Node — there is no
// built-in alias mechanism, only the '#'-prefixed "imports" field in
// package.json, which is both differently-spelled from Vite's own aliases
// and scoped to imports written inside that one package). Rather than
// have every source file spell its imports two different ways depending
// on which runtime eventually loads it, this loader makes '@x/...' work
// under Node too.
//
// Usage (from any test file, or via `node --import` on the command line):
//   node --import ./scripts/alias-loader.mjs test/some.test.js
// See each app's own package.json "test" script for the actual usage.
// ============================================================================
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname; // this file lives at the monorepo root itself

const ALIASES = {
  '@core/': path.join(ROOT, 'packages/core/'),
  '@elements/': path.join(ROOT, 'packages/elements/'),
  '@render/': path.join(ROOT, 'packages/render/'),
  '@export/': path.join(ROOT, 'packages/export/'),
  '@ui-preview/': path.join(ROOT, 'packages/ui-preview/'),
};

// The actual hook module — registered via a data: URL so this stays a
// single self-contained file rather than needing a second file just for
// the hook itself.
const hookSource = `
  import { pathToFileURL } from 'node:url';
  const ALIASES = ${JSON.stringify(ALIASES)};
  export async function resolve(specifier, context, nextResolve) {
    for (const [prefix, dir] of Object.entries(ALIASES)) {
      if (specifier.startsWith(prefix)) {
        const rest = specifier.slice(prefix.length);
        const fileUrl = pathToFileURL(dir + rest).href;
        return nextResolve(fileUrl, context);
      }
    }
    return nextResolve(specifier, context);
  }
`;

register(`data:text/javascript,${encodeURIComponent(hookSource)}`, pathToFileURL('./'));
