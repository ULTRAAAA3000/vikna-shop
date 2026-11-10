import {
  COLORS,
  FILLINGS,
  GLASS,
  PRODUCTS,
  PRODUCT_ORDER,
  PROFILES,
  clamp,
  defaultConfig,
  describeConfig,
  estimate,
  formatUah,
  layoutOf,
  type Config,
  type ProductKind,
} from '../../shared/catalog';
import { onConfigure, setAttached } from '../store';
import { scrollToId } from '../ui';
import type { ConfiguratorScene, OpenMode } from './scene';

const SHAPE_LABELS = { rect: 'Прямокутне', arch: 'Арка' } as const;

export function initConfigurator(): void {
  const root = document.querySelector<HTMLElement>('[data-configurator]');
  if (!root) return;

  let cfg: Config = defaultConfig('window');
  let mode: OpenMode = 'closed';
  let scene: ConfiguratorScene | null = null;
  let sceneState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';

  root.innerHTML = `
    <div class="cfg-stage" data-stage>
      <div class="cfg-canvas" data-canvas></div>
      <div class="cfg-dim" data-dim-w></div>
      <div class="cfg-dim" data-dim-h></div>
      <p class="cfg-hint" data-hint>Крутіть модель мишею, колесо — масштаб</p>
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
  const fallback = root.querySelector<HTMLElement>('[data-fallback]')!;
  const hint = root.querySelector<HTMLElement>('[data-hint]')!;
  const panel = root.querySelector<HTMLElement>('[data-panel]')!;

  if (window.matchMedia('(pointer: coarse)').matches) hint.textContent = 'Проведіть пальцем, щоб повернути модель';

  // ---------- Допоміжне ----------
  const chip = (label: string, attrs: string, pressed: boolean, disabled = false) =>
    `<button class="chip" type="button" ${attrs} aria-pressed="${pressed}"${disabled ? ' disabled' : ''}>${label}</button>`;

  const hasOperable = () => layoutOf(cfg.product, cfg.layout).sections.some((s) => s !== 'fixed');
  const hasTilt = () => layoutOf(cfg.product, cfg.layout).sections.some((s) => s.startsWith('tilt-turn'));
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
        <ul class="lines">${est.lines.map((l) => `<li><span>${l.label}</span><span>${formatUah(l.amount)}</span></li>`).join('')}</ul>
        <button class="btn btn-accent btn-block" type="button" data-attach>Додати до заявки</button>
        <p class="summary-note">Без монтажу й додаткових комплектуючих. Точну суму зафіксуємо після безкоштовного заміру.</p>
      </div>`;
  }

  function renderPanel(): void {
    const def = PRODUCTS[cfg.product];
    const profile = PROFILES.find((p) => p.id === cfg.profile);
    const color = COLORS.find((c) => c.id === cfg.color);
    const glass = GLASS.find((g) => g.id === cfg.glass);

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

      ${def.fillings ? `<div class="opt"><h4>Заповнення полотна</h4><div class="chips" role="group" aria-label="Заповнення">
        ${FILLINGS.map((f) => chip(f.label, `data-filling="${f.id}"`, f.id === cfg.filling)).join('')}
      </div></div>` : ''}

      <div class="opt"><h4>Профіль <span>${profile?.note ?? ''}</span></h4><div class="chips" role="group" aria-label="Профіль">
        ${PROFILES.map((p) => chip(p.label, `data-profile="${p.id}"`, p.id === cfg.profile)).join('')}
      </div></div>

      <div class="opt"><h4>Колір <span>${color?.label ?? ''}</span></h4><div class="swatches" role="group" aria-label="Колір профілю">
        ${COLORS.map((c) => `<button class="swatch" type="button" style="--c:${c.hex}" data-color="${c.id}" aria-pressed="${c.id === cfg.color}" aria-label="${c.label}" title="${c.label}"></button>`).join('')}
      </div></div>

      <div class="opt"><h4>Скло <span>${glass?.note ?? ''}</span></h4><div class="chips" role="group" aria-label="Скло">
        ${GLASS.map((g) => chip(g.label, `data-glass="${g.id}"`, g.id === cfg.glass)).join('')}
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
    else renderPanel();
    scene?.update(cfg);
  }

  // ---------- Зміни стану ----------
  function setProduct(p: ProductKind): void {
    const next = defaultConfig(p);
    cfg = { ...next, profile: cfg.profile, color: cfg.color, glass: cfg.glass };
    mode = 'closed';
    apply();
  }

  function setLayout(id: string): void {
    const layout = layoutOf(cfg.product, id);
    const inRange = cfg.width >= layout.minWidth && cfg.width <= layout.maxWidth;
    cfg = { ...cfg, layout: layout.id, width: inRange ? cfg.width : layout.defWidth };
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
    else if (d.shape) { cfg = { ...cfg, shape: d.shape as Config['shape'] }; apply(); }
    else if (d.filling) { cfg = { ...cfg, filling: d.filling as Config['filling'] }; apply(); }
    else if (d.profile) { cfg = { ...cfg, profile: d.profile as Config['profile'] }; apply(); }
    else if (d.color) { cfg = { ...cfg, color: d.color as Config['color'] }; apply(); }
    else if (d.glass) { cfg = { ...cfg, glass: d.glass as Config['glass'] }; apply(); }
    else if (d.attach !== undefined) {
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
      scene.update(cfg);
      stage.classList.add('ready');
    } catch (err) {
      console.warn('3D недоступний:', err);
      sceneState = 'failed';
      fallback.hidden = false;
      hint.hidden = true;
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
