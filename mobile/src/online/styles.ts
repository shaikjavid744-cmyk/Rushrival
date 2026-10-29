import { fonts, makeStyles, radius, spacing } from "@/src/theme";

/** Shared styles for the online screens (account, leaderboard, events, support). */
export const useOnlineStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["2xl"] },
  card: { backgroundColor: c.hudPanel, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: c.border },
  title: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface },
  text: { fontFamily: fonts.body, fontSize: 14, color: c.onSurface, lineHeight: 20 },
  muted: { fontFamily: fonts.body, fontSize: 13, color: c.muted, lineHeight: 18 },
  error: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: c.error },
  ok: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: c.success },
  input: { minHeight: 48, borderRadius: radius.sm, borderWidth: 1, borderColor: c.borderStrong, paddingHorizontal: spacing.md, color: c.onSurface, fontFamily: fonts.body, fontSize: 16, backgroundColor: c.surface },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  tabs: { flexDirection: "row", gap: spacing.sm },
  tab: { flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  tabOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  tabText: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: c.onSurface },
  link: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: c.accent, paddingVertical: spacing.sm },
  lbRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: c.hudPanel },
  lbMe: { borderWidth: 2, borderColor: c.gold },
  rank: { width: 40, fontFamily: fonts.display, fontSize: 16, color: c.gold },
  name: { flex: 1, fontFamily: fonts.bodyHeavy, fontSize: 15, color: c.onSurface },
  score: { fontFamily: fonts.display, fontSize: 16, color: c.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
}));
