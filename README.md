# Tsinat · ጽናት

Offline-first Android app for progressive workout planning, logging and habit tracking. Push-ups first; routines for anything in the catalog.
**Ethiopian (Habesha) calendar by default**; Gregorian (G.C) is a setting. No account, no backend, no internet needed.

## Build (GitHub Actions only)
1. Create a GitHub repo, unzip this project into it, push to `main`.
2. Open **Actions → Android debug APK**. It runs the tests, builds the web app, generates the Android project (`cap add android`), adds permissions, and runs `gradlew assembleDebug`.
3. Download the `tsinat-debug-apk` artifact, install `app-debug.apk` on the phone (allow unknown sources).
4. The run also uploads `package-lock.json`; commit it for reproducible builds.

## Stack
React + TypeScript + Vite, Capacitor 7 (Android), SQLite via `@capacitor-community/sqlite`, `@capacitor/local-notifications`. Pure-TypeScript domain layer (no UI/DB imports) so the rules are unit-tested on real SQLite with `npm test` (Node 22).

## Layout
`src/domain` rules (calendar, goals, planner, progression, habit, analytics, reminders) · `src/data` Db interface, migrations, repository · `src/services` use-cases · `src/platform` Android adapters · `src/ui` screens · `tests` · `docs/DESIGN.md` definitions and decisions.

## Status (honest)
Verified here: 24 automated tests pass (domain + service + persistence on real SQLite, incl. restart, migrations, duplicate prevention, rollback); core code type-checks with `tsc`.
**Not verified (no network/device here):** `npm install`, Vite build, Gradle/APK build, the UI on a device, Capacitor SQLite and notification behavior (permission, reboot, Doze delays). The first CI run is the first real build; send me the log if it fails.
Not implemented: export/backup/restore, automatic plans for plank/squat/pull-up (catalog + manual routines work), plan revision of past weeks, UI tests.
