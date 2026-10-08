import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARAMETERS, PAGES, ROWS, ROW_BY_ID } from '../src/layout.ts';
import { emptyRecipe, parseRecipe, serializeRecipe, updateValue, validateRecipe } from '../src/recipe.ts';

test('four pages preserve column-major order and cross-page parents', () => {
  assert.equal(PAGES.length, 4);
  assert.ok(PAGES.every(page => page.length === 4));
  assert.equal(new Set(ROWS.map(r => r.id)).size, ROWS.length);
  assert.equal(ROWS.length, 265);
  for (const row of ROWS) {
    if (row.parentId) assert.ok(['group', 'color'].includes(ROW_BY_ID.get(row.parentId)!.kind));
    assert.equal(row.internalId, null);
  }
  assert.equal(PAGES[1][2][0].parentId, 'p2.c2.r16');
  assert.equal(PAGES[2][0][0].parentId, 'p2.c4.r15');
  assert.equal(PAGES[0][3][0].parentId, 'p1.c3.r16');
});
test('unknown, zero and false survive JSON round trip without invented values', () => {
  let recipe = emptyRecipe();
  assert.ok(Object.values(recipe.entries).every(v => v.value === null));
  recipe = updateValue(recipe, 'p1.c1.r1', '0');
  recipe = updateValue(recipe, 'p1.c2.r12', 'false');
  recipe = updateValue(recipe, 'p1.c1.r7', '#001122');
  const round = parseRecipe(serializeRecipe(recipe));
  assert.deepEqual(round, recipe);
  assert.equal(round.entries['p1.c1.r1'].value, 0);
  assert.equal(round.entries['p1.c2.r12'].value, false);
  assert.equal(round.entries['p1.c1.r2'].value, null);
  assert.equal(Object.keys(round.entries).length, PARAMETERS.length);
});
test('duplicate labels never share a value slot', () => {
  const hues = PARAMETERS.filter(r => r.label === '色相');
  assert.ok(hues.length > 10);
  const recipe = updateValue(emptyRecipe(), hues[0].id, '0');
  for (const row of hues.slice(1)) assert.equal(recipe.entries[row.id].value, null);
});
test('schema rejects unsupported versions, missing IDs, false inference, and invalid types', () => {
  for (const mutate of [
    (r: any) => r.schemaVersion = 2,
    (r: any) => r.layoutVersion = 'old',
    (r: any) => r.inference = 'success',
    (r: any) => delete r.entries['p1.c1.r1'],
    (r: any) => r.entries['p1.c1.r1'].value = 0,
    (r: any) => r.entries['p1.c1.r1'] = { value: true, origin: 'manual', applicability: 'unknown' },
    (r: any) => r.entries['p1.c1.r7'] = { value: 'url(https://example.com)', origin: 'manual', applicability: 'unknown' },
    (r: any) => r.entries['p1.c1.r1'] = { value: Infinity, origin: 'manual', applicability: 'unknown' },
    (r: any) => r.entries['p1.c2.r12'] = { value: 0, origin: 'manual', applicability: 'unknown' },
    (r: any) => r.extra = 'unrecognized',
  ]) { const recipe = emptyRecipe(); mutate(recipe); assert.throws(() => validateRecipe(recipe)); }
  assert.throws(() => parseRecipe('{'));
  assert.throws(() => parseRecipe(' '.repeat(1_000_001)));
});
test('imports are cloned and clearing a value restores unknown', () => {
  const original = emptyRecipe();
  const copy = validateRecipe(original); copy.title = 'changed';
  assert.notEqual(original.title, copy.title);
  const value = updateValue(original, 'p1.c1.r1', '1.25');
  assert.equal(value.entries['p1.c1.r1'].value, 1.25);
  assert.deepEqual(updateValue(value, 'p1.c1.r1', '').entries['p1.c1.r1'], original.entries['p1.c1.r1']);
  assert.throws(() => updateValue(original, 'p1.c2.r12', 'yes'));
  assert.throws(() => updateValue(original, 'p1.c1.r1', 'NaN'));
});
