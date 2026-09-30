# End-to-end flows (Maestro, iOS Simulator)

Maestro drives the real Release build on a booted iOS Simulator. The flows need a non-production build
(`STEPPY_PRODUCTION` unset, so the "Write sample health data" developer button exists) and the API in demo mode.

| Flow | What it covers |
|---|---|
| `demo.yaml` | Try the demo, onboarding with demo steps, private "Demo group" leaderboard (back button reads "Groups") (Today/Week/Month/3 Months), Daily view, live and finished challenge, Friends tab, Me tab sync status |
| `account.yaml` | Create account, write sample data into HealthKit (permission sheet), 90-day import, create group and weekly challenge, leaderboard with HealthKit steps, sign out and back in (Apple Health stays connected), delete account (old credentials get 401) |
| `social.yaml` | A second user (created through the API) becomes a friend, is added to the group in the app, then uploads steps with `PUT /steps`; the open leaderboard updates live over Socket.IO |
| `_signup.yaml` | Shared sub-flow (unique email account), not run on its own |

## Run

1. Start Postgres and the API (from the repo root, `.env` has `DEMO_MODE=true`):

   ```sh
   pnpm db:start && pnpm db:migrate && pnpm db:seed && pnpm dev:api
   ```

2. Build and install the app on the booted simulator (see the root README for the iOS setup):

   ```sh
   cd apps/mobile
   xcodebuild -workspace ios/Steppy.xcworkspace -scheme Steppy -configuration Release \
     -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath ../../.tools/dd build
   xcrun simctl install booted ../../.tools/dd/Build/Products/Release-iphonesimulator/Steppy.app
   ```

3. Install the Maestro CLI once (it is a zip, nothing global needed; Java 17+ required):

   ```sh
   mkdir -p .tools/maestro && cd .tools/maestro
   curl -sLO https://github.com/mobile-dev-inc/maestro/releases/latest/download/maestro.zip && unzip -q maestro.zip
   ```

4. Run the flows (from the repo root). Screenshots land in `.tools/e2e-shots/<run>/<flow>/takeScreenshot/`:

   ```sh
   export PATH="$PWD/.tools/maestro/maestro/bin:$PATH"
   cd apps/mobile/e2e
   maestro test --test-output-dir=../../../.tools/e2e-shots --debug-output=../../../.tools/logs/maestro demo.yaml
   maestro test --test-output-dir=../../../.tools/e2e-shots --debug-output=../../../.tools/logs/maestro account.yaml
   maestro test --test-output-dir=../../../.tools/e2e-shots --debug-output=../../../.tools/logs/maestro social.yaml
   ```

   `social.yaml` talks to the API at `http://localhost:3000`; pass `-e API=http://host:port` to change it.

## Notes

- Each flow starts with a cleared app state and keychain and creates its own account, so flows can run in any order.
- Maestro cannot see two iOS system prompts, so `_signup.yaml` taps them by screen position: the "Use Strong Password?"
  sheet (close button) and the "Save Password?" prompt ("Not Now"). The positions are for the iPhone 17 layout.
  The HealthKit permission sheet is visible to Maestro and is handled by text ("Turn On All", "Allow").
- Sample data: HealthKit is written once, then read back through `HKStatisticsCollectionQuery`. Tap
  "Write sample health data" *before* connecting (as `account.yaml` does) to import all 90 days. After connecting,
  days older than today's settle window were already uploaded and are frozen on the server, so only recent days change.
- Check the server side after `account.yaml`:

  ```sh
  PGPASSWORD=steppy psql -h localhost -p 54329 -U steppy -d steppy -c \
    "select u.email, count(*), count(*) filter (where steps > 0) nonzero, array_agg(distinct d.source)
       from \"DailySteps\" d join \"User\" u on u.id = d.\"userId\" where u.email like 'e2e-%' group by u.id"
  ```
