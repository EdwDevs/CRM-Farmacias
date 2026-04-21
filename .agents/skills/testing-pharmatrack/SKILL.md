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
- `assets/app.js` — all app logic: auth, Firestore CRUD, theme, modal show/hide, table render, v4.1 features (favorites, sparklines, command palette, pagination, sort).
- `assets/styles.css` — design tokens + full UI styles (~2.3k LOC after v4.1).
- `pharmacias.csv` — seed data for 328 farmacias (already in Firestore).

## Key conventions

- **Theme:** `localStorage['pharma-theme']` = `'light'` | `'dark'`. `data-theme` attribute set on `<html>`. Inline script in `<head>` applies it pre-paint to avoid flash.
- **Modal show/hide:** `app.js` toggles `.show` on `.modal-overlay`. The CSS selector must be `.modal-overlay.show` — if it is `.active` the modal will silently never display (regression we hit on v4.0).
- **Search shortcut:** `Ctrl+K` opens the command palette (`#cmdk.show`) with full keyboard nav (↑↓ Enter Esc). It is **not** just a focus shortcut on the topbar search.
- **Favorites:** `localStorage['pharma-favorites']` = JSON array of pharmacy IDs. Rehydrated to a `Set` at runtime. Sidebar `#fav-list` + `#fav-count` badge update via `aria-live`.
- **Pending badge:** `#nav-pharmacies-badge` clamps to `"99+"` when count > 99. Don't assert exact numeric match if the dataset has >99 Pendiente rows.
- **Sparkline IDs (actual, per `assets/app.js`):** `spark-visits`, `spark-transfers`, `spark-effect`, `spark-pending`, `spark-month`, `spark-proj`, `spark-justified`, `spark-pending-t` (8 total). **Not** the more semantic names like `spark-efectividad` or `spark-proyeccion`.
- **Status class mapping** (`getStatusClass` in `app.js`): `Realizado → .completed`, `Justificada → .justified`, else `.pending`. The `<option>` `value` is always the Spanish label, but the class on the `<select>` is English.
- **Icons:** SVG sprite embedded at top of `index.html`. Test plans should assert **zero emojis** — the Stripe redesign explicitly removed them.

## Golden-path tests (v4.0)

Use the nine-test plan in `test-plan.md`:

1. Login page renders with gradient mesh + SVG icons (no emojis).
2. Demo login works end-to-end.
3. Dashboard renders KPIs, pill-badges, topbar, sidebar.
4. Theme toggle flips and persists across reload (no white-flash).
5. `Ctrl+K` opens command palette.
6. Changing a row's visita/transferencia persists and updates KPIs.
7. Dark mode works across login + dashboard.
8. (Regression) "Nueva farmacia" modal opens/closes.
9. (Regression) "Ocultar detalles / Ver detalles" toggle collapses/expands the stats panel.

## v4.1 tests (see `test-plan-v41.md`)

1. Pagination 25/50/100 + prev/next + `#page-info` (`1 / N`).
2. Column sort `aria-sort` asc↔desc.
3. Favorites + quick-action "Transferir" + toast Deshacer.
4. Command palette keyboard nav (↑↓ Enter Esc).
5. All 8 KPI sparklines render 2 `<path>` (area + line).
6. Floating labels Material-3 in "Nueva farmacia" modal.
7. Breadcrumb + pending badge.
8. Dark-mode Justificada contrast (`#EDE9FE`).
9. `prefers-reduced-motion: reduce` rule present.

## Testing patterns that worked

### Async observer for toasts / Firestore-dependent UI

`showToast` is triggered inside a `.then()` after a Firestore write. A synchronous `document.querySelectorAll('.toast')` right after the action returns empty. Pattern that works:

```js
window.__obs = { done: false, captured: null };
quickTransferPharmacy('<id>');
const tick = setInterval(() => {
  const toast = document.querySelector('.toast');
  if (toast && toast.querySelector('.toast-btn')) {
    window.__obs.captured = toast.outerHTML;
    toast.querySelector('.toast-btn').click(); // Deshacer
    clearInterval(tick);
    setTimeout(() => {
      window.__obs.reverted = document.querySelector('select.status-select').value;
      window.__obs.done = true;
    }, 800);
  }
}, 200);
setTimeout(() => clearInterval(tick), 4000);
```

Then poll `window.__obs.done === true` from the test driver.

### Direct CSS-rule probing when no live node matches the state

If the DOM currently has no element matching a selector you want to verify (e.g., `.status-select.justified` only appears if some pharmacy has `Justificada` status, and the seed data may not include any), create a throwaway element with that exact class list, append to `document.body`, read `getComputedStyle`, then remove. This tests the cascade without requiring live data. Example (T8 dark-mode contrast):

```js
const t = document.createElement('select');
t.className = 'status-select justified';
document.body.appendChild(t);
const c = getComputedStyle(t).color;
t.remove();
// c === 'rgb(237, 233, 254)' in dark mode
```

### Verifying `prefers-reduced-motion` without emulation

Instead of emulating the media feature via DevTools Protocol, iterate `document.styleSheets[*].cssRules`, find the `CSSConditionRule` with `conditionText === '(prefers-reduced-motion: reduce)'`, and inspect its inner rules. The presence of a universal `*, ::before, ::after { animation-duration: 0.01ms !important; ... }` is sufficient proof that reduce-motion is respected.

## Known pitfalls

- **CSS class mismatch on modals:** if a modal doesn't open, check that the CSS selector matches the class `app.js` actually adds (`.show`, not `.active` or `.open`). Grep `classList.add(` and cross-reference with CSS.
- **No CI:** nothing runs automatically on PRs. Local testing is the only gate.
- **Browser needs a clean session for T1 (v4.0):** clear `localStorage` and IndexedDB to force the login screen.
- **Firebase latency:** first load can take 2-3s to populate the table. Wait for rows before asserting.
- **Recording:** maximize the browser before `record_start`. `wmctrl` may not be installed — if so, skip it and proceed; the recording will still work but be aware the browser window may not be full-screen.
- **`#nav-pharmacies-badge` clamps to "99+":** don't assert an exact numeric value if the expected count is >99.
- **Stat changes don't auto-trigger post-stats visuals:** `updateStats` is module-private. v4.1 added a `MutationObserver` on `#visits-value` to re-run sparklines/badges when stats change. If you mutate state imperatively, dispatch a change on `#visits-value` or call `runPostStatsVisuals()` manually.
- **Status select classes are English, values Spanish:** `value="Justificada"` but class is `.justified`. Don't grep for `status-select.Justificada`.

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

# List all sparkline IDs in use
rg "renderSparkline\(" assets/app.js

# Check a CSS rule's computed value without a matching live node (paste into DevTools console)
(() => { const t=document.createElement('select'); t.className='status-select justified'; document.body.appendChild(t); const c=getComputedStyle(t).color; t.remove(); return c; })();
```
