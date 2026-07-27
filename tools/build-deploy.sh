#!/usr/bin/env bash
# Rebuilds ../GYM.SITE-deploy — the folder you drag onto Netlify Drop.
#
# It is a throwaway copy, never edited by hand: everything here is wiped and
# regenerated so it can't drift from source. Only the public app ships;
# one-time migration pages, dev tooling and Firebase config stay behind.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="$PWD"
DEST="$(cd .. && pwd)/GYM.SITE-deploy"

bash tools/check.sh

rm -rf "$DEST"
mkdir -p "$DEST"
cp "$SRC/index.html" "$DEST/"
cp -r "$SRC/css" "$SRC/js" "$DEST/"
[ -d "$SRC/images" ] && cp -r "$SRC/images" "$DEST/"
[ -f "$SRC/manifest.json" ] && cp "$SRC/manifest.json" "$DEST/"
[ -f "$SRC/sw.js" ] && cp "$SRC/sw.js" "$DEST/"

# The local-only sandbox never ships; it can't activate off localhost anyway,
# but shipping seed data to production would be pure noise.
rm -rf "$DEST/js/dev"

echo "Built: $DEST"
echo "Files: $(find "$DEST" -type f | wc -l)"
echo
echo "Next: drag the GYM.SITE-deploy folder onto https://app.netlify.com/drop"
