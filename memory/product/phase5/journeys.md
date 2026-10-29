# Phase 5 Journeys — Public Website

- id: JRN-80
  steps: Open the site home on mobile (390px) and desktop (1440px).
  expected: Logo, hero art, tagline, real game screenshots, Download and Features CTAs; no layout overflow.
- id: JRN-81
  steps: Open Characters, Worlds, Boards, Power-ups.
  expected: Items match the game catalog (6 characters, 6 worlds, 6 boards, 5 power-ups) with art and unlock info.
- id: JRN-82
  steps: Open News with no published articles; then publish one in admin and reload; open it.
  expected: "No news yet — check back soon"; then article appears in list and article page renders.
- id: JRN-83
  steps: Open Download with store_url_android unset; then set it.
  expected: "Coming soon to Google Play" with no button; then a Google Play button linking to that URL.
- id: JRN-84
  steps: Submit Contact with invalid email and short message; then valid data.
  expected: Inline errors; then "Thanks! Your ticket number is RR-xxxx" and ticket visible in DB/admin.
- id: JRN-85
  steps: Submit the form with the honeypot filled, within 1 s, or 6 times in an hour.
  expected: Rejected (no ticket); 6th returns rate-limit message.
- id: JRN-86
  steps: Backend returns 500 on submit.
  expected: "Something went wrong. Please try again." and form data kept.
- id: JRN-87
  steps: Open Privacy, Terms, Cookie & Consent, Account & Data Deletion; submit a deletion request.
  expected: Pages render; deletion request confirmation shown and stored.
- id: JRN-88
  steps: First visit; accept or reject cookie banner; reload.
  expected: Banner shows once, choice persists.
- id: JRN-89
  steps: Fetch /sitemap.xml, /robots.txt; check page titles/meta.
  expected: Sitemap lists public pages; robots disallows /admin; each page has unique title and description.
- id: JRN-90
  steps: Visit /does-not-exist.
  expected: Branded 404 with link Home.
- id: JRN-91
  steps: Navigate site with keyboard only.
  expected: All links/buttons reachable with visible focus; FAQ accordion operable.
