# Agent teslim notu — ekran ekran tasarım geçişi

Son güncelleme: 2026-09-16 · Branch: `main` · Son commit: `d43bc19`

Bu dosya, başka bir makinedeki agent'ın işi kaldığı yerden sürdürebilmesi için
yazıldı. Sadece koddan okunamayacak şeyleri anlatır: nerede kaldığımızı, hangi
kurallara uyduğumuzu ve bilinip de henüz düzeltilmemiş olanları.

---

## 1. İşin ne olduğu

Glyphr Studio 2 (Blue Rain forku) — vanilla JS tarayıcı font editörü,
**bluerain.studio** altında yayınlanacak. Hedef kitle sırasıyla: bağımsız oyun
geliştiricileri, sonra tip tasarımcıları.

Yürüyen iş: **uygulamanın her ekranını sırayla gözden geçirip tasarımını
yeniden yapmak.** Yaklaşık 40 ekran var.

## 2. Kullanıcının koyduğu protokol — buna harfiyen uy

> "tüm ekranları sırasıyla bana göstermeni istiyorum, devam et dersem bir
> sonraki ekrana geç. eğer devam et yerine ekranda düzenlemesini isteyeceğim
> bir şey istersem o ekranda kalacağız ve devam et diyene kadar düzenleyeceğiz"

Yani:
1. Sıradaki ekranı **tarayıcıda aç ve kullanıcıya göster**.
2. "devam et" → bir sonraki ekrana geç.
3. Başka bir şey → o ekranda kal, isteneni yap, tekrar göster. "devam et"
   diyene kadar ekranı bırakma.

Her ekranda tekrar eden talimat: *"bu modalın tasarımını düzelt, ui ve ux
kusursuz olmalı."*

## 3. Değişmez kurallar

| Kural | Ayrıntı |
|---|---|
| **Push izni** | *"ben sana pushla demediğim sürece pushlama."* Commit serbest, push **sadece açık talimatla**. Bu notun yazıldığı an bir push izni verildi ve kullanıldı; **o izin tek seferlikti, bir sonraki push için yeniden sormak gerekir.** |
| **Git kimliği** | Repo-local: `samedcetin <samed004@gmail.com>`. Değiştirme. |
| **Tasarım dili** | `.claude/skills/glyphr-design/SKILL.md` — `glyphr_studio_2/` altındaki tüm UI/CSS işini bu yönetir. İşe başlamadan oku. |
| **Marketing sitesi tasarım hafızası bu araca uygulanmaz.** | Bluerain marketing sitesinin tasarım taban çubuğu ayrı bir üründür; buraya karıştırma. |
| **Prob alırken veri bozma** | Tarayıcıda ölçüm yaparken veri değiştiren komut çalıştırma; mümkün olan her yerde konsol yerine uygulamanın kendi arayüzünü sür. |
| **Commit ritmi** | Ekran başına bir commit. Mesaj gövdesi *neyin* değil *neden*in anlatıldığı düzyazı — `git log` içindeki son 25 commit örnek. |

## 4. Nerede kaldık

**33 / ~40 tamamlandı.** Son biten ekran: **Cross-project actions**.

Bu oturumda (24→33) bitenler ve commit'leri:

| # | Ekran | Commit |
|---|---|---|
| 24 | Seçici dialoglar (choose other item) | `5530157` |
| 25 | Global actions kapsam seçici | `9ad1463` |
| 26 | Unicode blok seçici | `41ad8be`, `2b9a3b6` |
| 27 | Karakter aralığı editörü | `f10c5a2`, `137d203` |
| 28 | Karakter aralığı silme | `bd0b26c` |
| 29 | PANOSE kurucu | `ab05acf`, `b2be0ca`, `a9cf7ee` |
| 30 | Atlas Export | `a05592a`, `3ef8aa3`, `df92239`, `57554ff`, `64def96` |
| 31 | Icon font dialogları | `1523dcc`, `1f0c10c` |
| 32 | Anchors compose dialogu | `c777e99` |
| 33 | **Cross-project actions** | `d43bc19` |

### Sırada bekleyen ekranlar (34→40+)

Kesin sıra kullanıcıyla belirlenecek; elimizdeki liste:

- Komut paleti (command palette)
- Klavye kısayolları sayfası
- Bağlam menüsü (context menu)
- Rail menüleri / hızlı eylemler
- Toast
- Hata paneli
- Notation
- Tooltip
- Info bubble
- Pop-out canlı önizleme penceresi
- Açılış ekranı (boot splash)

> `9971712` "Give the crash screen a design of its own" commit'i walkthrough
> başlamadan önce atıldı. Crash screen'in ayrıca gözden geçirilip
> geçirilmeyeceğini **kullanıcıya sor**, varsayma.

---

## 5. Ekran 33 hakkında bilinmesi gerekenler

Görünen kusur düzeltildi ama **altında duran hatalar düzeltilmedi.**

