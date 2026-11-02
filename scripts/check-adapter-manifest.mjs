// Fails when the bundled adapter manifest lists different routes from the one the
// auth API publishes. `apiVersion` is ignored: a patch release of the API bumps it
// without changing a route.
//
//   node scripts/check-adapter-manifest.mjs [path-or-url]
//
// Defaults to the manifest on the auth API's main branch. Fix a failure with
// scripts/sync-adapter-manifest.mjs.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_SOURCE =
  "https://raw.githubusercontent.com/fells-code/seamless-auth-api/main/adapter-manifest.json";
const BUNDLED = join(
  import.meta.dirname,
  "../packages/core/src/manifest/bundledManifest.ts",
);

async function read(source) {
  if (!/^https?:\/\//.test(source)) {
    return readFile(source, "utf8");
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Could not read ${source}: HTTP ${response.status}`);
  }
  return response.text();
}

function routeKeys(manifest) {
  return manifest.routes
    .map((route) =>
      JSON.stringify(Object.fromEntries(Object.entries(route).sort())),
    )
    .sort();
}

const source = process.argv[2] ?? DEFAULT_SOURCE;
const published = JSON.parse(await read(source));

const text = await readFile(BUNDLED, "utf8");
const bundled = JSON.parse(
  text.slice(text.indexOf("= {") + 2, text.lastIndexOf("}") + 1),
);

const want = new Set(routeKeys(published));
const have = new Set(routeKeys(bundled));
const missing = [...want].filter((route) => !have.has(route));
const extra = [...have].filter((route) => !want.has(route));

if (bundled.schemaVersion !== published.schemaVersion) {
  missing.unshift(`schemaVersion ${published.schemaVersion}`);
  extra.unshift(`schemaVersion ${bundled.schemaVersion}`);
}

if (missing.length === 0 && extra.length === 0) {
  console.log(
    `Bundled manifest matches ${source}: ${have.size} routes (bundled API ${bundled.apiVersion}, published ${published.apiVersion}).`,
  );
} else {
  console.error(`Bundled manifest differs from ${source}.`);
  for (const route of missing) console.error(`  missing: ${route}`);
  for (const route of extra) console.error(`  extra:   ${route}`);
  console.error("Run node scripts/sync-adapter-manifest.mjs and commit the result.");
  process.exitCode = 1;
}
