#!/usr/bin/env bash
# Parse every app module as an ES module. There is no build step, so this is
# the closest thing to a compile check — run it before every commit.
#
# Files are copied to .mjs first because `node --check` on a bare .js can
# silently pass on ESM-only syntax errors.
set -u
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail=0
count=0
for f in $(find js -name '*.js' | sort); do
  count=$((count + 1))
  out="$TMP/$(echo "$f" | tr '/' '_').mjs"
  cp "$f" "$out"
  if ! node --check "$out" >/dev/null 2>&1; then
    echo "SYNTAX ERROR: $f"
    node --check "$out" 2>&1 | sed -n '1,6p' | sed 's/^/    /'
    fail=1
  fi
done

# The static nav in index.html must keep the same icons as js/ui/icon.js.
if ! node tools/test-nav-icons.mjs >"$TMP/nav.log" 2>&1; then
  cat "$TMP/nav.log"
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "OK — $count modules parse cleanly, nav icons match."
else
  echo "FAILED — fix the errors above."
fi
exit "$fail"
