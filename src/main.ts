import './style.css';
import { PAGES, PAGE_TITLES, PARAMETERS, ROW_BY_ID } from './layout.ts';
import type { LayoutRow } from './layout.ts';
import { emptyRecipe, inferenceLabel, ORIGIN_LABEL, parseRecipe, serializeRecipe, updateValue } from './recipe.ts';
import type { Entry, Recipe } from './recipe.ts';
import { inferImage } from './inference-client.ts';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw Error(`Missing element ${id}`);
  return found as T;
}
function make<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
let recipe = emptyRecipe();
let currentPage = 0;
let editing = false;
let imageUrl: string | null = null;
let imageRequest = 0;
let dirty = false;
let selectedImage: HTMLImageElement | null = null;
let inferenceAbort: AbortController | null = null;
let inferenceSequence = 0;
let generatedFromImageRequest: number | null = null;
const message = element('message');

function inferenceControls(busy: boolean): void {
  element<HTMLButtonElement>('infer').disabled = busy || !selectedImage;
  element('cancel-inference').hidden = !busy;
  element('recipe').inert = busy;
  for (const id of ['title', 'game-version', 'base']) element<HTMLInputElement>(id).disabled = busy;
  element('inference-status').setAttribute('aria-busy',String(busy));
}
function cancelInference(): void {
  inferenceSequence++; inferenceAbort?.abort(); inferenceAbort = null;
  inferenceControls(false);
}

function notify(text: string, error = false): void {
  message.textContent = text;
  message.className = error ? 'error' : 'success';
  message.setAttribute('role', error ? 'alert' : 'status');
}
function valueText(row: LayoutRow, entry: Entry): string {
  if (entry.value === null) return row.kind === 'color' ? '色未確認' : '—';
  if (row.kind === 'boolean') return entry.value ? 'ON' : 'OFF';
  return String(entry.value);
}
function contextLabel(row: LayoutRow): string {
  const parent = row.parentId ? ROW_BY_ID.get(row.parentId)?.label : null;
  return [row.category, parent, row.label].filter(Boolean).join(' / ');
}
function rowElement(row: LayoutRow): HTMLElement {
  const node = make('div', `row ${row.kind}${row.parentId ? ' child' : ''}`);
  node.dataset.id = row.id;
  if (row.kind === 'heading') { node.append(make('h3', '', row.label)); return node; }
  if (row.kind === 'group') { node.append(make('span', 'group-label', row.label)); return node; }
  const entry = recipe.entries[row.id];
  if (entry.applicability === 'inactive') node.classList.add('inactive');
  const label = make('span', 'row-label', row.label);
  label.title = contextLabel(row);
  node.append(label);
  const cell = make('div', 'value-cell');
  if (editing) {
    const field = row.kind === 'boolean' ? make('select') : make('input');
    field.dataset.field = row.id;
    field.setAttribute('aria-label', contextLabel(row));
    if (field instanceof HTMLSelectElement) {
      for (const [value, caption] of [['', '未取得'], ['true', 'ON'], ['false', 'OFF']]) {
        const option = make('option', '', caption); option.value = value; field.append(option);
      }
    } else {
      field.type = 'text';
      field.inputMode = row.kind === 'number' ? 'decimal' : 'text';
      field.placeholder = row.kind === 'color' ? '#RRGGBB' : '未取得';
      field.maxLength = 48;
      if (row.kind === 'color') field.title = '表示用の色見本。ゲームの色相・彩度・明度への変換は行いません。';
    }
    field.value = entry.value === null ? '' : String(entry.value);
    field.addEventListener('change', () => {
      try {
        recipe = updateValue(recipe, row.id, field.value);
        dirty = true;
        field.removeAttribute('aria-invalid');
        notify('手動入力を反映しました。ゲーム内の入力範囲は未検証です。');
        renderSheets(row.id);
      } catch (error) {
        field.setAttribute('aria-invalid', 'true');
        notify((error as Error).message, true);
      }
    });
    cell.append(field);
  } else {
    const value = make('span', 'value', valueText(row, entry));
    if (entry.value === null) value.classList.add('unknown');
    if (row.kind === 'boolean') {
      const toggle = make('span', `switch ${entry.value === true ? 'on' : entry.value === false ? 'off' : 'unset'}`);
      toggle.setAttribute('aria-hidden', 'true'); cell.append(toggle);
    }
    if (row.kind === 'color' && typeof entry.value === 'string') {
      const swatch = make('span', 'swatch'); swatch.style.backgroundColor = entry.value;
      swatch.setAttribute('aria-hidden', 'true'); cell.append(swatch);
    }
    cell.append(value);
  }
  const caption = ORIGIN_LABEL[entry.origin] + (entry.applicability === 'inactive' ? ' · 非適用' : '');
  const state = make('small', `origin ${entry.origin}`, caption);
  cell.append(state); node.append(cell);
  return node;
}

