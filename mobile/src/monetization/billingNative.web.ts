import type { BillingAdapter } from "./billingCore";

/** Web preview: no Google Play Billing — the Mock adapter is used. */
export const createNativeBilling = (): BillingAdapter | null => null;
