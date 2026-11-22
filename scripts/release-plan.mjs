import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { buildSync } from '../yandex-api/node_modules/esbuild/lib/main.js';
import ts from 'typescript';

export const hash = (value) => createHash('sha256').update(value).digest('hex');
export function assertSourceBoundary(paths, read = path => existsSync(path) ? readFileSync(path, 'utf8') : '') {
  for (const path of paths.filter(p => /^src\/.*\.[cm]?[jt]sx?$/.test(p))) {
    const tree = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true);
    const visit = node => {
      if (ts.isIdentifier(node) && node.text === 'createServerFn') throw Error(`TanStack server function cannot be deployed as a static Yandex asset: ${path}; implement its Yandex API/Gateway mapping first`);
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
}
export function planChanges(paths, hasBaseline, backendSources = []) {
  const plan = { frontend: !hasBaseline, backend: !hasBaseline, gateway: !hasBaseline, migrations: false, unknown: [], reasons: paths };
  for (const p of paths) {
    if (backendSources.includes(p)) plan.backend = true;
    if (/^yandex-api\/migrations\//.test(p)) plan.migrations = true;
    else if (p === 'yandex-api/api-gateway.yaml') plan.gateway = true;
    else if (/^yandex-api\//.test(p)) { plan.backend = true; plan.gateway = true; }
    else if (p === 'src/lib/payments.functions.ts') { plan.frontend = true; }
    else if (/^src\/(routes\/api\/|.*\.functions\.|server\.|start\.)/.test(p)) { plan.unknown.push(p); plan.frontend = plan.backend = plan.gateway = true; }
    else if (/^(src\/|public\/|vite)/.test(p)) {
      plan.frontend = true;
      if (/^src\/lib\/(catalog|.*\.shared)\./.test(p)) plan.backend = true;
    } else if (/^(package|bun\.lock|tsconfig)/.test(p)) plan.frontend = plan.backend = true;
    else if (/^(docs\/|\.lovable\/|.*\.md$|\.gitignore$|deploy-yandex\.sh$|\.deploy-yandex\.env\.example$)/.test(p)) { /* reviewed docs/bootstrap */ }
    else if (/^scripts\/(release-(plan|cli|safety|runner|recovery)(\.test)?\.mjs|verify-(function-config|production-demo\.test)\.mjs)$/.test(p)) { /* reviewed release tooling */ }
    else { plan.unknown.push(p); plan.frontend = plan.backend = plan.gateway = true; }
  }
  return plan;
}

/** Recursively track repository imports, including shared modules outside yandex-api. */
export function backendDependencies(entry = 'yandex-api/index.ts') {
  const result = buildSync({ entryPoints: [entry], bundle: true, write: false, metafile: true, platform: 'node', target: 'node22', packages: 'external', alias: { '@': './src' }, logLevel: 'silent' });
  const sources = Object.keys(result.metafile.inputs).map(p => normalize(p)).sort();
  for (const file of sources) {
    if (file.startsWith('..') || file.startsWith('/')) throw Error('Backend import outside repository requires review');
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = node => {
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')) && (!node.arguments[0] || !ts.isStringLiteral(node.arguments[0]))) throw Error(`Computed backend dependency requires review: ${file}`);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return sources;
}

/** The API's current literal dispatch must be covered by Gateway, including method aliases. */
export function backendEndpoints(source = readFileSync('yandex-api/index.ts', 'utf8')) {
  const endpoints = new Set();
  const tree = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
  const visit = node => {
    if (ts.isIfStatement(node)) {
      const methods = [], paths = []; let referencesPath = false;
      const condition = part => {
        if (ts.isIdentifier(part) && part.text === 'path') referencesPath = true;
        if (ts.isBinaryExpression(part) && part.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken && ts.isIdentifier(part.left) && ts.isStringLiteral(part.right)) {
          if (part.left.text === 'method') methods.push(part.right.text);
          if (part.left.text === 'path') paths.push(part.right.text);
        }
        ts.forEachChild(part, condition);
      };
      condition(node.expression);
      if (referencesPath) {
        if (!methods.length || !paths.length) throw Error('Nonliteral API dispatcher requires reviewed endpoint inventory before release');
        for (const method of methods) for (const path of paths) endpoints.add(`${method} ${path}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  if (!endpoints.size) throw Error('No verifiable API endpoints found');
  return [...endpoints].sort();
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