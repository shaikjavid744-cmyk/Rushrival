# Phase 7 Journeys — Testing, Android Build & Release Prep

- id: JRN-108
  steps: Run the documented test commands for mobile, backend and website.
  expected: All pass; results recorded in /app/docs/testing with date and counts.
- id: JRN-109
  steps: Inspect app.config.js / eas.json.
  expected: Package com.velactra.rushrivals, version 1.0.0 (1), dev/preview/production profiles, targetSdk documented, plugins conditional.
- id: JRN-110
  steps: Run `npx expo prebuild --platform android --no-install` (or config check) locally.
  expected: Completes without config errors.
- id: JRN-111
  steps: Request a password reset and submit a website contact form with a real address.
  expected: Email delivered, or docs state the exact reason it cannot be delivered.
- id: JRN-112
  steps: Open /app/docs/release-checklist and store assets folder.
  expected: Feature graphic, icon, 6+ real screenshots, descriptions; Data Safety and content rating answers based on actual behaviour.
- id: JRN-113
  steps: Grep repo for keys, keystores, service account JSON.
  expected: None committed; .gitignore covers them.
- id: JRN-114
  steps: Background the app mid-run and resume (web visibility change).
  expected: Run paused, 3D scene restores, no crash.
