# TDV İslâm Ansiklopedisi — Tinycast eklentisi

Tinycast içinde TDV İslâm Ansiklopedisi'nde arar, maddenin tam metnini yan panelde gösterir ve İSNAD 2'ye göre atıf kopyalar. Bağımlılığı yoktur (~90 KB).

## Kurulum

Tinycast → Ayarlar → Extensions → Install New → **Add from folder** → bu klasörü seçin (ya da üst klasörde `zsh kur.sh`).


## Kullanım

Komut: **İslâm Ansiklopedisi'nde Ara**. Sağ üstteki menüden Başlık veya İçerik araması seçilir.

| Kısayol | İşlem |
|---|---|
| Tek tıklama | Maddeyi seçer, tam metni sağda gösterir |
| Çift tıklama / ↵ | Tam ekranda okur |
| ⌘↵ | Sitede açar |
| ⇧⌘A | Dipnot atfı (İSNAD 2, online) |
| ⇧⌘K | Kaynakça girdisi (İSNAD 2, online) |
| ⌥⇧⌘A / ⌥⇧⌘K | Matbu nüshaya göre dipnot / kaynakça |
| ⇧⌘B | Maddenin bibliyografyası |
| ⇧⌘C | Bağlantı |
| ⌥⌘C | Tam metin |
| ⇧⌘P | Matbu nüsha PDF'i |

Bütün atıfların (dipnot, kaynakça, matbu nüsha) sonuna maddenin bağlantısı eklenir. Çok bölümlü maddelerde bölüme göre atıf, bölümün bağlantısını (`…#2`) verir.

## İnternetsiz kullanım

Açtığınız her madde bu Mac'e kaydedilir (madde başına 30-50 KB). Siteye ulaşılamadığında:

- Arama, kaydedilmiş maddelerde yapılır; liste başlığında "İnternetsiz: kaydedilmiş maddeler" yazar. Başlık araması başlık ve tanımda, İçerik araması tam metinde arar. Kelimeler başından eşleşir: "illet" "illeti"yi bulur, "millet"i bulmaz.
- Madde kaydedilmiş kopyadan açılır; üstte kaydedildiği tarih yazar.
- Atıf kopyalama ve diğer eylemler aynen çalışır.

İnternet varken her zaman sitenin güncel metni gösterilir ve kayıt yenilenir. Kayıtlar `~/Library/Application Support/com.tinycast.app/extension-support/islam-ansiklopedisi/maddeler/` klasöründe durur; silinirse yalnız kayıtlar gider.

## Dosyalar

- `search.js` — arayüz (liste, yan panel, eylemler)
- `assets/tdv.js` — sitede arama, madde sayfasını ayrıştırma, İSNAD 2 atıfları
- `assets/offline.js` — maddeleri kaydetme ve internetsiz arama
- `package.json` — eklenti tanımı
