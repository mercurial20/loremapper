# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.3-alpha.3] — 2026-10-16

### Added

- **Mountain ranges drawn as lines** (alpha, now the default in the Mountain ranges tool). Draw a range's crest; start or end a line on another crest to branch off it. Rivers then carve the range into ridges and valleys (stream-power erosion), and ranges that touch are carved together, with valleys between parallel chains. Each range has its height, width, irregularity and asymmetry, *Another variant*, and *Bake into terrain* to sculpt it further with the brushes. The previous brush stays available.
- **Raise: Erosion method** (alpha): paint where land rises and rivers carve it into ridges and valleys. *Classic* stays the default.
- **Lakes with their own water level** (Lake tool, <kbd>K</kbd>):
  - *Fill a hollow*: a click fills a hollow up to the lowest point of its rim, so the shore follows the land;
  - *Paint*: the shore follows the brush, the bed is cut below the water; painting on from a lake extends it, and water painted into the sea becomes a bay;
  - shores look like the sea's: fractal detail, coast line and ripples; deeper water is darker;
  - a selected lake shows its area and depth, and its level can be lowered or raised up to where it would spill (*Fill to the brim*).
- **Rivers as one network with the sea and lakes.** Rivers are now drawn as the map's water: a river's mouth opens into the sea or a lake without a line across it, and a tributary flows into its river without a seam. Below each tributary the river widens. While drawing, a river's end snaps to the shore of the sea or a lake, or onto another river; a river drawn from its mouth upstream is turned around.
- **One way to select anything.** *Select* <kbd>V</kbd> now picks objects, rivers, roads, realms and labels, and also lakes, islands, continents and seas. Click it again or press Esc to let go; switching to a tool that does not work on it lets go too. Islands inside lakes are islands of their own.

### Changed

- *Info* is part of *Select* (<kbd>I</kbd> still switches to it); hovering shows what is under the cursor below the map.
- Rivers take the colour of the map's water; a river no longer has a colour of its own.
- The River tool draws paths only; the water-painting brush is replaced by the Lake tool's *Paint*. Water painted earlier stays on the map.
- Classic brush presets no longer have ragged edges.

## [1.2.3-alpha.2] — 2026-10-15

### Fixed

- **No more noisy bumps when zoomed in.** The terrain's shading drew a fine relief texture of its own that was not in the heights: worm-like bumps that grew stronger on high ground, however flat, and looked like noise at close zoom. It is off; what you see when zoomed in is the land as it is. Real fine detail will come from the heights themselves in a later version.
- Generated regional maps get gentler fine relief, scaled to the size of a cell, so their plains no longer look like badlands. This only affects newly generated worlds.

## [1.2.3-alpha.1] — 2026-10-15

### Added

- **Russian interface.** Every text in the app is now translatable, and Russian is the first language besides English:
  - new visitors whose browser prefers Russian (or Belarusian or Kazakh) over English get it right away, and the welcome screen has a language menu next to the km/mi switch;
  - while drawing, the same menu sits next to km/mi in the top bar; switching is instant and remembered in this browser;
  - numbers follow the language (`1 234,5` in Russian), and so do peak heights and measurements on the map.

  Translations use i18next with one JSON file per language in `src/i18n/locales/`, keyed by the English text. `npm run i18n` brings the files in line with the code; a test fails when a text has no translation or a translation drops a `{placeholder}`. Built-in worlds, map styles, projections, tools, biomes and the built-in icons are translated too; names you type are never changed.
