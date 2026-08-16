/**
 * Business-type report templates.
 * Each template tells the engine which columns to look for (by regex),
 * which KPIs to compute, and which chart groupings make sense for that
 * industry. Used by both backend (routes/reports.js) and can be mirrored
 * in the frontend for client-side preview.
 */

const TEMPLATES = {
  retail: {
    label: 'Retail / Sales',
    columnHints: {
      date: /date|order.?date|invoice.?date/i,
      category: /category|product|item|sku/i,
      region: /region|store|branch|location|city/i,
      salesperson: /sales.?person|agent|rep|employee/i,
      qty: /qty|quantity|units?.?sold/i,
      revenue: /revenue|sales|amount|total/i,
      cost: /cost|cogs|purchase.?price/i
    },
    kpis: [
      { key: 'totalRevenue', label: 'Total Revenue', type: 'sum', field: 'revenue' },
      { key: 'totalUnits', label: 'Units Sold', type: 'sum', field: 'qty' },
      { key: 'avgOrderValue', label: 'Avg Order Value', type: 'avgOf', field: 'revenue' },
      { key: 'grossProfit', label: 'Gross Profit', type: 'diff', fields: ['revenue', 'cost'] },
      { key: 'grossMargin', label: 'Gross Margin %', type: 'marginPct', fields: ['revenue', 'cost'] },
      { key: 'growthRate', label: 'Revenue Growth (first→last month)', type: 'growthRate', dateField: 'date', valueField: 'revenue' },
      { key: 'bestMonth', label: 'Best Month', type: 'bestWorstPeriod', mode: 'best', dateField: 'date', valueField: 'revenue' },
      { key: 'worstMonth', label: 'Weakest Month', type: 'bestWorstPeriod', mode: 'worst', dateField: 'date', valueField: 'revenue' },
      { key: 'topProduct', label: 'Top Selling Product', type: 'topBy', groupField: 'category', valueField: 'revenue' },
      { key: 'top3Contribution', label: 'Top 3 Products Contribute', type: 'topNContribution', n: 3, groupField: 'category', valueField: 'revenue' },
      { key: 'topRegion', label: 'Top Region/Store', type: 'topBy', groupField: 'region', valueField: 'revenue' },
      { key: 'topSalesperson', label: 'Top Salesperson', type: 'topBy', groupField: 'salesperson', valueField: 'revenue' },
      { key: 'decliningProducts', label: '⚠️ Declining Products (risk)', type: 'decliningItems', groupField: 'category', valueField: 'revenue', dateField: 'date' },
      { key: 'underperformingProducts', label: '⚠️ Lowest Performing Products', type: 'underperformers', n: 3, groupField: 'category', valueField: 'revenue' },
      { key: 'lossMakingProducts', label: '🔴 Loss-Making Products', type: 'lossMakingItems', groupField: 'category', revenueField: 'revenue', costField: 'cost' }
    ],
    charts: [
      { title: 'Revenue by Product', type: 'bar', group: 'category', value: 'revenue' },
      { title: 'Revenue by Region/Store', type: 'doughnut', group: 'region', value: 'revenue' },
      { title: 'Sales Trend', type: 'line', group: 'date', value: 'revenue' },
      { title: 'Revenue by Salesperson', type: 'bar', group: 'salesperson', value: 'revenue' }
    ]
  },

  mis: {
    label: 'General MIS / Operations',
    columnHints: {
      date: /date|period|month/i,
      department: /dept|department|team|division/i,
      metric: /metric|kpi|indicator/i,
      value: /value|actual|target|count|amount/i,
      status: /status|state/i
    },
    kpis: [
      { key: 'totalRecords', label: 'Total Records', type: 'count' },
      { key: 'totalValue', label: 'Total Value', type: 'sum', field: 'value' },
      { key: 'avgValue', label: 'Average Value', type: 'avgOf', field: 'value' },
      { key: 'topDepartment', label: 'Top Department', type: 'topBy', groupField: 'department', valueField: 'value' },
      { key: 'completionRate', label: 'Completed %', type: 'shareWhere', field: 'status', equals: 'Completed' }
    ],
    charts: [
      { title: 'Value by Department', type: 'bar', group: 'department', value: 'value' },
      { title: 'Status Breakdown', type: 'doughnut', group: 'status', value: 'value' },
      { title: 'Trend Over Time', type: 'line', group: 'date', value: 'value' }
    ]
  },

  finance: {
    label: 'Finance / Accounts',
    columnHints: {
      date: /date|txn.?date|posting.?date/i,
      account: /account|ledger|head|category/i,
      debit: /debit|expense|payment/i,
      credit: /credit|income|receipt/i,
      amount: /amount|value/i
    },
    kpis: [
      { key: 'totalIncome', label: 'Total Income (Credit)', type: 'sum', field: 'credit' },
      { key: 'totalExpense', label: 'Total Expense (Debit)', type: 'sum', field: 'debit' },
      { key: 'netCashflow', label: 'Net Cashflow', type: 'diff', fields: ['credit', 'debit'] },
      { key: 'growthRate', label: 'Income Growth (first→last month)', type: 'growthRate', dateField: 'date', valueField: 'credit' },
      { key: 'bestMonth', label: 'Best Income Month', type: 'bestWorstPeriod', mode: 'best', dateField: 'date', valueField: 'credit' },
      { key: 'worstMonth', label: 'Highest Expense Month', type: 'bestWorstPeriod', mode: 'best', dateField: 'date', valueField: 'debit' },
      { key: 'topExpenseHead', label: 'Top Expense Head', type: 'topBy', groupField: 'account', valueField: 'debit' },
      { key: 'top3ExpenseContribution', label: 'Top 3 Expense Heads Contribute', type: 'topNContribution', n: 3, groupField: 'account', valueField: 'debit' },
      { key: 'burnRate', label: 'Avg Monthly Expense', type: 'avgByMonth', field: 'debit', dateField: 'date' },
      { key: 'decliningIncome', label: '⚠️ Declining Income Heads (risk)', type: 'decliningItems', groupField: 'account', valueField: 'credit', dateField: 'date' },
      { key: 'underperformingHeads', label: '⚠️ Lowest Income Heads', type: 'underperformers', n: 3, groupField: 'account', valueField: 'credit' }
    ],
    charts: [
      { title: 'Income vs Expense by Head', type: 'bar', group: 'account', value: 'debit' },
      { title: 'Expense by Head', type: 'doughnut', group: 'account', value: 'debit' },
      { title: 'Cashflow Trend', type: 'line', group: 'date', value: 'credit' }
    ]
  },

  general: {
    label: 'General / Auto-detect',
    columnHints: {},
    kpis: [
      { key: 'totalRecords', label: 'Total Records', type: 'count' }
    ],
    charts: []
  }
};

