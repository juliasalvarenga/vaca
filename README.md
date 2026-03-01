# Our World

A shared scrapbook canvas for you and your person: photos, notes, dates, favorite spots & foods, love letters, memories, bucket lists, and quotes—all on one infinite canvas.

---

## Get a free domain (GitHub Pages)

1. Push this repo to your GitHub account (create a repo named e.g. `vaca` or `our-world`).
2. On GitHub: **Settings** → **Pages** → under "Build and deployment" choose **Source: Deploy from a branch**.
3. Branch: **main** (or **master**), folder: **/ (root)**. Save.
4. After a minute or two, your site will be live at:
   - **https://*yourusername*.github.io/*repo-name*/**
   - Example: if your username is `julia` and the repo is `vaca` → **https://julia.github.io/vaca/**

Use that link from any device; your scrapbook is saved in the browser (localStorage) per device.  
**Note:** To sync across devices you can use **Firebase** (works on GitHub Pages, no server) or run `npm run server` (see below). **Together** (real-time collab) needs the Node server.

---

## Run locally (solo)

- Open `index.html` in a browser, or run any static server (e.g. `python3 -m http.server 8080`) and open the URL.
- Everything is saved in your browser (localStorage) only.

## Same notes on every device — Firebase (recommended, no server)

Sync works on **GitHub Pages** or any static host; you don’t need to run a server.

1. Create a [Firebase](https://console.firebase.google.com/) project (free).
2. In the Firebase Console: **Build** → **Firestore Database** → **Create database** (start in test mode for quick setup; you can tighten rules later).
3. **Project settings** (gear) → **Your apps** → **Add app** (Web) → copy the `firebaseConfig` object.
4. In this repo: copy `js/firebase-config.example.js` to `js/firebase-config.js` (or edit the existing `js/firebase-config.js`), and set `window.OUR_WORLD_FIREBASE_CONFIG` to your config object.
5. Open the app (from GitHub Pages, local file, or any host). Enter the app password. The bottom-left should say **“Synced (Firebase)”**. Changes are saved to Firestore.
6. On another device or browser, open the **same** app URL and enter the **same** password—you’ll see the same scrapbook.

**If sync doesn’t work:** (1) In Firebase Console → **Firestore Database** make sure the database exists. (2) Open **Rules** and ensure the `scrapbooks` collection can be read and written (e.g. use test mode or copy from `firestore.rules.example`). If the bottom-left shows “Sync write failed” or “permission”, update the rules and try again.

## Same notes on every device — Node server

1. From the project folder run: `npm run server`.
2. Open **http://localhost:3001** (or your deployed server URL) in your browser.
3. Enter the app password and use the app. Changes are saved to the server and the browser.
4. On another browser or device, open the **same** server URL, enter the **same** password—you’ll see the same scrapbook.

You must open the app from the server (e.g. `http://localhost:3001`) for this sync to work. If you use **Firebase** (above), you don’t need the Node server for sync.

**Sync not working?** Check the **sync message** (bottom-left). For Firebase: “Synced (Firebase)” = OK; “Sync error” = check `js/firebase-config.js` and Firestore rules. For Node: “Synced (saved across devices)” = OK; “To sync: run …” = run `npm run server` and open http://localhost:3001.

## Edit together (real-time)

1. From the project folder run:
   ```bash
   npm run server
   ```
2. Open **http://localhost:3001** in your browser.
3. Click **Together** in the toolbar → **Create new room**.
4. Share the link (or room code) with your person. They open the same link, join the room, and you both see the same canvas and changes in real time.

No account needed; the room code is the only “password.”
