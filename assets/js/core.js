/* KADR — shared UI helpers, security config and utilities */
(function () {
  'use strict';

  /* Optional bot protection.
     Put a Cloudflare Turnstile site key here (and enable the widget in form.js)
     when the site is connected to a real backend. Empty key = local checks only. */
  window.KADR_CONFIG = {
    turnstileSiteKey: '',
    minFillMs: 3000,
    submitCooldownMs: 30000
  };

  window.KADR = window.KADR || {};

  window.KADR.escapeHtml = function (value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };

  window.KADR.formatMoney = function (value) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(value || 0));
  };

  window.KADR.isYandexLink = function (value) {
    var s = String(value || '').trim();
    if (!/^https?:\/\//i.test(s)) return false;
    try {
      var u = new URL(s);
      var host = u.hostname.toLowerCase();
      return /(^|\.)(yandex\.[a-z.]+|yadi\.sk)$/.test(host) && /\/(disk|public|d)\//i.test(u.pathname + '/') || host === 'yadi.sk';
    } catch (e) {
      return false;
    }
  };

  window.KADR.isPhone = function (value) {
    var d = String(value || '').replace(/\D/g, '');
    if (d.length === 11 && (d[0] === '7' || d[0] === '8')) return true;
    return d.length === 10;
  };

  window.KADR.isEmail = function (value) {
    return /^[^\s@]+@[^\s@]+\.[a-zA-ZА-Яа-яЁё]{2,}$/.test(String(value || '').trim());
  };

  window.KADR.toast = function (message, isError) {
    var wrap = document.querySelector('.toast-wrap');
    if (!wrap) return;
    var el = document.createElement('div');
    el.className = 'toast' + (isError ? ' is-error' : '');
    el.setAttribute('role', 'status');
    el.textContent = message;
    wrap.appendChild(el);
    window.setTimeout(function () {
      el.classList.add('is-out');
      window.setTimeout(function () { el.remove(); }, 350);
    }, 3600);
  };

  window.KADR.animateNumber = function (el, from, to, duration) {
    if (!el) return;
    var start = performance.now();
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { el.textContent = window.KADR.formatMoney(to); return; }
    function tick(now) {
      var p = Math.min(1, (now - start) / (duration || 480));
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = window.KADR.formatMoney(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };

  function initHeader() {
    var header = document.querySelector('.site-header');
    var burger = document.querySelector('.burger');
    var nav = document.querySelector('.site-nav');
    if (header) {
      var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 30); };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    if (burger && nav) {
      burger.addEventListener('click', function () {
        var open = nav.classList.toggle('is-open');
        burger.classList.toggle('is-open', open);
        burger.setAttribute('aria-expanded', String(open));
      });
      nav.addEventListener('click', function (e) {
        if (e.target.closest('a')) {
          nav.classList.remove('is-open');
          burger.classList.remove('is-open');
          burger.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  function scrollToHash(hash, smooth) {
    var header = document.querySelector('.site-header');
    var target;
    try { target = document.getElementById(decodeURIComponent(hash)); } catch (err) { return false; }
    if (!target) return false;

    var anchor = target.querySelector('[data-scroll-anchor]') ||
      target.querySelector('.eyebrow, h2, .calc-shell') ||
      target;
    var offset = (header ? header.offsetHeight : 0) + 18;
    var top = target.id === 'top'
      ? 0
      : Math.max(0, window.scrollY + anchor.getBoundingClientRect().top - offset);

    window.scrollTo({ top: top, behavior: smooth ? 'smooth' : 'instant' });
    return true;
  }

  function initAnchorOffset() {
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var link = e.target.closest('a[href^="#"]');
      if (!link) return;
      var hash = link.getAttribute('href').slice(1);
      if (!hash || !scrollToHash(hash, true)) return;

      e.preventDefault();
      if (window.history && history.replaceState) history.replaceState(null, '', '#' + hash);
    });
  }

  function initHashOnLoad() {
    var hash = window.location.hash.slice(1);
    if (!hash) return;

    var run = function () {
      scrollToHash(hash, false);
      window.requestAnimationFrame(function () { scrollToHash(hash, false); });
    };

    var afterReady = function () {
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
      else run();
    };

    if (document.readyState === 'complete') afterReady();
    else window.addEventListener('load', afterReady, { once: true });
  }

  function initReveal() {
    var items = document.querySelectorAll('.reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
    items.forEach(function (el, i) {
      el.style.transitionDelay = (Math.min(i % 4, 3) * 0.07) + 's';
      observer.observe(el);
    });
  }

  function initHeroGallery() {
    var stack = document.getElementById('hero-stack');
    if (!stack) return;
    var cards = Array.prototype.slice.call(stack.querySelectorAll('.hero-card'));
    if (!cards.length) return;
    var outlineStack = document.getElementById('hero-stack-outline');
    var outlines = outlineStack
      ? Array.prototype.slice.call(outlineStack.querySelectorAll('.hero-outline-card'))
      : [];

    var order = cards.map(function (_, i) { return i; });

    function render() {
      order.forEach(function (cardIndex, position) {
        var card = cards[cardIndex];
        card.dataset.pos = String(position);
        card.setAttribute('aria-hidden', position === 0 ? 'false' : 'true');
        card.tabIndex = position === 0 ? 0 : -1;
        if (outlines[cardIndex]) outlines[cardIndex].dataset.pos = String(position);
      });
    }

    function bringForward(target) {
      if (target === order[0]) target = order[1];
      order = [target].concat(order.filter(function (i) { return i !== target; }));
      render();
    }

    stack.addEventListener('click', function (e) {
      var card = e.target.closest('.hero-card');
      bringForward(card ? Number(card.dataset.index) : order[1]);
    });

    render();
  }

  function initFooterYear() {
    var y = document.querySelector('[data-year]');
    if (y) y.textContent = String(new Date().getFullYear());
  }

  function initPromoClock() {
    var badge = document.querySelector('[data-evening-status]');
    if (!badge) return;
    function update() {
      var h = new Date().getHours();
      var active = h >= 20 && h < 23;
      badge.textContent = active ? 'Скидка активна сейчас' : 'С 20:00 до 23:00';
      badge.style.color = active ? '' : '';
      document.querySelectorAll('[data-evening-flash]').forEach(function (el) {
        el.hidden = !active;
      });
      if (window.KADR.refreshSummary) window.KADR.refreshSummary();
    }
    update();
    window.setInterval(update, 60000);
  }

  document.addEventListener('DOMContentLoaded', function () {
    initHeader();
    initAnchorOffset();
    initHashOnLoad();
    initHeroGallery();
    initReveal();
    initFooterYear();
    initPromoClock();
  });
})();
