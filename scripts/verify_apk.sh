#!/usr/bin/env bash
# ============================================================
# MATH ARENA - APK verification: package metadata, signature,
# contents (assets present), and integrity.
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BT="${ANDROID_DEPS:-/home/z/my-project/.deps}/bt34/android-14"
APK="${1:-$ROOT/release/MathArena-v2.0.0.apk}"

echo "== MATH ARENA APK verification =="
echo "file: $APK"
[ -f "$APK" ] || { echo "FATAL: apk not found"; exit 1; }

echo ""
echo "-- size:"
du -h "$APK"

echo ""
echo "-- signature:"
"$BT/apksigner" verify --print-certs "$APK" | sed -n '1,3p'

echo ""
echo "-- package metadata (aapt badging):"
"$BT/aapt" dump badging "$APK" | grep -E "^package|^application-label|sdkVersion|targetSdkVersion|launchable|native-code" || true

echo ""
echo "-- key contents:"
unzip -l "$APK" | grep -E "classes.dex|resources.arsc|AndroidManifest|assets/(index.html|assets/data/question_bank.js|assets/data/book_index.js|assets/book/p-089.jpg|assets/js/app.js|assets/js/whiteboard.js|assets/js/bookviewer.js|assets/fonts/Vazirmatn-Regular.woff2|assets/css/main.css)|mipmap" | head -12

echo ""
echo "-- asset totals:"
total=$(unzip -l "$APK" | tail -1 | awk '{print $2}')
assets=$(unzip -l "$APK" | awk '$4 ~ /^assets/ {s+=$1} END {print s}')
echo "apk bytes total listing: $total; assets bytes: $assets"

echo ""
echo "-- integrity (zip test):"
unzip -t "$APK" > /dev/null && echo "zip OK"

echo ""
echo "-- sha256:"
sha256sum "$APK"
echo "VERIFICATION DONE"
