/**
 * Каталог продукції, опції конструктора та розрахунок вартості.
 * Модуль спільний для фронтенду (конструктор, прайс) і воркера (перерахунок
 * ціни із заявки), тому не використовує жодних DOM/Workers API.
 * Усі ціни — демонстраційні, у гривнях.
 */

export type ProductKind = 'window' | 'balcony' | 'entrance' | 'sliding';
export type ShapeKind = 'rect' | 'arch';
export type FillingKind = 'glass' | 'half' | 'panel';
export type MaterialId = 'pvc' | 'alu';
export type ProfileId = 'standard' | 'comfort' | 'premium' | 'alu-cold' | 'alu-warm' | 'alu-premium';
export type ColorId = 'white' | 'cream' | 'oak' | 'walnut' | 'anthracite' | 'black';
/** Камерність склопакета: одинарне скло, 1-, 2- або 3-камерний склопакет. */
export type GlazingId = 'pane' | 'ch1' | 'ch2' | 'ch3';
/** Тип скла (покриття). */
export type CoatingId = 'clear' | 'energy' | 'matte' | 'tinted';
/** З якого боку профіль ламінований (для алюмінію — пофарбований). */
export type LaminationId = 'none' | 'outer' | 'inner' | 'both';

/** Тип секції. Суфікс -l/-r — з якого боку петлі (або в який бік їде стулка). */
export type SectionKind =
  | 'fixed'
  | 'turn-l'
  | 'turn-r'
  | 'tilt-turn-l'
  | 'tilt-turn-r'
  | 'door-l'
  | 'door-r'
  | 'slide-l'
  | 'slide-r';

export interface LayoutDef {
  id: string;
  label: string;
  sections: SectionKind[];
  /** Частки ширини секцій (сума = 1). Якщо не задано — рівні. */
  ratios?: number[];
  minWidth: number;
  maxWidth: number;
  defWidth: number;
}

export interface Range {
  min: number;
  max: number;
  step: number;
  def: number;
}

export interface ProductDef {
  id: ProductKind;
  name: string;
  /** Ціна за м² для профілю Comfort, грн */
  baseM2: number;
  height: Range;
  layouts: LayoutDef[];
  shapes: ShapeKind[];
  fillings: boolean;
  /** Які додаткові опції має сенс пропонувати для виробу. */
  features: { ventilation: boolean; sill: boolean; ebb: boolean; net: boolean };
}

