/* ZK FITSS: dynamically configured marketing integrations. */
(() => {
  'use strict';
  const queue = [];
  let ready = false;
  let ids = {};
  const currency = 'PKR';
  const loadScript = (src, key) => {
    if (document.querySelector(`[data-zk-marketing="${key}"]`)) return;
    const script = document.createElement('script');
    script.async = true; script.src = src; script.dataset.zkMarketing = key;
    document.head.appendChild(script);
  };
  function init(config) {
    ids = {
      ga4: String(config.marketing_ga4_id || '').trim(),
      googleAds: String(config.marketing_google_ads_id || '').trim(),
      googleAdsLabel: String(config.marketing_google_ads_label || '').trim(),
      meta: String(config.marketing_meta_pixel_id || '').trim(),
      tiktok: String(config.marketing_tiktok_pixel_id || '').trim()
    };
    window.ZK_MARKETING_IDS = ids;
    const googleId = ids.ga4 || ids.googleAds;
    if (googleId) {
      loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleId)}`, 'google');
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      if (ids.ga4) window.gtag('config', ids.ga4, { send_page_view: false });
      if (ids.googleAds) window.gtag('config', ids.googleAds);
    }
    if (ids.meta && !window.fbq) {
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', ids.meta);
    }
    if (ids.tiktok && !window.ttq) {
      !function(w,d,t){w.TiktokAnalyticsObject=t;const ttq=w[t]=w[t]||[];ttq.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie','holdConsent','revokeConsent','grantConsent'];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(let i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e){const s=d.createElement('script');s.async=!0;s.src='https://analytics.tiktok.com/i18n/pixel/events.js?sdkid='+e+'&lib='+t;const x=d.getElementsByTagName('script')[0];x.parentNode.insertBefore(s,x)};ttq.load(ids.tiktok)}(window,document,'ttq');
    }
    ready = true;
    while (queue.length) emit(queue.shift());
  }
  function emit(detail = {}) {
    const name = detail.event_name || '';
    const value = Number(detail.value || 0);
    const orderId = String(detail.order_id || '');
    const items = detail.product_id ? [{item_id:String(detail.product_id),item_name:String(detail.product_name||''),price:value,quantity:1}] : [];
    if (window.gtag) {
      const eventName = ({page_view:'page_view',product_view:'view_item',add_to_cart:'add_to_cart',checkout_start:'begin_checkout',purchase:'purchase'})[name];
      if (eventName && ids.ga4) window.gtag('event', eventName, {currency,value,items,page_location:location.href,transaction_id:orderId});
      if (name === 'purchase' && ids.googleAds && ids.googleAdsLabel) window.gtag('event','conversion',{send_to:`${ids.googleAds}/${ids.googleAdsLabel}`,value,currency,transaction_id:orderId});
    }
    if (window.fbq) {
      const eventName = ({page_view:'PageView',product_view:'ViewContent',add_to_cart:'AddToCart',checkout_start:'InitiateCheckout',purchase:'Purchase'})[name];
      if (eventName) window.fbq('track',eventName,{content_ids:detail.product_id?[String(detail.product_id)]:[],content_name:String(detail.product_name||''),content_type:'product',value,currency,order_id:orderId});
    }
    if (window.ttq) {
      const eventName = ({page_view:'PageView',product_view:'ViewContent',add_to_cart:'AddToCart',checkout_start:'InitiateCheckout',purchase:'CompletePayment'})[name];
      if (eventName) window.ttq.track(eventName,{content_id:String(detail.product_id||''),content_name:String(detail.product_name||''),content_type:'product',quantity:1,price:value,value,currency,order_id:orderId});
    }
  }
  document.addEventListener('zk:analytics-event', event => {
    const detail = event.detail || {};
    if (!ready) queue.push(detail); else emit(detail);
  });
  fetch('/api/store', {credentials:'same-origin'})
    .then(response => { if (!response.ok) throw new Error('Store settings unavailable'); return response.json(); })
    .then(data => init(data.settings || {}))
    .catch(() => { ready = true; });
})();
