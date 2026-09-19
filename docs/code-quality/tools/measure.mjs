// Code-shape metrics used in docs/code-quality/metrics.json.
// Run from the repo root:  node docs/code-quality/tools/measure.mjs
// Counts non-test source files, total lines, functions (rough regex-based
// detection of function/arrow/method starts with brace matching), functions
// over 50 and 100 lines, `any`, non-null assertions, TODOs, console calls,
// eslint-disable comments and exports. Prints the 25 longest functions.
// For duplication run:  npx jscpd --min-lines 8 --min-tokens 60 --format typescript,tsx
//   --ignore "**/node_modules/**,**/*.test.*,**/dist/**,**/coverage/**" scraper/src database/src utils/src api/src frontend/src backoffice
// For lint counts:  npx eslint "**/*.{ts,tsx}" -f json
import fs from "node:fs"; import path from "node:path";
const roots=["scraper/src","database/src","utils/src","api/src","frontend/src","backoffice/src","backoffice/server"];
const files=[]; const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name); if(e.isDirectory()) walk(p); else if(/\.(ts|tsx)$/.test(e.name)&&!/\.test\./.test(e.name)) files.push(p);}}; roots.forEach(walk);
const long=[]; let total=0, fnCount=0, anyCount=0, bang=0, todo=0, clog=0, disable=0, exportsCount=0;
for(const f of files){ const s=fs.readFileSync(f,"utf8"); const lines=s.split("\n"); total+=lines.length;
  anyCount+=(s.match(/\bany\b/g)||[]).length; bang+=(s.match(/[a-zA-Z\)\]]!(?=[.;,\)\]\s])/g)||[]).length; todo+=(s.match(/TODO|FIXME|HACK/g)||[]).length; clog+=(s.match(/console\.(log|warn|error)/g)||[]).length; disable+=(s.match(/eslint-disable/g)||[]).length; exportsCount+=(s.match(/^export /gm)||[]).length;
  // rough function length: from a line matching function/arrow-const/method start to the line where brace depth returns to start
  for(let i=0;i<lines.length;i++){ const l=lines[i]; if(/^\s*(export\s+)?(async\s+)?function\s+\w+|^\s*(export\s+)?(const|let)\s+\w+\s*=\s*(async\s*)?\(.*\)\s*(:\s*[^=]+)?=>\s*\{?\s*$|^\s*(export\s+)?(const|let)\s+\w+\s*=\s*(async\s*)?function|^\s*(export\s+)?(default\s+)?function\s+\w+/.test(l)){ let depth=0,started=false,j=i; for(;j<lines.length;j++){ for(const ch of lines[j]){ if(ch==="{"){depth++;started=true;} else if(ch==="}"){depth--;} } if(started&&depth<=0) break; } const len=j-i+1; fnCount++; if(len>50) long.push({f, line:i+1, len, name:(l.match(/function\s+(\w+)|(?:const|let)\s+(\w+)/)||[])[1]||(l.match(/(?:const|let)\s+(\w+)/)||[])[1]}); i=Math.max(i, i); } }
}
long.sort((a,b)=>b.len-a.len);
console.log(JSON.stringify({files:files.length,total_lines:total,functions:fnCount,functions_over_50:long.length,functions_over_100:long.filter(x=>x.len>100).length,any:anyCount,non_null_assertions:bang,todo,console_calls:clog,eslint_disable:disable,exports:exportsCount}));
console.log(long.slice(0,25).map(x=>`${x.len}\t${x.f}\t${x.name}`).join("\n"));
