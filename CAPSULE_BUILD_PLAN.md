# Capsule — Deep Dive & Build Plan
**Date:** 2026-09-20 · **Repo:** `productivity/BlackBox` (app internally branded **Capsule**, bundle `app.capsule`) · **Mockup:** `mockup/index.html` → capsule.bordernetworks.tech

## What it is
A **time-locked idea-capture app**. Drop text / images / audio into your box through the day; items stay **locked** until a configurable **daily review window** opens. Offline-first, local-only, Face-ID-gated review. The point: capture without acting/judging in the moment — a forced daily cooldown so ideas settle before you decide.

## Scope decision (confirmed with Matt 2026-09-20)
- **v1 = ON-DEVICE ONLY.** Local encrypted storage, biometric gate, daily time-lock cycle, capture (text/image/audio), review (list/delete/archive/export), settings. No accounts, no backend, no cloud.
- **Paid tier (LATER, not v1):** cloud backup + multi-device sync layered on top. Architect the storage/sync boundary now so it can be added without a rewrite, but do not build it.

## Current state (from full static audit)
**~90% of a real app, not a scaffold** — the capture→SQLite→review data flow connects end to end. Dormant since ~2026-05-30 (3 commits), never built to TestFlight.
- **Working & wired:** AppRoot orchestration (10s lock-poll, auto biometric prompt on window open, screen routing); Onboarding (3-step); Locked/capture home (countdown, item count, text/image/audio capture modals → sandbox + SQLite); Review Mode (loads unreviewed items, per-item delete/archive/export, delete-all, auto-lock at window end); SQLite CRUD; persistence; haptics; notifications (schedules a daily unlock notification).
- **Stack:** Expo SDK 52 / RN 0.76 / expo-router 4 / TS / Zustand / NativeWind / lucide. Coherent and buildable, mildly stale (run `expo install --check` before shipping).

## Gap list to a TestFlight-ready on-device v1
Ordered; tags: **[blocker]** ships-stopper · **[important]** correctness/quality · **[polish]** nice-to-have.

1. **[blocker] App icon + splash assets.** `app.json` points at `./assets/icon.png` which doesn't exist (`assets/` has only `.gitkeep`). Need 1024² icon, splash image, Android adaptive icon. (~1–2h + design)
2. **[blocker] `eas.json` + EAS project setup.** None exists. Add build profiles (development/preview/production) + submit config; `eas init`; register bundle `app.capsule` in App Store Connect. Use the headless-TestFlight path (ASC API key + local credentials). (~half day)
3. **[blocker] Fix Settings — schedule is unchangeable.** The Unlock Time / Review Window rows are static `<Text>` with no picker/onPress; `updateUnlockTime`/`updateWindowDuration` exist but are never called. User is locked into onboarding choices forever. Wire hour picker + duration selector (reuse onboarding UI). (~2–3h)
4. **[blocker] Encryption story — resolve the false claim.** README/architecture say "encrypted at rest" but data is **plaintext**: `openDatabaseAsync('capsule.db')` with no key, text stored plaintext, media copied unencrypted into the sandbox; `expo-secure-store` is declared but unused. Choose:
   - **(a) Real at-rest encryption:** random 256-bit key in `expo-secure-store` + SQLCipher (via `op-sqlite` or the expo-sqlite SQLCipher config plugin, needs a prebuild) + AES-GCM for media blobs. (~1–3 days)
   - **(b) Fast honest MVP:** ship on device file-protection, **downgrade the wording** to "protected by device security + Face ID," and move real encryption to the paid/next milestone. Do **not** ship the strong claim over plaintext.
5. **[important] Cross-midnight window bug.** `getWindowEndDate`/`isWithinReviewWindow` build the window from *today's* unlock time only, so a late unlock hour with a window crossing 00:00 never opens. Port IdeaBox's `computeNextUnlock`/`advanceCycle` model; anchor the window to the actual unlock moment (`lastUnlock`), not wall-clock. (~half day + tests)
6. **[important] Honor notification toggles.** `notifyOnUnlock`/`notifyReminder` are stored but ignored — a notification is always scheduled and "Daily Reminder" does nothing. Gate scheduling on the toggles; implement or hide the reminder. (~2h)
7. **[important] Config plugins.** Add `expo-notifications` (and confirm `expo-av`/`expo-image-picker`) plugins to `app.json` for production entitlements. (~1h)
8. **[important] Clock-tamper: fix or document.** Setting the clock *forward* opens the box early with no defense (only backward jumps are caught). Add a monotonic guard (persist last-seen max timestamp; flag large forward jumps) or explicitly accept + stop advertising "tamper detection" beyond what's real. (~half day)
9. **[polish]** Prune dead deps (`react-hook-form` unused). Add real tests (port IdeaBox's `timeLock` Jest test + `jest-expo` + `@testing-library/react-native`; zero tests today). Biometric currently fails open (no hardware/enrollment → granted) — confirm desired, else add passcode fallback. On-device smoke test before submit.

**Fastest honest route to TestFlight:** items 1, 2, 3 + choose **4(b)** (defer real encryption, correct the wording) + 5, 6 ≈ **2–3 focused days** to a genuinely usable, honestly-described MVP. Real at-rest encryption (4a) is the one scope choice that adds days + a prebuild step.

## Standard iOS app structure (align to our shipped apps: Basic Budget, Rowe Bots)
Target layout for consistency + the headless build pipeline:
```
capsule/                     # rename repo/dir to the product name (retire "BlackBox")
  app/                       # expo-router entry (_layout.tsx, index.tsx)
  src/
    screens/  components/  stores/  lib/  db/
  assets/                    # icon.png, splash, adaptive-icon  ← currently missing
  app.json                   # name/slug/bundle/permissions/plugins
  eas.json                   # build + submit profiles          ← currently missing
  .eas-creds/ (gitignored)   # ASC API key .p8, EXPO_TOKEN, credentials.json
  package.json  tsconfig.json  babel.config.js  tailwind.config.js
  README.md  CAPSULE_BUILD_PLAN.md
```
Then per the `ios-testflight-headless` runbook: local credentials (self-mint cert/profile via ASC API), `image:"latest"`, ASC key path symlinked on woody, submit + attach to an Internal TestFlight group. Consolidate: **retire `IdeaBox`** after harvesting its `timeLock.ts` cycle logic + Jest test.

## Recommended next steps (awaiting Matt)
1. Review the mockup at capsule.bordernetworks.tech.
2. Decide the encryption path: **4(a) real now** vs **4(b) defer + honest wording**. This is the one decision that sets the timeline.
3. On go: knock out blockers 1–3, apply chosen 4, then EAS build → TestFlight (with explicit build approval — no unprompted iOS builds).
