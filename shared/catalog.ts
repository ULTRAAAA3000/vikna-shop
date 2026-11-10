/**
 * Каталог продукції, опції конструктора та розрахунок вартості.
 * Модуль спільний для фронтенду (конструктор, прайс) і воркера (перерахунок
 * ціни із заявки), тому не використовує жодних DOM/Workers API.
 * Усі ціни — демонстраційні, у гривнях.
 */

export type ProductKind = 'window' | 'balcony' | 'entrance' | 'sliding';
export type ShapeKind = 'rect' | 'arch';
export type FillingKind = 'glass' | 'half' | 'panel';
export type ProfileId = 'standard' | 'comfort' | 'premium';
export type ColorId = 'white' | 'cream' | 'oak' | 'walnut' | 'anthracite' | 'black';
export type GlassId = 'double' | 'triple' | 'energy' | 'matte';

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
}

export const PRODUCTS: Record<ProductKind, ProductDef> = {
  window: {
    id: 'window',
    name: 'Вікно',
    baseM2: 3400,
    height: { min: 400, max: 2400, step: 10, def: 1400 },
    shapes: ['rect', 'arch'],
    fillings: false,
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
    layouts: [
      { id: 'two', label: '2 стулки', sections: ['fixed', 'slide-l'], minWidth: 1400, maxWidth: 3600, defWidth: 2400 },
      { id: 'three', label: '3 стулки', sections: ['slide-r', 'fixed', 'slide-l'], minWidth: 2100, maxWidth: 4800, defWidth: 3300 },
      { id: 'four', label: '4 стулки', sections: ['fixed', 'slide-l', 'slide-r', 'fixed'], minWidth: 2800, maxWidth: 5600, defWidth: 4000 },
    ],
  },
};

export const PRODUCT_ORDER: ProductKind[] = ['window', 'balcony', 'entrance', 'sliding'];

export interface ProfileDef {
  id: ProfileId;
  label: string;
  chambers: number;
  depth: number;
  factor: number;
  note: string;
}

export const PROFILES: ProfileDef[] = [
  { id: 'standard', label: 'Standard 60', chambers: 3, depth: 60, factor: 0.84, note: '3 камери · 60 мм' },
  { id: 'comfort', label: 'Comfort 70', chambers: 5, depth: 70, factor: 1, note: '5 камер · 70 мм' },
  { id: 'premium', label: 'Premium 82', chambers: 7, depth: 82, factor: 1.28, note: '7 камер · 82 мм' },
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

export interface GlassDef {
  id: GlassId;
  label: string;
  add: number;
  note: string;
}

export const GLASS: GlassDef[] = [
  { id: 'double', label: '2-камерний', add: 0, note: 'Базовий склопакет 32 мм' },
  { id: 'triple', label: '3-камерний', add: 520, note: 'Тепліший, 44 мм' },
  { id: 'energy', label: 'Енергозберігаючий', add: 880, note: 'i-скло з покриттям' },
  { id: 'matte', label: 'Матовий', add: 740, note: 'Для санвузлів і приватності' },
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
export const MIN_AREA_M2 = 0.6;

export interface Config {
  product: ProductKind;
  layout: string;
  width: number;
  height: number;
  shape: ShapeKind;
  profile: ProfileId;
  color: ColorId;
  glass: GlassId;
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
    profile: 'comfort',
    color: 'white',
    glass: 'double',
    filling: product === 'entrance' ? 'half' : 'glass',
  };
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

  return {
    product,
    layout: layout.id,
    width: snap(clamp(width, layout.minWidth, layout.maxWidth), 10),
    height: snap(clamp(height, def.height.min, def.height.max), def.height.step),
    shape,
    profile: isOneOf(PROFILES.map((p) => p.id), raw.profile) ? raw.profile : base.profile,
    color: isOneOf(COLORS.map((c) => c.id), raw.color) ? raw.color : base.color,
    glass: isOneOf(GLASS.map((g) => g.id), raw.glass) ? raw.glass : base.glass,
    filling: def.fillings && isOneOf(FILLINGS.map((f) => f.id), raw.filling) ? raw.filling : base.filling,
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
  const layout = layoutOf(cfg.product, cfg.layout);
  const profile = PROFILES.find((p) => p.id === cfg.profile) ?? PROFILES[1]!;
  const color = COLORS.find((c) => c.id === cfg.color) ?? COLORS[0]!;
  const glass = GLASS.find((g) => g.id === cfg.glass) ?? GLASS[0]!;

  const area = Math.max(MIN_AREA_M2, (cfg.width * cfg.height) / 1_000_000);
  const lines: EstimateLine[] = [];

  const base = area * def.baseM2 * profile.factor;
  lines.push({ label: `Конструкція, ${area.toFixed(2)} м² · ${profile.label}`, amount: base });

  if (cfg.shape === 'arch') {
    lines.push({ label: 'Арочна форма', amount: base * ARCH_SURCHARGE });
  }
  if (color.factor > 1) {
    lines.push({ label: `Ламінація: ${color.label.toLowerCase()}`, amount: base * (color.factor - 1) });
  }
  if (glass.add > 0) {
    lines.push({ label: `Скло: ${glass.label.toLowerCase()}`, amount: area * glass.add });
  }
  if (def.fillings) {
    const filling = FILLINGS.find((f) => f.id === cfg.filling) ?? FILLINGS[1]!;
    if (filling.add > 0) lines.push({ label: `Заповнення: ${filling.label.toLowerCase()}`, amount: area * filling.add });
  }
  const hardware = layout.sections.reduce((sum, s) => sum + HARDWARE[s], 0);
  if (hardware > 0) lines.push({ label: 'Фурнітура та ручки', amount: hardware });

  const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) / 10) * 10;
  return { total, area, lines: lines.map((l) => ({ ...l, amount: Math.round(l.amount / 10) * 10 })) };
}

