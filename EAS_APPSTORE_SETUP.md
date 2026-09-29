# Capsule — EAS + App Store Connect setup

Status as of 2026-09-20. **Nothing has been built or submitted** (no `eas build`, no `eas submit`, no git push) — this is groundwork so a build is one command away on your go.

## Done (headless, this session)
- **`eas.json`** — build profiles (development/preview/production) + submit config. `image: "latest"` (Xcode 26 SDK), `credentialsSource: "local"`.
- **Expo project linked** — `eas init` created **`@stegles/capsule`** (projectId `8eeca5f0-ef1e-4428-9a85-fd2738d4c35b`), written into `app.json`.
- **Signing key present** — shared ASC API key copied to `./.eas-creds/AuthKey_768FX6K6T7.p8` (gitignored). Key `768FX6K6T7`, issuer `56a5aece-9559-4025-aa93-83b3cd30d065`, team `HW33ND6228`.
- **Assets** — `icon.png` (1024, no alpha), `adaptive-icon.png`, `splash.png`, `favicon.png` generated from the icon you sent.
- **Bundle id** — `app.capsule` (iOS + Android) set in `app.json`.
- **App config** — permissions (camera/mic/photos/FaceID/calendar), plugins (router, secure-store, sqlite, notifications, calendar, asset).

## Remaining before a TestFlight build (each is quick; some need you)
1. **Create the app record in App Store Connect** *(needs the web UI — the shared ASC API key can create certs/profiles/bundle-ids but NOT app records)*. Create the Capsule app (bundle `app.capsule`), then copy its **Apple ID (ascAppId)** into `eas.json` → replace `REPLACE_WITH_CAPSULE_ASC_APP_ID`. Also do Pricing=Free + the "Data Not Collected" privacy questionnaire in the UI.
2. **Signing cert + provisioning profile** — either:
   - let **EAS manage credentials** on first build (simplest — drop `credentialsSource: "local"` or answer the prompt), or
   - mint them headlessly via the ASC API per the `ios-testflight-headless` runbook (RSA CSR → `POST /v1/certificates` → save `.p12` **legacy** format → `POST /v1/profiles`) and write `credentials.json`. (Not done autonomously — it creates Apple-side artifacts best paired with the actual build.)
3. **Bundle-id registration** — auto-handled when the app record is created, or `POST /v1/bundleIds` with the key.
4. **Build + submit (on your go — this is the "push" you asked me to hold):**
   ```
   cd .../BlackBox && . .../morningbrief/.eas-creds/eas.env
   eas build -p ios --profile production --non-interactive --no-wait
   # poll eas build:view <id> --json → then:
   eas submit -p ios --profile production --id <id> --non-interactive
   # then attach to an Internal TestFlight group via the ASC API (see runbook)
   ```

## Device smoke test before submit (from CAPSULE_BUILD_PLAN.md)
Capture text/image/audio → wait for window open → Face ID → review/delete/export/archive → re-lock → schedule change in Settings → notification fires (open / 10-min-before-close / missed) → "Add to Calendar" creates the recurring event → missed-window grace check → restart persistence → **confirm encrypted-at-rest** (text + media unreadable in the raw sandbox).

## Reference
- Full runbook: skill `ios-testflight-headless`; `rowebots/docs/IOS_HEADLESS_BUILD.md`.
- Shared team creds: `.../morningbrief/.eas-creds/` (EXPO_TOKEN in `eas.env`, ASC key `.p8`).
