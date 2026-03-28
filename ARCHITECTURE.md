# Capsule App Architecture

This document outlines the proposed architecture for the Capsule time-locked idea capture app. The focus is an offline-first iOS MVP with a clear path to Android parity and future enhancements.

## Product pillars

- **Zero-friction capture**: quick capture for text, images, audio, and optional files.
- **Deterministic lock**: no access to items until the configured daily unlock time.
- **Offline-first & local-only**: all data stored locally with strong encryption; no accounts or cloud.
- **Minimal review flow**: simple list to review, delete, export, or archive when unlocked.

## Platform & tech stack

- **Client framework**: React Native (TypeScript) with React Navigation; reusable for iOS and Android. React Native Web can be adopted later for desktop/web parity without blocking mobile delivery.
- **State & data fetching**: React Query (TanStack Query) for async workflows (e.g., export) and optimistic UI; Zustand for lightweight app/session state (lock state, settings).
- **Forms**: React Hook Form for settings (time picker, toggles).
- **UI**: Tailwind-style utilities via nativewind for RN; Lucide icons for consistent visuals.
- **Local database**: SQLite/SQLCipher (encrypted) via expo-sqlite or react-native-sqlite-storage. Schema mirrors the required columns and uses a metadata JSON column.
- **Key management**: OS keychain/keystore for encryption key storage (react-native-keychain); the key unlocks SQLCipher and protects file blobs.
- **File handling**:
  - Images via camera or gallery (react-native-image-picker).
  - Audio notes via expo-av or react-native-audio-recorder-player with m4a output.
  - File attachments optional in MVP; if included, limit to PDF/txt using react-native-document-picker.
- **Notifications**: expo-notifications or native channels to deliver unlock and reminder alerts.
- **Testing**: Jest + React Testing Library for UI logic; Detox for basic E2E flows; unit tests for unlock logic and storage.

## Data model (SQLite table)

```sql
items (
  id TEXT PRIMARY KEY,
  type TEXT CHECK(type IN ('text','image','audio','file')),
  timestamp_created INTEGER NOT NULL,
  data_blob BLOB NOT NULL, -- encrypted
  metadata_json TEXT NOT NULL, -- JSON string, encrypted or integrity-protected
  reviewed_flag INTEGER DEFAULT 0
);
```

### Encryption
- Use SQLCipher to encrypt the database with a key stored in Keychain/Keystore.
- For large media, store files in app sandbox; persist only encrypted file URIs in the DB; encrypt files with AES-GCM using a file key derived from the master key.

### Metadata examples
MIME type, original filename, duration (audio), image dimensions, size, checksum for integrity.

### Retention
Optional auto-delete flag per item; configurable global auto-delete after review.

## Lock/unlock flow

1. User sets a daily unlock time (24h picker).
2. The app computes next unlock timestamp and persists it.
3. While locked, capture UI remains available, but list/review screens show a locked state with countdown.
4. When the device time passes the unlock timestamp:
   - App transitions into Review Mode.
   - Fetch and render all unreviewed items from the last cycle.
   - Enable actions: delete, export/share, archive, batch delete/export.
5. Exiting review mode re-locks the box and schedules the next daily unlock.

### Notifications
Optional "Box unlocked" and daily reminder notifications scheduled locally.

### Bypass protection
Gate review routes/components behind lock state; enforce checks before queries; verify system clock changes via monotonic timestamps and last unlock record to reduce trivial bypass.

## Capture UX

- **Text**: quick note input with immediate save; haptic feedback on success.
- **Image**: capture or pick; compress and encrypt before persistence.
- **Audio**: record button with timer; save m4a; show level meter if available.
- **Files** (optional): PDF/txt picker; validate size limits; warn user about unsupported types.
- **Latency target**: <100ms perceived lag by writing to SQLite on a background queue and using optimistic UI acknowledgements.

## Review Mode UX

- Sorted list by timestamp; grouped by capture day.
- Filters by type; badges for archived items.
- Item actions: delete, export (share sheet), archive; batch delete/export all.
- Optional "clear after review" toggle; confirmation dialogs for destructive actions.

## Offline/export considerations

- **Offline-only MVP**: no network calls required.
- **Export**: use OS share sheet with decrypted temporary files; clean up temp files post-export.
- **Backups**: rely on device backup policy; future phase can add encrypted cloud backup.

## Settings

- Unlock time picker (24h).
- Notification toggles (unlock alert, review reminder).
- Auto-delete after review (off by default).
- Haptics/theme toggles (lightweight theming only).

## Future phase alignment (stored, not implemented)

- Multi-box support with independent unlock timers and schemas.
- AI tagging/clustering using local or cloud LLMs.
- Opt-in cloud backup/sync (Supabase/Firebase) with end-to-end encryption.

## Recommended packages (RN ecosystem)

| Category | Packages |
|----------|----------|
| Core | react-native, react-native-safe-area-context, @react-navigation/native, @react-navigation/native-stack |
| State | @tanstack/react-query, zustand, @hookform/resolvers, react-hook-form |
| Styling | nativewind, react-native-svg, lucide-react-native |
| Storage | expo-sqlite + SQLCipher or react-native-sqlite-storage, react-native-keychain, react-native-fs |
| Media | expo-av (audio), react-native-image-picker (images), react-native-document-picker (files, optional) |
| Notifications | expo-notifications or native module alternative |
| Testing | jest, @testing-library/react-native, detox |

## Open questions

1. Do we enforce passcode/biometric gate before entering review mode?
2. Should we cap storage size or provide "space used" diagnostics?
3. How aggressively should we defend against manual clock tampering (e.g., monotonic clock checks, grace periods)?
