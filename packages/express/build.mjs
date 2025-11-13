import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// Recursively walk a directory
function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (extname(full) === ".js") files.push(full);
  }
  return files;
}

// Fix imports to include .js extensions
for (const file of walk("./dist")) {
  const src = readFileSync(file, "utf8");
  const fixed = src.replace(/from\s+["'](\.\/[^"']+)(?<!\.js)["']/g, "from '$1.js'");
  if (fixed !== src) {
    writeFileSync(file, fixed, "utf8");
    console.log("patched imports in", file);
  }
}
