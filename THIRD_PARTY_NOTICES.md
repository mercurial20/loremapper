# Third-party notices

Loremapper is released under the [MIT License](LICENSE). The
production build bundles the following third-party software and fonts. Their
licenses permit redistribution; full license texts ship inside each package in
`node_modules/<package>/LICENSE`.

## Libraries

| Package | License |
| --- | --- |
| [react](https://github.com/facebook/react), react-dom, scheduler | MIT |
| [pixi.js](https://github.com/pixijs/pixijs) | MIT |
| pixi.js dependencies: `@pixi/colord`, `@xmldom/xmldom`, `eventemitter3`, `gifuct-js`, `ismobilejs`, `js-binary-schema-parser`, `parse-svg-path` | MIT |
| pixi.js dependencies: `earcut` | ISC |
| pixi.js dependencies: `tiny-lru`, `@webgpu/types` (types only) | BSD-3-Clause |
| [zustand](https://github.com/pmndrs/zustand) | MIT |
| [idb](https://github.com/jakearchibald/idb) | ISC |
| [fflate](https://github.com/101arrowz/fflate) | MIT |
| [lucide-react](https://github.com/lucide-icons/lucide) | ISC |

Run `npm ls --omit=dev --all` for the exact dependency tree of a given build.

## Fonts (SIL Open Font License 1.1)

The fonts are bundled from [Fontsource](https://fontsource.org) packages and
remain under the [SIL Open Font License 1.1](https://openfontlicense.org). The
OFL allows bundling with software; the fonts may not be sold on their own.

| Font | Copyright (as stated in the package) | Package |
| --- | --- | --- |
| Cinzel | Copyright 2020 The Cinzel Project Authors | `@fontsource-variable/cinzel` |
| EB Garamond | Copyright 2017 The EB Garamond Project Authors | `@fontsource-variable/eb-garamond` |
| IM Fell English | Google Inc. (IM Fell types by Igino Marini) | `@fontsource/im-fell-english` |
| Inter | Copyright 2016 The Inter Project Authors | `@fontsource-variable/inter` |

## Artwork

All built-in map assets (`src/assets/starter/`) were drawn for this project as
SVG code and are covered by the project's MIT License.

## Earth elevation data

`public/data/earth-etopo1-4096x2048.v1.bin.gz`, used by **Start from Earth**, is derived from the
**ETOPO1 Global Relief Model (ice surface)** of the NOAA National Centers for Environmental
Information (formerly NGDC). It is a work of the US Government and in the public domain. NOAA asks
users to cite it:

> Amante, C. and B.W. Eakins, 2009. ETOPO1 1 Arc-Minute Global Relief Model: Procedures, Data
> Sources and Analysis. NOAA Technical Memorandum NESDIS NGDC-24. National Geophysical Data Center,
> NOAA. doi:10.7289/V5C8276M

It was downloaded at a 2-arc-minute stride through NOAA's ERDDAP service (`etopo180`). It was then
averaged onto the 4096 × 2048 equirectangular grid, rounded to whole metres on land and 10 m steps
below sea level, and delta-encoded with gzip.

## Inspiration

The editor was inspired by [Cartographer](https://github.com/PaulsGameDevHub/cartographer)
by PaulsGameDevHub and by commercial tools such as Inkarnate. That repository
does not carry an open-source license, so **no code, data or assets from it are
included here**; the features it suggested (falloff terrain brushes, generated
landscapes, river tracing, generated place names, 16-bit heightmap export) were
implemented independently.
