"use strict";
// Açılan maddeleri bu Mac'te saklar. İnternet yokken okuma, atıf ve arama bu kopyalardan yapılır.
const fs = require("fs");
const path = require("path");
const { environment } = require("@raycast/api");

let records = null; // file -> { savedAt, article }

function dir() {
  const d = path.join(environment.supportPath, "maddeler");
  try {
    fs.mkdirSync(d, { recursive: true });
  } catch {}
  return d;
}

function bare(url) {
  return String(url || "").split(/[?#]/)[0];
}

function fileFor(url) {
  const slug = bare(url).replace(/^https?:\/\/[^/]+\/?/, "").replace(/[^\w\-.]/g, "_") || "_";
  return path.join(dir(), slug + ".json");
}

function read(file) {
  try {
    const r = JSON.parse(fs.readFileSync(file, "utf8"));
    return r && r.article ? r : null;
  } catch {
    return null;
  }
}

function save(article) {
  if (!article || !article.title || !article.parts || !article.parts.length) return;
  const record = { savedAt: new Date().toISOString(), article };
  try {
    const file = fileFor(article.url);
    fs.writeFileSync(file, JSON.stringify(record));
    if (records) records.set(file, record);
  } catch {}
}

// Kaydedilmiş kopya; savedAt alanıyla birlikte.
function load(url) {
  const file = fileFor(url);
  const r = (records && records.get(file)) || read(file);
  return r ? { ...r.article, savedAt: r.savedAt } : null;
}

function all() {
  if (!records) {
    records = new Map();
    let names = [];
    try {
      names = fs.readdirSync(dir());
    } catch {}
    for (const n of names) {
      if (!n.endsWith(".json")) continue;
      const file = path.join(dir(), n);
      const r = read(file);
      if (r) records.set(file, r);
    }
  }
  return [...records.values()];
}

function count() {
  return all().length;
}

// ---- Arama ----

function foldChar(c) {
  if (c === "İ" || c === "I" || c === "ı") return "i";
  return c.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[’'‘`ʿʾ]/g, "");
}

// Katlanmış metin ve her katlanmış harfin asıl metindeki yeri.
function foldMap(s) {
  let out = "";
  const at = [];
  for (let i = 0; i < s.length; i++) {
    const f = foldChar(s[i]);
    for (const ch of f) {
      out += ch;
      at.push(i);
    }
  }
  return { out, at };
}

function fold(s) {
  return foldMap(String(s || "")).out;
}

function words(q) {
  return fold(q).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

// Kelime başında eşleşme: "illet" "illeti"yi bulur, "millet"i bulmaz.
const LETTER = /[\p{L}\p{N}]/u;
function wordAt(f, w, from) {
  let k = f.indexOf(w, from);
  while (k > 0 && LETTER.test(f[k - 1])) k = f.indexOf(w, k + 1);
  return k;
}

function tokens(s) {
  return fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function plain(line) {
  return line.replace(/^### /, "").replace(/\*\*?/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

// Aranan kelimelerin geçtiği yerlerden kısa alıntılar; kelimeler kalın.
function snippets(paras, ws, max) {
  const out = [];
  for (const p of paras) {
    if (out.length >= max) break;
    const { out: f, at } = foldMap(p);
    const hit = wordAt(f, ws[0], 0);
    if (hit < 0) continue;
    const from = Math.max(0, at[hit] - 120);
    const to = Math.min(p.length, at[hit] + 160);
    let s = p.slice(from, to);
    const sf = foldMap(s);
    const marks = [];
    for (const w of ws) {
      let k = wordAt(sf.out, w, 0);
      while (k >= 0) {
        marks.push([sf.at[k], sf.at[k + w.length - 1] + 1]);
        k = wordAt(sf.out, w, k + w.length);
      }
    }
    marks.sort((a, b) => b[0] - a[0]);
    let last = Infinity;
    for (const [a, b] of marks) {
      if (b > last) continue;
      s = s.slice(0, a) + "**" + s.slice(a, b) + "**" + s.slice(b);
      last = a;
    }
    s = s.replace(/\*\*(\s+)\*\*/g, "$1");
    out.push((from > 0 ? "…" : "") + s.trim() + (to < p.length ? "…" : ""));
  }
  return out;
}

function row(a, snippet) {
  return { id: a.url, title: a.title, arabic: a.arabic, desc: a.desc, url: a.url, articleUrl: a.url, seeAlso: "", snippet, offline: true };
}

// mode: "baslik" ya da "icerik"; tdv.search ile aynı biçimde sonuç döner.
function search(query, mode) {
  const ws = words(query);
  if (!ws.length) return [];
  const q = ws.join(" ");
  const hits = [];
  for (const { article: a } of all()) {
    const title = fold(a.title);
    const has = (toks) => ws.every((w) => toks.some((t) => t.startsWith(w)));
    if (mode === "icerik") {
      const paras = a.parts.flatMap((p) => p.body).map(plain);
      const toks = tokens(a.title + " " + paras.join(" "));
      if (!has(toks)) continue;
      let n = 0;
      for (const t of toks) if (ws.some((w) => t.startsWith(w))) n++;
      hits.push({ score: (wordAt(title, q, 0) >= 0 ? 1000 : 0) + n, r: row(a, snippets(paras, ws, 3)) });
    } else {
      if (title.startsWith(q)) hits.push({ score: 3, r: row(a, "") });
      else if (has(tokens(a.title))) hits.push({ score: 2, r: row(a, "") });
      else if (has(tokens([a.arabic, a.fullName, a.desc].join(" ")))) hits.push({ score: 1, r: row(a, "") });
    }
  }
  return hits.sort((x, y) => y.score - x.score || x.r.title.localeCompare(y.r.title, "tr")).map((x) => x.r);
}

module.exports = { save, load, search, count };
