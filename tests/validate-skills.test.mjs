import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRepo } from '../scripts/validate-skills.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

test('el catalogo de skills y evals es integro y valido', () => {
  const errors = validateRepo(repoRoot);
  assert.deepEqual(errors, [], `Errores encontrados:\n${errors.join('\n')}`);
});
