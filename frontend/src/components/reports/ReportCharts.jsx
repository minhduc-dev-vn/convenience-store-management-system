import { formatMoney, formatPercent, formatReportDate } from '../../pages/manager/reports/reportingPresentation';

const DONUT_COLORS = ['#174f3c', '#e97043', '#90ad3b', '#5a7d70', '#d2a63c', '#8e6b9f', '#ba5c4d', '#4f7ca8'];

export function RevenueTrendChart({ data = [] }) {
  if (data.length === 0) return null;
  const width = 760;
  const height = 300;
  const padding = 42;
  const maxValue = Math.max(...data.map((item) => Number(item.netRevenue ?? 0)), 1);
  const denominator = Math.max(data.length - 1, 1);
  const points = data.map((item, index) => {
    const x = padding + (index / denominator) * (width - padding * 2);
    const y = height - padding - (Number(item.netRevenue ?? 0) / maxValue) * (height - padding * 2);
    return { ...item, x, y };
  });
  const labelIndexes = [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])];

  return (
    <figure className="report-chart report-chart--wide">
      <figcaption>
        <strong>Xu hướng doanh thu thuần</strong>
        <span>Theo từng ngày trong khoảng đã chọn</span>
      </figcaption>
      <div className="report-chart__scroll">
        <svg aria-label="Biểu đồ đường xu hướng doanh thu thuần" role="img" viewBox={`0 0 ${width} ${height}`}>
          {[0, 0.5, 1].map((ratio) => {
            const y = height - padding - ratio * (height - padding * 2);
            return (
              <g key={ratio}>
                <line className="report-chart__grid" x1={padding} x2={width - padding} y1={y} y2={y} />
                <text className="report-chart__axis" x={padding} y={y - 8}>{formatMoney(maxValue * ratio)}</text>
              </g>
            );
          })}
          <polyline
            className="report-chart__line"
            fill="none"
            points={points.map((point) => `${point.x},${point.y}`).join(' ')}
          />
          {points.map((point, index) => (
            <g key={`${point.date}-${index}`}>
              <circle className="report-chart__point" cx={point.x} cy={point.y} r="5">
                <title>{`${formatReportDate(point.date)}: ${formatMoney(point.netRevenue)}`}</title>
              </circle>
              {labelIndexes.includes(index) && (
                <text className="report-chart__axis report-chart__axis--date" textAnchor="middle" x={point.x} y={height - 12}>
                  {formatReportDate(point.date)}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </figure>
  );
}

export function CategoryDonutChart({ data = [] }) {
  if (data.length === 0) return null;
  let offset = 0;
  const segments = data.map((item, index) => {
    const size = Math.max(Number(item.netRevenueSharePercent ?? 0), 0);
    const start = offset;
    offset += size;
    return `${DONUT_COLORS[index % DONUT_COLORS.length]} ${start}% ${offset}%`;
  });

  return (
    <figure className="report-chart report-chart--donut">
      <figcaption>
        <strong>Tỷ trọng doanh thu theo ngành hàng</strong>
        <span>Tỷ lệ đóng góp doanh thu thuần</span>
      </figcaption>
      <div className="report-donut-layout">
        <div
          aria-label="Biểu đồ tròn tỷ trọng doanh thu theo ngành hàng"
          className="report-donut"
          role="img"
          style={{ background: `conic-gradient(${segments.join(', ')})` }}
        />
        <ul className="report-legend">
          {data.map((item, index) => (
            <li key={item.categoryId}>
              <i style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} />
              <span>{item.name}</span>
              <strong>{formatPercent(item.netRevenueSharePercent)}</strong>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

export function HorizontalBarChart({ data = [], labelKey, title, valueKey }) {
  if (data.length === 0) return null;
  const maxValue = Math.max(...data.map((item) => Number(item[valueKey] ?? 0)), 1);
  return (
    <figure className="report-chart report-chart--bars">
      <figcaption>
        <strong>{title}</strong>
        <span>So sánh theo doanh thu thuần</span>
      </figcaption>
      <div className="report-bars">
        {data.map((item) => {
          const value = Number(item[valueKey] ?? 0);
          return (
            <div className="report-bar" key={item.employeeId ?? item.categoryId ?? item[labelKey]}>
              <span>{item[labelKey]}</span>
              <div><i style={{ width: `${(value / maxValue) * 100}%` }} /></div>
              <strong>{formatMoney(value)}</strong>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