function renderSheets(focusId?: string): void {
  const sheets = element('sheets'); sheets.replaceChildren();
  PAGES.forEach((page, pi) => {
    const sheet = make('section', 'sheet'); sheet.hidden = pi !== currentPage;
    sheet.id = `sheet-${pi + 1}`; sheet.setAttribute('aria-label', `${pi + 1}/4 ${PAGE_TITLES[pi]}`);
    sheet.append(make('h2', 'sheet-title', `${pi + 1}/4　${PAGE_TITLES[pi]}`));
    sheet.append(make('p', 'print-metadata', `${recipe.title} · ゲーム版: ${recipe.gameVersion ?? '未確認'} · ベース: ${recipe.base ?? '未指定'} · ${inferenceLabel(recipe)}`));
    if (recipe.schemaVersion === 2) {
      const { captureConditions, limitations } = recipe.proposal.scope;
      sheet.append(make('p', 'print-metadata', `測定条件: ${captureConditions} / 制限: ${limitations} / 未取得欄はベース値を補完していません。`));
    }
    const grid = make('div', 'recipe-grid');
    page.forEach(column => {
      const columnNode = make('div', 'recipe-column');
      const first = column[0];
      const hint = make('div', 'continuation', first.kind !== 'heading' ? `${first.category}${first.parentId ? ' / ' + ROW_BY_ID.get(first.parentId)?.label : ''}（続き）` : '');
      if (pi === 0 && first.column === 1) hint.textContent = '基本設定';
      columnNode.append(hint, ...column.map(rowElement)); grid.append(columnNode);
    });
    sheet.append(grid); sheets.append(sheet);
  });
  const known = Object.values(recipe.entries).filter(v => v.value !== null).length;
  element('summary').textContent = `${known} / ${PARAMETERS.length} 項目に値あり · ${inferenceLabel(recipe)}`;
  const details = element('proposal-details'); details.replaceChildren(); details.hidden = recipe.schemaVersion !== 2;
  if (recipe.schemaVersion === 2) {
    details.append(make('h2', '', '画像からの候補 · 未検証の部分レシピ'));
    const source = generatedFromImageRequest === null ? '読み込んだレシピの候補です。現在表示中の参照画像を再解析した結果ではありません。' :
      generatedFromImageRequest === imageRequest && imageUrl ? '現在の参照画像から生成した候補です。' : '以前に選択した画像からの候補です。現在の参照画像では再解析していません。';
    details.append(make('p', '', source + '未取得欄は空欄のままで、基準顔を再現する完全な設定表ではありません。'));
    const scope = recipe.proposal.scope;
    const list = make('dl');
    for (const [label, value] of [['測定対象', scope.gameBuild], ['基準条件', scope.baseEvidence], ['撮影条件', scope.captureConditions], ['制限', scope.limitations]]) {
      list.append(make('dt', '', label), make('dd', '', value));
    }
    details.append(list);
    const evidence = make('details'); evidence.append(make('summary', '', '候補の記録'));
    evidence.append(make('p', '', `${recipe.proposal.createdAt} / ${recipe.proposal.engine} / ${recipe.proposal.delegate}`));
    evidence.append(make('p', '', `候補集 SHA-256: ${recipe.proposal.catalogSha256}`));
    const suggestions = make('ul');
    for (const s of recipe.proposal.suggestions) suggestions.append(make('li', '', `${s.category} / ${s.label}: ${s.value}（${s.candidateId}）${recipe.entries[s.rowId].origin === 'candidate' ? '' : ' · 現在の欄は変更済み'}`));
    evidence.append(suggestions); details.append(evidence);
  }
  element('page-counter').textContent = `${currentPage + 1} / 4`;
  element<HTMLButtonElement>('previous').disabled = currentPage === 0;
  element<HTMLButtonElement>('next').disabled = currentPage === 3;
  for (const tab of element('tabs').querySelectorAll<HTMLButtonElement>('button')) tab.setAttribute('aria-current', Number(tab.dataset.page) === currentPage ? 'page' : 'false');
  if (focusId) document.querySelector<HTMLElement>(`[data-field="${focusId}"]`)?.focus();
}
function selectPage(index: number): void {
  currentPage = Math.max(0, Math.min(3, index)); renderSheets();
}
PAGE_TITLES.forEach((title, index) => {
  const button = make('button', 'page-tab'); button.dataset.page = String(index);
  button.append(make('span', 'tab-number', `0${index + 1}`), make('span', '', title));
  button.setAttribute('aria-controls', `sheet-${index + 1}`);
  button.addEventListener('click', () => selectPage(index)); element('tabs').append(button);
});
element('previous').addEventListener('click', () => selectPage(currentPage - 1));
element('next').addEventListener('click', () => selectPage(currentPage + 1));
element('tabs').addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault(); selectPage(currentPage + (event.key === 'ArrowRight' ? 1 : -1));
  element('tabs').querySelectorAll<HTMLButtonElement>('button')[currentPage].focus();
});
element<HTMLInputElement>('editing').addEventListener('change', event => {
  editing = (event.target as HTMLInputElement).checked; renderSheets();
});
function syncMetadata(): void {
  element<HTMLInputElement>('title').value = recipe.title;
  element<HTMLInputElement>('game-version').value = recipe.gameVersion ?? '';
  element<HTMLInputElement>('base').value = recipe.base ?? '';
  for (const id of ['game-version', 'base']) element<HTMLInputElement>(id).readOnly = recipe.schemaVersion === 2;
}
function readMetadata(): Recipe {
  const next = { ...recipe, title: element<HTMLInputElement>('title').value.trim(), gameVersion: element<HTMLInputElement>('game-version').value.trim() || null, base: element<HTMLInputElement>('base').value.trim() || null };
  return parseRecipe(JSON.stringify(next));
}
for (const id of ['title', 'game-version', 'base']) element(id).addEventListener('input', () => { dirty = true; });

