# Relief library

`library.bin` holds small patches of real relief that Loremapper uses as the fine
detail of generated land. It is built by `scripts/build-relief-library.mjs` from the
Terrarium elevation tiles of the [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)
open dataset on AWS, made by Mapzen (Tilezen Joerd) from these public sources:

- SRTM — NASA / USGS, public domain
- GMTED2010 — USGS, public domain
- ETOPO1 — NOAA, public domain
- 3DEP (formerly NED) — USGS, public domain
- and the national elevation models listed in the
  [Joerd attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)

Only the detail of each patch is kept (the land less a smooth version of itself), without
its place: no part of the map shows a real place.
