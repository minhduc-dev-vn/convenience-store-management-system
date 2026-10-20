import { formatMoney, formatPercent, formatReportDate } from '../../pages/manager/reports/reportingPresentation';

const CHART_COLOR_COUNT = 8;

function getChartColorClassName(index) {
  return `report-chart-color--${index % CHART_COLOR_COUNT}`;
}

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
    const available = Math.max(100 - offset, 0);
    const size = Math.min(Math.max(Number(item.netRevenueSharePercent ?? 0), 0), available);
    const start = offset;
    offset += size;
    return { categoryId: item.categoryId, index, size, start };
  });

  return (
    <figure className="report-chart report-chart--donut">
      <figcaption>
        <strong>Tỷ trọng doanh thu theo ngành hàng</strong>
        <span>Tỷ lệ đóng góp doanh thu thuần</span>
      </figcaption>
      <div className="report-donut-layout">
        <svg
          aria-label="Biểu đồ tròn tỷ trọng doanh thu theo ngành hàng"
          className="report-donut"
          role="img"
          viewBox="0 0 42 42"
        >
          <circle className="report-donut__base" cx="21" cy="21" pathLength="100" r="15.9155" />
          {segments.map((segment) => (
            <circle
              className={`report-donut__segment ${getChartColorClassName(segment.index)}`}
              cx="21"
              cy="21"
              key={`${segment.categoryId}-${segment.index}`}
              pathLength="100"
              r="15.9155"
              strokeDasharray={`${segment.size} ${100 - segment.size}`}
              strokeDashoffset={-segment.start}
              transform="rotate(-90 21 21)"
            />
          ))}
        </svg>
        <ul className="report-legend">
          {data.map((item, index) => (
            <li key={item.categoryId}>
              <i className={getChartColorClassName(index)} />
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
          const width = Math.min(Math.max((value / maxValue) * 100, 0), 100);
          return (
            <div className="report-bar" key={item.employeeId ?? item.categoryId ?? item[labelKey]}>
              <span>{item[labelKey]}</span>
              <svg
                aria-label={`${item[labelKey]}: ${formatMoney(value)}`}
                className="report-bar__track"
                preserveAspectRatio="none"
                role="img"
                viewBox="0 0 100 12"
              >
                <rect className="report-bar__background" height="12" rx="6" width="100" />
                <rect className="report-bar__value" height="12" rx="6" width={width} />
              </svg>
              <strong>{formatMoney(value)}</strong>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
