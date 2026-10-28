"use strict";
// "İslâm Ansiklopedisi'nde Ara": results on the left, the selected article's full text on the right.
const React = require("react");
const {
  List, Detail, ActionPanel, Action, Icon, Clipboard, showToast, Toast, useNavigation,
} = require("@raycast/api");
const tdv = require("./assets/tdv.js");
const recent = require("./assets/recent.js");
const offline = require("./assets/offline.js");

const h = React.createElement;
const articles = new Map(); // url -> article | Promise
const searches = new Map(); // `${mode}|${query}` -> results

function loadArticle(url) {
  const cached = articles.get(url);
  if (cached) return Promise.resolve(cached);
  // Açılan her madde kaydedilir; site açılamazsa kaydedilmiş kopya kullanılır.
  const pending = tdv.article(url).then(
    (a) => {
      articles.set(url, a);
      offline.save(a);
      return a;
    },
    (e) => {
      const saved = offline.load(url);
      if (saved) {
        articles.set(url, saved);
        return saved;
      }
      articles.delete(url);
      throw e;
    },
  );
  articles.set(url, pending);
  return pending;
}

function loaded(url) {
  const a = articles.get(url);
  return a && !(a instanceof Promise) ? a : null;
}

async function copyWith(url, make, label) {
  try {
    const a = loaded(url) || (await loadArticle(url));
    const value = make(a);
    if (!value) {
      await showToast({ style: Toast.Style.Failure, title: `${label} için bilgi yok` });
      return;
    }
    await Clipboard.copy(value);
    await showToast({ style: Toast.Style.Success, title: `${label} kopyalandı`, message: value.length > 90 ? value.slice(0, 90) + "…" : value });
  } catch (e) {
    await showToast({ style: Toast.Style.Failure, title: "Madde yüklenemedi", message: String(e && e.message || e) });
  }
}

function citationActions(url, a) {
  const cite = (key) => (x) => tdv.citations(x)[key];
  const items = [
    h(Action, { key: "fn", title: "Dipnot Atfını Kopyala (İSNAD 2)", icon: Icon.Quote, shortcut: { modifiers: ["cmd", "shift"], key: "a" }, onAction: () => copyWith(url, cite("footnote"), "Dipnot atfı") }),
    h(Action, { key: "bib", title: "Kaynakça Girdisini Kopyala (İSNAD 2)", icon: Icon.Book, shortcut: { modifiers: ["cmd", "shift"], key: "k" }, onAction: () => copyWith(url, cite("bibliography"), "Kaynakça girdisi") }),
    h(Action, { key: "pfn", title: "Dipnot Atfını Kopyala — Matbu Nüsha", icon: Icon.Quote, shortcut: { modifiers: ["cmd", "shift", "opt"], key: "a" }, onAction: () => copyWith(url, cite("printedFootnote"), "Matbu dipnot atfı") }),
    h(Action, { key: "pbib", title: "Kaynakça Girdisini Kopyala — Matbu Nüsha", icon: Icon.Book, shortcut: { modifiers: ["cmd", "shift", "opt"], key: "k" }, onAction: () => copyWith(url, cite("printedBibliography"), "Matbu kaynakça girdisi") }),
  ];
  // Multi-part articles: each part has its own author, so offer per-part citations too.
  if (a && a.parts.length > 1) {
    items.push(
      h(
        ActionPanel.Submenu,
        { key: "parts", title: "Bölüme Göre Atıf…", icon: Icon.List },
        a.parts.map((p, i) =>
          h(
            ActionPanel.Submenu,
            { key: `p${i}`, title: `Bölüm ${p.n}${p.authors.length ? " — " + p.authors.map(tdv.titleCaseTr).join(", ") : ""}` },
            h(Action, { title: "Dipnot (İSNAD 2)", onAction: () => copyWith(url, (x) => tdv.citations(x, i).footnote, "Dipnot atfı") }),
            h(Action, { title: "Kaynakça (İSNAD 2)", onAction: () => copyWith(url, (x) => tdv.citations(x, i).bibliography, "Kaynakça girdisi") }),
          ),
        ),
      ),
    );
  }
  return items;
}