export const PRODUCTS: Record<ProductKind, ProductDef> = {
  window: {
    id: 'window',
    name: 'Вікно',
    baseM2: 3400,
    height: { min: 400, max: 2400, step: 10, def: 1400 },
    shapes: ['rect', 'arch'],
    fillings: false,
    features: { ventilation: true, sill: true, ebb: true, net: true },
    layouts: [
      { id: 'fixed', label: 'Глухе', sections: ['fixed'], minWidth: 400, maxWidth: 2400, defWidth: 1000 },
      { id: 'single', label: 'Одностулкове', sections: ['tilt-turn-r'], minWidth: 400, maxWidth: 1200, defWidth: 800 },
      { id: 'double', label: 'Двостулкове', sections: ['turn-l', 'tilt-turn-r'], minWidth: 800, maxWidth: 2400, defWidth: 1300 },
      { id: 'triple', label: 'Тристулкове', sections: ['turn-l', 'fixed', 'tilt-turn-r'], minWidth: 1200, maxWidth: 3000, defWidth: 2100 },
    ],
  },
  balcony: {
    id: 'balcony',
    name: 'Балконні двері',
    baseM2: 4100,
    height: { min: 1900, max: 2400, step: 10, def: 2150 },
    shapes: ['rect'],
    fillings: false,
    features: { ventilation: true, sill: false, ebb: false, net: true },
    layouts: [
      { id: 'door', label: 'Двері', sections: ['tilt-turn-l'], minWidth: 600, maxWidth: 1100, defWidth: 800 },
      { id: 'block', label: 'Двері + вікно', sections: ['tilt-turn-l', 'fixed'], ratios: [0.46, 0.54], minWidth: 1100, maxWidth: 2400, defWidth: 1500 },
      { id: 'block-sash', label: 'Двері + стулка', sections: ['tilt-turn-l', 'tilt-turn-r'], ratios: [0.5, 0.5], minWidth: 1300, maxWidth: 2400, defWidth: 1700 },
    ],
  },
  entrance: {
    id: 'entrance',
    name: 'Вхідні двері',
    baseM2: 7600,
    height: { min: 1900, max: 2400, step: 10, def: 2100 },
    shapes: ['rect'],
    fillings: true,
    features: { ventilation: false, sill: false, ebb: false, net: false },
    layouts: [
      { id: 'single', label: 'Одностулкові', sections: ['door-l'], minWidth: 800, maxWidth: 1200, defWidth: 950 },
      { id: 'side', label: 'З бічною вставкою', sections: ['door-l', 'fixed'], ratios: [0.7, 0.3], minWidth: 1200, maxWidth: 1800, defWidth: 1400 },
      { id: 'double', label: 'Двостулкові', sections: ['door-l', 'door-r'], minWidth: 1300, maxWidth: 2200, defWidth: 1600 },
    ],
  },
  sliding: {
    id: 'sliding',
    name: 'Розсувна система',
    baseM2: 6900,
    height: { min: 1900, max: 2800, step: 10, def: 2200 },
    shapes: ['rect'],
    fillings: false,
    features: { ventilation: false, sill: false, ebb: false, net: false },
    layouts: [
      { id: 'two', label: '2 стулки', sections: ['fixed', 'slide-l'], minWidth: 1400, maxWidth: 3600, defWidth: 2400 },
      { id: 'three', label: '3 стулки', sections: ['slide-r', 'fixed', 'slide-l'], minWidth: 2100, maxWidth: 4800, defWidth: 3300 },
      { id: 'four', label: '4 стулки', sections: ['fixed', 'slide-l', 'slide-r', 'fixed'], minWidth: 2800, maxWidth: 5600, defWidth: 4000 },
    ],
  },
};

export const PRODUCT_ORDER: ProductKind[] = ['window', 'balcony', 'entrance', 'sliding'];

export interface MaterialDef {
  id: MaterialId;
  label: string;
  note: string;
  defaultProfile: ProfileId;
}

export const MATERIALS: MaterialDef[] = [
  { id: 'pvc', label: 'Металопластик (ПВХ)', note: 'Тепло, тиша, доступна ціна', defaultProfile: 'comfort' },
  { id: 'alu', label: 'Алюміній', note: 'Тонкі профілі, міцність, великі прорізи', defaultProfile: 'alu-warm' },
];

export interface ProfileDef {
  id: ProfileId;
  material: MaterialId;
  label: string;
  /** Кількість камер у профілі */
  chambers: number;
  /** Монтажна глибина (товщина) профілю, мм */
  depth: number;
  /** Видима ширина профілю, м (для 3D) */
  face: number;
  /** Множник ціни відносно Comfort 70 */
  factor: number;
  /** Склопакети, які вміщує профіль */
  glazing: GlazingId[];
  note: string;
}

