# Contributing

Thanks for helping with Loremapper! This is an early beta, so bug
reports with clear reproduction steps are the most valuable contribution right
now.

## Reporting bugs

Use the [bug report form](../../issues/new?template=bug_report.yml). Please include
the app version (press `?` in the app), your browser and OS, and anything red
from the browser console. A `.loremap` project export that shows the problem
helps a lot.

## Suggesting features

Open a [feature request](../../issues/new?template=feature_request.yml) and describe
the map-making task you're trying to accomplish.

## Development

Requires Node.js 22.12 or newer (CI uses Node 24).

```bash
npm install
npm run dev        # http://localhost:5173
```

Before opening a pull request, run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Code layout and architecture notes are in the [README](README.md#architecture).

### Ground rules

- **Saved data is precious.** Anything that changes what is stored in IndexedDB or
  in `.loremap` files must bump `FORMAT_VERSION` and add a migration in
  `src/model/serialization.ts`.
- Keep the editor local-first: no required server, account or network access.
- Don't add third-party code, artwork or fonts unless their license is
  compatible with MIT, and record them in `THIRD_PARTY_NOTICES.md`.
- Match the surrounding code style; `oxlint` and TypeScript strict mode must pass.

By contributing you agree that your contribution is licensed under the
project's [MIT License](LICENSE).
