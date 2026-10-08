import { ROW_BY_ID } from './layout.ts';

// UI endpoints and labels observed on build 24705561, not internal parameter IDs.
// Evidence: docs/NOSE_WIDTH_RANGE_20261008.md and PARTS_CANDIDATE_SEARCH_20261008.md.
export const PROPOSAL_BINDINGS = [
  { id: 'p2.c1.r7', label: '目の大きさ', category: '目もと' },
  { id: 'p2.c2.r14', label: '鼻翼の幅', category: '鼻' },
  { id: 'p2.c3.r4', label: '口の大きさ', category: '口' },
] as const;
export interface ProposalSource {
  method: 'measured_distance_candidates_v1';
  validation: 'unvalidated';
  completeness: 'partial';
  createdAt: string;
  catalogSha256: string;
  engine: string;
  modelSha256: string;
  delegate: string;
  scope: { gameBuild: string; baseEvidence: string; captureConditions: string; limitations: string };
  suggestions: { rowId: string; label: string; category: string; value: number; candidateId: string }[];
}
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function exact(v: unknown, keys: string[]): v is Record<string, unknown> {
  return isObject(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
}
function validText(v: unknown, max = 4000): v is string {
  return typeof v === 'string' && !!v.trim() && v.length <= max && !/[\u0000-\u001f]/.test(v);
}
export function proposalBinding(label: string) {
  const binding = PROPOSAL_BINDINGS.find(b => b.label === label);
  const row = binding && ROW_BY_ID.get(binding.id);
  if (!binding || !row || row.kind !== 'number' || row.label !== label || row.category !== binding.category || row.parentId !== null) {
    throw Error(`設定表への対応が未確認の項目です: ${label}`);
  }
  return binding;
}
export function validateProposal(input: unknown): ProposalSource {
  if (!exact(input, ['method','validation','completeness','createdAt','catalogSha256','engine','modelSha256','delegate','scope','suggestions']) ||
    input.method !== 'measured_distance_candidates_v1' || input.validation !== 'unvalidated' || input.completeness !== 'partial' ||
    !validText(input.createdAt, 40) || !Number.isFinite(Date.parse(input.createdAt)) ||
    !validText(input.catalogSha256, 64) || !/^[0-9a-f]{64}$/.test(input.catalogSha256) ||
    !validText(input.modelSha256, 64) || !/^[0-9a-f]{64}$/.test(input.modelSha256) ||
    !validText(input.engine, 160) || !validText(input.delegate, 160) ||
    !exact(input.scope, ['gameBuild','baseEvidence','captureConditions','limitations']) ||
    !Object.values(input.scope).every(v => validText(v)) ||
    !validText(input.scope.gameBuild, 160) || !validText(input.scope.baseEvidence, 160) ||
    !Array.isArray(input.suggestions) || input.suggestions.length < 1 || input.suggestions.length > PROPOSAL_BINDINGS.length) {
    throw Error('候補レシピの根拠・条件が正しくありません。');
  }
  const seen = new Set<string>();
  for (const s of input.suggestions) {
    if (!exact(s, ['rowId','label','category','value','candidateId']) || !validText(s.label, 160) || !validText(s.candidateId, 160)) {
      throw Error('候補項目の構造が正しくありません。');
    }
    const b = proposalBinding(s.label);
    if (s.rowId !== b.id || s.category !== b.category || seen.has(b.id) ||
      typeof s.value !== 'number' || !Number.isInteger(s.value) || s.value < 0 || s.value > 20) {
      throw Error('候補の項目対応・UI値が正しくありません。');
    }
    seen.add(b.id);
  }
  return structuredClone(input) as unknown as ProposalSource;
}
