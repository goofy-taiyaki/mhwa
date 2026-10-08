/** Manually transcribed labels/order from the four user supplied recipe screens.
 * No screenshot values, UI ranges, defaults, or internal keys are inferred here.
 * pN.cN.rN are layout-version-scoped display IDs, not game parameter IDs.
 */
export type RowKind = 'heading' | 'group' | 'number' | 'color' | 'boolean';
export interface LayoutRow {
  id: string;
  label: string;
  kind: RowKind;
  category: string;
  parentId: string | null;
  page: number;
  column: number;
  order: number;
  internalId: null;
}

export const LAYOUT_VERSION = 'reference-ja-20261008-v1';
export const PAGE_TITLES = ['基本・髪・肌・眼', '目もと・鼻・口・ヒゲ', '輪郭・体型・ペイント', 'ペイント・インナー'];

// # category; > parent group; @ color; ? boolean; remaining rows are numbers.
const columns = [
  [
    `モデルプリセット
ボイス
ボイス音程
立ちふるまい
#髪
髪のタイプ
@髪のベースカラー
色相
彩度
明度
@髪のアクセントカラー
色相
彩度
明度
グラデーションの比率
グラデーションの滑らかさ
髪の長さ（設定1）`,
    `髪の長さ（設定2）
#肌
@肌のカラー
肌の彩度
肌の明度
>顔テクスチャのブレンド
タイプ
ブレンド量
>しわのブレンド
タイプ
ブレンド量
?表情のしわ
#眉・まつ毛
眉毛のタイプ
@眉毛のカラー
色相
彩度`,
    `明度
眉毛の透明度
眉の奥行き
眉の高さ
眉の幅
眉間の高さ
眉間の幅
眉尻の高さ
@まつ毛のカラー
色相
彩度
明度
まつ毛の長さ
まつ毛の濃さ
#眼
@虹彩のカラー
色相`,
    `彩度
明度
@白目のカラー
色相
彩度
明度
虹彩のサイズ
?右眼の個別設定
@右眼の虹彩カラー
色相
彩度
明度
@右眼の白目カラー
色相
彩度
明度
右眼の虹彩サイズ`,
  ],
  [
    `#目もと
>目もとのブレンド
左のタイプ
右のタイプ
左のブレンド量
右のブレンド量
目の大きさ
目の奥行き
目の高さ
目の幅
目の角度
目頭の高さ
目尻の高さ
上まぶたの高さ
上まぶたの角度
下まぶたの高さ
下まぶたの角度`,
    `二重まぶたの幅
二重まぶたの角度
#鼻
>鼻のブレンド
左のタイプ
右のタイプ
左のブレンド量
右のブレンド量
鼻の位置
鼻の高さ
鼻筋の高さ
鼻先の角度
鼻翼の角度
鼻翼の幅
#口
>口のブレンド
左のタイプ`,
    `右のタイプ
左のブレンド量
右のブレンド量
口の大きさ
口の位置
口の奥行き
口角の高さ
口唇の厚さ
@歯のカラー
色相
彩度
明度
@歯の汚れのカラー
色相
彩度
明度
歯の汚れの透明度`,
    `#ヒゲ
ヒゲのタイプ
口ヒゲのタイプ
@ヒゲのベースカラー
色相
彩度
明度
@ヒゲのアクセントカラー
色相
彩度
明度
グラデーションの比率
グラデーションの滑らかさ
?口ヒゲのカラー設定
@口ヒゲのベースカラー
色相
彩度`,
  ],
  [
    `明度
@口ヒゲのアクセントカラー
色相
彩度
明度
グラデーションの比率
グラデーションの滑らかさ
#輪郭
>輪郭のブレンド
左のタイプ
右のタイプ
左のブレンド量
右のブレンド量
輪郭の全体調整
顔全体の長さ
頬骨の厚さ
頬肉の膨らみ`,
    `えらの幅
えらの角度
あごの長さ
あごの大きさ
#体型
体の大きさ
筋肉
#化粧・ペイント1
化粧・ペイント1のタイプ
@化粧・ペイント1のカラー
色相
彩度
明度
透明度
横の位置
縦の位置
横のサイズ`,
    `縦のサイズ
角度
?左右反転
?上下反転
?シンメトリー
光沢/粗さ
メタリック
立体感
発光
#化粧・ペイント2
化粧・ペイント2のタイプ
@化粧・ペイント2のカラー
色相
彩度
明度
透明度
横の位置`,
    `縦の位置
横のサイズ
縦のサイズ
角度
?左右反転
?上下反転
?シンメトリー
光沢/粗さ
メタリック
立体感
発光
#化粧・ペイント3
化粧・ペイント3のタイプ
@化粧・ペイント3のカラー
色相
彩度
明度`,
  ],
  [
    `透明度
横の位置
縦の位置
横のサイズ
縦のサイズ
角度
?左右反転
?上下反転
?シンメトリー
光沢/粗さ
メタリック
立体感
発光
#インナー
胴のインナータイプ
腕のインナータイプ
腰のインナータイプ`,
    `脚のインナータイプ
@胴のインナーカラー1
色相
彩度
明度
@腕のインナーカラー1
色相
彩度
明度
@腰のインナーカラー1
色相
彩度
明度
@脚のインナーカラー1
色相
彩度
明度`,
    `@胴のインナーカラー2
色相
彩度
明度
@腕のインナーカラー2
色相
彩度
明度
@腰のインナーカラー2
色相
彩度
明度
@脚のインナーカラー2
色相
彩度
明度
#アンダーウェア`,
    `?アンダーシャツの表示
@アンダーシャツのカラー
色相
彩度
明度
?アンダーパンツの表示
@アンダーパンツのカラー
色相
彩度
明度`,
  ],
];

let category = '基本';
let parentId: string | null = null;
const childLabels = new Set(['色相', '彩度', '明度', '肌の彩度', '肌の明度', 'タイプ', 'ブレンド量', '左のタイプ', '右のタイプ', '左のブレンド量', '右のブレンド量']);
export const PAGES: LayoutRow[][][] = columns.map((page, pi) => page.map((text, ci) => text.split('\n').map((line, ri) => {
  const kind: RowKind = line.startsWith('#') ? 'heading' : line.startsWith('>') ? 'group' : line.startsWith('@') ? 'color' : line.startsWith('?') ? 'boolean' : 'number';
  const label = kind === 'number' ? line : line.slice(1);
  const id = `p${pi + 1}.c${ci + 1}.r${ri + 1}`;
  if (kind === 'heading') { category = label; parentId = null; }
  if (!childLabels.has(label)) parentId = null;
  const row = { id, label, kind, category, parentId, page: pi + 1, column: ci + 1, order: ri + 1, internalId: null };
  if (kind === 'group' || kind === 'color') parentId = id;
  return row;
})));

export const ROWS = PAGES.flat(2);
export const PARAMETERS = ROWS.filter(r => r.kind !== 'heading' && r.kind !== 'group');
export const ROW_BY_ID = new Map(ROWS.map(r => [r.id, r]));
