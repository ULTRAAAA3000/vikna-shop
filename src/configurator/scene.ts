import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  COLORS,
  PRODUCTS,
  effectiveSections,
  glazingOf,
  layoutOf,
  profileOf,
  type CoatingId,
  type ColorDef,
  type Config,
  type FillingKind,
  type SectionKind,
} from '../../shared/catalog';

export type OpenMode = 'closed' | 'open' | 'tilt';
/** Звідки дивимось: із кімнати або з вулиці. */
export type ViewSide = 'inside' | 'outside';

/**
 * Усі розміри в сцені — у метрах.
 * Вісь +Z дивиться в кімнату (глядач «зсередини»), -Z — на вулицю.
 */

// ---------- Геометричні допоміжні функції ----------

function archCircle(w: number, h: number) {
  const rise = Math.min(w * 0.33, h * 0.35);
  const R = (w * w) / 4 / rise / 2 + rise / 2; // (w²/4 + rise²) / (2·rise)
  return { rise, R, cy: h - R };
}

/** Зовнішній контур виробу: прямокутник або сегментна арка. Початок координат — центр низу. */
function outline(w: number, h: number, arch: boolean): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w / 2;
  s.moveTo(-hw, 0);
  s.lineTo(hw, 0);
  if (!arch) {
    s.lineTo(hw, h);
    s.lineTo(-hw, h);
  } else {
    const { rise, R, cy } = archCircle(w, h);
    const ys = h - rise;
    const th = Math.atan2(ys - cy, hw);
    s.lineTo(hw, ys);
    s.absarc(0, cy, R, th, Math.PI - th, false);
  }
  s.closePath();
  return s;
}

/** Внутрішній отвір рами (контур зміщено всередину на f). */
function innerHole(w: number, h: number, f: number, arch: boolean): THREE.Path {
  const p = new THREE.Path();
  const hw = w / 2 - f;
  p.moveTo(-hw, f);
  p.lineTo(hw, f);
  if (!arch) {
    p.lineTo(hw, h - f);
    p.lineTo(-hw, h - f);
  } else {
    const { R, cy } = archCircle(w, h);
    const Ri = R - f;
    const ysi = cy + Math.sqrt(Math.max(0, Ri * Ri - hw * hw));
    const th = Math.atan2(ysi - cy, hw);
    p.lineTo(hw, ysi);
    p.absarc(0, cy, Ri, th, Math.PI - th, false);
  }
  p.closePath();
  return p;
}

/**
 * Видавлює контур по Z (центр у 0).
 * sided=true розбиває торці на дві групи: 0 — вулиця (-Z), 1 — кімната (+Z), 2 — бічні грані,
 * щоб профіль міг мати різний колір із двох боків.
 */
function extrude(shape: THREE.Shape, depth: number, sided = false): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 40 });
  g.translate(0, 0, -depth / 2);
  if (sided) {
    const [lids, ...rest] = g.groups;
    if (lids) {
      const half = lids.count / 2; // спочатку нижня кришка (z=0 → вулиця), потім верхня
      g.clearGroups();
      g.addGroup(lids.start, half, 0);
      g.addGroup(lids.start + half, half, 1);
      rest.forEach((r) => g.addGroup(r.start, r.count, 2));
    }
  }
  return g;
}

/** Прямокутна рамка з центром в (0,0): зовнішній розмір w×h, товщина профілю t. */
function rectFrameGeometry(w: number, h: number, t: number, depth: number, sided = false): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(w / 2, -h / 2);
  s.lineTo(w / 2, h / 2);
  s.lineTo(-w / 2, h / 2);
  s.closePath();
  const hole = new THREE.Path();
  const iw = Math.max(0.01, w / 2 - t);
  const ih = Math.max(0.01, h / 2 - t);
  hole.moveTo(-iw, -ih);
  hole.lineTo(iw, -ih);
  hole.lineTo(iw, ih);
  hole.lineTo(-iw, ih);
  hole.closePath();
  s.holes.push(hole);
  return extrude(s, depth, sided);
}

// ---------- Процедурні текстури ----------

