#!/bin/sh
# Custom Launcher - collect per-app background artwork.
# Many apps ship a launcher background ("bgImage" in their appinfo.json). Other
# apps' folders are outside the launcher's sandbox, so this script (run as root
# through the Homebrew Channel service) copies those images into the launcher's
# own folder, where the UI can load them.
#
#   art-sync.sh <launcher-dir> '<app-id>|<app-dir>' ...
# prints one line "<app-id>|<file name in art/>" per app that has artwork.

OUT="$1/art"
shift
mkdir -p "$OUT" || exit 0

for entry in "$@"; do
    id="${entry%%|*}"
    dir="${entry#*|}"
    [ -f "$dir/appinfo.json" ] || continue
    bg="$(sed -n 's/.*"bgImage" *: *"\([^"]*\)".*/\1/p' "$dir/appinfo.json" | head -1)"
    [ -n "$bg" ] && [ -f "$dir/$bg" ] || continue
    # tiny files are the store's generic placeholder, not real artwork
    [ "$(wc -c <"$dir/$bg")" -gt 100000 ] || continue
    name="$(printf '%s' "$id" | tr -c 'A-Za-z0-9._-' '_').${bg##*.}"
    [ -f "$OUT/$name" ] || cp "$dir/$bg" "$OUT/$name" || continue
    echo "$id|$name"
done
