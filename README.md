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
**Note:** **Sync** and **Together** need a server; they don’t work on plain GitHub Pages. Run `npm run server` and open the app from that URL (see below).

---

## Run locally (solo)

- Open `index.html` in a browser, or run any static server (e.g. `python3 -m http.server 8080`) and open the URL.
- Everything is saved in your browser (localStorage) only.

## Same notes on every device (sync)

1. From the project folder run: `npm run server`.
2. Open **http://localhost:3001** (or your deployed server URL) in your browser.
3. Enter the app password and use the app. Changes are saved to the server and the browser.
4. On another browser or device, open the **same** server URL, enter the **same** password—you’ll see the same scrapbook. The server stores one copy per password so it stays in sync everywhere.

You must open the app from the server (e.g. `http://localhost:3001`) for sync to work. Opening only `index.html` or using GitHub Pages keeps data local to that browser/device.

## Edit together (real-time)

1. From the project folder run:
   ```bash
   npm run server
   ```
2. Open **http://localhost:3001** in your browser.
3. Click **Together** in the toolbar → **Create new room**.
4. Share the link (or room code) with your person. They open the same link, join the room, and you both see the same canvas and changes in real time.

No account needed; the room code is the only “password.”
