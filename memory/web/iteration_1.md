# Web iteration 1

## Built
### Public site (`/`, SiteLayout: sticky header, mobile menu, footer "Velactra Game Studio", cookie banner, skip link)
| Route | Page | API |
|---|---|---|
| `/` | Home (hero w/ logo + Rush art, core loop, real gameplay screenshots, characters/worlds teasers, download band) | `/public/catalog` |
| `/features` | Features | static |
| `/characters` `/worlds` `/boards` `/power-ups` | CatalogPage(kind) | `/public/catalog` (module cache) |
| `/news`, `/news/:slug` | NewsList (cursor "Older news"), Article (plain text → paragraphs, `## ` heading) | `/public/news`, `/public/news/{slug}` |
| `/download` | Google Play button only if `store_url_android`, else "Coming soon to Google Play" | `/public/site-config` |
| `/faq` | shadcn Accordion | `/public/faq` |
| `/support` (`/contact` alias) | Contact form: form-token, honeypot `website`, client+server validation, 429/spam/expired handling, keeps input on 500 | `/public/contact/form-token`, `/public/contact` |
| `/privacy` `/terms` `/cookies` | Legal docs; cookies page shows + changes choice | — |
| `/account-deletion` | in-app steps + web request form | `/public/data-deletion` |
| `*` | branded 404 (noindex) | — |

### Admin (`/admin`, AdminAuthProvider wraps only the admin realm)
- `lib/api.js` adminRequest: `credentials: include`, `X-CSRF-Token` on non-GET, `Idempotency-Key` for compensation, 401 → expire() → redirect to `/admin/login` with reason.
- Login.jsx: password → enroll (QR via qrcode.react + secret; enrol called once per mfa_token, StrictMode-safe) or challenge → `/admin`. Lockout (423), rate limit (429), wrong code messages.
- Sections (perm): Dashboard(dashboard:view), Players + detail + deletion requests (players:view), Reports (reports:view), Transactions (economy:view), Catalogue (catalog:view), Live-ops (liveops:view), News & FAQ (content:view), Remote config list + version (config:view), Maintenance & flags (config:view; toggles need config:publish), Purchases (purchases:view), Tickets list/detail (tickets:view), Releases (release:view), Audit (audit:view), Admins (admins:manage_admins), My profile.
- Catalogue / Live-ops / Releases edits → `draftFrom()` = copy `/config/published` → mutate → `POST /config/drafts` → navigate to `/admin/config/:v` (diff, request approval, approve/reject, publish, rollback).
- ConfirmDialog (reason / typed word) for every destructive action.

## Decisions
- No react-helmet: `useSeo` mutates document head (React 19 compatible).
- Fonts bundled from `src/assets/fonts` (CRA css-loader can't resolve `/fonts/...`).
- Store products in Catalogue are read-only (shop is code-defined in backend, not part of remote config).
- Removed PostHog snippet from `public/index.html` (analytics must not load before consent).

## Test data created during verification
- Admin `web.viewer@rushrivals.test` (viewer) created to test enrolment, then DISABLED.
- Config v13 (Zoe 20,000) published by publisher, then rolled back → v14 (same data as v12).
- Compensation +500 coins to player@rushrivals.test (TEST_ reason); ticket RR-000027 replied+closed; deletion request del_765feaa00e4346c3; test news article created, published, unpublished, deleted.

## Known / deferred
- Ticket reply emails not sent in preview (mailer gate) — UI shows "Email not sent".
- Purchase re-verify returns 503 without Play service account — UI shows a friendly toast.
- Idle timeout is client-side (30 min) + server-side expiry; not exercised in screenshots.
- Dependencies: qrcode.react@4.2.0
