"use strict";
// TDV İslâm Ansiklopedisi: search, article parsing and İSNAD 2 citations. No dependencies.

const BASE = "https://islamansiklopedisi.org.tr";
// Site, Referer göndermeyen istekleri (özellikle ajax uçlarında) 403 ile reddediyor.
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Tinycast",
  "Referer": BASE + "/",
};

// ---- HTML helpers ----

const ENTITIES = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", hellip: "…", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : m));
}

function text(html) {
  return decode(String(html || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function absolute(href) {
  if (!href) return "";
  if (/^https?:/i.test(href)) return href;
  return BASE + (href.startsWith("/") ? "" : "/") + href;
}

// "İBNÜ’s-SELCÎ&nbsp;ابن الثلجي" -> { title, arabic }
function splitTitle(raw) {
  const t = text(raw);
  const m = t.match(/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/);
  if (!m || m.index === 0) return { title: t, arabic: "" };
  return { title: t.slice(0, m.index).trim(), arabic: t.slice(m.index).trim() };
}

async function get(url, extra) {
  const res = await fetch(url, { headers: { ...HEADERS, ...(extra || {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ---- Search ----

// mode: "baslik" (title autocomplete) or "icerik" (full-text search page)
async function search(query, mode) {
  const q = query.trim();
  if (!q) return [];
  if (mode === "icerik") return searchContent(q);
  const html = await get(`${BASE}/ajax_search_auto.php?sp=aa&=ac&q=${encodeURIComponent(q)}`, {
    "X-Requested-With": "XMLHttpRequest",
  });
  const out = [];
  const re = /<a href="([^"]+)"><li>([\s\S]*?)<\/li><\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const body = m[2];
    const { title, arabic } = splitTitle((body.match(/<span class="sr-title">([\s\S]*?)<\/span>/) || [])[1]);
    if (!title) continue;
    const atif = body.match(/sr-atif-container[\s\S]*?<a href="([^"]+)">[\s\S]*?<span class="sr-atif-madde">([\s\S]*?)<\/span>/);
    let desc = text((body.match(/<span class="sr-desc">([\s\S]*?)<\/span>/) || [])[1]);
    const atifDesc = text((body.match(/<span class="sr-atif-desc">([\s\S]*?)<\/span>/) || [])[1]);
    if (atif) {
      const target = splitTitle(atif[2]).title;
      desc = `bk. ${target}${atifDesc ? " — " + atifDesc : ""}`;
    }
    out.push({
      id: href,
      title,
      arabic,
      desc,
      url: absolute(href),
      articleUrl: atif ? absolute(atif[1]) : absolute(href),
      seeAlso: atif ? splitTitle(atif[2]).title : "",
      snippet: "",
    });
  }
  return out;
}

async function searchContent(q) {
  const html = await get(`${BASE}/arama/?q=${encodeURIComponent(q)}&p=t`);
  const out = [];
  const rows = html.split('<div class="madde_liste_satir">').slice(1);
  for (const row of rows) {
    const a = row.match(/<a href=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const { title, arabic } = splitTitle(a[2]);
    const desc = text((row.match(/<span class="desc">([\s\S]*?)<\/span>/) || [])[1]);
    const snip = row.match(/<div style="padding:7px[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const snippet = snip
      ? decode(snip[1].replace(/<br\s*\/?>/gi, "\n").replace(/<b>([\s\S]*?)<\/b>/gi, "**$1**").replace(/<[^>]+>/g, ""))
          .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean)
      : [];
    out.push({ id: a[1], title, arabic, desc, url: absolute(a[1]), articleUrl: absolute(a[1]), seeAlso: "", snippet });
  }
  return out;
}

// ---- Article ----

function inline(html) {
  let s = html
    .replace(/<br\s*\/?>/gi, "  \n")
    .replace(/<sup>([\s\S]*?)<\/sup>/gi, "$1")
    .replace(/<span class="eser[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, (_, x) => `*${x.replace(/<\/?i>/gi, "")}*`)
    .replace(/<span class="kisaltma"[^>]*>([\s\S]*?)<\/span>/gi, "$1")
    .replace(/<i>([\s\S]*?)<\/i>/gi, (_, x) => (x.trim() ? `*${x.trim()}* ` : x))
    .replace(/<b>([\s\S]*?)<\/b>/gi, (_, x) => (x.trim() ? `**${x.trim()}**` : x))
    .replace(/<a [^>]*href=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi, (_, href, x) => `[${text(x)}](${absolute(href)})`)
    .replace(/<[^>]+>/g, "");
  s = decode(s).replace(/[ \t ]+/g, " ").replace(/\*\s+\*/g, " ").replace(/ +\n/g, "\n");
  return s.replace(/\* ([,.;:’)])/g, "*$1").trim();
}

function paragraphs(html) {
  const out = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    if (!text(raw)) continue;
    // A paragraph that is all bold is a section heading.
    if (/^<b>[\s\S]*<\/b>$/i.test(raw) && !/<\/b>[\s\S]*<b>/i.test(raw)) out.push(`### ${text(raw)}`);
    else out.push(inline(raw));
  }
  return out;
}

function titleCaseTr(s) {
  const lower = (w) => w.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
  const upper = (c) => (c === "i" ? "İ" : c === "ı" ? "I" : c.toUpperCase());
  // Words the site writes in lowercase (b., el-, es-, ’s) are kept as they are.
  return s.replace(/[^\s\-–]+/g, (w) => {
    if (w === w.toLowerCase()) return w;
    const l = lower(w);
    const i = l.search(/[\p{L}]/u);
    return i < 0 ? l : l.slice(0, i) + upper(l[i]) + l.slice(i + 1);
  });
}

async function article(url) {
  const html = await get(url);
  const title = text((html.match(/<div class="article_title"><h1>([\s\S]*?)<\/h1>/) || [])[1]);
  const arabic = text((html.match(/<div class="arabic_title">([\s\S]*?)<\/div>/) || [])[1]);
  const info = (html.match(/<div class="article_info"><h2>([\s\S]*?)<\/h2>/) || [])[1] || "";
  const fullName = text(info.split(/<span class="article-dt"|<br|<div/)[0]);
  const death = text((info.match(/<span class="article-dt">([\s\S]*?)<\/span>/) || [])[1]);
  const desc = text((info.match(/<span style="color:#e16328">([\s\S]*?)(?:<\/span>|<\/div>)/) || [])[1]);

  const partChunks = html.split(/<div class="article-part" id="_\d+"/).slice(1);
  const parts = partChunks.map((chunk, i) => {
    const authors = [];
    const ar = /<span class="part-authors"[^>]*>\s*<span[^>]*>\s*Müellif:\s*<\/span>([\s\S]*?)<\/span>\s*<\/span>/g;
    let m;
    while ((m = ar.exec(chunk))) {
      const names = m[1].match(/<b>([\s\S]*?)<\/b>/g) || [];
      for (const n of names) authors.push(text(n));
    }
    const start = chunk.indexOf('<div class="m-content"');
    const end = chunk.indexOf('class="article-ps"', start);
    let body = start >= 0 ? chunk.slice(chunk.indexOf(">", start) + 1, end > 0 ? end : undefined) : "";
    let biblHtml = "";
    const b = body.search(/<bibl>/i);
    if (b >= 0) {
      biblHtml = body.slice(b).replace(/<span class=['"]bibliyografya['"]>[\s\S]*?<\/span>/i, "");
      body = body.slice(0, b);
    }
    const ps = end > 0 ? chunk.slice(end, end + 3000) : "";
    const pm = ps.match(/(\d{4}) yılında[^<]*?basılan (\d+)\. cildinde, ([\d\-–]+) numaralı sayfa/);
    const upd = ps.match(/en son ([\d.]+) tarihinde güncellen/);
    const pdf = ps.match(/class="dosyaindir" href="([^"]+\.pdf)"/);
    return {
      n: i + 1,
      authors,
      body: paragraphs(body),
      bibliography: paragraphs(biblHtml),
      year: pm ? pm[1] : "",
      volume: pm ? pm[2] : "",
      pages: pm ? pm[3].replace("–", "-") : "",
      updated: upd ? upd[1] : "",
      pdf: pdf ? pdf[1] : "",
    };
  });
  const authors = [...new Set(parts.flatMap((p) => p.authors))];
  return { url: url.split(/[?#]/)[0], title, arabic, fullName, death, desc, parts, authors };
}

// ---- Markdown ----

function header({ title, arabic, fullName, death, desc }) {
  let md = `# ${title}\n`;
  if (arabic) md += `\n## ${arabic}\n`;
  if (fullName || death) md += `\n${fullName ? `**${fullName}**` : ""}${death ? ` ${death}` : ""}\n`;
  if (desc) md += `\n*${desc}*\n`;
  return md;
}

function articleMarkdown(a) {
  let md = header(a);
  const many = a.parts.length > 1;
  for (const p of a.parts) {
    const facts = [];
    if (p.authors.length) facts.push(`Müellif: ${p.authors.map(titleCaseTr).join(", ")}`);
    if (p.volume) facts.push(`Cilt ${p.volume}, s. ${p.pages} (${p.year})`);
    if (p.updated) facts.push(`Güncelleme: ${p.updated}`);
    md += "\n---\n\n";
    if (many) md += `### Bölüm ${p.n}\n\n`;
    if (facts.length) md += `${facts.join("  ·  ")}\n\n`;
    md += p.body.join("\n\n");
    if (p.bibliography.length) md += `\n\n## Bibliyografya\n\n` + p.bibliography.join("\n\n");
  }
  return md;
}

// ---- İSNAD 2 ----

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const ENCYCLOPEDIA = "Türkiye Diyanet Vakfı İslâm Ansiklopedisi";

function today() {
  const d = new Date();
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function person(name) {
  const words = titleCaseTr(name).split(/\s+/);
  const last = words.pop();
  return { full: [...words, last].join(" "), inverted: words.length ? `${last}, ${words.join(" ")}` : last };
}

// Footnote: "Mustafa Çağrıcı"; 2 authors "A - B"; 3+ "A vd."
function footAuthors(names) {
  const p = names.map(person);
  if (p.length === 0) return "";
  if (p.length === 1) return p[0].full;
  if (p.length === 2) return `${p[0].full} - ${p[1].full}`;
  return `${p[0].full} vd.`;
}

// Bibliography: "Çağrıcı, Mustafa"; 2 authors "Soyad, Ad - Ad Soyad"; 3+ "Soyad, Ad vd."
function bibAuthors(names) {
  const p = names.map(person);
  if (p.length === 0) return "";
  if (p.length === 1) return p[0].inverted;
  if (p.length === 2) return `${p[0].inverted} - ${p[1].full}`;
  return `${p[0].inverted} vd.`;
}

function citations(a, partIndex) {
  const part = partIndex != null ? a.parts[partIndex] : null;
  const names = part ? part.authors : a.authors;
  const t = titleCaseTr(a.title);
  const fa = footAuthors(names);
  const ba = bibAuthors(names);
  const url = a.url + (part && a.parts.length > 1 ? `#${part.n}` : "");
  const date = today();
  const lead = (s, sep) => (s ? s + sep : "");
  const printed = part || a.parts.find((p) => p.volume) || null;
  const out = {
    footnote: `${lead(fa, ", ")}“${t}”, ${ENCYCLOPEDIA} (Erişim ${date}). ${url}`,
    bibliography: `${lead(ba.replace(/\.$/, ""), ". ")}“${t}”. ${ENCYCLOPEDIA}. Erişim ${date}. ${url}`,
    printedFootnote: null,
    printedBibliography: null,
  };
  if (printed && printed.volume) {
    out.printedFootnote = `${lead(fa, ", ")}“${t}”, ${ENCYCLOPEDIA} (İstanbul: TDV Yayınları, ${printed.year}), ${printed.volume}/${printed.pages}. ${url}`;
    out.printedBibliography = `${lead(ba.replace(/\.$/, ""), ". ")}“${t}”. ${ENCYCLOPEDIA}. ${printed.volume}/${printed.pages}. İstanbul: TDV Yayınları, ${printed.year}. ${url}`;
  }
  return out;
}

function plainBibliography(a) {
  return a.parts
    .flatMap((p) => p.bibliography)
    .map((l) => l.replace(/\*\*?/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"))
    .join("\n");
}

function plainText(a) {
  const lines = [titleCaseTr(a.title) + (a.arabic ? ` (${a.arabic})` : "")];
  if (a.fullName) lines.push(a.fullName + (a.death ? ` ${a.death}` : ""));
  if (a.desc) lines.push(a.desc);
  for (const p of a.parts) lines.push("", ...p.body.map((l) => l.replace(/^### /, "").replace(/\*\*?/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")));
  return lines.join("\n");
}

module.exports = { BASE, search, article, header, articleMarkdown, citations, plainBibliography, plainText, titleCaseTr };
