/* KADR — success page: order number only */
(function () {
  'use strict';

  function $(selector) { return document.querySelector(selector); }

  function makeOrderNumber() {
    var d = new Date();
    function pad(v) { return String(v).padStart(2, '0'); }
    var date = String(d.getFullYear()) + pad(d.getMonth() + 1) + pad(d.getDate());
    var rand = String(Math.floor(1000 + Math.random() * 9000));
    return 'KDR-' + date + '-' + rand;
  }

  function init() {
    var params = new URLSearchParams(window.location.search);
    var number = params.get('n') || makeOrderNumber();
    var el = $('#success-number');
    if (el) el.textContent = number;

    try {
      localStorage.setItem('kadr_last_order', JSON.stringify({
        number: number,
        createdAt: new Date().toISOString()
      }));
    } catch (e) { /* ignore */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
