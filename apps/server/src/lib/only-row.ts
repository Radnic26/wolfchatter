/**
 * For statements whose shape guarantees one row, such as an INSERT … RETURNING. An empty
 * result then means the driver contract broke, which is worth a loud failure rather than
 * an undefined travelling on into a response body.
 */
export function onlyRow<Row>(rows: Row[]): Row {
  const [row] = rows;
  if (row === undefined) {
    throw new Error("The database returned no row where exactly one was expected.");
  }
  return row;
}
