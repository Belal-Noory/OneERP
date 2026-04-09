const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pharmacyDir = path.join(root, "apps", "app", "src", "app", "t", "[tenantSlug]", "pharmacy");
const i18nFile = path.join(root, "packages", "i18n", "src", "index.ts");

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const keyRe = /\bt\(\s*"([^"]+)"/g;
const keys = new Set();

for (const file of walk(pharmacyDir)) {
  const txt = fs.readFileSync(file, "utf8");
  let m;
  while ((m = keyRe.exec(txt))) keys.add(m[1]);
}

const i18nTxt = fs.readFileSync(i18nFile, "utf8");
const dictKeyRe = /^\s*"([^"]+)"\s*:\s*"/gm;
const dictKeys = new Set();
let m;
while ((m = dictKeyRe.exec(i18nTxt))) dictKeys.add(m[1]);

const missing = [...keys].filter((k) => !dictKeys.has(k)).sort();
console.log(`Pharmacy UI translation keys used: ${keys.size}`);
console.log(`Missing keys: ${missing.length}`);
for (const k of missing) console.log(k);

process.exit(missing.length ? 1 : 0);