element('export').addEventListener('click', () => {
  try {
    if (document.querySelector('[aria-invalid="true"]')) throw Error('入力エラーを修正してから保存してください。');
    recipe = readMetadata();
    const url = URL.createObjectURL(new Blob([serializeRecipe(recipe)], { type: 'application/json' }));
    const link = make('a'); link.href = url; link.download = 'mhwa-recipe.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); dirty = false;
    notify('レシピJSONを保存しました。参照画像は含まれません。');
  } catch (error) { notify((error as Error).message, true); }
});
element<HTMLInputElement>('import').addEventListener('change', async event => {
  const input = event.target as HTMLInputElement; const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1_000_000) throw Error('レシピJSONは1MB以内にしてください。');
    const next = parseRecipe(await file.text());
    if (dirty && !window.confirm('保存していない編集を、読み込むレシピで置き換えますか？')) return;
    cancelInference(); generatedFromImageRequest = null;
    element('inference-status').textContent = 'レシピを読み込みました。画像からの解析は未実行です。';
    recipe = next; dirty = false; syncMetadata(); renderSheets();
    notify(recipe.schemaVersion === 2 ? '未検証の部分レシピを読み込みました。候補と未取得を区別して表示します。' : 'レシピを読み込みました。ゲーム内の再現性・版互換性は未検証です。');
  } catch (error) { notify((error as Error).message, true); }
  finally { input.value = ''; }
});
element('print').addEventListener('click', () => {
  if (document.querySelector('[aria-invalid="true"]')) { notify('入力エラーを修正してから印刷してください。', true); return; }
  try { recipe = readMetadata(); } catch (error) { notify((error as Error).message, true); return; }
  window.print();
});
let editingBeforePrint = false;
window.addEventListener('beforeprint', () => { editingBeforePrint = editing; editing = false; renderSheets(); });
window.addEventListener('afterprint', () => { editing = editingBeforePrint; renderSheets(); });