export const PROFILES: ProfileDef[] = [
  { id: 'standard', material: 'pvc', label: 'Standard 60', chambers: 3, depth: 60, face: 0.062, factor: 0.84, glazing: ['ch1', 'ch2'], note: '3 камери · 60 мм' },
  { id: 'comfort', material: 'pvc', label: 'Comfort 70', chambers: 5, depth: 70, face: 0.068, factor: 1, glazing: ['ch1', 'ch2'], note: '5 камер · 70 мм' },
  { id: 'premium', material: 'pvc', label: 'Premium 82', chambers: 7, depth: 82, face: 0.074, factor: 1.28, glazing: ['ch1', 'ch2', 'ch3'], note: '7 камер · 82 мм' },
  { id: 'alu-cold', material: 'alu', label: 'Холодний 45', chambers: 2, depth: 45, face: 0.045, factor: 1.3, glazing: ['pane', 'ch1'], note: '2 камери · без термовставки' },
  { id: 'alu-warm', material: 'alu', label: 'Теплий 65', chambers: 3, depth: 65, face: 0.052, factor: 1.75, glazing: ['ch1', 'ch2'], note: '3 камери · з термомостом' },
  { id: 'alu-premium', material: 'alu', label: 'Теплий 80', chambers: 4, depth: 80, face: 0.058, factor: 2.1, glazing: ['ch1', 'ch2', 'ch3'], note: '4 камери · з термомостом' },
];

export function profileOf(id: string): ProfileDef {
  return PROFILES.find((p) => p.id === id) ?? PROFILES[1]!;
}

export interface GlazingDef {
  id: GlazingId;
  label: string;
  /** Кількість стекол у склопакеті */
  panes: number;
  /** Загальна товщина, мм */
  total: number;
  /** Доплата / знижка за м², грн (База — 2-камерний) */
  add: number;
  note: string;
}

export const GLAZINGS: GlazingDef[] = [
  { id: 'pane', label: 'Одинарне скло', panes: 1, total: 4, add: -700, note: '4 мм · для холодних конструкцій' },
  { id: 'ch1', label: '1-камерний', panes: 2, total: 24, add: -300, note: '2 скла · 24 мм' },
  { id: 'ch2', label: '2-камерний', panes: 3, total: 36, add: 0, note: '3 скла · 36 мм' },
  { id: 'ch3', label: '3-камерний', panes: 4, total: 44, add: 520, note: '4 скла · 44 мм' },
];

export function glazingOf(id: string): GlazingDef {
  return GLAZINGS.find((g) => g.id === id) ?? GLAZINGS[2]!;
}

export interface CoatingDef {
  id: CoatingId;
  label: string;
  add: number;
  note: string;
}

export const COATINGS: CoatingDef[] = [
  { id: 'clear', label: 'Прозоре', add: 0, note: 'Стандартне скло' },
  { id: 'energy', label: 'Енергозберігаюче', add: 880, note: 'i-скло: тепло залишається в кімнаті' },
  { id: 'matte', label: 'Матове', add: 740, note: 'Світло є, прозорості немає' },
  { id: 'tinted', label: 'Тоноване', add: 620, note: 'Менше сонця влітку' },
];

export const LAMINATIONS: { id: LaminationId; sides: number }[] = [
  { id: 'none', sides: 0 },
  { id: 'outer', sides: 0.5 },
  { id: 'inner', sides: 0.5 },
  { id: 'both', sides: 1 },
];

export interface ColorDef {
  id: ColorId;
  label: string;
  hex: string;
  factor: number;
  /** Деревний декор малюється текстурою */
  wood?: boolean;
}

export const COLORS: ColorDef[] = [
  { id: 'white', label: 'Білий', hex: '#f4f4f2', factor: 1 },
  { id: 'cream', label: 'Кремовий', hex: '#e6dcc4', factor: 1.04 },
  { id: 'oak', label: 'Золотий дуб', hex: '#b9854a', factor: 1.22, wood: true },
  { id: 'walnut', label: 'Горіх', hex: '#6b4528', factor: 1.22, wood: true },
  { id: 'anthracite', label: 'Антрацит', hex: '#3a4048', factor: 1.3 },
  { id: 'black', label: 'Чорний', hex: '#16181c', factor: 1.35 },
];

export const FILLINGS: { id: FillingKind; label: string; add: number }[] = [
  { id: 'glass', label: 'Скло', add: 900 },
  { id: 'half', label: 'Скло + панель', add: 450 },
  { id: 'panel', label: 'Глуха панель', add: 0 },
];

