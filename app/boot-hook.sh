#!/bin/sh
# Custom Launcher boot hook.
# Installed as /var/lib/webosbrew/init.d/50-customlauncher (run by the Homebrew
# Channel startup script on every boot). It replaces LG Home with the launcher
# by bind-mounting home-stub over the LG Home executable. Nothing on the system
# partition is modified; a reboot without this hook restores the original.
#
#   50-customlauncher                    boot hook
#   50-customlauncher --no-boot-launch   (re)apply the replacement only
#   50-customlauncher --stop             undo the replacement

APP_ID="io.github.swenz.customlauncher"
APP_DIR="/media/developer/apps/usr/palm/applications/$APP_ID"
CONF="/var/lib/webosbrew/customlauncher"
STUB="$CONF/home-stub"
REAL="/usr/bin/com.webos.app.home"

mounted() { grep -q " $REAL " /proc/mounts; }

# Watcher process of version 1.0.0, if it is still around.
stop_legacy_watcher() {
    if [ -f /tmp/customlauncher-autostart.pid ]; then
        pid="$(cat /tmp/customlauncher-autostart.pid)"
        kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null
        rm -f /tmp/customlauncher-autostart.pid
    fi
}

if [ "$1" = "--stop" ]; then
    stop_legacy_watcher
    # the stub runs as "/bin/sh /usr/bin/com.webos.app.home ..."; it has to be
    # gone before the mount can be released
    pkill -f "^/bin/sh $REAL" 2>/dev/null
    pkill -f "luna-send -i -a com.webos.app.home" 2>/dev/null
    rm -f /tmp/customlauncher-home.*
    sleep 1
    while mounted; do umount "$REAL" 2>/dev/null || umount -l "$REAL" || break; done
    exit 0
fi

# App was uninstalled (its parent folder is there, the app is not): remove the
# leftovers, including this hook, and leave LG Home alone.
if [ ! -d "$APP_DIR" ]; then
    if [ -d "${APP_DIR%/*}" ]; then
        rm -rf "$CONF" "$0"
    fi
    exit 0
fi
[ -x "$STUB" ] || exit 0

stop_legacy_watcher
mounted || mount --bind "$STUB" "$REAL" || exit 0
# End the real LG Home (preloaded at boot); the next start runs the stub.
pkill -f "^$REAL" 2>/dev/null

if [ "$1" != "--no-boot-launch" ]; then
    # LG may have opened Home before this hook ran. If "Home Auto Launch" is on,
    # open the launcher once the TV UI is up (max ~90 s). Must not block boot.
    setsid sh -c '
        i=0
        while [ $i -lt 45 ]; do
            luna-send -n 1 luna://com.webos.applicationManager/getForegroundAppInfo "{}" 2>/dev/null | grep -q "\"appId\":\"[^\"]" && break
            sleep 2
            i=$((i + 1))
        done
        sleep 3
        luna-send -n 1 luna://com.webos.settingsservice/getSystemSettings "{\"category\":\"general\",\"keys\":[\"homeAutoLaunch\"]}" 2>/dev/null |
            grep -q "\"homeAutoLaunch\": *\"on\"" &&
            luna-send -n 1 -f luna://com.webos.applicationManager/launch "{\"id\":\"'"$APP_ID"'\"}"
    ' </dev/null >/dev/null 2>&1 &
fi
exit 0
