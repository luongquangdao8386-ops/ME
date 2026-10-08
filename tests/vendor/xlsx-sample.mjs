// Dữ liệu mẫu dùng chung cho test SheetJS (Node và trình duyệt)
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const XLSX_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'vendor', 'xlsx-0.20.3.full.min.js');

// U+1EC0–U+1EDF (ề ể ố ồ ổ ộ ờ ở…) và nhiều chữ Hán có byte UTF-8 0x80–0x9F — đúng chỗ dễ hỏng khi giải mã
export const SAMPLE_ROWS = [
  ['Mã · 编号', 'Tên · 名称', 'Ghi chú · 备注'],
  ['TB-0001', 'Thiết bị: ố ồ ổ ỗ ộ ớ ờ ở ỡ ợ ề ể ễ ệ ỉ ị ọ ỏ ủ ứ ừ ử ữ ự Ố Ồ Ổ Ộ Ờ Ở Ề Ể Ệ Ị Ọ Ỏ Đ đ ư ơ ă â ê ô', '设备 · 物料库 · 检验 · 合同 · 机器翻译'],
  ['TB-0002', '“trích dẫn” – € © ½ ≤ 40 °C · ワークシート · 맑은 고딕 · 🔧', 'Kiểm định · 检验']
];
export const SAMPLE_SHEET = 'Thiết bị · 设备';
