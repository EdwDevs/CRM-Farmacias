# Testing PharmaTrack Pro (CRM-Farmacias)

Vanilla JS SPA (no bundler) backed by Firebase Auth + Firestore. UI is served from the repo root as static files.

## Local setup

```bash
cd /path/to/CRM-Farmacias
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/index.html`. No build step, no `npm install`. Firebase credentials are embedded in `assets/app.js` and hit the real project (there is no staging), so tests run against real data.

## Demo credentials

- Email: `edward@admin.com`
- Password: `123456`

This is a seeded demo account; safe to use for UI testing. The `Demo` badge on the login page exposes it.

## Project structure highlights

- `index.html` — single-page shell (login + app views toggled by JS).
- `assets/app.js` — all app logic: auth, Firestore CRUD, theme, modal show/hide, table render.
- `assets/styles.css` — design tokens + full UI styles (~1.7k LOC).
- `pharmacias.csv` — seed data for 328 farmacias (already in Firestore).

## Key conventions

- **Theme:** `localStorage['pharma-theme']` = `'light'` | `'dark'`. `data-theme` attribute set on `<html>`. Inline script in `<head>` applies it pre-paint to avoid flash.
- **Modal show/hide:** `app.js` toggles `.show` on `.modal-overlay`. The CSS selector must be `.modal-overlay.show` — if it is `.active` the modal will silently never display (regression we hit on v4.0).
- **Search shortcut:** `Ctrl+K` focuses `#topbar-search-input`, which mirrors into `#search-input` to filter the table.
- **Icons:** SVG sprite embedded at top of `index.html`. Test plans should assert **zero emojis** — earlier versions used them and the Stripe redesign explicitly removed them.

## Golden-path tests

Use the nine-test plan in `test-plan.md` (kept alongside the repo for active PRs):

1. Login page renders with gradient mesh + SVG icons (no emojis).
2. Demo login works end-to-end.
3. Dashboard renders KPIs, pill-badges, topbar, sidebar.
4. Theme toggle flips and persists across reload (no white-flash).
5. `Ctrl+K` focuses search and filters table.
6. Changing a row's visita/transferencia persists and updates KPIs.
7. Dark mode works across login + dashboard.
8. (Regression) "Nueva farmacia" modal opens/closes — verify after any CSS change to modals.
9. (Regression) "Ocultar detalles / Ver detalles" toggle collapses/expands the stats panel.

## Known pitfalls

- **CSS class mismatch on modals:** if a modal doesn't open, check that the CSS selector matches the class `app.js` actually adds (`.show`, not `.active` or `.open`). Grep `classList.add(` and cross-reference with CSS.
- **No CI:** nothing runs automatically on PRs. Local testing is the only gate.
- **Browser needs a clean session for T1:** clear `localStorage` and IndexedDB to force the login screen. Running in an incognito-ish tab or via DevTools `Application → Clear site data` works too.
- **Firebase latency:** first load can take 2-3s to populate the table. Wait for rows before asserting.
- **Recording:** maximize the browser before `record_start` (`wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`). The sidebar/topbar must be fully visible.

## Devin Secrets Needed

None. Demo login credentials and Firebase config are embedded in the repo.

## Helpful commands

```bash
# Start local server (from repo root)
python3 -m http.server 8765 &

# Kill it
pkill -f "http.server 8765"

# Grep modal class usage (for CSS-JS mismatch debugging)
rg "classList.(add|remove|toggle)\(['\"]" assets/app.js | rg -i modal
rg "modal-overlay" assets/styles.css
```
