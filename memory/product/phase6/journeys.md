# Phase 6 Journeys — Admin & Operations Panel

- id: JRN-92
  steps: Seeded Owner signs in first time at /admin.
  expected: Forced TOTP enrollment (QR + secret); after valid code, dashboard opens. Wrong code rejected.
- id: JRN-93
  steps: Wrong password/TOTP 5 times.
  expected: Locked for 15 minutes with message.
- id: JRN-94
  steps: Owner creates Support, Moderator, Finance, LiveOps Editor, Publisher, Viewer admins; each signs in.
  expected: Each sees only permitted sections/actions; forbidden API calls return 403.
- id: JRN-95
  steps: Open Dashboard.
  expected: Metrics computed from DB (players, runs, purchases, tickets); Firebase/AdMob tiles say connection required; no invented numbers.
- id: JRN-96
  steps: Support searches player@rushrivals.test, opens detail, grants 500 coins with reason; repeats with same request.
  expected: Detail shows wallet, ledger, inventory, entitlements, masked tokens; grant applied once; audit entry exists.
- id: JRN-97
  steps: Moderator opens a player report, bans the player with reason and confirm.
  expected: Report status actioned; player's scores disappear from leaderboard; audit entry.
- id: JRN-98
  steps: LiveOps Editor drafts a config change (Zoe price 20,000, new event); views preview diff; requests approval; same admin tries to approve.
  expected: Diff shown; self-approval rejected.
- id: JRN-99
  steps: Publisher approves and publishes; app fetches config; then rollback to previous version.
  expected: App shows new price/event; rollback creates new version restoring old values; app reflects it.
- id: JRN-100
  steps: Toggle maintenance on (confirm), check app; toggle off.
  expected: App shows Maintenance screen; off restores.
- id: JRN-101
  steps: Create, preview and publish a news article and an FAQ item; unpublish.
  expected: Appears on website News/FAQ (and Inbox if selected); disappears on unpublish.
- id: JRN-102
  steps: Support opens a website ticket, replies, closes.
  expected: Reply appears in player Inbox (if linked account) and email sent; status closed.
- id: JRN-103
  steps: Finance opens Purchases, re-verifies one, revokes entitlement with reason.
  expected: Status updated; entitlement removed in app; ledger + audit entries.
- id: JRN-104
  steps: Owner opens Audit log, filters by admin, exports CSV.
  expected: All above actions listed with before/after; CSV downloads.
- id: JRN-105
  steps: Admin profile → revoke another session; Sign out everywhere.
  expected: Revoked session gets 401 on next call.
- id: JRN-106
  steps: Player JWT calls admin API; admin session idle 31 min.
  expected: 401/403; idle session expired, redirected to login.
- id: JRN-107
  steps: Edit missions, daily rewards calendar, a character's unlock rule via draft/publish.
  expected: App reflects changes after publish.
