# Contributing to Awase

Thank you for your interest in Awase! Bug reports, feature ideas, sample TEI files and pull requests are all welcome.

Issues, pull requests and commit messages are written in English so that everyone can follow them. If English is difficult for you, you may write in Japanese (日本語でも構いません).

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting bugs

Open an issue with the **Bug report** template. Please include:

- The URL you opened, including the `u=` (or other) parameters
- What you expected and what happened instead
- Your browser and OS, and any errors shown in the browser console

If a TEI file does not display correctly, a link to the file helps the most.

## Suggesting features

Open an issue with the **Feature request** template. Describe the use case first (what material, what you want to do with it), then the feature you have in mind.

## Reporting security issues

Please do not open a public issue. See [SECURITY.md](SECURITY.md).

## Development

Requirements: Node.js 24 (the version used in CI) and npm.

```bash
git clone https://github.com/nakamura196/awase.git
cd awase
npm ci
npm run dev   # http://localhost:3839
```

Before opening a pull request, run:

```bash
npm run lint
npm test
npm run build
```

End-to-end tests use Playwright (`npm run test:e2e`). If you add a page or change a page's entry screen (what it shows without any URL parameters), run `e2e/entryPages.spec.ts` against a dev server:

```bash
E2E_BASE_URL=http://localhost:3839 npx playwright test e2e/entryPages.spec.ts
```

## Pull requests

1. Fork the repository and create a branch from `main` (for example `fix/title-wrap` or `feat/header-panel`).
2. Keep each pull request focused on one change.
3. Write the title and description in English. Explain what changes for users, then how it is implemented.
4. Add or update tests where it makes sense.
5. For user-visible changes, add the text in both English and Japanese (`src/messages/`). If you cannot write Japanese, say so in the pull request and the maintainer will add it.
6. If you add a new feature, say in the description whether it should be announced in the news (one file in `content/news/`), and why.

## Commit messages

Use a short English summary in the imperative mood on the first line (for example `Add TEI header panel`), followed by a blank line and details if needed. Reference issues as `#123`.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
