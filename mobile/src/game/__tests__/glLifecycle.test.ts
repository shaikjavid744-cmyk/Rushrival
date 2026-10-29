import { disposeTree, nextGLLife } from "../three/glLifecycle";

describe("3D lifecycle (REQ-249)", () => {
  it("suspends on background/inactive/low memory and restores on resume", () => {
    expect(nextGLLife("live", "background", false)).toBe("suspended");
    expect(nextGLLife("live", "inactive", false)).toBe("suspended");
    expect(nextGLLife("suspended", "active", true)).toBe("live");
    expect(nextGLLife("live", "memoryWarning", true)).toBe("suspended");
    expect(nextGLLife("suspended", "restore", true)).toBe("live"); // low-memory rebuild while still in front
    expect(nextGLLife("suspended", "restore", false)).toBe("suspended"); // ...but not while backgrounded
  });

  it("disposes every geometry, material and texture exactly once", () => {
    const mk = () => ({ dispose: jest.fn() });
    const tex = { ...mk(), isTexture: true };
    const sharedMat = { ...mk(), map: tex, color: { r: 1 } };
    const geo = mk();
    const scene = {
      children: [
        { geometry: geo, material: sharedMat },
        { geometry: geo, material: [sharedMat, mk()], children: [{ geometry: mk(), material: { ...mk(), emissiveMap: tex } }] },
      ],
    };
    const n = disposeTree(scene);
    expect(geo.dispose).toHaveBeenCalledTimes(1);
    expect(sharedMat.dispose).toHaveBeenCalledTimes(1);
    expect(tex.dispose).toHaveBeenCalledTimes(1);
    expect(n).toBe(6);
  });
});
