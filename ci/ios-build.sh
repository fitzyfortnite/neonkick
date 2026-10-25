#!/usr/bin/env bash
# NeonKick — iOS derleme + TestFlight yükleme (GitHub Actions macOS makinesinde çalışır, Mac gerekmez).
# Yöntem efg-ios-ci ile aynı: arşiv imzasız alınır, ad-hoc imzalanır, -exportArchive Apple'ın bulut imzasıyla
# (App Store Connect API anahtarı) yeniden imzalayıp App Store Connect'e yükler.
#
# Gerekli env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (App Store Connect API anahtarı, rol Admin)
# İsteğe bağlı: TEAM_ID, BUNDLE_ID, APP_NAME, APP_VERSION, BUILD_NUMBER, SERVER_URL (https://… Render adresi)
set -euo pipefail
TEAM_ID="${TEAM_ID:-S3SMBYR9FZ}"
BUNDLE_ID="${BUNDLE_ID:-com.lyfestudios.neonkick}"
APP_NAME="${APP_NAME:-NeonKick}"
APP_VERSION="${APP_VERSION:-1.0.0}"
BUILD_NUMBER="${BUILD_NUMBER:-$((100 + ${GITHUB_RUN_NUMBER:-0}))}"
SERVER_URL="${SERVER_URL:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${RUNNER_TEMP:-/tmp}/neonkick"
LOGS="$ROOT/logs"
mkdir -p "$WORK" "$LOGS"
PB=/usr/libexec/PlistBuddy

echo "== Xcode"
XC=$(ls -d /Applications/Xcode_26*.app 2>/dev/null | sort -V | tail -1 || true)
if [ -n "$XC" ]; then sudo xcode-select -s "$XC/Contents/Developer"; fi
xcodebuild -version
node -v; npm -v; pod --version

echo "== web (www = server/public)"
cd "$ROOT/mobile"
rm -rf www && cp -R ../server/public www
if [ -n "$SERVER_URL" ]; then
  # Uygulama hangi sunucuya bağlanacak: https://… → wss://… (oyun içi Ayarlar'dan da değiştirilebilir)
  WS_URL="$(printf '%s' "$SERVER_URL" | sed -E 's#^https://#wss://#; s#^http://#ws://#; s#/+$##')"
  python3 - "$WS_URL" <<'PY'
import sys, re
p = 'www/index.html'; s = open(p, encoding='utf-8').read()
s2 = re.sub(r'<meta name="nk-server" content="[^"]*">', '<meta name="nk-server" content="%s">' % sys.argv[1], s, count=1)
assert s2 != s, 'nk-server meta not found'
open(p, 'w', encoding='utf-8').write(s2); print('server url ->', sys.argv[1])
PY
else
  echo "::warning::SERVER_URL boş: uygulama yalnızca bota karşı oynanır (Ayarlar > Sunucu adresi ile sonradan girilebilir)."
fi
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('capacitor.config.json'));c.appId=process.env.BUNDLE_ID;c.appName=process.env.APP_NAME;fs.writeFileSync('capacitor.config.json',JSON.stringify(c,null,2))"
cat capacitor.config.json

echo "== npm"
npm install --no-audit --no-fund 2>&1 | tail -3

echo "== capacitor ios"
[ -d ios ] || npx cap add ios 2>&1 | tail -5
npx @capacitor/assets generate --ios --iconBackgroundColor '#070a14' --iconBackgroundColorDark '#070a14' --splashBackgroundColor '#070a14' --splashBackgroundColorDark '#070a14' 2>&1 | tail -3 || echo "::warning::assets generate failed (default icon kept)"
npx cap sync ios 2>&1 | tee "$LOGS/cap-sync.log" | tail -5

