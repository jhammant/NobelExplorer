# Nobel Explorer

**A century of ideas, connected.** An independent, interactive atlas of every
Nobel Prize: what won, why it mattered, how ideas connect, and what later
evidence or historical debate changed.

**[Explore the atlas](https://jhammant.github.io/NobelExplorer/)**

## Explore

- Every awarded prize from 1901 through the latest bundled year, including the
  Sveriges Riksbank Prize in Economic Sciences in Memory of Alfred Nobel.
- Search people, official award citations, topics and historical context.
- Filter by category, year, topic, birthplace and institution at the award.
- Group by decade, year, topic, category, country or institution.
- Switch between the timeline, catalogue and a map of sourced connections.
- Follow six discovery trails, from reading DNA to debates about peace.
- Open a prize for its official motivation, recipients, context and sources.
- Share any view or selected prize with its URL. No account or API key needed.

The current snapshot contains **639 awarded prizes and 1,028 unique laureates**,
covering **1901–2026**. The editorial collection adds **43 explanations,
35 connections and 8 reassessments**. Every award has its official citation;
additional plain-English explanations are a growing collection, with uncovered
entries explicitly labelled. There is no claim that all controversies or all
scientific connections have been identified.

## Run locally

Use Node.js 22.13 or newer (CI uses Node.js 24).

```bash
npm ci
npm run build
npm run dev
```

Open [localhost:4173](http://127.0.0.1:4173). After edits to the source or data,
run `npm run build` and refresh. The server serves the exact static output that
GitHub Pages publishes.

```bash
npm run check
```

This runs ESLint, the Node test suite and the production build. There are no
runtime dependencies, server functions, accounts, tracking scripts or external
fonts. The browser downloads one bundled catalogue rather than calling the
Nobel API for every visit.

Run the browser journeys on desktop and mobile with Chromium:

```bash
npx playwright install chromium
npm run test:e2e
```

CI runs the browser journeys before deploying. They cover filtering, all
grouping modes, prize and trail navigation, keyboard focus, shareable URLs,
mobile overflow and recovery from a failed data request.

## How it works

```text
data/nobel-prizes.json + data/laureates.json     Official snapshots
data/editorial.json                            Sourced editorial context
                   ↓
scripts/catalog.mjs                            Join and validate
scripts/build.mjs                              Package static files
                   ↓
dist/                                         GitHub Pages
```

`site/model.js` holds the search, filtering, grouping and URL-state logic.
`site/views.js` renders the timeline, catalogue, connections and detail panels.
`site/app.js` connects the controls. All dynamic text is escaped before HTML
rendering. Native dialogs provide keyboard focus containment; the timeline
supports arrow keys, Home and End, and the catalogue is an accessible alternative.

### Reading the data responsibly

- “Country” is **birthplace**, or an organisation's founding place, using the
  present-day country recorded by the official API. It is not nationality.
- Institutions are affiliations **at the award**, which need not be where the
  discovery happened. Country, topic and institution groups can overlap.
- The horizontal axis is **award year**, not discovery year. Announced prizes
  appear even if their presentation ceremony has not happened yet.
- Topics outside the editorial collection use transparent citation-keyword
  rules. They are suggestions, not evidence of scientific influence.
- Every connection has a type, explanation and source. A `related idea` edge is
  a thematic comparison; it does not assert direct intellectual influence.
- Reassessments distinguish overturned claims, harms and limitations, ethical
  controversy, disputed credit and debated awards. A note about one recipient
  does not invalidate an entire shared prize.
- The five original categories are distinct from the Economics prize, first
  awarded in 1969.

## Refresh the official snapshot

```bash
npm run data:refresh
npm run check
```

The refresh script follows pagination, checks record counts and refuses a
shrinking dataset. It fetches both datasets before replacing the snapshot.
Review the diff before publishing. The editorial collection is maintained
separately: refreshing official records never generates or changes commentary.
Review the snapshot-count assertions in `tests/model.test.mjs` when a new year
is added. Scheduled refreshes are not enabled.

## Publish on GitHub Pages

Enable **Settings → Pages → Source → GitHub Actions**. Push to `main` to run
the checks and deploy `dist/`. Pull requests run checks without deploying.
Dependencies and GitHub Actions are pinned. The deployment job has only the
permissions it needs to publish Pages.

The site works at a repository subpath or a custom domain. Configure a custom
domain in the repository's Pages settings, then create its DNS CNAME pointing
to `jhammant.github.io`. An Actions deployment uses the Pages domain setting;
a `CNAME` file in the artifact does not configure it. See
[GitHub's custom domain guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

## Contribute

Corrections, clear explanations and well-sourced connections are welcome.
Read [CONTRIBUTING.md](CONTRIBUTING.md) for the data format and evidence standard.
Small, reviewable additions are particularly useful: one award, one explanation,
one well-supported connection.

## Sources and licences

Official data: [Nobel Prize API](https://www.nobelprize.org/organization/developer-zone-2/),
under CC0 with its [terms of use](https://www.nobelprize.org/about/terms-of-use-for-api-nobelprize-org-and-data-nobelprize-org/).
Code: [MIT](LICENSE). Original editorial content: [CC BY 4.0](LICENSE-CONTENT).
Linked sources retain their own copyright. See [data/README.md](data/README.md).

Nobel Explorer is an independent project by [Hammant Labs](https://hammantlabs.com).
It is not affiliated with, sponsored by or endorsed by the Nobel Foundation or
Nobel Prize Outreach. No official Nobel logos or medals are used.