export const HARDWARE: Record<SectionKind, number> = {
  fixed: 0,
  'turn-l': 950,
  'turn-r': 950,
  'tilt-turn-l': 1750,
  'tilt-turn-r': 1750,
  'door-l': 3900,
  'door-r': 3900,
  'slide-l': 2600,
  'slide-r': 2600,
};

export const ARCH_SURCHARGE = 0.28;
/** Додаткові комплектуючі, грн */
export const SILL_PER_M = 320;
export const EBB_PER_M = 170;
export const NET_EACH = 650;
export const MIN_AREA_M2 = 0.6;

export interface Config {
  product: ProductKind;
  layout: string;
  width: number;
  height: number;
  shape: ShapeKind;
  material: MaterialId;
  profile: ProfileId;
  glazing: GlazingId;
  coating: CoatingId;
  /** true — поворотно-відкидне (з провітрюванням), false — лише поворотне */
  ventilation: boolean;
  sill: boolean;
  ebb: boolean;
  net: boolean;
  lamination: LaminationId;
  color: ColorId;
  filling: FillingKind;
}

export function layoutOf(product: ProductKind, layoutId: string): LayoutDef {
  const def = PRODUCTS[product];
  return def.layouts.find((l) => l.id === layoutId) ?? def.layouts[0]!;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function snap(v: number, step: number): number {
  return Math.round(v / step) * step;
}

/** Найтиповіша конструкція для кожного виробу (індекс у layouts). */
const DEFAULT_LAYOUT: Record<ProductKind, number> = { window: 2, balcony: 1, entrance: 0, sliding: 0 };

export function defaultConfig(product: ProductKind = 'window'): Config {
  const def = PRODUCTS[product];
  const layout = def.layouts[DEFAULT_LAYOUT[product]] ?? def.layouts[0]!;
  return {
    product,
    layout: layout.id,
    width: layout.defWidth,
    height: def.height.def,
    shape: 'rect',
    material: 'pvc',
    profile: 'comfort',
    glazing: 'ch2',
    coating: 'clear',
    ventilation: true,
    sill: def.features.sill,
    ebb: def.features.ebb,
    net: false,
    lamination: 'none',
    color: 'white',
    filling: product === 'entrance' ? 'half' : 'glass',
  };
}

/** Секції з урахуванням вибору «з провітрюванням / без». */
export function resolveKind(kind: SectionKind, cfg: Pick<Config, 'product' | 'ventilation'>): SectionKind {
  if (!PRODUCTS[cfg.product].features.ventilation) return kind;
  const m = /^(?:tilt-)?turn-([lr])$/.exec(kind);
  if (!m) return kind;
  return `${cfg.ventilation ? 'tilt-turn' : 'turn'}-${m[1]}` as SectionKind;
}

export function effectiveSections(cfg: Config): SectionKind[] {
  return layoutOf(cfg.product, cfg.layout).sections.map((k) => resolveKind(k, cfg));
}

/** Кількість стулок, що відкриваються (на них ставимо москітні сітки). */
export function openableSashes(cfg: Config): number {
  return effectiveSections(cfg).filter((k) => k.startsWith('turn') || k.startsWith('tilt-turn')).length;
}

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

/** Приводить довільні дані до коректної конфігурації; null — якщо це не конфігурація. */
export function sanitizeConfig(input: unknown): Config | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  if (!isOneOf(PRODUCT_ORDER, raw.product)) return null;
  const product = raw.product;
  const def = PRODUCTS[product];
  const base = defaultConfig(product);

  const layout = layoutOf(product, typeof raw.layout === 'string' ? raw.layout : base.layout);
  const width = typeof raw.width === 'number' && Number.isFinite(raw.width) ? raw.width : layout.defWidth;
  const height = typeof raw.height === 'number' && Number.isFinite(raw.height) ? raw.height : def.height.def;
  const shape = isOneOf(def.shapes, raw.shape) ? raw.shape : 'rect';

  const material: MaterialId = raw.material === 'alu' ? 'alu' : 'pvc';
  const materialProfiles = PROFILES.filter((p) => p.material === material);
  const profile =
    materialProfiles.find((p) => p.id === raw.profile) ??
    materialProfiles.find((p) => p.id === MATERIALS.find((m) => m.id === material)!.defaultProfile)!;
  const glazing = profile.glazing.includes(raw.glazing as GlazingId)
    ? (raw.glazing as GlazingId)
    : profile.glazing.includes('ch2')
      ? 'ch2'
      : profile.glazing[0]!;
  const lamination = isOneOf(LAMINATIONS.map((l) => l.id), raw.lamination) ? raw.lamination : 'none';
  const color = lamination !== 'none' && isOneOf(COLORS.map((c) => c.id), raw.color) ? raw.color : 'white';
  const flag = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const f = def.features;

  return {
    product,
    layout: layout.id,
    width: snap(clamp(width, layout.minWidth, layout.maxWidth), 10),
    height: snap(clamp(height, def.height.min, def.height.max), def.height.step),
    shape,
    material,
    profile: profile.id,
    glazing,
    // i-покриття має сенс лише для склопакета, не для одинарного скла
    coating: isOneOf(COATINGS.map((c) => c.id), raw.coating) && !(glazing === 'pane' && raw.coating === 'energy') ? raw.coating : 'clear',
    ventilation: f.ventilation ? flag(raw.ventilation, true) : true,
    sill: f.sill ? flag(raw.sill, true) : false,
    ebb: f.ebb ? flag(raw.ebb, true) : false,
    net: f.net ? flag(raw.net, false) : false,
    lamination,
    color,
    filling: def.fillings && isOneOf(FILLINGS.map((x) => x.id), raw.filling) ? raw.filling : base.filling,
  };
}

