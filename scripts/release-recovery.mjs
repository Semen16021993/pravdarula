import { readFileSync, writeFileSync, existsSync, unlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { hash, fileManifest } from './release-plan.mjs';
import { assertSameFunction, assertGateway, gatewaySpec, gatewayTags, pinGateway, writeGateway, equal, comparableGateway } from './release-safety.mjs';

export const contentType = path => {
  const ext = path.split('.').pop().toLowerCase();
  const types = { html: 'text/html; charset=utf-8', js: 'application/javascript', css: 'text/css', json: 'application/json', map: 'application/json', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', ico: 'image/x-icon', svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', txt: 'text/plain; charset=utf-8', xml: 'application/xml', pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm' };
  if (!types[ext]) throw Error(`Unknown static MIME type: ${path}; review upload metadata before writing`);
  return types[ext];
};
export function savePending(state, pending) { writeFileSync(join(state, 'pending.json'), JSON.stringify(pending, null, 2)); }
export function verifyBackup(pending) {
  for (const [path, checksum] of Object.entries(pending.snapshotHashes || {})) if (!existsSync(path) || hash(readFileSync(path)) !== checksum) throw Error(`Recovery snapshot missing/changed: ${path}; do not delete pending.json`);
  if (!equal(fileManifest(join(pending.directory, 'backup')), pending.backupHashes)) throw Error('Static backup checksum mismatch; recovery blocked');
}
export async function recoverRelease(state, adapter) {
  const file = join(state, 'pending.json');
  const pending = JSON.parse(readFileSync(file, 'utf8'));
  verifyBackup(pending);
  if (pending.migrationStarted) console.warn('YDB migration activity was recorded. Restoring the previous code does not reverse YDB DDL; only additive migrations are accepted, so added columns/tables are intentionally retained.');
  const before = JSON.parse(readFileSync(join(pending.directory, 'version-before.json'), 'utf8'));
  const version = adapter.cloud(['serverless', 'function', 'version', 'get', pending.previousVersion, '--format', 'json']);
  assertSameFunction(before, version);
  let live = gatewaySpec(adapter.gateway ? adapter.gateway(pending.gatewayId) : adapter.cloud(['serverless', 'api-gateway', 'get', pending.gatewayId, '--format', 'json']));
  assertGateway(live, pending.env);
  const old = gatewaySpec(JSON.parse(readFileSync(join(pending.directory, 'gateway-before.json'), 'utf8')));
  const allowedTags = [...gatewayTags(old), pending.previousTag, ...(pending.candidateVersion ? [`release-${pending.candidateVersion}`] : [])];
  if (gatewayTags(live).some(tag => !allowedTags.includes(tag))) throw Error('Gateway uses an unrelated release tag; operator recovery required');
  // Do not overwrite an unrelated operator's deployment.
  if (!equal(comparableGateway(live), comparableGateway(old)) && !equal(comparableGateway(live), comparableGateway(JSON.parse(readFileSync(join(pending.directory, 'gateway-desired.json'), 'utf8'))))) throw Error('Gateway drift from both saved release specs; inspect before manual recovery');
  savePending(state, { ...pending, phase: 'recovering' });
  adapter.cloud(['serverless', 'function', 'version', 'set-tag', '--id', pending.previousVersion, '--tag', pending.previousTag, '--format', 'json']);
  const tagged = adapter.cloud(['serverless', 'function', 'version', 'get-by-tag', '--function-id', pending.functionId, '--tag', pending.previousTag, '--format', 'json']);
  if (tagged.id !== pending.previousVersion) throw Error('Recovery tag does not resolve to saved version');
  // Upload old hashed resources first, then the old entry point. Never delete unrelated/new resources.
  const files = Object.keys(pending.backupHashes).filter(p => p !== 'index.html');
  if (!pending.backupHashes['index.html']) throw Error('Recovery entry point absent');
  for (const path of [...files, 'index.html']) adapter.upload(join(pending.directory, 'backup', path), path, pending.staticMetadata[path]);
  const pinned = pinGateway(old, pending.previousTag);
  const recoverySpec = join(pending.directory, 'gateway-recovery.yaml');
  writeGateway(recoverySpec, pinned);
  adapter.cloud(['serverless', 'api-gateway', 'update', pending.gatewayId, '--spec', recoverySpec, '--format', 'json']);
  live = gatewaySpec(adapter.gateway ? adapter.gateway(pending.gatewayId) : adapter.cloud(['serverless', 'api-gateway', 'get', pending.gatewayId, '--format', 'json']));
  if (!equal(live, pinned)) throw Error('Gateway recovery read-back mismatch');
  await adapter.verifyStatic(pending.backupHashes);
  await adapter.verifyPublic();
  const savedManifest = join(pending.directory, 'current-before.json');
  if (existsSync(savedManifest)) {
    const previous = JSON.parse(readFileSync(savedManifest, 'utf8'));
    if (previous) {
      writeFileSync(join(state, 'restored-current.json'), JSON.stringify(previous, null, 2));
      renameSync(join(state, 'restored-current.json'), join(state, 'current.json'));
    } else if (existsSync(join(state, 'current.json'))) unlinkSync(join(state, 'current.json'));
  }
  writeFileSync(join(pending.directory, 'recovered.json'), JSON.stringify({ ...pending, recoveredAt: new Date().toISOString() }, null, 2));
  unlinkSync(file); // Only after verified recovery and restoration of the previous manifest.
}
