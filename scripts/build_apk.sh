#!/usr/bin/env bash
# ============================================================
# MATH ARENA - APK build (no Gradle required)
# Uses the Android SDK build-tools (aapt2, d8, zipalign, apksigner)
# directly against platform android-34.
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_ROOT="${ANDROID_DEPS:-/home/z/my-project/.deps}"
BT="$ANDROID_ROOT/bt34/android-14"
PLATFORM="$ANDROID_ROOT/pf34/android-34/android.jar"
JDK_HOME="${JDK_HOME:-$(ls -d "$ANDROID_ROOT"/jdk-17* 2>/dev/null | head -1)}"
BUILD="$ROOT/android/build"
APPSRC="$ROOT/app"
JAVASRC="$ROOT/android/java"
RES="$ROOT/android/res"
MANIFEST="$ROOT/android/AndroidManifest.xml"
KEYSTORE="$ROOT/android/release.keystore"
OUT_APK="$ROOT/release/MathArena-v2.0.0.apk"

export PATH="$JDK_HOME/bin:$PATH"

echo "== MATH ARENA build =="
echo "build-tools: $BT"
echo "platform:    $PLATFORM"
echo "jdk:         $JDK_HOME"

[ -x "$BT/aapt2" ] || { echo "FATAL: aapt2 not found at $BT"; exit 1; }
[ -f "$PLATFORM" ] || { echo "FATAL: android.jar not found"; exit 1; }
[ -d "$JDK_HOME" ] || { echo "FATAL: JDK 17 not found"; exit 1; }

rm -rf "$BUILD"
mkdir -p "$BUILD/classes" "$BUILD/compiled-res"

# ---------- 1. compile resources ----------
echo "[1/5] compiling resources (aapt2)"
"$BT/aapt2" compile --dir "$RES" -o "$BUILD/compiled-res"

# ---------- 2. link resources + manifest ----------
echo "[2/5] linking resources + manifest (aapt2 link)"
"$BT/aapt2" link -o "$BUILD/base.apk" \
  -I "$PLATFORM" \
  --manifest "$MANIFEST" \
  --min-sdk-version 24 \
  --target-sdk-version 34 \
  --version-code 2 \
  --version-name 2.0.0 \
  --auto-add-overlay \
  -A "$APPSRC" \
  "$BUILD/compiled-res"/*.flat

# ---------- 3. compile java + dex ----------
echo "[3/5] compiling MainActivity.java + d8"
javac -source 8 -target 8 -nowarn \
  -classpath "$PLATFORM" \
  -d "$BUILD/classes" \
  $(find "$JAVASRC" -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$PLATFORM" \
  --output "$BUILD" \
  $(find "$BUILD/classes" -name '*.class')

# ---------- 4. assemble apk ----------
echo "[4/5] assembling apk"
cd "$BUILD"
cp base.apk unsigned.apk
zip -q -j unsigned.apk classes.dex
# ensure assets are stored uncompressed enough for streaming? (default ok)

# ---------- 5. align + sign ----------
echo "[5/5] zipalign + apksigner"
"$BT/zipalign" -f -p 4 unsigned.apk aligned.apk

if [ ! -f "$KEYSTORE" ]; then
  echo "generating release keystore (first build)"
  keytool -genkeypair -keystore "$KEYSTORE" -alias matharena \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass matharena2026 -keypass matharena2026 \
    -dname "CN=Math Arena, OU=Game, O=MathArena, L=Tehran, C=IR"
fi
"$BT/apksigner" sign --ks "$KEYSTORE" \
  --ks-pass pass:matharena2026 --key-pass pass:matharena2026 \
  --out "$OUT_APK" aligned.apk

"$BT/apksigner" verify --print-certs "$OUT_APK" | head -4
mkdir -p "$ROOT/release"
echo ""
echo "BUILD OK: $OUT_APK ($(du -h "$OUT_APK" | cut -f1))"
