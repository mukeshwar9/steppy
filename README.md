# Steppy

Steppy is a step-count leaderboard for groups of friends. Add friends by code, put them in a
group, and see who walked the most today, this week, this month and over the last three months.
Groups can run weekly and monthly challenges with live standings and a winner at the end.

Steps come from the phone's health store: Apple Health on iOS and Health Connect on Android.
Apple Watch, Galaxy Watch, Pixel Watch, Zepp/Amazfit and most other wearables already write into
those. On first connect the app imports the last 90 days, so leaderboards are full from day one.

How it is built, and what was kept from the earlier scaffold: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository

```text
packages/core   API contract and shared calendar/ranking rules (used by API and app)
apps/api        NestJS + Prisma + Postgres API with Socket.IO realtime
apps/mobile     Expo (React Native) app for iOS and Android
scripts/        dev-db.sh (local Postgres), with-env.sh (loads .env)
```

## Requirements

- Node 22 and pnpm 10 (`corepack enable`).
- Postgres 16: either Docker, or Postgres binaries on your PATH (`initdb`, `pg_ctl`, `psql`, for example from Homebrew).
- For iOS: Xcode with an iOS Simulator runtime, and CocoaPods (see below).
- For Android: Android SDK (platform 36), NDK 27, and JDK 17 or newer (JDK 21 works).

## Run the API locally

```sh
pnpm install
cp .env.example .env            # dev defaults; DEMO_MODE=true
pnpm db:start                   # Postgres on localhost:54329 (Docker if running, else local binaries in .pgdata/)
pnpm db:migrate                 # apply migrations
pnpm db:seed                    # demo group, synthetic friends, 90 days of history, challenges
pnpm dev:api                    # http://localhost:3000, watch mode
```

`curl localhost:3000/health` should return `{"ok":true}`. Stop Postgres with `pnpm db:stop`;
`scripts/dev-db.sh reset` wipes the local data directory.

Demo accounts after seeding (password `steppy-demo`): `demo@steppy.app` (owns the "Steppy Demo"
group) and five synthetic friends such as `ava@demo.steppy.app`. With `DEMO_MODE=true` their
steps grow every minute, so leaderboards move while you watch. The app's "Try the demo" button
creates a guest account with its own private demo group of the five synthetic friends (guests
are removed after 7 days).

## Tests

```sh
pnpm db:start                   # the API tests use the steppy_test database
pnpm --filter @steppy/core test # calendar, settle, ranking, challenge rules
pnpm test:api                   # API integration tests against Postgres
pnpm --filter @steppy/mobile test  # sync planning, demo generator, app helpers
pnpm typecheck
```

Simulator end-to-end flows (Maestro) are described in [apps/mobile/e2e/README.md](apps/mobile/e2e/README.md).

## Run the app on the iOS Simulator

The native projects are generated from `apps/mobile/app.config.ts`; `ios/` and `android/` are not
committed.

CocoaPods is required. If you don't have it, `brew install cocoapods` is the simplest option. To
keep it inside the repo instead (works with the macOS system Ruby 2.6):

```sh
export GEM_HOME="$PWD/.tools/gems" GEM_PATH="$PWD/.tools/gems" PATH="$PWD/.tools/gems/bin:$PATH" LANG=en_US.UTF-8
gem install --no-document ffi:1.16.3 activesupport:5.2.8.1 minitest:5.15.0 concurrent-ruby:1.1.10 i18n:1.8.11 tzinfo:1.2.11 cocoapods:1.15.2
```

Then, with the API running:

```sh
pnpm --filter @steppy/core build
cd apps/mobile
CI=1 npx expo prebuild --platform ios      # generates ios/ and runs pod install (a few minutes)

# Option A: development build with fast refresh (starts Metro)
npx expo run:ios --device "iPhone 17"

# Option B: standalone Release build for the simulator (no Metro needed)
xcodebuild -workspace ios/Steppy.xcworkspace -scheme Steppy -configuration Release \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath ../../.tools/dd build
xcrun simctl install booted ../../.tools/dd/Build/Products/Release-iphonesimulator/Steppy.app
xcrun simctl launch booted com.steppy.app
```

The app talks to `http://localhost:3000` on the iOS Simulator. Set `EXPO_PUBLIC_API_URL` before
building to point it elsewhere.

### Trying it in the simulator

- **Quickest:** tap **Try the demo**, then **Use demo steps**. You land in your own demo group
  with five friends whose steps move every minute, a live weekly and monthly challenge, and a
  finished one with a winner.
- **Real HealthKit path:** create an account, choose **Connect Apple Health** and allow access.
  The simulator has no step data, so open the **Me** tab and tap **Write sample health data**.
  It writes 90 days of realistic steps into the simulator's Health app, then syncs. You can also
  add data by hand in the simulator's Health app (Browse > Activity > Steps > Add Data). This
  button exists only in non-production builds.
- **Friends:** create a second account (another simulator, a phone, or `curl`), exchange friend
  codes on the Friends tab, create a group and share its invite code or link (`steppy://join/<code>`).

## Build the Android app

```sh
pnpm --filter @steppy/core build
cd apps/mobile
export ANDROID_HOME=~/Library/Android/sdk
CI=1 npx expo prebuild --platform android
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
cd android && ./gradlew assembleRelease     # or assembleDebug for a Metro-backed dev build
```

The standalone APK is `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`. It is signed with
the debug key, so testers can install it directly (`adb install`). It needs Health Connect, which is
built into Android 14+ and available from the Play Store for Android 9 to 13. The Android emulator reaches the
host API at `http://10.0.2.2:3000`. For a physical phone, build with
`EXPO_PUBLIC_API_URL=http://<your-computer's-LAN-IP>:3000` or a hosted API URL.

## How fresh are the numbers?

Live while you're in the app. Otherwise friends update roughly every 15 to 60 minutes (iOS
background delivery is hourly at best, Android background work runs every 15+ minutes, and both
are up to the OS). Each friend shows "updated X ago". Each day becomes final at 10:00 the next
morning, so late watch syncs still count, and challenge winners are decided once the last day
is final.

## Production builds

Build with `STEPPY_PRODUCTION=1` to drop the development-only health write permissions and the
sample-data button. Run the API with `pnpm --filter @steppy/api build && pnpm --filter @steppy/api start`
(`NODE_ENV=production`): it refuses to start without a strong `JWT_ACCESS_SECRET` (32+ characters)
and a `CORS_ORIGIN` list, and `DEMO_MODE` should be off.

## What is left before shipping to friends

- **Hosting:** the API needs a public HTTPS host with Postgres (for example Fly.io, Render or
  Railway with managed Postgres). Only one API instance for now: the finalizer, demo ticker and rate limiter
  run in-process.
- **Apple:** an Apple Developer account ($99/year), a HealthKit-enabled App ID, then TestFlight
  (internal testing needs no App Review; external testers need a short beta review). App Store privacy
  labels and a privacy policy URL before any public release.
- **Google:** a Play Console account ($25 one-time), the Health apps declaration and Health Connect
  permission justification (review can take about a week), then an internal testing track.
- **Not in v1:** push notifications ("Alex just passed you"), WHOOP/Oura/Google Health cloud
  sources, password reset and email verification, and widgets.