cd ios/App
PLIST="App/Info.plist"
echo "== Info.plist"
set_plist() { "$PB" -c "Set :$1 $2" "$PLIST" 2>/dev/null || "$PB" -c "Add :$1 $3 $2" "$PLIST"; }
set_plist CFBundleDisplayName "$APP_NAME" string
set_plist CFBundleShortVersionString "$APP_VERSION" string
set_plist CFBundleVersion "$BUILD_NUMBER" string
set_plist ITSAppUsesNonExemptEncryption false bool
set_plist UIRequiresFullScreen true bool
set_plist UIStatusBarHidden true bool
set_plist UIViewControllerBasedStatusBarAppearance false bool
for key in UISupportedInterfaceOrientations "UISupportedInterfaceOrientations~ipad"; do
  "$PB" -c "Delete :$key" "$PLIST" 2>/dev/null || true
  "$PB" -c "Add :$key array" "$PLIST"
  "$PB" -c "Add :$key:0 string UIInterfaceOrientationLandscapeLeft" "$PLIST"
  "$PB" -c "Add :$key:1 string UIInterfaceOrientationLandscapeRight" "$PLIST"
done
"$PB" -c "Print" "$PLIST" | grep -E "CFBundle(DisplayName|ShortVersionString|Version)|Landscape|NonExempt" || true

echo "== team / bundle id"
PBX="App.xcodeproj/project.pbxproj"
sed -i '' -E "s/PRODUCT_BUNDLE_IDENTIFIER = [^;]*;/PRODUCT_BUNDLE_IDENTIFIER = $BUNDLE_ID;/g" "$PBX"
if grep -q "DEVELOPMENT_TEAM" "$PBX"; then
  sed -i '' -E "s/DEVELOPMENT_TEAM = [^;]*;/DEVELOPMENT_TEAM = $TEAM_ID;/g" "$PBX"
else
  BUNDLE_ID="$BUNDLE_ID" TEAM_ID="$TEAM_ID" perl -0pi -e 's/(PRODUCT_BUNDLE_IDENTIFIER = \Q$ENV{BUNDLE_ID}\E;)/$1\n\t\t\t\tDEVELOPMENT_TEAM = $ENV{TEAM_ID};/g' "$PBX"
fi
grep -c "DEVELOPMENT_TEAM = $TEAM_ID" "$PBX"

echo "== api key"
KEY_DIR="$HOME/private_keys"; mkdir -p "$KEY_DIR"
KEY_PATH="$KEY_DIR/AuthKey_${ASC_KEY_ID}.p8"
printf '%s\n' "$ASC_KEY_P8" > "$KEY_PATH"
AUTH=(-allowProvisioningUpdates -authenticationKeyPath "$KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")

echo "== archive (imzasız; App Store imzası export aşamasında Xcode bulut imzasıyla uygulanır)"
ARCHIVE="$WORK/NeonKick.xcarchive"
xcodebuild -workspace App.xcworkspace -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= DEVELOPMENT_TEAM="$TEAM_ID" \
  archive > "$LOGS/archive.log" 2>&1 || { grep -E "error:|BUILD FAILED|ARCHIVE FAILED" "$LOGS/archive.log" | head -60; tail -40 "$LOGS/archive.log"; exit 1; }
tail -3 "$LOGS/archive.log"

echo "== ad-hoc sign"
APP=$(ls -d "$ARCHIVE/Products/Applications/"*.app)
find "$APP/Frameworks" -maxdepth 1 \( -name "*.framework" -o -name "*.dylib" \) -print0 2>/dev/null | xargs -0 -I{} codesign -f -s - {}
codesign -f -s - "$APP"

echo "== export options"
cat > "$WORK/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>testFlightInternalTestingOnly</key><false/>
</dict></plist>
EOF

echo "== export + upload to App Store Connect"
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$WORK/out" \
  -exportOptionsPlist "$WORK/ExportOptions.plist" "${AUTH[@]}" > "$LOGS/export.log" 2>&1 || {
    tail -80 "$LOGS/export.log"
    if grep -qi "No suitable application records" "$LOGS/export.log"; then
      echo "::error::App Store Connect'te '$BUNDLE_ID' için uygulama kaydı yok. App Store Connect > My Apps > + > New App (Bundle ID: $BUNDLE_ID) oluşturup iş akışını tekrar çalıştır."
    fi
    exit 1; }
tail -15 "$LOGS/export.log"
rm -f "$KEY_PATH"
echo "Yüklendi: $APP_NAME $APP_VERSION ($BUILD_NUMBER). İşlendikten sonra (5-30 dk) App Store Connect > TestFlight'ta görünür."
