#!/bin/sh
# Custom Launcher autostart hook.
# Installed as /var/lib/webosbrew/init.d/50-customlauncher (run by the Homebrew
# Channel startup script on every boot). It detaches a small watcher that
#   1. opens the launcher once the TV UI is up after a cold boot, and
#   2. re-opens it whenever the TV wakes from standby (Quick Start+ etc.).
#
#   50-customlauncher                    boot hook (returns immediately)
#   50-customlauncher --no-boot-launch   start the watcher only
#   50-customlauncher --stop             stop the watcher

APP_ID="io.github.swenz.customlauncher"
APP_DIR="/media/developer/apps/usr/palm/applications/$APP_ID"
PIDFILE="/tmp/customlauncher-autostart.pid"

launch() {
    luna-send -n 1 -f luna://com.webos.applicationManager/launch "{\"id\":\"$APP_ID\"}" >/dev/null 2>&1
}

stop_watcher() {
    if [ -f "$PIDFILE" ]; then
        pid="$(cat "$PIDFILE")"
        # negative pid = whole process group (watcher + its luna-send subscription)
        kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null
        rm -f "$PIDFILE"
    fi
}

case "$1" in
--stop)
    stop_watcher
    exit 0
    ;;
--daemon)
    ;;
*)
    # App was uninstalled: do nothing.
    [ -d "$APP_DIR" ] || exit 0
    stop_watcher
    setsid "$0" --daemon "$1" </dev/null >/dev/null 2>&1 &
    exit 0
    ;;
esac

# ---- watcher (own session, see setsid above) ----
echo $$ > "$PIDFILE"

if [ "$2" != "--no-boot-launch" ]; then
    # Wait until some app (live TV / last input) is in the foreground, max ~90 s.
    i=0
    while [ $i -lt 45 ]; do
        fg="$(luna-send -n 1 luna://com.webos.applicationManager/getForegroundAppInfo '{}' 2>/dev/null | grep -o '"appId":"[^"]\+')"
        [ -n "$fg" ] && break
        sleep 2
        i=$((i + 1))
    done
    sleep 3
    launch
fi

while [ -d "$APP_DIR" ]; do
    prev="Active"
    luna-send -i luna://com.webos.service.tvpower/power/getPowerState '{"subscribe":true}' 2>/dev/null |
    while read -r line; do
        state="$(printf '%s' "$line" | sed -n 's/.*"state": *"\([^"]*\)".*/\1/p')"
        [ -z "$state" ] && continue
        if [ "$state" = "Active" ] && [ "$prev" != "Active" ]; then
            sleep 2
            launch
        fi
        prev="$state"
    done
    # subscription ended (service restart) – retry
    sleep 5
done
rm -f "$PIDFILE"
