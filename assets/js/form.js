/* KADR — embeds the Yandex Form and transfers calculator parameters into it */
(function () {
  'use strict';

  var $ = function (selector) { return document.querySelector(selector); };
  var cfg = window.KADR_CONFIG || {};
  var submitCooldownMs = Number(cfg.submitCooldownMs) || 30000;
  var redirecting = false;
  var formToken = null;

  function value(selector) {
    var el = $(selector);
    return el ? String(el.value || '').trim() : '';
  }

  function safe(value, max) {
    return String(value == null ? '' : value)
      .replace(/[\x00-\x1F\x7F]/g, '')
      .trim()
      .slice(0, max || 120);
  }

  function honeypotFilled() {
    var el = $('#order-website');
    return !!el && !!String(el.value || '').trim();
  }

  function cooldownActive() {
    try {
      var last = Number(localStorage.getItem('kadr_last_submit') || 0);
      return last > 0 && Date.now() - last < submitCooldownMs;
    } catch (e) {
      return false;
    }
  }

  function canMount() {
    if (honeypotFilled()) return false;
    if (cooldownActive()) {
      KADR.toast('Слишком часто. Подожди немного перед новой заявкой.', true);
      return false;
    }
    return true;
  }

  function prefill() {
    var amount = Number(value('#order-amount'));
    return {
      amount: amount > 0 && isFinite(amount) ? Math.min(amount, 100000000) : ''
    };
  }

  function mountForm() {
    var host = $('#yandex-form-host');
    if (!host || !window.KADR_YANDEX_FORM || !canMount()) return;
    formToken = 'kadr-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    window.KADR_YANDEX_FORM.mount(host, prefill());
  }

  function scrollToForm() {
    var target = $('#order-form');
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function makeOrderNumber() {
    var d = new Date();
    function pad(v) { return String(v).padStart(2, '0'); }
    var date = String(d.getFullYear()) + pad(d.getMonth() + 1) + pad(d.getDate());
    var rand = String(Math.floor(1000 + Math.random() * 9000));
    return 'KDR-' + date + '-' + rand;
  }

  function saveOrder(order) {
    try {
      var all = JSON.parse(localStorage.getItem('kadr_orders') || '[]');
      if (!Array.isArray(all)) all = [];
      all.push(order);
      localStorage.setItem('kadr_orders', JSON.stringify(all.slice(-20)));
      localStorage.setItem('kadr_last_order', JSON.stringify(order));
      localStorage.setItem('kadr_last_submit', String(Date.now()));
    } catch (e) { /* storage unavailable — success page still shows the query number */ }
  }

  function finishOrder() {
    if (redirecting || !formToken) return;
    formToken = null;
    redirecting = true;

    var number = makeOrderNumber();
    var order = {
      number: number,
      createdAt: new Date().toISOString(),
      name: '—',
      phone: '—',
      email: '—',
      pickup: '—',
      link: '—',
      amount: safe(value('#order-amount'), 20) || '0',
      prints: safe(value('#order-prints'), 12) || '0',
      photos: safe(value('#order-photos'), 12) || '0',
      format: safe(value('#order-format'), 80) || '—',
      paper: safe(value('#order-paper'), 80) || '—',
      crop: safe(value('#order-crop'), 400) || '—',
      frame: safe(value('#order-frame'), 40),
      promo: safe(value('#order-promo'), 4) || '0'
    };

    saveOrder(order);
    KADR.toast('Заказ оформлен');
    window.setTimeout(function () {
      window.location.href = 'order.html?n=' + encodeURIComponent(number);
    }, 700);
  }

  function init() {
    var host = $('#yandex-form-host');
    if (!host || !window.KADR_YANDEX_FORM) return;

    mountForm();

    document.addEventListener('kadr:yandex-form-submitted', finishOrder);

    document.addEventListener('kadr:order-ready', function () {
      mountForm();
      scrollToForm();
    });

    var jump = $('[data-scroll-form]');
    if (jump) jump.addEventListener('click', function () {
      mountForm();
      scrollToForm();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
