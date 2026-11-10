import {
  COATINGS,
  COLORS,
  FILLINGS,
  GLAZINGS,
  LAMINATIONS,
  MATERIALS,
  PRODUCTS,
  PRODUCT_ORDER,
  clamp,
  defaultConfig,
  describeConfig,
  effectiveSections,
  estimate,
  formatUah,
  glazingOf,
  layoutOf,
  openableSashes,
  profileOf,
  sanitizeConfig,
  PROFILES,
  type Config,
  type ProductKind,
} from '../../shared/catalog';
import { onConfigure, setAttached } from '../store';
import { scrollToId } from '../ui';
import type { ConfiguratorScene, OpenMode, ViewSide } from './scene';

const SHAPE_LABELS = { rect: 'Прямокутне', arch: 'Арка' } as const;

/** Схематичний перетин профілю й склопакета: видно камери, термоміст і шари скла. */
function sectionSvg(cfg: Config): string {
  const p = profileOf(cfg.profile);
  const g = glazingOf(cfg.glazing);
  const alu = p.material === 'alu';
  const k = 1.55; // px на мм
  const pw = Math.round(p.depth * k);
  const x0 = 10;
  const y0 = 8;
  const h = 56;

  const body = alu ? '#aab3bf' : '#eceff3';
  const chamberFill = alu ? '#58657b' : '#9aa7ba';
  const inner = pw - 10;
  const cw = (inner - (p.chambers - 1) * 3) / p.chambers;
  const chambers = Array.from({ length: p.chambers }, (_, i) =>
    `<rect x="${(x0 + 5 + i * (cw + 3)).toFixed(1)}" y="${y0 + 8}" width="${cw.toFixed(1)}" height="${h - 16}" rx="1.5" fill="${chamberFill}"/>`,
  ).join('');
  const thermal = alu && p.id !== 'alu-cold'
    ? `<rect x="${x0 + pw / 2 - 3}" y="${y0}" width="6" height="${h}" fill="#ff7a1a"/>`
    : '';

  const gx = x0 + pw + 18;
  const gk = 1.15;
  const paneW = 4;
  const total = Math.max(g.total * gk, paneW);
  const gap = g.panes > 1 ? (total - g.panes * paneW) / (g.panes - 1) : 0;
  const panes = Array.from({ length: g.panes }, (_, i) =>
    `<rect x="${(gx + i * (paneW + gap)).toFixed(1)}" y="${y0}" width="${paneW}" height="${h}" fill="#7fb6e0"/>`,
  ).join('');
  const spacers = g.panes > 1
    ? Array.from({ length: g.panes - 1 }, (_, i) => {
        const sx = gx + paneW + i * (paneW + gap);
        return `<rect x="${sx.toFixed(1)}" y="${y0}" width="${gap.toFixed(1)}" height="4" fill="#2b3038"/><rect x="${sx.toFixed(1)}" y="${y0 + h - 4}" width="${gap.toFixed(1)}" height="4" fill="#2b3038"/>`;
      }).join('')
    : '';

  const vw = Math.ceil(gx + total + 14);
  return `<svg class="section-svg" viewBox="0 0 ${vw} 84" style="width:${Math.round(vw * 1.9)}px" role="img" aria-label="Перетин профілю: ${p.chambers} камер, ${p.depth} мм; склопакет: ${g.label}">
    <rect x="${x0}" y="${y0}" width="${pw}" height="${h}" rx="3" fill="${body}"/>${chambers}${thermal}
    ${panes}${spacers}
    <text x="${x0}" y="78" fill="#a9b6cc" font-size="9" font-family="inherit">${p.depth} мм · ${p.chambers} кам.</text>
    <text x="${gx}" y="78" fill="#a9b6cc" font-size="9" font-family="inherit">${g.total} мм</text>
  </svg>`;
}

