/** Mock dialog bus: mock ad / purchase / consent adapters ask the on-screen MockHost for an outcome. */
export interface MockOption {
  key: string;
  label: string;
}
export interface MockRequest {
  id: number;
  kind: "ad" | "interstitial" | "purchase" | "consent";
  title: string;
  options: MockOption[];
}
let current: (MockRequest & { resolve: (k: string) => void }) | null = null;
let seq = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const mockBus = {
  current: () => current,
  subscribe(f: () => void) {
    subs.add(f);
    return () => void subs.delete(f);
  },
  ask(kind: MockRequest["kind"], title: string, options: MockOption[]): Promise<string> {
    current?.resolve(options[options.length - 1].key); // never stack dialogs
    return new Promise((resolve) => {
      current = { id: ++seq, kind, title, options, resolve };
      emit();
    });
  },
  answer(key: string) {
    const c = current;
    current = null;
    emit();
    c?.resolve(key);
  },
};
export const TEST_MODE_LABEL = "TEST MODE — no real ad / no real charge";