function woodTexture(base: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 170; i++) {
    const x = Math.random() * 256;
    const w = Math.random() * 2.6 + 0.4;
    const dark = Math.random() < 0.6;
    g.fillStyle = dark ? `rgba(30,12,0,${Math.random() * 0.16})` : `rgba(255,228,180,${Math.random() * 0.12})`;
    g.fillRect(x, 0, w, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(1.4, 1.4);
  t.anisotropy = 4;
  return t;
}

function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#6fa9dc');
  sky.addColorStop(0.55, '#cfe7f7');
  sky.addColorStop(0.72, '#f1ead8');
  sky.addColorStop(1, '#f1ead8');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);
  const sun = g.createRadialGradient(760, 150, 4, 760, 150, 140);
  sun.addColorStop(0, 'rgba(255,250,220,1)');
  sun.addColorStop(1, 'rgba(255,250,220,0)');
  g.fillStyle = sun;
  g.fillRect(560, 0, 400, 360);
  const hill = (y: number, amp: number, color: string, seed: number) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, 512);
    for (let x = 0; x <= 1024; x += 16) {
      g.lineTo(x, y + Math.sin(x / 140 + seed) * amp + Math.sin(x / 57 + seed * 2) * amp * 0.35);
    }
    g.lineTo(1024, 512);
    g.fill();
  };
  hill(340, 22, '#8fb6a0', 1);
  hill(390, 20, '#5f9477', 3);
  hill(440, 14, '#3f7a5b', 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Дрібна сітка для москітної сітки (прозорий фон, тонкі лінії). */
function netTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 32, 32);
  g.fillStyle = 'rgba(70,78,90,0.85)';
  g.fillRect(0, 0, 32, 2.2);
  g.fillRect(0, 0, 2.2, 32);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------- Вигляд скла ----------

const GLASS_LOOK: Record<CoatingId, { color: string; opacity: number; roughness: number }> = {
  clear: { color: '#d7ebf7', opacity: 0.28, roughness: 0.04 },
  energy: { color: '#c3e6d2', opacity: 0.36, roughness: 0.05 },
  matte: { color: '#eef3f5', opacity: 0.8, roughness: 0.6 },
  tinted: { color: '#8da3ae', opacity: 0.5, roughness: 0.04 },
};

interface Anim {
  A: THREE.Group;
  B: THREE.Group;
  baseX: number;
  hingeLeft: boolean;
  isSlide: boolean;
  dir: number;
  travel: number;
  door: boolean;
  canTilt: boolean;
}

interface DimInfo {
  W: number;
  H: number;
  y0: number;
}

