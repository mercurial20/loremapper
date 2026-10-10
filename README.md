<div align="center">

<img src="docs/images/logo.svg" width="96" alt="Loremapper logo" />

# Loremapper

**Draw the world your stories happen in.**

A free fantasy map editor that runs in your browser.<br/>
Sculpt real terrain, paint forests and deserts, draw rivers, roads and borders,<br/>
drop in castles and dragons, and hide the unexplored under fog of war.

[![Version](https://img.shields.io/badge/version-1.0.0--beta.2-e6a94f)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-3f8f5a)](LICENSE)
[![Try it online](https://img.shields.io/badge/try%20it-online-e6a94f?logo=github)](https://mercurial20.github.io/loremapper/)
[![Self-hosted](https://img.shields.io/badge/self--hosted-docker%20compose%20up-2f5d9a)](#b-docker)
[![Local-first](https://img.shields.io/badge/your%20maps-stay%20on%20your%20computer-6b4f9a)](#-where-your-maps-live)
[![Non-commercial](https://img.shields.io/badge/non--commercial-hobby%20project-8f3a5c)](#-a-non-commercial-project)

**[▶ Open the app](https://mercurial20.github.io/loremapper/)** · [Quick start](#-quick-start) · [First map in 5 minutes](#-your-first-map-in-5-minutes) · [Features](#-features) · [Saving & export](#-saving-backups-and-export) · [Report a bug](https://github.com/mercurial20/loremapper/issues/new/choose)

<br/>

<img src="docs/images/hero.jpg" alt="Loremapper: an island kingdom with mountains, forests, a river, a road, settlements, a dashed border, labels and fog of war" />

</div>

## ✨ Why Loremapper?

- **Terrain is real, not just painted.** Every point has an elevation in metres. Mountains cast shade, peaks label themselves ("7,192 m"), coastlines follow the sea level, and contour lines come for free.
- **Start from an empty ocean or a seed.** Sculpt by hand, or type a seed like `amber-drake-7` and get a whole planet built by plate tectonics: mountain ranges where plates collide, rivers that drain real basins, and deserts, steppes, forests and farmland where the climate puts them. Then keep editing everything by hand.
- **A planet or a flat map.** Make a whole round world, or a flat map of a kingdom or region (say 500 × 500 km).
- **Your art is welcome.** It ships with 57 illustrated map icons, and you can drop in your own PNG, WebP or SVG files. They stay in your library.
- **Built for game masters.** Paint fog of war over unexplored lands and export a player-safe version of the map.
- **Nothing leaves your computer.** There's no account and no cloud. Maps are saved automatically in your browser. Use it [online](https://mercurial20.github.io/loremapper/) with nothing to install, or run your own copy with one command.

<p align="center">
  <img src="docs/images/sculpting.gif" width="680" alt="Animation: raising an island from the ocean, building a mountain range, painting a forest and drawing a river" /><br/>
  <sub>Raising an island, building a mountain range, painting a forest and drawing a river: about 30 seconds of real editing.</sub>
</p>

## 💛 A non-commercial project

Loremapper is a hobby project made for the worldbuilding and tabletop community.
It is **not developed for commercial purposes**: there is no paid version, no
premium features, no ads, no tracking of you or your maps, and no plans to monetise it. The code is
open under the [MIT License](LICENSE).

> **Early beta.** Loremapper works and has been tested (see [Testing](#-testing-done-for-this-beta)), but expect rough edges.
> Please [back up](#-saving-backups-and-export) maps you care about and [tell us](#-reporting-bugs-and-contributing) what breaks.

---

## 🚀 Quick start

Pick the path that matches you. All of them end the same way: a browser tab
with the editor open.

| | Path | Good for | Time | You need |
|:-:|---|---|---|---|
| ⚡ | **[A. Open it online](#a-open-it-online--easiest)** | Trying it right now, or just using it. Nothing to install. | 0 min | A browser |
| 🟢 | **[B. Docker](#b-docker)** | Running your own copy offline with one command. | ~3 min | Docker Desktop |
| 🟡 | **[C. Node.js](#c-nodejs-without-docker)** | Your own copy without Docker. | ~3 min | Node.js 22+ |
| 🔵 | **[D. Developer mode](#d-developer-mode)** | Changing the code. | ~2 min | Node.js 22+, Git |
| ⚫ | **[E. Host it yourself](#e-host-it-yourself)** | Your own GitHub Pages site, NAS, home server or website. | ~10 min | A GitHub account or a web server |

### A. Open it online — easiest

### 👉 **[mercurial20.github.io/loremapper](https://mercurial20.github.io/loremapper/)**

That's it. The editor loads and runs **entirely in your browser**, and your maps
are saved in your browser too. This online copy is published automatically from
the `main` branch, so it always has the latest version.

> GitHub only delivers the app's files, like any website host. Your maps, images
> and edits are never uploaded anywhere. The online copy counts anonymous visits
> with Cloudflare Web Analytics; see [Privacy and analytics](#-privacy-and-analytics).

### B. Docker

Use this if you want your own copy that works offline.

**1. Install Docker Desktop** (one time) from [docker.com](https://www.docker.com/products/docker-desktop/) for Windows or macOS. On Linux, install [Docker Engine](https://docs.docker.com/engine/install/). Start it and wait until it says it's running.

**2. Get Loremapper.** Either:
- click the green **Code → Download ZIP** button on this page and unzip it, or
- if you use Git: `git clone https://github.com/mercurial20/loremapper.git`

**3. Start it.** Open a terminal in the unzipped folder and run:

```bash
docker compose up -d
```

> 💡 **How to open a terminal in a folder.** On **Windows**, open the folder in Explorer, right-click an empty area and choose **Open in Terminal**. On **macOS**, right-click the folder in Finder and choose **New Terminal at Folder**. On **Linux**, right-click and choose **Open in Terminal**.

The first start downloads and builds everything (1–3 minutes). When you see
`Container loremapper Started`, open **<http://localhost:8080>**. 🎉

<details>
<summary><b>Everyday Docker commands</b> (stop, update, change port, uninstall)</summary>

<br/>

| I want to… | Run this in the Loremapper folder |
|---|---|
| Stop it | `docker compose down` |
| Start it again | `docker compose up -d` |
| Use another port, e.g. 3000 (macOS/Linux) | `LOREMAPPER_PORT=3000 docker compose up -d` |
| Use another port, e.g. 3000 (Windows PowerShell) | `$env:LOREMAPPER_PORT=3000; docker compose up -d` |
| Update to a new version (Git) | `git pull` then `docker compose up -d --build --force-recreate` |
| Update to a new version (ZIP) | Download the new ZIP, then run `docker compose up -d --build --force-recreate` in the new folder |
| Uninstall | `docker compose down --rmi all`, then delete the folder |

Stopping, updating or uninstalling the container **does not delete your maps**.
They live in your browser ([why?](#-where-your-maps-live)). Changing the port
does hide them, because each address keeps its own maps.

The container only listens on your own computer (`127.0.0.1`). To open it from
other devices on your home network, change the `ports` line in `compose.yaml`
to `"8080:80"`.

</details>

### C. Node.js (without Docker)

**1.** Install [Node.js](https://nodejs.org) **22.12 or newer** (the LTS version is fine).<br/>
**2.** Download the project (ZIP or `git clone`, as in path B).<br/>
**3.** In a terminal inside the folder:

```bash
npm ci            # install dependencies (one time)
npm run build     # build the app
npm run preview   # serve it
```

Open **<http://localhost:4173>**. Stop it with <kbd>Ctrl</kbd>+<kbd>C</kbd>.

### D. Developer mode

```bash
git clone https://github.com/mercurial20/loremapper.git
cd loremapper
npm ci
npm run dev       # live-reloading editor at http://localhost:5173
```

Useful scripts: `npm test` (unit tests), `npm run lint`, `npm run typecheck` and
`npm run build`. See [CONTRIBUTING.md](CONTRIBUTING.md).

### E. Host it yourself

**Your own free copy on GitHub Pages**, updated every time you push:

1. Click **Fork** at the top of this page.
2. In your fork, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Open the **Actions** tab and allow workflows to run.
4. Run **Deploy to GitHub Pages** (or push any change to `main`).
   After a minute or two your copy is live at `https://<your-name>.github.io/loremapper/`.

**On your own server.** `npm run build` produces a **static website** in
`dist/`; there's no backend and no database on the server. Copy `dist/` to any
static web server (nginx, Caddy, Apache…).
[`docker/nginx.conf`](docker/nginx.conf) is a working example with caching and
the single-page-app fallback. To serve from a sub-path such as
`example.com/maps/`, build with `BASE_PATH=/maps/ npm run build`.

Self-hosted copies and forks ship **without analytics**. If you want
[Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/) on
your own copy, build with `CF_BEACON_TOKEN=<your site token>`, or set it as an
Actions variable named `CF_BEACON_TOKEN` in your fork.

<details>
<summary><b>🛠 Troubleshooting</b></summary>

<br/>

| Problem | What to do |
|---|---|
| `Cannot connect to the Docker daemon` | Docker Desktop isn't running. Start it, wait a moment, and try again. |
| `port is already allocated` | Something else uses port 8080. Start with another port (see the table above). |
| The page is empty or grey, or says WebGL is unavailable | Loremapper needs **WebGL 2**. Turn on hardware acceleration in your browser settings and update your graphics drivers. You can check your browser at [get.webgl.org/webgl2](https://get.webgl.org/webgl2/). |
| "My maps are gone!" | Open the **same browser** at the **exact same address** you used before (for example `http://localhost:8080`, not `127.0.0.1:8080`). The online version and your local copies keep separate maps. See [Where your maps live](#-where-your-maps-live). |
| "Saving failed" message | The browser storage may be full or disabled (private windows). Export your map right away with **Export → Editable project**. |
| `npm ci` fails | Check `node --version`. You need 22.12 or newer. |
| My fork's Pages site shows a 404 | Check that **Settings → Pages → Source** is **GitHub Actions** and that the **Deploy to GitHub Pages** workflow ran successfully. |

</details>

---

## 🗺 Your first map in 5 minutes

<table>
<tr>
<td width="50%"><img src="docs/images/new-map.jpg" alt="The New map flow: choosing a planet map or a flat map, with name, width, height and detail" /></td>
<td><b>1. Create a world.</b><br/>The first time you open Loremapper (and later from <b>Maps → New map</b>), choose how to begin:
<ul>
<li><b>Generate a world</b>;</li>
<li>an <b>Empty map</b>.</li>
</ul>
Either can be a <b>Planet map</b> or a <b>Flat map</b>:
<ul>
<li>a planet wraps east–west and has poles; you set its radius (Earth's 6,371 km by default) and its detail;</li>
<li>a flat map is a rectangle with the same scale everywhere; you set its width and height.</li>
</ul></td>
</tr>
<tr>
<td><img src="docs/images/generate.jpg" alt="The Generate world dialog: world types and templates, realism levels, a live preview and six seed variants" /></td>
<td><b>2. Generate or sculpt.</b><br/>Click <b>Generate</b> and pick a world: continents, a supercontinent, an ocean world, or a template such as <i>Old &amp; New World</i>, <i>Inner sea</i>, <i>Polar continent</i>, <i>Shattered continent</i> or <i>Mainland &amp; isles</i>. You can also add an island or an archipelago to the current view. Type any <b>seed</b>, roll the dice or click <b>Variants</b> to compare six worlds; the live preview shows exactly what you'll get. Choose a <b>realism</b> level from <i>Easy</i> (about 2 seconds) to <i>Ultra</i> (about 10 seconds or more, cancellable). In <i>Advanced settings</i> you can set land share, mountains, hills, temperature, rainfall, rivers and named settlements. The same seed and settings always give the same world. Prefer full control? Press <kbd>R</kbd> and paint land yourself.</td>
</tr>
<tr>
<td><img src="docs/images/world.jpg" alt="A generated planet with several continents" /></td>
<td><b>3. Explore your planet.</b><br/>Scroll to zoom and drag with the right mouse button (or hold <kbd>Space</kbd>) to pan. The world wraps around east to west, like a real globe. The bottom bar shows coordinates, elevation, biome and land share as you move.</td>
</tr>
<tr>
<td><img src="docs/images/assets.jpg" alt="The asset library open, with a selected fortress being edited in the inspector" /></td>
<td><b>4. Place cities, castles and dragons.</b><br/>Press <kbd>O</kbd> to open the library. Search it, click an asset and click the map, or drag it onto the map. Select an object to move, rotate or scale it with handles, and to give it a name, a description and your own notes (population, ruler…).</td>
</tr>
<tr>
<td><img src="docs/images/territory.jpg" alt="Drawing a kingdom border with its settings in the inspector" /></td>
<td><b>5. Draw borders and names.</b><br/>Press <kbd>G</kbd> and drag a lasso to draw a kingdom, empire, khaganate, republic, tribe or free city. Choose its colours and border style. Press <kbd>T</kbd> to write labels; they can curve along coasts.</td>
</tr>
<tr>
<td><img src="docs/images/export.jpg" alt="The Export dialog with image, heightmap and project options" /></td>
<td><b>6. Share it.</b><br/><b>Export</b> a high-resolution PNG of the whole planet or of your current view, either complete or as the players' revealed-only version. Back up the editable project as a <code>.loremap</code> file.</td>
</tr>
</table>

---

## 🧭 Features

### A world that makes sense

The generator builds a planet the way geology and weather would.

| | |
|---|---|
| **Tectonic plates** | Continental plates become continents. Where plates collide, mountain ranges and volcanic island arcs rise, with deep-sea trenches offshore. Where they pull apart, there are mid-ocean ridges and rift seas. Old, worn-down ranges run through continent interiors. The world type is a guarantee: a supercontinent really is one landmass, and an ocean world has only islands. |
| **Plains and mountains** | Most land is flat lowland, steppe or high plateau. Hills and peaks gather in mountain belts, not everywhere. |
| **Climate** | Temperature follows latitude and altitude. Prevailing winds carry moisture from the sea, so windward coasts are wet and the land behind mountains lies in a rain shadow. |
| **Rivers** | Rivers drain real basins from the highlands to the sea, with tributaries joining them. Each one runs downhill in its own valley. Closed basins fill up into flat river plains. At higher realism, rivers carve their valleys. |
| **Biomes** | Biomes follow climate, relief and water. Moisture against heat gives desert, then steppe, grassland and forest. Cold gives tundra and ice. Swamps form where water gathers in warm lowlands. Farmland lies on flat, watered land along rivers and coasts, and a great river keeps a green strip alive through the desert. |
| **Settlements** | Optional named settlements are placed logically. Capitals and towns sit on rivers, river mouths and coasts among fields. Castles sit on hills and watchtowers in mountain passes. None are placed on ice, in swamps, or in deserts away from water. |

### Terrain you can feel

| | |
|---|---|
| **Brushes** | Raise <kbd>R</kbd>, Lower <kbd>L</kbd>, Mountain range <kbd>M</kbd>, Smooth <kbd>S</kbd> and Flatten <kbd>F</kbd>. Brush size is in kilometres. Strength, softness, a per-stroke height cap and ragged natural edges are all adjustable. Hold the mouse still to keep building. |
| **Elevation** | Heights are real metres (up to 10,000 m by default) with an adjustable sea level. Peaks are detected automatically; you can name them, mark them as significant or remove them. |
| **Biomes** | Grassland, forest, farmland, desert, swamp, snow, rock and steppe, with soft edges. Forests grow painted tree crowns and farmland becomes a patchwork of fields. |
| **Rivers & roads** | Draw them freehand or point by point, then drag the points to reshape them. Rivers taper towards the source; roads can be dashed, paved, dotted or double. |

<img src="docs/images/elevation.jpg" alt="Left: contour lines; right: colour-coded height overlay" />

<table>
<tr>
<td width="50%"><img src="docs/images/measure.jpg" alt="Measuring distances across the map" /></td>
<td><b>A real planet underneath.</b> A new planet has Earth's 6,371 km radius (about 510 million km²). Distances and the scale bar are measured on the sphere, so the ruler (<kbd>U</kbd>) gives honest kilometres even near the poles and across the date line. On flat maps everything is measured on the plane.</td>
</tr>
</table>

### Your own art, kept forever

<table>
<tr>
<td width="55%"><img src="docs/images/custom-assets.jpg" alt="Imported custom assets in the library, a menu with rename, category, replace image and delete, and the assets placed on the map" /></td>
<td>

1. Press <kbd>O</kbd> to open the asset library.
2. Click **Import PNG / WebP / SVG**, or **drag files** onto the panel.
3. Click your asset, then click the map.

Imports are stored in your browser and survive restarts. From the <b>⋯</b> menu you can rename an asset, move it to another category (make your own with the 📁 button), **replace the image** of any asset, built-in or yours (every copy on the map updates), or delete it. Deleting an asset never removes objects already on your maps.

Transparent PNGs or SVGs around 256–512 px look best.

</td>
</tr>
</table>

### Fog of war for game masters

<img src="docs/images/fog.jpg" alt="Left: the editor sees through the fog; right: the player view" />

Press <kbd>X</kbd> and paint fog over unexplored lands, or reveal what the party
has discovered. Edges are soft and partial fog is possible. While editing you can
see through the fog; switch to **Player view** to check what players will see,
then export the **revealed areas only** image. Fog never changes anything
underneath it.

### Four looks, one map

<img src="docs/images/styles.jpg" alt="The same map in four styles: parchment, fantasy atlas, clean political and shaded relief" />

Switch styles any time from **View**: parchment, colourful fantasy atlas, clean
political or shaded relief. You can also toggle contour lines, the height
overlay, a latitude/longitude grid, peak markers and coastal ripples.

### Planets and flat maps

| | |
|---|---|
| **Planet map** | A whole round world: an equirectangular map that wraps east–west, with poles, latitude and longitude. **View → Repeat map horizontally** shows it once instead of repeating it sideways; the planet itself stays continuous. |
| **Flat map** | A rectangle of fixed size with the same scale everywhere: a kingdom, a region, a continent. No poles or wrapping; distances and areas are plain plane measurements. Every tool works on it. The generator builds continents, rivers and climates on it too, with a **Climate** zone from tropical to polar. |

### Metric or imperial

The **km / mi** switch in the top bar changes every measurement, and the choice is remembered:
- kilometres, square kilometres and metres;
- or miles, square miles and feet.

It covers heights and depths, brush sizes, distances, the scale bar, planet and map sizes, object sizes, areas and coastlines. Maps are always stored in metric, so switching never changes a map.

### On phones and tablets

Editing needs a desktop browser. A phone or tablet opens maps in a read-only viewer: drag to pan, pinch to zoom, tap land or water for its size, show or hide layers. Maps are stored in the browser that made them, so the viewer offers Earth, a sample world or a `.loremap` file to explore.

### How big is it?

Pick the Info tool (<kbd>I</kbd>) and point at any land or water: the status bar shows its name and area. Click it and the whole continent, island, sea or lake is outlined, and a card opens in the panel (close it with ✕ or <kbd>Esc</kbd>) with:

- its **area**, measured on the sphere, and its share of all land;
- its coastline, its highest or deepest point and its mean height;
- how far it reaches in latitude and longitude, and which realms lie on it.

You can name it there and write the name on the map as a normal label. **Lands & seas** in the right panel lists every landmass and body of water by size; click one to fly to it. A selected territory also shows how much land lies inside its border and which landmasses it covers. Units switch between metric (km², km, m) and imperial (mi², mi, ft).

### Also included

- **Layers**: show, hide, lock and fade terrain, biomes, borders, rivers, objects, labels, peaks and fog. You can create your own object layers.
- **Undo / redo** for everything, plus copy, multi-select, z-order, lock and hide.
- **Many maps**: each is saved separately, with thumbnails, and can be renamed or duplicated.
- **Keyboard first**: press <kbd>?</kbd> in the app for all shortcuts.

<details>
<summary><b>⌨️ Tool shortcuts</b></summary>

<br/>

| Key | Tool | Key | Tool |
|:-:|---|:-:|---|
| <kbd>V</kbd> | Select & edit | <kbd>W</kbd> | River |
| <kbd>H</kbd> | Pan | <kbd>D</kbd> | Road |
| <kbd>R</kbd> | Raise terrain | <kbd>O</kbd> | Place objects |
| <kbd>L</kbd> | Lower terrain | <kbd>T</kbd> | Label |
| <kbd>M</kbd> | Mountain range | <kbd>G</kbd> | Territory |
| <kbd>S</kbd> | Smooth | <kbd>X</kbd> | Fog of war |
| <kbd>F</kbd> | Flatten | <kbd>P</kbd> | Peaks |
| <kbd>B</kbd> | Paint biome (<kbd>1</kbd>–<kbd>8</kbd> pick one) | <kbd>U</kbd> | Measure |
| <kbd>E</kbd> | Eraser | <kbd>[</kbd> <kbd>]</kbd> | Brush size |
| <kbd>I</kbd> | Info: name and size of land or water | <kbd>\\</kbd> | Hide / show the right panel |

<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> redo · <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate · <kbd>Delete</kbd> remove · hold <kbd>Shift</kbd> or <kbd>Alt</kbd> while painting to invert a brush

</details>

---

## 💾 Saving, backups and export

**Saving is automatic.** About a second after each change, the top bar shows ✓ *Saved*.

<table>
<tr>
<td width="45%"><img src="docs/images/projects.jpg" alt="The list of saved maps with thumbnails" /></td>
<td>

| Export | What you get | Editable later? |
|---|---|:-:|
| **Map image** | PNG up to 12,288 px wide: current view or whole planet, complete or revealed-only | ✗ |
| **Heightmap** | 16- or 8-bit greyscale PNG of the elevation, for game engines and 3D tools | ✗ |
| **Editable project** | A `.loremap` file with everything, including your custom images | ✓ |

</td>
</tr>
</table>

> 🛟 **Make backups.** Browser storage can be wiped by "Clear browsing data",
> by cleanup tools or by reinstalling the browser. Now and then, use
> **Export → Editable project** and keep the `.loremap` file somewhere safe.
> Restore it from **Maps → Import project file…**, in any browser or on any computer.

## 🔒 Where your maps live

Maps and imported images are stored in **your browser** (IndexedDB), not on the
server and not inside the Docker container.

- Each **browser** and each **address** keeps its own maps.
  The online version (`mercurial20.github.io`), `http://localhost:8080`,
  `http://127.0.0.1:8080` and `http://localhost:4173` are four separate places.
- Rebuilding, updating or deleting the container does **not** touch your maps.
- To move a map to another browser or computer, export it as an editable project
  and import it there.
- Private or incognito windows usually forget everything when they close.

## 📊 Privacy and analytics

The official online version at
[mercurial20.github.io/loremapper](https://mercurial20.github.io/loremapper/)
uses [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) to
count visits, see where visitors come from (referrers, countries) and measure page
load speed. It doesn't use cookies or local storage. This is only so we can see
whether people find the project useful.

- Analytics only sees that the page was opened. Your maps, map names, drawings,
  imported images, tool usage and projects are **never sent** anywhere. They stay
  in your browser.
- If the analytics script is blocked (for example by an ad blocker), Loremapper
  works exactly the same.
- Docker, Node.js and self-hosted copies, and forks, include **no analytics** at all.

## 🌐 Browser support

You need a desktop browser with **WebGL 2**, and a mouse or trackpad.

| Browser | Status |
|---|---|
| Chrome / Chromium | ✅ Tested (Chrome 154, macOS) |
| Firefox | ✅ Tested (Firefox 157, macOS). The console shows harmless WebGL notices. |
| Safari | 🟡 Tested with its engine, WebKit 27.2, but not with the Safari app itself |
| Edge, Opera, Brave | 🟡 Expected to work (Chromium-based), not tested yet |
| Phones and tablets | 👀 Read-only viewer (pan, zoom, inspect); editing needs a desktop browser |

So far testing has been on macOS. Windows and Linux reports are very welcome.

## 🚧 Current beta limitations

- A map's resolution is chosen when it's created and can't be changed later. You can't sculpt details smaller than one terrain cell (~11 km on Standard); biome paint and fog use cells twice that size.
- Generated rivers sit in their own valleys, but rivers and roads you draw by hand sit on top of the terrain. Lakes aren't drawn as water yet: closed basins fill up into flat plains instead.
- Neighbouring borders don't snap together.
- Undo history is cleared when you reload the page or switch maps.
- Curved labels are selected using their straight outline.
- Project files of fully generated worlds are large (about 20–25 MB).
- Each Loremapper version may build a different world from the same seed. Within one version, the same seed and settings always give the same world. In other browsers it can differ very slightly.
- Very large image exports (over ~160 megapixels) are disabled.
- Near the poles, brushes keep their real size in km, so they look very wide on the flat map.
- Editing is desktop-only; phones and tablets get a read-only viewer.
- Planets are shown in the equirectangular projection only; polar projections aren't available yet.

## ✅ Testing done for this beta

- Lint, type-check, 31 unit tests and the production build all pass. The tests cover:
  - deterministic worlds: one seed and one set of settings give the same world;
  - world types that hold, and rivers that always run downhill;
  - true areas on the sphere.
- `docker compose up -d` starts the app on `localhost:8080` (checked by CI on every push), and a build served from the GitHub Pages sub-path (`/loremapper/`) passes the same checks.
- Automated browser runs in Chrome 154, Firefox 157 and WebKit 27.2 (macOS) covered:
  - painting terrain and biomes;
  - placing and editing objects;
  - importing PNG and SVG assets and replacing artwork;
  - reloading, with maps, assets and the camera all restored;
  - all three exports and re-importing a project;
  - switching maps.
- In all three browsers, the runs also covered the new parts:
  - every world type at every realism level;
  - cancelling a generation;
  - an island in the current view;
  - measuring continents and territories.

  All three gave identical areas. The runs produced no console errors and no requests to any outside server. Firefox logs a few harmless WebGL notices.

## 🐞 Reporting bugs and contributing

- **Found a bug?** [Open an issue](https://github.com/mercurial20/loremapper/issues/new/choose). The form asks for your app version (press <kbd>?</kbd> in the app), browser, OS and the steps to reproduce. A screenshot or an exported `.loremap` file helps a lot.
- **Have an idea?** Feature requests are welcome. Please describe what you're trying to draw, not only the button you want.
- **Want to code?** Read [CONTRIBUTING.md](CONTRIBUTING.md). Before opening a pull request, run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.

<details>
<summary><b>🏗 How it's built</b></summary>

<br/>

The app is TypeScript with **React 19** for the interface, **PixiJS 8 (WebGL 2)**
for the map, **Zustand** for state and **IndexedDB** for storage. **Vite**
builds it, and the Docker image serves it with **nginx**.

```
src/
  core/         planet constants, projection & distances, noise and geometry helpers
  terrain/      sparse tiled rasters (elevation, biomes, fog), brushes, peaks, world generator
  model/        document types, undo/redo, versioned project format
  store/        application state
  persistence/  IndexedDB storage for maps, tiles, assets and settings
  assets/       asset library and the built-in SVG asset pack
  render/       PixiJS renderer, GLSL terrain/fog shaders, vector layers
  tools/        mouse and keyboard handling for every tool
  editor/       glue code, commands, generation, import/export
  ui/           React components
```

The terrain is stored in 256×256-cell tiles, and only areas you've touched use
memory. Shaders draw each tile on the GPU, and a brush stroke re-uploads only
the tiles it changed. The saved format is versioned
(`src/model/serialization.ts`). The built-in art in `src/assets/starter/` is
plain SVG generated in code and can be swapped freely.

</details>

## 📜 License and acknowledgements

Loremapper is released under the [MIT License](LICENSE) as a free,
non-commercial hobby project.

- Fonts: Cinzel, EB Garamond, IM Fell English and Inter, under the SIL Open
  Font License 1.1, bundled via [Fontsource](https://fontsource.org).
- Libraries: React, PixiJS, Zustand, idb, fflate and Lucide icons.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for details.

Inspired by [Cartographer](https://github.com/PaulsGameDevHub/cartographer) by
PaulsGameDevHub and by [Inkarnate](https://inkarnate.com). Loremapper is not
affiliated with either. Cartographer has no open-source license, so no code,
data or artwork from it is included; similar ideas were implemented
independently.

<div align="center"><sub>Made with ☕ for worldbuilders, game masters and map nerds.</sub></div>
