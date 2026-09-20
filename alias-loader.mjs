// ============================================================================
// alias-loader.mjs — a Node ESM "resolve hook" (see node:module's
// register()) that resolves the same '@core/...', '@elements/...',
// '@render/...', '@export/...', '@ui-preview/...', '@shared-css/...'
// bare-specifier aliases every app's own vite.config.js already defines
// via resolve.alias — so that source files can use one consistent import
// syntax (the '@x/...' aliases) whether they're loaded by Vite in a real
// browser or by plain `node` in a test file, with NO per-runtime
// branching or rewriting in the source files themselves.
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
// A `.css` import (e.g. `import '@shared-css/styles.css'` in each app's
// own main.js) needs a SECOND kind of help beyond just resolving the
// path: Vite treats an imported .css file as a "side-effect import" (it
// bundles the stylesheet into the page, the import itself has no JS
// value) — that's a Vite-specific feature, not something plain Node/ESM
// understands at all, so even once the path resolves correctly Node
// would still try to parse the CSS file's own contents as JavaScript and
// fail. The `load` hook below intercepts any '@shared-css/...' import
// specifically and hands back an empty module instead of the real file
// contents, so it's a harmless no-op under Node/tests while still doing
// the real thing (bundling the stylesheet) under Vite.
//
// Usage (from any test file, or via `node --import` on the command line):
//   node --import ./alias-loader.mjs test/some.test.js
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
  '@shared-css/': path.join(ROOT, 'packages/shared-css/'),
};

// The actual hook module — registered via a data: URL so this stays a
// single self-contained file rather than needing a second file just for
// the hook itself.
const hookSource = `
  import { pathToFileURL } from 'node:url';
  const ALIASES = ${JSON.stringify(ALIASES)};
  const CSS_SENTINEL = 'alias-loader-css-noop:';

  export async function resolve(specifier, context, nextResolve) {
    for (const [prefix, dir] of Object.entries(ALIASES)) {
      if (specifier.startsWith(prefix)) {
        const rest = specifier.slice(prefix.length);
        if (rest.endsWith('.css')) {
          // See this file's own header comment on why a .css import
          // can't just resolve to the real file under plain Node.
          return { url: CSS_SENTINEL + rest, shortCircuit: true };
        }
        const fileUrl = pathToFileURL(dir + rest).href;
        return nextResolve(fileUrl, context);
      }
    }
    return nextResolve(specifier, context);
  }

  export async function load(url, context, nextLoad) {
    if (url.startsWith(CSS_SENTINEL)) {
      return { format: 'module', source: '// (stylesheet, no-op under Node)', shortCircuit: true };
    }
    return nextLoad(url, context);
  }
`;

register(`data:text/javascript,${encodeURIComponent(hookSource)}`, pathToFileURL('./'));

