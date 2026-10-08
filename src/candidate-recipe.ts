import { emptyRecipe, validateRecipe } from './recipe.ts';
import type { Recipe } from './recipe.ts';
import { proposalBinding } from './proposal-contract.ts';
import type { ProposalSource } from './proposal-contract.ts';
import { parseMeasuredCatalog, rankMeasuredCandidates } from './measured-candidate-search.ts';
import { parseMeasuredPartsCatalog, rankMeasuredParts } from './measured-parts-search.ts';
import { validateObservation } from './observation-comparison.ts';
import { parseCompactCatalog, rankCompactParts } from './compact-catalog.ts';

/** Builds a new partial draft, never fills or overwrites an existing recipe.
 * The full catalog and face landmarks remain local; only selected UI values,
 * catalog identity and declared measurement conditions enter the recipe.
 */
export function createCandidateRecipe(rawCatalog: unknown, observation: unknown, catalogSha256: string, createdAt: string): Recipe {
  const kind = (rawCatalog as {kind?: unknown})?.kind;
  const catalog = kind === 'compact_measured_parts' ? parseCompactCatalog(rawCatalog) : kind === 'measured_parts_catalog' ? parseMeasuredPartsCatalog(rawCatalog) : parseMeasuredCatalog(rawCatalog);
  const ob = validateObservation(observation);
  const selections = catalog.kind === 'compact_measured_parts' ? rankCompactParts(observation,catalog).parts.map(p=>p.result.ranking[0]) : catalog.kind === 'measured_parts_catalog'
    ? rankMeasuredParts(observation, catalog.parts).parts.map(p => p.result.ranking[0])
    : [rankMeasuredCandidates(observation, catalog.candidates, catalog.features).ranking[0]];
  const suggestions: ProposalSource['suggestions'] = selections.flatMap(c => Object.entries(c.settings).map(([label, value]) => {
    const b = proposalBinding(label);
    return { rowId: b.id, label, category: b.category, value, candidateId: c.id };
  }));
  const recipe = emptyRecipe();
  for (const s of suggestions) recipe.entries[s.rowId] = { value: s.value, origin: 'candidate', applicability: 'unknown' };
  const { gameBuild, baseEvidence, captureConditions, limitations } = catalog;
  return validateRecipe({ ...recipe, schemaVersion: 2, inference: 'experimental_candidates',
    title: '画像からの候補（未検証・部分レシピ）', gameVersion: gameBuild, base: baseEvidence,
    proposal: { method: 'measured_distance_candidates_v1', validation: 'unvalidated', completeness: 'partial',
      createdAt, catalogSha256, engine: ob.engine, modelSha256: ob.modelSha256, delegate: ob.delegate,
      scope: { gameBuild, baseEvidence, captureConditions, limitations }, suggestions } });
}
