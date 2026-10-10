# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Planned as v1.1: map types, a welcoming start, global units and a phone / tablet viewer.

### Added

- **Welcome screen on first launch.** It offers **Generate a world**, a **Built-in world** or an **Empty map**; the same choices back **Maps → New map**. A browser that already has maps opens the last one as before.
- **Flat maps:**
  - rectangles of fixed physical size (default 500 × 500 km, or 400 × 400 mi in imperial), any aspect ratio;
  - uniform scale, no poles and no wrapping, with planar distances and areas;
  - all tools work on them, as do Lands & seas and export;
  - the generator builds them as a patch of a virtual planet, so tectonics, rivers and biomes carry over, and adds a climate zone setting.
- **Built-in worlds:** *The Inner Sea*, *The Walled Isle*, *The Thousand Isles* and *The Spine of the World*. Each is a sketch of land, seas, ranges and climate regions that the generator turns into full relief, rivers, biomes and towns. **Suggest a world** opens a GitHub form for new ones (original settings only).
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
  - its distribution of land elevations (mean ≈ 650–840 m, Earth ≈ 690 m);
  - its slopes (median ≈ 2.0–2.6 m/km, Earth 2.55);
  - its river-basin shape: Hack's exponent ≈ 0.44–0.48, against 0.39–0.45 before and Earth's 0.56.

  The same seed builds a different world than in version 2.
- **More natural plates and coasts.** Plate sizes follow a power law, as on Earth (a few giant plates among many small ones). Coastlines stay fractal down to full resolution.
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

[Unreleased]: https://github.com/mercurial20/loremapper/compare/v1.0.0-beta.2...HEAD
[1.0.0-beta.2]: https://github.com/mercurial20/loremapper/compare/v1.0.0-beta.1...v1.0.0-beta.2
[1.0.0-beta.1]: https://github.com/mercurial20/loremapper/releases/tag/v1.0.0-beta.1
