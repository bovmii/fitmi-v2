# Installing fit.mi on your iPhone

Two paths. Pick one.

## Path 1 — free, personal, 7-day rebuild (recommended to start)

Works with any free Apple ID. Certificate expires every 7 days; you
rebuild via Xcode when it does.

### One-time setup

1. Install Xcode from the App Store if you haven't already.
2. Open Xcode → **Settings → Accounts** → `+` → sign in with your
   Apple ID. A "Personal Team" appears under your account.
3. Plug in your iPhone with a USB-C / Lightning cable. Trust the
   computer on the phone.
4. From the repo:
   ```bash
   npm run open:ios
   ```
5. In Xcode, select the **App** target → **Signing & Capabilities** →
   set "Team" to your Personal Team. Repeat on the **FitMiWidgets**
   target once you've created it (see `ios-widgets/README.md`).
6. Pick your iPhone as the run destination (top-of-window dropdown) →
   press ⌘R.
7. First run: your phone will refuse to launch the app. Go to
   **Réglages → Général → VPN et gestion d'appareil → Personal Team**
   → Trust.
8. Tap the app icon on the phone. Done.

### Every ~7 days

The personal-team certificate expires. Open Xcode, pick the phone,
⌘R again. The app keeps its data (IndexedDB + Supabase) between
rebuilds so this is painless.

### What works

- All web features (nutrition, training, budget, habits, stats)
- Camera barcode scanner
- HealthKit data (after granting permission in the system prompt)
- Home-screen widgets (once you've done the Xcode widget setup)
- Capacitor haptics
- Status bar matching fit.mi theme
- Deep links from widgets back into the app via `fitmi://…`

### What doesn't

- Push notifications via APNs (not wired; local notifications do work)
- Background HealthKit sync (widget data only refreshes when you
  open the app)

## Path 2 — paid, 99 €/year, TestFlight

When the personal-team rebuild gets too annoying, upgrade. 90-day
validity per build, 100 internal testers, no more weekly rebuilds.

1. Enroll at https://developer.apple.com/programs/ — 99 €/year.
2. Wait for approval (usually 24 h).
3. In App Store Connect, create a new app named "fit.mi", bundle ID
   `com.bovmii.fitmi`.
4. In Xcode, change the Team from "Personal Team" to your paid team.
5. **Product → Archive**. When the archive is built, Organizer opens —
   click **Distribute App → App Store Connect → Upload**.
6. Wait 15–30 min for processing in App Store Connect.
7. In TestFlight (on App Store Connect), add yourself as an internal
   tester. Install the TestFlight app on your iPhone, sign in,
   accept the invite.
8. Install fit.mi from TestFlight. Every new Archive + Upload rolls
   out automatically.

Publishing to the public App Store is the same flow + a review
step. Not needed for a personal app.

## Troubleshooting

- **"Unable to install. Signing Required"** → you haven't trusted the
  profile in Réglages → Général → VPN et gestion d'appareil yet.
- **Widgets show placeholder data forever** → the App Group isn't
  enabled on both targets. See `ios-widgets/README.md`.
- **HealthKit prompt never appears** → check that both
  `NSHealthShareUsageDescription` and `NSHealthUpdateUsageDescription`
  are still in `ios/App/App/Info.plist`. If Capacitor regenerated the
  plist and stripped them, re-add.
- **Garmin watch data missing** → open the Garmin Connect app on
  iOS, Réglages → Health, Autoriser. Data then flows Garmin Connect
  → Apple Santé → fit.mi on next app launch.