element<HTMLInputElement>('image').addEventListener('change', async event => {
  const input = event.target as HTMLInputElement; const file = input.files?.[0];
  if (!file) return;
  cancelInference(); selectedImage = null; inferenceControls(false);
  const request = ++imageRequest;
  element('inference-status').textContent = '画像を読み込んでいます…';
  renderSheets();
  let candidate: string | null = null;
  try {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw Error('JPEG・PNG・WebPの画像を選んでください。');
    if (file.size > 20 * 1024 * 1024) throw Error('画像は20MB以内にしてください。');
    candidate = URL.createObjectURL(file);
    const check = new Image(); check.src = candidate; await check.decode();
    if (request !== imageRequest) return;
    if (check.naturalWidth * check.naturalHeight > 24_000_000) throw Error('画像は2,400万画素以内にしてください。');
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = candidate; candidate = null;
    selectedImage = check; inferenceControls(false);
    const preview = element<HTMLImageElement>('reference-preview'); preview.src = imageUrl; preview.hidden = false;
    element('image-info').textContent = `${check.naturalWidth} × ${check.naturalHeight} px · 端末内で表示`;
    element('clear-image').hidden = false;
    notify('参照画像を表示しました。顔解析・設定値の推定はまだ行っていません。');
    element('inference-status').textContent = '「設定候補を作る」で解析を開始します。';
    renderSheets();
  } catch (error) { if (request === imageRequest) { notify(error instanceof Error && error.name !== 'EncodingError' ? error.message : '画像を読み取れませんでした。', true); element('inference-status').textContent = '画像の読込に失敗しました。別の画像を選んでください。'; } }
  finally { if (candidate) URL.revokeObjectURL(candidate); input.value = ''; }
});
element('clear-image').addEventListener('click', () => {
  imageRequest++; selectedImage = null; cancelInference();
  if (imageUrl) URL.revokeObjectURL(imageUrl); imageUrl = null;
  const preview = element<HTMLImageElement>('reference-preview'); preview.removeAttribute('src'); preview.hidden = true;
  element('image-info').textContent = '参照画像は未選択'; element('clear-image').hidden = true;
  notify('参照画像を外しました。');
  element('inference-status').textContent = '画像を選択してください。'; renderSheets();
});
element('cancel-inference').addEventListener('click',()=>{cancelInference();element('inference-status').textContent='解析を中止しました。設定表は変更していません。';});
element('infer').addEventListener('click',async()=>{
  if(!selectedImage||inferenceAbort)return;
  if((dirty||Object.values(recipe.entries).some(e=>e.value!==null))&&!window.confirm('現在の設定表を、新しい画像の候補で置き換えますか？ 必要なレシピは先にJSONで保存してください。'))return;
  const seq=++inferenceSequence,sourceRequest=imageRequest,sourceImage=selectedImage;
  const abort=new AbortController();inferenceAbort=abort;inferenceControls(true);
  const status=element('inference-status');status.textContent='画像を解析用に準備しています…';
  try{
    const bitmap=await createImageBitmap(sourceImage);
    if(seq!==inferenceSequence){bitmap.close();return;}
    const next=await inferImage(bitmap,new URL('inference/',document.baseURI).href,abort.signal,text=>{if(seq===inferenceSequence)status.textContent=text;});
    if(seq!==inferenceSequence)return;
    recipe=next;dirty=true;generatedFromImageRequest=sourceRequest;currentPage=1;editing=false;
    element<HTMLInputElement>('editing').checked=false;syncMetadata();renderSheets();
    status.textContent='設定候補を作成しました。実写での再現精度は未検証です。';
    notify('口・目の大きさの実験候補を表示しました。対応外の項目は未取得です。');
  }catch(error){if(seq===inferenceSequence){status.textContent=(error as Error).message;notify('候補を作成できませんでした。設定表は変更していません。',true);}}
  finally{if(seq===inferenceSequence){inferenceAbort=null;inferenceControls(false);}}
});
window.addEventListener('beforeunload', event => { if (dirty) event.preventDefault(); });
renderSheets();