export interface EstimateLine {
  label: string;
  amount: number;
}

export interface Estimate {
  total: number;
  area: number;
  lines: EstimateLine[];
}

export function estimate(cfg: Config): Estimate {
  const def = PRODUCTS[cfg.product];
  const profile = profileOf(cfg.profile);
  const material = MATERIALS.find((m) => m.id === profile.material)!;
  const color = COLORS.find((c) => c.id === cfg.color) ?? COLORS[0]!;
  const glazing = glazingOf(cfg.glazing);
  const coating = COATINGS.find((c) => c.id === cfg.coating) ?? COATINGS[0]!;
  const lamination = LAMINATIONS.find((l) => l.id === cfg.lamination) ?? LAMINATIONS[0]!;

  const W = cfg.width / 1000;
  const area = Math.max(MIN_AREA_M2, (cfg.width * cfg.height) / 1_000_000);
  const lines: EstimateLine[] = [];

  const base = area * def.baseM2 * profile.factor;
  lines.push({ label: `${material.id === 'alu' ? 'Алюміній' : 'ПВХ'} ${profile.label}, ${area.toFixed(2)} м²`, amount: base });

  if (cfg.shape === 'arch') lines.push({ label: 'Арочна форма', amount: base * ARCH_SURCHARGE });

  if (lamination.sides > 0 && color.factor > 1) {
    const word = material.id === 'alu' ? 'Фарбування' : 'Ламінація';
    const side = cfg.lamination === 'both' ? 'з двох боків' : cfg.lamination === 'outer' ? 'зовнішня' : 'внутрішня';
    lines.push({ label: `${word}: ${color.label.toLowerCase()}, ${side}`, amount: base * (color.factor - 1) * lamination.sides });
  }
  if (glazing.add !== 0) lines.push({ label: `Склопакет: ${glazing.label.toLowerCase()}`, amount: area * glazing.add });
  if (coating.add > 0) lines.push({ label: `Скло: ${coating.label.toLowerCase()}`, amount: area * coating.add });

  if (def.fillings) {
    const filling = FILLINGS.find((f) => f.id === cfg.filling) ?? FILLINGS[1]!;
    if (filling.add > 0) lines.push({ label: `Заповнення: ${filling.label.toLowerCase()}`, amount: area * filling.add });
  }

  const hardware = effectiveSections(cfg).reduce((sum, k) => sum + HARDWARE[k], 0);
  if (hardware > 0) {
    lines.push({ label: cfg.ventilation || !def.features.ventilation ? 'Фурнітура та ручки' : 'Фурнітура (поворотна) та ручки', amount: hardware });
  }

  if (def.features.sill && cfg.sill) lines.push({ label: 'Підвіконня', amount: (W + 0.1) * SILL_PER_M });
  if (def.features.ebb && cfg.ebb) lines.push({ label: 'Відлив', amount: (W + 0.06) * EBB_PER_M });
  if (def.features.net && cfg.net) {
    const n = openableSashes(cfg);
    if (n > 0) lines.push({ label: `Москітна сітка × ${n}`, amount: n * NET_EACH });
  }

  const total = Math.round(lines.reduce((sum, l) => sum + l.amount, 0) / 10) * 10;
  return { total, area, lines: lines.map((l) => ({ ...l, amount: Math.round(l.amount / 10) * 10 })) };
}

