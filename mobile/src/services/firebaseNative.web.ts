/** Web preview: Firebase native SDKs are unavailable. */
let said = false;
export function firebase(): null {
  if (!said) console.log("[rr] Firebase not configured");
  said = true;
  return null;
}
