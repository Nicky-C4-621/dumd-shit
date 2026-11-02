#!/usr/bin/env bash
# Android camera / spyware / bloatware check.
#
# Read-only: this script only LOOKS at the phone. It does not uninstall,
# disable or change anything.
#
# Needs:
#   - A computer (Mac, Linux, or Windows with Git Bash)
#   - Android "platform-tools" (adb) installed:
#       Mac:     brew install android-platform-tools
#       Linux:   sudo apt install adb
#       Windows: https://developer.android.com/tools/releases/platform-tools
#   - USB debugging turned on on the phone:
#       Settings > About phone > tap "Build number" 7 times,
#       then Settings > System > Developer options > USB debugging = ON
#   - Phone plugged in by USB, and "Allow USB debugging" accepted on the phone.
#
# Run:   bash android-camera-scan.sh
# Output is printed and also saved to phone-scan-report-<date>.txt

set -u

REPORT="phone-scan-report-$(date +%Y%m%d-%H%M%S).txt"
exec > >(tee "$REPORT") 2>&1

section() { printf '\n==================== %s ====================\n' "$1"; }
sh_() { adb shell "$@" 2>/dev/null | tr -d '\r'; }

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found. Install Android platform-tools first (see top of this script)."
  exit 1
fi

adb start-server >/dev/null 2>&1
state=$(adb get-state 2>/dev/null)
if [ "$state" != "device" ]; then
  echo "No phone detected (state: ${state:-none})."
  echo "Plug the phone in, turn on USB debugging, and tap 'Allow' on the phone's popup."
  adb devices
  exit 1
fi

section "PHONE"
echo "Model:   $(sh_ getprop ro.product.manufacturer) $(sh_ getprop ro.product.model)"
echo "Android: $(sh_ getprop ro.build.version.release) (SDK $(sh_ getprop ro.build.version.sdk))"
echo "Patch:   $(sh_ getprop ro.build.version.security_patch)"

# Apps that show an icon in the app drawer
launcher_pkgs=$(sh_ cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER \
  | grep '/' | sed 's#^ *##; s#/.*##' | sort -u)

# Third-party (user-installed) apps with their installer
third_party=$(sh_ pm list packages -3 -i | sed 's/^package://' | sort)

FLAGS=()

section "RECENT CAMERA USE (camera service log, newest first)"
cam_log=$(sh_ dumpsys media.camera | sed -n '/Camera service events log/,/^$/p' | head -60)
if [ -n "$cam_log" ]; then
  echo "$cam_log"
else
  echo "(Camera log not available on this phone/version.)"
fi

section "USER-INSTALLED APPS: camera permission + last camera use"
printf '%-50s %-8s %-6s %-22s %s\n' "PACKAGE" "CAMERA" "ICON?" "INSTALLED FROM" "LAST CAMERA USE"
while IFS= read -r line; do
  [ -z "$line" ] && continue
  pkg=${line%%  installer=*}
  pkg=${pkg%% *}
  installer=$(echo "$line" | sed -n 's/.*installer=//p')
  [ -z "$installer" ] && installer="null"

  if sh_ dumpsys package "$pkg" | grep -q 'android.permission.CAMERA: granted=true'; then
    cam="YES"
  else
    cam="no"
  fi

  if echo "$launcher_pkgs" | grep -qx "$pkg"; then icon="yes"; else icon="HIDDEN"; fi

  last=$(sh_ appops get "$pkg" CAMERA | grep -o 'time=[^;]*' | head -1 | sed 's/time=//')
  [ -z "$last" ] && last="-"

  printf '%-50s %-8s %-6s %-22s %s\n' "$pkg" "$cam" "$icon" "$installer" "$last"

  case "$installer" in
    com.android.vending|com.google.android.packageinstaller.vending) from_store=1 ;;
    com.sec.android.app.samsungapps|com.amazon.venezia|com.huawei.appmarket) from_store=1 ;;
    *) from_store=0 ;;
  esac

  if [ "$cam" = "YES" ] && [ "$icon" = "HIDDEN" ]; then
    FLAGS+=("HIGH:   $pkg has camera permission AND no app icon (hidden)")
  fi
  if [ "$cam" = "YES" ] && [ "$from_store" = 0 ]; then
    FLAGS+=("MEDIUM: $pkg has camera permission and was NOT installed from an app store (installer=$installer)")
  fi
  if [ "$icon" = "HIDDEN" ] && [ "$from_store" = 0 ]; then
    FLAGS+=("MEDIUM: $pkg is hidden and was NOT installed from an app store")
  fi
done <<< "$third_party"

section "PRE-INSTALLED / SYSTEM APPS THAT USED THE CAMERA"
# System apps can't be listed by permission cheaply, so show any that have a camera-use timestamp.
for pkg in $(sh_ pm list packages -s | sed 's/^package://' | sort); do
  last=$(sh_ appops get "$pkg" CAMERA | grep -o 'time=[^;]*' | head -1 | sed 's/time=//')
  [ -n "$last" ] && printf '%-55s last camera use: %s\n' "$pkg" "$last"
done

section "DEVICE ADMIN APPS (spyware often hides here)"
sh_ dumpsys device_policy | grep -iE 'admin=|ComponentInfo' | sed 's/^ *//' | sort -u
echo "(Normally only things like Find My Device / work profile tools appear here.)"

section "ACCESSIBILITY SERVICES ENABLED (can read your screen)"
acc=$(sh_ settings get secure enabled_accessibility_services)
echo "${acc:-none}" | tr ':' '\n'
if [ -n "$acc" ] && [ "$acc" != "null" ]; then
  FLAGS+=("CHECK:  accessibility services are on: $acc")
fi

section "NOTIFICATION ACCESS (can read your messages/notifications)"
sh_ settings get secure enabled_notification_listeners | tr ':' '\n'

section "INSTALL-FROM-UNKNOWN-SOURCES"
sh_ appops query-op REQUEST_INSTALL_PACKAGES allow 2>/dev/null || echo "(not available)"

section "SUMMARY - THINGS TO LOOK AT"
if [ ${#FLAGS[@]} -eq 0 ]; then
  echo "Nothing obviously suspicious among user-installed apps."
else
  printf '%s\n' "${FLAGS[@]}"
fi
echo
echo "Note: 'HIDDEN' alone isn't proof of spyware (some legit helper apps have no icon)."
echo "Look the package name up, or paste this report back to Claude to go through it."
echo
echo "Report saved to: $REPORT"
