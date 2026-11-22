import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../yandex-api/node_modules/esbuild/lib/main.js';

test('Yandex compile flag removes actual demo modules from route bundle', async () => {
  const result = await build({ entryPoints: ['src/routes/index.tsx'], bundle: true, write: false, platform: 'browser', format: 'esm', minify: true, packages: 'external', alias: { '@': './src' }, loader: { '.jpg': 'dataurl' }, define: { 'import.meta.env.VITE_PREVIEW_DEMO': JSON.stringify('false') }, metafile: true });
  const text = result.outputFiles[0]?.text;
  assert.ok(text);
  for (const marker of ['preview-demo-user', 'demo@example.test', 'pravo-rulya-preview-cabinet-v1', 'demo-complex']) assert.equal(text.includes(marker), false, marker);
  assert.equal(Object.keys(result.metafile.inputs).some((p) => p.endsWith('preview-cabinet.ts')), false);
  assert.equal(text.includes('/api/auth/me'), true);
  assert.equal(text.includes('/api/auth/logout'), true);
  assert.equal(text.includes('Иванов Иван Иванович'), false);
});