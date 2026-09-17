# Specimen sheet → font: tasarım kararı

Bir kullanıcı elindeki **raster karakter tablosunu** (AI ile üretilmiş bir font
görseli) yükler; sistem glifleri vektöre çevirir, her birini doğru karakter
yuvasına yerleştirir, kullanıcı uygulamanın zaten desteklediği formatlarda
dışa aktarır.

Kısıt: **harici AI yok.** Her şey deterministik klasik algoritma, tarayıcıda.

Bu belge 7 boyutta tasarım + 14 düşmanca doğrulama + 4 teknik sondajdan
(26 ajan, 130 bulgu, 21'i ölümcül) çıkan kararları taşır.

---

## 1. Kararlar

| Soru | Karar |
|---|---|
| **Dil** | Yalnızca **JavaScript**. Yeni dil yok, sunucu yok, kendi WASM zincirimiz yok. Uygulamanın geri kalanıyla aynı: vanilla ES modülleri, tarayıcıda. |
| **Tracer** | **`esm-potrace-wasm@0.5.1`**. Kendi tracer'ımızı yazmıyoruz. |
| **Tracer girdisi** | Glif kutusu **orijinal görselden 4x büyütülerek** kırpılır, sonra potrace'e verilir. Bu adım pazarlık konusu değil — gerekçesi §4'te. |
| **Çıktı yolu** | potrace'in **tam SVG string'i** → mevcut `ioSVG_convertSVGTagsToGlyph`. `pathonly` seçeneği **bozuk**, kullanılmayacak. |
| **Karakter eşleştirme** | **Bildirilen düzen şablonu + okuma sırası**, bedava geometrik imzalarla *doğrulanır*, sonra **kullanıcı onay ızgarası**. OCR/sınıflandırma birincil yöntem değil. |
| **Ölçek** | Tüm sayfa için **tek global ölçek**, yalnızca büyük harf satırlarından. Satır başına sadece dikey kaydırma. |
| **Boşluklar (spacing)** | Görselden **kurtarılamaz**. Sentezlenir ve arayüzde böyle söylenir. |

---

## 2. Diller ve kütüphaneler

### Dil: JavaScript, başka hiçbir şey

Uygulama tarayıcıda çalışan, sunucusu olmayan bir editör. Pipeline'ın tamamı
istemci tarafında kalmalı; aksi halde kullanıcının font taslağını buluta
yollamış oluruz. Python/OpenCV, sunucu tarafı ImageMagick, kendi WASM
derleme zincirimiz — hepsi bu mimariye yabancı ve hiçbiri gerekli değil.

### Eklenecek tek bağımlılık

**`esm-potrace-wasm@0.5.1`**

```
type: module          → gerçek ESM
exports: ./dist/index.js
dependencies: yok
unpackedSize: 98 KB   → üretim derlemesinde ~31 KB gzip
```

WASM ikili dosyası modülün içine latin-1 string olarak gömülü — ayrı `.wasm`
dosyası, `fetch()` çağrısı, Vite asset kuralı yok. Sondaj bu paketi projenin
kendi Vite'ıyla izole olarak derledi (36 ms, 78.9 KB ham / 31.4 KB gzip),
derlenmiş çıktıyı gerçek tarayıcıda çalıştırdı ve glif izledi.

**Zorunlu seçenekler** — varsayılanlar yanlış:

```js
potrace(imageData, { extractcolors: false, posterizelevel: 1, turdsize: 2 })
```

Varsayılanlarla (`extractcolors` açık, `posterizelevel: 2`) anti-aliased
kenarlar iç içe renk katmanlarına *posterize* ediliyor: kalın bir `B` için
22 `<path>` / 25 kontur — çöp. Yukarıdaki seçeneklerle 1 `<path>` / 3 kontur —
doğru.

Zor vakalar bu ayarlarla özel muamele istemeden doğru çıkıyor:
`A`→2 kontur, `B`→3, `O`→2, `i`→2 path (gövde + nokta), `=`→2 path,
`%`→3 path / 5 kontur.

### Yazacaklarımız (kütüphane değil, ~50-200 satır klasik algoritma)

| Parça | Ne | Neden hazır paket değil |
|---|---|---|
| Otsu eşikleme | ~25 satır | Tek bir histogram taraması |
| Bağlantılı bileşen etiketleme | ~70 satır union-find | Projede 4 bağımlılık var, bilinçli olarak |
| Satır/glif segmentasyonu | projeksiyon profili + x-örtüşme birleştirme | Bu işe özgü, genel paket yok |
| Düzen eşleştirme + doğrulama | hizalama + geometrik imzalar | Bu işe özgü |
| Metrik türetme | taban çizgisi, x-height, cap-height | Bu işe özgü |

### Zaten elimizde olanlar

- `svg-to-bezier` → potrace SVG'sini bezier'e çevirir (**potrace'in
  `<g transform="translate(...) scale(0.1,-0.1)">` dönüşümünü doğru
  uyguluyor** — sondaj doğruladı)
- `src/formats_io/atlas/msdf/contours.js` → işaretli alan, kontur ters
  çevirme, winding normalizasyonu, nonzero point-in-shape
- `src/formats_io/atlas/msdf/bezier.js` → saf kübik matematik
- `src/project_data/segment.js` → de Casteljau bölme, tam kübik bbox
- `src/project_data/poly_segment.js` → `get path()` ile gerçek `Path` üretimi
- `font-flux-js` → OTF/TTF/WOFF yazımı (dışa aktarım zaten çalışıyor)

### Reddedilenler

| Aday | Ret gerekçesi |
|---|---|
| `potrace` (npm 2.1.8) | Node-only, `jimp` bağımlısı, CJS. Sunucusuz tarayıcı uygulaması için yanlış araç. |
| `potrace-wasm` 1.0.4 | CJS, 280 KB emscripten yapıştırıcısı, 2019'dan beri bakımsız. |
| `imagetracerjs` | Lisansı en rahat olanı (public domain) ama **potrace değil**: renk kuantizasyonu + interpolasyonlu poligon uydurma. Gözle görülür köşeli/dalgalı konturlar. Sadakat şartına aykırı. |
| `@image-tracer-ts/core` | `imagetracerjs`'in TypeScript portu. Aynı algoritma, aynı tavan. |
| Kendi tracer'ımızı yazmak | §3'te açıklandı — denetim bunu ölçtü ve düştü. |

---

## 3. İki sondaj çelişti — nasıl çözüldü

Denetimde iki ajan zıt sonuca vardı:

- **Sadakat sondajı:** potrace'i reddet, gri tonlamalı görüntü üzerinde
  *marching squares* + Schneider eğri uydurma yaz. Ölçtüğü şey: ikili
  (binary) maskeden izleme IoU'yu **0.966**'da tavanlıyor; gri tonlama
  izo-konturu **0.9955** veriyor. Fark 0.029 ve bu **tracer'dan önce**
  kaybediliyor.
- **Kütüphane sondajı:** `esm-potrace-wasm` kullan — doğrulanmış, hızlı,
  dikişe birebir oturuyor.

Çelişki gerçek: **potrace ikili bir tracer'dır**, girdiyi eşikler ve
anti-aliasing'i atar.

**Çözüm: potrace'e 4x büyütülmüş kırpma ver.**

Glif kutusunu *orijinal* görselden alıp `drawImage` + `imageSmoothingQuality:
'high'` ile 4x ölçekleyip aynı Otsu eşiğiyle eşiklemek, kenar konumunu
0.25px'lik bir kafese taşır. Kuantizasyon hatası 4 kat düşer — yani ikili
yolun kaybettiği şeyin neredeyse tamamı geri gelir.

Ayrıca kendi tracer'ımızı yazma seçeneğinin ölümcül bir açığı vardı:
denetim, önerilen "Schneider + köşe bölücü" tasarımının **poligon
yaklaştırma fazını atladığını** buldu. İkili bir kontur birim basamaklardan
oluşur; ham köşelerde eğrilik her tepede ±90°'dir. `W`, `V`, `X`, `Z`, `4`,
`7`, `/`, `\` gibi diyagonallerde bu ~120 sahte köşe üretir. potrace'te bu
faz (optimal poligon) zaten var — zaten onun için var.

130x160'lık bir kutu 4x'te 520x640 = 333k piksel; 60 tanesi geçici ve
bedava. Tüm sayfa için tepe bellek 25 MB altında.

---

## 4. "Birebir benzeyecek" — dürüst cevap

Sondaj bunu tartışmadı, **ölçtü**: ağır display glifleri 4x supersample →
AA → izleme → Schneider uydurma zincirinden geçirildi ve sonuç orijinal
vektör konturlarla karşılaştırıldı.

### Elde edilebilen (sayfa ~1772px, glif ~100-140px, cap ~90px)

| Ölçüt | Sonuç |
|---|---|
| Kenar konumu | **0.10px RMS** = 2048 UPM'de **~1.7 font birimi**; en kötü 0.2-0.5px |
| Ağırlık (stem) sapması | ortalama **%0.12**; glif başına ±2-8 birim |
| Topoloji | 17 glifte **0 hata**. Her sayaç (A B D O P Q R a b d e g o p q 0 4 6 8 9) ve her çok parçalı glif (% @ &) doğru kontur sayısıyla döndü. |
| Sayaç kapanma riski | Yok. cap 90px'te en küçük sayaç 13.5px; kapanma ~3px'in altında başlar. |
| JPEG gürültüsü | Genlik 0.10'a kadar stem doğruluğunu neredeyse hiç bozmuyor |

Bu hata ne zaman görünür hale gelir:

| Render boyu | Sapma |
|---|---|
| 16px | 0.018px — görünmez |
| 48px | 0.053px — görünmez |
| 200px | 0.222px — sınırda |
| 400px+ | 0.444px — poster boyunda dalgalanma |

### Elde EDİLEMEYEN — bunları baştan söylemek gerekiyor

1. **Eğri kalitesi.** Düz birleşimlerde göreli eğrilik sıçraması: tasarımcı
   medyanı **0.19**, izlenmiş **0.66** — yaklaşık **3.5x daha tümsekli**.
   Yaylar 2 birim içinde doğru ama dönüş hızı düğümden düğüme kekeliyor.
   Büyük yuvarlak bir kâsede bu, hafif bir düzlük/şişkinlik ritmi olarak
   okunur. **Gerçekten görülecek tek kusur bu, ve sadece display boyunda.**

2. **Düğüm ekonomisi.** Kullanılabilir 0.25px toleransta tasarımcının
   düğüm sayısının **1.73x**'i; iyi biçimli bir fontun gerektirdiği
   ekstremum düğümleri eklendiğinde **2.61x**'i.

3. **Boşluklar.** Görsel; sidebearing, advance width ve kerning hakkında
   **sıfır bilgi** taşır. Bir specimen sayfasındaki boşluklar, o görseli
   üretenin *yerleşim tercihidir*, fontun metriği değil. Bu sentezlenmek
   zorunda — ve "yazılan metin fonta benziyor mu" sorusunu her eğriden
   daha çok bu belirler. **En büyük dürüst kayıt budur.**

4. **Kapsam.** Ekteki sayfada ~86 karakter var ve içinde **ıİğĞşŞçÇöÖüÜ
   yok**. Türkçe bir ürün için bu birinci gün sorunu.

5. **Optik düzeltmeler ve kaynağın kendi tutarsızlığı.** Kaynakta ne varsa
   o kopyalanır, hataları dahil. Specimen AI ile üretildiği için aynı harf
   formunun her seferinde biraz farklı çizilmiş olması, gezinen taban
   çizgileri ve gliften glife %birkaç oynayan stem kalınlıkları
   **yukarıdaki bütün hata paylarından büyük olacaktır** — ölçümler kusursuz
   tutarlı bir kaynağa karşı yapıldı. Tracer, girdisinden daha tutarlı olacak.

### Sonuç

Vaat **"birebir"** değil, **"specimen'e sadık"** olmalı.

### En yüksek kaldıraçlı tek hamle

Hata font birimi cinsinden **çözünürlükle ters orantılı**. RMS piksel
cinsinden sabit (~0.10px), yani:

> Sayfayı 1772px yerine **3500-4000px** genişlikte yeniden üret — her
> geometrik hata yarıya iner (1.7 birim → ~0.85). Bu, hiçbir algoritma
> çalışmasının veremeyeceği bir kazanç ve maliyeti sıfır.

Satır başına ayrı sayfa (ya da 6-8 glifte bir) daha da iyi.

---

## 5. Boru hattı

```
görsel → çöz → gri düzlem → global Otsu
      → bağlantılı bileşenler → satır bantlama → glif gruplama
      → düzen şablonuyla eşleştirme + doğrulama
      → [KULLANICI ONAY IZGARASI]
      → glif başına 4x kırpma → potrace → SVG
      → svg-to-bezier → bezierDataToGlyph → Glyph
      → global ölçek + satır kaydırması + sentetik sidebearing
      → tek history state ile projeye yaz
      → mevcut dışa aktarım yolları
```

### 5.1 Alım ve eşikleme

- `createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })`
- **Gamma uzayında** Rec.709 luma: `(54*R + 183*G + 19*B) >> 8`.
  Linearize **etmeyin** — anti-aliasing sRGB uzayında birleştirildiği için
  %50 kaplama ~128'e düşer; linearize etmek her konturu ~0.15-0.2px dışarı
  kaydırıp bütün stem'leri şişirir.
- **Tek global Otsu**, tüm sayfa için. Glif başına eşikleme ağırlık
  tutarlılığını bozmanın en kolay yolu; global eşik hatası üniformdur ve
  "specimen'den biraz daha kalın/ince" diye okunur.
- Otsu'da argmax **platosunun orta noktasını** alın — sentetik görsellerde
  vadi boş olur, birkaç `t` berabere kalır, ilkini almak mürekkebe doğru
  yanlılık yaratıp her stem'i ~0.3px inceltir.
- Alfa kanalı mürekkep olabilir (şeffaf PNG — Figma/Illustrator varsayılan
  dışa aktarımı). Polarite tespiti (koyu zemin üzerine açık glif) gerekli.

### 5.2 Segmentasyon

- 8-bağlantılı bileşen etiketleme (union-find)
- Yatay projeksiyon profiliyle satır bantlama
- Satır içinde **x-örtüşme + dikey boşluk** kuralıyla parça birleştirme:
  `i`/`j` noktaları, `!`/`?` noktaları, `%`'in üç parçası, `=`'in iki çubuğu,
  `:` `;` ve tırnaklar
- Sayaçlar (delikler) bileşen değil **kontur yuvalanmasıdır** — potrace
  bunu kendi hallediyor, bizim ayrıca birleştirmemize gerek yok

### 5.3 Eşleştirme — işin gerçekten zor kısmı

**Birincil yöntem: bildirilen düzen + okuma sırası.** Sayfanın hangi
karakterleri hangi sırayla içerdiğini kullanıcı bir şablondan seçer
(ya da düzenler). Satır sayısı ve satır başına glif sayısı uyuşuyorsa
eşleştirme **deterministik ve %100 doğrudur**.

**İkincil: bedava geometrik imzalarla doğrulama.** Delik sayısı (Euler
numarası), bileşen sayısı, dikey bant, genişlik sınıfı — hepsi segmentasyondan
bedava çıkar. Bunlar eşleştirmeyi *üretmez*, **uyuşmazlığı işaretler**.

**Üçüncül ve zorunlu: kullanıcı onay ızgarası.** Hiçbir şey projeye
yazılmadan önce kullanıcı ne bulunduğunu görür ve düzeltir.

> Denetimin prototipi harfler ve rakamlarda tam isabet yaptı; **noktalama
> satırında 23 beklenene karşı 13 glif buldu.** Satır 6 gerçek sorun
> alanıdır ve orada kullanıcı onayı zorunludur.

---

## 6. Denetimin bulduğu tuzaklar — bunlar plana gömülü olmalı

Bunlar "dikkat edilecek şeyler" değil; her biri ölçülmüş ya da kodda
doğrulanmış somut hatalar. Kodu yazan bunları bilmeden başlarsa aynı
duvarlara çarpar.

1. **`Segment` yapıcısı `false`'u 0'a çevirir.**
   `src/project_data/segment.js:61-65` yalnızca `undefined`'ı özel durum
   sayıyor; dikişin bezier formatındaki literal `false` → `parseNumber(false)`
   = 0, iki kontrol noktasını da orijine park ediyor. Doğrulandı:
   `new Segment({p1x:10,p1y:10,p2x:false,...,p4x:50,p4y:10})` → maxes
   `xMin:4.77` (doğrusu 10). **Segment'leri elle kurmayın**, `Path`'i
   `ioSVG_convertSVGTagsToGlyph`'in kullandığı yürüyüşten geçirin.

2. **Winding: dışa aktarım hiçbir normalizasyon yapmıyor.**
   `font_export.js`'teki `glyphToContours`/`pathToContour`, `Path`'in
   noktalarını saklandığı sırayla FontFlux'a veriyor. Görüntü y-aşağı, font
   uzayı y-yukarı; bu çevirme her winding'in işaretini ters çevirir. Görüntü
   uzayında verilen bir parite kararı **her sayacı dolu olarak dışa aktarır.**
   Konvansiyonu **font uzayında** sabitleyin ve assert edin. Uygulamanın
   canlı konvansiyonu: dolu kontur **saat yönünde** (negatif `Path.winding`),
   sayaçlar tersi, `nonzero` dolgu.

3. **Sayaç/delik kararı işaretli alandan çıkmaz.** İşaretli alan yalnızca
   konturun hangi yönde gezildiğini söyler, sayaç mı yoksa ayrık ikinci bir
   dış kontur mu olduğunu değil. `%` 5 kontur, `i` ve `!` 2 **ayrık dış**
   kontur taşır. Winding atamasından önce açık bir **içerme (containment)**
   testi gerekir.

4. **Ölçek: satır başına cap normalizasyonu yanlış.**
   `a = capHeightEm / (baselineY - capTopY)` formülünün 6 satırın 4'ünde
   geçerli girdisi yok — sadece satır 1-2'de gerçek cap yüksekliği var.
   Satır 3 (a-m, ascender'lı) ~0.96em, satır 4 (n-z) ~0.81em kaplar; her
   satırı kendi mürekkep yüksekliğine göre esnetmek **satır başına farklı
   ölçek** üretir. **Tüm sayfa için tek ölçek, yalnızca büyük harf
   satırlarından.** Satır başına sadece dikey offset.

5. **Taban çizgisi satırın mürekkep dibi değildir.** Satır 3 `a-m` içinde
   `g` ve `j` iniyor. Taban çizgisini, şablonun zaten bildirdiği karakter
   sınıflarından (cap / x-height / ascender / descender) türetin.

6. **Overshoot'u bant sınıflandırmasıyla ezmeyin.** Yuvarlak harfler nominal
   yüksekliğini %1.5-2.5 aşar. "Modal kutu, üstündeki her şey ascender"
   kuralı `C`, `G`, `O`, `Q`, `S`'yi yanlış sınıflandırıp tamamen doğru bir
   sayfada sahte uyarı seli üretir. 1-B boşluk kümelemesi kullanın:
   overshoot %2 boşluk bırakır, gerçek ascender çok daha fazlasını.

7. **`addItemByType` çakışma kontrolü yapmıyor.**
   `glyphr_studio_project.js:400-433` mevcut glifi kontrol etmeden
   `destination[newID] = newItem` yazıyor. Elle çizilmiş 20 glifi olan bir
   kullanıcı sayfa yükleyip "İçe aktar" derse **20 glif uyarısız yok olur.**
   İçe aktarımdan önce yeni/çakışan ayrımı yapın ve sayıyı kullanıcıya
   gösterin.

8. **Escape ve arka plan tıklaması onaysız yok eder.**
   `events_keyboard.js:61` Escape'i `isFocusedOnInput()` kontrolünden *önce*
   yakalayıp `closeEveryTypeOfDialog()` çağırıyor; `makeModalDialog` da
   `#modal-dialog` üzerine tıklamayı aynı yere bağlıyor. Kullanıcı onay
   ızgarasında 40 hücre düzelttikten sonra tooltip kapatmak için Escape'e
   basarsa hepsi gider. Her iki yolu da kapatma düğmesiyle **aynı koruma**
   üzerinden geçirin.

