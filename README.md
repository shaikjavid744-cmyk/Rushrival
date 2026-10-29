# Rush Rivals — monorepo

An Android-first, portrait 3D endless runner, plus its website, admin/operations panel and backend.

| Requested layout | Lives in | Stack |
|---|---|---|
| `/game` | **`/app/mobile`** | Expo SDK 58 (React Native 0.88), expo-router. Three.js on expo-gl (3D), Skia fallback. AdMob, Play Billing and Firebase behind adapters. |
| `/website` | **`/app/frontend`** (public routes `/`, `/characters`, `/news`, `/support`, …) | React (CRA + craco), Tailwind, shadcn/ui |
| `/admin` | **`/app/frontend`** (routes under `/admin/*`) | same app, separate admin auth realm |
| `/backend` | **`/app/backend`** | FastAPI + MongoDB (Motor). Versioned API `/api/v1`, OpenAPI at `/api/openapi.json`. |
| docs | **`/app/docs`** | see below |

## Docs
- `docs/architecture/` — system design
- `docs/api/README.md` — every endpoint (player, public website, admin)
- `docs/database/README.md` — collections, validators, indexes, migrations, backup
- `docs/integrations/` — AdMob, Play Billing, Firebase, Resend, Google auth
- `docs/deployment/` — deploying the backend, database and website; env-var checklist; monitoring; incident response
- `docs/release-checklist/` — Android signing, Play Console steps, Data Safety, content rating, rollback
- `docs/testing/` — how to run every test suite, latest real results, device-only test list
- `docs/store-assets/` — Play listing icon, feature graphic, screenshots, descriptions
- `docs/screenshots/` — phase screenshots (`final/` holds the release set)

## Quick start (one command per surface)
```bash
cd /app/mobile   && npx jest                                     # game unit tests
cd /app/backend  && python -m pytest tests -q --ignore=tests/test_health.py
cd /app/frontend && yarn build                                   # website + admin build (CRA eslint runs during the build)
```

## Android identity
- Application ID: `com.velactra.rushrivals`
- Version: 1.0.0 (versionCode 1)
- targetSdk: 36

See `docs/release-checklist/README.md`.
