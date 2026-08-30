// Who an evaluator reaches when something goes wrong mid-session.
//
// Kept in one place because it appears in the evaluator UI and will need to
// change (a different name, a different number, eventually a per-service-provider
// contact) without hunting through components.
//
// The realistic failure at a rink is not a bug report -- it is "I cannot log in
// and the session starts in four minutes". That needs a phone call, not a form,
// so the number is a real tel: link and the text link is a genuine SMS.
export const SUPPORT_NAME = "Dan";
export const SUPPORT_PHONE_DISPLAY = "780-937-5795";
// E.164 for tel:/sms: so it dials correctly from any handset.
export const SUPPORT_PHONE_E164 = "+17809375795";

/**
 * Prefill a support text with what Dan would otherwise have to ask for.
 * An evaluator texting from the ice will not think to include the division or
 * the session, and without them the first two replies are always the same two
 * questions.
 */
export function supportSmsHref({ evaluatorName, orgName, categoryName, sessionNumber } = {}) {
  const bits = [
    evaluatorName ? `${evaluatorName} here.` : null,
    [orgName, categoryName].filter(Boolean).join(" "),
    sessionNumber != null ? `Session ${sessionNumber}` : null,
  ].filter(Boolean).join(" · ");
  const body = bits ? `Sideline Star — ${bits}. ` : "Sideline Star — ";
  // iOS wants &body=, Android accepts ?body=; "?" works on both in practice.
  return `sms:${SUPPORT_PHONE_E164}?body=${encodeURIComponent(body)}`;
}

export function supportTelHref() {
  return `tel:${SUPPORT_PHONE_E164}`;
}
