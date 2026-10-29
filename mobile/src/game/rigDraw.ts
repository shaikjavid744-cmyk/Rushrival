import { PaintStyle, Skia, SkCanvas, SkColor, SkPaint, StrokeCap, StrokeJoin } from "@shopify/react-native-skia";

import type { RigLook } from "@/src/config/catalog";

import { BONES, Skeleton, V3 } from "./rig";

/** Cel-shaded cut-out renderer for the rig, seen from a three-quarter back view. */
const OUTLINE = "#11131C";
const YAW = 22 * (Math.PI / 180); // three-quarter back view
const PITCH = 0.32; // forward (z) rises on screen because the camera looks down

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

type Seg = { a: [number, number]; b: [number, number]; w: number; c: string; depth: number; kind: "limb" | "torso" | "head" | "shoe" | "hand" | "pelvis" };

export class RigPainter {
  private stroke: SkPaint;
  private fill: SkPaint;
  private col: SkColor[] = [];
  private idx: Record<string, number> = {};
  private segs: Seg[] = [];

  constructor(private readonly look: RigLook) {
    this.stroke = Skia.Paint();
    this.stroke.setAntiAlias(true);
    this.stroke.setStyle(PaintStyle.Stroke);
    this.stroke.setStrokeCap(StrokeCap.Round);
    this.stroke.setStrokeJoin(StrokeJoin.Round);
    this.fill = Skia.Paint();
    this.fill.setAntiAlias(true);
    const add = (k: string, hex: string) => {
      this.idx[k] = this.col.length;
      this.col.push(Skia.Color(hex));
    };
    const L = look;
    // Dark outfits get a light rim instead of a black outline so they stay readable on the dark track.
    const n = parseInt(L.top.slice(1), 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    add("outline", lum < 0.25 ? "#8EA2FF" : OUTLINE);
    for (const [k, v] of Object.entries({ skin: L.skin, hair: L.hair, top: L.top, accent: L.accent, pants: L.pants, shoes: L.shoes, band: L.headband ?? L.accent, sole: "#F4F4F4" })) {
      add(k, v);
      add(`${k}Dark`, shade(v, 0.7));
      add(`${k}Lite`, shade(v, 1.28));
    }
  }

  private C(k: string): SkColor {
    return this.col[this.idx[k]];
  }

  /** Project rig space (m) to local screen px; origin = ground under the pelvis. */
  private p(v: V3, s: number): [number, number] {
    const sx = v[0] * Math.cos(YAW) + v[2] * Math.sin(YAW) * 0.9;
    const sy = -v[1] - v[2] * PITCH;
    return [sx * s, sy * s];
  }

  private depth(v: V3): number {
    return v[2] * Math.cos(YAW) - v[0] * Math.sin(YAW);
  }

  private line(canvas: SkCanvas, a: [number, number], b: [number, number], w: number, color: SkColor) {
    this.stroke.setStrokeWidth(w);
    this.stroke.setColor(color);
    canvas.drawLine(a[0], a[1], b[0], b[1], this.stroke);
  }

  /** Capsule with outline, base fill and a cel-shade band on the right (light comes from the upper left). */
  private capsule(canvas: SkCanvas, a: [number, number], b: [number, number], w: number, base: string, o: number) {
    this.line(canvas, a, b, w + o * 2, this.C("outline"));
    this.line(canvas, a, b, w, this.C(base));
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * w * 0.24;
    const ny = (dx / len) * w * 0.24;
    const sgn = nx >= 0 ? 1 : -1;
    this.line(canvas, [a[0] + nx * sgn, a[1] + ny * sgn], [b[0] + nx * sgn, b[1] + ny * sgn], w * 0.42, this.C(`${base}Dark`));
    this.line(canvas, [a[0] - nx * sgn * 1.4, a[1] - ny * sgn * 1.4], [b[0] - nx * sgn * 1.4, b[1] - ny * sgn * 1.4], w * 0.14, this.C(`${base}Lite`));
  }

  draw(canvas: SkCanvas, sk: Skeleton, scale: number) {
    const s = scale;
    const o = Math.max(1.5, s * 0.022); // outline thickness
    const L = this.look;
    const segs = this.segs;
    segs.length = 0;
    const push = (a: V3, b: V3, w: number, c: string, kind: Seg["kind"], bias = 0) =>
      segs.push({ a: this.p(a, s), b: this.p(b, s), w: w * s, c, depth: (this.depth(a) + this.depth(b)) / 2 + bias, kind });

    for (let i = 0; i < 2; i++) {
      const legColor = L.shorts ? "skin" : "pants";
      push(sk.hip[i], sk.knee[i], 0.17, "pants", "limb");
      push(sk.knee[i], sk.ankle[i], 0.135, legColor, "limb");
      push(sk.ankle[i], sk.toe[i], 0.12, "shoes", "shoe", -0.02);
      const armColor = L.sleeves === "short" ? "skin" : "top";
      push(sk.shoulder[i], sk.elbow[i], 0.115, "top", "limb", 0.02);
      push(sk.elbow[i], sk.hand[i], 0.095, armColor, "limb", 0.02);
      push(sk.hand[i], sk.hand[i], 0.11, "skin", "hand", 0.01);
    }
    push(sk.pelvis, sk.pelvis, 0, "pants", "pelvis", 0.06);
    push(sk.pelvis, sk.neck, 0, "top", "torso", 0.05);
    push(sk.neck, sk.head, 0, "hair", "head", -0.12);
    segs.sort((x, y) => y.depth - x.depth); // far → near

    for (const g of segs) {
      const c = this.C(g.c);
      if (g.kind === "limb") this.capsule(canvas, g.a, g.b, g.w, g.c, o);
      else if (g.kind === "shoe") {
        this.capsule(canvas, g.a, g.b, g.w, "shoes", o);
        this.line(canvas, g.a, [g.a[0] + (g.b[0] - g.a[0]) * 0.25, g.a[1] + (g.b[1] - g.a[1]) * 0.25 + g.w * 0.25], g.w * 0.5, this.C("sole"));
      } else if (g.kind === "hand") {
        this.fill.setColor(this.C("outline"));
        canvas.drawCircle(g.a[0], g.a[1], g.w / 2 + o, this.fill);
        this.fill.setColor(c);
        canvas.drawCircle(g.a[0], g.a[1], g.w / 2, this.fill);
      } else if (g.kind === "pelvis") this.drawPelvis(canvas, sk, s, o);
      else if (g.kind === "torso") this.drawTorso(canvas, sk, s, o);
      else this.drawHead(canvas, sk, s, o);
    }
  }

  private poly(canvas: SkCanvas, pts: [number, number][], color: SkColor, outline: number) {
    const b = Skia.PathBuilder.Make().moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) b.lineTo(pts[i][0], pts[i][1]);
    const path = b.close().build();
    if (outline > 0) {
      this.stroke.setStrokeWidth(outline * 2);
      this.stroke.setColor(this.C("outline"));
      canvas.drawPath(path, this.stroke);
    }
    this.fill.setColor(color);
    canvas.drawPath(path, this.fill);
  }

