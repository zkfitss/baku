(() => {
  "use strict";
  const API = "/api";
  const SESSION_KEY = "zkfits_analytics_session";
  const ATTR_KEY = "zkfits_analytics_attribution";
  const safe = (value, max = 180) => String(value || "").slice(0, max);
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  let sessionId = "";
  try {
    sessionId = sessionStorage.getItem(SESSION_KEY) || uuid();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  } catch { sessionId = uuid(); }

  const params = new URLSearchParams(location.search);
  let attribution = {};
  try { attribution = JSON.parse(localStorage.getItem(ATTR_KEY) || "{}"); } catch {}
  const hasCampaign = ["utm_source", "utm_medium", "utm_campaign"].some(key => params.has(key));
  const referrer = document.referrer || "";
  const refHost = (() => { try { return referrer ? new URL(referrer).hostname.replace(/^www\./, "") : ""; } catch { return ""; } })();
  if (hasCampaign || !attribution.source) {
    attribution = {
      source: safe(params.get("utm_source") || (refHost && !refHost.includes("zkfitss.com") ? refHost : "direct"), 100),
      medium: safe(params.get("utm_medium") || (refHost ? "referral" : "none"), 100),
      campaign: safe(params.get("utm_campaign"), 120),
      referrer: safe(refHost, 180),
      landing_page: safe(location.pathname + location.search, 300),
      first_seen: new Date().toISOString()
    };
    try { localStorage.setItem(ATTR_KEY, JSON.stringify(attribution)); } catch {}
  }

  async function track(eventName, details = {}) {
    const payload = {
      event_name: eventName,
      session_id: sessionId,
      page_path: safe(location.pathname, 300),
      page_title: safe(document.title, 180),
      referrer: safe(refHost || attribution.referrer, 180),
      source: safe(attribution.source || "direct", 100),
      medium: safe(attribution.medium || "none", 100),
      campaign: safe(attribution.campaign, 120),
      landing_page: safe(attribution.landing_page || location.pathname, 300),
      product_id: safe(details.product_id, 100),
      product_name: safe(details.product_name, 180),
      value: Number(details.value || 0) || 0
    };
    try {
      window.dispatchEvent(new CustomEvent("zk:analytics-event", { detail: { ...payload, ...details } }));
      await fetch(`${API}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", keepalive: true, body: JSON.stringify(payload) });
    } catch {}
  }
  function getAttribution() { return { ...attribution, session_id: sessionId }; }
  window.ZKAnalytics = { track, getAttribution };

  const productId = params.get("id") || params.get("product") || params.get("product_id") || "";
  track("page_view");

  document.addEventListener("click", event => {
    const checkout = event.target.closest("#checkoutButton, [data-checkout], .buy-now, #buyNowButton");
    if (checkout) track("checkout_start");
  });
})();
