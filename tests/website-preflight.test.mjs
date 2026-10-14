import assert from 'node:assert/strict';
import test from 'node:test';
import { collectWebsiteFailures } from '../scripts/website-preflight.mjs';

test('website preflight has no static failures', () => {
  assert.deepEqual(collectWebsiteFailures(), []);
});
