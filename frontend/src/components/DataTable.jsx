import { getDataTableColumnClassName } from './dataTableColumns';

function DataTable({
  caption,
  className = '',
  columns,
  emptyMessage = 'Không có dữ liệu phù hợp.',
  getRowClassName,
  getRowKey,
  minWidth,
  rows,
}) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new TypeError('DataTable requires at least one column');
  }

  const safeRows = Array.isArray(rows) ? rows : [];
  const sizeClass = columns.length >= 9
    ? 'data-table--xwide'
    : columns.length >= 7
      ? 'data-table--wide'
      : columns.length >= 5
        ? 'data-table--standard'
        : 'data-table--compact';
  const tableClassName = ['data-table', sizeClass, className].filter(Boolean).join(' ');
  const tableStyle = minWidth == null
    ? undefined
    : { '--table-min-width': typeof minWidth === 'number' ? `${minWidth}px` : minWidth };

  return (
    <div className="table-scroll" tabIndex={0}>
      <table className={tableClassName} style={tableStyle}>
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column) => (
              <th className={getDataTableColumnClassName(column)} key={column.key} scope="col">{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeRows.length === 0 ? (
            <tr>
              <td className="data-table__empty" colSpan={columns.length}>{emptyMessage}</td>
            </tr>
          ) : safeRows.map((row, rowIndex) => (
            <tr
              className={getRowClassName ? getRowClassName(row) : undefined}
              key={getRowKey ? getRowKey(row) : row.id ?? rowIndex}
            >
              {columns.map((column) => (
                <td className={getDataTableColumnClassName(column)} key={column.key}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
