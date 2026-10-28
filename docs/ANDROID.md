# Build the Android app (APK)

The Android app is the same Family Wealth web app inside a small Android shell (Capacitor). It adds payment reminders on the phone, the back button, pull down to refresh, print to PDF and file sharing. Your data still lives only in your Google Drive and on the phone.

You build the APK on your own computer. Do this once to set up, then three commands for each new version.

## 1. Install these once

| Tool | Version | Where |
| --- | --- | --- |
| Node.js | 22 or newer | https://nodejs.org |
| JDK | 21 (21 to 24 work, 25 does not) | Comes inside Android Studio (step 2), nothing to install separately |
| Android Studio | current | https://developer.android.com/studio |

## 2. Set up Android Studio once

1. Open Android Studio and finish its first-run setup. It downloads the Android SDK.
2. In **More actions → SDK Manager → SDK Platforms** tick **Android 16 (API 36)**. Under **SDK Tools** tick **Android SDK Build-Tools** and **Android SDK Command-line Tools**. Apply.
3. Tell Gradle where the SDK is, by making a file `android/local.properties` with one line (Android Studio does this for you if you open the `android` folder in it once):
   - Windows: `sdk.dir=C\:\\Users\\YOU\\AppData\\Local\\Android\\Sdk`
   - Mac: `sdk.dir=/Users/YOU/Library/Android/sdk`
   - Linux: `sdk.dir=/home/YOU/Android/Sdk`
4. The build script picks Android Studio's Java 21 for you when the Java on your PATH is too new or missing. To choose a Java yourself, set `JAVA_HOME` to a JDK 21 folder (Android Studio's is its `jbr` folder; Windows: `C:\Program Files\Android\Android Studio\jbr`). Only the `npm run` commands do this switch. If you run `gradlew` by hand, set `JAVA_HOME` first.

## 3. Build a test APK

In the project folder (the one with `package.json`):

```
git pull
npm install
npm run android:debug
```

Your APK is `android/app/build/outputs/apk/debug/app-debug.apk`. The first build downloads Gradle and takes several minutes. Later ones take about a minute.

## 4. Put it on the phone

- Copy `app-debug.apk` to the phone (USB, Drive or WhatsApp to yourself) and open it. Allow "Install unknown apps" for the app you opened it from, when asked.
- Or, with USB debugging on and the phone plugged in: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

## 5. First run

1. Open **Family Wealth**. Choose **Connect to Google Drive** and enter the backend URL and key, the same as in the web app. Family members use the family link.
2. When asked, choose **Turn on reminders** and allow notifications.
3. In **Settings → Payment reminders (this phone)** pick the time and which reminders you want. **Send a test reminder** shows how many are planned.

The installed web app (PWA) and this app keep their data separately. Connect again in the app, nothing is lost in Drive.

## A release build for family phones

A debug APK installs fine. For a cleaner build you can share with the family:

1. Make a signing key once (keep the file and the passwords safe, and never put them in git):
   `keytool -genkey -v -keystore family-wealth.jks -keyalg RSA -keysize 2048 -validity 10000 -alias family-wealth`
2. Make `android/keystore.properties` (it is git-ignored):
   ```
   storeFile=../../family-wealth.jks
   storePassword=YOUR_PASSWORD
   keyAlias=family-wealth
   keyPassword=YOUR_PASSWORD
   ```
   `storeFile` is relative to `android/app/`.
3. `npm run android:release`. The APK is in `android/app/build/outputs/apk/release/`.

Always sign every later version with the same key. Android refuses to update an app signed with a different key.

## Updating the app later

After any change to the web files, run `npm run android:debug` (or `android:release`) again, then install the new APK over the old one. Your data stays. The version number comes from `js/version.js`, so raising it there is all that is needed for Android to accept the update.

To work in Android Studio instead: `npm run android:sync`, then `npm run android:open`.

## How the reminders work

- There is no server, so nothing can send your phone news. Each time you open the app, or change data, it looks at the dates it already knows and asks Android to show notes at the time you chose.
- EMI: the day before, on the day, and three mornings in a row if it is still unpaid. Bond interest: as many days before as set on Fixed income, and on the day. Money due to you and maturing deposits, bonds, chits and lending: on the day.
- It plans 45 days ahead and holds at most 60 notes. If you do not open the app for several weeks, the plan runs out, so open it now and then.
- Marking a payment as paid and opening the app cancels its reminders.
- Turn off **Show amounts** if you do not want figures on the lock screen.
- Some phones (Xiaomi, Oppo, Vivo, Samsung power saving) stop apps from running in the background and may delay or drop reminders. Set Family Wealth to **No restrictions** or **Autostart on** in the phone's battery settings.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| `SDK location not found` | Make `android/local.properties` (step 2.3) |
| `Unsupported class file major version 69` (or any number above 68) | Your Java is too new (Java 25). `npm run android:debug` now switches to Android Studio's Java 21 by itself. If it cannot find Android Studio, it says so: install Android Studio, or set `JAVA_HOME` to a JDK 21 folder (step 2.4) |
| `capacitor-cordova-android-plugins` not found | Run `npm run android:sync` before building (the `android:debug` command does this for you) |
| White or old screen after an update | Uninstall the old app, install the new APK |
| No reminders | Settings → Payment reminders is on, the phone allows notifications for the app, and battery saving is not restricting it |
| Print does nothing | Use the system print dialog's **Save as PDF** |

If a build stops with an error, send me the last 30 lines of the output.
