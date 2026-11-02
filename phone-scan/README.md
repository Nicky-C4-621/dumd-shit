# Phone camera / spyware scan (Android)

`android-camera-scan.sh` looks at an Android phone over USB and reports:

- which apps recently turned on the camera, and when
- every user-installed app with camera permission, whether it is **hidden** (no app icon),
  and whether it came from an app store or was installed some other way
- pre-installed apps that have used the camera
- device-admin apps, accessibility services and notification access (where spyware usually hides)
- a summary of anything suspicious

It is read-only: it doesn't uninstall or change anything.

## How to run it

1. Install adb: Mac `brew install android-platform-tools`, Linux `sudo apt install adb`,
   Windows: download platform-tools from Google and use Git Bash.
2. On the phone: Settings > About phone > tap **Build number** 7 times, then
   Settings > System > Developer options > turn on **USB debugging**.
3. Plug in the phone and tap **Allow** on the popup.
4. `bash android-camera-scan.sh`
5. Paste the report (`phone-scan-report-*.txt`) back to Claude.

Turn USB debugging back off when you're done.
