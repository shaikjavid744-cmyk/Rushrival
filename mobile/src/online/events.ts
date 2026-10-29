/** Cached active events (refreshed by the Events screen + at startup) so a finished run knows the event world. */
let active: { event_id: string; world: string }[] = [];
export const setActiveEvents = (evs: { event_id: string; world: string }[]) => {
  active = evs;
};
export const activeEventWorld = (): string | null => active[0]?.world ?? null;