### Düzeltilen (commit `d43bc19`)

Sayfa zeminini tema-değişmez primitive'lerle sabitliyor (`--n-90`/`--n-96`),
metnini ise `colors.css`'in `-l##` rampalarından alıyordu. O rampalar temalar
arasında **ters çevriliyor** (`--l90`: açıkta %88, koyuda %16). Sonuç: koyu
temada gövde metni kendi zeminine karşı **1.16:1** — okunamaz. Aynı anda
`--blue-l15` ters yöne dönüp %85'e çıktığı için çizgiler neredeyse beyazdı.
`theme.js` varsayılanı `system`, yani koyu OS kullanan herkesin ilk gördüğü
hâli buydu.

`tokens.css:426` bu id'ye zaten kalıcı-koyu bir token bloğu veriyor; hiçbir şey
onu okumuyordu. Artık okuyor. Ölçülen: **1.16:1 → 16.22:1**, iki temada birebir
aynı.

### Düzeltilmeyen — 71 doğrulanmış bulgu

Ekran için 87 ajanlık düşmanca denetim çalıştırıldı (4 boyut: renk/tema,
hatalar, UX, yapı), **71 bulgu doğrulandı**. Renk katmanı dışındakiler duruyor.
En ciddileri — hepsi `src/app/cross_project_actions/` altında:

- **`addComponents` yeni component ID'sini yanlış projeden üretiyor.** Hedefteki
  component'leri sessizce üzerine yazabiliyor ve geri alma onları kurtaramıyor.
- **History kaydı yanlış projeyi anlık görüntülüyor.** Proje geçişinden (flip)
  sonra hedef değil *seçili* proje snapshot'lanıyor; geri alma yanlış projeyi
  geri yüklüyor.
- **`updateSelectedIDs` → `splice(indexOf(id), 1)`, `-1` kontrolü yok.**
  Toggle-all kutusunun `item-id`'si olmadığı için listedeki **son kaydı siliyor**.
  (Aynı hata aralık dialogunda da vardı, orada düzeltildi.)
- **Aralık değişince seçim sıfırlanmıyor** — göremediğin öğeler işleme girebiliyor.
- **Em'e ölçekleme bozuk**: advance-width farkını bounding-box parametresine
  besliyor ve `advanceWidth`'i hiç ölçeklemiyor. Em oranı yüzdesi de iki yönde
  de yanlış ifade ediliyor.
- **İki yıkıcı aksiyonun onay adımı yok.**
- `copyShapes`, history çiftinin *içinde* hedef öğeleri zorla yaratıyor →
  geri alma atomik değil.
- `overwriteItems`, kaynak projeyle **paylaşılan mutable state** taşıyan glyph
  ekliyor (`usedIn`, `gsub` dizileri).
- Aralık seçici kendi `updateHandler`'ını yok sayıp beş aksiyonun hepsi için
  `updateCharacterCopyTable` çağırıyor.
- Beş aksiyon dosyası satır bazında aynı satır kurucusunu, toggle-all bloğunu,
  guard'ı ve commit sırasını tekrarlıyor.
- Erişilemeyen bir 'Merge two projects' dalı var.

**Cevap geldi (16 Eyl 2026): "düzelt".** Ekran baştan kuruldu — veri katmanı
(`selection.js`, `transfer.js`, `actions.js`, `item_table.js`) ve sayfa
(`cross_project_actions.js`, `cross-project.css`); beş aksiyon dosyası silindi.
Yukarıdaki bulguların hepsi kapandı: seçim `Set`, component ID'si hedef projede
sayılıyor (`makeComponentID(components)`), `History` kendi editörüne bağlı
(`new History(owner)`), em ölçekleme `scaleGlyphInPlace` + advance, kopya
`save()`/JSON ile derin, iki yıkıcı aksiyon yerinde iki adımlı onay soruyor,
aynı üyeli kern grubu atlanıyor, yeni yaratılan hedef öğe kaynağın advance'ini
alıyor. 16 test `cross_project_actions/tests/transfer.test.js` içinde.

---

## 6. Ekranlardan bağımsız, raporlanmış ama düzeltilmemiş

Kullanıcıya bildirildi, kararı onda:

1. **Dialogların focus trap'i yok.** `.showModal()` hiçbir yerde
   çağrılmıyor — `<dialog>` `display: block` ile zorla görünür kılınıyor. 19
   `showModalDialog()` çağrı noktası etkileniyor. Top layer yok, `::backdrop`
   yok, focus trap yok.
2. **Escape her zaman çalışmıyor.** Global Escape handler'ı `initEventHandlers`
   tarafından, ancak bir edit canvas kurulduğunda takılıyor. Temiz bir oturumda
   doğrudan Settings'e gidersen Escape hiçbir dialogu kapatmıyor.
3. **"It is saved in this browser as you work" ifadesi yeni projede yanlış.**
   Yeni proje localStorage'a ancak ilk `history.addState()` ile yazılıyor; ilk
   düzenlemeye kadar cümle doğru değil.

