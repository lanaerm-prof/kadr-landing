/* KADR — Yandex Forms integration. Service identifiers are kept only here. */
(function () {
  'use strict';

  var FORM_ID = '6afde6720b9e5f837312b194';

  var QUESTION = {
    name: 'answer_short_text_9008994280107440',
    phone: 'answer_phone_9008994280136072',
    email: 'answer_non_profile_email_9008994280158836',
    amount: 'answer_short_text_9008994281522120',
    pickup: 'answer_dropdown_9008994280247024',
    link: 'answer_link_9008994280399320'
  };

  var PICKUP_OPTION = {
    center: '9008994280247034',
    north: '1795026256661',
    south: '1795026274570'
  };

  var FORM_ORIGIN = 'https://forms.yandex.ru';
  var SUCCESS_EVENTS = ['messages-iframe', 'redirect-iframe'];
  var currentIframe = null;
  var submitted = false;

  function enc(value) {
    return encodeURIComponent(String(value == null ? '' : value));
  }

  function pickupAnswer(value) {
    var text = String(value || '');
    if (text.indexOf('ЦЕНТР') === 0) return PICKUP_OPTION.center;
    if (text.indexOf('СЕВЕР') === 0) return PICKUP_OPTION.north;
    if (text.indexOf('ЮГ') === 0) return PICKUP_OPTION.south;
    return '';
  }

  function buildUrl(data) {
    data = data || {};
    var query = ['iframe=1'];

    function add(question, value) {
      var clean = String(value == null ? '' : value).trim();
      if (clean) query.push(enc(question) + '=' + enc(clean));
    }

    add(QUESTION.name, data.name);
    add(QUESTION.phone, data.phone);
    add(QUESTION.email, data.email);
    add(QUESTION.amount, data.amount);
    add(QUESTION.pickup, pickupAnswer(data.pickup));
    add(QUESTION.link, data.link);

    return 'https://forms.yandex.ru/cloud/' + enc(FORM_ID) + '/?' + query.join('&');
  }

  function messageName(data) {
    if (typeof data === 'string') {
      try {
        var parsed = JSON.parse(data);
        if (parsed && typeof parsed.message === 'string') return parsed.message;
      } catch (e) { /* plain string message */ }
      return data;
    }
    if (data && typeof data.message === 'string') return data.message;
    if (data && typeof data.type === 'string') return data.type;
    return '';
  }

  window.addEventListener('message', function (event) {
    if (!currentIframe || event.source !== currentIframe.contentWindow) return;
    if (event.origin !== FORM_ORIGIN) return;

    var name = messageName(event.data);

    try {
      var data = JSON.parse(event.data);
      var height = Number(data['iframe-height']);
      if (height > 400) currentIframe.style.height = Math.min(height, 6000) + 'px';
    } catch (e) { /* ignore unrelated messages */ }

    if (!submitted && SUCCESS_EVENTS.indexOf(name) !== -1) {
      submitted = true;
      document.dispatchEvent(new CustomEvent('kadr:yandex-form-submitted'));
    }
  }, false);

  window.KADR_YANDEX_FORM = {
    buildUrl: buildUrl,
    mount: function (host, data) {
      if (!host || !window.KADR_YANDEX_FORM) return null;
      var iframe = document.createElement('iframe');
      iframe.className = 'yandex-form-iframe';
      iframe.src = buildUrl(data);
      iframe.name = 'ya-form-' + FORM_ID;
      iframe.title = 'Форма заказа KADR';
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('scrolling', 'no');
      iframe.referrerPolicy = 'no-referrer';
      submitted = false;
      currentIframe = iframe;
      host.textContent = '';
      host.appendChild(iframe);
      return iframe;
    }
  };
})();
