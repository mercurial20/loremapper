# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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

[1.0.0-beta.1]: https://github.com/mercurial20/loremapper/releases/tag/v1.0.0-beta.1
