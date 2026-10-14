# By the Whey website

Public website for [bythe-whey.com](https://bythe-whey.com).

The deployable GitHub Pages site is in `docs/`. The catalog generator reads
published catalog data through the public Supabase API and regenerates the
static cheese pages and sitemap.

## Commands

- `npm run generate` regenerates the public cheese pages.
- `npm run check` validates the static site structure.
- `npm test` runs the website checks with Node's test runner.

Only public client configuration belongs in this repository. Never commit a
Supabase service-role key, signing credential, or other private deployment
secret.
