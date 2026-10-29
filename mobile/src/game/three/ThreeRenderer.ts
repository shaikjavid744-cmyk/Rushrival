import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { RigLook, WorldPalette } from "@/src/config/catalog";
import type { Graphics } from "@/src/save/schema";

import { TUNING } from "../constants";
import type { GameEngine } from "../engine";
import { disposeTree } from "./glLifecycle";
import { RUNNER_GLB_BASE64 } from "./runnerModel";

/**
 * three.js run renderer (expo-gl on Android, WebGL on web). Reads engine state only — the pure TS
 * engine stays the single source of truth. Meshes are pooled/instanced; nothing is allocated per frame.
 */
export interface Fx {
  shake: number;
  flash: number;
  crashT: number;
}

const LW = TUNING.laneWidthM;
const TH = TUNING.trainHeight;
const GFX = {
  low: { scale: 0.6, shadows: false, draw: 70, buildings: 0.6 },
  medium: { scale: 0.8, shadows: false, draw: 100, buildings: 0.85 },
  high: { scale: 1, shadows: true, draw: 130, buildings: 1 },
} as const;
/** Per-world train liveries: [body, stripe/trim]. */
const LIVERIES: Record<string, [string, string][]> = {
  city: [["#2F7BD9", "#FFD23F"], ["#E2483D", "#FFFFFF"], ["#18A88F", "#F2F2F2"]],
  beach: [["#FF8A3D", "#FFFFFF"], ["#2EC5C9", "#FFE066"], ["#F25F9A", "#FFFFFF"]],
  snow: [["#C8102E", "#FFFFFF"], ["#1F4E9C", "#BFE3FF"], ["#E9EEF5", "#C8102E"]],
  night: [["#7B2FF7", "#22D3EE"], ["#1B2340", "#FF3DAE"], ["#0E7490", "#FDE047"]],
  temple: [["#8B5A2B", "#F2C14E"], ["#2F6B3B", "#F2C14E"], ["#B23A2F", "#F2E3C6"]],
  lava: [["#3B3B42", "#FF6A13"], ["#8C1C13", "#FFB000"], ["#26262C", "#FF3B1F"]],
};
const rgb = (hex: string): [number, number, number] => {
  const c = new THREE.Color(hex);
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
};

function decodeBase64(b64: string): ArrayBuffer {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lut = new Uint8Array(256);
  for (let i = 0; i < 64; i++) lut[chars.charCodeAt(i)] = i;
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const out = new Uint8Array((b64.length * 3) / 4 - pad);
  let o = 0;
  for (let i = 0; i < b64.length; i += 4) {
    const n = (lut[b64.charCodeAt(i)] << 18) | (lut[b64.charCodeAt(i + 1)] << 12) | (lut[b64.charCodeAt(i + 2)] << 6) | lut[b64.charCodeAt(i + 3)];
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out.buffer;
}

/** Small procedural RGBA textures (DataTexture works identically on expo-gl and WebGL). */
function dataTex(w: number, h: number, px: (x: number, y: number) => [number, number, number, number]) {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = px(x, y);
      d.set([r, g, b, a], (y * w + x) * 4);
    }
  const t = new THREE.DataTexture(d, w, h);
  t.needsUpdate = true;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Per-vertex outfit colours from the T-pose bind position (height-normalised, X lateral):
 * hands/head skin, sleeves/top, hoodie hem accent, pants or shorts+skin legs, shoes.
 */
function paintOutfit(m: THREE.Mesh, L: RigLook, H: number) {
  const pos = m.geometry.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const c = { skin: new THREE.Color(L.skin), top: new THREE.Color(L.top), accent: new THREE.Color(L.accent), pants: new THREE.Color(L.pants), shoes: new THREE.Color(L.shoes) };
  for (let i = 0; i < pos.count; i++) {
    m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld); // skinned bind pose (raw attrs are pre-bind space)
    const y = v.y / H;
    const ax = Math.abs(v.x) / H;
    let k: keyof typeof c;
    if (ax > 0.38) k = "skin"; // hands
    else if (ax > 0.1 && y > 0.7) k = L.sleeves === "short" && ax > 0.2 ? "skin" : ax > 0.34 || (L.hairStyle === "hood" && Math.abs(v.z) < 0.02 * H) ? "accent" : "top"; // arms, cuffs, hood-look sleeve stripe
    else if (y > 0.82) k = "skin"; // neck + head
    else if (y > 0.53) k = "top";
    else if (y > 0.49) k = "accent"; // hem / belt line
    else if (y < 0.075) k = "shoes";
    else k = L.shorts && y < 0.36 ? "skin" : "pants";
    c[k].toArray(col, i * 3);
  }
  m.geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
}

interface TrainMesh {
  root: THREE.Group;
  body: THREE.Group;
  ramp: THREE.Mesh;
  lights: THREE.MeshStandardMaterial;
  marker: THREE.Mesh;
  sideTex: THREE.Texture;
  roofTex: THREE.Texture;
  vents: THREE.Object3D[];
  panto: THREE.Object3D;
}