export class ConfiguratorScene {
  static supported(): boolean {
    try {
      const c = document.createElement('canvas');
      return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  }

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 80);
  private controls: OrbitControls;
  private sun!: THREE.DirectionalLight;
  private last = performance.now();
  private product = new THREE.Group();
  private dims = new THREE.Group();
  private extras: THREE.Mesh[] = [];
  private builtRoom = { halfW: 0, roomH: 0 };
  private world!: { floor: THREE.Mesh; back: THREE.Mesh; left: THREE.Mesh; right: THREE.Mesh; ceiling: THREE.Mesh; ground: THREE.Mesh; sky: THREE.Mesh };
  private anims: Anim[] = [];
  private indicatorNodes: THREE.Object3D[] = [];
  private mode: OpenMode = 'closed';
  private view: ViewSide = 'inside';
  private showLines = false;
  private cfg: Config | null = null;
  private dimInfo: DimInfo | null = null;
  private lastKey = '';
  private fit = 3;
  private visible = true;
  private dirty = true;
  private size = { w: 1, h: 1 };
  private finishes = new Map<string, THREE.MeshStandardMaterial>();
  private glassMats = new Map<CoatingId, THREE.MeshStandardMaterial>();
  private metal = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.95, roughness: 0.28 });
  private spacer = new THREE.MeshStandardMaterial({ color: '#2b3038', roughness: 0.6 });
  private sillMat = new THREE.MeshStandardMaterial({ color: '#f2f2ef', roughness: 0.45 });
  private netFrameMat = new THREE.MeshStandardMaterial({ color: '#d6d9dd', roughness: 0.6 });
  private netMat: THREE.MeshStandardMaterial;
  private labelW: HTMLElement;
  private labelH: HTMLElement;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private disposed = false;

  constructor(private container: HTMLElement, labelW: HTMLElement, labelH: HTMLElement) {
    this.labelW = labelW;
    this.labelH = labelH;

    const small = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.75;
    this.scene.background = new THREE.Color('#223250');

    this.netMat = new THREE.MeshStandardMaterial({
      map: netTexture(),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 1,
    });

    this.buildStaticWorld(small);
    this.scene.add(this.product, this.dims);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 1.05;
    this.controls.maxPolarAngle = 1.75;
    this.controls.rotateSpeed = 0.7;
    this.controls.zoomSpeed = 0.8;
    this.applyViewLimits();
    // Колесо миші, клавіатура й дотики самі викликають controls.update() і «з'їдають» прапорець
    // зміни, тому покладатися лише на його значення в кадрі не можна: слухаємо подію change.
    this.controls.addEventListener('change', () => {
      this.dirty = true;
    });

    // Якщо браузер скинув WebGL-контекст (важке навантаження) — відновлюємо картинку, а не «зависаємо»
    const canvas = this.renderer.domElement;
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    canvas.addEventListener('webglcontextrestored', () => {
      this.dirty = true;
    });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.io = new IntersectionObserver(([e]) => {
      this.visible = Boolean(e?.isIntersecting);
    });
    this.io.observe(container);
    this.resize();

    this.renderer.setAnimationLoop(this.tick);
  }

  // ---------- Публічне API ----------

  update(cfg: Config): void {
    this.cfg = cfg;
    this.dirty = true;
    this.rebuild(cfg);
    const key = `${cfg.product}|${cfg.layout}|${cfg.shape}`;
    const changed = key !== this.lastKey;
    this.lastKey = key;
    this.frameCamera(cfg, changed);
  }

  setMode(mode: OpenMode): void {
    this.mode = mode;
    this.dirty = true;
  }

  /** Схематичні лінії відкривання на склі: за замовчуванням вимкнені. */
  setLines(on: boolean): void {
    this.showLines = on;
    this.dirty = true;
  }

  setView(view: ViewSide): void {
    if (view === this.view) return;
    this.view = view;
    this.sun.position.z = view === 'inside' ? 6 : -6;
    this.applyViewLimits();
    this.buildDims();
    if (this.cfg) this.frameCamera(this.cfg, true);
    this.dirty = true;
  }

  resetView(): void {
    if (this.cfg) this.frameCamera(this.cfg, true);
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    this.io.disconnect();
    this.controls.dispose();
    this.clearGroup(this.product);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------- Сцена ----------

  private buildStaticWorld(small: boolean): void {
    this.sun = new THREE.DirectionalLight('#fff4e0', 2.1);
    this.sun.position.set(3.5, 6, 6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    this.sun.shadow.camera.left = -5;
    this.sun.shadow.camera.right = 5;
    this.sun.shadow.camera.top = 5;
    this.sun.shadow.camera.bottom = -3;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 20;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, new THREE.HemisphereLight('#dbe9ff', '#8a7f70', 0.5));

    // Кімната: підлога, бокові та задня стіни
    const roomMat = new THREE.MeshStandardMaterial({ color: '#d3ccbf', roughness: 1, side: THREE.DoubleSide });
    const floorIn = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshStandardMaterial({ color: '#b4a690', roughness: 0.8 }));
    floorIn.rotation.x = -Math.PI / 2;
    floorIn.position.set(0, 0, 4.1);
    floorIn.receiveShadow = true;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), roomMat);
    back.position.set(0, 3, 8.1);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), roomMat);
    left.rotation.y = Math.PI / 2;
    left.position.set(-8, 3, 4.1);
    const right = left.clone();
    right.position.x = 8;

    // Вулиця: трава та небо
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshStandardMaterial({ color: '#7fa57a', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.001, -20.1);
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 48),
      new THREE.MeshBasicMaterial({ map: skyTexture(), toneMapped: false, fog: false }),
    );
    sky.position.set(0, 8.5, -38);
    // Стеля, щоб над стіною не просвічувало небо; розмір і висоту задає fitWorld
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#a9b2c0', roughness: 1 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.receiveShadow = true;
    this.scene.add(floorIn, back, left, right, ceiling, ground, sky);
    this.world = { floor: floorIn, back, left, right, ceiling, ground, sky };
  }

  /** Відстань, на якій виріб повністю вміщується в кадр (залежить від пропорцій екрана). */
  private fitOf(cfg: Config): number {
    const W = cfg.width / 1000;
    const H = cfg.height / 1000;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const aspect = this.size.w / this.size.h;
    return Math.max((H * 0.5 * 1.4) / tan, (W * 0.5 * 1.4) / (tan * aspect)) + 0.5;
  }

  /**
   * Розміри кімнати з запасом на максимальне віддалення камери: для широких виробів і вузьких
   * екранів камера відʼїжджає далеко, і вона має лишатися всередині кімнати (під стелею).
   */
  private worldDims(cfg: Config): { dist: number; halfW: number; depth: number; roomH: number } {
    const H = cfg.height / 1000;
    const y0 = cfg.product === 'window' ? 0.9 : 0;
    const dist = this.fitOf(cfg) * 1.7;
    const halfW = Math.max(8, dist * 1.1);
    const depth = Math.max(8, dist * 1.15);
    const roomH = Math.max(2.8, y0 + H + 0.55, 0.52 * dist + y0 + H / 2 + 0.3);
    return { dist, halfW, depth, roomH };
  }

  private fitWorld(d: { dist: number; halfW: number; depth: number; roomH: number }): void {
    const { floor, back, left, right, ceiling, ground, sky } = this.world;
    const { dist, halfW, depth, roomH } = d;
    floor.scale.set(halfW / 8, depth / 8, 1);
    floor.position.set(0, 0, 0.1 + depth / 2);
    back.scale.set(halfW / 8, roomH / 6, 1);
    back.position.set(0, roomH / 2, 0.1 + depth);
    for (const [wall, x] of [[left, -halfW], [right, halfW]] as const) {
      wall.scale.set(depth / 8, roomH / 6, 1);
      wall.position.set(x, roomH / 2, 0.1 + depth / 2);
    }
    ceiling.scale.set(halfW * 2, depth, 1);
    ceiling.position.set(0, roomH, depth / 2 - 0.1);
    const k = Math.max(1, dist / 20);
    ground.scale.set(k, k, 1);
    ground.position.set(0, -0.001, -(0.1 + 20 * k));
    sky.scale.set(k, k, 1);
    sky.position.set(0, 8.5 * k, -38 * k);
    this.camera.far = Math.max(80, 38 * k + dist + 40);
    this.camera.updateProjectionMatrix();
  }

  private applyViewLimits(): void {
    if (this.view === 'inside') {
      this.controls.minAzimuthAngle = -1.05;
      this.controls.maxAzimuthAngle = 1.05;
    } else {
      this.controls.minAzimuthAngle = Math.PI - 1.05;
      this.controls.maxAzimuthAngle = Math.PI + 1.05;
    }
  }

  /** Оздоблення профілю. color=null — базове (білий ПВХ або сирий алюміній). */
  private finish(alu: boolean, color: ColorDef | null): THREE.MeshStandardMaterial {
    const key = `${alu ? 'a' : 'p'}:${color?.id ?? 'base'}`;
    let m = this.finishes.get(key);
    if (!m) {
      if (!color) {
        m = alu
          ? new THREE.MeshStandardMaterial({ color: '#bcc2ca', metalness: 0.78, roughness: 0.36 })
          : new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.5 });
      } else if (color.wood) {
        m = new THREE.MeshStandardMaterial({ color: '#ffffff', map: woodTexture(color.hex), roughness: 0.62 });
      } else {
        m = new THREE.MeshStandardMaterial({ color: color.hex, roughness: alu ? 0.42 : 0.5, metalness: alu ? 0.3 : 0 });
      }
      this.finishes.set(key, m);
    }
    return m;
  }

  private glassMaterial(id: CoatingId): THREE.MeshStandardMaterial {
    let m = this.glassMats.get(id);
    if (!m) {
      const look = GLASS_LOOK[id];
      m = new THREE.MeshStandardMaterial({
        color: look.color,
        transparent: true,
        opacity: look.opacity,
        roughness: look.roughness,
        metalness: 0,
        envMapIntensity: 1.8,
        depthWrite: false,
      });
      this.glassMats.set(id, m);
    }
    return m;
  }

  private clearGroup(g: THREE.Object3D): void {
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    g.clear();
  }

  private rebuild(cfg: Config): void {
    this.clearGroup(this.product);
    this.indicatorNodes = [];
    for (const e of this.extras) {
      this.scene.remove(e);
      e.geometry.dispose();
    }
    this.extras = [];
    this.anims = [];

    const def = PRODUCTS[cfg.product];
    const layout = layoutOf(cfg.product, cfg.layout);
    const sections = effectiveSections(cfg);
    const profile = profileOf(cfg.profile);
    const alu = profile.material === 'alu';
    const glazing = glazingOf(cfg.glazing);
    const color = COLORS.find((c) => c.id === cfg.color) ?? COLORS[0]!;

    // Матеріали профілю: вулиця / кімната / бічні грані — ламінація залежить від сторони
    const base = this.finish(alu, null);
    const laminated = (side: 'outer' | 'inner') => cfg.lamination === 'both' || cfg.lamination === side;
    const ext = laminated('outer') ? this.finish(alu, color) : base;
    const int = laminated('inner') ? this.finish(alu, color) : base;
    const core = cfg.lamination === 'both' ? ext : base;
    const profMats: THREE.Material[] = [ext, int, core];
    // BoxGeometry: +x, -x, +y, -y, +z (кімната), -z (вулиця)
    const boxMats: THREE.Material[] = [core, core, core, core, int, ext];
    const glassMat = this.glassMaterial(cfg.coating);

    const W = cfg.width / 1000;
    const H = cfg.height / 1000;
    const d = profile.depth / 1000;
    const arch = cfg.shape === 'arch' && cfg.product === 'window';
    const sliding = cfg.product === 'sliding';
    const f = profile.face + (cfg.product === 'entrance' ? 0.012 : sliding ? -0.006 : 0);
    const y0 = cfg.product === 'window' ? 0.9 : 0;
    const filling: FillingKind = cfg.product === 'entrance' ? cfg.filling : 'glass';

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], parent: THREE.Object3D, x = 0, y = 0, z = 0, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = shadow;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const box = (w: number, h: number, dd: number) => new THREE.BoxGeometry(w, h, dd);

    this.product.position.set(0, y0, 0);
    this.dims.position.set(0, y0, 0);

    // --- Зовнішня рама
    const outer = outline(W, H, arch);
    outer.holes.push(innerHole(W, H, f, arch));
    add(extrude(outer, d, true), profMats, this.product);

    const iw = W - 2 * f;
    const zoneBottom = f;
    let zoneTop = H - f;

    // Скло: 1–4 листи з повітряними проміжками; між ними — дистанційна рамка
    const paneT = 0.004;
    const total = glazing.total / 1000;
    const gap = glazing.panes > 1 ? (total - glazing.panes * paneT) / (glazing.panes - 1) : 0;
    const paneZ = (i: number) => -total / 2 + paneT / 2 + i * (paneT + gap);

    const glazingBox = (parent: THREE.Object3D, w: number, h: number, y = 0) => {
      for (let i = 0; i < glazing.panes; i++) {
        add(box(w, h, paneT), glassMat, parent, 0, y, paneZ(i), false).renderOrder = 2;
      }
      if (glazing.panes > 1) {
        add(rectFrameGeometry(w + 0.004, h + 0.004, 0.016, total - 0.002), this.spacer, parent, 0, y, 0, false);
      }
    };

    // --- Арка: імпост на рівні п'яти арки і верхнє фіксоване скло
    if (arch) {
      const { rise, R, cy } = archCircle(W, H);
      const ys = H - rise;
      zoneTop = ys - f / 2;
      add(box(iw, f, d * 0.9), boxMats, this.product, 0, ys, 0);

      const Ri = R - f;
      const hwI = W / 2 - f;
      const yb = ys + f / 2;
      const ysi = cy + Math.sqrt(Math.max(0, Ri * Ri - hwI * hwI));
      const s = new THREE.Shape();
      if (yb >= ysi) {
        const xr = Math.sqrt(Math.max(0.0001, Ri * Ri - (yb - cy) ** 2));
        const th = Math.atan2(yb - cy, xr);
        s.moveTo(-xr, yb);
        s.lineTo(xr, yb);
        s.absarc(0, cy, Ri - 0.004, th, Math.PI - th, false);
      } else {
        const th = Math.atan2(ysi - cy, hwI);
        s.moveTo(-hwI, yb);
        s.lineTo(hwI, yb);
        s.lineTo(hwI, ysi);
        s.absarc(0, cy, Ri - 0.004, th, Math.PI - th, false);
      }
      s.closePath();
      for (let i = 0; i < glazing.panes; i++) {
        add(extrude(s, paneT), glassMat, this.product, 0, 0, paneZ(i), false).renderOrder = 2;
      }
    }

    const hz = Math.max(0.15, zoneTop - zoneBottom);

    // --- Секції
    interface Cell {
      x0: number;
      x1: number;
      kind: SectionKind;
      lane: number;
    }
    const cells: Cell[] = [];
    const n = layout.sections.length;
    let travelFactor = 0.9;

    if (sliding) {
      const ov = 0.045;
      const leafW = (iw + (n - 1) * ov) / n;
      const step = leafW - ov;
      sections.forEach((kind, i) => {
        cells.push({ x0: -iw / 2 + i * step, x1: -iw / 2 + i * step + leafW, kind, lane: i % 2 === 0 ? -1 : 1 });
      });
      travelFactor = n === 3 ? 0.45 : 0.9;
    } else {
      const m = f * 0.85;
      const avail = iw - m * (n - 1);
      const ratios = layout.ratios ?? Array.from({ length: n }, () => 1 / n);
      let x = -iw / 2;
      sections.forEach((kind, i) => {
        const sw = avail * (ratios[i] ?? 1 / n);
        cells.push({ x0: x, x1: x + sw, kind, lane: 0 });
        x += sw;
        if (i < n - 1) {
          add(box(m, hz, d * 0.9), boxMats, this.product, x + m / 2, zoneBottom + hz / 2, 0);
          x += m;
        }
      });
    }

    const makeFill = (parent: THREE.Object3D, w: number, h: number, mode: FillingKind) => {
      const panelBox = (pw: number, ph: number, py: number) => {
        add(box(pw, ph, 0.036), boxMats, parent, 0, py, 0);
        if (ph > 0.35 && pw > 0.3) add(box(pw * 0.72, ph * 0.72, 0.01), boxMats, parent, 0, py, 0.02);
      };
      if (mode === 'glass') glazingBox(parent, w, h);
      else if (mode === 'panel') panelBox(w, h, 0);
      else {
        const low = h * 0.42;
        panelBox(w, low, -h / 2 + low / 2);
        glazingBox(parent, w, h - low, h / 2 - (h - low) / 2);
      }
    };

    const handleGroup = (leafParent: THREE.Object3D, lw: number, lh: number, fs: number, ds: number, hingeLeft: boolean, door: boolean) => {
      const g = new THREE.Group();
      const x = (hingeLeft ? 1 : -1) * (lw / 2 - fs / 2);
      const yLocal = door ? THREE.MathUtils.clamp(1.0 - f - lh / 2 - 0.03, -lh / 2 + 0.3, lh / 2 - 0.3) : 0;
      g.position.set(x, yLocal, ds / 2 + 0.006);
      if (door) {
        add(box(0.022, 0.34, 0.024), this.metal, g, 0, 0, 0.012);
        add(box(0.03, 0.08, 0.008), this.metal, g, 0, 0.17, 0);
        add(box(0.03, 0.08, 0.008), this.metal, g, 0, -0.17, 0);
        // така сама ручка із зовнішнього боку: дзеркально по осі z на тому самому місці
        const outer = g.clone();
        outer.position.z = -g.position.z;
        outer.rotation.y = Math.PI;
        leafParent.add(outer);
      } else {
        add(box(0.036, 0.034, 0.01), this.metal, g, 0, 0.045, 0);
        add(box(0.016, 0.12, 0.016), this.metal, g, 0, -0.012, 0.008);
      }
      leafParent.add(g);
    };

    const indicator = (leaf: THREE.Object3D, lw: number, lh: number, fs: number, hingeLeft: boolean, withTilt: boolean) => {
      const ix = lw / 2 - fs - 0.03;
      const iy = lh / 2 - fs - 0.03;
      const hx = hingeLeft ? -ix : ix;
      const fx = -hx;
      const turn = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(fx, iy, 0), new THREE.Vector3(hx, 0, 0),
        new THREE.Vector3(fx, -iy, 0), new THREE.Vector3(hx, 0, 0),
      ]);
      const lineMat = new THREE.LineBasicMaterial({ color: '#33445c', transparent: true, opacity: 0.55 });
      const turnLines = new THREE.LineSegments(turn, lineMat);
      turnLines.position.z = 0.02;
      leaf.add(turnLines);
      if (withTilt) {
        const tilt = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-ix, iy, 0), new THREE.Vector3(0, -iy, 0),
          new THREE.Vector3(ix, iy, 0), new THREE.Vector3(0, -iy, 0),
        ]);
        const dashed = new THREE.LineSegments(tilt, new THREE.LineDashedMaterial({ color: '#33445c', transparent: true, opacity: 0.55, dashSize: 0.035, gapSize: 0.03 }));
        dashed.computeLineDistances();
        dashed.position.z = 0.02;
        leaf.add(dashed);
      }
    };

    /** Москітна сітка з боку вулиці: нерухома, не відкривається разом зі стулкою. */
    const addNet = (cx: number, sw: number) => {
      const w = sw - 0.012;
      const h = hz - 0.012;
      const geo = new THREE.PlaneGeometry(w, h);
      const cell = 0.014;
      const uv = geo.attributes.uv!;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / cell, (uv.getY(i) * h) / cell);
      const z = -d / 2 - 0.012;
      add(geo, this.netMat, this.product, cx, zoneBottom + hz / 2, z, false).renderOrder = 3;
      add(rectFrameGeometry(w + 0.006, h + 0.006, 0.018, 0.014), this.netFrameMat, this.product, cx, zoneBottom + hz / 2, z, false);
    };

    cells.forEach((cell) => {
      const sw = cell.x1 - cell.x0;
      const cx = (cell.x0 + cell.x1) / 2;
      const kind = cell.kind;
      const laneZ = cell.lane * 0.026;
      const door = kind === 'door-l' || kind === 'door-r';
      const slide = kind === 'slide-l' || kind === 'slide-r';
      const isLeaf = kind !== 'fixed' || sliding;
      const fs = door ? f * 1.05 : sliding ? f * 0.95 : f * 0.85;
      const ds = sliding ? Math.min(0.04, d * 0.8) : door ? Math.min(d, 0.07) : d * 0.82;
      const gapS = 0.004;

      if (!isLeaf) {
        // Глуха секція: тонкі штапики та скло/панель безпосередньо в рамі
        add(rectFrameGeometry(sw - 0.004, hz - 0.004, 0.026, Math.min(0.045, d * 0.8), true), profMats, this.product, cx, zoneBottom + hz / 2, 0);
        const holder = new THREE.Group();
        holder.position.set(cx, zoneBottom + hz / 2, 0);
        this.product.add(holder);
        makeFill(holder, sw - 0.012, hz - 0.012, filling);
        return;
      }

      const lw = sw - 2 * gapS;
      const lh = hz - 2 * gapS;
      const hingeLeft = kind.endsWith('-l');
      const A = new THREE.Group();
      const B = new THREE.Group();
      const leaf = new THREE.Group();
      let baseX: number;
      if (slide || (sliding && kind === 'fixed')) {
        baseX = cx;
        A.position.set(cx, zoneBottom + gapS, laneZ);
      } else {
        baseX = hingeLeft ? cell.x0 + gapS : cell.x1 - gapS;
        A.position.set(baseX, zoneBottom + gapS, laneZ);
        B.position.x = hingeLeft ? lw / 2 : -lw / 2;
      }
      leaf.position.y = lh / 2;
      B.add(leaf);
      A.add(B);
      this.product.add(A);

      add(rectFrameGeometry(lw, lh, fs, ds, true), profMats, leaf);
      const holder = new THREE.Group();
      leaf.add(holder);
      const leafFill: FillingKind = door || (cfg.product === 'entrance' && kind === 'fixed') ? filling : 'glass';
      makeFill(holder, lw - 2 * fs + 0.012, lh - 2 * fs + 0.012, leafFill);

      const operable = kind !== 'fixed';
      if (operable && !slide) handleGroup(leaf, lw, lh, fs, ds, hingeLeft, door);
      if (operable && slide) handleGroup(leaf, lw, lh, fs, ds, kind !== 'slide-l', false);

      const isTurn = kind.startsWith('turn') || kind.startsWith('tilt-turn');
      if (isTurn) {
        const holderInd = new THREE.Group();
        leaf.add(holderInd);
        indicator(holderInd, lw, lh, fs, hingeLeft, kind.startsWith('tilt-turn'));
        // схематичні знаки відкривання видно лише при закритій стулці
        this.indicatorNodes.push(holderInd);
        if (def.features.net && cfg.net) addNet(cx, sw);
      }

      if (operable) {
        this.anims.push({
          A,
          B,
          baseX,
          hingeLeft,
          isSlide: slide,
          dir: kind === 'slide-l' ? -1 : 1,
          travel: sw * travelFactor,
          door,
          canTilt: kind.startsWith('tilt-turn'),
        });
      }
    });

    // --- Стіна з отвором (кімната) та фасадна «шкірка» (вулиця)
    const room = this.worldDims(cfg);
    this.builtRoom = { halfW: room.halfW, roomH: room.roomH };
    const wallW = Math.max(W + 2.4, room.halfW * 2 + 4);
    const wallTop = room.roomH;
    const facadeTop = Math.max(Math.max(2.8, y0 + H + 0.55) + 6, room.roomH + 1);
    const wallShape = (top: number, width: number) => {
      const s = new THREE.Shape();
      s.moveTo(-width / 2, -0.4);
      s.lineTo(width / 2, -0.4);
      s.lineTo(width / 2, top);
      s.lineTo(-width / 2, top);
      s.closePath();
      const hole = outline(W + 0.008, H + 0.008, arch);
      s.holes.push(new THREE.Path(hole.getPoints(48).map((p) => new THREE.Vector2(p.x, p.y + y0 - 0.004))));
      return s;
    };

    const wall = new THREE.Mesh(extrude(wallShape(wallTop, wallW), 0.22), new THREE.MeshStandardMaterial({ color: '#8d97a8', roughness: 0.95 }));
    wall.receiveShadow = true;
    wall.castShadow = true;
    const facade = new THREE.Mesh(
      extrude(wallShape(facadeTop, wallW + 12), 0.03),
      new THREE.MeshStandardMaterial({ color: '#cdbfa9', roughness: 1 }),
    );
    facade.position.z = -0.125;
    facade.receiveShadow = true;
    facade.castShadow = true;

    this.extras.push(wall, facade);
    this.scene.add(wall, facade);

    // --- Підвіконня (кімната) і відлив (вулиця)
    if (def.features.sill && cfg.sill) {
      add(box(W + 0.16, 0.032, 0.24), this.sillMat, this.product, 0, -0.016, 0.12);
    }
    if (def.features.ebb && cfg.ebb) {
      const ebb = add(box(W + 0.08, 0.012, 0.15), ext, this.product, 0, -0.016, -0.105);
      ebb.rotation.x = -0.1;
    }

    this.dimInfo = { W, H, y0 };
    this.buildDims();
    this.labelW.textContent = `${cfg.width} мм`;
    this.labelH.textContent = `${cfg.height} мм`;
  }

  /** Розмірні лінії розташовуємо з того боку, з якого дивимось. */
  private buildDims(): void {
    this.clearGroup(this.dims);
    if (!this.dimInfo) return;
    const { W, H } = this.dimInfo;
    const lineMat = new THREE.LineBasicMaterial({ color: '#ff7a1a' });
    const zD = this.view === 'inside' ? 0.14 : -0.2;
    const top = H + 0.1;
    const left = -W / 2 - 0.12;
    const pts: THREE.Vector3[] = [
      new THREE.Vector3(-W / 2, top, zD), new THREE.Vector3(W / 2, top, zD),
      new THREE.Vector3(-W / 2, top - 0.04, zD), new THREE.Vector3(-W / 2, top + 0.04, zD),
      new THREE.Vector3(W / 2, top - 0.04, zD), new THREE.Vector3(W / 2, top + 0.04, zD),
      new THREE.Vector3(left, 0, zD), new THREE.Vector3(left, H, zD),
      new THREE.Vector3(left - 0.04, 0, zD), new THREE.Vector3(left + 0.04, 0, zD),
      new THREE.Vector3(left - 0.04, H, zD), new THREE.Vector3(left + 0.04, H, zD),
    ];
    this.dims.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    this.dims.userData = { top, left, zD };
  }

  // ---------- Камера ----------

  private frameCamera(cfg: Config, reset: boolean): void {
    const W = cfg.width / 1000;
    const H = cfg.height / 1000;
    const y0 = cfg.product === 'window' ? 0.9 : 0;
    const side = this.view === 'inside' ? 1 : -1;
    const target = new THREE.Vector3(0, y0 + H / 2, 0);
    const fit = this.fitOf(cfg);

    if (reset || !this.cfg) {
      const dir = new THREE.Vector3(0.34 * side, 0.1, side).normalize();
      this.camera.position.copy(target).addScaledVector(dir, fit);
    } else {
      const offset = this.camera.position.clone().sub(this.controls.target);
      offset.multiplyScalar(fit / this.fit);
      this.camera.position.copy(target).add(offset);
    }
    this.fit = fit;
    this.controls.target.copy(target);
    this.controls.minDistance = fit * 0.45;
    this.controls.maxDistance = fit * 1.7;
    const room = this.worldDims(cfg);
    this.fitWorld(room);
    // Після зміни пропорцій екрана стіна має бути не меншою за кімнату
    if (room.halfW > this.builtRoom.halfW + 0.01 || room.roomH > this.builtRoom.roomH + 0.01) {
      this.rebuild(cfg);
      this.dirty = true;
    }
    // Камера не має опускатися під підлогу/землю, коли відʼїжджає далеко
    const floorCos = THREE.MathUtils.clamp((0.2 - target.y) / this.controls.maxDistance, -1, 1);
    this.controls.maxPolarAngle = Math.min(1.75, Math.acos(floorCos));
    this.controls.update();
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.size = { w, h };
    this.dirty = true;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.cfg) this.frameCamera(this.cfg, false);
  }

  // ---------- Цикл ----------

  private proj = new THREE.Vector3();

  private place(el: HTMLElement, x: number, y: number, z: number): void {
    this.proj.set(x, y, z).project(this.camera);
    const px = (this.proj.x * 0.5 + 0.5) * this.size.w;
    const py = (-this.proj.y * 0.5 + 0.5) * this.size.h;
    el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%)`;
    el.style.opacity = this.proj.z < 1 ? '1' : '0';
  }

  private tick = (): void => {
    if (this.disposed || !this.visible || document.hidden) {
      this.last = performance.now();
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const k = 1 - Math.exp(-dt * 8);

    let moving = false;
    for (const a of this.anims) {
      let ty = 0;
      let tx = 0;
      let tt = 0;
      if (this.mode === 'open') {
        if (a.isSlide) tx = a.dir * a.travel;
        else ty = (a.hingeLeft ? -1 : 1) * (a.door ? 1.3 : 1.12);
      } else if (this.mode === 'tilt' && a.canTilt) {
        tt = -0.2;
      }
      a.A.rotation.y += (ty - a.A.rotation.y) * k;
      a.A.position.x += (a.baseX + tx - a.A.position.x) * k;
      a.B.rotation.x += (tt - a.B.rotation.x) * k;
      if (
        Math.abs(ty - a.A.rotation.y) > 0.0005 ||
        Math.abs(a.baseX + tx - a.A.position.x) > 0.0005 ||
        Math.abs(tt - a.B.rotation.x) > 0.0005
      ) {
        moving = true;
      }
    }

    const showIndicators = this.showLines && this.mode === 'closed' && this.view === 'inside';
    for (const n of this.indicatorNodes) n.visible = showIndicators;

    // Рендеримо лише коли щось змінилося: камера, анімація стулок або параметри
    const cameraMoved = this.controls.update();
    if (!(cameraMoved || moving || this.dirty)) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);

    const info = this.dims.userData as { top?: number; left?: number; zD?: number };
    if (this.dimInfo && typeof info.top === 'number' && typeof info.left === 'number' && typeof info.zD === 'number') {
      const { H, y0 } = this.dimInfo;
      this.place(this.labelW, 0, y0 + info.top + 0.02, info.zD);
      this.place(this.labelH, info.left - 0.02, y0 + H / 2, info.zD);
    }
  };
}
