# By the Whey website

Public website for [bythe-whey.com](https://bythe-whey.com).

The deployable GitHub Pages site is in `docs/`. The catalog and shared `/cheese/?slug=<slug>` page read published cheeses live
from Supabase. New approvals require no rebuild or deployment. The catalog
refreshes each minute while visible and when visitors return to the tab. Missing
`/cheese/<slug>/` URLs redirect to the shared live page.

The optional catalog generator refreshes static search/social previews and the
sitemap; it is not needed to make approved cheeses viewable.

## Commands

- `npm run generate` regenerates the public cheese pages.
- `npm run check` validates the static site structure.
- `npm test` runs the website checks with Node's test runner.

Only public client configuration belongs in this repository. Never commit a
Supabase service-role key, signing credential, or other private deployment
secret.
