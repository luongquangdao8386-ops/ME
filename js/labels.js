// Tem QR (phụ lục 1.5 mục 6.5.2): A4, nhỏ 70 × 37 mm (24 tem) hoặc lớn 105 × 74 mm (8 tem).
// Nội dung: QR, mã hiển thị, loại hồ sơ, tên Việt, tên Trung, mã khu vực. Không logo, không chữ M&E.
import qrcode from '../vendor/qrcode-generator-2.0.4.mjs';
import { APP_BASE_URL, esc, bi } from './core.js';

const TYPE_LABEL = {
  EQUIPMENT: ['Thiết bị', '设备'], MATERIAL: ['Vật tư', '物料'],
  INSPECTION_REQUIREMENT: ['Yêu cầu kiểm định', '检验要求'], CONTRACT: ['Hợp đồng thuê ngoài', '外包合同']
};

export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true }); // vùng trắng 4 module
}

/** items: [{entity_type, code, qr_key, name_vi, name_zh, location_code}] ; size: SMALL | LARGE */
export function labelSheetHtml(items, size) {
  const cls = size === 'LARGE' ? 'large' : 'small';
  const perPage = size === 'LARGE' ? 8 : 24;
  const pages = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return pages.map((page) => `<section class="label-page ${cls}">${page.map((it) => {
    const t = TYPE_LABEL[it.entity_type] || ['', ''];
    return `<div class="label">
      <div class="label-qr">${qrSvg(APP_BASE_URL + '#/r/' + it.qr_key)}</div>
      <div class="label-text">
        <div class="label-code">${esc(it.code)}</div>
        <div class="label-type">${esc(t[0])} · ${esc(t[1])}</div>
        <div class="label-name">${esc(it.name_vi || '')}</div>
        <div class="label-name zh">${esc(it.name_zh || '')}</div>
        ${it.location_code ? `<div class="label-loc">${esc(it.location_code)}</div>` : ''}
        ${it.machine ? `<div class="label-mt no-print">${bi('tag.machine_translated')}</div>` : ''}
      </div></div>`;
  }).join('')}</section>`).join('');
}
