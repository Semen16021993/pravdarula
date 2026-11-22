import { readFileSync } from 'node:fs';
import { verifyFunction } from './release-safety.mjs';
verifyFunction(JSON.parse(readFileSync(process.argv[2], 'utf8')), process.env);
console.log('Full Function baseline validated; settings and pinned secrets will be cloned and read back.');
