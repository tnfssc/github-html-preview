#!/bin/sh
# Requires rsvg-convert (librsvg). Run from any directory.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
for size in 16 32 48 96 128; do
  rsvg-convert --width="$size" --height="$size" \
    --output="$root/public/icon/$size.png" "$root/assets/logo.svg"
done
