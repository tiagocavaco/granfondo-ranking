// Verifies references in docs/**/*.md:
//   `path/to/file.ext`            file exists (or is listed in planned-paths.txt)
//   `path/to/file.ext#symbol`     file exists and contains the symbol text
//   `path/to/file.ext:NN`         flagged: line numbers are not allowed (they drift)
// Run from the repo root:  node docs/tools/check-refs.mjs
// Exit code 1 if anything is broken; one line per problem.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const docsDir = path.join(root, "docs");
const planned = new Set(
  fs.readFileSync(path.join(docsDir, "tools", "planned-paths.txt"), "utf8")
    .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.replace(/\/$/, "")),
);
const problems = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".md")) check(full);
  }
}

const contentCache = new Map();
function content(file) {
  if (!contentCache.has(file)) contentCache.set(file, fs.readFileSync(file, "utf8"));
  return contentCache.get(file);
}

const PATH_RE = /`((?:scraper|frontend|backoffice|api|database|utils|docs|\.github)\/[A-Za-z0-9_./-]+)(?:#([A-Za-z0-9_$.]+))?(?::(\d+))?`/g;

function check(mdFile) {
  const text = content(mdFile);
  const rel = path.relative(root, mdFile);
  for (const m of text.matchAll(PATH_RE)) {
    const p = m[1].replace(/\/$/, "");
    if (p.includes("<") || p.includes("*") || p.includes("…")) continue;
    if (m[3]) problems.push(`${rel}: line-number reference not allowed: ${m[0]}`);
    const abs = path.join(root, p);
    if (!fs.existsSync(abs)) {
      if (!planned.has(p)) problems.push(`${rel}: path not found ${p}`);
      continue;
    }
    if (m[2] && fs.statSync(abs).isFile() && !content(abs).includes(m[2])) {
      problems.push(`${rel}: symbol "${m[2]}" not found in ${p}`);
    }
  }
}

walk(docsDir);
if (problems.length) {
  for (const p of problems) console.log(p);
  console.log(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log("all references resolve");