/**
 * Given cleaned rows + a template, map actual column headers in the file
 * to the template's logical fields (date, revenue, cost, etc.) using regex hints.
 */
function mapColumns(headers, template) {
  const map = {};
  Object.entries(template.columnHints || {}).forEach(([logicalName, regex]) => {
    const candidates = headers.filter((h) => regex.test(h));
    if (!candidates.length) return;
    if (candidates.length === 1) { map[logicalName] = candidates[0]; return; }

    // Multiple headers match the same hint (e.g. both "Unit Cost" and "Total
    // Cost" match /cost/i). Score each candidate so we pick the one that
    // represents the ORDER-LEVEL total, not a per-unit rate — summing a
    // per-unit price across every row produces meaningless, wildly inflated
    // totals (this caused negative "Gross Margin %" in real reports).
    const scored = candidates.map((h) => {
      let score = 0;
      if (/\btotal\b/i.test(h)) score += 3;
      if (/\b(unit|per|avg|average|rate)\b/i.test(h)) score -= 3;
      score -= h.length * 0.01; // slight preference for shorter/simpler names on ties
      return { h, score };
    });
    scored.sort((a, b) => b.score - a.score);
    map[logicalName] = scored[0].h;
  });
  return map;
}

module.exports = { TEMPLATES, mapColumns };
