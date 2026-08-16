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

  // "aggregatableCols" = numeric columns that make sense to SUM/AVERAGE.
  // Excludes: (a) date/timestamp columns (Excel stores dates as serial
  // numbers, so they'd otherwise get misclassified as numeric and summing
  // them is meaningless), and (b) ID-like columns (near-100% unique values,
  // or header contains "id" / "number" / "no" as a whole word) — summing an
  // Order ID column produces a large meaningless number.
  const aggregatableCols = numericCols.filter((h) => {
    if (/date|timestamp/i.test(h)) return false;
    if (/\b(id|no|number|code)\b/i.test(h)) return false;
    const values = out.map((r) => r[h]).filter((v) => v !== '' && v !== 0);
    const uniqueRatio = values.length ? new Set(values).size / values.length : 0;
    if (uniqueRatio > 0.95 && out.length > 20) return false; // looks like a unique identifier
    return true;
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
  return { clean: out, headers, numericCols, aggregatableCols, textCols, log };
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
        case 'topNContribution': {
          // e.g. "Top 3 products contribute 62% of revenue"
          const gCol = colMap[kpi.groupField];
          const vCol = colMap[kpi.valueField];
          if (!gCol || !vCol) { value = 'N/A'; break; }
          const agg = {};
          rows.forEach((r) => { agg[r[gCol]] = (agg[r[gCol]] || 0) + (Number(r[vCol]) || 0); });
          const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]);
          const n = kpi.n || 3;
          const total = sorted.reduce((a, [, v]) => a + v, 0);
          const topSum = sorted.slice(0, n).reduce((a, [, v]) => a + v, 0);
          const pct = total ? ((topSum / total) * 100).toFixed(0) : 0;
          const names = sorted.slice(0, n).map(([k]) => k).join(', ');
          value = total ? `${pct}% (${names})` : 'N/A';
          break;
        }
        case 'bestWorstPeriod': {
          // e.g. best/worst month by a value field
          const dCol = colMap[kpi.dateField];
          const vCol = colMap[kpi.valueField];
          if (!dCol || !vCol) { value = 'N/A'; break; }
          const byMonth = {};
          rows.forEach((r) => {
            const m = String(r[dCol]).slice(0, 7);
            if (!m || m === 'N/A') return;
            byMonth[m] = (byMonth[m] || 0) + (Number(r[vCol]) || 0);
          });
          const entries = Object.entries(byMonth);
          if (!entries.length) { value = 'N/A'; break; }
          const sorted = entries.sort((a, b) => (kpi.mode === 'worst' ? a[1] - b[1] : b[1] - a[1]));
          value = `${sorted[0][0]} (${Math.round(sorted[0][1]).toLocaleString('en-IN')})`;
          break;
        }
        case 'growthRate': {
          // % change from first period to last period (month-over-month trend)
          const dCol = colMap[kpi.dateField];
          const vCol = colMap[kpi.valueField];
          if (!dCol || !vCol) { value = 'N/A'; break; }
          const byMonth = {};
          rows.forEach((r) => {
            const m = String(r[dCol]).slice(0, 7);
            if (!m || m === 'N/A') return;
            byMonth[m] = (byMonth[m] || 0) + (Number(r[vCol]) || 0);
          });
          const months = Object.keys(byMonth).sort();
          if (months.length < 2) { value = 'N/A (need 2+ months)'; break; }
          const first = byMonth[months[0]];
          const last = byMonth[months[months.length - 1]];
          const pct = first ? (((last - first) / first) * 100).toFixed(1) : 0;
          value = `${pct > 0 ? '+' : ''}${pct}% (${months[0]} → ${months[months.length - 1]})`;
          break;
        }
        case 'countUnique': {
          const col = colMap[kpi.field];
          if (!col) { value = 'N/A'; break; }
          value = new Set(rows.map((r) => r[col])).size;
          break;
        }
        case 'decliningItems': {
          // Categories whose LAST period value dropped vs their FIRST period value — flags risk areas
          const gCol = colMap[kpi.groupField];
          const vCol = colMap[kpi.valueField];
          const dCol = colMap[kpi.dateField];
          if (!gCol || !vCol || !dCol) { value = 'N/A'; break; }
          const byGroup = {};
          rows.forEach((r) => {
            const g = r[gCol];
            const m = String(r[dCol]).slice(0, 7);
            if (!m || m === 'N/A') return;
            byGroup[g] = byGroup[g] || {};
            byGroup[g][m] = (byGroup[g][m] || 0) + (Number(r[vCol]) || 0);
          });
          const declining = [];
          Object.entries(byGroup).forEach(([g, months]) => {
            const keys = Object.keys(months).sort();
            if (keys.length < 2) return;
            const first = months[keys[0]];
            const last = months[keys[keys.length - 1]];
            if (first > 0 && last < first) {
              const pct = (((last - first) / first) * 100).toFixed(0);
              declining.push({ name: g, pct: Number(pct) });
            }
          });
          declining.sort((a, b) => a.pct - b.pct);
          value = declining.length
            ? declining.slice(0, 5).map((d) => `${d.name} (${d.pct}%)`).join(', ')
            : 'None detected';
          break;
        }
        case 'underperformers': {
          // Bottom N contributors by value — lowest-performing categories/regions/people
          const gCol = colMap[kpi.groupField];
          const vCol = colMap[kpi.valueField];
          if (!gCol || !vCol) { value = 'N/A'; break; }
          const agg = {};
          rows.forEach((r) => { agg[r[gCol]] = (agg[r[gCol]] || 0) + (Number(r[vCol]) || 0); });
          const sorted = Object.entries(agg).sort((a, b) => a[1] - b[1]);
          const n = kpi.n || 3;
          value = sorted.length
            ? sorted.slice(0, n).map(([k, v]) => `${k} (${Math.round(v).toLocaleString('en-IN')})`).join(', ')
            : 'N/A';
          break;
        }
        case 'lossMakingItems': {
          // Categories where cost exceeds revenue (negative margin) — direct loss flags
          const gCol = colMap[kpi.groupField];
          const revCol = colMap[kpi.revenueField];
          const costCol = colMap[kpi.costField];
          if (!gCol || !revCol || !costCol) { value = 'N/A'; break; }
          const agg = {};
          rows.forEach((r) => {
            const g = r[gCol];
            agg[g] = agg[g] || { rev: 0, cost: 0 };
            agg[g].rev += Number(r[revCol]) || 0;
            agg[g].cost += Number(r[costCol]) || 0;
          });
          const lossItems = Object.entries(agg)
            .filter(([, v]) => v.cost > v.rev)
            .map(([g, v]) => `${g} (loss ₹${Math.round(v.cost - v.rev).toLocaleString('en-IN')})`);
          value = lossItems.length ? lossItems.join(', ') : 'None — all categories profitable';
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
