# NeonKick — Proje Durum Notu (25 Ekim 2026, 19:30)

Bu notu yeni bir sohbete yapıştırırsan kaldığımız yerden devam edebilirim.

## 26 Ekim 00:45 — YAYINDA
- **Canlı sunucu:** https://neonkick.onrender.com (Render free, Blueprint "neonkick", otomatik dağıtım: `main`e push → yeniden dağıtılır). Ücretsiz katmanda disk yok: data.json her dağıtımda sıfırlanır.
- **GitHub:** https://github.com/fitzyfortnite/neonkick (public; Actions macOS makinesi ücretsiz olsun diye). Secret'lar: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8. Değişken: SERVER_URL=https://neonkick.onrender.com.
- **Apple:** Bundle ID com.lyfestudios.neonkick (Team S3SMBYR9FZ); App Store Connect uygulaması "NeonKick: 3D Arena Football" (id 6826929820, SKU neonkick).
- **TestFlight:** İş akışı "iOS -> TestFlight" çalıştırma #2 başarılı (3 dk) → Build 1.0.0 (102) yüklendi. İç test grubu "NeonKick Test", tester: hesap sahibi. Yeni sürüm: Actions → Run workflow.
- Güvenlik notu: API anahtarı sohbete ekran görüntüsü olarak paylaşıldı; App Store Connect'te iptal edip yenisini oluşturup 3 secret'ı güncellemek önerilir.

