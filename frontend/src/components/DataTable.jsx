function DataTable({
  caption,
  columns,
  emptyMessage = 'Không có dữ liệu phù hợp.',
  getRowKey,
  rows,
}) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new TypeError('DataTable requires at least one column');
  }

  const safeRows = Array.isArray(rows) ? rows : [];

  return (
    <div className="table-scroll" tabIndex={0}>
      <table className="data-table">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeRows.length === 0 ? (
            <tr>
              <td className="data-table__empty" colSpan={columns.length}>{emptyMessage}</td>
            </tr>
          ) : safeRows.map((row, rowIndex) => (
            <tr key={getRowKey ? getRowKey(row) : row.id ?? rowIndex}>
              {columns.map((column) => (
                <td key={column.key}>
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