9. **Tek history state.** Toplu içe aktarım tek bir geri alma adımı olmalı,
   glif başına bir tane değil.

10. **`validate_file_input.js`'i kullanmayın.** Modül seviyesinde paylaşılan
    değişken state tutuyor (`validationResult`, `postValidationCallback`);
    yavaş bir görsel çözümlemesi uçuştaki bir font doğrulamasıyla yarışırsa
    onu ezer. Oraya sadece **ret metnini** ekleyin ("görseller specimen
    penceresinden içe aktarılır"), akışı ayrı tutun.

11. **Bezier üretmeden önce `bezierDataToGlyph()` ayrımını yapın.**
    `svg_outline_import.js` şu an tek bir fonksiyon; bezier→Glyph yarısı
    dışarıdan çağrılabilir değil. Bu ayrım davranış koruyucu ve en ucuz
    entegrasyon. Dosyanın `tests/` altında testleri var — ayrım onlarla
    doğrulanır.

---

## 7. Modül yerleşimi

```
src/formats_io/specimen/
  image_ingest.js       decode, gri düzlem, polarite, Otsu
  segment_sheet.js      bağlantılı bileşenler, satır bantlama, glif gruplama
  layout_templates.js   hazır karakter dizileri + kullanıcı düzenlemesi
  assign_glyphs.js      düzen eşleştirme + geometrik doğrulama
  trace_glyph.js        4x kırpma → potrace → SVG → bezier
  sheet_metrics.js      taban çizgisi, cap/x-height, global ölçek, sidebearing
  import_sheet.js       Glyph üretimi, çakışma ayrımı, tek history state
  specimen_dialog.js    yükleme + onay ızgarası (glyphr-design skill'ine tabi)
  specimen.css
  tests/
```

`svg_outline_import.js` içinde tek değişiklik: bezier→Glyph yarısını
`bezierDataToGlyph(bezierData, projectUPM)` olarak dışa aktarmak.

Dışa aktarım tarafında **hiçbir değişiklik yok** — `font_export.js`,
`svg_font_export.js` ve atlas yolları traced glifleri diğerlerinden ayırt
etmez.

### Test stratejisi

jsdom'da gerçek canvas yok (`vi-canvas-mock` dev bağımlılığı var ama
`getImageData` bir stub). Bu yüzden **her piksel fonksiyonu
`(typedArray, w, h, options) -> typedArray` imzasıyla, DOM'suz yazılmalı** —
`msdf/contours.js`'in zaten yazıldığı gibi. O zaman sentetik bitmap'lerle
test edilebilir, canvas'a ihtiyaç duymaz ve ileride Worker'a taşımak bedava
olur.

