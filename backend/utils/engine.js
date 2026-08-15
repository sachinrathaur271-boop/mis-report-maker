const { mapColumns } = require('./templates');

/** Clean raw rows: trim spaces, drop blank rows, fill blanks, dedupe, coerce numbers. */
function cleanRows(rows) {
  const log = [];
  if (!rows.length) return { clean: [], headers: [], numericCols: [], textCols: [], log: ['No data found.'] };

  const headers = Object.keys(rows[0]);
  let trimmed = 0;

  let out = rows.map((r) => {
    const nr = {};
    headers.forEach((h) => {
      let v = r[h];
      if (typeof v === 'string') {
        const t = v.trim().replace(/\s+/g, ' ');
        if (t !== v) trimmed++;
        v = t;
      }
      nr[h] = v;
    });
    return nr;
  });
  if (trimmed) log.push(`Trimmed extra spaces in ${trimmed} cell(s).`);

  const before1 = out.length;
  out = out.filter((r) => headers.some((h) => String(r[h]).trim() !== ''));
  if (before1 - out.length) log.push(`Removed ${before1 - out.length} blank row(s).`);

  const numericCols = [];
  const textCols = [];
  headers.forEach((h) => {
    let numLike = 0, total = 0;
    out.forEach((r) => {
      if (String(r[h]).trim() === '') return;
      total++;
      if (!isNaN(parseFloat(r[h])) && isFinite(r[h])) numLike++;
    });
    if (total && numLike / total > 0.7) numericCols.push(h);
    else textCols.push(h);
  });

  let filled = 0;
  out = out.map((r) => {
    const nr = { ...r };
    headers.forEach((h) => {
      if (String(nr[h]).trim() === '') {
        nr[h] = numericCols.includes(h) ? 0 : 'N/A';
        filled++;
      }
    });
    return nr;
  });
  if (filled) log.push(`Filled ${filled} blank cell(s).`);

  out = out.map((r) => {
    const nr = { ...r };
    numericCols.forEach((h) => { nr[h] = parseFloat(nr[h]) || 0; });
    return nr;
  });

  const before2 = out.length;
  const seen = new Set();
  out = out.filter((r) => {
    const key = JSON.stringify(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (before2 - out.length) log.push(`Removed ${before2 - out.length} duplicate row(s).`);

  log.push(`Final: ${out.length} row(s), ${headers.length} column(s).`);
  return { clean: out, headers, numericCols, textCols, log };
}

/** Compute KPIs for a given business template against cleaned rows. */
function computeKPIs(rows, headers, template) {
  const colMap = mapColumns(headers, template);
  const results = [];

  const sumField = (logicalField) => {
    const col = colMap[logicalField];
    if (!col) return 0;
    return rows.reduce((a, r) => a + (Number(r[col]) || 0), 0);
  };

  template.kpis.forEach((kpi) => {
    let value = null;
    try {
      switch (kpi.type) {
        case 'count':
          value = rows.length;
          break;
        case 'sum':
          value = sumField(kpi.field);
          break;
        case 'avgOf':
          value = rows.length ? sumField(kpi.field) / rows.length : 0;
          break;
        case 'diff': {
          const [a, b] = kpi.fields;
          value = sumField(a) - sumField(b);
          break;
        }
        case 'marginPct': {
          const [a, b] = kpi.fields;
          const totalA = sumField(a);
          const totalB = sumField(b);
          value = totalA ? ((totalA - totalB) / totalA) * 100 : 0;
          break;
        }
        case 'topBy': {
          const gCol = colMap[kpi.groupField];
          const vCol = colMap[kpi.valueField];
          if (!gCol || !vCol) { value = 'N/A'; break; }
          const agg = {};
          rows.forEach((r) => { agg[r[gCol]] = (agg[r[gCol]] || 0) + (Number(r[vCol]) || 0); });
          const top = Object.entries(agg).sort((a, b) => b[1] - a[1])[0];
          value = top ? top[0] : 'N/A';
          break;
        }
        case 'shareWhere': {
          const col = colMap[kpi.field];
          if (!col) { value = 'N/A'; break; }
          const matchCount = rows.filter((r) => String(r[col]).toLowerCase() === kpi.equals.toLowerCase()).length;
          value = rows.length ? ((matchCount / rows.length) * 100).toFixed(1) + '%' : '0%';
          break;
        }
        case 'avgByMonth': {
          const col = colMap[kpi.field];
          const dCol = colMap[kpi.dateField];
          if (!col || !dCol) { value = 'N/A'; break; }
          const byMonth = {};
          rows.forEach((r) => {
            const m = String(r[dCol]).slice(0, 7);
            byMonth[m] = (byMonth[m] || 0) + (Number(r[col]) || 0);
          });
          const months = Object.keys(byMonth);
          value = months.length ? months.reduce((a, m) => a + byMonth[m], 0) / months.length : 0;
          break;
        }
        default:
          value = 'N/A';
      }
    } catch (e) {
      value = 'N/A';
    }
    results.push({ key: kpi.key, label: kpi.label, value });
  });

  return { colMap, kpis: results };
}

module.exports = { cleanRows, computeKPIs };