interface Sparkle {
  g: THREE.Group;
  mat: THREE.MeshBasicMaterial;
  t: number;
}

export class ThreeRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private cfg: (typeof GFX)[Graphics];
  private scrollers: { g: THREE.Group; period: number }[] = [];
  private trains: TrainMesh[] = [];
  private lows: THREE.Group[] = [];
  private highs: THREE.Group[] = [];
  private coins!: THREE.InstancedMesh;
  private sparkles: Sparkle[] = [];
  private nextSparkle = 0;
  private lastCoins = 0;
  private pickups: { root: THREE.Group; kinds: Record<string, THREE.Object3D> }[] = [];
  private runner = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Record<string, THREE.AnimationAction> = {};
  private current = "";
  private shadow!: THREE.Mesh;
  private shield!: THREE.Mesh;
  private board!: THREE.Mesh;
  private flash!: THREE.Mesh;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private camY = 4;
  private lastT = 0;
  private rt: THREE.WebGLRenderTarget | null = null;
  private blit: THREE.Mesh | null = null;
  private blitScene = new THREE.Scene();
  private blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(
    private gl: WebGLRenderingContext,
    width: number,
    height: number,
    pixelRatio: number,
    palette: WorldPalette,
    gfx: Graphics,
    worldId = "city",
  ) {
    this.cfg = GFX[gfx];
    // Web: expo-gl exposes the real <canvas>; native: three only needs a canvas-shaped stub.
    const real = (gl as unknown as { canvas?: HTMLCanvasElement }).canvas;
    const isWeb = !!real && typeof real.getContext === "function";
    const canvas = isWeb ? real! : ({ width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, style: {}, addEventListener: () => {}, removeEventListener: () => {}, clientHeight: gl.drawingBufferHeight, getContext: () => gl } as unknown as HTMLCanvasElement);
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGL2RenderingContext, antialias: gfx !== "low", powerPreference: "high-performance" });
    // The GL drawable (expo-gl native and web) always matches the view's real pixel size, so three must use
    // that exact ratio. Graphics quality scales resolution through an offscreen render target instead.
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    if (this.cfg.scale < 1) {
      this.rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
      this.blit = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.rt.texture, depthTest: false, depthWrite: false, toneMapped: false }));
      this.blitScene.add(this.blit);
      this.sizeTarget();
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = this.cfg.shadows;
    this.camera = new THREE.PerspectiveCamera(62, width / height, 0.1, this.cfg.draw + 60);
    this.buildWorld(palette);
    this.buildObstacles(worldId);
    this.buildCoins();
    this.buildPickups();
    this.scene.add(this.runner);
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.sizeTarget();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private sizeTarget() {
    if (!this.rt) return;
    const v = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(Math.max(1, Math.round(v.x * this.cfg.scale)), Math.max(1, Math.round(v.y * this.cfg.scale)));
  }

  // ---------------------------------------------------------------- world ---
  private buildWorld(p: WorldPalette) {
    const sky = new THREE.Color(p.sky);
    const horizon = sky.clone().lerp(new THREE.Color("#FFFFFF"), 0.45);
    this.scene.background = horizon;
    this.scene.fog = new THREE.Fog(horizon, this.cfg.draw * 0.35, this.cfg.draw);
    // Sky dome with a vertical gradient.
    const domeG = new THREE.SphereGeometry(this.cfg.draw + 40, 24, 12);
    const pos = domeG.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const k = Math.max(0, pos.getY(i) / (this.cfg.draw + 40));
      c.copy(horizon).lerp(sky, Math.min(1, k * 2.2)).toArray(cols, i * 3);
    }
    domeG.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    const dome = new THREE.Mesh(domeG, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    dome.renderOrder = -1;
    this.scene.add(dome);
    this.scene.add(dome);

    this.scene.add(new THREE.HemisphereLight("#FFFFFF", p.plaza, 1.6));
    const sun = new THREE.DirectionalLight("#FFF3DC", 2.2);
    sun.position.set(-6, 14, 8);
    sun.target.position.set(0, 0, -6);
    if (this.cfg.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 8, bottom: -8, near: 1, far: 40 });
    }
    this.scene.add(sun, sun.target);

    const L = this.cfg.draw + 20;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, L + 20), new THREE.MeshStandardMaterial({ color: p.plaza, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, -L / 2 + 10);
    ground.receiveShadow = true;
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(LW * 3 + 0.8, L + 20), new THREE.MeshStandardMaterial({ color: p.asphalt, roughness: 0.95 }));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(0, 0, -L / 2 + 10);
    bed.receiveShadow = true;
    const walkL = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, L + 20), new THREE.MeshStandardMaterial({ color: p.sidewalk, roughness: 0.9 }));
    walkL.position.set(-(LW * 1.5 + 1.7), 0.09, -L / 2 + 10);
    const walkR = walkL.clone();
    walkR.position.x *= -1;
    this.scene.add(ground, bed, walkL, walkR);
    const railMat = new THREE.MeshStandardMaterial({ color: p.rail, metalness: 0.8, roughness: 0.35 });
    const railG = new THREE.BoxGeometry(0.09, 0.12, L + 20);
    for (const lane of [-1, 0, 1])
      for (const sx of [-0.55, 0.55]) {
        const r = new THREE.Mesh(railG, railMat);
        r.position.set(lane * LW + sx, 0.13, -L / 2 + 10);
        this.scene.add(r);
      }

    // Sleepers: one instanced mesh scrolled by moving its parent group (period = spacing).
    const sp = 1.1;
    const n = Math.ceil((L + 10) / sp);
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.08, 0.32), new THREE.MeshStandardMaterial({ color: p.sleeper, roughness: 1 }), n * 3);
    let k = 0;
    for (let i = 0; i < n; i++) for (const lane of [-1, 0, 1]) sleepers.setMatrixAt(k++, this.m4.makeTranslation(lane * LW, 0.05, 8 - i * sp));
    this.addScroller([sleepers], sp);

    // Buildings (instanced, per-instance colour, window texture) and lamp posts.
    const win = dataTex(16, 32, (x, y) => {
      const isWin = x % 4 !== 0 && y % 4 !== 0 && y > 2;
      return isWin ? [60, 78, 110, 255] : [255, 255, 255, 255];
    });
    win.magFilter = THREE.NearestFilter;
    const night = new THREE.Color(p.sky).getHSL({ h: 0, s: 0, l: 0 }).l < 0.25;
    const bMat = new THREE.MeshStandardMaterial({ map: win, roughness: 0.85, emissive: night ? "#FFD27A" : "#000000", emissiveMap: night ? win : null, emissiveIntensity: night ? 0.25 : 0 });
    const period = 120;
    const per = Math.ceil(((L + period) / 10) * this.cfg.buildings);
    const bG = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const blds = new THREE.InstancedMesh(bG, bMat, per * 2);
    const base = new THREE.Color(p.sidewalk);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    k = 0;
    for (const side of [-1, 1]) {
      let z = 10;
      for (let i = 0; i < per; i++) {
        const w = 5 + rnd() * 4;
        const h = 6 + rnd() * 18;
        const d = 6 + rnd() * 4;
        this.v.set(side * (LW * 1.5 + 4 + w / 2 + rnd() * 2), 0, z - d / 2);
        this.s.set(w, h, d);
        blds.setMatrixAt(k, this.m4.compose(this.v, this.q.identity(), this.s));
        blds.setColorAt(k++, c.copy(base).offsetHSL(rnd() * 0.5, 0.15, (rnd() - 0.5) * 0.35));
        z -= d + 1.5 + rnd() * 3;
        if (z < -(L + period)) break;
      }
    }
    blds.count = k;
    this.s.set(1, 1, 1);
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6).translate(0, 2.1, 0), new THREE.MeshStandardMaterial({ color: "#3B4252", metalness: 0.6 }), 40);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: "#FFF2C4", emissive: "#FFE08A", emissiveIntensity: night ? 2.5 : 0.6 }), 40);
    k = 0;
    for (let i = 0; i < 20; i++)
      for (const side of [-1, 1]) {
        const x = side * (LW * 1.5 + 2.6);
        posts.setMatrixAt(k, this.m4.makeTranslation(x, 0, 8 - i * 16));
        heads.setMatrixAt(k++, this.m4.makeTranslation(x - side * 0.3, 4.25, 8 - i * 16));
      }
    this.addScroller([blds], period * 100); // buildings scroll continuously (see render)
    this.addScroller([posts, heads], 16);
  }

  private addScroller(meshes: THREE.Object3D[], period: number) {
    const g = new THREE.Group();
    g.add(...meshes);
    this.scene.add(g);
    this.scrollers.push({ g, period });
  }

  // ------------------------------------------------------------ obstacles ---
  private buildObstacles(worldId: string) {
    const px = (c: number[], k = 1): [number, number, number, number] => [c[0] * k, c[1] * k, c[2] * k, 255];
    const lin = (t: THREE.Texture) => {
      t.minFilter = t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    };
    const glass = new THREE.MeshStandardMaterial({ color: "#16233A", metalness: 0.5, roughness: 0.15 });
    const dark = new THREE.MeshStandardMaterial({ color: "#23262E", roughness: 0.85 });
    const metal = new THREE.MeshStandardMaterial({ color: "#9AA4B4", metalness: 0.6, roughness: 0.35 });
    const W = 2.15;
    const R = TUNING.rampLength;
    const UNDER = 0.45;
    const liveries = LIVERIES[worldId] ?? LIVERIES.city;
    const G = [24, 36, 58];
    const F = [214, 220, 230];
    // One 4 m car segment of side livery: skirt, trim stripe, window strip with pillars, a door, top trim.
    const sideTexes = liveries.map(([body, trim]) =>
      lin(
        dataTex(64, 32, (x, y) => {
          const B = rgb(body);
          const T = rgb(trim);
          if (x >= 40 && x < 52) {
            if (x === 40 || x === 51 || y === 27) return px(F, 0.55);
            if (y >= 13 && y < 25 && x > 42 && x < 49) return px(G);
            return px(B, 0.8);
          }
          if (y >= 7 && y < 10) return px(T);
          if (y >= 13 && y < 25) {
            const p = x % 10;
            if (p < 2) return px(B);
            if (y === 13 || y === 24 || p === 2 || p === 9) return px(F);
            return px(G);
          }
          if (y >= 28 && y < 30) return px(T);
          return px(B);
        }),
      ),
    );
    // Roof: light panels with seams and trim-coloured side edges (reads as "train top" from above).
    const roofTexes = liveries.map(([bodyC, trim]) => {
      const tint = new THREE.Color(bodyC).lerp(new THREE.Color("#FFFFFF"), 0.5);
      const P2 = rgb("#" + tint.getHexString());
      return lin(dataTex(16, 16, (x, y) => (x < 2 || x > 13 ? px(rgb(trim)) : y % 8 === 0 ? px(P2, 0.78) : px(P2))));
    });
    // Ramp: yellow/black chevrons pointing up the slope.
    const chevron = lin(dataTex(32, 32, (x, y) => ((y + Math.abs(x - 15.5)) % 16 < 8 ? [250, 196, 20, 255] : [30, 30, 36, 255])));
    const rampMat = new THREE.MeshStandardMaterial({ map: chevron, roughness: 0.6 });
    // Ramp wedge: from ground at +R (towards the runner) up to the roof at the train front (z = 0).
    const rg = new THREE.BufferGeometry();
    const hw = W / 2;
    const P = [-hw, 0, R, hw, 0, R, hw, TH, 0, -hw, TH, 0, -hw, 0, 0, hw, 0, 0];
    rg.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    rg.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 3, 0, 3, 0, 0, 1, 0], 2));
    rg.setIndex([0, 1, 2, 0, 2, 3, 4, 0, 3, 1, 5, 2]);
    rg.computeVertexNormals();
    const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, -0.5); // front face at z=0, extends to z=-1
    const headG = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 14).rotateX(Math.PI / 2);
    for (let i = 0; i < 18; i++) {
      const li = i % liveries.length;
      const [bodyC, trimC] = liveries[li];
      const root = new THREE.Group();
      const body = new THREE.Group();
      const paint = new THREE.MeshStandardMaterial({ color: bodyC, metalness: 0.3, roughness: 0.4 });
      const paintDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(bodyC).multiplyScalar(0.7), roughness: 0.5 });
      const trim = new THREE.MeshStandardMaterial({ color: trimC, roughness: 0.5 });
      const sideTex = sideTexes[li].clone();
      const roofTex = roofTexes[li].clone();
      const side = new THREE.MeshStandardMaterial({ map: sideTex, metalness: 0.25, roughness: 0.45 });
      const roofTop = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.7 });
      const under = new THREE.Mesh(unit, dark);
      under.scale.set(W - 0.3, UNDER, 1);
      const shell = new THREE.Mesh(unit, [side, side, paint, dark, paint, paint]);
      shell.scale.set(W, TH - UNDER - 0.14, 1);
      shell.position.y = UNDER;
      shell.castShadow = true;
      const roof = new THREE.Mesh(unit, [paintDark, paintDark, roofTop, paintDark, paintDark, paintDark]);
      roof.scale.set(W - 0.06, 0.14, 1);
      roof.position.y = TH - 0.14;
      body.add(under, shell, roof);
      for (const sx of [-1, 1]) {
        const gutter = new THREE.Mesh(unit, trim); // raised side edges along the roof
        gutter.scale.set(0.07, 0.07, 1);
        gutter.position.set(sx * (W / 2 - 0.035), TH, 0);
        body.add(gutter);
      }
      const front = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, 0.86, 0.03), dark);
      frame.position.set(0, TH * 0.68, 0.015);
      const screen = new THREE.Mesh(new THREE.BoxGeometry(W * 0.76, 0.74, 0.04), glass);
      screen.position.set(0, TH * 0.68, 0.03);
      const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.01, 0.16, 0.03), trim);
      band.position.set(0, 1.02, 0.02);
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.15, 0.03), new THREE.MeshStandardMaterial({ color: "#FFB000", emissive: "#FF9500", emissiveIntensity: 0.9 }));
      board.position.set(0, TH - 0.3, 0.02);
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.26, 0.22), dark);
      bumper.position.set(0, 0.32, 0.08);
      const lights = new THREE.MeshStandardMaterial({ color: "#FFF6D0", emissive: "#FFE9A0", emissiveIntensity: 1 });
      for (const sx of [-0.68, 0.68]) {
        const l = new THREE.Mesh(headG, lights);
        l.position.set(sx, 0.74, 0.04);
        front.add(l);
      }
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshStandardMaterial({ color: "#FF3B30", emissive: "#FF2010", emissiveIntensity: 1.5 }));
      marker.position.set(0, TH + 0.9, 0);
      front.add(frame, screen, band, board, bumper, marker);
      // roof details (not length-scaled; positioned per frame)
      const vents = [0, 1].map(() => {
        const g = new THREE.Group();
        for (const sx of [-0.55, 0.55]) {
          const v = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.7), metal);
          v.position.set(sx, TH + 0.05, 0);
          g.add(v);
        }
        root.add(g);
        return g;
      });
      const panto = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.55), dark);
      base.position.y = TH + 0.03;
      panto.add(base);
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.85), metal);
        arm.position.set(0, TH + 0.24, s * 0.18);
        arm.rotation.x = s * 0.55;
        panto.add(arm);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.06), metal);
      bar.position.y = TH + 0.44;
      panto.add(bar);
      const ramp = new THREE.Mesh(rg, rampMat);
      ramp.receiveShadow = true;
      root.add(body, front, panto, ramp);
      root.visible = false;
      this.scene.add(root);
      this.trains.push({ root, body, ramp, lights, marker, sideTex, roofTex, vents, panto });
    }

    // Barriers: diagonal red/white boards; low = chunky A-frame barricade, high = overhead gantry + sign.
    const stripes = lin(dataTex(32, 8, (x, y) => (((x + y) >> 2) % 2 ? [228, 44, 40, 255] : [248, 248, 248, 255])));
    const boardMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.55 });
    const postMat = new THREE.MeshStandardMaterial({ color: "#2B2F3A", metalness: 0.4, roughness: 0.6 });
    const amber = new THREE.MeshStandardMaterial({ color: "#FFB020", emissive: "#FF9A00", emissiveIntensity: 1.4 });
    const signTex = dataTex(32, 32, (x, y) => {
      if (x < 3 || x > 28 || y < 3 || y > 28) return [25, 25, 30, 255];
      const c = Math.abs(x - 15.5);
      if ((y >= 6 && y < 15 && c <= y - 6) || (y >= 15 && y < 26 && c < 2.6)) return [25, 25, 30, 255]; // ↓ arrow
      return [255, 204, 0, 255];
    });
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.5, emissive: "#3A2E00", emissiveIntensity: 0.4 });
    const box = (g: THREE.Group, w: number, h: number, dd: number, x: number, y: number, z: number, m: THREE.Material) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m);
      b.position.set(x, y, z);
      b.castShadow = true;
      g.add(b);
      return b;
    };
    const low = () => {
      const g = new THREE.Group();
      box(g, 2.1, 0.44, 0.22, 0, 0.74, 0, boardMat);
      box(g, 2.0, 0.2, 0.14, 0, 0.32, 0, boardMat);
      for (const sx of [-0.88, 0.88]) {
        for (const s of [-1, 1]) box(g, 0.1, 1.02, 0.1, sx, 0.48, s * 0.13, postMat).rotation.x = s * 0.32;
        box(g, 0.2, 0.06, 0.7, sx, 0.03, 0, postMat);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), amber);
        lamp.position.set(sx, 1.03, 0);
        g.add(lamp);
      }
      return g;
    };
    const high = () => {
      const g = new THREE.Group();
      for (const sx of [-1.02, 1.02]) {
        box(g, 0.18, 2.55, 0.18, sx, 1.275, 0, postMat);
        box(g, 0.34, 0.06, 0.5, sx, 0.03, 0, postMat);
      }
      box(g, 2.25, 0.5, 0.22, 0, 1.72, 0, boardMat);
      const sign = box(g, 0.62, 0.62, 0.04, 0, 2.3, 0.1, [postMat, postMat, postMat, postMat, signMat, postMat] as unknown as THREE.Material);
      sign.castShadow = false;
      for (const sx of [-1.02, 1.02]) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), amber);
        lamp.position.set(sx, 2.62, 0);
        g.add(lamp);
      }
      return g;
    };
    for (let i = 0; i < 12; i++) this.lows.push(this.hidden(low()));
    for (let i = 0; i < 12; i++) this.highs.push(this.hidden(high()));
  }

  private hidden(g: THREE.Group) {
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  /** Thick gold coin: bevelled lathe rim, inner ring and an embossed star on both faces (merged, instanced). */
  private buildCoins() {
    const t = 0.05;
    const Rr = 0.25;
    const prof = [
      [0.001, -t],
      [Rr - 0.045, -t],
      [Rr - 0.015, -t + 0.012],
      [Rr, -t + 0.03],
      [Rr, t - 0.03],
      [Rr - 0.015, t - 0.012],
      [Rr - 0.045, t],
      [0.001, t],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const paint = (g: THREE.BufferGeometry, hex: string) => {
      const c = new THREE.Color(hex);
      const n = g.attributes.position.count;
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.toArray(a, i * 3);
      g.setAttribute("color", new THREE.BufferAttribute(a, 3));
      return g;
    };
    const parts: THREE.BufferGeometry[] = [paint(new THREE.LatheGeometry(prof, 28).rotateX(Math.PI / 2).toNonIndexed(), "#E5A50F")];
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.055 : 0.13;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i) star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    for (const s of [1, -1]) {
      const sg = new THREE.ExtrudeGeometry(star, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 });
      if (s < 0) sg.rotateY(Math.PI);
      sg.translate(0, 0, s * (t - 0.006));
      parts.push(paint(sg.index ? sg.toNonIndexed() : sg, "#FFE58A"));
      const ring = new THREE.TorusGeometry(Rr - 0.055, 0.012, 6, 28).translate(0, 0, s * t);
      parts.push(paint(ring.toNonIndexed(), "#FFD34A"));
    }
    const geo = mergeGeometries(parts.map((g) => {
      for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) g.deleteAttribute(k);
      return g;
    }));
    const coinMat = new THREE.MeshPhongMaterial({ vertexColors: true, specular: "#FFF3C4", shininess: 90, emissive: "#5A3A00", emissiveIntensity: 0.4 });
    this.coins = new THREE.InstancedMesh(geo!, coinMat, 160);
    this.coins.count = 0;
    this.scene.add(this.coins);
    // pickup sparkles (pooled)
    const bit = new THREE.OctahedronGeometry(0.055);
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: "#FFC21A", transparent: true, opacity: 0, depthWrite: false });
      const g = new THREE.Group();
      for (let k = 0; k < 7; k++) g.add(new THREE.Mesh(bit, mat));
      g.visible = false;
      this.scene.add(g);
      this.sparkles.push({ g, mat, t: 1 });
    }
  }

  private buildPickups() {
    const glowMat = (c: string) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const std = (c: string) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, roughness: 0.4 });
    const make: Record<string, () => THREE.Object3D> = {
      magnet: () => new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.11, 8, 16, Math.PI * 1.3), std("#E5302B")),
      shield: () => new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), std("#2EC5FF")),
      speed: () => new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 6), std("#FF8A1F")),
      x2: () => new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.12), std("#FFD23F")),
      hoverboard: () => new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.08, 0.28), std("#B16CFF")),
    };
    const halo = new THREE.SphereGeometry(0.62, 12, 8);
    for (let i = 0; i < 8; i++) {
      const root = new THREE.Group();
      const kinds: Record<string, THREE.Object3D> = {};
      for (const k of Object.keys(make)) {
        const g = new THREE.Group();
        g.add(make[k](), new THREE.Mesh(halo, glowMat(k === "shield" ? "#2EC5FF" : k === "magnet" ? "#FF5A50" : "#FFD23F")));
        kinds[k] = g;
        root.add(g);
      }
      root.visible = false;
      this.scene.add(root);
      this.pickups.push({ root, kinds });
    }
  }

  // ------------------------------------------------------------- runner ---
  async loadRunner(look: RigLook) {
    const gltf = await new GLTFLoader().parseAsync(decodeBase64(RUNNER_GLB_BASE64), "");
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = false; // blob shadow only (avoids a second, offset silhouette shadow)
      m.frustumCulled = false;
      paintOutfit(m, look, h);
      m.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.04 });
    });
    this.attachHair(model, look, h);
    model.scale.setScalar(1.75 / h);
    model.rotation.y = Math.PI; // face down the track (away from the camera)
    this.runner.add(model);
    this.model = model;
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    for (const n of ["Jump_Start", "Jump_Land", "Roll", "Death01", "Hit_Chest"]) {
      const a = this.actions[n];
      if (!a) continue;
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    this.play("Jog_Fwd_Loop", 0);
    // blob shadow, shield bubble, hoverboard
    const blob = dataTex(64, 64, (x, y) => {
      const d = Math.hypot(x - 31.5, y - 31.5) / 32;
      return [0, 0, 0, Math.max(0, 1 - d) ** 1.6 * 200];
    });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1.15, 20, 14), new THREE.MeshBasicMaterial({ color: "#5FD4FF", transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.board = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 1.5), new THREE.MeshStandardMaterial({ color: look.accent, emissive: look.accent, emissiveIntensity: 0.35 }));
    this.runner.add(this.shield, this.board);
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0, depthTest: false }));
    this.flash.position.set(0, 0, -0.5);
    this.camera.add(this.flash);
    this.scene.add(this.camera);
  }

  /** Hair / hood / headband attached to the Head bone, expressed in the model's upright frame. */
  private attachHair(model: THREE.Object3D, L: RigLook, H: number) {
    const head = model.getObjectByName("Head");
    if (!head) return;
    // Built in the unscaled bind-pose model frame (Y up, facing +Z); head centre ≈ 93% of height.
    const cy = H * 0.93;
    const g = new THREE.Group();
    const hm = new THREE.MeshStandardMaterial({ color: L.hairStyle === "hood" ? L.top : L.hair, roughness: 0.7 });
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, mat = hm) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    const cap = (r: number, theta: number) => new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI * theta);
    if (L.hairStyle === "hood") {
      const hood = add(cap(0.165, 0.64), 0, cy - 0.01, -0.02);
      hood.scale.set(1.05, 1.12, 1.12);
      hood.rotation.x = -0.35;
      // face opening rim + drape down the back so it reads as a hood, not a dome
      add(new THREE.TorusGeometry(0.125, 0.042, 8, 20), 0, cy - 0.01, 0.1, new THREE.MeshStandardMaterial({ color: L.accent, emissive: L.accent, emissiveIntensity: 0.45, roughness: 0.6 }));
      add(new THREE.CapsuleGeometry(0.11, 0.12, 4, 10), 0, cy - 0.12, -0.11).rotation.x = 0.35;
    } else add(cap(0.14, 0.52), 0, cy + 0.005, -0.012).rotation.x = -0.4;
    if (L.hairStyle === "spiky")
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const c = add(new THREE.ConeGeometry(0.05, 0.17, 5), Math.cos(a) * 0.075, cy + 0.12, Math.sin(a) * 0.075 - 0.02);
        c.rotation.set(Math.sin(a) * 0.65, 0, -Math.cos(a) * 0.65);
      }
    if (L.hairStyle === "mohawk")
      for (let i = 0; i < 4; i++) add(new THREE.ConeGeometry(0.045, 0.2, 5), 0, cy + 0.15, 0.08 - i * 0.06).rotation.x = -0.35;
    if (L.hairStyle === "ponytail") {
      add(new THREE.CapsuleGeometry(0.055, 0.24, 4, 8), 0, cy - 0.06, -0.2).rotation.x = 0.55;
      add(new THREE.SphereGeometry(0.05, 8, 6), 0, cy + 0.06, -0.14);
    }
    if (L.headband) {
      const band = new THREE.MeshStandardMaterial({ color: L.headband, roughness: 0.6 });
      add(new THREE.TorusGeometry(0.143, 0.026, 6, 24), 0, cy + 0.035, -0.005, band).rotation.x = Math.PI / 2;
      for (const sx of [-0.04, 0.04]) add(new THREE.BoxGeometry(0.035, 0.11, 0.02), sx, cy - 0.03, -0.16, band).rotation.x = 0.5;
    }
    // Model root is still at identity here, so the bind-pose model→head transform is inv(head.matrixWorld).
    head.matrixWorld.clone().invert().decompose(g.position, g.quaternion, g.scale);
    head.add(g);
  }

  private play(name: string, fade = 0.12, timeScale = 1, startAt = 0) {
    const a = this.actions[name];
    if (!a) return;
    a.timeScale = timeScale;
    if (this.current === name) return;
    const prev = this.actions[this.current];
    a.reset().play();
    a.time = startAt * a.getClip().duration;
    if (prev && fade > 0) a.crossFadeFrom(prev, fade, false);
    else if (prev) prev.stop();
    this.current = name;
  }

  // ------------------------------------------------------------- frame ----
  render(e: GameEngine, fx: Fx) {
    // Animation clock is wall time: the engine clock stops on crash but the death clip must still play.
    const now = performance.now();
    const dt = this.lastT ? Math.max(0, Math.min(0.1, (now - this.lastT) / 1000)) : 0;
    this.lastT = now;
    const d = e.distance;
    const p = e.player;
    const far = this.cfg.draw;

    for (const s of this.scrollers) s.g.position.z = s.period > 1000 ? d % 1200 : d % s.period;

    // trains & barriers
    let ti = 0;
    let li = 0;
    let hi = 0;
    for (const o of e.obstacles.items) {
      if (!o.active) continue;
      const dz = o.z - d;
      if (dz > far || dz + o.depth < -12) continue;
      if (o.kind === "train") {
        const t = this.trains[ti++];
        if (!t) continue;
        t.root.visible = true;
        t.root.position.set(o.lane * LW, 0, -dz);
        t.body.scale.z = o.depth;
        t.sideTex.repeat.x = o.depth / 4;
        t.roofTex.repeat.y = o.depth / 2;
        t.vents[0].position.z = -o.depth * 0.28;
        t.vents[1].position.z = -o.depth * 0.62;
        t.panto.position.z = -Math.max(1.2, o.depth - 1.4);
        t.ramp.visible = o.ramp;
        t.marker.visible = o.moving;
        const blink = o.moving ? (Math.sin(e.time * 14) > 0 ? 3 : 0.3) : 1;
        t.lights.emissiveIntensity = blink;
        t.lights.emissive.set(o.moving ? "#FF3020" : "#FFE9A0");
        if (o.moving) t.marker.rotation.y = e.time * 4;
      } else {
        const g = o.kind === "low" ? this.lows[li++] : this.highs[hi++];
        if (!g) continue;
        g.visible = true;
        g.position.set(o.lane * LW, 0, -dz);
      }
    }
    for (; ti < this.trains.length; ti++) this.trains[ti].root.visible = false;
    for (; li < this.lows.length; li++) this.lows[li].visible = false;
    for (; hi < this.highs.length; hi++) this.highs[hi].visible = false;

    // coins (instanced, spinning)
    let ci = 0;
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), e.time * 4);
    for (const c of e.coins.items) {
      if (!c.active) continue;
      const dz = c.z - d;
      if (dz > far || dz < -3 || ci >= 160) continue;
      this.coins.setMatrixAt(ci++, this.m4.compose(this.v.set(c.x * LW, c.y, -dz), this.q, this.s));
    }
    this.coins.count = ci;
    this.coins.instanceMatrix.needsUpdate = true;

    // coin pickup sparkles (derived from the engine's coin counter; renderer stays read-only)
    if (e.coinsCollected < this.lastCoins) this.lastCoins = 0;
    for (; this.lastCoins < e.coinsCollected; this.lastCoins++) {
      const sp = this.sparkles[this.nextSparkle++ % this.sparkles.length];
      sp.t = 0;
      sp.g.position.set(p.x * LW, p.y + 0.9, -0.5);
      sp.g.rotation.z = Math.random() * Math.PI;
    }
    for (const sp of this.sparkles) {
      if (sp.t >= 0.4) {
        sp.g.visible = false;
        continue;
      }
      sp.t += dt;
      sp.g.visible = true;
      const k = Math.min(1, sp.t / 0.4);
      sp.mat.opacity = 1 - k;
      sp.g.children.forEach((ch, i) => {
        const a = (i / sp.g.children.length) * Math.PI * 2;
        ch.position.set(Math.cos(a) * (0.15 + k * 0.7), Math.sin(a) * (0.15 + k * 0.7), 0);
        ch.scale.setScalar(1.4 - k);
      });
    }

    let pi = 0;
    for (const u of e.pickups.items) {
      if (!u.active) continue;
      const slot = this.pickups[pi++];
      if (!slot) continue;
      slot.root.visible = true;
      slot.root.position.set(u.lane * LW, u.y + 0.25 + Math.sin(e.time * 3) * 0.12, -(u.z - d));
      slot.root.rotation.y = e.time * 2.5;
      for (const k in slot.kinds) slot.kinds[k].visible = k === u.kind;
    }
    for (; pi < this.pickups.length; pi++) this.pickups[pi].root.visible = false;

    // runner
    const x = p.x * LW;
    const lift = e.timers.hoverboard > 0 ? 0.3 : 0;
    this.runner.position.set(x, p.y + lift, 0);
    if (this.model) {
      this.model.rotation.z = (p.lane - p.x) * 0.35; // lean into lane changes
      this.model.rotation.y = Math.PI + (p.lane - p.x) * 0.25;
      if (e.crashed || fx.crashT > 0) this.play("Death01", 0.06, 1.5);
      else if (p.sliding) this.play("Roll", 0.05, ((this.actions.Roll?.getClip().duration ?? 1.4) * 0.45) / TUNING.slideTime, 0.15); // skip the upright start, stay tucked
      else if (p.airborne) this.play(p.vy > 4 ? "Jump_Start" : "Jump_Loop", 0.1, p.vy > 4 ? 1.6 : 1);
      else if (p.landTimer > 0) this.play("Jump_Land", 0.06, 2.2);
      else {
        const sprint = e.speed > 14;
        this.play(sprint ? "Sprint_Loop" : "Jog_Fwd_Loop", 0.18, Math.max(0.85, Math.min(1.7, e.speed / (sprint ? 17 : 9))));
      }
      this.mixer!.update(dt);
      this.shadow.position.set(x, p.support + 0.02, 0);
      const air = Math.max(0, p.y - p.support);
      const k = 1 - Math.min(0.6, air / 3);
      this.shadow.scale.set(k, k, k);
      (this.shadow.material as THREE.MeshBasicMaterial).opacity = k;
      this.shield.visible = e.timers.shield > 0;
      this.shield.position.y = 0.95;
      this.board.visible = lift > 0;
      this.board.position.y = -0.05;
      (this.flash.material as THREE.MeshBasicMaterial).opacity = fx.flash;
    }

    // chase camera: behind & above, rises with the runner on roofs, slight tilt up
    this.camY += (4.1 + p.support * 0.75 + Math.max(0, p.y - p.support) * 0.25 - this.camY) * Math.min(1, dt * 5);
    const shake = fx.shake * 0.01;
    this.camera.position.set(x * 0.65 + (Math.random() - 0.5) * shake, this.camY + (Math.random() - 0.5) * shake, 6.6);
    this.camera.lookAt(x * 0.8, this.camY - 2.6 + p.support * 0.15, -9);
    if (this.rt) {
      this.renderer.setRenderTarget(this.rt);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.blitScene, this.blitCam);
    } else this.renderer.render(this.scene, this.camera);
    (this.gl as unknown as { endFrameEXP?: () => void }).endFrameEXP?.();
  }

  dispose() {
    disposeTree(this.scene as unknown as Parameters<typeof disposeTree>[0]);
    disposeTree(this.blitScene as unknown as Parameters<typeof disposeTree>[0]);
    this.rt?.dispose();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
  }
}
