# Ellipse Solar Proposals

A free, frontend-only web app for the Ellipse Solar sales and management team.
It runs in the browser on phones and PCs and can be installed like an app.

## What it does

1. **Customer:** details, monthly bill (JVVNL tariff, with or without 100 free units) and the recommended size.
2. **Roof:** find the house on a satellite map, tap the roof corners, and panels are laid out automatically.
   Panels are drawn 8 ft × 4 ft; how many are needed comes from the system capacity and panel wattage.
   **Manual layout:** tap the roof to add a panel, hold and drag to move it. Panels cannot overlap each other, the roof edge
   or obstacles, and they snap edge-to-edge and in line with nearby panels. Tap a panel to rotate (90°) or delete it.
   Add obstacles (water tank, mumty, taller neighbour, tree) with their height. Panels are kept off them.
   **Shadow analysis:** a time slider and Play button on the map move the sun along its path for any month.
   Shadows of the obstacles and the parapet move over the terrace, shaded panels turn red, an hour-by-hour chart shows when
   the terrace gets the most sun, and a yearly shade map colours the roof green (full sun) to red (often shaded).
3. **System & price:** the same options and the same prices as the Ellipse sales portal: On-Grid/Off-Grid/Hybrid, brand,
   DCR/Non-DCR/Mixed, Tata kits, batteries, floors, S/D codes, central and state subsidy, and the loan/EMI calculator.
   Managers (access code) also get per-watt pricing and the full cost breakdown.
4. **Proposal:** a branded PDF (letterhead, site layout photo, bill of material, commercial offer, savings, loan, terms, seal),
   shared to WhatsApp from the phone. Each PDF is logged to the team Google Sheet, the same as the portal.
5. **Dashboard:** pipeline, won/lost and per-salesperson numbers.

## Prices

Prices are **not** stored in this app. On start it reads `rates.json` from the live sales portal:
`https://ellipsesolarofficial.github.io/ellipse-solar-sales-platform/rates.json`.
Update that file once and both apps use the new prices. The `rates.json` in this folder is only an offline fallback.
Copy the latest one here from time to time.

## Data

Proposals are saved in each device's browser (no server, no login).
- Salespeople: Settings → Data & backup → **Share / download backup**, then send it to the manager on WhatsApp.
- Manager: Settings → Data & backup → **Import team proposals** to see everyone on the dashboard.
- New phone: **Restore full backup** copies company settings as well.

Clearing browser data deletes the proposals on that device, so back up regularly.

## Host it for free (GitHub Pages)

1. Create a new repository in the `ellipsesolarofficial` GitHub account, e.g. `ellipse-solar-proposals`.
2. Upload every file in this folder (keep the `assets` and `icons` folders).
3. Repository → Settings → Pages → Source: *Deploy from a branch* → `main` / root → Save.
4. After a minute the app is live at `https://ellipsesolarofficial.github.io/ellipse-solar-proposals/`.
5. On each phone open that link → browser menu → **Add to Home screen** / **Install app**.

Any static host works as well (Netlify, Cloudflare Pages, Vercel). There is no build step.
After changing app files, raise `VERSION` in `sw.js` so installed phones pick up the update.

## Run locally

```
python3 -m http.server 8000
```
Then open http://localhost:8000. A ready-made demo proposal is at http://localhost:8000/#/demo. GPS location and sharing need HTTPS, or localhost.

## Free services used

- Satellite imagery: Esri World Imagery. Maps: OpenStreetMap. Address search: OpenStreetMap Nominatim.
- Site solar data: NASA POWER (used for the monthly generation shape, or for the full estimate if chosen in Settings).
- Esri's free imagery is meant for light, non-commercial use. For heavy commercial use, create a free ArcGIS
  developer account and follow its terms.
