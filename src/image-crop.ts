export interface CropRect { x: number; y: number; width: number; height: number }

export function validateCrop(rect: CropRect, width: number, height: number): CropRect {
  if (![width, height, rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger) ||
      width < 1 || height < 1 || rect.x < 0 || rect.y < 0 || rect.width < 1 || rect.height < 1 ||
      rect.x + rect.width > width || rect.y + rect.height > height) {
    throw Error('切抜き範囲は画像内の整数で指定してください。幅・高さは1以上が必要です。');
  }
  return { ...rect };
}

/** Pixel-edge coordinates, including reverse drags and either image boundary. */
export function cropFromDrag(a: [number, number], b: [number, number], width: number, height: number): CropRect {
  const point = ([x, y]: [number, number]) => [Math.max(0, Math.min(width, Math.round(x))), Math.max(0, Math.min(height, Math.round(y)))];
  const p = point(a), q = point(b);
  return validateCrop({ x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), width: Math.abs(q[0] - p[0]), height: Math.abs(q[1] - p[1]) }, width, height);
}

export function createCropEditor(apply: (rect: CropRect) => void) {
  const dialog = document.createElement('dialog');
  dialog.className = 'crop-dialog';
  dialog.setAttribute('aria-labelledby', 'crop-heading');
  dialog.innerHTML = `<form method="dialog">
    <h2 id="crop-heading">顔の周囲を切り抜く</h2>
    <p>額・あご・左右の輪郭を残し、1人だけを囲んでください。画像をドラッグするか、下の数値を変更できます。</p>
    <canvas id="crop-canvas" aria-label="切抜き範囲のプレビュー"></canvas>
    <div class="crop-fields">
      <label>左から（px）<input id="crop-x" type="number" min="0" step="1" required></label>
      <label>上から（px）<input id="crop-y" type="number" min="0" step="1" required></label>
      <label>幅（px）<input id="crop-width" type="number" min="1" step="1" required></label>
      <label>高さ（px）<input id="crop-height" type="number" min="1" step="1" required></label>
    </div>
    <p id="crop-status" role="status" aria-live="polite"></p>
    <div class="actions"><button type="button" id="crop-full" class="secondary">元の画像全体に戻す</button><button type="button" id="crop-cancel" class="secondary">キャンセル</button><button type="submit" id="crop-apply">この範囲を使う</button></div>
    <p class="crop-note">元のファイルは変更しません。切抜きは端末内だけで行います。範囲を変えた後は、設定候補を作り直してください。</p>
  </form>`;
  document.body.append(dialog);
  const canvas = dialog.querySelector<HTMLCanvasElement>('canvas')!;
  const context = canvas.getContext('2d')!;
  const status = dialog.querySelector<HTMLElement>('#crop-status')!;
  const button = dialog.querySelector<HTMLButtonElement>('#crop-apply')!;
  const keys = ['x', 'y', 'width', 'height'] as const;
  const fields = keys.map(key => dialog.querySelector<HTMLInputElement>(`#crop-${key}`)!);
  let source: HTMLImageElement | null = null;
  let rect: CropRect;
  let start: [number, number] | null = null;
  let beforeDrag: CropRect | null = null;
  let pointer: number | null = null;
  function draw() {
    if (!source) return;
    const sx = canvas.width / source.naturalWidth, sy = canvas.height / source.naturalHeight;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    context.fillStyle = '#07130cb3'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, rect.x, rect.y, rect.width, rect.height, rect.x * sx, rect.y * sy, rect.width * sx, rect.height * sy);
    context.strokeStyle = '#f7d27e'; context.lineWidth = 2;
    context.strokeRect(rect.x * sx + 1, rect.y * sy + 1, Math.max(0, rect.width * sx - 2), Math.max(0, rect.height * sy - 2));
  }
  function sync() {
    fields.forEach((field, i) => { field.value = String(rect[keys[i]]); field.removeAttribute('aria-invalid'); });
    button.disabled = false; status.textContent = `${rect.width} × ${rect.height} pxを解析します。`; draw();
  }
  fields.forEach(field => field.addEventListener('input', () => {
    if (!source) return;
    try {
      rect = validateCrop(Object.fromEntries(fields.map((f, i) => [keys[i], f.valueAsNumber])) as unknown as CropRect, source.naturalWidth, source.naturalHeight);
      fields.forEach(f => f.removeAttribute('aria-invalid')); button.disabled = false;
      status.textContent = `${rect.width} × ${rect.height} pxを解析します。`; draw();
    } catch (error) { field.setAttribute('aria-invalid', 'true'); button.disabled = true; status.textContent = (error as Error).message; }
  }));
  function point(event: PointerEvent): [number, number] {
    const box = canvas.getBoundingClientRect();
    return [(event.clientX - box.left) / box.width * source!.naturalWidth, (event.clientY - box.top) / box.height * source!.naturalHeight];
  }
  canvas.addEventListener('pointerdown', event => {
    if (!source || !event.isPrimary || event.button !== 0) return;
    start = point(event); beforeDrag = { ...rect }; pointer = event.pointerId; canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!source || !start || pointer !== event.pointerId) return;
    try { rect = cropFromDrag(start, point(event), source.naturalWidth, source.naturalHeight); sync(); } catch { /* A click or a one-axis drag keeps the previous selection. */ }
  });
  canvas.addEventListener('pointerup', event => { if (pointer === event.pointerId) { start = null; beforeDrag = null; pointer = null; } });
  canvas.addEventListener('pointercancel', event => { if (pointer === event.pointerId) { if (beforeDrag) { rect = beforeDrag; sync(); } start = null; beforeDrag = null; pointer = null; } });
  dialog.querySelector('#crop-full')!.addEventListener('click', () => { if (source) { rect = { x: 0, y: 0, width: source.naturalWidth, height: source.naturalHeight }; sync(); } });
  dialog.querySelector('#crop-cancel')!.addEventListener('click', () => dialog.close());
  dialog.querySelector('form')!.addEventListener('submit', event => {
    event.preventDefault();
    if (!source || button.disabled) return;
    apply(validateCrop(rect, source.naturalWidth, source.naturalHeight)); dialog.close();
  });
  dialog.addEventListener('close', () => { source = null; start = null; beforeDrag = null; pointer = null; fields.forEach(f => f.removeAttribute('aria-invalid')); context.clearRect(0, 0, canvas.width, canvas.height); });
  return {
    open(image: HTMLImageElement, current: CropRect | null) {
      source = image; rect = current ? { ...current } : { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
      const scale = Math.min(1, 960 / image.naturalWidth, 440 / image.naturalHeight);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      fields.forEach((f, i) => { f.max = String(i % 2 === 0 ? image.naturalWidth : image.naturalHeight); });
      sync(); dialog.showModal();
    },
    close() { if (dialog.open) dialog.close(); }
  };
}
