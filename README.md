# Steppy

Provider-independent social fitness MVP. Steppy imports daily steps, preserves source provenance, calculates long-term activity statistics, and lets users compete in challenges across device ecosystems.

## MVP vertical slice

Implemented path:

1. Register/login with email and password.
2. Connect `DeveloperHealthProvider`.
3. Start resumable five-year synthetic history import.
4. Read today, history, and personal statistics.
5. Create users/friends and challenges.
6. Join/invite participants.
7. Recalculate persisted challenge daily totals.
8. Stream leaderboard updates over Socket.IO after activity changes.

The mobile shell is React Native/Expo TypeScript. Android Health Connect is implemented for read-only daily steps in development builds; Apple Health and cloud providers remain pending.

## Architecture

Modular monolith API with a provider-independent domain package:

- `apps/api`: NestJS REST API, Prisma persistence, authentication, imports, social features, challenge aggregation, WebSockets, OpenAPI.
- `apps/mobile`: React Native/Expo client shell with React Navigation, TanStack Query, Zustand, and secure token storage.
- `packages/health-domain`: pure provider contract, source selection, statistics, and leaderboard ranking.
- `packages/shared`: API-facing validation schemas and DTO types.
- PostgreSQL: source-of-truth store. Redis is reserved for job coordination/rate limiting when import volume requires it.

### Folder structure

```text
apps/
  api/
    prisma/schema.prisma
    src/{auth,users,health,activity,challenges,friends,common}
  mobile/
    App.tsx
    src/{api,store,screens}
packages/
  health-domain/src/{provider,dedupe,stats,challenge}
  shared/src/index.ts
```

## Data model

Core tables: `User`, `RefreshToken`, `HealthConnection`, `DailyActivity`, `SyncJob`, `FriendRequest`, `Friendship`, `Challenge`, `ChallengeParticipant`, `ChallengeDailyTotal`, `Achievement`, `UserAchievement`, and `DevicePushToken`.

`DailyActivity` has one canonical row per user/local date. Source metadata retains provider, device, source record ID, and import timestamp. `HealthConnection` stores cursor/range/sync metadata, never provider secrets.

## Health provider contract

```ts
interface HealthProvider {
  provider: HealthProviderType;
  requestPermissions(): Promise<PermissionResult>;
  getConnectionStatus(): Promise<ConnectionStatus>;
  getAvailableDateRange(): Promise<DateRange | null>;
  getDailySteps(startDate: Date, endDate: Date): Promise<DailyStepRecord[]>;
  sync(options: SyncOptions): Promise<SyncResult>;
  disconnect(): Promise<void>;
}
```

Mobile-only providers implement native adapters and upload normalized daily records. Android Health Connect requests read-only `Steps`, uses platform daily aggregation, and uploads normalized records in batches. OAuth cloud providers will use backend adapters and encrypted server-side credentials.

## Historical synchronization

Developer imports use asynchronous `SyncJob` records. Android Health Connect imports run on-device: the native adapter requests permission, aggregates five years of daily steps, and uploads 250-record batches. Upserts make retries idempotent. Production scale should move cloud-provider work into BullMQ/Redis workers.

Provider sync is eventually consistent. The UI must display `lastSyncedAt`/job progress and never promise wearable real-time data.

## Deduplication

MVP uses an explicit primary source per user. A selected provider owns canonical steps. Secondary providers can be retained as provenance, but their overlapping records never add to totals. Apple Health/Health Connect adapters should request platform aggregate data, which is preferred over summing raw device samples. A future source reconciliation policy can compare coverage/confidence before changing canonical rows.

## Timezones

Activity records store `localDate` and `timezone`. Challenges store a fixed `timezone`; challenge boundaries are converted to local dates in that timezone, inclusive of those dates. This avoids treating UTC midnight as a user's activity day and gives every participant one shared challenge calendar. DST tests must cover provider adapters and challenge boundary conversion.

## Challenges and live leaderboard

`ChallengeDailyTotal` is the persisted aggregate. Activity changes identify active challenges for that user, refresh only affected challenge aggregates, and emit `challenge.leaderboard.updated`. Socket.IO clients authenticate, join only participant challenge rooms, and receive the ordered social DTO. Provider sync remains eventually consistent; leaderboard delivery is near-real-time only after backend ingestion.

## Security/privacy

- Access JWTs are short-lived; refresh tokens are long-lived, rotated, hashed, and never placed in AsyncStorage.
- Google Sign In is server-verified. Google client IDs are public; no Google client secret is bundled in mobile.
- Mobile tokens use iOS Keychain/Android Keystore via `expo-secure-store`.
- DTO validation, ownership checks, participant checks, helmet, CORS, and restricted social DTOs are enabled.
- Detailed activity endpoints are scoped to `/me`; friend/challenge responses expose totals and approved profile fields only.
- Do not log OAuth tokens, authorization headers, or raw health payloads.
- Production deployment requires TLS, secret manager-backed JWT/provider secrets, rate limiting, audit retention, and encrypted provider token storage.

