/**
 * 3D GPU-resource lifecycle (REQ-249).
 * - App goes to background/inactive → release the GL scene (geometries, materials, textures, render targets, context).
 * - App returns to active → recreate it (new GLView context → new ThreeRenderer → onReady again).
 * - OS low-memory warning → release immediately, then rebuild after a short delay if the app is still in front.
 * The run itself is paused by RunScreen's own AppState listener, so the engine state is untouched.
 */
export type GLLife = "live" | "suspended";
export type GLEvent = "active" | "background" | "inactive" | "memoryWarning" | "restore";

export const MEMORY_RESTORE_MS = 400;

export function nextGLLife(state: GLLife, ev: GLEvent, appActive: boolean): GLLife {
  switch (ev) {
    case "background":
    case "inactive":
    case "memoryWarning":
      return "suspended";
    case "active":
      return "live";
    case "restore":
      return appActive ? "live" : state;
  }
}

interface Disposable {
  dispose?: () => void;
}
interface Node3D {
  children?: Node3D[];
  geometry?: Disposable;
  material?: (Disposable & Record<string, unknown>) | (Disposable & Record<string, unknown>)[];
}

/** Dispose every geometry, material and material texture under `root` (each once). Returns the count. */
export function disposeTree(root: Node3D): number {
  const seen = new Set<unknown>();
  const once = (d?: Disposable) => {
    if (!d || seen.has(d) || typeof d.dispose !== "function") return;
    seen.add(d);
    d.dispose();
  };
  const walk = (n: Node3D) => {
    once(n.geometry);
    for (const m of Array.isArray(n.material) ? n.material : n.material ? [n.material] : []) {
      for (const v of Object.values(m)) if (v && typeof v === "object" && (v as { isTexture?: boolean }).isTexture) once(v as Disposable);
      once(m);
    }
    n.children?.forEach(walk);
  };
  walk(root);
  return seen.size;
}
