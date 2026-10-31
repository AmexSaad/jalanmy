# jalanMY · Johor

Android navigation app source: MapLibre, foreground GPS, car/motorcycle/bicycle/walking routes, Malay maneuver guidance and Android text-to-speech, off-route recalculation, GPS speed and community reports.

**Status:** source integration is in progress. The previously delivered APK is a local prototype. The new source still needs live provider credentials, database setup, real-service integration checks and physical-device testing before it can be called complete. No paid hosting is authorized; the owner's budget is RM0.

Supabase project `jalanmy` has now been created in SUNFLY SYSTEM (Free), Singapore, ref `ufgkkmqgzuuhumsswfwn`. Community schema and permission tests passed on the live database with test records rolled back. The public project URL/publishable key are in `src/project-config.ts`. Guest sign-in activation requires the owner's specific approval; Geoapify is still not configured. Private tables intentionally have RLS enabled with no direct client policies; only the restricted RPC surface is granted.

## RM0 service option

Geoapify Free handles maps/search/routing (3,000 credits/day, required attribution, quota shared across API usage). Supabase Free handles anonymous sessions and shared reports (500 MB database, 5 GB egress, can pause after inactivity). These limits are real; they do not provide unlimited Waze-scale traffic or live congestion data.

1. Create a free Geoapify project (no card required) and restrict the public application key using provider settings.
2. Create a free Supabase project, enable anonymous sign-in, and apply `supabase/migrations/202610310001_reports.sql`. Do not upgrade to a paid plan. Enable provider abuse protection before public release; GPS and anonymous identities can be spoofed.
3. Configure the public build settings in `.env.local` (local) or GitHub repository variables (Android CI):

| Local name | GitHub variable |
| --- | --- |
| `VITE_GEOAPIFY_KEY` | `JALANMY_GEOAPIFY_KEY` |
| `VITE_SUPABASE_URL` | `JALANMY_SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | `JALANMY_SUPABASE_ANON_KEY` |

Only use the publishable/anon Supabase key. Never bundle a service-role or secret key. These frontend settings are visible in an APK; server-side row permissions and RPC authorization enforce data access. Do not paste secret keys into chat.

The app selects the free-services adapter if all three settings are supplied and no `VITE_API_URL` is set. A missing provider produces an explicit unavailable state. It does not substitute fake routes or fake community data.

## Run locally

Node 22.12+:

```sh
npm ci
npm test
npm run build
npm run dev
```

Python backend tests (optional self-hosted backend): `python -m unittest server.test_app -v`.

## Android APK

GitHub **Actions → Android APK → successful run → Artifacts → jalanMY-johor-debug-apk** contains the APK ZIP. Configured provider settings are embedded at build time, so rebuild after setup. Debug builds use a temporary signing key and are not a stable release/update channel. An APK that compiles without live settings is not a completed navigation service.

Android 7+ and a current WebView are required. The app requests foreground location after the user presses the location button. It pauses navigation and GPS while hidden, and reacquires a route on return. It keeps the screen awake during active navigation. Voice requires a Malay voice installed in Android's text-to-speech engine. Offline maps and background navigation are not implemented.

## Self-hosted option (not activated)

`server/`, `compose.yml` and [deployment guide](deployment/README.md) provide a separate self-hosted API, OSM place import and Valhalla routing. It needs a machine and persistent storage; no paid service has been created. The paid Render blueprint is deliberately stored only as `deployment/render-paid.example.yaml` and must not be applied under the RM0 budget.

## Reporting and limitations

Reports expire, duplicates merge, owners cannot self-confirm, nearby independent users can confirm, and duplicate votes from the same identity replace one another. Two negative votes exceeding positive votes hide a report. Reports are community data, not verified official information. Anonymous identities and GPS are not proof of real-world identity/location; moderation and device-level testing are still required before wide distribution.

GPS speed is not a calibrated speedometer. Speed limits appear only when available and a route/GPS match is sufficiently close. Free-provider mode reads speed limits from the selected route during navigation, not continuously on every road. ETA uses route estimates with no live traffic. Route alternatives depend on provider output; the free adapter currently requests one route. The Johor coverage box is approximate and routes can cross administrative boundaries. No live traffic, place reviews, transit timetable feed or complete camera database is connected.

© OpenStreetMap contributors, ODbL. Geoapify Free attribution is displayed when configured. Check provider terms and quotas before release. API data requests disclose requested places/coordinates and IP addresses to the selected providers. Published report locations are shared; live GPS tracks are not intentionally persisted by the app backend.
