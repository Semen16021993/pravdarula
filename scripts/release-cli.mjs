import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
  const updates = planChanges(paths, Boolean(previous), [...backendSources, ...(previous?.backendSources || [])]);
  // Advisory source plan only. Live configuration drift is checked by the unified runner.
  const plan = { ...updates, backendSources, commit, previousCommit: previous?.commit ?? null, origin: process.env.APP_BASE_URL, bucket: process.env.YC_BUCKET };
  writeFileSync(output, JSON.stringify(plan, null, 2));
  console.log(JSON.stringify(plan, null, 2));
} else if (command === 'assets') {
  writeFileSync(output, JSON.stringify(assertProductionAssets(statePath), null, 2));
} else if (command === 'complete') {
  throw new Error('Manual manifest completion disabled. Only deploy-yandex.sh may complete a release after remote read-back verification.');
} else throw new Error('Unknown release command');