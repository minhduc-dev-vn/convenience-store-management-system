const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});
const integer = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDefaultReportPeriod(now = new Date()) {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: localDateValue(from), to: localDateValue(now) };
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === day;
}

export function validateReportPeriod({ from, to } = {}) {
  if (!from || !to) return 'Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc.';
  if (!isIsoDate(from) || !isIsoDate(to)) return 'Khoảng thời gian báo cáo không hợp lệ.';
  if (from > to) return 'Ngày bắt đầu không được sau ngày kết thúc.';
  return '';
}

export function formatMoney(value) {
  return money.format(Number(value ?? 0));
}

export function formatInteger(value) {
  return integer.format(Number(value ?? 0));
}

export function formatPercent(value) {
  return `${percent.format(Number(value ?? 0))}%`;
}

export function formatReportDate(value) {
  if (!value) return '—';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString('vi-VN');
}

export function formatReportDateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('vi-VN');
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createRevenueCsv(report) {
  const summary = report?.summary ?? {};
  const lines = [
    ['BÁO CÁO DOANH THU'],
    ['Từ ngày', summary.from ?? ''],
    ['Đến ngày', summary.to ?? ''],
    [],
    ['Chỉ tiêu', 'Giá trị'],
    ['Số hóa đơn hoàn tất', summary.completedInvoiceCount ?? 0],
    ['Doanh thu gộp', summary.grossRevenue ?? 0],
    ['Tiền hoàn trả', summary.refundAmount ?? 0],
    ['Doanh thu thuần', summary.netRevenue ?? 0],
    [],
    ['Ngày', 'Số hóa đơn', 'Doanh thu gộp', 'Tiền hoàn trả', 'Doanh thu thuần'],
    ...(report?.trend ?? []).map((item) => [
      item.date,
      item.completedInvoiceCount,
      item.grossRevenue,
      item.refundAmount,
      item.netRevenue,
    ]),
  ];
  return lines.map((line) => line.map(csvCell).join(',')).join('\r\n');
}

export function downloadRevenueCsv(report) {
  const csv = `\uFEFF${createRevenueCsv(report)}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const from = report?.summary?.from ?? 'tu-ngay';
  const to = report?.summary?.to ?? 'den-ngay';
  link.href = url;
  link.download = `bao-cao-doanh-thu_${from}_${to}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
