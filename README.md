# NeonKick — sunucu + iOS (TestFlight) deposu

Kuş bakışı 3D online arena futbolu. Bu depo üç şeyi içerir:

| Klasör | Ne |
|---|---|
| `server/` | Oyun (`public/index.html`) + online sunucu (`server.js`, bağımlılık yok, Node 18+) |
| `mobile/` | Capacitor iOS sarmalayıcısı (simge/açılış görselleri dahil). `www/` derlemede `server/public`'ten kopyalanır |
| `ci/` + `.github/workflows/` | GitHub Actions'ın **macOS** makinesinde Xcode derlemesi → TestFlight. **Mac gerekmez.** |

---

## 1) Sunucuyu internete aç — Render (ücretsiz)

1. https://dashboard.render.com → **New +** → **Blueprint** → GitHub hesabını bağla → `neonkick` deposunu seç → **Apply**.
   `render.yaml` her şeyi ayarlar (Node 20, `node server.js`, kök klasör `server`).
2. Birkaç dakika sonra adres: `https://neonkick-xxxx.onrender.com`. Tarayıcıda aç, oyna; telefonda yatay çevir.
3. Bu adresi depoya kaydet: **Settings → Secrets and variables → Actions → Variables → New repository variable**
   `SERVER_URL` = `https://neonkick-xxxx.onrender.com` (iOS uygulaması bu sunucuya bağlanır).

Notlar: Ücretsiz katman 15 dk boşta kalınca uyur, ilk giren ~30 sn bekler. Ücretsiz katmanda kalıcı disk yoktur; takma adlar/rank (`data.json`) her yeni dağıtımda sıfırlanır — kalıcı olsun istersen Starter plan + disk (`mountPath: /opt/render/project/src/server/data`) ya da Fly.io.
Alternatif: Docker (`server/Dockerfile`).

## 2) TestFlight — Mac olmadan

Secret'lar `efg-ios-ci` deposundakilerle aynı (App Store Connect API anahtarı):

**Settings → Secrets and variables → Actions → New repository secret**

| Ad | Değer |
|---|---|
| `ASC_KEY_ID` | App Store Connect API Key ID (`AuthKey_XXXX.p8` dosya adındaki XXXX) |
| `ASC_ISSUER_ID` | Issuer ID |
| `ASC_KEY_P8` | `AuthKey_XXXX.p8` dosyasının tüm metni (`-----BEGIN PRIVATE KEY-----` dahil) |

Anahtar yoksa: App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → **+**, erişim **Admin**.

İsteğe bağlı değişkenler (Variables): `TEAM_ID` (varsayılan `S3SMBYR9FZ`), `BUNDLE_ID` (varsayılan `com.lyfestudios.neonkick`), `SERVER_URL`.

**Apple tarafında bir kez (uygulama kaydı):**
1. https://developer.apple.com/account/resources/identifiers/list → **+** → App IDs → App → Description `NeonKick`, Bundle ID **Explicit** `com.lyfestudios.neonkick` → Register.
2. https://appstoreconnect.apple.com/apps → **+** → New App → Platform iOS, Name `NeonKick`, Primary language, Bundle ID `com.lyfestudios.neonkick`, SKU `neonkick` → Create.

**Derleme:** Actions → **iOS -> TestFlight** → *Run workflow* (`server_url` alanına Render adresini yazabilirsin; boşsa `SERVER_URL` değişkeni kullanılır). ~15-25 dk sonra App Store Connect → TestFlight'ta görünür; cihazına TestFlight uygulamasından yükle.

Uygulama yatay (landscape) kilitli, durum çubuğu gizli, tam ekran. Oyun dosyaları uygulamanın içinde; sunucu adresi derlemede gömülür (oyun içi **Ayarlar → Sunucu adresi** ile de değiştirilebilir).

## 3) Yerel test
```
cd server && node server.js      # http://localhost:8080 ; aynı Wi-Fi'daki telefon: http://<ip>:8080
```

## Bağlanacak yerler (yayın öncesi)
- Gerçek para: `PAY.buy` (index.html) → StoreKit / Google Play / Stripe.
- Reklam: `openAd` → AdMob/AdSense.
- Altın/seviye/eşyalar şu an cihazda (localStorage); sunucuya taşınmalı.
- Push bildirimi: Firebase.

Ayrıntılı proje notu: `NOTLAR.md`.
