"use strict";
// Son aramalar. Tinycast pencere kapanınca (ör. tarayıcı açılınca) eklentiyi baştan başlatır ve arama
// çubuğunu boşaltır; çubuk boşken son arama ve sonuçları buradan geri getirilir.
const React = require("react");
const { Cache } = require("@raycast/api");

const cache = new Cache();
const KEY = "son-aramalar";
const MAX = 10;

function list() {
  try {
    const v = JSON.parse(cache.get(KEY) || "[]");
    return Array.isArray(v) ? v.filter((e) => e && typeof e.q === "string" && e.q.trim()) : [];
  } catch {
    return [];
  }
}

function remember(entry) {
  const q = String((entry && entry.q) || "").trim();
  if (!q) return;
  const next = [{ ...entry, q }, ...list().filter((e) => e.q !== q)].slice(0, MAX);
  try {
    cache.set(KEY, JSON.stringify(next));
  } catch {
    // önbellek yazılamazsa geçmiş tutulmaz, arama yine çalışır
  }
}

function clear() {
  try {
    cache.remove(KEY);
  } catch {
    // yok say
  }
}

// Yazı durduktan bir süre sonra, sonuç geldiyse aramayı kaydeder (yazarken ara harfler kaydedilmez).
function useRemember(entry, ready) {
  const sig = JSON.stringify(entry);
  React.useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => remember(entry), 1200);
    return () => clearTimeout(timer);
  }, [ready, sig]);
}

module.exports = { list, remember, clear, useRemember };
