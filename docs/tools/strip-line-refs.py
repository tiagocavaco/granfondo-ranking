"""One-off: convert `file.ts:NN` references in docs/**/*.md to `full/path/file.ts`.

Bare basenames are expanded when the repository has exactly one file with
that name. Line numbers (and ranges) are dropped. Run from the repo root:
    python3 docs/tools/strip-line-refs.py
"""
import glob
import os
import re
import subprocess

files = subprocess.check_output(["git", "ls-files"]).decode().split("\n")
index = {}
for f in files:
    if f.endswith((".ts", ".tsx", ".mjs", ".yml", ".json", ".css", ".html")) and "node_modules" not in f and not f.startswith("docs/"):
        index.setdefault(os.path.basename(f), []).append(f)

pattern = re.compile(r"`([A-Za-z0-9_./-]+\.(?:ts|tsx|mjs|js|yml|yaml|json|css|html)):\d+(?:[–-]\d+)?`")


def expand(match):
    path = match.group(1)
    if "/" not in path and path in index and len(index[path]) == 1:
        path = index[path][0]
    return "`" + path + "`"


changed = 0
for md in glob.glob("docs/**/*.md", recursive=True):
    with open(md) as fh:
        original = fh.read()
    updated = pattern.sub(expand, original)
    if updated != original:
        with open(md, "w") as fh:
            fh.write(updated)
        changed += 1
print(f"files changed: {changed}")
