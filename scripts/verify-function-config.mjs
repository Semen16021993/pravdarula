import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const known = ['YDB_CONNECTION_STRING', 'POSTBOX_FROM_EMAIL', 'YANDEX_PAY_ENV', 'APP_BASE_URL', 'APP_ORIGINS', 'APP_PREVIEW_ORIGIN', 'YANDEX_PAY_MERCHANT_ID'];
const environment = version.environment || {};
const extra = Object.keys(environment).filter((k) => !known.includes(k));
if (extra.length) throw new Error(`Existing API settings would be omitted: ${extra.join(', ')}. Extend release configuration explicitly before publishing.`);
for (const key of Object.keys(environment)) {
  if (environment[key] && !process.env[key] && !['POSTBOX_FROM_EMAIL', 'YANDEX_PAY_ENV'].includes(key)) throw new Error(`Existing setting ${key} missing from local deployment config. Refuse to clear it.`);
}
const secrets = version.secrets || [];
if (!Array.isArray(secrets)) throw new Error('Unknown secret binding format: review current function before release');
for (const secret of secrets) {
  const name = secret.environmentVariable || secret.environment_variable;
  if (!['AUTH_SECRET', 'YANDEX_PAY_API_KEY', 'YANDEX_PAY_SANDBOX_API_KEY'].includes(name)) throw new Error('Unrecognized existing secret binding; extend deployment script before publishing.');
  if (name !== 'AUTH_SECRET' && !process.env.YC_PAY_SECRET_ID) throw new Error('Existing payment secret must not be removed: YC_PAY_SECRET_ID missing');
}
console.log('Existing API environment and secret bindings reviewed for omitted settings.');