function articleActions({ url, a, primary, extra }) {
  const pdf = a && (a.parts.find((p) => p.pdf) || {}).pdf;
  return h(
    ActionPanel,
    null,
    h(ActionPanel.Section, null, primary, h(Action.OpenInBrowser, { title: "Sitede Aç", url, shortcut: { modifiers: ["cmd"], key: "return" } })),
    h(ActionPanel.Section, { title: "Atıf" }, ...citationActions(url, a)),
    h(
      ActionPanel.Section,
      { title: "Kopyala" },
      h(Action.CopyToClipboard, { title: "Bağlantıyı Kopyala", content: url, shortcut: { modifiers: ["cmd", "shift"], key: "c" } }),
      h(Action, { title: "Maddenin Bibliyografyasını Kopyala", icon: Icon.List, shortcut: { modifiers: ["cmd", "shift"], key: "b" }, onAction: () => copyWith(url, tdv.plainBibliography, "Bibliyografya") }),
      h(Action, { title: "Tam Metni Kopyala", icon: Icon.Text, shortcut: { modifiers: ["cmd", "opt"], key: "c" }, onAction: () => copyWith(url, tdv.plainText, "Tam metin") }),
    ),
    h(
      ActionPanel.Section,
      null,
      pdf ? h(Action.OpenInBrowser, { title: "Matbu Nüshayı (PDF) Aç", url: pdf, icon: Icon.Document, shortcut: { modifiers: ["cmd", "shift"], key: "p" } }) : null,
      extra,
    ),
  );
}

const DATE = (iso) => new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

function markdownOf(a) {
  const note = a.savedAt ? `*İnternet yok; ${DATE(a.savedAt)} tarihinde kaydedilen kopya gösteriliyor.*\n\n` : "";
  return note + tdv.articleMarkdown(a);
}

// Full-width reading view (↵ or a double click).
function Reader({ url }) {
  const [a, setA] = React.useState(loaded(url));
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    if (!a) loadArticle(url).then(setA, (e) => setError(String(e && e.message || e)));
  }, [url]);
  return h(Detail, {
    isLoading: !a && !error,
    navigationTitle: a ? tdv.titleCaseTr(a.title) : "Yükleniyor…",
    markdown: a ? markdownOf(a) : error ? `**Madde yüklenemedi.** ${error}` : "",
    actions: articleActions({ url, a, primary: null }),
  });
}


// Arama çubuğu boşken önceki aramalar.
function historyItems(entries, pick, clear, describe) {
  return entries.map((e) =>
    h(List.Item, {
      key: "__h" + e.q,
      id: "__h" + e.q,
      title: e.q,
      subtitle: describe ? describe(e) : undefined,
      icon: Icon.Clock,
      detail: h(List.Item.Detail, { markdown: `**${e.q}**\n\n↵ ile bu aramayı yeniden göster.` }),
      actions: h(
        ActionPanel,
        null,
        h(Action, { title: "Bu Aramayı Göster", icon: Icon.MagnifyingGlass, onAction: () => pick(e) }),
        h(Action, { title: "Arama Geçmişini Temizle", icon: Icon.Trash, style: Action.Style.Destructive, onAction: clear }),
      ),
    }),
  );
}

// Son arama: çubuk boşken en son aramaya döner; yazılan arama sonuç verince kaydedilir.
function useRecall(text, restore) {
  const [recall, setRecall] = React.useState(() => recent.list()[0] || null);
  const [, setTick] = React.useState(0);
  const typed = text.trim();
  React.useEffect(() => {
    if (recall && restore) restore(recall);
  }, []);
  React.useEffect(() => {
    if (!typed) setRecall(recent.list()[0] || null);
  }, [typed]);
  const pick = (e) => {
    recent.remember(e);
    setRecall(e);
    if (restore) restore(e);
  };
  const clear = () => {
    recent.clear();
    setRecall(null);
    setTick((t) => t + 1);
    showToast({ style: Toast.Style.Success, title: "Arama geçmişi temizlendi" });
  };
  const others = typed ? [] : recent.list().filter((e) => !recall || e.q !== recall.q);
  return { typed, recall: typed ? null : recall, shown: typed || (recall ? recall.q : ""), pick, clear, others };
}

