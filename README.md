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
**Note:** The **Together** (real-time) feature does not work on GitHub Pages—it needs a server. Use it locally with `npm run server` (see below).

---

## Run locally (solo)

- Open `index.html` in a browser, or run any static server (e.g. `python3 -m http.server 8080`) and open the URL.
- Everything is saved in your browser (localStorage).

## Edit together (real-time)

1. From the project folder run:
   ```bash
   npm run server
   ```
2. Open **http://localhost:3001** in your browser.
3. Click **Together** in the toolbar → **Create new room**.
4. Share the link (or room code) with your person. They open the same link, join the room, and you both see the same canvas and changes in real time.

No account needed; the room code is the only “password.”
