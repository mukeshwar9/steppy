# Step sources and freshness

This keeps the source-feasibility assessment of 2026-09-27, which was written when the repository was
still the MVP scaffold, and records what v1 decided. The scaffold's "current state" and defect notes
from that assessment no longer apply: v1 replaced that code (see [ARCHITECTURE.md](ARCHITECTURE.md)).

## Per-source import feasibility

| Source | Path | Steps | Where | v1 status |
|---|---|---|---|---|
| Apple Watch / iPhone | HealthKit | Yes, via `HKStatisticsCollectionQuery`, which de-dupes watch and phone | On device only | **Implemented.** Needs a dev or EAS build, not Expo Go. HealthKit and background-delivery entitlements. App Store guidelines 5.1.1 and 5.1.3. |
| Android (phone, Galaxy, Pixel) | Health Connect | Yes, via aggregate `COUNT_TOTAL` | On device only | **Implemented** with `READ_HEALTH_DATA_HISTORY` and `READ_HEALTH_DATA_IN_BACKGROUND`. Needs the Play Health apps declaration and a permission justification. |
| Google Fit | Do not integrate | — | — | Sign-ups closed 2024-05-01 and the APIs end in late 2026. The Fit app syncs into Health Connect, so Fit users are covered there. |
| Helio / Zepp (Amazfit) | Via Apple Health or Health Connect | Yes, indirectly | Phone store | **Covered** through the phone store. There is no public cloud API, and the partner API is corporate-only. Users must enable Zepp's sync to Apple Health or Health Connect. |
| WHOOP | Cloud OAuth API v2 | Yes, `cycles.step_count` since 2026-09-23 | Server | **Deferred.** Cycles run from sleep to sleep, not by calendar day. There is no step webhook, so the server would have to poll. Limits are 100 requests/min and 10,000/day. The Sandbox tier allows 10 members. |

Aggregating across friends works with the phone as the hub: HealthKit and Health Connect cover Apple
Watch, Zepp/Helio, Android and Google Fit users, and WHOOP would be the only cloud adapter. Paid
aggregators (Terra, Junction and others, about $300–500 a month) still require their on-device SDKs,
so they add little here.

## Real-time vs app-open

Nothing is truly real-time.

- App open: seconds.
- iOS background: HealthKit background delivery for `stepCount` is capped at hourly, and HealthKit cannot
  be read while the device is locked.
- Android background: WorkManager runs every 15 minutes at best. Doze and standby buckets can delay it
  by hours.
- Wearable apps (Zepp, Watch) add their own sync delay before steps reach the phone store.
- WHOOP (if added): freshness is the server's polling interval.

v1 implements the freshness design described in [ARCHITECTURE.md](ARCHITECTURE.md#freshness): live while
open, synced through the day in the background, final at 10:00 the next morning, and "updated X ago" for
every member.

## Product calls taken for v1

| Call | v1 decision |
|---|---|
| Several sources per user | The phone's health store is the only source; its statistics APIs already merge watch and phone. If someone uploads from two phones, the latest upload for a day wins. Never summed. |
| WHOOP | Deferred to a later version. |
| Freshness promise | Live while open, final next morning. |
| Distribution | Private TestFlight and Play internal testing first. |
| Build vs buy | Built natively; no paid aggregator. |

## Later

- Visible push nudges ("Alex just passed you", "final hour of the challenge"), which also prompt a
  foreground sync.
- WHOOP OAuth with a server-side poller, then Oura and the Google Health API if friends use them.
- iOS widget and a Live Activity for a challenge's final hour.
