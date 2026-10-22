# Awase

Awase (合せ, <https://awase.ldas.jp>) is an integrated viewer for TEI/XML documents, bringing text, parallel translations, critical apparatus, named entities, speech analysis, maps, timelines, IIIF images, and XSL presentation styles together in a single static web application.

Based on the site architecture of [IIIF Kasane](https://github.com/nakamura196/iiif-kasane). Design and implementation notes are in [docs/notes/survey.md](docs/notes/survey.md).

## Screens

- **Viewer (`/[locale]/viewer/`)**: Integrated workspace combining TEI text rendering (vertical/horizontal), IIIF facsimile images, side-by-side parallel texts (`@corresp` / scroll sync), critical apparatus (`app/lem/rdg`), named entities, dialogue & appellation transitions (`sp` / `said` / `persName`), correspondence/place maps, timelines, and XSL style switcher.
- **Display Styles (`/[locale]/xsl/`)**: Full-screen presentation styles powered by SaxonJS (SEF stylesheets) and interactive views (reading support, line-by-line, dialogue/LINE style, video & audio caption sync).
- **Compare (`/[locale]/compare/`)**: Side-by-side image and character-level transcription diff for two IIIF manifests.
- **DTS (`/[locale]/dts/`)**: Browse Distributed Text Services (DTS) collections and open documents or citable units in the viewer.

## Development

Requirements: Node.js 24 and npm.

```bash
npm ci
npm run dev   # http://localhost:3839
```

Other scripts: `npm run lint`, `npm test`, `npm run build` (static export to `out/`), `npm run test:basepath` (GitHub Pages sub-path build and check), `npm run test:export` (check links in `out/`).

## License

[MIT](LICENSE)