export function formatUah(n: number): string {
  return `${new Intl.NumberFormat('uk-UA').format(Math.round(n))}\u00a0₴`;
}

/** Короткий текстовий опис конфігурації для заявки та підсумку. */
export function describeConfig(cfg: Config): string {
  const def = PRODUCTS[cfg.product];
  const layout = layoutOf(cfg.product, cfg.layout);
  const profile = profileOf(cfg.profile);
  const color = COLORS.find((c) => c.id === cfg.color);
  const glazing = glazingOf(cfg.glazing);
  const coating = COATINGS.find((c) => c.id === cfg.coating);
  const operable = openableSashes(cfg) > 0;
  const lam =
    cfg.lamination === 'none'
      ? null
      : `${profile.material === 'alu' ? 'фарбування' : 'ламінація'} ${cfg.lamination === 'both' ? 'з двох боків' : cfg.lamination === 'outer' ? 'зовнішня' : 'внутрішня'}: ${color?.label.toLowerCase()}`;
  const parts = [
    `${def.name}, ${layout.label.toLowerCase()}`,
    `${cfg.width}×${cfg.height} мм`,
    cfg.shape === 'arch' ? 'арка' : null,
    `${profile.material === 'alu' ? 'алюміній' : 'ПВХ'} ${profile.label}`,
    `склопакет ${glazing.label.toLowerCase()}`,
    coating && coating.id !== 'clear' ? `скло ${coating.label.toLowerCase()}` : null,
    def.features.ventilation && operable ? (cfg.ventilation ? 'з провітрюванням' : 'без провітрювання') : null,
    def.features.sill ? (cfg.sill ? 'підвіконня' : 'без підвіконня') : null,
    def.features.ebb ? (cfg.ebb ? 'відлив' : 'без відливу') : null,
    def.features.net && cfg.net ? 'москітна сітка' : null,
    lam,
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Прайс-лист: допоміжні послуги й комплектуючі. */
export interface PriceRow {
  name: string;
  unit: string;
  price: string;
  note?: string;
}

export interface PriceGroup {
  id: string;
  title: string;
  rows: PriceRow[];
}

export function buildPriceList(): PriceGroup[] {
  const r10 = (n: number) => Math.round(n / 10) * 10;
  const m2 = (p: ProductKind, f = 1) => `від ${formatUah(r10(PRODUCTS[p].baseM2 * f))}`;
  const comfort = (p: ProductKind) => PRODUCTS[p].baseM2;
  return [
    {
      id: 'window',
      title: 'Вікна',
      rows: [
        { name: 'Вікно, профіль Standard 60', unit: 'м²', price: m2('window', 0.84), note: '3 камери, 2-камерний склопакет' },
        { name: 'Вікно, профіль Comfort 70', unit: 'м²', price: m2('window'), note: '5 камер — найпопулярніший вибір' },
        { name: 'Вікно, профіль Premium 82', unit: 'м²', price: m2('window', 1.28), note: '7 камер, до 3-камерного скла' },
        { name: 'Алюмінієве вікно, теплий профіль 65', unit: 'м²', price: m2('window', 1.75), note: 'Тонкі профілі, термоміст' },
        { name: 'Алюмінієве вікно, холодний профіль 45', unit: 'м²', price: m2('window', 1.3), note: 'Для веранд і літніх приміщень' },
        { name: 'Арочне вікно', unit: 'м²', price: `+${Math.round(ARCH_SURCHARGE * 100)}% до ціни`, note: 'Індивідуальний радіус' },
        { name: '3-камерний склопакет (44 мм)', unit: 'м²', price: `+${formatUah(GLAZINGS[3]!.add)}`, note: 'Доплата до 2-камерного' },
        { name: 'Ламінація профілю (дерево, антрацит)', unit: 'сторона', price: '+11–17% до ціни', note: 'Зовнішня, внутрішня або з двох боків' },
        { name: 'Поворотно-відкидна фурнітура', unit: 'стулка', price: formatUah(HARDWARE['tilt-turn-l']) },
        { name: 'Поворотна фурнітура', unit: 'стулка', price: formatUah(HARDWARE['turn-l']) },
      ],
    },
    {
      id: 'balcony',
      title: 'Балкони та лоджії',
      rows: [
        { name: 'Балконні двері, Comfort 70', unit: 'м²', price: m2('balcony') },
        { name: 'Балконний блок (двері + вікно)', unit: 'м²', price: m2('balcony'), note: 'Розраховується за загальною площею' },
        { name: 'Засклення лоджії, холодний профіль', unit: 'м²', price: `від ${formatUah(r10(comfort('window') * 0.62))}` },
      ],
    },
    {
      id: 'entrance',
      title: 'Двері та розсувні системи',
      rows: [
        { name: 'Вхідні двері, скло + панель', unit: 'м²', price: `від ${formatUah(PRODUCTS.entrance.baseM2 + 450)}` },
        { name: 'Вхідні двері, глуха панель', unit: 'м²', price: m2('entrance'), note: 'Із замком підвищеного класу' },
        { name: 'Розсувна система (портал)', unit: 'м²', price: m2('sliding'), note: 'Рейка, що не потребує порога' },
        { name: 'Замок і фурнітура вхідних дверей', unit: 'комплект', price: formatUah(HARDWARE['door-l']) },
      ],
    },
    {
      id: 'extra',
      title: 'Додатково та монтаж',
      rows: [
        { name: 'Підвіконня ПВХ', unit: 'пог. м', price: `від ${formatUah(SILL_PER_M)}` },
        { name: 'Відлив', unit: 'пог. м', price: `від ${formatUah(EBB_PER_M)}` },
        { name: 'Москітна сітка', unit: 'стулка', price: `від ${formatUah(NET_EACH)}` },
        { name: 'Демонтаж старого вікна', unit: 'шт.', price: 'від 450\u00a0₴' },
        { name: 'Монтаж із піною та стрічками', unit: 'пог. м', price: 'від 380\u00a0₴' },
        { name: 'Внутрішні та зовнішні відкоси', unit: 'пог. м', price: 'від 420\u00a0₴' },
        { name: 'Вивезення будівельного сміття', unit: 'виїзд', price: 'безкоштовно', note: 'При замовленні від 3 вікон' },
        { name: 'Виїзд майстра для заміру', unit: 'виїзд', price: 'безкоштовно' },
      ],
    },
  ];
}
