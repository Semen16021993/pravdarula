import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { planChanges, assertProductionAssets, hash, backendDependencies } from './release-plan.mjs';

const [command, statePath, output] = process.argv.slice(2);
if (command === 'plan') {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const previous = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null;
  if (previous && (!/^[a-f0-9]{40}$/.test(previous.commit) || previous.origin !== process.env.APP_BASE_URL || previous.bucket !== process.env.YC_BUCKET)) {
    throw new Error('Release state belongs to a different target or has an invalid commit. Stop and verify baseline.');
  }
  const paths = previous
    ? execFileSync('git', ['diff', '--name-only', previous.commit, commit], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    : execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n');
  const backendSources = backendDependencies();
  const configHash = hash(JSON.stringify(Object.fromEntries(['APP_BASE_URL','APP_ORIGINS','APP_PREVIEW_ORIGIN','YDB_CONNECTION_STRING','YC_BUCKET','YC_FUNCTION_ID','YC_GATEWAY_ID','YC_RUNTIME_SA_ID','YC_AUTH_SECRET_ID','YC_PAY_SECRET_ID','POSTBOX_FROM_EMAIL','YANDEX_PAY_ENV','YANDEX_PAY_MERCHANT_ID'].map((name) => [name, process.env[name] || '']))));
  const updates = planChanges(paths, Boolean(previous), [...backendSources, ...(previous?.backendSources || [])]);
  if (previous && previous.configHash !== configHash) { updates.backend = updates.gateway = true; updates.reasons.push('Deployment configuration changed: explicit review required'); }
  const plan = { ...updates, configHash, backendSources, commit, previousCommit: previous?.commit ?? null, origin: process.env.APP_BASE_URL, bucket: process.env.YC_BUCKET };
  writeFileSync(output, JSON.stringify(plan, null, 2));
  console.log(JSON.stringify(plan, null, 2));
} else if (command === 'assets') {
  writeFileSync(output, JSON.stringify(assertProductionAssets(statePath), null, 2));
} else if (command === 'complete') {
  const plan = JSON.parse(readFileSync(statePath, 'utf8'));
  const assets = existsSync(process.env.RELEASE_ASSETS ?? '') ? JSON.parse(readFileSync(process.env.RELEASE_ASSETS, 'utf8')) : null;
  const previousPath = join(dirname(output), 'current.json');
  const previous = existsSync(previousPath) ? JSON.parse(readFileSync(previousPath, 'utf8')) : {};
  writeFileSync(output, JSON.stringify({ ...plan, completedAt: new Date().toISOString(), assets: assets ?? previous.assets ?? null, gatewayHash: hash(readFileSync('yandex-api/api-gateway.yaml')), functionVersion: process.env.RELEASE_FUNCTION_VERSION || previous.functionVersion || process.env.RELEASE_PREVIOUS_VERSION || null, functionTag: '$latest', migrations: process.env.RELEASE_MIGRATIONS || null }, null, 2));
} else throw new Error('Unknown release command');