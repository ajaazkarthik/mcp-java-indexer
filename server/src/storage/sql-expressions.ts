/** SQL-only simple method name; ignore parameter type package dots. */
export function simpleNameSql(column: 'to_fqn' | 'caller' | 'callee'): string {
  const base = `CASE WHEN instr(${column}, '(')>0 THEN substr(${column},1,instr(${column},'(')-1) ELSE ${column} END`;
  return `replace(${base}, rtrim(${base}, replace(${base}, '.', '')), '')`;
}

/** Equivalent JavaScript extraction for the indexed parameter. */
export function simpleNameOf(fqn: string): string {
  const beforeParams = fqn.includes('(') ? fqn.slice(0, fqn.indexOf('(')) : fqn;
  return beforeParams.slice(beforeParams.lastIndexOf('.')+1);
}
