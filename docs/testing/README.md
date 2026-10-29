# Testing — Rush Rivals

## One command per surface (REQ-248)
| Surface | Command | What it covers |
|---|---|---|
| Game (mobile) | `cd /app/mobile && npx jest` | Engine (player, spawner, trains, collision/score), save/economy, monetization adapters, published-catalogue overrides, 3D lifecycle (REQ-249) |
| Game typecheck | `cd /app/mobile && npx tsc --noEmit` | 0 errors outside the template's `src/theme.ts` (3 errors, unchanged: an RN 0.88 `StyleSheet.NamedStyles` type) |
| Backend | `cd /app/backend && python -m pytest tests -q --ignore=tests/test_health.py` | Auth matrix, idempotency + 50-way concurrency, forged runs, rate limits, migrations, billing/RTDN, public site, admin permission matrix (every endpoint × 7 roles), audit, secret scan, four-eyes, rollback, live API suite against the preview URL |
| Website + admin | `cd /app/frontend && yarn build` | Production build. CRA's ESLint runs during the build ("Compiled successfully", 0 warnings). |
| Game E2E / screenshots | `python3 /app/tests/rr3d/p7_final_shots.py` | Onboarding → menu → every screen → run (3D, SwiftShader) → roof → power-ups → background/resume → crash → revive → game over |
| Email | `cd /app/backend && python scripts/email_check.py` | Real sends through Emergent-managed Resend (see below) |

`tests/test_health.py` needs `EXPO_PUBLIC_BACKEND_URL` exported, so it is excluded from the default command. The live suite `tests/test_phase56_live_api.py` hits the preview URL, and its contact test needs a fresh 5/hour/IP rate-limit bucket, which you get by restarting the backend.

## Latest real results (2026-09, Phase 7)
| Surface | Result |
|---|---|
| Mobile Jest | **119 / 119 passed** (11 suites) |
| Backend pytest (incl. live API suite) | **90 passed, 1 failed → 91 / 91 after rerun.** The failure was the live contact test hitting the in-memory 5/hour rate limit already used by earlier runs. After a backend restart it passed (1 passed). Earlier this phase, `test_migrations_up_down_up` once failed with an `AutoReconnect` from the shared dev MongoDB and passed on rerun. |
| Website/admin `yarn build` | **Compiled successfully** (exit 0). Separately, the stricter workspace ESLint config reports 50 style findings: unescaped apostrophes, a `jsx-key` false positive on a route table, and shadcn `calendar`/`command` internals. None of them block the build. |
| Website/admin E2E | Iterations 6–7 by the web specialist: passed |
| Phase 5/6 API (testing agent, iteration 11) | 23/23 live tests passed after its `.test` login fix. I then fixed its 4 open bugs (covered in `test_phase56.py`). |
| `npx expo-doctor` | **20/20 checks passed** |
| `npx expo prebuild --platform android --no-install` | **✔ Finished prebuild, exit 0** (package, versionCode, targetSdk 36 verified in the generated Gradle files) |
| 3D lifecycle (web, JRN-114) | Hiding the page → `{suspended:1, live:false}`, phase `paused`. Showing it again → `{ready:2, live:true}` (scene rebuilt), no errors |
| Email (JRN-111) | Proxy returned 202 Accepted for the **password reset**, the **website contact confirmation** (`confirmation_email_sent: true`) and the **admin ticket reply** (`email_sent: true`), all sent to `delivered@resend.dev`. A reply to a demo `*.test` address returns `email_sent:false, email_error:"undeliverable_recipient"`. |

### Email diagnosis (REQ-246)
The "Email not sent" message was **not** a broken integration. The key, endpoint and `from_name` all match the Emergent playbook. The tickets were addressed to seeded `*.test` / `@demo.rushrivals.test` addresses, and the proxy **blocks recipients it predicts will bounce** (HTTP 422 "Undeliverable recipient", to protect the shared sending domain). Now:
- The real reason is stored on the ticket (`email_error` / `confirmation_email_error`) and shown in admin Tickets.
- Paused billing states are reported as `email_unavailable`: `insufficient_credits`, `integration_disabled` and `daily_limit_reached`.
- The sender address is platform-managed and can't be changed. Only the display name (`EMAIL_FROM_NAME`) and the Reply-To can be set.

## Device-only tests (cannot be done in Expo Go / web preview)
Run these on the internal-testing build on ≥ 2 physical devices (one low-end Android 8/9 with ~2 GB RAM, one modern Android 15/16):
1. **3D performance:** steady ≥ 50 fps on Medium graphics, and no thermal throttling over a 10-minute run. Low graphics is playable on the low-end device.
2. **Background / resume / low memory (REQ-249):**
   - Home button mid-run → return: the run is paused and the scene restores.
   - Open 10+ heavy apps → return: no crash, scene rebuilt.
   - `adb shell am send-trim-memory com.velactra.rushrivals RUNNING_CRITICAL` mid-run → no crash.
3. **AdMob:**
   - UMP consent form (EEA VPN).
   - Rewarded revive, double coins and Leo/Galaxy progress grant **only** on the earned-reward callback.
   - Interstitial caps.
   - Child mode sends `tagForChildDirectedTreatment` with non-personalised ads.
   - With production IDs on the internal track: real ads fill.
4. **Play Billing (license testers):**
   - Buy gems and coins.
   - Pending (slow card) → completes later.
   - Cancel.
   - Restore on reinstall.
   - Refund in Play Console → RTDN/voided → currency clawed back.
   - Parental gate in child mode.
5. **Firebase** (after adding `google-services.json`): test crash appears in Crashlytics, analytics events in DebugView, and the notification icon renders white.
6. **Google sign-in** with the release SHA registered. Email/password sign-in and the reset code email arrive at a real inbox.
7. **Offline:**
   - Airplane mode → play runs, then reconnect → sync queue flushes.
   - Cold start offline uses the cached published catalogue.
8. **Back button**, notch/cutout safe areas, small screens (360×640) and tablets.
9. **Install size** (< 150 MB AAB download) and cold start < 4 s on the low-end device.

## Not verified here (honest status)
- Real AdMob fill, real Play Billing charges, RTDN delivery, Firebase/Crashlytics and native 3D performance: **unverified until there is a device build with the owner's accounts**.
- **No EAS cloud build was run**, because there is no Expo token in this workspace. On Emergent, use Publish → build.
