import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { COLORS, PROFILES, layoutOf, type ColorDef, type Config, type FillingKind, type GlassId, type SectionKind } from '../../shared/catalog';

export type OpenMode = 'closed' | 'open' | 'tilt';

/** Усі розміри в сцені — у метрах. Вісь +Z дивиться на глядача (кімната), -Z — вулиця. */

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

function extrude(shape: THREE.Shape, depth: number): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 40 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Прямокутна рамка з центром в (0,0): зовнішній розмір w×h, товщина профілю t. */
function rectFrameGeometry(w: number, h: number, t: number, depth: number): THREE.ExtrudeGeometry {
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
  return extrude(s, depth);
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

// ---------- Матеріали скла ----------

const GLASS_LOOK: Record<GlassId, { color: string; opacity: number; roughness: number }> = {
  double: { color: '#d7ebf7', opacity: 0.3, roughness: 0.04 },
  triple: { color: '#cfe4f4', opacity: 0.38, roughness: 0.04 },
  energy: { color: '#c9e6d6', opacity: 0.4, roughness: 0.05 },
  matte: { color: '#eef3f5', opacity: 0.88, roughness: 0.6 },
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
  private last = performance.now();
  private product = new THREE.Group();
  private wall: THREE.Mesh | null = null;
  private ceiling: THREE.Mesh | null = null;
  private anims: Anim[] = [];
  private indicatorNodes: THREE.Object3D[] = [];
  private dims = new THREE.Group();
  private mode: OpenMode = 'closed';
  private cfg: Config | null = null;
  private lastKey = '';
  private fit = 3;
  private visible = true;
  private dirty = true;
  private size = { w: 1, h: 1 };
  private frameMats = new Map<string, THREE.MeshStandardMaterial>();
  private glassMats = new Map<GlassId, THREE.MeshPhysicalMaterial>();
  private metal = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.95, roughness: 0.28 });
  private dark = new THREE.MeshStandardMaterial({ color: '#2a2f36', roughness: 0.7 });
  private sillMat = new THREE.MeshStandardMaterial({ color: '#f2f2ef', roughness: 0.45 });
  private labelW: HTMLElement;
  private labelH: HTMLElement;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private disposed = false;

  constructor(private container: HTMLElement, labelW: HTMLElement, labelH: HTMLElement) {
    this.labelW = labelW;
    this.labelH = labelH;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    const small = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
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

    this.buildStaticWorld();
    this.scene.add(this.product, this.dims);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 1.05;
    this.controls.maxPolarAngle = 1.75;
    this.controls.minAzimuthAngle = -1.05;
    this.controls.maxAzimuthAngle = 1.05;
    this.controls.rotateSpeed = 0.7;

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

  private buildStaticWorld(): void {
    const small = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
    const sun = new THREE.DirectionalLight('#fff4e0', 2.1);
    sun.position.set(3.5, 6, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    sun.shadow.camera.left = -5;
    sun.shadow.camera.right = 5;
    sun.shadow.camera.top = 5;
    sun.shadow.camera.bottom = -3;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 20;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun, new THREE.HemisphereLight('#dbe9ff', '#8a7f70', 0.5));

    // Кімната: підлога
    const floorIn = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshStandardMaterial({ color: '#b4a690', roughness: 0.8 }));
    floorIn.rotation.x = -Math.PI / 2;
    floorIn.position.set(0, 0, 4.1);
    floorIn.receiveShadow = true;
    // Вулиця: трава та небо
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshStandardMaterial({ color: '#7fa57a', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.001, -20.1);
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 48),
      new THREE.MeshBasicMaterial({ map: skyTexture(), toneMapped: false, fog: false }),
    );
    sky.position.set(0, 8.5, -38);
    this.scene.add(floorIn, ground, sky);
  }

  private frameMaterial(color: ColorDef): THREE.MeshStandardMaterial {
    let m = this.frameMats.get(color.id);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: color.wood ? '#ffffff' : color.hex,
        map: color.wood ? woodTexture(color.hex) : null,
        roughness: color.wood ? 0.62 : 0.5,
        metalness: 0,
      });
      this.frameMats.set(color.id, m);
    }
    return m;
  }

  private glassMaterial(id: GlassId): THREE.MeshPhysicalMaterial {
    let m = this.glassMats.get(id);
    if (!m) {
      const look = GLASS_LOOK[id];
      m = new THREE.MeshPhysicalMaterial({
        color: look.color,
        transparent: true,
        opacity: look.opacity,
        roughness: look.roughness,
        metalness: 0,
        envMapIntensity: 1.6,
        depthWrite: false,
        clearcoat: 0.6,
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
    this.clearGroup(this.dims);
    if (this.wall) {
      this.scene.remove(this.wall);
      this.wall.geometry.dispose();
      this.wall = null;
    }
    if (this.ceiling) {
      this.scene.remove(this.ceiling);
      this.ceiling.geometry.dispose();
      this.ceiling = null;
    }
    this.anims = [];

    const layout = layoutOf(cfg.product, cfg.layout);
    const color = COLORS.find((c) => c.id === cfg.color) ?? COLORS[0]!;
    const profile = PROFILES.find((p) => p.id === cfg.profile) ?? PROFILES[1]!;
    const frameMat = this.frameMaterial(color);
    const glassMat = this.glassMaterial(cfg.glass);

    const W = cfg.width / 1000;
    const H = cfg.height / 1000;
    const d = profile.depth / 1000;
    const arch = cfg.shape === 'arch' && cfg.product === 'window';
    const sliding = cfg.product === 'sliding';
    const f = cfg.product === 'entrance' ? 0.08 : sliding ? 0.062 : 0.068;
    const y0 = cfg.product === 'window' ? 0.9 : 0;
    const filling: FillingKind = cfg.product === 'entrance' ? cfg.filling : 'glass';

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = shadow;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const box = (w: number, h: number, dd: number) => new THREE.BoxGeometry(w, h, dd);

    this.product.position.set(0, y0, 0);
    this.dims.position.copy(this.product.position);

    // --- Зовнішня рама
    const outer = outline(W, H, arch);
    outer.holes.push(innerHole(W, H, f, arch));
    add(extrude(outer, d), frameMat, this.product);

    const iw = W - 2 * f;
    const zoneBottom = f;
    let zoneTop = H - f;

    // --- Арка: імпост на рівні п'яти арки і верхнє фіксоване скло
    if (arch) {
      const { rise, R, cy } = archCircle(W, H);
      const ys = H - rise;
      zoneTop = ys - f / 2;
      add(box(iw, f, d * 0.9), frameMat, this.product, 0, ys, 0);

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
      add(extrude(s, 0.022), glassMat, this.product, 0, 0, 0, false).renderOrder = 2;
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
      layout.sections.forEach((kind, i) => {
        cells.push({ x0: -iw / 2 + i * step, x1: -iw / 2 + i * step + leafW, kind, lane: i % 2 === 0 ? -1 : 1 });
      });
      travelFactor = n === 3 ? 0.45 : 0.9;
    } else {
      const m = f * 0.85;
      const avail = iw - m * (n - 1);
      const ratios = layout.ratios ?? Array.from({ length: n }, () => 1 / n);
      let x = -iw / 2;
      layout.sections.forEach((kind, i) => {
        const sw = avail * (ratios[i] ?? 1 / n);
        cells.push({ x0: x, x1: x + sw, kind, lane: 0 });
        x += sw;
        if (i < n - 1) {
          add(box(m, hz, d * 0.9), frameMat, this.product, x + m / 2, zoneBottom + hz / 2, 0);
          x += m;
        }
      });
    }

    const makeFill = (parent: THREE.Object3D, w: number, h: number, mode: FillingKind) => {
      const glassPane = (gw: number, gh: number, gy: number) => {
        const m = add(box(gw, gh, 0.022), glassMat, parent, 0, gy, 0, false);
        m.renderOrder = 2;
      };
      const panelBox = (pw: number, ph: number, py: number) => {
        add(box(pw, ph, 0.036), frameMat, parent, 0, py, 0);
        if (ph > 0.35 && pw > 0.3) {
          add(box(pw * 0.72, ph * 0.72, 0.01), frameMat, parent, 0, py, 0.02);
        }
      };
      if (mode === 'glass') glassPane(w, h, 0);
      else if (mode === 'panel') panelBox(w, h, 0);
      else {
        const low = h * 0.42;
        panelBox(w, low, -h / 2 + low / 2);
        glassPane(w, h - low, h / 2 - (h - low) / 2);
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

    cells.forEach((cell) => {
      const sw = cell.x1 - cell.x0;
      const cx = (cell.x0 + cell.x1) / 2;
      const kind = cell.kind;
      const laneZ = cell.lane * 0.026;
      const door = kind === 'door-l' || kind === 'door-r';
      const slide = kind === 'slide-l' || kind === 'slide-r';
      const isLeaf = kind !== 'fixed' || sliding;
      const fs = door ? 0.085 : sliding ? 0.062 : 0.058;
      const ds = sliding ? 0.04 : door ? Math.min(d, 0.07) : d * 0.82;
      const gap = 0.004;

      if (!isLeaf) {
        // Глуха секція: тонкі штапики та скло/панель безпосередньо в рамі
        add(rectFrameGeometry(sw - 0.004, hz - 0.004, 0.026, 0.045), frameMat, this.product, cx, zoneBottom + hz / 2, 0);
        const holder = new THREE.Group();
        holder.position.set(cx, zoneBottom + hz / 2, 0);
        this.product.add(holder);
        makeFill(holder, sw - 0.012, hz - 0.012, filling);
        return;
      }

      const lw = sw - 2 * gap;
      const lh = hz - 2 * gap;
      const hingeLeft = kind.endsWith('-l');
      const A = new THREE.Group();
      const B = new THREE.Group();
      const leaf = new THREE.Group();
      let baseX: number;
      if (slide || (sliding && kind === 'fixed')) {
        baseX = cx;
        A.position.set(cx, zoneBottom + gap, laneZ);
      } else {
        baseX = hingeLeft ? cell.x0 + gap : cell.x1 - gap;
        A.position.set(baseX, zoneBottom + gap, laneZ);
        B.position.x = hingeLeft ? lw / 2 : -lw / 2;
      }
      leaf.position.y = lh / 2;
      B.add(leaf);
      A.add(B);
      this.product.add(A);

      add(rectFrameGeometry(lw, lh, fs, ds), frameMat, leaf);
      const holder = new THREE.Group();
      leaf.add(holder);
      const leafFill: FillingKind = door || (cfg.product === 'entrance' && kind === 'fixed') ? filling : 'glass';
      makeFill(holder, lw - 2 * fs + 0.012, lh - 2 * fs + 0.012, leafFill);

      const operable = kind !== 'fixed';
      if (operable && !slide) handleGroup(leaf, lw, lh, fs, ds, hingeLeft, door);
      if (operable && slide) {
        const edgeLeft = kind === 'slide-l';
        handleGroup(leaf, lw, lh, fs, ds, !edgeLeft, false);
      }
      if (kind.startsWith('turn') || kind.startsWith('tilt-turn')) {
        const holderInd = new THREE.Group();
        leaf.add(holderInd);
        indicator(holderInd, lw, lh, fs, hingeLeft, kind.startsWith('tilt-turn'));
        // схематичні знаки відкривання видно лише при закритій стулці
        this.indicatorNodes.push(holderInd);
      }

      if (operable) {
        this.anims.push({
          A,
          B,
          baseX,
          hingeLeft,
          isSlide: slide,
          dir: kind === 'slide-l' ? -1 : 1,
          travel: (cell.x1 - cell.x0) * travelFactor,
          door,
          canTilt: kind.startsWith('tilt-turn'),
        });
      }
    });

    // --- Стіна з отвором
    const wallW = Math.max(W + 2.4, 16);
    const wallTop = Math.max(2.8, y0 + H + 0.55);
    const wallShape = new THREE.Shape();
    wallShape.moveTo(-wallW / 2, -0.4);
    wallShape.lineTo(wallW / 2, -0.4);
    wallShape.lineTo(wallW / 2, wallTop);
    wallShape.lineTo(-wallW / 2, wallTop);
    wallShape.closePath();
    const holeShape = outline(W + 0.008, H + 0.008, arch);
    wallShape.holes.push(new THREE.Path(holeShape.getPoints(48).map((p) => new THREE.Vector2(p.x, p.y + y0 - 0.004))));
    this.wall = new THREE.Mesh(extrude(wallShape, 0.22), new THREE.MeshStandardMaterial({ color: '#8d97a8', roughness: 0.95 }));
    this.wall.receiveShadow = true;
    this.wall.castShadow = true;
    this.scene.add(this.wall);

    // Стеля, щоб над стіною не просвічувало небо
    this.ceiling = new THREE.Mesh(new THREE.PlaneGeometry(wallW, 8), new THREE.MeshStandardMaterial({ color: '#a9b2c0', roughness: 1 }));
    this.ceiling.rotation.x = Math.PI / 2;
    this.ceiling.position.set(0, wallTop, 3.9);
    this.ceiling.receiveShadow = true;
    this.scene.add(this.ceiling);

    // --- Підвіконня для вікон
    if (cfg.product === 'window') {
      add(box(W + 0.16, 0.032, 0.24), this.sillMat, this.product, 0, -0.016, 0.12);
    }

    // --- Розмірні лінії
    const lineMat = new THREE.LineBasicMaterial({ color: '#ff7a1a' });
    const zD = 0.14;
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
    this.dims.userData = { top, left, zD, W, H, y0 };

    this.labelW.textContent = `${cfg.width} мм`;
    this.labelH.textContent = `${cfg.height} мм`;
  }

  // ---------- Камера ----------

  private frameCamera(cfg: Config, reset: boolean): void {
    const W = cfg.width / 1000;
    const H = cfg.height / 1000;
    const y0 = cfg.product === 'window' ? 0.9 : 0;
    const target = new THREE.Vector3(0, y0 + H / 2, 0);
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const aspect = this.size.w / this.size.h;
    const fit = Math.max((H * 0.5 * 1.4) / tan, (W * 0.5 * 1.4) / (tan * aspect)) + 0.5;

    if (reset || !this.cfg) {
      const dir = new THREE.Vector3(0.34, 0.1, 1).normalize();
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

    const showIndicators = this.mode === 'closed';
    for (const n of this.indicatorNodes) n.visible = showIndicators;

    // Рендеримо лише коли щось змінилося: камера, анімація стулок або параметри
    const cameraMoved = this.controls.update();
    if (!(cameraMoved || moving || this.dirty)) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);

    const info = this.dims.userData as { top: number; left: number; zD: number; W: number; H: number; y0: number };
    if (info && typeof info.top === 'number') {
      this.place(this.labelW, 0, info.y0 + info.top + 0.02, info.zD);
      this.place(this.labelH, info.left - 0.02, info.y0 + info.H / 2, info.zD);
    }
  };
}