export function initConfigurator(): void {
  const root = document.querySelector<HTMLElement>('[data-configurator]');
  if (!root) return;

  let cfg: Config = defaultConfig('window');
  let mode: OpenMode = 'closed';
  let view: ViewSide = 'inside';
  let scene: ConfiguratorScene | null = null;
  let sceneState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';

  root.innerHTML = `
    <div class="cfg-stage" data-stage>
      <div class="cfg-canvas" data-canvas></div>
      <div class="cfg-dim" data-dim-w></div>
      <div class="cfg-dim" data-dim-h></div>
      <p class="cfg-hint" data-hint>Крутіть модель мишею, колесо — масштаб</p>
      <div class="seg cfg-view" data-views role="group" aria-label="Вид">
        <button type="button" data-view="inside" aria-pressed="true">Зсередини</button>
        <button type="button" data-view="outside" aria-pressed="false">Ззовні</button>
      </div>
      <div class="cfg-tools">
        <div class="seg" data-modes role="group" aria-label="Положення стулок"></div>
        <div class="seg"><button type="button" data-reset>Скинути вигляд</button></div>
      </div>
      <div class="cfg-fallback" data-fallback hidden>
        <p>3D-перегляд недоступний на цьому пристрої. Конструктор усе одно працює — параметри й розрахунок праворуч, а заявку можна надіслати з обраною конфігурацією.</p>
      </div>
    </div>
    <div class="cfg-panel" data-panel></div>`;

  const stage = root.querySelector<HTMLElement>('[data-stage]')!;
  const canvasHost = root.querySelector<HTMLElement>('[data-canvas]')!;
  const dimW = root.querySelector<HTMLElement>('[data-dim-w]')!;
  const dimH = root.querySelector<HTMLElement>('[data-dim-h]')!;
  const modesHost = root.querySelector<HTMLElement>('[data-modes]')!;
  const viewsHost = root.querySelector<HTMLElement>('[data-views]')!;
  const fallback = root.querySelector<HTMLElement>('[data-fallback]')!;
  const hint = root.querySelector<HTMLElement>('[data-hint]')!;
  const panel = root.querySelector<HTMLElement>('[data-panel]')!;

  if (window.matchMedia('(pointer: coarse)').matches) hint.textContent = 'Проведіть пальцем, щоб повернути модель';

  // ---------- Допоміжне ----------
  const chip = (label: string, attrs: string, pressed: boolean, disabled = false, title = '') =>
    `<button class="chip" type="button" ${attrs} aria-pressed="${pressed}"${disabled ? ' disabled' : ''}${title ? ` title="${title}"` : ''}>${label}</button>`;

  /** Перемикач «без / з» для окремої комплектуючої. */
  const toggle = (key: string, on: boolean, offLabel: string, onLabel: string) =>
    `<div class="chips" role="group">${chip(offLabel, `data-toggle="${key}" data-value="0"`, !on)}${chip(onLabel, `data-toggle="${key}" data-value="1"`, on)}</div>`;

  const sections = () => effectiveSections(cfg);
  const hasOperable = () => sections().some((s) => s !== 'fixed');
  const hasTilt = () => sections().some((s) => s.startsWith('tilt-turn'));
  const isSliding = () => cfg.product === 'sliding';

  const renderModes = () => {
    if (!hasOperable()) {
      modesHost.hidden = true;
      mode = 'closed';
      scene?.setMode(mode);
      return;
    }
    modesHost.hidden = false;
    if (mode === 'tilt' && !hasTilt()) mode = 'closed';
    const openLabel = isSliding() ? 'Відсунути' : cfg.product === 'entrance' ? 'Відчинити' : 'Відкрити';
    modesHost.innerHTML = `
      <button type="button" data-mode="closed" aria-pressed="${mode === 'closed'}">Закрито</button>
      <button type="button" data-mode="open" aria-pressed="${mode === 'open'}">${openLabel}</button>
      <button type="button" data-mode="tilt" aria-pressed="${mode === 'tilt'}" ${hasTilt() ? '' : 'hidden'}>Відкид</button>`;
    scene?.setMode(mode);
  };

  // ---------- Панель ----------
  function sizeBlock(): string {
    const def = PRODUCTS[cfg.product];
    const layout = layoutOf(cfg.product, cfg.layout);
    return `
      <div class="sizes">
        <div class="size"><label for="c-w">Ширина</label>
          <input id="c-w" type="range" data-size="width" min="${layout.minWidth}" max="${layout.maxWidth}" step="10" value="${cfg.width}" aria-label="Ширина, мм" />
          <input type="number" data-size-num="width" min="${layout.minWidth}" max="${layout.maxWidth}" step="10" value="${cfg.width}" aria-label="Ширина, мм" inputmode="numeric" /></div>
        <div class="size"><label for="c-h">Висота</label>
          <input id="c-h" type="range" data-size="height" min="${def.height.min}" max="${def.height.max}" step="${def.height.step}" value="${cfg.height}" aria-label="Висота, мм" />
          <input type="number" data-size-num="height" min="${def.height.min}" max="${def.height.max}" step="${def.height.step}" value="${cfg.height}" aria-label="Висота, мм" inputmode="numeric" /></div>
      </div>`;
  }

  function summaryBlock(): string {
    const est = estimate(cfg);
    return `
      <div class="summary" data-summary>
        <div class="summary-top"><small>Орієнтовна вартість</small><span class="price">${formatUah(est.total)}</span></div>
        <ul class="lines">${est.lines.map((l) => `<li><span>${l.label}</span><span>${l.amount < 0 ? '−' : ''}${formatUah(Math.abs(l.amount))}</span></li>`).join('')}</ul>
        <button class="btn btn-accent btn-block" type="button" data-attach>Додати до заявки</button>
        <p class="summary-note">Без монтажу та демонтажу. Точну суму зафіксуємо після безкоштовного заміру.</p>
      </div>`;
  }

  function renderPanel(): void {
    const def = PRODUCTS[cfg.product];
    const feat = def.features;
    const profile = profileOf(cfg.profile);
    const alu = profile.material === 'alu';
    const color = COLORS.find((c) => c.id === cfg.color);
    const glazing = glazingOf(cfg.glazing);
    const coating = COATINGS.find((c) => c.id === cfg.coating);
    const profiles = PROFILES.filter((p) => p.material === profile.material);
    const lamWord = alu ? 'Фарбування' : 'Ламінація';
    const lamLabels: Record<string, string> = alu
      ? { none: 'Без фарбування', outer: 'Зовнішнє', inner: 'Внутрішнє', both: 'З двох боків' }
      : { none: 'Без ламінації', outer: 'Зовнішня', inner: 'Внутрішня', both: 'З двох боків' };
    const lamOn = cfg.lamination !== 'none';
    const showExtras = feat.sill || feat.ebb || feat.net;

    panel.innerHTML = `
      <div class="opt"><h4>Виріб</h4><div class="chips" role="group" aria-label="Тип виробу">
        ${PRODUCT_ORDER.map((id) => chip(PRODUCTS[id].name, `data-product="${id}"`, id === cfg.product)).join('')}
      </div></div>

      <div class="opt"><h4>Конструкція</h4><div class="chips" role="group" aria-label="Конструкція">
        ${def.layouts.map((l) => chip(l.label, `data-layout="${l.id}"`, l.id === cfg.layout)).join('')}
      </div></div>

      <div class="opt"><h4>Розміри, мм</h4><div data-sizes>${sizeBlock()}</div></div>

      ${def.shapes.length > 1 ? `<div class="opt"><h4>Форма</h4><div class="chips" role="group" aria-label="Форма">
        ${def.shapes.map((s) => chip(SHAPE_LABELS[s], `data-shape="${s}"`, s === cfg.shape)).join('')}
      </div></div>` : ''}

      ${feat.ventilation && hasOperable() ? `<div class="opt"><h4>Відкривання <span>${cfg.ventilation ? 'поворотно-відкидне' : 'лише поворотне'}</span></h4>
        ${toggle('ventilation', cfg.ventilation, 'Без провітрювання', 'З провітруванням')}</div>` : ''}

      ${def.fillings ? `<div class="opt"><h4>Заповнення полотна</h4><div class="chips" role="group" aria-label="Заповнення">
        ${FILLINGS.map((f) => chip(f.label, `data-filling="${f.id}"`, f.id === cfg.filling)).join('')}
      </div></div>` : ''}

      <div class="opt"><h4>Матеріал профілю <span>${MATERIALS.find((m) => m.id === profile.material)?.note ?? ''}</span></h4><div class="chips" role="group" aria-label="Матеріал">
        ${MATERIALS.map((m) => chip(m.label, `data-material="${m.id}"`, m.id === profile.material)).join('')}
      </div></div>

      <div class="opt"><h4>Камерність і товщина профілю <span>${profile.note}</span></h4><div class="chips" role="group" aria-label="Профіль">
        ${profiles.map((p) => chip(`${p.label}`, `data-profile="${p.id}"`, p.id === cfg.profile, false, p.note)).join('')}
      </div></div>

      <div class="opt"><h4>Склопакет <span>${glazing.note}</span></h4><div class="chips" role="group" aria-label="Склопакет">
        ${GLAZINGS.map((g) => {
          const ok = profile.glazing.includes(g.id);
          return chip(g.label, `data-glazing="${g.id}"`, g.id === cfg.glazing, !ok, ok ? g.note : `Не вміщується в профіль ${profile.label}`);
        }).join('')}
      </div>
      <div class="section-wrap">${sectionSvg(cfg)}</div></div>

      <div class="opt"><h4>Тип скла <span>${coating?.note ?? ''}</span></h4><div class="chips" role="group" aria-label="Тип скла">
        ${COATINGS.map((c) => {
          const blocked = c.id === 'energy' && cfg.glazing === 'pane';
          return chip(c.label, `data-coating="${c.id}"`, c.id === cfg.coating, blocked, blocked ? 'i-покриття потребує склопакета' : c.note);
        }).join('')}
      </div></div>

      ${showExtras ? `<div class="opt"><h4>Комплектація</h4><div class="extras">
        ${feat.sill ? `<div class="extra"><span>Підвіконня</span>${toggle('sill', cfg.sill, 'Без', 'З підвіконням')}</div>` : ''}
        ${feat.ebb ? `<div class="extra"><span>Відлив</span>${toggle('ebb', cfg.ebb, 'Без', 'З відливом')}</div>` : ''}
        ${feat.net ? `<div class="extra"><span>Москітна сітка</span>${toggle('net', cfg.net, 'Без', openableSashes(cfg) > 1 ? 'На стулки' : 'З сіткою')}</div>` : ''}
      </div></div>` : ''}

      <div class="opt"><h4>${lamWord} профілю</h4><div class="chips" role="group" aria-label="${lamWord}">
        ${LAMINATIONS.map((l) => chip(lamLabels[l.id] ?? l.id, `data-lamination="${l.id}"`, l.id === cfg.lamination)).join('')}
      </div></div>

      <div class="opt ${lamOn ? '' : 'dim'}"><h4>Колір <span>${lamOn ? (color?.label ?? '') : 'оберіть колір — з’явиться покриття'}</span></h4><div class="swatches" role="group" aria-label="Колір профілю">
        ${COLORS.map((c) => `<button class="swatch" type="button" style="--c:${c.hex}" data-color="${c.id}" aria-pressed="${lamOn && c.id === cfg.color}" aria-label="${c.label}" title="${c.label}"></button>`).join('')}
      </div></div>

      <div data-summary-host>${summaryBlock()}</div>`;
    renderModes();
  }

  /** Легке оновлення без перемальовування елементів керування (щоб не збивати фокус на повзунках). */
  function refreshLight(): void {
    const host = panel.querySelector<HTMLElement>('[data-summary-host]');
    if (host) host.innerHTML = summaryBlock();
    panel.querySelectorAll<HTMLInputElement>('[data-size-num]').forEach((el) => {
      const key = el.dataset.sizeNum as 'width' | 'height';
      if (document.activeElement !== el) el.value = String(cfg[key]);
    });
    panel.querySelectorAll<HTMLInputElement>('[data-size]').forEach((el) => {
      el.value = String(cfg[el.dataset.size as 'width' | 'height']);
    });
  }

  function apply(light = false): void {
    if (light) refreshLight();
    else {
      cfg = sanitizeConfig(cfg) ?? cfg;
      renderPanel();
    }
    scene?.update(cfg);
  }

  // ---------- Зміни стану ----------
  function setProduct(p: ProductKind): void {
    const next = defaultConfig(p);
    cfg = {
      ...next,
      material: cfg.material,
      profile: cfg.profile,
      glazing: cfg.glazing,
      coating: cfg.coating,
      ventilation: cfg.ventilation,
      lamination: cfg.lamination,
      color: cfg.color,
    };
    mode = 'closed';
    apply();
  }

  function setLayout(id: string): void {
    const layout = layoutOf(cfg.product, id);
    const inRange = cfg.width >= layout.minWidth && cfg.width <= layout.maxWidth;
    cfg = { ...cfg, layout: layout.id, width: inRange ? cfg.width : layout.defWidth };
    apply();
  }

  function setMaterial(m: Config['material']): void {
    const def = MATERIALS.find((x) => x.id === m)!;
    cfg = { ...cfg, material: m, profile: def.defaultProfile };
    apply();
  }

  function setSize(key: 'width' | 'height', raw: number, light: boolean): void {
    if (!Number.isFinite(raw)) return;
    const def = PRODUCTS[cfg.product];
    const layout = layoutOf(cfg.product, cfg.layout);
    const [min, max] = key === 'width' ? [layout.minWidth, layout.maxWidth] : [def.height.min, def.height.max];
    cfg = { ...cfg, [key]: Math.round(clamp(raw, min, max) / 10) * 10 };
    apply(light);
  }

  panel.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!t || t.hasAttribute('disabled')) return;
    const d = t.dataset;
    if (d.product) setProduct(d.product as ProductKind);
    else if (d.layout) setLayout(d.layout);
    else if (d.material) setMaterial(d.material as Config['material']);
    else if (d.shape) { cfg = { ...cfg, shape: d.shape as Config['shape'] }; apply(); }
    else if (d.filling) { cfg = { ...cfg, filling: d.filling as Config['filling'] }; apply(); }
    else if (d.profile) { cfg = { ...cfg, profile: d.profile as Config['profile'] }; apply(); }
    else if (d.glazing) { cfg = { ...cfg, glazing: d.glazing as Config['glazing'] }; apply(); }
    else if (d.coating) { cfg = { ...cfg, coating: d.coating as Config['coating'] }; apply(); }
    else if (d.toggle) { cfg = { ...cfg, [d.toggle]: d.value === '1' }; apply(); }
    else if (d.lamination) {
      const lamination = d.lamination as Config['lamination'];
      // Увімкнули покриття, а колір ще білий — одразу пропонуємо видимий результат
      const color = lamination !== 'none' && cfg.color === 'white' ? 'anthracite' : cfg.color;
      cfg = { ...cfg, lamination, color };
      apply();
    } else if (d.color) {
      const color = d.color as Config['color'];
      // Вибір кольору без ламінації вмикає ламінацію з двох боків; білий = без ламінації
      const lamination = color === 'white' ? 'none' : cfg.lamination === 'none' ? 'both' : cfg.lamination;
      cfg = { ...cfg, color, lamination };
      apply();
    } else if (d.attach !== undefined) {
      setAttached(cfg);
      scrollToId('order');
    }
  });

  panel.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.size) setSize(t.dataset.size as 'width' | 'height', Number(t.value), true);
    else if (t.dataset.sizeNum) {
      const v = Number(t.value);
      const key = t.dataset.sizeNum as 'width' | 'height';
      const def = PRODUCTS[cfg.product];
      const layout = layoutOf(cfg.product, cfg.layout);
      const [min, max] = key === 'width' ? [layout.minWidth, layout.maxWidth] : [def.height.min, def.height.max];
      // Поки користувач друкує, оновлюємо лише коли значення вже в допустимому діапазоні
      if (v >= min && v <= max) setSize(key, v, true);
    }
  });
  panel.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.sizeNum) {
      setSize(t.dataset.sizeNum as 'width' | 'height', Number(t.value), true);
      t.value = String(cfg[t.dataset.sizeNum as 'width' | 'height']);
    }
  });

  modesHost.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mode]');
    if (!b) return;
    mode = b.dataset.mode as OpenMode;
    modesHost.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    scene?.setMode(mode);
  });
  viewsHost.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-view]');
    if (!b) return;
    view = b.dataset.view as ViewSide;
    viewsHost.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    scene?.setView(view);
  });
  root.querySelector('[data-reset]')?.addEventListener('click', () => scene?.resetView());

  onConfigure((p) => setProduct(p));

  // ---------- Лінивий запуск 3D ----------
  async function loadScene(): Promise<void> {
    if (sceneState !== 'idle') return;
    sceneState = 'loading';
    try {
      const mod = await import('./scene');
      if (!mod.ConfiguratorScene.supported()) throw new Error('webgl');
      scene = new mod.ConfiguratorScene(canvasHost, dimW, dimH);
      sceneState = 'ready';
      scene.setMode(mode);
      scene.setView(view);
      scene.update(cfg);
      stage.classList.add('ready');
    } catch (err) {
      console.warn('3D недоступний:', err);
      sceneState = 'failed';
      fallback.hidden = false;
      hint.hidden = true;
      viewsHost.hidden = true;
      dimW.hidden = dimH.hidden = true;
      modesHost.hidden = true;
    }
  }

  renderPanel();
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void loadScene();
        }
      },
      { rootMargin: '700px 0px' },
    );
    io.observe(root);
  } else {
    void loadScene();
  }

  // Корисно для налагодження та автотестів
  (window as unknown as { __cfg?: () => string }).__cfg = () => describeConfig(cfg);
}
