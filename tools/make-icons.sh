#!/usr/bin/env bash
# Renders the app icons in images/ from the logo sources in images/logo/.
# Run it again whenever a logo SVG changes, and commit the PNGs it writes.
# Needs a Chromium browser (Chrome or Edge) for headless screenshots; set
# CHROME=/path/to/browser if it isn't found. Not part of the app itself.
set -euo pipefail
cd "$(dirname "$0")/.."

find_browser() {
  if [ -n "${CHROME:-}" ]; then echo "$CHROME"; return; fi
  for b in google-chrome chromium chromium-browser msedge; do
    if command -v "$b" >/dev/null 2>&1; then command -v "$b"; return; fi
  done
  for b in "/c/Program Files/Google/Chrome/Application/chrome.exe" \
           "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
           "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    if [ -x "$b" ]; then echo "$b"; return; fi
  done
  echo "No Chrome/Edge found; set CHROME=/path/to/browser" >&2
  exit 1
}
BROWSER="$(find_browser)"

# Windows browsers want Windows paths.
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }
url() { if command -v cygpath >/dev/null 2>&1; then echo "file:///$(cygpath -m "$PWD/$1")"; else echo "file://$PWD/$1"; fi; }

# render <source svg> <size> <output png>
# Headless windows have a minimum width (~500px), so the window is always
# 1024 and the device scale factor shrinks the screenshot to <size>.
render() {
  rm -f "$3"
  "$BROWSER" --headless=new --disable-gpu --hide-scrollbars \
    --default-background-color=00000000 \
    --window-size=1024,1024 --force-device-scale-factor="$(awk "BEGIN{print $2/1024}")" \
    --screenshot="$(native "$PWD/$3")" "$(url "$1")" >/dev/null 2>&1
  [ -s "$3" ] || { echo "Failed: $3" >&2; exit 1; }
  echo "$3 (${2}px)"
}

render images/logo/jini.svg            1024 images/icon-1024.png      # App Store master, no transparency
render images/logo/jini.svg             512 images/icon-512.png
render images/logo/jini.svg             192 images/icon-192.png
render images/logo/jini.svg             180 images/apple-touch-icon.png
render images/logo/jini.svg              32 images/favicon-32.png
render images/logo/jini-maskable.svg    512 images/icon-maskable-512.png
render images/logo/jini-monochrome.svg  512 images/icon-monochrome-512.png
