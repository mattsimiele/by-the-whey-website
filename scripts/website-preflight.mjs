import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

export function collectWebsiteFailures() {
  const failures = [];
  const requiredPages = [
    'docs/index.html',
    'docs/404.html',
    'docs/catalog/index.html',
    'docs/privacy/index.html',
    'docs/terms/index.html',
    'docs/guidelines/index.html',
    'docs/support/index.html',
    'docs/delete-account/index.html',
    'docs/manage/index.html',
  ];

  for (const page of requiredPages) {
    if (!fs.existsSync(path.join(root, page))) failures.push(`Missing public page: ${page}`);
    else if (!read(page).includes('assets/site.js')) failures.push(`${page} is missing shared navigation`);
  }

  const siteShell = read('docs/assets/site.js');
  for (const marker of ['Why By the Whey', 'Catalog Studio', 'Delete Account', 'renderHeader()', 'renderFooter()']) {
    if (!siteShell.includes(marker)) failures.push(`Shared navigation is missing ${marker}`);
  }

  const catalogStudio = `${read('docs/manage/index.html')}\n${read('docs/manage/manage.js')}`;
  for (const marker of ['data-photo-input', 'data-upload-photo', 'uploadCatalogPhoto', 'removeCatalogPhoto']) {
    if (!catalogStudio.includes(marker)) failures.push(`Catalog Studio is missing ${marker}`);
  }
  for (const marker of ['in_curd_nerd_case', 'In the Case at The Curd Nerd?']) {
    if (!catalogStudio.includes(marker)) failures.push(`Catalog availability is missing ${marker}`);
  }

  const generatedCatalog = JSON.parse(read('docs/cheese/generated.json'));
  if (!generatedCatalog.count || generatedCatalog.count !== generatedCatalog.slugs?.length) {
    failures.push('Generated public cheese pages are missing or inconsistent');
  }
  for (const slug of generatedCatalog.slugs ?? []) {
    const page = path.join('docs/cheese', slug, 'index.html');
    if (!fs.existsSync(path.join(root, page))) failures.push(`Missing generated cheese page: ${slug}`);
    else if (!read(page).includes('assets/site.js')) failures.push(`Generated page is missing shared navigation: ${slug}`);
  }

  return failures;
}

export function runWebsitePreflight() {
  const failures = collectWebsiteFailures();
  if (failures.length) {
    console.error('Website preflight failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    return 1;
  }
  console.log('Website preflight passed.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = runWebsitePreflight();
}
