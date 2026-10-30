# NobelExplorer

Static, dependency-free browser app. Node.js is used for building, data refresh
and tests. GitHub Pages serves `dist/`; generated output stays out of Git.

- Run `npm run check` after code or content changes, and `npm run test:e2e`
  for browser behaviour or before publishing (install Chromium with
  `npx playwright install chromium` when needed).
- Keep `site/` paths relative so repository-subpath and custom-domain hosting work.
- Keep official raw API records and editorial commentary separate.
- Preserve citations verbatim. Explain countries as birthplace, not nationality.
- Every editorial entry, reassessment and connection needs supporting sources.
- Connection edges must distinguish documented influence from thematic similarity.
- State partial editorial coverage honestly; never silently invent missing context.
- Keep runtime code free of third-party services, tracking, paid APIs and secrets.
- Verify user-visible changes at desktop and mobile widths and with keyboard access.
- Do not commit artifacts, scratch notes, browser profiles or credentials.
