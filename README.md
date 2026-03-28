# Capsule

Time-locked idea capture app. Drop thoughts, images, and audio into your box throughout the day. They're locked away until your daily review window opens.

## Features

- **Zero-friction capture**: text, images, audio
- **Time-locked review**: configurable daily unlock window
- **Offline-first**: all data stored locally, no accounts, no cloud
- **Biometric protection**: Face ID / fingerprint to enter review mode
- **Clock tamper detection**: prevents trivial time manipulation

## Tech Stack

- React Native (Expo) + TypeScript
- SQLite (expo-sqlite) for local storage
- Zustand for state management
- NativeWind (Tailwind) for styling

## Development

```bash
npm install
npx expo start
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full technical design.
