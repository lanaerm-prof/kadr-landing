/* KADR — calculator. Prices are taken from прайс-листа (лист с ценами).
   Small formats: tiers 500 / 200 / от 50 / до 50 + column «СЕГОДНЯ» (срочная печать).
   Large formats: печать на фотобумаге 170/180 и холст 260, цена за лист. */
(function () {
  'use strict';

  var MAX_QTY = 999;
  var MAX_FILE_SIZE = 20 * 1024 * 1024;
  var ALLOWED_IMAGE_TYPES = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1 };

  function safeName(name) { return String(name || 'без имени').slice(0, 120); }

  var SMALL = {
    a6: {
      label: '10×15', name: 'А6 (10×15)',
      matte: [14, 16, 18, 20], gloss: [14, 16, 18, 20], canvas: null,
      rush: { matte: 25, gloss: 25 }, ratio: '3 / 2'
    },
    a5: {
      label: '15×21', name: 'А5 (15×21)',
      matte: [30, 35, 35, 40], gloss: [30, 35, 35, 40], canvas: null,
      rush: { matte: 50, gloss: 50 }, ratio: '7 / 5'
    },
    a4: {
      label: '21×30', name: 'А4 (21×30)',
      matte: [55, 55, 62, 63], gloss: [55, 55, 62, 63], canvas: [80, 80, 90, 95],
      rush: { matte: 70, gloss: 70, canvas: 110 }, ratio: '10 / 7'
    }
  };

  var LARGE = {
    'l40x40': { label: '40×40', name: '40×40 см', matte: 280, canvas: 870, ratio: '1 / 1' },
    'l40x50': { label: '40×50', name: '40×50 см', matte: 300, canvas: 950, ratio: '5 / 4' },
    'l40x60': { label: '40×60', name: '40×60 (A2)', matte: 320, canvas: 980, ratio: '3 / 2' },
    'l50x50': { label: '50×50', name: '50×50 см', matte: 350, canvas: 1150, ratio: '1 / 1' },
    'l50x60': { label: '50×60', name: '50×60 см', matte: 380, canvas: 1200, ratio: '6 / 5' },
    'l50x70': { label: '50×70', name: '50×70 см', matte: 420, canvas: 1450, ratio: '7 / 5' },
    'l60x60': { label: '60×60', name: '60×60 см', matte: 400, canvas: 1400, ratio: '1 / 1' },
    'l60x80': { label: '60×80', name: '60×80 (A1)', matte: 480, canvas: 1680, ratio: '4 / 3' },
    'l60x90': { label: '60×90', name: '60×90 см', matte: 500, canvas: 1900, ratio: '3 / 2' }
  };

  var PAPER_LABEL = {
    matte: 'Белая матовая 170 г/м²',
    gloss: 'Белый глянец 180 г/м²',
    canvas: 'Белый холст 260 г/м²'
  };
  var sizeCache = {};
  var exportFile = null;

  var state = {
    photos: [],
    format: 'a6',
    paper: 'matte',
    rush: false,
    frame: false,
    replaceTarget: null,
    activePhotoId: null,
    photosExpanded: false,
    expanded: { count: false, format: false, paper: false, print: false },
    lastTotal: 0
  };

  var uid = 0;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function printWord(count) {
    var mod10 = count % 10;
    var mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return 'отпечаток';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'отпечатка';
    return 'отпечатков';
  }

  function isLarge(id) { return Object.prototype.hasOwnProperty.call(LARGE, id); }
  function largeSelect() { return $('#large-format'); }
  function largeWrap() { return $('#large-select-wrap'); }
  function largeTrigger() { return $('#large-format-trigger'); }
  function largeMenu() { return $('#large-format-menu'); }
  function largeMenuItems() { return $$('.large-select__option', largeMenu()); }

  function buildLargeMenu() {
    var sel = largeSelect();
    var menu = largeMenu();
    if (!sel || !menu || menu.children.length) return;
    $$('option', sel).forEach(function (opt) {
      if (!opt.value) return;
      var item = document.createElement('div');
      item.className = 'large-select__option';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.setAttribute('tabindex', '-1');
      item.dataset.value = opt.value;
      item.textContent = opt.textContent;
      menu.appendChild(item);
    });
  }

  function closeLargeMenu(restoreFocus) {
    var menu = largeMenu();
    var wrap = largeWrap();
    var trigger = largeTrigger();
    if (!menu || !wrap || !trigger) return;
    menu.hidden = true;
    wrap.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  function openLargeMenu() {
    var menu = largeMenu();
    var wrap = largeWrap();
    var trigger = largeTrigger();
    if (!menu || !wrap || !trigger || !menu.children.length) return;
    menu.hidden = false;
    wrap.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    var selected = $('.large-select__option[aria-selected="true"]', menu) || menu.firstElementChild;
    if (selected) selected.focus();
  }

  function chooseLarge(value) {
    var sel = largeSelect();
    if (!sel) return;
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    closeLargeMenu(true);
  }

  function updateLargeTrigger(value) {
    var sel = largeSelect();
    var trigger = largeTrigger();
    var valueEl = $('#large-format-value');
    if (!sel || !trigger || !valueEl) return;
    var opt = value ? $('option[value="' + value + '"]', sel) : null;
    valueEl.textContent = opt ? opt.textContent : 'Выбери подходящий вариант';
    trigger.classList.toggle('is-placeholder', !value);
    largeMenuItems().forEach(function (item) {
      item.setAttribute('aria-selected', String(item.dataset.value === value));
    });
  }

  function pickupSelect() { return $('#pickup'); }
  function pickupWrap() { return $('#pickup-select-wrap'); }
  function pickupTrigger() { return $('#pickup-trigger'); }
  function pickupMenu() { return $('#pickup-menu'); }
  function pickupMenuItems() { return $$('.large-select__option', pickupMenu()); }

  function buildPickupMenu() {
    var sel = pickupSelect();
    var menu = pickupMenu();
    if (!sel || !menu || menu.children.length) return;
    $$('option', sel).forEach(function (opt) {
      if (!opt.value) return;
      var item = document.createElement('div');
      item.className = 'large-select__option';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.setAttribute('tabindex', '-1');
      item.dataset.value = opt.value;
      item.textContent = opt.textContent;
      menu.appendChild(item);
    });
  }

  function closePickupMenu(restoreFocus) {
    var menu = pickupMenu();
    var wrap = pickupWrap();
    var trigger = pickupTrigger();
    if (!menu || !wrap || !trigger) return;
    menu.hidden = true;
    wrap.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  function openPickupMenu() {
    var menu = pickupMenu();
    var wrap = pickupWrap();
    var trigger = pickupTrigger();
    if (!menu || !wrap || !trigger || !menu.children.length) return;
    menu.hidden = false;
    wrap.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    var selected = $('.large-select__option[aria-selected="true"]', menu) || menu.firstElementChild;
    if (selected) selected.focus();
  }

  function choosePickup(value) {
    var sel = pickupSelect();
    if (!sel) return;
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    closePickupMenu(true);
  }

  function updatePickupTrigger(value) {
    var sel = pickupSelect();
    var trigger = pickupTrigger();
    var valueEl = $('#pickup-value');
    if (!sel || !trigger || !valueEl) return;
    var opt = value ? $('option[value="' + value + '"]', sel) : $('option', sel);
    if (opt) valueEl.textContent = opt.textContent;
    pickupMenuItems().forEach(function (item) {
      item.setAttribute('aria-selected', String(item.dataset.value === value));
    });
  }

  function currentFormat() { return isLarge(state.format) ? LARGE[state.format] : SMALL[state.format]; }
  function formatFor(photo) {
    var id = photo && photo.format ? photo.format : state.format;
    return isLarge(id) ? LARGE[id] : (SMALL[id] || currentFormat());
  }
  function formatIdFor(photo) { return photo && photo.format ? photo.format : state.format; }
  function paperAllowed(id, paper) { return !(paper === 'canvas' && id !== 'a4' && !isLarge(id)); }
  function paperFor(photo) {
    var paper = photo && photo.paper ? photo.paper : state.paper;
    return paperAllowed(formatIdFor(photo), paper) ? paper : 'matte';
  }
  function minutesFromTime(value, fallback) {
    var match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return fallback;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }

  function pickupRushWindow() {
    var select = $('#pickup');
    var option = select && select.selectedOptions ? select.selectedOptions[0] : null;
    var open = option ? minutesFromTime(option.getAttribute('data-open'), 9 * 60) : 9 * 60;
    var close = option ? minutesFromTime(option.getAttribute('data-close'), 20 * 60) : 20 * 60;
    var lead = option ? parseInt(option.getAttribute('data-lead'), 10) : 60;
    if (isNaN(lead)) lead = 60;
    return { open: open, close: close, cutoff: close - lead };
  }
  function timeFromMinutes(value) {
    var h = Math.floor(value / 60);
    var m = value % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function rushTimeAllowed() {
    var now = new Date();
    var minutes = now.getHours() * 60 + now.getMinutes();
    var window = pickupRushWindow();
    return minutes >= window.open && minutes <= window.cutoff;
  }
  function rushReason() {
    if (!rushTimeAllowed()) return 'Недоступно сейчас: проверь время ПВЗ';
    return '';
  }
  function rushAllowed() { return !rushReason(); }
  function ensureRushAllowed() {
    if (!state.rush || rushAllowed()) return;
    state.rush = false;
    KADR.toast('Срочная печать недоступна при выбранных параметрах');
  }
  function ratioValue(ratio) {
    var parts = String(ratio).split('/');
    return parseFloat(parts[0]) / parseFloat(parts[1]);
  }
  function labelFor(photo) { return formatFor(photo).label; }
  function orientationOf(value) {
    if (Math.abs(value - 1) < 0.01) return 'square';
    return value > 1 ? 'landscape' : 'portrait';
  }
  function photoOrientation(photo) {
    return photo && photo.w && photo.h ? orientationOf(photo.w / photo.h) : 'unknown';
  }
  function formatOrientation(photo) { return orientationOf(ratioValue(formatFor(photo).ratio)); }
  function canContain(photo) {
    var format = formatOrientation(photo);
    if (format === 'square') return false;
    var source = photoOrientation(photo);
    if (source === 'unknown') return true;
    return source !== 'square' && source !== format;
  }
  function containHint(photo) {
    return formatOrientation(photo) === 'square'
      ? 'Для квадратного формата доступна только обрезка'
      : 'Поворот не требуется — доступна только обрезка';
  }
  function cropOf(photo) {
    return photo.crop === 'contain' && !canContain(photo) ? 'cover' : photo.crop;
  }
  function rotationClass(photo) {
    if (cropOf(photo) !== 'contain' || !photo.w || !photo.h) return '';
    var target = formatOrientation(photo);
    var source = photoOrientation(photo);
    if (target === source) return '';
    if (target === 'landscape' && source === 'portrait') return ' is-rotated-portrait';
    if (target === 'portrait' && source === 'landscape') return ' is-rotated-landscape';
    return '';
  }
  function rotationStyle(photo) {
    if (!rotationClass(photo) || !photo.w || !photo.h) return null;
    var target = ratioValue(formatFor(photo).ratio);
    var source = photo.w / photo.h;
    var rotated = 1 / source;
    return rotated >= target
      ? { width: source * 100, height: target * 100 }
      : { width: (1 / target) * 100, height: rotated * 100 };
  }
  function rotationStyleAttr(photo) {
    var rot = rotationStyle(photo);
    return rot ? ' style="width:' + rot.width.toFixed(3) + '%;height:' + rot.height.toFixed(3) + '%"' : '';
  }
  function applyFrameVars(el, photo, minSize) {
    if (!el) return;
    var rect = el.getBoundingClientRect();
    var x = minSize;
    var y = minSize;
    var rot = state.frame && cropOf(photo) === 'contain' ? rotationStyle(photo) : null;
    if (rot) {
      var target = ratioValue(formatFor(photo).ratio);
      var gapX = Math.max(0, (100 - rot.height / target) / 2);
      var gapY = Math.max(0, (100 - rot.width * target) / 2);
      x = Math.max(minSize, rect.width * gapX / 100);
      y = Math.max(minSize, rect.height * gapY / 100);
    }
    el.style.setProperty('--frame-x', x.toFixed(1) + 'px');
    el.style.setProperty('--frame-y', y.toFixed(1) + 'px');
  }
  function updatePhotoFrames() {
    $$('.photo-item').forEach(function (item) {
      var photo = state.photos.filter(function (p) { return p.id === item.dataset.id; })[0];
      if (photo) applyFrameVars($('.photo-thumb', item), photo, 6);
    });
    var modal = $('#preview-modal');
    if (modal && modal.classList.contains('is-open')) {
      var current = state.photos.filter(function (p) { return p.id === modal.dataset.photoId; })[0];
      if (current) applyFrameVars($('.modal__frame > div', modal), current, 8);
    }
  }
  function applyRotationStyle(img, photo) {
    if (!img) return;
    var rot = rotationStyle(photo);
    img.style.width = rot ? rot.width.toFixed(3) + '%' : '';
    img.style.height = rot ? rot.height.toFixed(3) + '%' : '';
  }
  function prints() { return state.photos.reduce(function (sum, p) { return sum + p.qty; }, 0); }

  function ensureImageSize(photo, done) {
    if (photo.w && photo.h) { if (done) done(); return; }
    if (sizeCache[photo.url]) {
      photo.w = sizeCache[photo.url].w;
      photo.h = sizeCache[photo.url].h;
      if (done) done();
      return;
    }
    var img = new Image();
    img.onload = function () {
      photo.w = img.naturalWidth;
      photo.h = img.naturalHeight;
      sizeCache[photo.url] = { w: photo.w, h: photo.h };
      if (done) done();
    };
    img.onerror = function () { photo.w = 0; photo.h = 0; if (done) done(); };
    img.src = photo.url;
  }

  function tierIndex(n) {
    if (n >= 500) return 0;
    if (n >= 200) return 1;
    if (n >= 50) return 2;
    return 3;
  }

  function eveningActive() {
    var h = new Date().getHours();
    return h >= 20 && h < 23;
  }

  function priceInfo() {
    var n = prints();
    var tier = tierIndex(n);
    var subtotal = 0;
    var baseAmount = 0;
    var paperAmount = 0;
    var volumeAmount = 0;
    var rushAmount = 0;
    var labels = [];
    var names = [];
    var papers = [];
    var formatGroups = [];
    var paperGroups = [];
    var items = [];

    state.photos.forEach(function (p) {
      var formatId = formatIdFor(p);
      var f = formatFor(p);
      var paper = paperFor(p);
      var q = p.qty;
      var unit, base, paperAdd, volumeAdd, rushAdd;

      if (isLarge(formatIdFor(p))) {
        base = f.matte;
        paperAdd = paper === 'canvas' ? f.canvas - f.matte : 0;
        volumeAdd = 0;
        rushAdd = 0;
        unit = base + paperAdd;
      } else {
        var paperPrices = paper === 'canvas' ? f.canvas : f[paper];
        var mattePrices = f.matte;
        base = mattePrices[3];
        paperAdd = paperPrices[tier] - mattePrices[tier];
        volumeAdd = mattePrices[3] - mattePrices[tier];
        rushAdd = state.rush && f.rush[paper] ? f.rush[paper] - paperPrices[tier] : 0;
        unit = paperPrices[tier] + rushAdd;
      }

      subtotal += q * unit;
      baseAmount += q * base;
      paperAmount += q * paperAdd;
      volumeAmount += q * volumeAdd;
      rushAmount += q * rushAdd;

      var rotation = rotationClass(p);
      items.push({
        name: p.name,
        qty: q,
        formatId: formatId,
        format: f.name,
        formatLabel: f.label,
        paper: paper,
        paperLabel: PAPER_LABEL[paper],
        crop: cropOf(p) === 'cover' ? 'Заполнить (обрезка)' : 'Вписать (поля)',
        rotate: rotation
          ? (rotation.indexOf('portrait') > -1
              ? 'Поворот из портретной ориентации'
              : 'Поворот из альбомной ориентации')
          : 'Не требуется',
        size: p.w && p.h ? p.w + ' × ' + p.h + ' px' : 'Не определено',
        base: base,
        paperAdd: paperAdd,
        volumeAdd: volumeAdd,
        rushAdd: rushAdd,
        unit: unit,
        amount: q * unit,
        frame: state.frame
      });

      var fg = formatGroups.filter(function (g) { return g.id === formatId; })[0];
      if (!fg) {
        fg = { id: formatId, label: f.label, count: 0, baseUnit: base, baseAmount: 0 };
        formatGroups.push(fg);
      }
      fg.count += q;
      fg.baseAmount += q * base;

      var pg = paperGroups.filter(function (g) { return g.id === paper; })[0];
      if (!pg) {
        pg = { id: paper, label: PAPER_LABEL[paper].replace(' г/м²', ''), count: 0, amount: 0 };
        paperGroups.push(pg);
      }
      pg.count += q;
      pg.amount += q * paperAdd;

      if (labels.indexOf(labelFor(p)) === -1) labels.push(labelFor(p));
      if (names.indexOf(f.name) === -1) names.push(f.name);
      if (papers.indexOf(paper) === -1) papers.push(paper);
    });

    var volumeRate = baseAmount > 0 ? volumeAmount / baseAmount : 0;
    var evening = eveningActive() ? 0.05 : 0;
    var rate = evening > volumeRate ? evening : 0;
    var promo = Math.round(subtotal * rate);
    var volumeTier = ['500 шт', '200 шт', 'от 50 шт', 'до 50 шт'][tier];

    return {
      count: n,
      photosCount: state.photos.length,
      unit: n ? Math.round(subtotal / n) : 0,
      baseUnit: n ? Math.round(baseAmount / n) : 0,
      baseAmount: baseAmount,
      paperAmount: paperAmount,
      volumeAmount: volumeAmount,
      volumeRate: volumeRate,
      volumeTier: volumeTier,
      rushAmount: rushAmount,
      subtotal: subtotal,
      promoRate: rate,
      promo: promo,
      total: subtotal - promo,
      formatLabel: labels.length === 1 ? labels[0] : (labels.length ? 'разные' : labelFor(null)),
      formatAside: labels.length === 1 ? labels[0] : (labels.length ? 'Форматы разные' : labelFor(null)),
      formatName: names.length === 1 ? names[0] : (names.length ? 'Разные форматы' : currentFormat().name),
      paperLabel: papers.length === 1 ? PAPER_LABEL[papers[0]] : (papers.length ? 'Разная бумага' : PAPER_LABEL[state.paper]),
      frame: state.frame,
      rush: state.rush,
      hasLarge: state.photos.some(function (p) { return isLarge(formatIdFor(p)); }),
      formatGroups: formatGroups,
      paperGroups: paperGroups,
      items: items,
      crops: state.photos.map(function (p) {
        return p.name + ' — ' + labelFor(p) + ' см · ' + PAPER_LABEL[paperFor(p)] +
          ' · ' + (cropOf(p) === 'cover' ? 'Заполнить' : 'Вписать') + ' ×' + p.qty;
      })
    };
  }

  function formatOptions(selected) {
    var html = '<option value="">Как в калькуляторе</option>';
    Object.keys(SMALL).concat(Object.keys(LARGE)).forEach(function (id) {
      var f = isLarge(id) ? LARGE[id] : SMALL[id];
      html += '<option value="' + id + '"' + (selected === id ? ' selected' : '') + '>' +
        f.label + ' см' + (isLarge(id) ? ' · большой' : '') + '</option>';
    });
    return html;
  }

  function paperOptions(photo) {
    var current = photo.paper || '';
    var html = '<option value=""' + (current === '' ? ' selected' : '') + '>Как в калькуляторе</option>';
    Object.keys(PAPER_LABEL).forEach(function (id) {
      var disabled = !paperAllowed(formatIdFor(photo), id);
      html += '<option value="' + id + '"' + (current === id ? ' selected' : '') + (disabled ? ' disabled' : '') + '>' +
        PAPER_LABEL[id].replace(' г/м²', '') + '</option>';
    });
    return html;
  }

  function photoCard(p, i, active, isNewId) {
    var crop = cropOf(p);
    var containDisabled = !canContain(p);
    var rotStyle = rotationStyleAttr(p);
    var settings = state.photos.length > 1
      ? '<div class="photo-settings">' +
          '<label class="photo-setting"><span>Формат</span><select data-photo-format>' + formatOptions(p.format) + '</select></label>' +
          '<label class="photo-setting"><span>Бумага</span><select data-photo-paper>' + paperOptions(p) + '</select></label>' +
        '</div>'
      : '';
    return '' +
      '<article class="photo-item' + (active ? ' is-active' : '') + (p.id === isNewId ? ' is-new' : '') + '" data-id="' + p.id + '">' +
        '<button class="photo-thumb' + (state.frame ? ' is-framed' : '') + rotationClass(p) + '" type="button" data-action="preview" data-crop="' + crop + '" style="aspect-ratio:' + formatFor(p).ratio + '" aria-label="Предпросмотр ' + KADR.escapeHtml(p.name) + '">' +
          '<img src="' + KADR.escapeHtml(p.url) + '" alt="' + KADR.escapeHtml(p.name) + '"' + rotStyle + '>' +
          '<span class="crop-tag">' + (crop === 'cover' ? 'Заполнить' : 'Вписать') + '</span>' +
          '<b>0' + (i + 1) + '</b>' +
        '</button>' +
        '<div class="photo-info">' +
          '<div class="photo-name" title="' + KADR.escapeHtml(p.name) + '">' + KADR.escapeHtml(p.name) + '</div>' +
          settings +
          '<div class="qty">' +
            '<button type="button" data-action="dec" aria-label="Уменьшить количество">−</button>' +
            '<input type="number" min="1" max="' + MAX_QTY + '" step="1" inputmode="numeric" value="' + p.qty + '" data-qty aria-label="Количество отпечатков: ' + KADR.escapeHtml(p.name) + '">' +
            '<button type="button" data-action="inc" aria-label="Увеличить количество">+</button>' +
          '</div>' +
          '<div class="crop-toggle" role="group" aria-label="Кадрирование">' +
            '<button type="button" data-crop="contain" class="' + (crop === 'contain' ? 'is-active' : '') + '" aria-pressed="' + (crop === 'contain') + '"' + (containDisabled ? ' disabled title="' + containHint(p) + '"' : '') + '>Вписать</button>' +
            '<button type="button" data-crop="cover" class="' + (crop === 'cover' ? 'is-active' : '') + '" aria-pressed="' + (crop === 'cover') + '">Заполнить</button>' +
          '</div>' +
          '<div class="photo-tools">' +
            '<button type="button" class="replace" data-action="replace">Заменить</button>' +
            '<button type="button" class="remove" data-action="remove" aria-label="Удалить ' + KADR.escapeHtml(p.name) + '"><span aria-hidden="true">✕</span> Убрать</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function renderPhotos(isNewId) {
    var list = $('#photo-list');
    if (!list) return;
    var empty = $('#photo-empty');
    if (empty) empty.hidden = state.photos.length > 0;
    if (!state.photos.length) { list.innerHTML = ''; return; }

    if (!state.activePhotoId || !state.photos.some(function (p) { return p.id === state.activePhotoId; })) {
      state.activePhotoId = state.photos[0].id;
    }
    var active = state.photos.filter(function (p) { return p.id === state.activePhotoId; })[0];
    var rest = state.photos.filter(function (p) { return p.id !== state.activePhotoId; });
    var html = photoCard(active, state.photos.indexOf(active), true, isNewId);

    if (rest.length) {
      html += '<button class="photos-toggle" type="button" data-action="photos-toggle" aria-expanded="' + state.photosExpanded + '">' +
        (state.photosExpanded ? 'Свернуть' : 'Показать ещё ' + rest.length) +
        ' <span aria-hidden="true">' + (state.photosExpanded ? '↑' : '↓') + '</span></button>';
      html += '<div class="photo-rest' + (state.photosExpanded ? ' is-open' : '') + '">' +
        rest.map(function (p) { return photoCard(p, state.photos.indexOf(p), false, isNewId); }).join('') +
        '</div>';
    }
    list.innerHTML = html;
    updatePhotoFrames();
  }

  function refreshPhotoCard(photo, rebuildPaper) {
    var item = $('.photo-item[data-id="' + photo.id + '"]', $('#photo-list'));
    if (!item) return;
    var crop = cropOf(photo);
    var thumb = $('.photo-thumb', item);
    if (thumb) {
      thumb.style.aspectRatio = formatFor(photo).ratio;
      thumb.dataset.crop = crop;
      thumb.classList.remove('is-rotated-portrait', 'is-rotated-landscape');
      var rotated = rotationClass(photo).trim();
      if (rotated) thumb.classList.add(rotated);
      applyRotationStyle($('img', thumb), photo);
      var tag = $('.crop-tag', thumb);
      if (tag) tag.textContent = crop === 'cover' ? 'Заполнить' : 'Вписать';
    }
    $$('.crop-toggle button', item).forEach(function (b) {
      var disabled = b.dataset.crop === 'contain' && !canContain(photo);
      b.disabled = disabled;
      if (disabled) b.title = containHint(photo);
      else b.removeAttribute('title');
      b.classList.toggle('is-active', b.dataset.crop === crop);
      b.setAttribute('aria-pressed', String(b.dataset.crop === crop));
    });
    if (rebuildPaper) {
      var paperSelect = $('[data-photo-paper]', item);
      if (paperSelect) paperSelect.innerHTML = paperOptions(photo);
    }
    updatePhotoFrames();
  }

  function renderFormats() {
    $$('.chip[data-format]').forEach(function (el) {
      el.classList.toggle('is-active', el.dataset.format === state.format);
      el.setAttribute('aria-pressed', String(el.dataset.format === state.format));
    });
    var sel = largeSelect();
    if (sel) {
      sel.hidden = false;
      var wrap = sel.closest('.select-wrap');
      if (wrap) wrap.hidden = false;
      var large = isLarge(state.format);
      sel.value = large ? state.format : '';
      sel.classList.toggle('is-placeholder', !large);
      closeLargeMenu(false);
      if (wrap) wrap.classList.toggle('is-active', large);
      updateLargeTrigger(large ? state.format : '');
    }
  }

  function renderPapers() {
    var canvasAllowed = state.format === 'a4' || isLarge(state.format);
    $$('.paper-option').forEach(function (el) {
      var p = el.dataset.paper;
      var disabled = p === 'canvas' && !canvasAllowed;
      el.classList.toggle('is-active', p === state.paper);
      el.classList.toggle('is-disabled', disabled);
      el.disabled = disabled;
      el.setAttribute('aria-pressed', String(p === state.paper));
    });
    var rush = $('#rush-toggle');
    if (rush) {
      var reason = rushReason();
      var available = !reason;
      rush.disabled = !available;
      rush.classList.toggle('is-on', state.rush);
      rush.setAttribute('aria-checked', String(state.rush));
      rush.setAttribute('aria-disabled', String(!available));
      rush.title = available ? 'Срочная печать сегодня' : reason;
      rush.setAttribute('aria-label', rush.title);
      var status = $('#rush-status');
      if (status) {
        status.textContent = available
          ? 'Доступно до ' + timeFromMinutes(pickupRushWindow().cutoff) + ' · срочно до А4'
          : reason;
      }
      var row = rush.closest('.toggle-row');
      if (row) row.classList.toggle('is-unavailable', !available);
    }
    var frame = $('#frame-toggle');
    if (frame) {
      frame.classList.toggle('is-on', state.frame);
      frame.setAttribute('aria-checked', String(state.frame));
    }
  }

  function line(label, value, negative) {
    return '<div class="summary-line' + (negative ? ' is-negative' : '') + '"><span>' + label + '</span><b>' + value + '</b></div>';
  }

  function extraRows(rows, foot) {
    return '<ul class="summary-extra__list">' + rows.map(function (row) {
      return '<li><span title="' + KADR.escapeHtml(row.label) + '">' + KADR.escapeHtml(row.label) + '</span><b>' + row.value + '</b></li>';
    }).join('') + '</ul>' + (foot ? '<div class="summary-extra__foot">' + foot + '</div>' : '');
  }

  function detailLine(key, label, value, extra) {
    var open = state.expanded[key];
    return '<div class="summary-line is-expandable' + (open ? ' is-open' : '') + '">' +
      '<button class="summary-line__toggle" type="button" data-summary-key="' + key + '" aria-expanded="' + open + '" aria-controls="summary-extra-' + key + '">' +
        '<span>' + label + '</span>' +
      '</button><b>' + value + '</b></div>' +
      '<div class="summary-line__extra" id="summary-extra-' + key + '"' + (open ? '' : ' hidden') + '>' + extra + '</div>';
  }

  function renderVolumePromo(info) {
    var card = $('[data-volume-promo]');
    if (!card) return;
    var num = $('[data-volume-num]', card);
    var status = $('[data-volume-status]', card);
    var percent = info.volumeRate > 0 ? Math.round(info.volumeRate * 100) : 0;
    if (num) num.textContent = percent ? '−' + percent + '%' : '% ↗';
    if (status) {
      status.textContent = info.count
        ? (percent ? 'Тираж ' + info.volumeTier + ' · учтена в цене' : 'Базовая цена · скидка от 50 шт')
        : 'Чем больше тираж, тем выше скидка';
    }
    card.classList.toggle('is-active', percent > 0);
  }

  function renderSummary() {
    var info = priceInfo();
    var n = KADR.formatMoney;
    var lines = '';

    if (info.count) {
      var countExtra = extraRows(state.photos.map(function (p) {
        return { label: p.name, value: p.qty + ' экз.' };
      }), 'Кадров: ' + info.photosCount + ' · отпечатков: ' + info.count);
      lines += detailLine('count', 'Кадры / отпечатки', info.photosCount + ' / ' + info.count, countExtra);

      var formatExtra = extraRows(info.formatGroups.map(function (g) {
        return { label: g.label + ' см', value: g.count + ' экз.' };
      }));
      lines += detailLine('format', 'Формат', info.formatLabel +
        (state.rush ? (info.hasLarge ? ' · срочно до А4' : ' · срочно') : ''), formatExtra);

      var paperExtra = extraRows(info.paperGroups.map(function (g) {
        return {
          label: g.label,
          value: g.count + ' экз.' + (g.amount ? ' · +' + n(g.amount) + ' ₽' : '')
        };
      }));
      lines += detailLine('paper', 'Бумага', info.paperLabel.replace(' г/м²', ''), paperExtra);
    } else {
      lines += line('Кадров / отпечатков', info.photosCount + ' / ' + info.count);
      lines += line('Формат', info.formatLabel + (state.rush ? ' · срочно' : ''));
      lines += line('Бумага', info.paperLabel.replace(' г/м²', ''));
    }
    if (state.frame) lines += line('Белая рамка', 'включена');
    if (info.count) {
      var printExtra = extraRows(info.formatGroups.map(function (g) {
        return {
          label: g.label + ' см',
          value: g.count + ' × ' + n(g.baseUnit) + ' ₽ = ' + n(g.baseAmount) + ' ₽'
        };
      }), 'Базовая печать: ' + n(info.baseAmount) + ' ₽');
      lines += detailLine('print', 'Печать', n(info.baseAmount) + ' ₽', printExtra);
    } else {
      lines += line('Печать', n(info.baseAmount) + ' ₽');
    }

    if (info.paperAmount > 0) {
      lines += line('Бумага', '+ ' + n(info.paperAmount) + ' ₽');
    } else {
      lines += line('Бумага', 'включено');
    }
    if (info.volumeAmount > 0) {
      lines += line('Скидка за объём (−' + Math.round(info.volumeRate * 100) + '%)', '− ' + n(info.volumeAmount) + ' ₽', true);
    }
    if (info.rushAmount > 0) lines += line('Срочная печать', '+ ' + n(info.rushAmount) + ' ₽');
    if (info.promo > 0) lines += line('Акция −' + Math.round(info.promoRate * 100) + '%', '− ' + n(info.promo) + ' ₽', true);

    var linesEl = $('#summary-lines');
    if (linesEl) linesEl.innerHTML = lines;

    var sub = $('#summary-sub');
    if (sub) {
      if (!info.count) {
        sub.textContent = 'Добавь хотя бы один кадр';
      } else {
        var notes = [];
        if (info.volumeRate > 0) notes.push('скидка за объём');
        if (info.promo) notes.push('вечерняя скидка');
        sub.textContent = Math.round(info.total / info.count) + ' ₽ за отпечаток · ' +
          (notes.length === 1 ? notes[0] + ' учтена' : notes.length ? notes.join(' + ') + ' учтены' : 'без скидок');
      }
    }
    var promoBox = $('#summary-promo');
    if (promoBox) {
      promoBox.hidden = info.promo === 0;
      promoBox.innerHTML = info.promo
        ? '<b>Вечерняя скидка −5%</b><br>Скидка применена автоматически к стоимости печати.'
        : '';
    }

    renderVolumePromo(info);

    var totalEl = $('#summary-total');
    if (totalEl) {
      KADR.animateNumber(totalEl, state.lastTotal, info.total, 500);
      totalEl.setAttribute('aria-label', n(info.total) + ' рублей');
    }
    state.lastTotal = info.total;

    resetExport();
    syncForm(info);
  }

  function pickupLabel() {
    var select = $('#pickup');
    var option = select && select.selectedOptions ? select.selectedOptions[0] : null;
    return option ? option.textContent.trim() : '';
  }

  function syncForm(info) {
    var map = {
      '#order-amount': info.total,
      '#order-prints': info.count,
      '#order-format': info.formatName,
      '#order-paper': info.paperLabel,
      '#order-crop': info.crops.join('; ') + (state.frame ? ' · белая рамка' : ''),
      '#order-frame': state.frame ? 'Белая рамка' : '',
      '#order-rush': state.rush ? '1' : '0',
      '#order-pickup': pickupLabel(),
      '#order-photos': info.photosCount,
      '#order-promo': info.promo ? Math.round(info.promoRate * 100) : 0
    };
    Object.keys(map).forEach(function (sel) {
      var el = $(sel);
      if (el) el.value = map[sel];
    });
    var aside = $('#aside-total');
    if (aside) aside.textContent = KADR.formatMoney(info.total) + ' ₽';
    var asideSummary = $('#aside-summary');
    if (asideSummary) {
      asideSummary.textContent = info.count
        ? info.count + ' ' + printWord(info.count) + ' · ' + info.formatAside + ' · ' + info.paperLabel
        : 'Параметры появятся после расчёта в калькуляторе.';
    }
  }

  function refresh() {
    renderPhotos();
    renderFormats();
    renderPapers();
    renderSummary();
  }

  function setFormat(id) {
    if (!SMALL[id] && !LARGE[id]) return;
    state.format = id;
    if (!isLarge(id) && id !== 'a4' && state.paper === 'canvas') {
      state.paper = 'matte';
      KADR.toast('Холст доступен для А4 и больших форматов — выбрана матовая бумага');
    }
    ensureRushAllowed();
    refresh();
    syncOpenPreview();
  }

  function addFiles(files, replaceId) {
    var added = 0;
    var rejected = 0;
    var newId = null;
    var touched = [];
    Array.prototype.forEach.call(files, function (file) {
      if (!file) return;
      if (!ALLOWED_IMAGE_TYPES[file.type] || file.size > MAX_FILE_SIZE) { rejected++; return; }
      if (state.photos.length >= 30 && !replaceId) return;
      var url = URL.createObjectURL(file);
      if (replaceId) {
        var target = state.photos.filter(function (p) { return p.id === replaceId; })[0];
        if (target) {
          if (target.objectUrl) URL.revokeObjectURL(target.objectUrl);
          target.url = url;
          target.objectUrl = true;
          target.name = safeName(file.name);
          target.w = 0;
          target.h = 0;
          target.demo = false;
          state.activePhotoId = replaceId;
          touched.push(target);
          KADR.toast('Кадр заменён');
        }
      } else {
        newId = 'p' + (++uid);
        var entry = {
          id: newId, name: safeName(file.name), url: url, objectUrl: true,
          qty: 1, crop: 'contain', demo: false, w: 0, h: 0
        };
        state.photos.push(entry);
        touched.push(entry);
        added++;
      }
    });
    if (added) {
      state.activePhotoId = newId;
      KADR.toast('Добавлено кадров: ' + added);
    }
    if (rejected) KADR.toast('Подойдут JPG, PNG или WEBP до 20 МБ', true);
    state.replaceTarget = null;
    refresh();
    touched.forEach(function (p) { ensureImageSize(p, refresh); });
  }

  function clearDemo() {
    var before = state.photos.length;
    state.photos = state.photos.filter(function (p) {
      if (p.objectUrl) URL.revokeObjectURL(p.url);
      return false;
    });
    state.activePhotoId = null;
    state.photosExpanded = false;
    KADR.toast(before === state.photos.length ? 'Нечего удалять' : 'Все кадры убраны');
    refresh();
  }

  function openPreview(id) {
    var photo = state.photos.filter(function (p) { return p.id === id; })[0];
    if (!photo) return;
    var crop = cropOf(photo);
    var modal = $('#preview-modal');
    if (!modal) return;
    var frame = $('.modal__frame', modal);
    var stage = $('.modal__frame > div', modal);
    $('.modal__frame img', modal).src = photo.url;
    $('.modal__img', modal).className = 'modal__img' + rotationClass(photo);
    applyRotationStyle($('.modal__frame img', modal), photo);
    stage.style.aspectRatio = formatFor(photo).ratio;
    frame.classList.toggle('is-contain', crop === 'contain');
    frame.classList.toggle('is-cover', crop === 'cover');
    frame.classList.toggle('is-framed', state.frame);
    var nameEl = $('#preview-name', modal);
    nameEl.textContent = photo.name;
    nameEl.title = photo.name;
    var cropText = crop === 'cover' ? 'Заполнить — обрезка по краям' : 'Вписать — без обрезки, возможны поля';
    $('#preview-info', modal).textContent = 'Формат ' + labelFor(photo) + ' см · ' + PAPER_LABEL[paperFor(photo)] +
      ' · ' + cropText + (state.frame ? ' · Белая рамка' : '') + ' · ' + photo.qty + ' экз.';
    $$('.crop-toggle button', modal).forEach(function (b) {
      var disabled = b.dataset.crop === 'contain' && !canContain(photo);
      b.disabled = disabled;
      if (disabled) b.title = containHint(photo);
      else b.removeAttribute('title');
      b.classList.toggle('is-active', b.dataset.crop === crop);
      b.setAttribute('aria-pressed', String(b.dataset.crop === crop));
    });
    modal.dataset.photoId = id;
    modal.classList.add('is-open');
    document.body.classList.add('is-locked');
    updatePhotoFrames();
  }

  function syncOpenPreview() {
    var modal = $('#preview-modal');
    if (!modal || !modal.classList.contains('is-open')) return;
    var photo = state.photos.filter(function (p) { return p.id === modal.dataset.photoId; })[0];
    if (photo) openPreview(photo.id);
  }

  function closePreview() {
    var modal = $('#preview-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    document.body.classList.remove('is-locked');
  }

  function resetExport() {
    if (exportFile && exportFile.url) window.URL.revokeObjectURL(exportFile.url);
    exportFile = null;
    var download = $('#calc-export-download');
    if (download) download.hidden = true;
  }

  function generateExport() {
    var info = priceInfo();
    if (!info.count) {
      KADR.toast('Добавь хотя бы одно фото', true);
      return;
    }
    if (!window.KADR || !KADR.exportCalculation) {
      KADR.toast('Не удалось сформировать файл', true);
      return;
    }

    resetExport();
    var blob = KADR.exportCalculation(info);
    if (!blob) {
      KADR.toast('Не удалось сформировать файл', true);
      return;
    }

    exportFile = {
      blob: blob,
      url: window.URL.createObjectURL(blob),
      name: KADR.exportFileName()
    };

    var download = $('#calc-export-download');
    if (download) {
      download.hidden = false;
      download.focus({ preventScroll: true });
    }
    KADR.toast('Файл сформирован — теперь нажми «Скачать результат расчёта»');
  }

  function downloadExport() {
    if (!exportFile) return;
    var a = document.createElement('a');
    a.href = exportFile.url;
    a.download = exportFile.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    KADR.toast('Файл сохранён');
  }

  function goToForm() {
    var info = priceInfo();
    if (!info.count) {
      KADR.toast('Добавь хотя бы одно фото', true);
      return;
    }
    syncForm(info);
    document.dispatchEvent(new CustomEvent('kadr:order-ready'));
    KADR.toast('Сумма перенесена в форму — прикрепи XLSX и отправь заявку');
  }

  function init() {
    buildLargeMenu();

    var fileInput = $('#photo-file');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        addFiles(fileInput.files, state.replaceTarget);
        fileInput.value = '';
      });
    }

    var dropzone = $('#dropzone');
    if (dropzone) {
      dropzone.addEventListener('click', function (e) {
        if (e.target === fileInput || state.replaceTarget) return;
        state.replaceTarget = null;
        fileInput.click();
      });
      ['dragenter', 'dragover'].forEach(function (ev) {
        dropzone.addEventListener(ev, function (e) {
          e.preventDefault();
          dropzone.classList.add('is-drag');
        });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        dropzone.addEventListener(ev, function (e) {
          e.preventDefault();
          dropzone.classList.remove('is-drag');
        });
      });
      dropzone.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files, null);
      });
    }

    $('#demo-clear').addEventListener('click', clearDemo);

    var list = $('#photo-list');
    if (list) {
      list.addEventListener('change', function (e) {
        var item = e.target.closest('.photo-item');
        if (!item) return;
        var photo = state.photos.filter(function (p) { return p.id === item.dataset.id; })[0];
        if (!photo) return;
        if (e.target.matches('[data-qty]')) {
          var raw = parseInt(e.target.value, 10);
          if (!isNaN(raw)) photo.qty = Math.min(MAX_QTY, Math.max(1, raw));
          e.target.value = photo.qty;
          renderSummary();
          return;
        }
        var isFormat = e.target.matches('[data-photo-format]');
        if (isFormat) {
          photo.format = e.target.value || null;
          if (photo.paper && !paperAllowed(formatIdFor(photo), photo.paper)) photo.paper = null;
        } else if (e.target.matches('[data-photo-paper]')) {
          photo.paper = e.target.value || null;
        } else {
          return;
        }
        ensureRushAllowed();
        renderPapers();
        var modal = $('#preview-modal');
        var open = modal && modal.classList.contains('is-open') ? modal.dataset.photoId : null;
        refreshPhotoCard(photo, isFormat);
        renderSummary();
        if (open === photo.id) openPreview(photo.id);
      });

      list.addEventListener('click', function (e) {
        if (e.target.closest('[data-action="photos-toggle"]')) {
          state.photosExpanded = !state.photosExpanded;
          renderPhotos();
          return;
        }
        var item = e.target.closest('.photo-item');
        if (!item) return;
        var id = item.dataset.id;
        var photo = state.photos.filter(function (p) { return p.id === id; })[0];
        if (!photo) return;
        if (e.target.closest('select, input, label')) return;
        var actionEl = e.target.closest('[data-action]');
        var cropEl = e.target.closest('.crop-toggle [data-crop]');
        if (cropEl) {
          if (cropEl.disabled) return;
          photo.crop = cropEl.dataset.crop;
          renderPhotos();
          renderSummary();
          if ($('#preview-modal').classList.contains('is-open')) openPreview(id);
          return;
        }
        if (actionEl) {
          switch (actionEl.dataset.action) {
            case 'inc': photo.qty = Math.min(MAX_QTY, photo.qty + 1); renderPhotos(); renderSummary(); break;
            case 'dec': photo.qty = Math.max(1, photo.qty - 1); renderPhotos(); renderSummary(); break;
            case 'remove':
              item.classList.add('is-removing');
              if (photo.objectUrl) URL.revokeObjectURL(photo.url);
              state.photos = state.photos.filter(function (p) { return p.id !== id; });
              if (state.activePhotoId === id) {
                state.activePhotoId = state.photos.length ? state.photos[0].id : null;
              }
              window.setTimeout(function () { renderPhotos(); renderPapers(); renderSummary(); }, 220);
              break;
            case 'replace':
              state.replaceTarget = id;
              fileInput.click();
              break;
            case 'preview':
              state.activePhotoId = id;
              renderPhotos();
              openPreview(id);
              break;
          }
          return;
        }
        state.activePhotoId = id;
        state.photosExpanded = false;
        renderPhotos();
      });
    }

    $$('.chip[data-format]').forEach(function (el) {
      el.addEventListener('click', function () { setFormat(el.dataset.format); });
    });
    var selectEl = largeSelect();
    if (selectEl) selectEl.addEventListener('change', function () { setFormat(selectEl.value); });

    var triggerEl = largeTrigger();
    var menuEl = largeMenu();
    var wrapEl = largeWrap();
    if (triggerEl) {
      triggerEl.addEventListener('click', function () {
        if (menuEl && !menuEl.hidden) closeLargeMenu(false);
        else openLargeMenu();
      });
      triggerEl.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          openLargeMenu();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeLargeMenu(true);
        }
      });
    }
    if (menuEl) {
      menuEl.addEventListener('click', function (e) {
        var item = e.target.closest('.large-select__option');
        if (item) chooseLarge(item.dataset.value);
      });
      menuEl.addEventListener('keydown', function (e) {
        var item = e.target.closest('.large-select__option');
        if (!item) return;
        var items = largeMenuItems();
        var idx = items.indexOf(item);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[(idx + 1) % items.length].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); items[(idx - 1 + items.length) % items.length].focus(); }
        else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
        else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chooseLarge(item.dataset.value); }
        else if (e.key === 'Escape') { e.preventDefault(); closeLargeMenu(true); }
      });
    }
    document.addEventListener('click', function (e) {
      if (wrapEl && !wrapEl.contains(e.target)) closeLargeMenu(false);
      var pWrap = pickupWrap();
      if (pWrap && !pWrap.contains(e.target)) closePickupMenu(false);
    });

    $$('.paper-option').forEach(function (el) {
      el.addEventListener('click', function () {
        if (el.disabled) return;
        state.paper = el.dataset.paper;
        renderPapers();
        renderSummary();
        syncOpenPreview();
      });
    });

    var rush = $('#rush-toggle');
    if (rush) rush.addEventListener('click', function () {
      if (rush.disabled) return;
      state.rush = !state.rush;
      renderPapers();
      renderSummary();
    });
    var pickup = $('#pickup');
    if (pickup) pickup.addEventListener('change', function () {
      updatePickupTrigger(pickup.value);
      ensureRushAllowed();
      renderPapers();
      renderSummary();
    });

    var pickupWrapEl = pickupWrap();
    var pickupTriggerEl = pickupTrigger();
    var pickupMenuEl = pickupMenu();
    if (pickupWrapEl && pickupTriggerEl && pickupMenuEl) {
      buildPickupMenu();
      updatePickupTrigger(pickup ? pickup.value : '');
      pickupTriggerEl.addEventListener('click', function () {
        if (pickupMenuEl.hidden) openPickupMenu(); else closePickupMenu(false);
      });
      pickupMenuEl.addEventListener('click', function (e) {
        var item = e.target.closest('.large-select__option');
        if (item) choosePickup(item.dataset.value);
      });
      pickupMenuEl.addEventListener('keydown', function (e) {
        var item = e.target.closest('.large-select__option');
        if (!item) return;
        var items = pickupMenuItems();
        var idx = items.indexOf(item);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[(idx + 1) % items.length].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); items[(idx - 1 + items.length) % items.length].focus(); }
        else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
        else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choosePickup(item.dataset.value); }
        else if (e.key === 'Escape') { e.preventDefault(); closePickupMenu(true); }
      });
    }
    var frame = $('#frame-toggle');
    if (frame) frame.addEventListener('click', function () {
      state.frame = !state.frame;
      renderPhotos();
      renderPapers();
      renderSummary();
      syncOpenPreview();
    });

    var summaryLines = $('#summary-lines');
    if (summaryLines) summaryLines.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-summary-key]');
      if (!btn) return;
      var key = btn.dataset.summaryKey;
      state.expanded[key] = !state.expanded[key];
      btn.setAttribute('aria-expanded', String(state.expanded[key]));
      btn.closest('.summary-line').classList.toggle('is-open', state.expanded[key]);
      var extra = document.getElementById('summary-extra-' + key);
      if (extra) extra.hidden = !state.expanded[key];
    });

    var exportGenerate = $('#calc-export-generate');
    if (exportGenerate) exportGenerate.addEventListener('click', generateExport);
    var exportDownload = $('#calc-export-download');
    if (exportDownload) exportDownload.addEventListener('click', downloadExport);

    $('#calc-submit').addEventListener('click', goToForm);

    $$('[data-format-card]').forEach(function (card) {
      card.addEventListener('click', function () {
        setFormat(card.dataset.formatCard);
        var target = $('#calculator');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        KADR.toast('Формат ' + currentFormat().label + ' выбран в калькуляторе');
      });
    });

    var modal = $('#preview-modal');
    if (modal) {
      $('.modal__close', modal).addEventListener('click', closePreview);
      modal.addEventListener('click', function (e) { if (e.target === modal) closePreview(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePreview(); });
      $$('.crop-toggle button', modal).forEach(function (b) {
        b.addEventListener('click', function () {
          if (b.disabled) return;
          var photo = state.photos.filter(function (p) { return p.id === modal.dataset.photoId; })[0];
          if (photo) { photo.crop = b.dataset.crop; renderPhotos(); renderSummary(); openPreview(photo.id); }
        });
      });
    }

    window.addEventListener('resize', updatePhotoFrames);
    refresh();
  }

  window.KADR.setFormat = setFormat;
  window.KADR.getOrderData = function () { return priceInfo(); };
  window.KADR.refreshSummary = function () { renderSummary(); };
  window.KADR.rushAllowed = function () { return rushAllowed(); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
