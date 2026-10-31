# Deployment and release gates

The new APK source integrates the jalanMY API. It is **not a completed live service** until the servers, OSM index and routing graph are ready and the acceptance checks below pass. GitHub Actions can compile the Android package without API configuration, but that package cannot search, route or share reports. Do not distribute it as a completed app.

## Components

- Android/Web app: MapLibre, foreground GPS, Malay maneuver text, native Android text-to-speech, screen awake during navigation.
- Python API: SQLite WAL on a persistent disk, one Gunicorn process with 8 threads. Reports, sessions, quotas and independent confirmations are persisted. Not a horizontally scalable database architecture.
- Places index: OSM named nodes, named ways and tagged addresses inside the broad Johor coverage box, SQLite FTS5. Search is based on OSM coverage, not Google's POI database. The box also includes parts of neighboring regions and Singapore; exact Johor administrative filtering still needs a boundary dataset.
- Valhalla: self-hosted graph built from the Malaysia/Singapore/Brunei PBF. The API validates trip endpoints in the coverage box. Intermediate routes can leave Johor; this is not a border-avoidance guarantee. Motorcycle costing is upstream beta and needs local validation.

## VPS / Docker Compose

Plan resources after testing data imports: start by evaluating an 8 GB RAM Linux host with at least 30 GB storage, then measure actual memory and disk usage. This is an engineering estimate, not a hosting purchase authorization.

1. Clone the repo on the server and set a strong `ADMIN_TOKEN` in the server environment. Do not use a `VITE_` variable for secrets.
2. Run `docker compose up -d --build`. Valhalla downloads the PBF and builds tiles; first startup is substantially slower than subsequent startups. Inspect `docker compose logs -f routing` and wait for the routing service to start.
3. After the PBF exists, import places from the shared read-only routing volume. Determine the actual filename with `docker compose exec api ls /osm`, then run `docker compose exec api python -m server.import_places /osm/malaysia-singapore-brunei-latest.osm.pbf`. The new index is atomically swapped after a successful import. This may need additional memory.
4. Put the API behind an HTTPS reverse proxy. It is bound to localhost:8080 by default. Only expose the API; do not expose raw Valhalla or SQLite. Set `ALLOWED_ORIGINS` to the actual web origin plus Android's `https://localhost` and `http://localhost`.
5. Configure GitHub repository variable `JALANMY_API_URL` to the HTTPS API URL. The Android workflow reads it into the app at build time. Configure a production tile provider using `JALANMY_TILE_URL` and update its required attribution in the map source. Public OSM tiles are for low-volume development under their usage policy, not a guaranteed production service.
6. Rebuild the APK. It uses the device's installed Malay TTS voice; install that voice through Android if unavailable. Native voice currently only runs while the app is visible. App pauses navigation/GPS when hidden and reacquires a route on return.

## Data updates and retention

Back up SQLite with the SQLite backup API, not by copying just the main file while WAL is active. Test restores. Keep reports for 1 day after expiry, sessions for 90 days unless still referenced. Expiry is 1 hour initially and independent confirmations may extend a report up to 6 hours from creation. Two distinct negative confirmations, exceeding positive confirmations, hide a report. The author can remove their own report but cannot self-confirm it. Nearby duplicate categories within 100m are merged. Data loading and refresh are operator tasks until scheduled updates have been validated.

OSM is © OpenStreetMap contributors, ODbL. Retain attribution and license obligations for exported/derived databases. Routing uses typical road speeds and does not have live traffic. Roadblock and speed-trap pins originate from users, not verified enforcement data. GPS data and session tokens must be excluded from request logs. The app sends location to the API during route calculations, periodic speed-limit lookup and report actions. Live GPS tracks are not stored by the API; published report coordinates are stored.

## Abuse and operational limits

Anonymous random server-issued sessions are a baseline, not verified identities. Session issuance has a persisted IP quota; report submission has persisted per-session and IP quotas. Attackers can change IPs/devices or spoof GPS. Add device attestation/verified accounts and moderation before wide public release. CORS is not authentication. General read limits are per-process memory and reset on restart. The API intentionally ignores untrusted forwarded-IP headers; behind a proxy, configure trusted client-IP handling or tune shared-IP limits for the deployment. Only one API instance is supported with SQLite. The authenticated admin deletion endpoint can hide reports; no public admin UI is included.

The image tag for upstream Valhalla is `latest` for initial evaluation. Pin a tested immutable digest before a production deployment and keep a documented update process. No payment, service or disk has been created by adding these deployment files.

## Acceptance before calling the app complete

- Import actual Johor-area data and test named addresses/POIs across JB, Kulai, Pasir Gudang, Muar, Batu Pahat, Kluang and Mersing.
- Exercise route alternatives, toll preference, legal motorcycle access, direction changes and border cases against actual server responses.
- Verify GPS denied, weak GPS, stale GPS, foreground/background transitions and no internet on a physical Android phone.
- Verify Malay voice, turn distances, crossings/loops, missed turns, arrival, speed-limit matching and no alert for reports behind the user or on parallel roads.
- Use two phones to create, read and independently confirm/remove the same report. Verify expiry and restart persistence.
- Test backups, moderation, request limits and HTTPS. Load-test before increasing user count.
- Use stable release signing and a secured keystore for updates; CI currently uses a debug key.
- Obtain a live traffic feed if traffic-dependent ETA is part of the release scope; none is currently connected.