export function formatUah(n: number): string {
  return `${new Intl.NumberFormat('uk-UA').format(Math.round(n))}\u00a0₴`;
}

/** Короткий текстовий опис конфігурації для заявки та підсумку. */
export function describeConfig(cfg: Config): string {
  const def = PRODUCTS[cfg.product];
  const layout = layoutOf(cfg.product, cfg.layout);
  const profile = PROFILES.find((p) => p.id === cfg.profile);
  const color = COLORS.find((c) => c.id === cfg.color);
  const glass = GLASS.find((g) => g.id === cfg.glass);
  const parts = [
    `${def.name}, ${layout.label.toLowerCase()}`,
    `${cfg.width}×${cfg.height} мм`,
    cfg.shape === 'arch' ? 'арка' : null,
    profile?.label,
    color?.label.toLowerCase(),
    glass ? `скло ${glass.label.toLowerCase()}` : null,
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
        { name: 'Арочне вікно', unit: 'м²', price: `+${Math.round(ARCH_SURCHARGE * 100)}% до ціни`, note: 'Індивідуальний радіус' },
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
        { name: 'Підвіконня ПВХ', unit: 'пог. м', price: 'від 260\u00a0₴' },
        { name: 'Відлив', unit: 'пог. м', price: 'від 140\u00a0₴' },
        { name: 'Москітна сітка', unit: 'шт.', price: 'від 650\u00a0₴' },
        { name: 'Демонтаж старого вікна', unit: 'шт.', price: 'від 450\u00a0₴' },
        { name: 'Монтаж із піною та стрічками', unit: 'пог. м', price: 'від 380\u00a0₴' },
        { name: 'Внутрішні та зовнішні відкоси', unit: 'пог. м', price: 'від 420\u00a0₴' },
        { name: 'Вивезення будівельного сміття', unit: 'виїзд', price: 'безкоштовно', note: 'При замовленні від 3 вікон' },
        { name: 'Виїзд майстра для заміру', unit: 'виїзд', price: 'безкоштовно' },
      ],
    },
  ];
}
