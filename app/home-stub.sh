#!/bin/sh
# Custom Launcher - stand-in for LG Home.
# boot-hook.sh bind-mounts this file over /usr/bin/com.webos.app.home, so the
# system starts it whenever it wants to show LG Home: Home button on the remote,
# "Home Auto Launch" at power-on / wake-up, or any app launching the home screen.
# It registers with the application manager like the real (native) home app and
# opens the launcher on every launch / relaunch event.

APP_ID="io.github.swenz.customlauncher"
APP_DIR="/media/developer/apps/usr/palm/applications/$APP_ID"
REAL="/usr/bin/com.webos.app.home"

launch() {
    luna-send -n 1 -f luna://com.webos.applicationManager/launch "{\"id\":\"$APP_ID\"}" >/dev/null 2>&1
}

# Undo everything this launcher set up outside its own folder.
# "umount -l" because this very script is running from the mount.
restore_lg_home() {
    umount -l "$REAL" 2>/dev/null
    rm -rf /var/lib/webosbrew/init.d/50-customlauncher /var/lib/webosbrew/customlauncher
}

# True if the launcher was uninstalled. An update replaces the app folder for a
# moment, so look twice before concluding that.
app_gone() {
    [ -d "$APP_DIR" ] && return 1
    sleep 5
    [ ! -d "$APP_DIR" ]
}

# Launcher was uninstalled: clean up and hand over to the real LG Home.
if app_gone; then
    restore_lg_home
    exec "$REAL" "$@"
fi

# The system preloads Home at boot without showing it: stay quiet then.
case "$1" in
*'"preload"'*) ;;
*) launch ;;
esac

# Subscription to the application manager; a FIFO (instead of a pipe) keeps the
# loop in this shell so the trap can clean up when the system closes "Home".
FIFO="/tmp/customlauncher-home.$$"
rm -f "$FIFO"
mkfifo "$FIFO" || exit 1
luna-send -i -a com.webos.app.home luna://com.webos.applicationManager/registerApp '{}' >"$FIFO" 2>/dev/null &
SUB=$!
cleanup() {
    kill "$SUB" 2>/dev/null
    rm -f "$FIFO"
    exit 0
}
trap cleanup TERM INT HUP

while read -r line; do
    case "$line" in
    *'"event":"launch"'* | *'"event":"relaunch"'*)
        if ! app_gone; then
            launch
        else
            # uninstalled while running: clean up, restore LG Home and show it
            restore_lg_home
            setsid sh -c "sleep 1; luna-send -n 1 luna://com.webos.applicationManager/launch '{\"id\":\"com.webos.app.home\"}'" >/dev/null 2>&1 &
            cleanup
        fi
        ;;
    *'"event":"close"'*)
        cleanup
        ;;
    esac
done <"$FIFO"
cleanup
