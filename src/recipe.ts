import { LAYOUT_VERSION, PARAMETERS, ROW_BY_ID } from './layout.ts';
import { validateProposal } from './proposal-contract.ts';
import type { ProposalSource } from './proposal-contract.ts';

export type Origin = 'unknown' | 'manual' | 'reference' | 'fixed' | 'candidate';
export interface Entry {
  value: number | boolean | string | null;
  origin: Origin;
  applicability: 'unknown' | 'active' | 'inactive';
}
interface RecipeFields {
  layoutVersion: string;
  title: string;
  gameVersion: string | null;
  base: string | null;
  entries: Record<string, Entry>;
}
export type Recipe = RecipeFields & (
  { schemaVersion: 1; inference: 'not_run' } |
  { schemaVersion: 2; inference: 'experimental_candidates'; proposal: ProposalSource }
);
export const ORIGIN_LABEL: Record<Origin, string> = { unknown: '未取得', manual: '手動', reference: '参考', fixed: '固定', candidate: '候補' };

export function inferenceLabel(recipe: Recipe): string {
  if (recipe.schemaVersion === 1) return '自動推定は未実行';
  const remaining = Object.values(recipe.entries).filter(e => e.origin === 'candidate').length;
  return `未検証の部分レシピ · 候補 ${remaining} / 元の提案 ${recipe.proposal.suggestions.length} 項目 · 再現性は未確認`;
}

export function emptyRecipe(): Recipe {
  return { schemaVersion: 1, layoutVersion: LAYOUT_VERSION, title: '新しいレシピ', gameVersion: null, base: null, inference: 'not_run', entries: Object.fromEntries(PARAMETERS.map(r => [r.id, { value: null, origin: 'unknown', applicability: 'unknown' }])) };
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).length === allowed.length && allowed.every(k => Object.hasOwn(value, k));
}
function text(value: unknown, nullable = false): boolean {
  return (nullable && value === null) || (typeof value === 'string' && value.trim().length > 0 && value.length <= 160 && !/[\u0000-\u001f]/.test(value));
}
export function validateRecipe(input: unknown): Recipe {
  if (!object(input)) throw Error('レシピの構造が正しくありません。');
  const proposed = input.schemaVersion === 2;
  if (!keys(input, ['schemaVersion', 'layoutVersion', 'title', 'gameVersion', 'base', 'inference', 'entries', ...(proposed ? ['proposal'] : [])])) throw Error('レシピの構造が正しくありません。');
  if (![1, 2].includes(input.schemaVersion as number) || input.layoutVersion !== LAYOUT_VERSION) throw Error('このレシピの形式・配列バージョンには対応していません。');
  if (input.inference !== (proposed ? 'experimental_candidates' : 'not_run')) throw Error('レシピの推定状態が正しくありません。');
  const proposal = proposed ? validateProposal(input.proposal) : null;
  if (proposal && (input.gameVersion !== proposal.scope.gameBuild || input.base !== proposal.scope.baseEvidence)) throw Error('候補レシピのゲーム版・ベース条件は変更できません。');
  if (!text(input.title) || !text(input.gameVersion, true) || !text(input.base, true)) throw Error('レシピ名・ゲーム版・ベースの形式が正しくありません。');
  if (!object(input.entries) || !keys(input.entries, PARAMETERS.map(r => r.id))) throw Error('設定項目に不足または未対応のIDがあります。');
  for (const row of PARAMETERS) {
    const entry = input.entries[row.id];
    if (!object(entry) || !keys(entry, ['value', 'origin', 'applicability'])) throw Error(`${row.label}の構造が正しくありません。`);
    if (!['unknown', 'manual', 'reference', 'fixed', ...(proposed ? ['candidate'] : [])].includes(String(entry.origin)) || !['unknown', 'active', 'inactive'].includes(String(entry.applicability))) throw Error(`${row.label}の状態が正しくありません。`);
    if (entry.origin === 'candidate') {
      const suggestion = proposal?.suggestions.find(s => s.rowId === row.id);
      if (!suggestion || entry.value !== suggestion.value || entry.applicability !== 'unknown') throw Error(`${row.label}の候補値と根拠が一致しません。`);
    }
    if ((entry.value === null) !== (entry.origin === 'unknown')) throw Error(`${row.label}の値と取得状態が一致しません。`);
    if (entry.value === null) continue;
    const valid = row.kind === 'number' ? typeof entry.value === 'number' && Number.isFinite(entry.value)
      : row.kind === 'boolean' ? typeof entry.value === 'boolean'
      : typeof entry.value === 'string' && /^#[0-9a-fA-F]{6}$/.test(entry.value);
    if (!valid) throw Error(`${row.label}の値の型が正しくありません。`);
  }
  // Clone only validated fields; no caller-owned references survive import.
  return structuredClone(input) as unknown as Recipe;
}

export function parseRecipe(raw: string): Recipe {
  if (raw.length > 1_000_000) throw Error('レシピJSONは1MB以内にしてください。');
  try { return validateRecipe(JSON.parse(raw)); }
  catch (error) {
    if (error instanceof SyntaxError) throw Error('JSONを読み取れませんでした。');
    throw error;
  }
}

export function updateValue(recipe: Recipe, id: string, raw: string): Recipe {
  const row = ROW_BY_ID.get(id);
  if (!row || row.kind === 'heading' || row.kind === 'group') throw Error('設定項目が存在しません。');
  const value = raw.trim() === '' ? null : row.kind === 'boolean' ? raw === 'true' ? true : raw === 'false' ? false : NaN : row.kind === 'number' ? Number(raw) : raw;
  const next = structuredClone(recipe);
  next.entries[id] = { value, origin: value === null ? 'unknown' : 'manual', applicability: recipe.entries[id].applicability };
  return validateRecipe(next);
}

export function serializeRecipe(recipe: Recipe): string {
  return JSON.stringify(validateRecipe(recipe), null, 2) + '\n';
}