---

## 7. Çalışma ortamı

```bash
npm run dev
```

Vite dev sunucusu — bu makinede `http://localhost:5180`.

```bash
npx vitest run
```

**930/930 geçiyor.** Bu sayı boyunca korundu; düşerse bir şey kırılmıştır.

### Ekran 33'e ulaşma adımları (iki proje gerektirir)

1. Hub → "Create a new font" → isim ver → "Create font"
2. Projects menüsü → "Open a second project" → örnek font seç (Oblegg dolu bir
   font, tablo testi için iyi)
3. Projects menüsü → "Cross-project actions"
4. Üstteki dropdown'dan bir aksiyon seç

> **Dikkat:** JS dosyası düzenlemek Vite'ta tam reload tetikler ve bellekteki
> iki proje uçar; bu 8 adımı yeniden yapman gerekir. CSS düzenlemesi HMR ile
> geçer, proje kaybolmaz.

---

## 8. Tekrar tekrar canımızı yakan tuzaklar

Bunlar koddan okunmuyor; her biri bu iş sırasında bedel ödetti.

- **`makeElement()` varsayılan olarak `<span>` üretir.** `content:` / `innerHTML:`
  **innerHTML** set eder, textContent değil.
- **`resets.css` evrensel kuralları sınıf kalıtımını yener**: `* { font-size:
  var(--fs-md); font-weight: var(--fw-normal) }` ve `* { text-align: left }`.
  Tek başına bir sınıf kaybeder — `.modal-dialog__body` ile prefiksle.
- **`showError()` ilk iş `closeEveryTypeOfDialog()` çağırır.** Dialog içi
  doğrulamada kullanırsan formu yok eder. Asla kullanma.
- **`[hidden]` elemanı grid'den tamamen çıkarır.** Grid yerleşimini açıkça
  belirtmezsen gizli parçalar kalanları bir satır yukarı kaydırır.
- **Yazmadan önce her `var(--x)` için bir `--x:` tanımı olduğunu grep'le
  doğrula.** Yanlış yazılmış bir custom property tarayıcıda, build'de ve
  review'da görünmez. (`--n-85` diye bir şey yok; `--n-84` var.)
- **Vite bazen CSS modülünü bayat bırakır.** Dosyayı truncate edip append
  edersen watcher ikisini birleştirip ara hâlde bırakabiliyor.
  `document.styleSheets[n].cssRules.length` ile kural sayısını doğrula; şüphe
  varsa dosyayı tek seferde baştan yaz.
- **Tarayıcı panelinde `computer key "Return"` boş `event.key` üretir** —
  `"Enter"` kullan.
- **Shell quoting**: `node -e` içinde backtick, JS'te üç tırnak, heredoc içinde
  kesme işareti — hepsi kırdı. Büyük blokları Write/Edit ile yaz, küçük
  değişimlerde `sub(a,b)` yardımcısı ve `\x27` kaçışı kullan.
- **Bir dosyayı yeniden yazarken ağacın tamamını grep'le.** Atlas yeniden
  yazımında silinen sınıflar başka iki dialogun düzenini götürdü; hata sadece
  atlas dosyalarının içinde arandığı için kaçtı.
- **`option-chooser` host'u odaklanabilir değildir** ve `<label for>` ile
  adlandırılamaz. Odak için kontrolün kendi `focus()` metodunu kullan,
  adlandırma için `aria-labelledby`.

## 9. Bu iş sırasında oluşan paylaşılan altyapı

Yeni ekran yaparken önce bunlara bak — çoğu zaten var:

- **`dialogs.css`** ortak sözlüğü: `.dialog-checklist`, `.dialog-picker`,
  `.dialog-picklist`, `.dialog-search`, `.dialog-charwall`, `.dialog-form`,
  `.dialog-info`, `.dialog-select`, `.dialog-textarea`, `.dialog-number`,
  `.dialog-field-row`, `.dialog-span-row`, `.panose__*`.
- **Dialog kontrol standardı**: dialog içindeki select/number → **40px yükseklik,
  `--r-lg` (12) radius, şeffaf zemin, metin hairline'ın içinden 12px içeride**
  (yani radius kadar). `.dialog-select` bunu hazır veriyor.
- **`option-chooser`** artık altı çağrı-noktası override'ı okuyor:
  `--option-chooser-h`, `--option-chooser-radius`, `--option-chooser-pad-x`,
  `--option-chooser-bg`, `--option-chooser-font`, `--option-chooser-font-size`.
  Ayrıca `selected-note` (kutunun sağ ucunda duran bilgi) ve bir `focus()`
  metodu kazandı.
- **`showModalDialog(contentNode, maxWidth, { title, subtitle, actions })`** —
  başlık, kayan gövde ve sabit alt bar veren ortak çerçeve. Yeni dialog bunun
  üstüne kurulur, kendi çerçevesini çizmez.