- **Paint rivers with a brush** (alpha). The River tool <kbd>W</kbd> now paints water like a brush, by default: any width, so the same brush makes streams, wide rivers and lakes, and Shift or Alt erases. Painted water is stored at four times the terrain's resolution, so a river can be much narrower than a terrain cell: down to about 60 m on a 500 km map. Water follows the map style and the *Rivers & roads* layer (visibility and opacity). The previous smooth tapering river stays available as *Path*. An *alpha* mark beside *Brush* says the tool is still being tested.
- **Rivers shape the land like real rivers.** *Carve a valley* (on by default, in the River tool) follows river geomorphology:
  - the river runs downhill all the way: from its outlet (the sea, the map's edge, or its lowest point) it settles on a graded, concave profile, steep near the sources and gentle near the mouth (Flint's and Hack's laws). A hill across its course is cut into a gorge, a deep basin on the way stays as a lake, and low sills between hollows are cut through;
  - valley sides then settle to the steepness of the hillslopes around, so a deep cut opens a wide V-shaped valley and a shallow one a gentle dip;
  - lowland rivers get a flat floodplain a little above their bed, wider for bigger rivers.

  It only ever lowers the land, never into the sea, and running it again on the same river changes nothing. It works for painted rivers and for rivers drawn as a path, and one undo removes the river and its valley together.
- **Softer forest edges.** Forests and other painted biomes now thin out gradually towards their edges instead of ending in a hard line, and the trees fade into the open land around them. *View → Biome edges* sets how soft the edges are, from *Crisp* to *Very soft* (saved with the map).

### Changed

- **Smoother on modest laptops.** Profiling a generated planet (4096 × 2048) showed the main thread busy in small bursts that add up to stutters on slower machines; the app's own code now spends about four times less processor time while panning, zooming and painting (6.9 s → 1.75 s in the profiled session), and the page's main thread is busy less than half as long:
  - the mini globe kept its turned picture and redraws only the outline of the view, turning at most about eight times a second while the view moves (it used to project its 118 000 pixels on every frame of a pan);
  - the mini globe's picture of the planet is refreshed once editing pauses for 1.5 s instead of between brush strokes (reading the picture back from the graphics card stalls it);
  - numbers are formatted with one cached formatter per language, instead of a new one for each peak height on each frame;
  - the header measures its layout only when its texts or the window's width change, not on every re-render.
- Smaller brushes: the smallest brush now reaches a single cell of the layer it paints (half a cell for terrain, an eighth of a terrain cell for rivers). On a 500 km map that is about 120 m for terrain and 30 m for rivers.
- Generating a whole new world clears painted rivers, which would otherwise run across the new land.
- The header fits its contents to the window width in any language, hiding link labels, then the wordmark, then the view chips (also in *View*), then button labels as space runs out.
- Painting a biome with a soft brush no longer saturates to full strength at the brush edge over repeated dabs.
- The project format is now version 3 (a layer of painted water). Maps and `.loremap` files from earlier versions open unchanged; maps saved by this version need 1.2.3 or later.

## [1.2.2-alpha.1] — 2026-10-12

### Added

- **Reference image for tracing.** *Layers → Add reference image…* lays a PNG, JPEG or WebP picture over the map, for example a map made in another tool, so you can trace its coasts with the brushes:
  - adjustable opacity, *Move & resize* (drag it, drag a corner; Shift frees the proportions), *Fit* and *Stretch to map*, lock, show/hide, replace and remove, all undoable;
  - it sits on the terrain, under borders, rivers and symbols, and never changes the terrain;
  - it is saved with the map and inside `.loremap` files, and stays out of the icon library;
  - *Include in image exports* (on by default) decides whether exported pictures show it; the same switch is in *Export → Map image*;
  - *Export → Editable project* can leave the picture out of that one file (its size is shown), while the map in the browser keeps it.
- **A few more anonymous counts on the official site.** Besides the five existing events: a project was imported, a reference image added, *Share on r/LoreMapper* clicked, a tool / map style / projection used (once per visit for each), and generating, exporting or importing failed. Existing events gain fixed labels: the map type and how it was started, the kind of world and realism level, the export format and projection. Every property and value is checked against a fixed list before sending (anything else becomes "other"); nothing a user types, no map content, sizes, seeds or error messages, and built-in worlds are counted without their names. The README lists every event.
- **Sand planet** and **Snow planet** presets in *Generate*: worlds without water. The old ocean basins become lowlands (sand seas or snowfields), mountain ranges and plateaus keep their relief, bare rock shows on slopes (and, on the snow planet, in windswept patches), and there are no rivers. Each pick starts from a new seed. Other presets build exactly the same worlds as before.

## [1.2.1-alpha.1] — 2026-10-11

### Added

- **Minimal product analytics on the official site.** Five anonymous event counts (a map was created, a world generated, a map edited, a saved map reopened, a map exported), sent with PostHog only from mercurial20.github.io/loremapper. Events carry no properties beyond what PostHog needs to accept them; nothing is stored in the browser, the anonymous ID lasts one page load, and no person profiles are created. Browsers sending Global Privacy Control or Do Not Track are skipped. The SDK loads lazily in its smallest build, without autocapture, replay, surveys or remote scripts. Self-hosted copies and forks are unaffected. See *Privacy and analytics* in the README.

## [1.2.0-alpha.1] — 2026-10-11

An early look at map projections: view a planet as a globe, a polar map or
a world map, keep a mini globe in the corner, and export in any of them.

### Added

- **Mini globe.** A small globe in the corner of planet maps shows the whole world with the part on screen outlined. It turns to follow the view (or shows the north or south pole from above), refreshes a moment after edits, and a click moves the view there. It can be hidden.
- **Look at a planet in other projections, live.** *View → Projection* shows the map as a globe, a polar (azimuthal) map, Gott's double-sided disks, Equal Earth, Mollweide or Mercator. Drag to turn the globe or move around, scroll or pinch to zoom; Info and the status bar keep working, and phones and tablets can use it too. It's for looking: picking an editing tool brings back the editable equirectangular map, and the map's data never changes. Export starts from the projection and centre on screen.
- **Export planets in other map projections.** *Export → Map image* now offers, besides the editor's own equirectangular grid:
  - **Equal Earth** and **Mollweide**, world maps with true areas;
  - **Mercator**, with true shapes (cut at 85°);
  - **Globe** (orthographic), the planet as seen from space;
  - **Azimuthal** (equidistant), centred on a pole or anywhere, showing one hemisphere or the whole planet;
  - **Gott double-sided** (Gott, Goldberg & Vanderbei, 2021), the northern and southern hemispheres as two disks that meet along the equator.

  A live preview shows the result; drag it to turn the globe or move the centre. Terrain, biomes and the players' fog are reprojected; rivers, roads, borders, symbols, labels and peaks are drawn in the projection itself, so text stays upright and sharp. Images go up to 8192 px wide.

### Fixed

- Map label font lists were changed in place by the renderer, which could leave later text in a fallback font.

## [1.1.0] — 2026-10-11

Flat maps and built-in worlds, a generator that shapes relief like real
geology, eight map styles, global units and a viewer for phones and tablets.

### Added

- **Welcome screen on first launch.** It offers **Generate a world**, a **Built-in world** or an **Empty map**; the same choices back **Maps → New map**. A browser that already has maps opens the last one as before.
- **Flat maps:**
  - rectangles of fixed physical size (default 500 × 500 km, or 400 × 400 mi in imperial), any aspect ratio;
  - uniform scale, no poles and no wrapping, with planar distances and areas;
  - all tools work on them, as do Lands & seas and export;
  - the generator builds them as a patch of a virtual planet, so tectonics, rivers and biomes carry over, and adds a climate zone setting.
- **Built-in worlds:** *The Inner Sea*, *The Walled Isle*, *The Thousand Isles* and *The Spine of the World* as flat maps, and three planets drawn from science: *Pangaea* (Earth 250 million years ago), *Pangaea Proxima* (Christopher Scotese's forecast for 250 million years from now) and *The Eyeball World* (a tidally locked planet with an ocean under its unmoving sun and a frozen night side). Each is a sketch of land, seas, ranges and climate regions that the generator turns into full relief, rivers, biomes and towns. **Suggest a world** opens a GitHub form for new ones (original settings only).
- **Built-in worlds can bring realms, places and names:** realm borders are traced along the generated coast, every land cell belongs to one realm, and places come with their name labels.
- **Cyrillic and Greek map labels** use Garamond where the display or old-hand fonts have no such letters, instead of a system font.
- **Share on r/LoreMapper:** after a map image is saved, a small dialog offers to post it on the subreddit (Reddit opens in a new tab; nothing is uploaded from Loremapper). It can be turned off with *Don’t ask again*.
- **Four new map styles:** *Anime* (cel-shaded bands, flat colour levels, bold outlines), *Strategy game*, *Pixel art* and *Antique engraving* (shadows drawn as hatching).
- **A simpler View menu:** styles as small previews in one grid, one relief slider, and map overlays as on/off chips whose settings appear only when they're on.
- **Global metric / imperial switch** in the top bar (km, km², m / mi, mi², ft). It applies everywhere and is remembered; stored maps never change.
- **"Repeat map horizontally"** view option for planets.
- **Read-only viewer on phones and tablets:**
  - pan, pinch zoom, tap for region or feature info, and layer visibility;
  - edits are refused in the logic, not just hidden;
  - a one-line note points to the desktop for editing.
  - the map gets the whole screen: the panel starts hidden and opens from its button or when you tap the map; closing a card tucks it away again.
- **Community links** always visible in the top bar: GitHub and Reddit (with labels on wide screens) and a feedback button for bug reports and suggestions.
- **Info tool** (<kbd>I</kbd>): point at land or water to see its name and area in the status bar; click it for its card, which closes with ✕ or <kbd>Esc</kbd>. Dragging with it pans.
- **Hide the right panel** with the button at the top right of the map or <kbd>\\</kbd>, for more room; the choice is remembered.
- **Kinds of land for the Raise brush:** Plains (the default), Hills, Plateau and Mountains. Plains, hills and plateaus level off at a natural height instead of rising forever, so a beginner's first strokes make believable lowlands. Moving a slider turns the choice into Custom.

### Changed

- **World generator version 3: relief from uplift and erosion.** Plate tectonics now sets how fast each region rises, and the heights are the steady state of that uplift against river incision (the stream-power law, after Cordonnier et al. 2016 and Tzathas et al. 2024). Ranges get branching valleys and sharp ridges, plains stay low, and wetter land wears lower. Compared with Earth's relief (ETOPO1) at the same resolution, generated worlds now match:
  - its distribution of land elevations (mean ≈ 600–650 m, Earth ≈ 690 m, with a similar share of lowland below 200 m);
  - its slopes (median ≈ 2.0–2.3 m/km, Earth 2.55, against 1.0–1.4 before);
  - its river-basin shape: Hack's exponent ≈ 0.45–0.47, against 0.39–0.45 before and Earth's 0.56.

  The same seed builds a different world than in version 2.
- **More natural plates and coasts.** Plate sizes follow a power law, as on Earth (a few giant plates among many small ones). Coastal noise has more octaves, so coasts are more irregular.
- **Calibrated temperatures and snow line.** Sea-level temperatures by latitude follow Earth's zonal means (≈ 10 °C at 45°), and permanent snow starts around a −6 °C annual mean (≈ 2,800 m in mid-latitudes, like the Alps).
- **Gravity suggests a mountain height.** Map settings show how tall mountains could stand at the planet's gravity (Everest scaled by 1 / g) and can apply it as the maximum elevation.
- **Ocean currents and dry summers in generated climates.** Wind-driven gyres put cold currents off western coasts in the subtropics (coastal deserts) and warm ones off eastern coasts (humid subtropics), and flip at high latitudes. Western coasts at 30–45° get Mediterranean dry summers, with scrub and grassland rather than forest.
- New planets default to Earth's radius, 6,371 km. Existing maps keep their own.
- Hill shading defaults to 30% for new maps (it was 85%): ranges stay readable without the relief overwhelming the map. Existing maps keep their setting.
- A click on empty map with the Select tool now only clears the selection; measuring land and water moved to the Info tool.
- Generated rivers follow the lowest ground under them, meet nearby river beds, and end where they first reach the sea.

### Fixed

- **Painting on flat maps is fast again.** The search for summits used a radius in kilometres that, on a fine flat grid, spanned over a thousand cells; it now scales with the map, and an edit's main-thread work dropped from about 10 s to 0.1 s.
- **No more lag when selecting a large landmass.** The outline is now traced once in the analysis worker and simplified per zoom step. On a 8192 × 4096 map, zoom frames with an outline went from a 117 ms p95 to 17 ms, with no main-thread long tasks.

### Compatibility

- **Project format 2.** Older projects open as planets with the radius they were made with; their terrain, biomes, objects, paths, borders, labels and view are unchanged. Both `.loremap` files and browser-saved maps are migrated.

## [1.0.0-beta.2] — 2026-10-10

A new world generator that builds planets from plate tectonics, climate and
rivers, and a tool that measures continents, islands, seas and lakes.

### Added

- Steppe biome (key <kbd>8</kbd> in the biome brush).
- **Sizes of continents, islands, seas and lakes:**
  - with the Select tool, click land or water to outline it and see its true area, coastline, highest or deepest point, extent and realms;
  - give it a name and write the name on the map;
  - **Lands & seas** lists every landmass and water body by size;
  - territories show the land area inside their border;
  - metric / imperial switch (km², km, m or mi², mi, ft).
- Automatic deployment to GitHub Pages on every push to `main`
  (<https://mercurial20.github.io/loremapper/>), via `.github/workflows/pages.yml`.
- `BASE_PATH` build variable for serving the app from a sub-path
  (e.g. `BASE_PATH=/maps/ npm run build`).
- Search and link-preview metadata: page title and description, canonical URL,
  Open Graph and Twitter/X cards with a 1200×630 preview image, Schema.org
  `WebApplication` data, Apple touch icon, `robots.txt` and `sitemap.xml`.
- Cloudflare Web Analytics on the official GitHub Pages site only, enabled by the
  `CF_BEACON_TOKEN` build variable. Docker, npm and fork builds include no
  analytics. Map data is never sent.
- `CODEOWNERS` file.

### Changed

- **New world generator.** The world is built by plate tectonics on the sphere:
  - Continents ride on plates. Mountain ranges, volcanic island arcs and trenches form where plates collide; ridges and rift seas form where they part.
  - The world type is now guaranteed: a supercontinent is one landmass, continents are separate, and an ocean world has only islands.
  - Flat plains, steppes and plateaus, with hills and peaks gathered in mountain belts.
  - Wind-driven climate with rain shadows.
  - Rivers drain real basins, have tributaries and always run downhill in their own valleys.
  - Biomes follow climate, relief and water.
  - Settlements are placed logically: towns on rivers and coasts, castles on hills, towers in passes.
- **New Generate dialog:**
  - world types plus templates: Old & New World, Inner sea, Polar continent, Shattered continent, Mainland & isles;
  - a live preview and six seed variants;
  - realism levels Easy, Medium, High and Ultra, with erosion at the higher levels;
  - advanced settings for temperature, rainfall, hills and river count;
  - a Cancel button with progress while generating.
- **Different worlds from old seeds.** Seeds from 1.0.0-beta.1 now produce different worlds. Within a version, one seed and one set of settings always give one world.
- **Old rivers removed on regeneration.** Generating a whole planet now replaces previously generated rivers; drawn roads, borders and labels stay.

### Fixed

- **No more grid pattern when zoomed in.** Close-up shading was faceted along terrain cells; it now uses a smooth gradient.
- **Flat land stays flat.** Flat land no longer gets artificial bumps.
- **No phantom coastlines.** Steep underwater slopes no longer show coastline ink.

## [1.0.0-beta.1] — 2026-10-09

First public beta.

### Added

- Browser-based fantasy world map editor: React 19, PixiJS 8 (WebGL 2), Zustand, IndexedDB.
- Equirectangular planet (default radius 7,410 km, ≈690 million km²) with seamless longitude wrap, latitude-correct brush sizes, scale bar and great-circle distance measuring.
- Elevation in metres with configurable sea level; Raise, Lower, Mountain-range, Smooth and Flatten brushes with radius, strength, falloff, per-stroke cap and edge roughness.
- Automatic peak detection with elevations; naming, designating and removing peaks.
- Contours, hypsometric height overlay, lat/long grid; four map styles (parchment, fantasy atlas, clean political, shaded relief).
- Biome painting (grassland, forest, farmland, desert, swamp, snow, rock).
- Seeded generation of continents, a supercontinent, islands and archipelagos, with optional biomes, rivers and named settlements.
- Editable rivers and roads, territories (kingdoms, khaganates, republics, empires, tribes, independent cities) and map labels.
- 57 built-in vector map assets; import of PNG, WebP and SVG assets into a persistent library with categories.
- Object placement and stamp brush; per-object size, rotation, opacity, layer, z-order, lock, hide, name, description and metadata.
- Fog of war with hide/reveal brushes and an editor “see through fog” toggle.
- Layers panel, undo/redo, keyboard shortcuts, automatic saving, multiple maps.
- Export to PNG (current view or whole planet, complete map or revealed areas only), 16/8-bit heightmap PNG, and `.loremap` project archives with re-import.
- Docker image (nginx) and `compose.yaml` for one-command self-hosting.

[Unreleased]: https://github.com/mercurial20/loremapper/compare/v1.2.3-alpha.1...HEAD
[1.2.3-alpha.1]: https://github.com/mercurial20/loremapper/compare/v1.2.2-alpha.1...v1.2.3-alpha.1
[1.2.2-alpha.1]: https://github.com/mercurial20/loremapper/compare/v1.2.1-alpha.1...v1.2.2-alpha.1
[1.2.1-alpha.1]: https://github.com/mercurial20/loremapper/compare/v1.2.0-alpha.1...v1.2.1-alpha.1
[1.2.0-alpha.1]: https://github.com/mercurial20/loremapper/compare/v1.1.0...v1.2.0-alpha.1
[1.1.0]: https://github.com/mercurial20/loremapper/compare/v1.0.0-beta.2...v1.1.0
[1.0.0-beta.2]: https://github.com/mercurial20/loremapper/compare/v1.0.0-beta.1...v1.0.0-beta.2
[1.0.0-beta.1]: https://github.com/mercurial20/loremapper/releases/tag/v1.0.0-beta.1
