import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';

export const hash = (value) => createHash('sha256').update(value).digest('hex');
export function planChanges(paths, hasBaseline, backendSources = []) {
  const plan = { frontend: !hasBaseline, backend: !hasBaseline, gateway: !hasBaseline, migrations: false, unknown: [], reasons: paths };
  for (const p of paths) {
    if (backendSources.includes(p)) plan.backend = true;
    if (/^yandex-api\/migrations\//.test(p)) plan.migrations = true;
    else if (p === 'yandex-api/api-gateway.yaml') plan.gateway = true;
    else if (/^yandex-api\//.test(p)) plan.backend = true;
    else if (/^(src\/|public\/|vite)/.test(p)) {
      plan.frontend = true;
      if (/^src\/lib\/(catalog|.*\.shared)\./.test(p)) plan.backend = true;
    } else if (/^(package|bun\.lock|tsconfig)/.test(p)) plan.frontend = plan.backend = true;
    else if (/^(docs\/|\.lovable\/|.*\.md$|src\/.*\.test\.|scripts\/|\.gitignore|deploy-yandex\.sh|\.deploy-yandex\.env\.example)/.test(p)) { /* tooling/docs */ }
    else { plan.unknown.push(p); plan.frontend = plan.backend = plan.gateway = true; }
  }
  return plan;
}

/** Recursively track repository imports, including shared modules outside yandex-api. */
export function backendDependencies(entry = 'yandex-api/index.ts') {
  const found = new Set();
  function walk(file) {
    if (found.has(file) || !existsSync(file)) return;
    found.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)["']([^"']+)["']/g)) {
      const spec = match[1];
      if (!spec.startsWith('.') && !spec.startsWith('@/')) continue;
      const base = normalize(spec.startsWith('@/') ? 'src/' + spec.slice(2) : join(dirname(file), spec));
      const resolved = [base, ...['.ts', '.tsx', '.mjs', '.js', '/index.ts'].map((ext) => base + ext)].find((p) => existsSync(p) && statSync(p).isFile());
      if (!resolved) throw new Error(`Unresolved backend import ${spec} in ${file}`);
      walk(resolved);
    }
  }
  walk(entry);
  return [...found].sort();
}

export function fileManifest(root) {
  const files = {};
  function walk(dir, prefix = '') {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name), relative = prefix + name;
      if (statSync(path).isDirectory()) walk(path, relative + '/');
      else files[relative] = hash(readFileSync(path));
    }
  }
  walk(root);
  return files;
}

export function assertProductionAssets(root) {
  const forbidden = ['preview-demo-user', 'demo@example.test', 'pravo-rulya-preview-cabinet-v1', 'demo-complex', 'ivanov@example.ru'];
  const files = fileManifest(root);
  for (const path of Object.keys(files)) {
    if (!/\.(js|html|json|map)$/.test(path)) continue;
    const content = readFileSync(join(root, path), 'utf8');
    for (const marker of forbidden) if (content.includes(marker)) throw new Error(`Production contains demo marker ${marker} in ${path}`);
  }
  return files;
}