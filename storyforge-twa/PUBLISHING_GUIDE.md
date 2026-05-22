# 📱 Story Forge — Play Store Publishing Guide
## Complete Step-by-Step for Beginners

---

## OVERVIEW OF STEPS
1. Host your app on GitHub Pages (free)
2. Create app icons
3. Build the Android APK in Android Studio
4. Sign the APK with a keystore
5. Link the app to your website (Digital Asset Links)
6. Submit to Google Play Store

Estimated time: 2–4 hours for a first-timer.

---

## STEP 1 — HOST ON GITHUB PAGES (FREE)

Your app needs to be live on the internet for TWA to work.

1. Go to https://github.com and create a free account if you don't have one.
2. Click "New repository" → name it `storyforge` → make it Public → click Create.
3. Upload ALL files from this folder into the repo:
   - index.html
   - manifest.json
   - .well-known/assetlinks.json  ← important! (create this folder manually on GitHub)
   - icons/ folder (once you create icons in Step 2)
4. Go to Settings → Pages → Source: Deploy from branch → Branch: main → Save.
5. Your app is now live at: https://YOUR-USERNAME.github.io/storyforge/

Test it in your phone browser — it should work fully!

---

## STEP 2 — CREATE APP ICONS

You need two icon sizes: 192×192 and 512×512 pixels.

Option A (easiest — free online tool):
1. Go to https://realfavicongenerator.net or https://maskable.app
2. Upload any square image (your logo or a book/quill icon)
3. Download the generated icons
4. Rename them icon-192.png and icon-512.png
5. Put them in an `icons/` folder and upload to GitHub

Option B (use any image editor like GIMP, Canva, or Photopea):
- Design a 512×512 square image
- Export as icon-512.png
- Scale down to 192×192 → export as icon-192.png
- Upload both to `icons/` folder on GitHub

---

## STEP 3 — SET UP ANDROID STUDIO

1. Download Android Studio FREE from: https://developer.android.com/studio
2. Install it (takes ~10 minutes, it downloads the Android SDK automatically).
3. Open Android Studio → click "Open" → navigate to the `storyforge-twa` folder.
4. Wait for Gradle to sync (takes a few minutes the first time).

---

## STEP 4 — UPDATE YOUR URL IN THE PROJECT

In Android Studio, open: app/src/main/AndroidManifest.xml

Find these two lines and replace YOUR-USERNAME with your actual GitHub username:

    android:value="https://YOUR-USERNAME.github.io/storyforge/"
    android:host="YOUR-USERNAME.github.io"

Save the file.

---

## STEP 5 — CREATE A SIGNING KEYSTORE

Google Play requires your app to be signed with a private key. You only do this ONCE — keep the keystore file safe forever!

In Android Studio:
1. Go to: Build → Generate Signed Bundle / APK
2. Choose: APK → Next
3. Click "Create new..." under Key store path
4. Fill in:
   - Key store path: save it somewhere safe (e.g. Desktop/storyforge.jks)
   - Password: choose a strong password (WRITE IT DOWN!)
   - Key alias: storyforge
   - Key password: same or different password (WRITE IT DOWN!)
   - First and Last Name: your name
   - Country Code: your 2-letter country code (e.g. US, GB, IN)
5. Click OK → Next → choose Release → Finish

Your signed APK will be in: app/release/app-release.apk

---

## STEP 6 — GET YOUR SHA-256 FINGERPRINT

This links your app to your website so TWA works without the browser bar.

In Android Studio Terminal (View → Terminal), run:

    keytool -list -v -keystore PATH/TO/storyforge.jks -alias storyforge

It will ask for your keystore password. Copy the SHA-256 fingerprint — it looks like:
    AB:CD:12:34:...

---

## STEP 7 — UPDATE assetlinks.json

Open: .well-known/assetlinks.json

Replace "TODO: REPLACE_WITH_YOUR_SHA256_SIGNING_FINGERPRINT" with your actual SHA-256 fingerprint (with colons, exactly as shown by keytool).

Also replace:
- "com.storyforge.app" — keep this or change to your own package name

Upload the updated file to GitHub. Verify it's accessible at:
    https://YOUR-USERNAME.github.io/.well-known/assetlinks.json

---

## STEP 8 — UPDATE app/build.gradle WITH YOUR KEYSTORE

Open app/build.gradle and find the signingConfigs section:

    signingConfigs {
        release {
            storeFile file('PATH/TO/storyforge.jks')   // full path to your .jks file
            storePassword 'YOUR_STORE_PASSWORD'
            keyAlias 'storyforge'
            keyPassword 'YOUR_KEY_PASSWORD'
        }
    }

Uncomment the signingConfig line in buildTypes > release too.

Rebuild: Build → Generate Signed Bundle / APK → APK → Release

---

## STEP 9 — SUBMIT TO GOOGLE PLAY STORE

1. Go to https://play.google.com/console and sign in with a Google account.
2. Pay the one-time $25 developer registration fee.
3. Click "Create app" → fill in app name "The Story Forge" → select language, app/game, free/paid.
4. Complete the store listing:
   - Short description (80 chars): "AI-powered story writer — chapter by chapter"
   - Full description: explain the app features
   - Screenshots: take phone screenshots of your app (required: 2 minimum)
   - Feature graphic: 1024×500 banner image
5. Go to: Production → Releases → Create new release
6. Upload your app-release.apk file
7. Fill in release notes (what's new)
8. Roll out to production!

Google reviews new apps — usually takes 3–7 days for first submission.

---

## CUSTOM PACKAGE NAME (OPTIONAL)

If you want a unique package name (recommended), change "com.storyforge.app" to something like:
    com.yourname.storyforge

Change it in THREE places:
1. app/build.gradle → applicationId
2. AndroidManifest.xml → package (in <manifest> tag)  
3. assetlinks.json → package_name

---

## TROUBLESHOOTING

Problem: "App not verified" / browser bar shows in app
→ Your assetlinks.json isn't set up correctly. Check the SHA-256 fingerprint and package name match.

Problem: Gradle sync fails
→ Make sure you have internet connection. Try: File → Invalidate Caches → Restart.

Problem: App crashes on launch
→ Check the URL in AndroidManifest.xml — make sure your GitHub Pages site is live and working.

Problem: "App bundle is required" error on Play Store
→ Go to Build → Generate Signed Bundle / APK → choose Bundle (.aab) instead of APK for Play Store submission. APK works for sideloading.

---

## FILES IN THIS PROJECT

storyforge-twa/
├── index.html              ← Your actual app (upload to GitHub Pages)
├── manifest.json           ← PWA manifest (upload to GitHub Pages)
├── .well-known/
│   └── assetlinks.json     ← Links app to website (upload to GitHub Pages)
├── build.gradle            ← Root Android build file
├── settings.gradle         ← Android project settings
├── gradle.properties       ← Gradle config
├── gradle/wrapper/
│   └── gradle-wrapper.properties
└── app/
    ├── build.gradle        ← App-level build config (★ edit this)
    └── src/main/
        ├── AndroidManifest.xml  ← App config (★ edit the URL here)
        └── res/
            ├── values/
            │   ├── strings.xml
            │   ├── colors.xml
            │   └── styles.xml
            └── drawable/
                └── splash.xml

---

Good luck publishing! 🚀
