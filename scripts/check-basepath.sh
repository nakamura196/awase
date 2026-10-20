#!/usr/bin/env bash
# Verify that the static export under out/ was built with the GH Pages basePath:
# the rendered HTML must reference assets under /awase/ (e.g. /awase/_next/), and
# no HTML may reference /_next/ without the prefix. Without this, the site would
# 404 on https://nakamura196.github.io/awase/.
#
# Usage: GITHUB_PAGES=true npm run build && ./scripts/check-basepath.sh
# (test:basepath script chains both.)
#
# Bash (not zsh) so it runs on GitHub Actions' default Ubuntu runner.
set -euo pipefail

OUT_DIR="out"
BASE="/awase"

if [[ ! -d "$OUT_DIR" ]]; then
  echo "FAIL: $OUT_DIR not found. Run 'GITHUB_PAGES=true npm run build' first." >&2
  exit 1
fi

HTML_COUNT=$(find "$OUT_DIR" -type f -name '*.html' | wc -l)
if [[ "$HTML_COUNT" -eq 0 ]]; then
  echo "FAIL: no HTML files under $OUT_DIR." >&2
  exit 1
fi

# Bad: an attribute value pointing at /_next/ without the basePath.
# `|| true` suppresses grep's exit 1 on no-match so `set -e` does not stop us.
BAD_HITS=$(grep -rEl --include='*.html' '(href|src)="/_next/' "$OUT_DIR" || true)
if [[ -n "$BAD_HITS" ]]; then
  echo "FAIL: found /_next/ reference without basePath ($BASE) in HTML:" >&2
  echo "$BAD_HITS" | head -5 >&2
  exit 1
fi

GOOD_HITS=$(grep -rEl --include='*.html' "(href|src)=\"$BASE/_next/" "$OUT_DIR" || true)
if [[ -z "$GOOD_HITS" ]]; then
  echo "FAIL: did not find basePath-prefixed asset URL ('$BASE/_next/') in HTML." >&2
  exit 1
fi

# The placeholder pages must be exported for both locales.
for page in viewer compare xsl dts; do
  for locale in ja en; do
    if [[ ! -f "$OUT_DIR/$locale/$page/index.html" ]]; then
      echo "FAIL: $OUT_DIR/$locale/$page/index.html is missing." >&2
      exit 1
    fi
  done
done

echo "OK: static export in $OUT_DIR uses basePath ($BASE)."
