# iOS home-screen widgets — Xcode integration

The JavaScript side is already wired: every time the app updates
water / habits / calories / budget / shopping / meals, it calls
`pushWidgetData({...})` in `core/widgets.js`, which hands the payload
to a native Capacitor plugin called `WidgetBridge`. That plugin writes
the payload into an App Group UserDefaults bucket the widgets read
from, then calls `WidgetCenter.reloadAllTimelines()`.

All the code you need is in this folder. The **one** thing that can't
be automated from the terminal is the Xcode target wiring. Follow
the steps below once, then every subsequent `npm run sync` keeps the
native side fresh.

## 1. Open Xcode

```bash
npm run open:ios
```

## 2. Wire the Capacitor plugin (so JS can push data)

1. In the Xcode project navigator, expand `App` → right-click the
   `App/App` group → **New Group** → `plugins` → inside it, **New Group**
   → `WidgetBridge`.
2. Drag `ios-widgets/WidgetBridge.swift` and
   `ios-widgets/WidgetBridgePlugin.m` into the new `WidgetBridge`
   group. In the dialog, check **Copy items if needed** and make sure
   the **App** target is ticked.
3. If Xcode asks whether to create an Objective-C bridging header,
   accept — the plugin lives in a mixed Swift/ObjC target.
4. Build once (⌘B). You should see no errors.

## 3. Create the Widget Extension target

1. **File → New → Target…** → iOS → **Widget Extension**.
2. Product Name: `FitMiWidgets`. Language: Swift. **Uncheck** "Include
   Configuration Intent" and "Include Live Activity".
3. Click Finish. Xcode generates a `FitMiWidgets` folder with a
   placeholder `FitMiWidgets.swift`.
4. Open that generated file and replace its contents with the contents
   of `ios-widgets/FitMiWidgets.swift` from this repo.

## 4. Enable the App Group on both targets

The widget and the app both read/write to
`group.com.bovmii.fitmi`, which is what glues them together.

1. Select the Xcode project → Targets list → **App**.
2. **Signing & Capabilities** tab → `+ Capability` → **App Groups**.
3. Click `+` under the App Groups box → type
   `group.com.bovmii.fitmi` → Done. Tick the checkbox next to it.
4. Repeat on the **FitMiWidgets** target (same App Group ID, same
   checkbox).

If Xcode complains about provisioning, sign in with your Apple ID
under Xcode → Settings → Accounts, then go back to Signing &
Capabilities and let it manage signing automatically.

## 5. Build & install

1. Plug in your iPhone, pick it as the run destination, hit ⌘R.
2. After the app installs, long-press the home screen → `+` → search
   for "fit.mi" → you should see the six widgets.
3. Add any of them. Each tile deep-links back into the app via its
   `fitmi://…` URL.

## 6. Refreshing after code changes

- Changes to web code (`index.html`, `modules/*`, etc.) → `npm run sync`.
- Changes to the widgets (`FitMiWidgets.swift`) → edit inside Xcode,
  build, re-run.
- Changes to `WidgetBridge.swift` → same, plus Xcode rebuilds the App.

## 7. Troubleshooting

- **Widget shows placeholder values forever** → the App Group isn't
  wired on one of the two targets. Double-check both in Signing &
  Capabilities.
- **"Widget has no content"** → first install of the app hasn't
  pushed anything yet. Open fit.mi once and perform any mutation
  (log a glass, tap a habit, etc.); the widget refreshes within a
  minute.
- **Deep link taps do nothing** → Info.plist already declares the
  `fitmi://` scheme. If you edited `Info.plist`, make sure the
  `CFBundleURLTypes` block is still present.