## 19:30 — Sunucu kullanıcının PC'sine kuruldu (bilgisayar devralma ile)
- Konum: `C:\Users\pc\Desktop\Yeni klasör` → `start.bat`, `server.js`, `tinyws.js`, `sim.js`, `index.html` (tek klasör düzeni; server.js `public/` yoksa kendi klasöründen servis eder). Klasörde kullanıcının 78 video dosyası da var; oyun dosyaları ayrı bir klasöre taşınabilir (hepsi birlikte taşınmalı).
- `start.bat` çift tıklanınca Windows Terminal'de açılıyor: "NeonKick sunucusu hazır → http://localhost:8080 · Telefondan (aynı Wi-Fi): http://192.168.1.102:8080".
- Doğrulandı: yerleşik tarayıcıda açılış/lobi/çevrimiçi durumu; iki istemci (localhost + 127.0.0.1) ile dereceli 1v1 eşleşmesi, hareket/istemci tahmini (fark 0.02 br), ayrılma cezası. Sunucu `data` (data.json) dosyasını oluşturdu; test takma adları `TestOyuncu`, `TestRakip` kayıtlı (sıfırlamak için data.json silinebilir).
- Kalan: Render/GitHub dağıtımı ve TestFlight kullanıcının hesaplarıyla yapılacak (README'de adımlar).

## Ne var
- **Oyun:** Kuş bakışı 3D arena futbolu (Three.js r160 + WebGL). Yayınlanmış artifact: https://claude.ai/artifact/XgPxAPgYTBCZjHQFjk4Bre (sadece bot modu; artifact sayfası WebSocket açamaz).
- **Online sürüm:** `neonkick-server.zip` → `node server.js` → http://localhost:8080 (bağımlılık yok, Node 18+). Dereceli 1v1/2v2 eşleştirme, oda kodlu özel maç, arkadaş daveti, kalıcı takma ad, rank puanı sunucuda. Render.com'a ücretsiz yüklenebilir (README içinde).
- **Kaynak düzeni (geliştirme ortamında):** `golkafa/src/part1.html` (CSS+HTML), `part2.js` (kayıt, tablolar, ses, 3D sahne, karakter), `part2b.js` (müzik sequencer), `i18n.js` (EN/TR sözlük), `part3.js` (oyun mantığı/UI), `sim.js` (ortak fizik, sunucuda da kullanılır), `server/server.js` + `tinyws.js`. `python3 src/build.py` → `artifact.html` + `server/public/index.html`.

## Tamamlanan özellikler
Takma ad (sunucuda tekil), açılış (Oyna/Ayarlar), lobi (3D karakter podyumda), mod seçimi (dereceli 1v1/2v2, bota karşı 1v1/2v2, özel maç; telefonda ok tuşlu tek kart), mağaza (8 krampon, 9 gol efekti, 3 stadyum, 5 gerçek-para altın paketi — ödeme TEST modunda, Stripe/Play/StoreKit bağlanacak yer `PAY.buy`), Battle Pass (30 kademe, ücretsiz+premium), yetenek ağacı (5/10/15/20/25/30 seviye, prestij), rank simgeleri (6 rank, SVG), günlük giriş bonusu (7 gün), reklam simülasyonu (+40 altın), arkadaş listesi/davet, quick chat (sol üst, 5 satır; mobilde 💬 düğmesi), maç HUD, 3-2-1 sayım + ışık + düdük, gol efektleri, LED skor ekranı, sonuç ekranı (XP çubuğu, parlayan LEVEL UP), ayarlar (ses, müzik, dil EN/TR, takma ad değiştirme, HUD düzenleyici sürükle-bırak, tuş boyutu, koş tuşu dokun/basılı, bloom, sunucu adresi, bildirim), maçtan ayrılma onayı (derecelide -20 RP), mobil: dinamik joystick, tuşlar arası parmak kaydırma, otomatik çözünürlük (55 fps altı düşer, 110 üstü yükselir), dikeyde "telefonu çevir".

## 19:10 turu
- Tüm müzikler yeniden (synthwave): maç 132 BPM supersaw akorlar + sidechain pad + iki kanca (A/B), lobi 86 BPM elektro piyano + pluck; galibiyet/mağlubiyet kısa jingle'ları.
- 2v2 kamera yakınlaştırıldı (H 33.5 / D 16.5), kamera takibi hızlandı.
- Mobil performans: cam duvar transmission kaldırıldı (sahneyi 2 kez çizdiriyordu), gölge 1024, 4 projektör, yarı çözünürlük bloom, seyirci %55, DPR ≤2, otomatik kalite tabanı 1.25; HUD DOM yazımları sadece değişince.
- Gecikme hissi: ivme 11→18, şut bekleme .42→.3 s, online'da 60 Hz giriş + kendi oyuncu için istemci tahmini + top için ölü hesap.
- Sunucu mesajları anahtarlı (çeviri uyumlu). Dağıtım: render.yaml, Dockerfile, fly.toml; `mobile/` Capacitor iOS iskeleti (server.url'yi Render adresiyle değiştir → `npx cap add ios` → Xcode Archive → TestFlight).

## Önceki tur (05:05)
- Tuş sesi yumuşatıldı, şut anında çıkıyor (şarj kaldırıldı; sim'de `charge` parametresi duruyor), çoklu dokunma/kaydırma, tam piksel yoğunluğu.
- Grafik: SMAA, çim dokusu, ağlı kaleler, koltuklu tribün + çatı, kontur çizgili karakter (forma numarası, yüz, saç stilleri), halo'lu projektörler, vinyet.
- Müzik: maçta 128 BPM arena marşı (supersaw stab, el çırpma, kanca); lobide 84 BPM elektro piyano + pad. Reverb ve delay var.
- Düzeltilen hata: sert çarpışmada karakter kaybolması (stun anında 0/0 → NaN).

## Bilinen eksikler / sonraki adımlar
- Gerçek ödeme (Stripe) ve gerçek reklam ağı (AdMob/AdSense) bağlanmadı; yerleri hazır.
- Altın/eşya/XP tarayıcıda (localStorage) tutuluyor → hileye açık; sunucuya taşınmalı (sunucu sadece takma ad + rank + galibiyet sayısı tutuyor).
- Push bildirimi sadece tarayıcı bildirimi; mobil push için Firebase gerekir.
- Online maçta istemci tahmini yok (sunucu yetkili, 30 Hz); yüksek ping'de gecikme hissedilir.
- Fiyatlar ve paket içerikleri örnek değerler.
- Kullanıcının son eleştirisi: müzik ve grafik beğenisi değişken; her sürümde gerçek render alıp (headless Chromium + yerel three.js) göndermeden önce kontrol ediyoruz.

## Test düzeneği (geliştirme ortamı)
`/home/claude/mrdoob/three.js` yerel kopya; `scratchpad/live/index.html` yerel test; `shot.py` + `steps.py` Playwright/SwiftShader ile ekran görüntüsü; `music.html` müziği OfflineAudioContext ile WAV'a çevirir.
