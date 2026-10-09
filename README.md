# Fantasy Cartographer

A local-first, browser-based editor for drawing fantasy world maps. Start from an
empty ocean planet, raise continents and mountain ranges, paint biomes, draw
rivers, roads and borders, place illustrated assets, hide unexplored lands under
fog of war, and export images, heightmaps or editable project files.

It is a manual drawing tool, not a simulator: nothing about politics, economies
or populations is modelled.

It builds on [PaulsGameDevHub/cartographer](https://github.com/PaulsGameDevHub/cartographer).
Its algorithms (fbm value-noise generation, falloff brushes, downhill river
tracing, the medieval name generator and the 16-bit PNG writer) were ported and
extended here.

## Getting started

Requirements: Node 20+ and a desktop browser with WebGL 2 (current Chrome, Edge, Firefox or Safari).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm test           # unit tests (Vitest)
npm run lint       # oxlint
```

There is no backend and no account. Everything is stored in your browser's
IndexedDB and saved automatically about a second after each change.

## What you can do

| Area | Features |
| --- | --- |
| **Terrain** | Raise, Lower, Mountain-range, Smooth and Flatten brushes (fixed or sampled height). Each has a radius in km, strength, falloff, a per-stroke cap ("opacity") and edge roughness for natural coasts. Hold still to keep building; Shift/Alt inverts. |
| **Elevation** | Heights are metres relative to a datum (–11,000 to +10,000 m by default), with a configurable sea level. Includes contour lines with a selectable interval, a hypsometric height overlay, hill shading, and a live elevation readout under the cursor. |
| **Peaks** | Summits are detected automatically as local maxima within about 160 km and recomputed as you sculpt. Markers show the real elevation in metres. You can name a peak, mark it as significant, designate new peaks, or remove one (Alt-click). |
| **Biomes** | Paint grassland, forest, farmland, desert, swamp, snow and rock with soft blended edges. Forests render as painted tree crowns, farmland as a field patchwork, deserts as dunes. |
| **Generation** | Continents, a supercontinent, an island or an archipelago (the last two in the current view), from a seed. Land share is measured by true area (29 % by default), with mountain belts, climate biomes, rivers and optional named settlements. Generation is undoable. |
| **Geography** | Equirectangular planet (radius 7,410 km by default, about 690 million km²). Longitude wraps seamlessly. Brush radii and the scale bar are latitude-correct, and great-circle distances can be measured. Shows a lat/long grid and land/water statistics. |
| **Rivers & roads** | Freehand or click-to-place splines. Rivers taper; roads can be dashed, solid, dotted or double. Edit by dragging control points, double-click to insert one, Alt-click to delete one. |
| **Objects** | 57 built-in illustrated assets plus your own PNG, WebP and SVG imports. Place them one at a time or with a stamp brush that randomises scale, rotation and mirroring. Each object has position, size, scale, rotation, opacity, z-order, a layer, lock/hide, duplicate, name, description and custom key–value metadata. |
| **Asset library** | Searchable, with categories. Import by file picker or drag-and-drop, then rename, recategorise, replace artwork, restore originals, hide built-ins, delete your own, and manage custom categories. Everything persists in IndexedDB. |
| **Territories** | Kingdoms, khaganates, republics, empires, tribal lands and independent cities as editable polygons. Each has a fill colour and opacity, border colour, style (solid, dashed, dotted, double) and width, plus a movable name label. Shows the approximate area in km². |
| **Labels** | Four bundled fonts, size, colour, rotation, letter spacing, arc/curve, capitals, italic, halo and opacity. |
| **Fog of war** | Paint fog to hide or reveal areas with soft, partially transparent edges. "Cover entire map" and "Clear all fog" are available. *See through fog* shows the hidden content to the editor; *Player view* shows the map exactly as players will see it. Fog never alters what lies beneath it. |
| **Layers** | Show/hide, set opacity and lock each system layer (elevation, biomes, territories, rivers & roads, objects, labels, peaks, fog). Add, rename, reorder, lock and delete object layers. |
| **Styles** | Parchment, Fantasy atlas, Clean political and Shaded relief. |
| **Projects** | Any number of maps, with thumbnails: open, rename, duplicate and delete. Autosave includes the camera position per map. |
| **Export** | **Map image**: a flattened PNG of the current view or the whole planet, up to 12,288 px wide, as the complete map or the revealed-areas-only player map. **Heightmap**: a 16- or 8-bit greyscale PNG with the metre range in its file name and metadata. **Editable project**: a `.fantasymap` archive with tiles, document and the custom assets it uses; import it again from *Maps*. |

Press **?** in the app for the full shortcut list. Tool keys: V select, H pan,
R raise, L lower, M mountains, S smooth, F flatten, B biome, E eraser, W river,
D road, O objects, T label, G territory, X fog, P peaks, U measure.

## Architecture

```
src/
  core/         planet constants, projection & geodesy (Geo), noise & geometry helpers
  terrain/      sparse TileGrid, TerrainModel (height/biome/fog rasters),
                brush engine, peak detection, world generator (+ Web Worker)
  model/        document types, undo/redo history, versioned serialisation
  store/        Zustand stores: document (undoable content) and editor/UI state
  persistence/  IndexedDB schema, project & tile storage
  assets/       asset library (IndexedDB-backed) and the built-in SVG starter pack
  render/       PixiJS renderer: camera, GPU terrain/fog tile layers & GLSL,
                vector layers (paths, territories, labels, objects, peaks, overlay)
  tools/        pointer/keyboard tool controller and hit testing
  editor/       runtime glue (Editor), document commands, generation, export/import
  ui/           React components: top bar, toolbar, inspector, layers, library, dialogs
```

**Separate logical layers.** Elevation, biome weights and fog are raster layers
in `TerrainModel`. Paths, territories, labels, peak annotations, object
instances and object layers are plain JSON in the document store. Asset
definitions live in the asset library, independent of any map.

**Memory-efficient terrain.** Rasters are sparse 256×256-cell tiles. Untouched
ocean is never allocated, so a new planet costs almost nothing. Elevation is
`Float32` at full resolution: 4096×2048 (about 11 km cells) by default, or
8192×4096 ("High detail", chosen at creation). Biome weights (8 channels) and
fog are soft by nature and stored at half resolution.

**Rendering.** Each tile is a quad with a custom GLSL shader. The shader reads
heights with manual bilinear/B-spline filtering from an `r32float` texture that
has a 4-cell apron, so shading is seamless across tiles. It computes hill
shading, coast ink, ripples, contours, biome patterns, paper texture and
zoom-adaptive fractal detail per pixel. A brush stroke re-uploads only the tiles
it touched; nothing is redrawn on the CPU. All shader noise wraps exactly around
the planet. The world is drawn once per longitude copy *per layer*, so content
crossing the antimeridian keeps its z-order.

**Undo/redo** covers terrain (per-tile before/after snapshots), document edits
(structural snapshots that merge rapid slider changes) and generation. History
lives in memory and is bounded by size.

### Storage format

IndexedDB database `fantasy-cartographer`:

- `projects`: project metadata, planet settings, document JSON, raster default values, thumbnail.
- `tiles`: `[projectId, layer, tileIndex] → ArrayBuffer`; only changed tiles are rewritten.
- `assets`: imported images as blobs, and overrides of built-ins (rename, category, replacement art, hidden).
- `settings`: custom categories, last opened map, saved camera per map.

Projects carry a `formatVersion`. `src/model/serialization.ts` holds a migration
table, and newer files are refused with a clear message. A `.fantasymap` export
is a zip of `project.json` plus tile files (32-bit tiles are XOR-delta and
byte-plane shuffled for better compression) and the custom images used.

### Replacing the built-in art

The starter pack in `src/assets/starter/` consists of SVG illustrations built
from a small drawing kit (`kit.ts`). There are two ways to replace it:

- **In the app:** asset menu (⋯) → *Replace image…* accepts PNG, WebP or SVG. *Restore original* undoes it.
- **In code:** each category file exports a list of `{ id, name, category, tags, svg, aspect }`. Change an entry, or drop the pack entirely; the editor only depends on that shape (`STARTER_ASSETS`, `STARTER_CATEGORIES` in `index.ts`). Keep the `builtin:` ids stable so existing maps keep their references.

## Testing performed

- `npm run build` (TypeScript 7 type-check + Vite 8 production build) and `npm run lint` are clean.
- `npm test`: 18 unit tests covering projection and great-circle distances, antimeridian wrap, sparse tile storage, brushes (falloff, stroke cap, undo, biome and fog on half-res grids), peak detection and annotations, true-area land fraction of the generator, and serialisation and migration.
- Scripted end-to-end runs in headless Chrome, against both the dev server and the production build, covering:
  - an empty ocean world;
  - raising a continent and building ranges past 5–8 km;
  - painting biomes;
  - drawing rivers and roads, freehand and by clicks;
  - placing, stamping, selecting, multi-selecting, moving, rotating, scaling, duplicating and erasing objects, with undo/redo;
  - curved labels and territories, including across the antimeridian;
  - naming and removing peaks;
  - fog hide/reveal with player view;
  - importing PNG and SVG assets;
  - all four styles, contours, overlay and graticule;
  - generating continents and islands;
  - exporting a player PNG, a 16-bit heightmap and a project file, then re-importing it;
  - reloading the browser and continuing with nothing lost.
- Stress test of a High-detail planet (8192×4096): generation about 4 s, whole-planet 8192×4096 PNG export about 3 s, reload under 1 s.

## Known limitations

- **Grid resolution is fixed per map** (Standard or High detail at creation). Elevation cells are about 11 km (Standard). The shader adds sub-cell detail when zoomed in, but you cannot sculpt below the cell size. Biome and fog cells are twice that size.
- **Rivers and roads are vector overlays.** They don't carve valleys into the heightmap.
- **Territories are independent polygons.** Neighbouring realms don't share or snap to common borders.
- **Undo history is not persisted.** It resets when you reload or switch maps. Planet settings and view toggles (style, overlays, layer visibility) are deliberately not undoable.
- **Curved labels** are hit-tested and outlined with their straight bounding box.
- **Very large exports:** images are limited to about 160 megapixels per file; heightmaps always cover the whole planet.
- **Project files** are large for generated worlds (about 20–25 MB for a full Standard planet) because elevation is stored losslessly as 32-bit floats.
- **Near the poles,** brushes keep their true radius in km, so in the equirectangular view they stretch very wide; within about 1° of a pole they are clamped.
- **Browser storage** is subject to the browser's quota and site-data clearing. The app requests persistent storage, but export `.fantasymap` backups of important maps.
- **Desktop only:** designed for mouse/trackpad and keyboard; touch devices are not supported.
