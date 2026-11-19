/* KADR — экспорт результата расчёта в XLSX без внешних библиотек.
   Собирает минимальный OOXML-пакет и обычный ZIP (без сжатия) прямо в браузере. */
(function () {
  'use strict';

  window.KADR = window.KADR || {};

  var MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    var c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) {
      c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(str));
    var out = [];
    var s = String(str);
    for (var i = 0; i < s.length; i++) {
      var cp = s.charCodeAt(i);
      if (cp < 0x80) {
        out.push(cp);
      } else if (cp < 0x800) {
        out.push(0xC0 | (cp >> 6), 0x80 | (cp & 0x3F));
      } else if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < s.length) {
        var next = s.charCodeAt(++i);
        cp = 0x10000 + ((cp - 0xD800) << 10) + (next - 0xDC00);
        out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
      } else {
        out.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
      }
    }
    return new Uint8Array(out);
  }

  function u16(v) { return [v & 0xFF, (v >> 8) & 0xFF]; }
  function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }

  function zip(files) {
    var now = new Date();
    var year = Math.max(1980, now.getFullYear());
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    var dosDate = ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    var local = [];
    var central = [];
    var offset = 0;

    files.forEach(function (file) {
      var name = utf8(file.name);
      var data = file.data;
      var crc = crc32(data);
      var size = data.length;

      var head = [0x50, 0x4B, 0x03, 0x04, 20, 0, 0, 0, 0, 0]
        .concat(u16(dosTime), u16(dosDate), u32(crc), u32(size), u32(size), u16(name.length), [0, 0])
        .concat(Array.prototype.slice.call(name));

      local.push(head, Array.prototype.slice.call(data));

      central.push(
        [0x50, 0x4B, 0x01, 0x02, 20, 0, 20, 0, 0, 0, 0, 0]
          .concat(u16(dosTime), u16(dosDate), u32(crc), u32(size), u32(size), u16(name.length),
            [0, 0, 0, 0, 0, 0, 0, 0], u32(0), u32(offset))
          .concat(Array.prototype.slice.call(name))
      );

      offset += head.length + size;
    });

    var cdSize = central.reduce(function (sum, part) { return sum + part.length; }, 0);
    var eocd = [0x50, 0x4B, 0x05, 0x06, 0, 0, 0, 0]
      .concat(u16(files.length), u16(files.length), u32(cdSize), u32(offset), [0, 0]);

    var parts = local.concat(central);
    parts.push(eocd);
    var total = parts.reduce(function (sum, part) { return sum + part.length; }, 0);
    var out = new Uint8Array(total);
    var pos = 0;
    parts.forEach(function (part) {
      out.set(part, pos);
      pos += part.length;
    });
    return out;
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function colName(index) {
    var name = '';
    var n = index;
    while (n > 0) {
      var mod = (n - 1) % 26;
      name = String.fromCharCode(65 + mod) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  function cellXml(ref, value, style) {
    style = style || 0;
    if (typeof value === 'number' && isFinite(value)) {
      return '<c r="' + ref + '" s="' + style + '"><v>' + value + '</v></c>';
    }
    return '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' +
      esc(value) + '</t></is></c>';
  }

  function rowXml(number, cells) {
    var body = cells.map(function (cell, i) {
      if (!cell) return '';
      return cellXml(colName(i + 1) + number, cell[0], cell[1]);
    }).join('');
    return '<row r="' + number + '">' + body + '</row>';
  }

  function sheetXml(rows, widths) {
    var cols = widths.map(function (width, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + width + '" customWidth="1"/>';
    }).join('');

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<cols>' + cols + '</cols>' +
      '<sheetData>' + rows.map(function (cells, i) { return rowXml(i + 1, cells); }).join('') + '</sheetData>' +
      '</worksheet>';
  }

  var STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0&quot; ₽&quot;"/></numFmts>' +
    '<fonts count="3">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="14"/><color rgb="FF14110F"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="4">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFD8EDC4"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEAE5DC"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="3">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left/><right/><top/><bottom style="thin"><color rgb="FFD8C9B8"/></bottom><diagonal/></border>' +
      '<border><left/><right/><top style="thin"><color rgb="FF14110F"/></top><bottom style="thin"><color rgb="FF14110F"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="8">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="164" fontId="1" fillId="2" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  var CONTENT_TYPES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>';

  var ROOT_RELS_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  var WORKBOOK_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Детали заказа" sheetId="1" r:id="rId1"/></sheets>' +
    '</workbook>';

  var WORKBOOK_RELS_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  function stamp() {
    var d = new Date();
    return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function money(value) { return [Math.round(value || 0), 5]; }
  function text(value) { return [value == null ? '' : String(value), 0]; }
  function bold(value) { return [value == null ? '' : String(value), 1]; }
  function section(value) { return [value, 2]; }
  function wrapped(value) { return [value == null ? '' : String(value), 7]; }

  function buildDetailsSheet(info) {
    var rows = [];
    var rate = info.promoRate || 0;
    var promoName = 'Вечерняя акция −5%';
    var volumeName = 'Скидка за объём' +
      (info.volumeRate ? ' (−' + Math.round(info.volumeRate * 100) + '%)' : '');

    rows.push([[ 'Детали заказа', 3 ]]);
    rows.push([bold('Дата'), text(stamp())]);
    rows.push([]);
    rows.push([section('Учёт скидок')]);
    rows.push([bold(volumeName), money(-info.volumeAmount)]);
    rows.push([bold('Акция'), text(rate ? promoName : 'Нет'), money(-info.promo)]);
    rows.push([[ 'Итоговая сумма', 4 ], [ info.total, 6 ]]);
    rows.push([]);
    rows.push([
      bold('№'), bold('Файл'), bold('Размер источника'), bold('Формат'), bold('Бумага'),
      bold('Кадрирование'), bold('Поворот'), bold('Тираж'), bold('База'), bold('Бумага'),
      bold('Объём'), bold('Срочно'), bold('Цена за отпечаток'), bold('Сумма'), bold('Рамка')
    ]);

    (info.items || []).forEach(function (item, i) {
      rows.push([
        text(i + 1),
        wrapped(item.name),
        text(item.size),
        text(item.format),
        text(item.paperLabel),
        text(item.crop),
        text(item.rotate),
        text(item.qty),
        money(item.base),
        money(item.paperAdd),
        money(-item.volumeAdd),
        money(item.rushAdd),
        money(item.unit),
        money(item.amount),
        text(item.frame ? 'Да' : 'Нет')
      ]);
    });

    return sheetXml(rows, [6, 34, 18, 20, 24, 22, 28, 10, 12, 12, 12, 12, 18, 16, 10]);
  }

  function part(name, content) {
    return { name: name, data: utf8(content) };
  }

  KADR.exportCalculation = function (info) {
    if (!info || !info.count) return null;
    var packed = zip([
      part('[Content_Types].xml', CONTENT_TYPES_XML),
      part('_rels/.rels', ROOT_RELS_XML),
      part('xl/workbook.xml', WORKBOOK_XML),
      part('xl/_rels/workbook.xml.rels', WORKBOOK_RELS_XML),
      part('xl/styles.xml', STYLES_XML),
      part('xl/worksheets/sheet1.xml', buildDetailsSheet(info))
    ]);
    return new Blob([packed], { type: MIME });
  };

  KADR.exportFileName = function () {
    var d = new Date();
    function pad(v) { return v < 10 ? '0' + v : String(v); }
    return 'KADR_raschet_' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      '_' + pad(d.getHours()) + '-' + pad(d.getMinutes()) + '.xlsx';
  };
})();