## Local setup

Requirements: Node 22+, pnpm 10+, Docker.

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm dev:api
```

API: `http://localhost:3000`; Swagger: `http://localhost:3000/docs`.

Run mobile shell:

```bash
cp apps/mobile/.env.example apps/mobile/.env
# Set EXPO_PUBLIC_API_URL to your Mac LAN IP.
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:3000 pnpm --filter @steppy/mobile start
```

Android Health Connect requires a development build, not Expo Go:

```bash
cd apps/mobile
pnpm exec expo prebuild
pnpm exec expo run:android
```

The app requests only `android.permission.health.READ_STEPS`. It does not request write access.

For Android emulator, use `http://10.0.2.2:3000`. For iOS simulator, localhost works. Physical devices need the host LAN IP.

## Example vertical slice API calls

```bash
# register
curl -X POST localhost:3000/auth/register -H 'content-type: application/json' \
  -d '{"email":"alex@example.com","password":"password123","displayName":"Alex","username":"alex"}'

# connect Developer provider, then import five years
curl -X POST localhost:3000/health/DEVELOPER/connect -H "authorization: Bearer $ACCESS_TOKEN"
curl -X POST localhost:3000/health/import -H "authorization: Bearer $ACCESS_TOKEN" -H 'content-type: application/json' \
  -d '{"provider":"DEVELOPER"}'

Google Sign In setup:

```bash
cp apps/mobile/.env.example apps/mobile/.env
# Set GOOGLE_CLIENT_IDS in apps/api/.env.
# Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
# and EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in apps/mobile/.env.
```

`POST /auth/google` accepts a Google ID token or access token. API verifies Google audience, subject, issuer, and email verification before linking the account.

## Provider status

### IMPLEMENTED

- DeveloperHealthProvider: deterministic five-year fixtures, zero days, 20K+/30K+ days, and source metadata.
- Provider-independent interface and registry.
- Android Health Connect read-only Steps adapter with daily aggregation and batched upload.
- Auth, Google Sign In, user profile, health connections, resumable import job, stats, friends, challenges, Socket.IO leaderboard event.
- React Native navigation shell and secure token storage.

### PARTIALLY IMPLEMENTED

- Background import currently runs in API process; move to Redis-backed worker before production scale.
- Refresh-token rotation works but should use a token-ID lookup and device/session management before broad release.
- Mobile offline mutation queue remains to be added.
- Rate limiting, push notifications, achievements, privacy preference UI, and provider correction tombstones remain.

### REQUIRES PROVIDER APPROVAL / VERIFICATION

- Fitbit and Garmin cloud OAuth scopes, historical limits, webhooks, and commercial approval.
- Zepp/Amazfit and Samsung Health API/partner availability.
- Apple HealthKit native permissions, background delivery, and iOS entitlements.
- Android Health Connect native permissions, aggregation behavior, and background sync APIs.

### NOT YET IMPLEMENTED

- Apple Health native adapter.
- Health Connect background/incremental synchronization and provider correction reconciliation.
- Fitbit/Garmin/Zepp/Samsung adapters.
- Apple Sign In, password reset, email verification.
- Full offline queue, push notifications, production job worker, and load testing.

No provider is represented as working until its official API and credentials are verified.

## Testing

```bash
pnpm typecheck
pnpm test
pnpm build
```

Pure domain tests cover source selection and statistics. Add API integration tests against a disposable PostgreSQL database before shipping. Required cases include DST/timezone boundaries, import retries, corrections, duplicate records, provider overlap, challenge ties, join-midway behavior, and authorization.

## Phased plan

1. **Now:** runnable developer vertical slice and core contracts.
2. **Next:** API integration tests, worker queue, refresh-token session hardening, mobile onboarding/import progress, offline cache.
3. **Phase 1 providers:** native HealthKit and Health Connect development builds; verify permissions and aggregation behavior on devices.
4. **Phase 2:** Fitbit OAuth after API approval and scope review.
5. **Phase 3:** Garmin after API approval.
6. **Phase 4:** Zepp/Samsung only after feasibility confirmation.

Stop condition for MVP: two seeded users can import developer history, create/join one challenge, simulate updated activity through the same import pipeline, and receive an ordered leaderboard update without TypeScript/test failures.

## Current state and source feasibility (assessed 2026-09-27)

### Current state

- Working end to end: the backend MVP with the synthetic Developer provider (register, five-year import, friends, challenges, ranked leaderboard, `challenge.leaderboard.updated` event). Verified locally against Postgres.
- Android Health Connect: one-shot foreground import during onboarding only. There is no background or incremental sync, and without `READ_HEALTH_DATA_HISTORY` Health Connect returns only about 30 days before the permission grant, not five years.
- Not implemented: Apple Health (entitlements are empty), WHOOP, and Zepp. `POST /health/{APPLE_HEALTH,ZEPP,...}/connect` returns 501. The mobile app does not consume the Socket.IO leaderboard.
- Build and tests: `pnpm build` passes. `pnpm test` passes, but only the three `health-domain` tests exist; the API and mobile have none. `pnpm typecheck` fails on a clean checkout (`Cannot find module '@steppy/shared'`) because the root script builds only `health-domain` first.
- Known defects:
  - Connecting Health Connect while a Developer import is running leaves Developer canonical rows behind. `runImport` reads `primaryProvider` once, before its loop.
  - Import jobs run in-process and are not recovered after a restart, so an interrupted job stays `RUNNING` forever.

### Per-source import feasibility

| Source | Path | Steps | Where | Notes |
|---|---|---|---|---|
| Apple Watch / iPhone | HealthKit | Yes, via `HKStatisticsCollectionQuery`, which de-dupes watch and phone | On device only | Needs a dev/EAS build, not Expo Go. HealthKit plus background-delivery entitlements. App Store 5.1.1 and 5.1.3. |
| Android (phone, Galaxy, Pixel) | Health Connect | Yes, via `aggregate` with `COUNT_TOTAL` | On device only | Needs `READ_HEALTH_DATA_HISTORY` and `READ_HEALTH_DATA_IN_BACKGROUND`. Play Health apps declaration plus a permission justification. |
| Google Fit | Do not integrate | — | — | Sign-ups closed 2024-05-01 and the APIs end in late 2026. The Fit app syncs into Health Connect, so Fit users are covered there. |
| Helio / Zepp (Amazfit) | Via Apple Health or Health Connect | Yes, indirectly | Phone store | No public cloud API; the partner API is corporate-only. Users must enable Zepp's sync to Apple Health or Health Connect. |
| WHOOP | Cloud OAuth API v2 | Yes, `cycles.step_count` since 2026-09-23 | Server | Cycles run sleep to sleep, not calendar days. No step webhook, so the server polls. 100 requests/min, 10,000/day. The Sandbox tier allows 10 members. |

Aggregating across friends is feasible with the phone as the hub: HealthKit and Health Connect cover Apple Watch, Zepp/Helio, Android and Google Fit users, and WHOOP is the only cloud adapter. Paid aggregators (Terra, Junction and others, about $300–500 a month) still require their on-device SDKs, so they add little for this use case.

### Real-time vs app-open

Nothing is truly real-time.

- App open: seconds.
- iOS background: HealthKit background delivery for `stepCount` is capped at hourly, and HealthKit cannot be read while the device is locked.
- Android background: WorkManager runs every 15 minutes at best. Doze and standby buckets can delay it by hours.
- Wearable apps (Zepp, Watch) add their own sync delay before steps reach the phone store.
- WHOOP: freshness is the server's polling interval.

Product framing: "live while open, synced through the day, final next morning". Show `lastSyncedAt` for every participant.

### Prioritised next steps (one engineer)

1. Fix the typecheck script, the primary-switch race, and job recovery on boot: 0.5–1 day.
2. HealthKit adapter (`@kingstinct/react-native-healthkit`), entitlements, EAS dev build, observer plus background delivery: 3–5 days.
3. Health Connect history and background permissions, incremental resync of the last 7 days, WorkManager task: 3–4 days.
4. Sync on app open, `lastSyncedAt` UI, Socket.IO client on the challenge screen: 2–3 days.
5. Canonical-day service (primary source with fallback, manual-entry filter, settle window) plus API integration tests: 3–4 days.
6. Silent-push sync nudges (APNs/FCM): 2 days.
7. BullMQ worker for imports, rate limiting: 2 days.
8. WHOOP OAuth, poller, webhook-triggered polls, cycle-to-date mapping: 3–5 days.
9. Store compliance, TestFlight and Play internal testing: 2–3 days, plus about a week of review.

About 3–4 weeks to a friends beta (steps 1–6 and 9), or 4–6 weeks including WHOOP and the worker.

### Open product calls (parked)

These calls are parked for a decision. Recommendations:

- Multiple sources per user: primary source with fallback, never summed.
- WHOOP: defer to v1.1.
- Freshness promise: live while open, final next morning.
- Distribution: private TestFlight and Play internal testing.
- Build vs buy: build natively rather than use a paid aggregator.