  private drawPelvis(canvas: SkCanvas, sk: Skeleton, s: number, o: number) {
    const hw = BONES.hipHalf + 0.07;
    const pv = sk.pelvis;
    const pts: [number, number][] = [this.p([pv[0] - hw, pv[1] + 0.08, pv[2]], s), this.p([pv[0] + hw, pv[1] + 0.08, pv[2]], s), this.p([pv[0] + hw * 0.9, pv[1] - 0.1, pv[2]], s), this.p([pv[0] - hw * 0.9, pv[1] - 0.1, pv[2]], s)];
    this.poly(canvas, pts, this.C("pants"), o);
  }

  private drawTorso(canvas: SkCanvas, sk: Skeleton, s: number, o: number) {
    const pv = sk.pelvis;
    const nk = sk.neck;
    const sh = BONES.shoulderHalf + 0.05;
    const wa = 0.15;
    const mid = (k: number): V3 => [0, pv[1] + (nk[1] - pv[1]) * k, pv[2] + (nk[2] - pv[2]) * k];
    const top = mid(0.97);
    const low = mid(0.06);
    const pts: [number, number][] = [this.p([-wa, low[1], low[2]], s), this.p([-sh, top[1] - 0.06, top[2]], s), this.p([-sh * 0.55, top[1] + 0.03, top[2]], s), this.p([sh * 0.55, top[1] + 0.03, top[2]], s), this.p([sh, top[1] - 0.06, top[2]], s), this.p([wa, low[1], low[2]], s)];
    this.poly(canvas, pts, this.C("top"), o);
    // cel shade on right half + back stripe accent
    const sm = mid(0.5);
    this.poly(canvas, [this.p([wa * 0.35, low[1], low[2]], s), this.p([sh * 0.55, top[1] + 0.02, top[2]], s), this.p([sh * 0.98, top[1] - 0.06, top[2]], s), this.p([wa, low[1], low[2]], s)], this.C("topDark"), 0);
    this.poly(canvas, [this.p([-0.03, low[1] + 0.05, low[2]], s), this.p([-0.03, top[1] - 0.02, top[2]], s), this.p([0.03, top[1] - 0.02, top[2]], s), this.p([0.03, low[1] + 0.05, low[2]], s)], this.C("accent"), 0);
    const [sx, sy] = this.p(sm, s);
    this.fill.setColor(this.C("accent"));
    canvas.drawCircle(sx, sy - s * 0.06, s * 0.045, this.fill);
  }

