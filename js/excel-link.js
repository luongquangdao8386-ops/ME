// Nút "Nhập/xuất Excel" trên danh sách (4.4.11): chỉ hiện khi có quyền xuất hoặc nhập; màn Excel kiểm lại theo module
import { bi } from './core.js';
import { ICON } from './ui.js';
import { can } from './data.js';

export async function excelLink(key, { exportOnly = false } = {}) {
  const ok = (await can('export.xlsx')) || (!exportOnly && (await can('import.template')));
  return ok ? `<a class="btn small" href="#/excel/${key}">${ICON.excel}<span>${bi('excel.title')}</span></a>` : '';
}
