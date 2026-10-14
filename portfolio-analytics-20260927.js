/* Consent-first GA4 measurement. Copy into a site's public root, configure with script data attributes. */
(() => {
  'use strict';
  const script = document.currentScript;
  const id = script?.dataset.measurementId;
  const item = script?.dataset.itemId;
  const price = Number(script?.dataset.price || 0);
  const productPath = script?.dataset.productPath;
  const offerSelector = script?.dataset.offerSelector;
  const checkoutSelector = script?.dataset.checkoutSelector;
  const privacyPath = script?.dataset.privacyPath || '/';
  if (!/^G-[A-Z0-9]+$/.test(id || '') || !item || !productPath) return;

  const params = new URLSearchParams(location.search);
  const qa = params.get('qa') === '1';
  try { if (qa) sessionStorage.setItem('portfolio_ga4_qa', '1'); } catch (_) {}
  let isQa = qa;
  try { isQa ||= sessionStorage.getItem('portfolio_ga4_qa') === '1'; } catch (_) {}
  const signal = [navigator.doNotTrack, window.doNotTrack, navigator.msDoNotTrack];
  const suppressed = isQa || signal.some(v => v === '1' || v === 'yes') || navigator.globalPrivacyControl === true;
  const key = 'portfolio_ga4_consent_v1';
  let choice = null;
  try { choice = localStorage.getItem(key); } catch (_) {}
  let loaded = false;
  let lastCheckout = 0;

  function event(name, placement) {
    if (!loaded || typeof window.gtag !== 'function') return;
    const data = {
      site_id: location.hostname.replace(/^www\./, ''),
      product_id: item,
      item_id: item,
      placement: placement || 'page',
      event_schema_version: '1',
      qa: 'false'
    };
    if (name === 'begin_checkout') {
      data.currency = 'USD';
      data.value = price;
      data.items = [{ item_id: item, price, quantity: 1 }];
    }
    window.gtag('event', name, data);
  }
  window.portfolioAnalytics = { event };

  function load() {
    if (suppressed || loaded) return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('consent', 'default', {
      analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'
    });
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    const safeUrl = new URL(location.origin + location.pathname);
    for (const name of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const value = params.get(name);
      if (value && /^[\w .-]{1,80}$/.test(value)) safeUrl.searchParams.set(name, value);
    }
    const referring = document.referrer ? new URL(document.referrer) : null;
    const safeReferrer = referring ? referring.origin + (referring.origin === location.origin ? referring.pathname : '') : '';
    window.gtag('config', id, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      transport_type: 'beacon',
      page_location: safeUrl.href,
      page_referrer: safeReferrer
    });
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(tag);
    observeOffer();
  }

  function observeOffer() {
    if (!offerSelector || location.pathname.replace(/\/$/, '') !== productPath.replace(/\/$/, '')) return;
    const target = document.querySelector(offerSelector);
    if (!target) return;
    let timer;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting && entries[0].intersectionRatio >= 0.25) {
        timer ||= setTimeout(() => { event('offer_view', 'offer_page'); observer.disconnect(); }, 1000);
      } else if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    }, { threshold: [0, 0.25, 1] });
    observer.observe(target);
  }

  function renderChoice() {
    if (suppressed || choice === 'yes' || choice === 'no') return;
    const box = document.createElement('aside');
    box.id = 'portfolio-analytics-choice';
    box.setAttribute('aria-label', 'Analytics choice');
    box.style.cssText = 'position:fixed;z-index:2147483646;bottom:12px;left:12px;right:12px;max-width:540px;padding:14px 16px;border:1px solid #bbb;border-radius:10px;background:#fff;color:#17212b;box-shadow:0 5px 25px #0003;font:14px/1.5 system-ui,sans-serif';
    const copy = document.createElement('span');
    copy.textContent = 'Optional analytics help us see which calculators and offers work. We never send your calculator inputs.';
    const link = document.createElement('a');
    link.href = privacyPath;
    link.textContent = ' Privacy details';
    link.style.cssText = 'color:#185b68;text-decoration:underline';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;margin-top:9px';
    for (const [label, value] of [['Allow analytics', 'yes'], ['Decline', 'no']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText = 'padding:7px 11px;border:1px solid #64717c;border-radius:6px;background:' + (value === 'yes' ? '#185b68;color:white' : '#fff;color:#17212b') + ';cursor:pointer;font:600 13px system-ui,sans-serif';
      button.addEventListener('click', () => {
        choice = value;
        try { localStorage.setItem(key, value); } catch (_) {}
        box.remove();
        if (value === 'yes') load();
      });
      actions.appendChild(button);
    }
    box.append(copy, link, actions);
    document.body.appendChild(box);
  }

  function attach() {
    if (suppressed) return;
    if (choice === 'yes') load();
    else renderChoice();
    const footer = document.querySelector('footer');
    if (footer) {
      const settings = document.createElement('button');
      settings.type = 'button';
      settings.textContent = 'Analytics settings';
      settings.style.cssText = 'margin:10px 0;padding:5px 8px;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit;cursor:pointer;font:inherit';
      settings.addEventListener('click', () => {
        try { localStorage.removeItem(key); } catch (_) {}
        location.reload();
      });
      footer.appendChild(settings);
    }
    if (checkoutSelector) {
      document.addEventListener('submit', e => {
        const form = e.target.closest?.(checkoutSelector);
        if (form && !form.querySelector('button[type="submit"]:disabled')) {
          const now = Date.now();
          if (now - lastCheckout > 1000) { event('begin_checkout', 'offer_page'); lastCheckout = now; }
        }
      }, true);
      document.addEventListener('click', e => {
        const button = e.target.closest?.(checkoutSelector);
        if (button?.tagName === 'BUTTON' && !button.disabled) {
          const now = Date.now();
          if (now - lastCheckout > 1000) { event('begin_checkout', 'offer_page'); lastCheckout = now; }
        }
      }, true);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
})();
