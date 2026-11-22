import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planChanges, backendDependencies } from './release-plan.mjs';

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