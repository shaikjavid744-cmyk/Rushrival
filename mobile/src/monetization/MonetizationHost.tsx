import React, { useEffect, useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { mockBus, TEST_MODE_LABEL } from "@/src/monetization/mockBus";
import { productById } from "@/src/monetization/products";
import { monStore } from "@/src/monetization/store";
import { online } from "@/src/online/online";
import { ads } from "@/src/services/ads";
import { analytics } from "@/src/services/analytics";
import { billing } from "@/src/services/billing";
import { logger } from "@/src/services/logger";
import { useGame } from "@/src/state/GameProvider";
import { fonts, makeStyles, radius, spacing } from "@/src/theme";

/**
 * Monetization bootstrap + Mock adapter UI. On launch: load local monetization state, sync server
 * entitlements (refunds), reconcile unfinished store purchases. Renders every mock ad / purchase /
 * consent dialog with the "TEST MODE — no real ad / no real charge" label.
 */
export function MonetizationHost() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { save, applyGrant, showToast } = useGame();
  const req = useSyncExternalStore(mockBus.subscribe, mockBus.current);
  const mon = useSyncExternalStore(monStore.subscribe, monStore.get);
  const child = save.onboarding.childMode;

  useEffect(() => {
    ads.configure({ child, personalised: !child && !!save.settings.adPersonalisation });
  }, [child, save.settings.adPersonalisation]);
  useEffect(() => {
    analytics.setConsent(monStore.loaded() && mon.analytics && !child);
  }, [mon.analytics, child]);

  useEffect(() => {
    billing.setGrantHandler((p, v) => {
      const prod = productById(p.productId);
      if (!prod) return;
      if (online.signedIn) {
        void online.pull(); // the server already granted to the account
        return;
      }
      // restore of an already-processed non-consumable: items only, never currency again
      applyGrant(`iap:${p.token}`, v.status === "already_processed" ? { items: prod.grant.items } : prod.grant, "iap");
    });
    billing.onLateResult((kind) => {
      if (kind === "success") showToast("Purchase successful", "success");
      else if (kind === "deferred") showToast("We'll finish your purchase shortly", "info");
    });
    (async () => {
      await monStore.load();
      online.deviceId = monStore.get().deviceId;
      analytics.setConsent(monStore.get().analytics && !child);
      await billing.syncEntitlements();
      const n = await billing.reconcile();
      if (n) showToast(`Finished ${n} pending purchase${n > 1 ? "s" : ""}`, "success");
    })().catch((e) => logger.error(e, { where: "monetization.init" }));
    return () => billing.onLateResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!req) return null;
  const busy = req.kind === "ad" || req.kind === "interstitial";
  return (
    <View style={[StyleSheet.absoluteFill, s.scrim, { paddingTop: insets.top, paddingBottom: insets.bottom }]} testID="mock-dialog">
      <View style={s.card}>
        <View style={s.badge} testID="mock-test-mode-label">
          <Text style={s.badgeText}>{TEST_MODE_LABEL}</Text>
        </View>
        <Text style={s.title} testID="mock-dialog-title">{req.title}</Text>
        {busy ? <ActivityIndicator color={s.title.color as string} /> : null}
        <Text style={s.body}>{req.kind === "purchase" ? "Pick the Google Play outcome to simulate." : req.kind === "consent" ? "Simulated Google UMP consent form." : "Pick how the simulated ad ends."}</Text>
        {req.options.map((o) => (
          <Pressable key={o.key} onPress={() => mockBus.answer(o.key)} style={({ pressed }) => [s.opt, pressed && { opacity: 0.7 }]} testID={`mock-option-${o.key}`} accessibilityRole="button">
            <Text style={s.optText}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  scrim: { backgroundColor: c.overlayScrim, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  card: { width: "100%", maxWidth: 380, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 2, borderColor: c.warning, padding: spacing.lg, gap: spacing.sm },
  badge: { alignSelf: "flex-start", backgroundColor: c.warning, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  badgeText: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: c.surface },
  title: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface },
  body: { fontFamily: fonts.body, fontSize: 14, color: c.muted },
  opt: { minHeight: 48, borderRadius: radius.md, borderWidth: 2, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  optText: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: c.onSurface },
}));
