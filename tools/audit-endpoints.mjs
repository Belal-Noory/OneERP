import fs from "fs";
import path from "path";

function walk(dir, exts, cb) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", "dist", "build", "out"].includes(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, exts, cb);
    else if (exts.has(path.extname(ent.name))) cb(p);
  }
}

function extractClientEndpoints(rootDir) {
  const exts = new Set([".ts", ".tsx", ".js", ".jsx"]);
  const endpoints = new Map();
  walk(rootDir, exts, (p) => {
    const s = fs.readFileSync(p, "utf8");
    const re = /\b(apiFetch|fetch)\s*\(\s*(["'`])([^\2]*?)\2/g;
    let m;
    while ((m = re.exec(s))) {
      const url = m[3];
      if (!url.startsWith("/api/")) continue;
      const snippet = s.slice(m.index, m.index + 800);
      const mm = snippet.match(/\bmethod\s*:\s*['"](GET|POST|PATCH|PUT|DELETE)['"]/i);
      const method = mm ? mm[1].toUpperCase() : "GET";
      const key = `${method} ${url.split("?")[0]}`;
      if (!endpoints.has(key)) endpoints.set(key, new Set());
      endpoints.get(key).add(p);
    }
  });
  return endpoints;
}

const repoRoot = process.cwd();
const appRoot = path.resolve(repoRoot, "apps/app/src");
const client = extractClientEndpoints(appRoot);
console.log(JSON.stringify({ clientCount: client.size }, null, 2));
