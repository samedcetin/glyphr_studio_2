# Glyva

Glyva is a web-based font editor for game developers and type designers: pixel fonts, icon and PUA sets, texture atlases, anchors and metric keys, alongside the ordinary work of drawing a typeface. It is built on [Glyphr Studio 2](https://github.com/glyphr-studio/Glyphr-Studio-2) and published by [Blue Rain](https://bluerain.studio).

## Develop

```bash
npm install
npm run dev        # Vite dev server on http://localhost:5173, serving ./src
npm run test:run   # Vitest, once
npm run lint       # ESLint over ./src
npm run build      # production build into ./dist, base /app/
```

`npm run dev`, `build` and `stage` first rewrite `src/app/app_config.json` (dev mode flag and ship date) through `scripts.js`; the checked-in values are the shipped ones.

## Deploy

`.github/workflows/deploy-app.yml` lints, tests, builds and copies `dist/` to the web host over SCP on every `v*.*.*` tag, or by hand from the Actions tab. It needs the `SFTP_HOST`, `SFTP_USERNAME`, `SFTP_PASSWORD` and `SFTP_PATH` repository secrets. `dist/` is not committed.

## Versions

Glyva numbers its own releases from 3.0. The upstream release underneath the current build is recorded as `UPSTREAM_VERSION` in `src/app/brand.js`, and every product string (name, URLs, support address) comes from that file.

## License

GPL-3.0-or-later; see `LICENSE-gpl-3.0.txt`. Glyva is a modified version of Glyphr Studio by Matthew LaGrandeur. The years of work underneath this editor are his; contributions to the upstream project belong at [glyphrstudio.com](https://www.glyphrstudio.com).
