const COMPACT_COLUMN_KEY_PATTERN = /Id$|date|time|At$|status|role|phone|barcode|price|amount|quantity|stock|unit|count|total|period|rank|gender|discrepancy/i;
const BREAKABLE_COLUMN_KEY_PATTERN = /^(email|username)$/i;

export function getDataTableColumnClassName(column) {
  const classes = [column.className];
  const key = String(column.key);
  const isAction = /^(actions?|view)$/.test(key);
  const isBreakable = column.breakable === true || BREAKABLE_COLUMN_KEY_PATTERN.test(key);
  const isCompactValue = COMPACT_COLUMN_KEY_PATTERN.test(key);

  if (isAction) classes.push('data-table__cell--actions');
  if (isBreakable) {
    classes.push('data-table__cell--breakable');
  } else if (column.nowrap === true || (column.nowrap !== false && isCompactValue)) {
    classes.push('data-table__cell--nowrap');
  }

  return classes.filter(Boolean).join(' ') || undefined;
}