  private drawHead(canvas: SkCanvas, sk: Skeleton, s: number, o: number) {
    const L = this.look;
    const [hx, hy] = this.p(sk.head, s);
    const r = BONES.head * s;
    const f = this.fill;
    const ring = (x: number, y: number, rad: number, color: SkColor) => {
      f.setColor(this.C("outline"));
      canvas.drawCircle(x, y, rad + o, f);
      f.setColor(color);
      canvas.drawCircle(x, y, rad, f);
    };
    // neck + ears
    this.capsule(canvas, this.p(sk.neck, s), [hx, hy + r * 0.6], r * 0.7, "skin", o);
    ring(hx - r * 0.95, hy + r * 0.1, r * 0.22, this.C("skin"));
    ring(hx + r * 0.95, hy + r * 0.1, r * 0.22, this.C("skin"));
    if (L.hairStyle === "hood") {
      ring(hx, hy, r * 1.18, this.C("top"));
      f.setColor(this.C("topDark"));
      canvas.drawCircle(hx + r * 0.35, hy + r * 0.2, r * 0.7, f);
      return;
    }
    ring(hx, hy, r, this.C("hair"));
    f.setColor(this.C("hairDark"));
    canvas.drawCircle(hx + r * 0.32, hy + r * 0.25, r * 0.6, f);
    f.setColor(this.C("hairLite"));
    canvas.drawCircle(hx - r * 0.4, hy - r * 0.45, r * 0.22, f);
    if (L.hairStyle === "spiky" || L.hairStyle === "mohawk") {
      const n = L.hairStyle === "mohawk" ? 3 : 5;
      for (let i = 0; i < n; i++) {
        const a = (L.hairStyle === "mohawk" ? -0.25 + i * 0.25 : -1.1 + i * 0.55) - Math.PI / 2;
        const bx = hx + Math.cos(a) * r * 0.75;
        const by = hy + Math.sin(a) * r * 0.75;
        const tx = hx + Math.cos(a) * r * 1.45;
        const ty = hy + Math.sin(a) * r * 1.45;
        const px = -Math.sin(a) * r * 0.3;
        const py = Math.cos(a) * r * 0.3;
        this.poly(canvas, [[bx - px, by - py], [tx, ty], [bx + px, by + py]], this.C("hair"), o * 0.8);
      }
    } else if (L.hairStyle === "ponytail") {
      this.capsule(canvas, [hx, hy + r * 0.2], [hx + r * 0.25, hy + r * 1.9], r * 0.55, "hair", o);
      ring(hx, hy + r * 0.25, r * 0.22, this.C("accent"));
    }
    if (L.headband) {
      this.line(canvas, [hx - r * 0.98, hy - r * 0.05], [hx + r * 0.98, hy - r * 0.05], r * 0.32, this.C("outline"));
      this.line(canvas, [hx - r * 0.95, hy - r * 0.05], [hx + r * 0.95, hy - r * 0.05], r * 0.22, this.C("band"));
      this.capsule(canvas, [hx + r * 0.7, hy], [hx + r * 1.5, hy + r * 0.55], r * 0.16, "band", o * 0.6);
    }
  }
}