function Command(props) {
  const { push } = useNavigation();
  const [query, setQuery] = React.useState("");
  const [mode, setMode] = React.useState("baslik");
  // Başka bir eklentiden (ör. Tarihî Yer ve Yol Ara) gelen arama, son arama gibi açılır.
  const [launched] = React.useState(() => {
    const q = props && props.launchContext && props.launchContext.query;
    if (q) recent.remember({ q: String(q), mode: "baslik" });
    return !!q;
  });
  const r = useRecall(query, (e) => e.mode && setMode(e.mode));
  const [results, setResults] = React.useState([]);
  const [searching, setSearching] = React.useState(false);
  const [local, setLocal] = React.useState(false); // sonuçlar kaydedilmiş maddelerden
  const [selected, setSelected] = React.useState(null);
  const [, setTick] = React.useState(0);
  const selectedRef = React.useRef(null);
  const selectedAt = React.useRef(0);

  React.useEffect(() => {
    const q = r.shown;
    if (!q) {
      setResults([]);
      setSearching(false);
      setLocal(false);
      return;
    }
    const key = `${mode}|${q}`;
    if (searches.has(key)) {
      setResults(searches.get(key));
      setLocal(false);
      return;
    }
    let alive = true;
    setSearching(true);
    tdv.search(q, mode).then(
      (r) => {
        searches.set(key, r);
        if (alive) {
          setResults(r);
          setLocal(false);
          setSearching(false);
        }
      },
      (e) => {
        if (!alive) return;
        // Site açılamadı: kaydedilmiş maddelerde ara (önbelleğe alınmaz, internet gelince yeniden aranır).
        const found = offline.search(q, mode);
        setResults(found);
        setLocal(true);
        setSearching(false);
        const n = offline.count();
        showToast({
          style: Toast.Style.Failure,
          title: "Siteye ulaşılamadı",
          message: n ? `Kaydedilmiş ${n} maddede arandı: ${found.length} sonuç` : String(e && e.message || e),
        });
      },
    );
    return () => {
      alive = false;
    };
  }, [r.shown, mode]);
  recent.useRemember({ q: r.typed, mode }, !!r.typed && !searching && results.length > 0);

  const current = results.find((r) => r.id === selected) || results[0] || null;
  const currentUrl = current && current.articleUrl;

  // Load the selected article after a short pause, so arrowing through the list stays light.
  React.useEffect(() => {
    if (!currentUrl || loaded(currentUrl)) return;
    let alive = true;
    const timer = setTimeout(() => {
      loadArticle(currentUrl).then(
        () => alive && setTick((t) => t + 1),
        () => alive && setTick((t) => t + 1),
      );
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [currentUrl]);

  // Tinycast runs a row's primary action on every click; a click on a row that was not selected
  // only selects it, so reading full-width takes a double click or ↵.
  const guard = (r) => {
    if (selectedRef.current !== r.id) {
      selectedRef.current = r.id;
      selectedAt.current = Date.now();
      setSelected(r.id);
      return false;
    }
    return Date.now() - selectedAt.current > 60;
  };

  const rows = results.map((r) => {
    const isSel = current && r.id === current.id;
    const a = isSel ? loaded(r.articleUrl) : null;
    let markdown = "";
    if (isSel) {
      if (a) markdown = (r.seeAlso ? `*${r.title} için bk.*\n\n` : "") + markdownOf(a);
      else {
        markdown = tdv.header({ title: r.title, arabic: r.arabic, desc: r.desc });
        if (r.snippet && r.snippet.length) markdown += "\n---\n\n" + r.snippet.map((s) => `> ${s}`).join("\n>\n");
      }
    }
    return h(List.Item, {
      key: r.id,
      id: r.id,
      title: r.title,
      subtitle: r.desc,
      icon: r.seeAlso ? Icon.ArrowRight : r.offline ? Icon.HardDrive : Icon.Book,
      detail: h(List.Item.Detail, { isLoading: isSel && !a, markdown }),
      actions: articleActions({
        url: r.articleUrl,
        a: loaded(r.articleUrl),
        primary: h(Action, {
          title: "Tam Ekranda Oku",
          icon: Icon.Eye,
          onAction: () => {
            if (guard(r)) push(h(Reader, { url: r.articleUrl }));
          },
        }),
      }),
    });
  });

  return h(
    List,
    {
      isLoading: searching,
      isShowingDetail: results.length > 0,
      filtering: false,
      throttle: true,
      searchBarPlaceholder: mode === "icerik" ? "Madde metinlerinde ara…" : "Madde başlığı ara…",
      onSearchTextChange: setQuery,
      onSelectionChange: (id) => {
        if (selectedRef.current !== (id || null)) selectedAt.current = Date.now();
        selectedRef.current = id || null;
        setSelected(id || null);
      },
      searchBarAccessory: h(
        List.Dropdown,
        { tooltip: "Arama türü", value: mode, onChange: setMode },
        h(List.Dropdown.Item, { title: "Başlık", value: "baslik" }),
        h(List.Dropdown.Item, { title: "İçerik", value: "icerik" }),
      ),
    },
    h(List.EmptyView, {
      icon: Icon.Book,
      title: r.shown ? (searching ? "Aranıyor…" : "Sonuç bulunamadı") : "TDV İslâm Ansiklopedisi'nde arayın",
      description: r.shown ? (local ? `İnternet yok; yalnız daha önce açılan ${offline.count()} madde aranabiliyor.` : undefined) : "Madde başlığı yazın; içerikte aramak için sağ üstten İçerik'i seçin.",
    }),
    h(
      List.Section,
      {
        title: [r.recall ? `Son arama: ${r.recall.q}` : "", local ? "İnternetsiz: kaydedilmiş maddeler" : ""].filter(Boolean).join(" · ") || undefined,
      },
      ...rows,
    ),
    r.others.length ? h(List.Section, { title: "Önceki aramalar" }, ...historyItems(r.others, r.pick, r.clear, (e) => (e.mode === "icerik" ? "İçerik" : "Başlık"))) : null,
  );
}

module.exports = { default: Command };
