import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planChanges, parseGitPaths, backendDependencies, backendEndpoints, assertSourceBoundary } from './release-plan.mjs';
import { parse } from 'yaml';
import { readFileSync } from 'node:fs';
import { assertEndpoints } from './release-safety.mjs';

test('interface-only changes do not deploy Cloud Function or Gateway', () => {
  const p = planChanges(['src/components/constructor/Constructor.tsx', 'src/styles.css'], true);
  assert.equal(p.frontend, true); assert.equal(p.backend, false); assert.equal(p.gateway, false);
});
test('shared prices update both interface and Yandex API', () => {
  const p = planChanges(['src/lib/catalog.ts'], true);
  assert.equal(p.frontend, true); assert.equal(p.backend, true);
});
test('API and route updates select correct stages', () => {
  const p = planChanges(['yandex-api/index.ts', 'yandex-api/api-gateway.yaml'], true);
  assert.equal(p.backend, true); assert.equal(p.gateway, true); assert.equal(p.frontend, false);
});
test('first release never silently assumes a baseline', () => {
  const p = planChanges([], false);
  assert.equal(p.frontend, true); assert.equal(p.backend, true); assert.equal(p.gateway, true);
});
test('unknown files fail into an explicit review instead of silently skipping', () => {
  assert.deepEqual(planChanges(['new-infrastructure.conf'], true).unknown, ['new-infrastructure.conf']);
});
test('literal Git paths classify Cyrillic plans without approving unknown infrastructure', () => {
  const paths = parseGitPaths('.lovable/plan/единый-деплой-на-yandex.md\0new-infrastructure.conf\0');
  assert.deepEqual(paths, ['.lovable/plan/единый-деплой-на-yandex.md', 'new-infrastructure.conf']);
  assert.deepEqual(planChanges(paths, true).unknown, ['new-infrastructure.conf']);
});
test('NUL path parsing preserves spaces, newlines and quotes in actual filenames', () => {
  assert.deepEqual(parseGitPaths('some file\nwith "quotes".conf\0'), ['some file\nwith "quotes".conf']);
});
test('migration-only change does not rebuild unrelated parts', () => {
  const p = planChanges(['yandex-api/migrations/001.json'], true);
  assert.equal(p.migrations, true); assert.equal(p.backend, false); assert.equal(p.frontend, false);
});
test('transitive backend dependencies outside API select backend updates', () => {
  assert.ok(backendDependencies().includes('src/lib/catalog.ts'));
  assert.equal(planChanges(['src/lib/new-rule.ts'], true, ['src/lib/new-rule.ts']).backend, true);
});
test('new Yandex endpoint always requests Gateway review', () => assert.equal(planChanges(['yandex-api/index.ts'], true).gateway, true));
test('new server route cannot silently become a static-only release', () => assert.deepEqual(planChanges(['src/routes/api/public/new.ts'], true).unknown, ['src/routes/api/public/new.ts']));
test('unknown release tooling is not implicitly trusted', () => assert.deepEqual(planChanges(['scripts/new-infrastructure.mjs'], true).unknown, ['scripts/new-infrastructure.mjs']));
test('every actual Yandex handler endpoint, including POST form alias, has a Gateway route', () => {
  const endpoints = backendEndpoints();
  assert.ok(endpoints.includes('POST /api/cabinet/form'));
  assertEndpoints(parse(readFileSync('yandex-api/api-gateway.yaml', 'utf8')), endpoints);
});
test('multiline literal API conditions are analyzed without missing methods', () => assert.deepEqual(backendEndpoints('if (\n method === "POST" &&\n path === "/api/new"\n) {}'), ['POST /api/new']));
test('computed API paths require review instead of silently omitting endpoint', () => assert.throws(() => backendEndpoints('if (method === "POST" && path.startsWith("/api/new")) {}'), /Nonliteral/));
test('a new server function under an ordinary frontend filename cannot silently deploy as a static asset', () => assert.throws(() => assertSourceBoundary(['src/lib/new-rule.ts'], () => 'import { createServerFn as backend } from "@tanstack/react-start";'), /cannot be deployed/));