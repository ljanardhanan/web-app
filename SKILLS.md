# SKILLS.md — Operations Guide

How to set up, run, test on mobile, build, and deploy the **Bus Tracker** app in
this repo. See [CLAUDE.md](./CLAUDE.md) for an architecture/code walkthrough; this
doc is the step-by-step runbook.

## 1. What you're running

The real app is a static, framework-free site under [public/](public/):
`index.html` (role picker) → `driver.html`/`driver.js` (bus driver, broadcasts
GPS) and `parent.html`/`parent.js` (parent, watches the bus live). It talks
directly to Firebase Auth + Firestore from the browser via the CDN SDK — there is
nothing to compile for it to run.

The [src/app](src/app) directory is a separate, unused `create-next-app`
scaffold. It is not the product; ignore it unless you're deliberately migrating
the tracker into Next.js.

## 2. Prerequisites

- Node.js (for `npm install` and the Firebase CLI) and npm.
- Firebase CLI: `npm install -g firebase-tools` (or use `npx firebase-tools`).
- Access to the Firebase project `bus-tracker-fba2a` (ask the project owner to add
  your Google account as a collaborator in the Firebase console) if you need to
  deploy or edit Firestore data/rules.
- A Google account for testing sign-in (auth is Google-only, via
  `signInWithPopup`).

Install JS deps once (only needed for the unused Next.js scaffold / linting):

```bash
npm install
```

## 3. Run it locally (desktop browser)

The app's JS files are ES modules, so you must serve them over HTTP — opening
the HTML files directly (`file://...`) will fail with CORS errors.

Option A — Firebase emulator (matches production hosting config exactly):

```bash
npx firebase-tools emulators:start --only hosting
```

Option B — any static file server:

```bash
npx serve public
```

Then open `http://localhost:<port>/index.html` and choose **Parent** or
**Driver**.

For the driver flow, leave **"Use debug simulation"** checked (it's the default).
This fakes GPS positions moving through each stop every 60 seconds, so you can
exercise the full start-trip → stops-passed → complete-trip flow on a laptop with
no phone and no real location.

## 4. Run/test it on mobile

The Driver role is meant to be used on a phone in a moving vehicle, using real
GPS via `navigator.geolocation.watchPosition`. Two things matter here:

1. **Secure context requirement**: browsers only allow `navigator.geolocation` on
   `https://` origins or on `localhost`. A plain `http://<your-LAN-IP>:port` URL
   opened from a phone will silently fail to get a location. So for real on-device
   GPS testing you need one of:
   - A **Firebase Hosting preview channel** (see below) — gives you a real HTTPS
     URL without touching the production site.
   - An HTTPS tunnel to your local dev server, e.g. `ngrok http <port>`.
2. **Uncheck "Use debug simulation"** on the driver page once you're on a secure
   URL, so it uses real GPS instead of the fake position generator.

Deploy a preview channel for mobile testing:

```bash
firebase hosting:channel:deploy preview-name
```

This prints an HTTPS URL you can open on a phone; it does not touch the live
site. Preview channels expire automatically (default 7 days) and can be listed /
deleted with `firebase hosting:channel:list` / `firebase hosting:channel:delete`.

The parent flow has no location requirement (it only reads Firestore), so it can
be tested on any device/browser, including plain HTTP on localhost.

## 5. Build

There is no build step for the real app — `public/` is deployed as-is.

The Next.js scaffold under `src/app` does have build scripts, but they don't
affect the deployed product:

```bash
npm run dev     # Next dev server on localhost:3000 — the stock scaffold, not the tracker
npm run build   # next build
npm run start   # next start (serves the build)
npm run lint    # eslint
```

## 6. Deploy

Deploys go through the Firebase CLI against project `bus-tracker-fba2a`
(configured in [.firebaserc](.firebaserc)). Firebase Hosting serves the
[public/](public/) directory directly per [firebase.json](firebase.json).

```bash
firebase login                     # once per machine
firebase use bus-tracker-fba2a     # confirm/select the target project

firebase deploy                    # deploys hosting + firestore.rules together
firebase deploy --only hosting     # site changes only
firebase deploy --only firestore:rules   # rules changes only
```

There is no CI/CD in this repo — deploys are manual, run from a developer
machine after `firebase login`. Double-check `firebase.json`'s `hosting.public`
still points at `public/` before deploying if that ever changes.

## 7. Setting up a fresh Firebase project (only if standing up a new environment)

1. Create a project in the [Firebase console](https://console.firebase.google.com).
2. Enable **Authentication → Sign-in method → Google**.
3. Enable **Firestore** (production mode).
4. Update `public/firebase-config.js` with the new project's config values, and
   `.firebaserc`'s `default` project alias.
5. `firebase deploy --only firestore:rules` to push `firestore.rules`.
6. Manually seed `stops` and `routes` documents in the Firestore console (there
   is no admin UI yet) — `driver.html`/`parent.html` currently hard-code the
   institution/route `<select>` options, so also update those option lists to
   match whatever `institutionId`/`routeId` values you seed.

## 8. Known gaps to keep in mind while working

- No map view — bus `lat`/`lng` is stored and streamed to the parent page but
  never rendered visually.
- No admin UI for institutions/routes/stops; everything is seeded by hand in the
  Firestore console and hard-coded in the HTML `<select>` elements.
- No PWA manifest/service worker — there's no "add to home screen" experience.
- No automated tests, no CI pipeline.
