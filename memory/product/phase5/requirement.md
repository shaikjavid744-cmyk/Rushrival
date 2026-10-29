# Phase 5 Requirement — Public Website

Version: phase-5. See `../overview.md` (F-30). Builds on Phases 1–4: FastAPI backend (/api/v1, server inbox/announcements, support tickets, catalog config, remote config), Expo game. Website lives in /app/frontend (React) at `/`; admin (Phase 6) at `/admin`.

## Goal
A polished, responsive, SEO-ready public website for Rush Rivals in the game's design language, fed by real backend content (no invented stats, reviews or announcements), with working support forms and legal/data pages.

## Functional requirements
- REQ-187 [always] The site shall have pages: Home, Features, Characters, Worlds, Boards, Power-ups, News (list + article), Download, FAQ, Support/Contact, Privacy Policy, Terms of Service, Cookie & Consent, Account & Data Deletion, 404, Service error.
- REQ-188 [always] Home shall show the logo, hero art, tagline "Run · Dodge · Collect · Compete", gameplay screenshots captured from the real game, and calls to action to Download and Features.
- REQ-189 [always] Characters, Worlds, Boards and Power-ups pages shall render from the backend catalog endpoint (names, art, unlock info).
- REQ-190 [always] News shall list only articles published via the admin panel, newest first, paginated.
- REQ-191 [state] While no articles are published, News shall show "No news yet — check back soon".
- REQ-192 [always] Download shall show a Google Play button only when remote config `store_url_android` is set; otherwise it shall show "Coming soon to Google Play" with no fake button.
- REQ-193 [always] The site shall not display player counts, ratings or reviews unless sourced from a real configured source. (none in this phase)
- REQ-194 [event] When a visitor submits the Contact form (name, email, category, message), the system shall create a support ticket and show "Thanks! Your ticket number is RR-xxxx".
- REQ-195 [unwanted] If form fields are invalid, then the system shall show inline errors ("Enter a valid email", "Message must be at least 10 characters").
- REQ-196 [always] The Contact form shall have spam protection: honeypot field, rate limit 5/hour/IP, minimum fill time 3 s.
- REQ-197 [unwanted] If ticket submission fails, then the system shall show "Something went wrong. Please try again." with the form contents kept.
- REQ-198 [event] When a ticket is created, the system shall email a confirmation to the visitor via Emergent-managed Resend.
- REQ-199 [always] Account & Data Deletion page shall explain in-app deletion and offer a web deletion request form (email + confirmation) that creates a deletion request.
- REQ-200 [always] Analytics on the website shall load only after the visitor accepts the cookie banner. (interpreted; no analytics provider is configured, so the banner stores the choice for future use)
- REQ-201 [always] Each page shall have unique title, meta description, Open Graph tags; the site shall serve /sitemap.xml and /robots.txt (robots disallow /admin).
- REQ-202 [always] Pages shall meet WCAG 2.1 AA basics: semantic headings, alt text, keyboard navigation, visible focus, 4.5:1 contrast.
- REQ-203 [always] Layout shall be responsive from 360 px to 1440 px.
- REQ-204 [unwanted] If the backend is unavailable, then content pages shall show the service-error state with Retry and static content remains readable.
- REQ-205 [always] FAQ shall render from backend content editable in admin, with accordion items.

## Quality requirements
```
Q-26 Tag: Web.Performance
     Scale: Lighthouse performance score, mobile
     Meter: Lighthouse on Home
     Must: 70   Plan: 90
Q-27 Tag: Web.SEO
     Scale: Lighthouse SEO score
     Meter: Lighthouse
     Must: 90   Plan: 100
Q-28 Tag: Web.Accessibility
     Scale: Lighthouse accessibility score
     Meter: Lighthouse
     Must: 90   Plan: 100
Q-29 Tag: Honesty
     Scale: fabricated stats/reviews/download buttons
     Meter: E2E review
     Must: 0   Plan: 0
Q-30 Tag: Visual.Quality
     Scale: matches game design language (navy, electric blue, gold, cartoon art)
     Meter: human/screenshot
     Must: consistent   Plan: premium game-studio look
```
