# RUNNING.md — Local, Mobile Debug, and Mobile Live-Driving Guide

Three ways to run **Bus Tracker** ([public/](public/)), from least to most realistic:

1. **Local** — desktop browser, no phone needed.
2. **Mobile debug** — real phone, fake GPS (simulation mode).
3. **Mobile live** — real phone, real GPS, while actually driving the route.

See [CLAUDE.md](./CLAUDE.md) for how the app works internally and
[SKILLS.md](./SKILLS.md) for build/deploy/project-setup reference.

## Prerequisites (all modes)

- Firebase CLI, via `npx firebase-tools` (no global install needed).
- Logged in with a Google account that has access to the `bus-tracker-fba2a`
  Firebase project:
  ```bash
  npx firebase-tools login
  npx firebase-tools use bus-tracker-fba2a
  ```
- A Google account to sign in with inside the app itself (this is separate from
  the Firebase CLI login above — the app uses `signInWithPopup` with Google Auth).

---

## 1. Local (desktop browser)

No GPS, no phone. Good for UI/logic changes and quick sanity checks.

```bash
npx serve public
# or, to match production Firebase Hosting config exactly:
npx firebase-tools emulators:start --only hosting
```

Open `http://localhost:<port>/index.html` → **Parent** or **Driver**.

- `public/*.js` are ES modules — you must load them over `http://`, not
  `file://`, or the browser will block them with a CORS error.
- On the Driver page, leave **"Use debug simulation" checked** (it's the
  default). This fakes a GPS position near each stop every 60 seconds, so you
  can exercise the whole start-trip → stops-passed → trip-completed flow with
  no location permissions at all.
- Open the **Parent** page in a second tab/window at the same time to watch the
  trip update live via Firestore `onSnapshot`.

---

## 2. Mobile debug mode (real phone, fake GPS)

Use this to confirm the UI, sign-in, and Firestore writes work correctly on an
actual phone browser before trusting it with a real drive. `navigator.geolocation`
requires a secure context (HTTPS, or `localhost`) — a plain `http://<lan-ip>`
URL will **not** get location permission on a phone, so this step uses a real
HTTPS URL via a Firebase Hosting preview channel.

1. Deploy a preview channel (does not touch the live site):
   ```bash
   npx firebase-tools hosting:channel:deploy mobile-test
   ```
   This prints an HTTPS URL like:
   ```
   https://bus-tracker-fba2a--mobile-test-xxxxxxxx.web.app
   ```
   It expires automatically after 7 days by default. Re-run the same command
   any time to redeploy your latest local changes to it, or to get a fresh URL
   once the old one expires.

2. On your phone, open that URL → **Driver**.

3. Sign in with Google.

4. **Leave "Use debug simulation" checked.**

5. Pick institution/route/direction, tap **Start Trip**. You'll see the status
   text update and, every 60 seconds, a simulated position near the next stop
   gets written to Firestore — no GPS permission prompt, no need to move.

6. Optionally open the same URL's **Parent** page on a second device (or your
   laptop) to watch the trip status, "stops passed," and "last bus update"
   fields update live.

7. Tap **End Trip**, or let it auto-complete once the simulation reaches the
   last stop.

---

## 3. Mobile live mode (real phone, real GPS, while driving)

This is the real deal: your phone's actual location feeds the tracker while you
drive the route.

⚠️ **Safety first.** Do not touch, look at, or interact with the phone while the
vehicle is moving. Set everything up and tap **Start Trip** *before* you start
driving, mount the phone somewhere secure (phone mount, cupholder, passenger's
lap), and have a passenger handle any screen interaction if one is needed
mid-drive. Ending the trip can wait until you're stopped/parked.

1. Deploy/reuse an HTTPS URL — reuse the same preview channel from mode 2, or
   deploy fresh:
   ```bash
   npx firebase-tools hosting:channel:deploy mobile-test
   ```
   (Real GPS also works on the production URL, `firebase deploy`, if you're
   ready to test against the live site.)

2. Before you start driving: open the URL on your phone → **Driver** → sign in
   with Google → pick institution/route/direction.

3. **Uncheck "Use debug simulation."**

4. Tap **Start Trip**. The browser will prompt for location permission — grant
   it (choose "Allow While Using App" / "Always Allow" if your OS distinguishes;
   background tracking while the screen is locked depends on the browser and
   may pause updates if the phone sleeps — keep the screen on/unlocked and the
   tab in the foreground for reliable tracking).

5. Drive the route. Each GPS fix is written to `busLocation/{routeId}` in
   Firestore in real time. Stop-passing is detected automatically once you get
   within **80 meters** of the next stop's coordinates (haversine distance,
   see `handlePosition()` in [public/driver.js](public/driver.js)) — GPS drift
   in a moving vehicle can occasionally cause a stop to register a little early
   or late.

6. Watch it live from the **Parent** side on a second device (a passenger's
   phone, or your laptop back home) — trip status, last GPS update time, and
   stops-passed/remaining all update via `onSnapshot` as you drive.

7. Once stopped/parked, tap **End Trip** (or let it auto-complete when the last
   stop is reached).

### Before your first live drive

Stop-passing accuracy depends entirely on the `stops` documents having correct
`latitude`/`longitude` for the route you're testing. If you're using the
`Downingtown_STEM_Academy-259` route, all 7 stops have been verified against
real address/street data (see git history / conversation notes) — for any other
route, double check `stops` in the
[Firestore console](https://console.firebase.google.com/project/bus-tracker-fba2a/firestore/data/stops)
first.

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| No location permission prompt at all | You're on plain HTTP from a non-localhost origin — geolocation is blocked. Use an HTTPS preview channel or the production URL. |
| Location stops updating after phone locks/screen off | Background GPS while backgrounded/locked isn't guaranteed in a mobile browser tab — keep the screen on during the drive. |
| Stop never registers as "passed" | You may not have gotten within 80m of the stop's stored coordinates, or the stop's lat/lng is wrong — check it in the Firestore console. |
| Stop registers too early/twice | GPS jitter near the 80m threshold — not currently debounced (see Known Gaps in [CLAUDE.md](./CLAUDE.md)). |
