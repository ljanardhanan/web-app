# CLAUDE.md

Guidance for Claude Code (or any future agent) working in this repository.

## What this project actually is

This repo is named `web-app` but the product is **Bus Tracker**: a real-time school
bus tracking app with two roles — **Driver** (broadcasts GPS location, marks stops
passed) and **Parent** (watches trip progress live and sees when the bus is
approaching their stop).

**Important architectural quirk:** there are two unrelated app shells living side by
side in this repo, and only one of them is real:

1. **`public/*.html` + `public/*.js`** — this is the actual Bus Tracker application.
   Plain HTML + vanilla JS ES modules, no build step, no framework. It talks
   directly to Firebase (Auth + Firestore) via the `firebase-*.js` CDN SDK. This is
   what Firebase Hosting serves and what users actually use.
2. **`src/app/*`** — an unmodified `create-next-app` (Next.js 16 / React 19 /
   Tailwind v4) scaffold. It still has the stock "Deploy Now / Documentation"
   landing page. It is **not wired to the bus tracker at all** and is not part of
   the deployed site (`firebase.json` points hosting at `public/`, not `.next`
   output). Treat `npm run dev/build/start` as dead weight unless someone
   deliberately migrates the app into Next.js — don't assume changes to `src/`
   affect the live product.

When asked to change tracker behavior (driver flow, parent flow, stop detection,
auth, roles), the files to edit are in `public/`, not `src/`.

## Repo layout

```
public/
  index.html         Role picker ("Parent" or "Driver")
  driver.html/.js     Driver UI: start/end trip, GPS or simulated GPS, stop detection
  parent.html/.js     Parent UI: live trip status via Firestore onSnapshot listeners
  firebase-config.js  Firebase project config + exports `app`, `auth`, `db`
  404.html
firestore.rules       Role-based Firestore security rules
firebase.json          Firebase Hosting (serves public/) + Firestore config
.firebaserc            Firebase project alias -> "bus-tracker-fba2a"
src/app/               Unused Next.js scaffold (see note above)
```

## Data model (Firestore)

- `users/{uid}` — `{ role: "driver" | "parent", createdAt, updatedAt }`. Role is
  auto-assigned client-side the first time a signed-in user opens driver.html or
  parent.html (`ensureUserRole`), it's not an admin-managed field.
- `stops/{stopId}` — `{ institutionId, routeId, sequence, name, latitude,
  longitude }`. Must be seeded manually (there is no UI to create stops yet).
- `routes/{routeId}` — route metadata (driver/route-writable, not yet read from
  the UI; institution/route options are hard-coded `<select>` values in the HTML).
- `trips/{tripId}` — one doc per trip run: `{ institutionId, routeId, routeNumber,
  direction, status: "in_progress"|"completed", startTime, endTime,
  currentStopIndex }`.
- `currentTrip/{routeId}` — pointer doc to the active trip for a route, so parents
  can subscribe by route without knowing the trip ID.
- `busLocation/{routeId}` — latest `{ lat, lng, lastUpdateTime, tripId }`, updated
  on every GPS/simulated position update.

Security model (`firestore.rules`): every collection requires `isSignedIn()`;
writes to `stops`, `routes`, `trips`, `currentTrip`, `busLocation` require
`hasRole('driver')` (looked up from `users/{uid}.role`); everything else is denied
by the fallback rule.

## Driver flow (`public/driver.js`)

1. Google sign-in (`signInWithPopup`) → role forced to `"driver"`.
2. Pick institution/route/direction, click **Start Trip** → creates a `trips` doc
   and a `currentTrip/{routeId}` pointer, loads `stops` ordered by `sequence`
   (reversed for `to_school` direction).
3. Position updates come from one of two sources, chosen by the **"Use debug
   simulation"** checkbox (checked by default):
   - **Simulation**: a `setInterval` every 60s fakes a position near the next
     stop with small random jitter — useful for testing without a phone.
   - **Live GPS**: `navigator.geolocation.watchPosition` (requires a secure
     context — HTTPS or `localhost`).
4. Each position writes `busLocation/{routeId}` and does naive stop detection:
   haversine distance to the next stop < 80m ⇒ advances `currentStopIndex` and
   updates the `trips` doc. Reaching the last stop auto-completes the trip.
5. **End Trip** manually completes early.

## Parent flow (`public/parent.js`)

Google sign-in → role forced to `"parent"` → loads `stops` for the selected
route/direction → subscribes with `onSnapshot` to `currentTrip/{routeId}`, then to
`trips/{tripId}` and `busLocation/{routeId}`, and renders trip status, last GPS
update time, and stops-passed/remaining relative to the parent's selected stop.
`lat`/`lng` are received but there is currently **no map rendering** — that data
is unused in the UI.

## Local development

No package manager dependency on Firebase — the SDK is loaded from
`https://www.gstatic.com/firebasejs/11.0.0/...` at runtime in the browser, so
`npm install` is only needed for the (unused) Next.js scaffold.

Because `public/*.js` are ES modules, opening the HTML via `file://` will not
work (CORS). Serve it over HTTP, e.g.:

```bash
npx firebase-tools emulators:start --only hosting   # serves public/ per firebase.json
# or
npx serve public
```

Then visit `/index.html` → choose Parent or Driver.

- Driver GPS testing on desktop: leave "Use debug simulation" checked — no real
  location needed, stops advance automatically every 60s.
- Testing with a real phone's GPS requires a secure context. `localhost` on the
  same machine works; testing over your LAN IP does not (browsers block
  `navigator.geolocation` on plain HTTP for non-localhost origins) — use a
  Firebase Hosting preview channel or an HTTPS tunnel (e.g. `ngrok`) instead of a
  bare LAN URL.

## Build & deploy

The Next.js scripts (`npm run dev|build|start|lint`) exist but do not affect the
deployed product — see the architecture note above.

Actual deploy is via the Firebase CLI, targeting project `bus-tracker-fba2a`
(`.firebaserc`):

```bash
firebase login                        # once
firebase deploy                       # deploys hosting (public/) + firestore.rules
firebase deploy --only hosting
firebase deploy --only firestore:rules
```

There is no CI/CD pipeline in this repo (no `.github/workflows`) — deploys are
manual from a developer machine.

## Known gaps (don't assume these are implemented)

- No map UI — `lat`/`lng` from `busLocation` are received by parent.js but never
  rendered.
- No admin UI for institutions/routes/stops — all seeded by hand in the Firestore
  console; the `<select>` options in `driver.html`/`parent.html` are hard-coded.
- No PWA manifest or service worker — "add to home screen" is not optimized.
- No automated tests and no CI.
- Stop-passed detection is a simple 80m-radius haversine check, not
  direction-aware or debounced — noisy GPS could double-trigger.
