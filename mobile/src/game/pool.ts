// Fixed-size object pool (grows only if exhausted) to avoid per-frame allocations.
export class Pool<T extends { active: boolean }> {
  readonly items: T[] = [];

  constructor(
    size: number,
    private readonly factory: () => T,
  ) {
    for (let i = 0; i < size; i++) this.items.push(factory());
  }

  acquire(): T {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (!it.active) {
        it.active = true;
        return it;
      }
    }
    const it = this.factory();
    it.active = true;
    this.items.push(it);
    return it;
  }

  release(item: T) {
    item.active = false;
  }

  releaseAll() {
    for (const it of this.items) it.active = false;
  }

  get activeCount(): number {
    let n = 0;
    for (const it of this.items) if (it.active) n++;
    return n;
  }
}
