# Awase

Awase (合せ) is an integrated viewer for TEI. It aims to bring text, annotations, images and maps together in a single view.

This repository is currently a scaffold: the four screens (viewer, compare, XSL, DTS) exist as placeholders that show the URL parameters they will accept. The design is in [docs/notes/survey.md](docs/notes/survey.md).

Based on the site skeleton of [IIIF Kasane](https://github.com/nakamura196/iiif-kasane).

## Development

Requirements: Node.js 24 and npm.

```bash
npm ci
npm run dev   # http://localhost:3839
```

Other scripts: `npm run lint`, `npm test`, `npm run build` (static export to `out/`), `npm run test:basepath` (GitHub Pages sub-path build and check), `npm run test:export` (check links in `out/`).

## License

[MIT](LICENSE)