---

## 8. Fazlar

| Faz | İçerik | Çıktı |
|---|---|---|
| **0** | `bezierDataToGlyph()` ayrımı + testleri | Dikiş açık, davranış değişmedi |
| **1** | Alım + Otsu + segmentasyon, görsel debug overlay'i ile | Sayfadaki kutuları doğru buluyor muyuz |
| **2** | 4x kırpma + potrace + bezier → tek glif içe aktarımı | Tek harf projeye doğru giriyor |
| **3** | Düzen şablonu + eşleştirme + doğrulama | Tüm sayfa doğru yuvalara |
| **4** | Metrikler: global ölçek, taban çizgisi, sentetik sidebearing | Yazılan metin düzgün duruyor |
| **5** | Onay ızgarası dialogu, çakışma uyarısı, tek history state | Kullanıcıya verilebilir |
| **6** | Noktalama satırı iyileştirmeleri, tolerans ayarı | Satır 6 sorunu |

Faz 2'nin sonunda **ekteki gerçek sayfayla** ölçüm yapılmalı; buradaki bütün
sayılar Arial Black'e karşı ölçüldü, gerçek specimen'e karşı değil.

---

## 9. Karar bekleyen konular

1. **Lisans.** npm `esm-potrace-wasm` için SPDX'i **`GPL-2.0`** olarak
   veriyor. Katı okumayla GPL-2.0-only, GPL-3.0 ile **birleştirilemez**.
   Upstream potrace kesin olarak GPL-2.0-**or-later**'dır ve paketin içindeki
   LICENSE dosyasının "or later" kalıbını taşıdığı bildirildi — ama bu
   **tarball'daki gerçek LICENSE dosyasından doğrulanmalı**, npm alanından
   değil. Sorun yoksa: proje zaten GPL-3.0-or-later, uyumlu. Ama bu karar,
   ileride Glyva'yı kapalı kaynak ya da çift lisanslı yayınlama ihtimalini
   kapatır (o durumda Icosasoft'tan ticari Potrace lisansı gerekir).

2. **"Potrace" adı Peter Selinger'in ticari markasıdır.** Özelliği bu adla
   adlandırmayın; krediler ekranında anın (GPL zaten bildirimi korumayı
   şart koşuyor).

3. **Daha büyük specimen.** 3500-4000px'e çıkmak her geometrik hatayı
   yarıya indirir. Bu kullanıcıdan istenecek en değerli şey.

4. **Türkçe karakterler.** Ekteki sayfada ıİğĞşŞçÇöÖüÜ yok. Şablona ikinci
   bir satır eklenmeli ya da ayrı bir sayfa yüklenebilmeli.
