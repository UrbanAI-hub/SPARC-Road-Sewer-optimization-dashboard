/**
 * Plotly.js interactive charts for Greedy, MILP, and Comparison tabs.
 */

const ChartsManager = (() => {
  const renderedTabs = {
    greedy: false,
    milp: false,
    comparison: false
  };

  const baseLayout = (title, yTitle) => ({
    title: {
      text: title,
      font: { color: '#ffffff', size: 14, family: 'Inter, system-ui, sans-serif' },
      x: 0.01,
      xanchor: 'left',
      y: 0.97,
      yanchor: 'top'
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(255,255,255,0.025)',
    font: { color: '#cbd5e0', size: 12 },
    margin: { t: 74, r: 22, b: 44, l: 68 },
    xaxis: {
      title: 'Year',
      gridcolor: 'rgba(255,255,255,0.07)',
      zerolinecolor: 'rgba(255,255,255,0.15)'
    },
    yaxis: {
      title: yTitle,
      gridcolor: 'rgba(255,255,255,0.07)',
      zerolinecolor: 'rgba(255,255,255,0.25)'
    },
    legend: {
      orientation: 'h',
      yanchor: 'bottom',
      y: 1.01,
      xanchor: 'left',
      x: 0,
      bgcolor: 'rgba(0,0,0,0)',
      font: { size: 11 }
    },
    hovermode: 'x unified'
  });

  const plotConfig = {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
  };

  function renderGreedyCharts(greedyData, params) {
    if (renderedTabs.greedy) return;
    const years = greedyData.map(d => d.year);
    const capKm = (params.optimization.annual_sewer_capacity_m || 40000) / 1000;

    // 1. Capacity
    Plotly.newPlot('chart-greedy-cap', [
      {
        x: years,
        y: greedyData.map(d => d.sewer_m_renovated / 1000),
        type: 'bar',
        name: 'Renovated Sewers (km)',
        marker: { color: '#0d7377', opacity: 0.9 },
        hovertemplate: '%{y:.2f} km<extra></extra>'
      },
      {
        x: [years[0], years[years.length - 1]],
        y: [capKm, capKm],
        type: 'scatter',
        mode: 'lines',
        name: `Max Capacity (${capKm} km)`,
        line: { color: '#e74c3c', width: 2.5, dash: 'dash' },
        hoverinfo: 'skip'
      }
    ], baseLayout('1. Greedy Baseline: Sewer Capacity Utilization', 'Renovated Sewers (km)'), plotConfig);

    // 2. Real Financial Cash Flow (NPV)
    const layoutReal = baseLayout('2. Real Financial Cash Flow (NPV) — CapEx Outflow', 'Real CapEx (€ NPV)');
    layoutReal.barmode = 'stack';
    Plotly.newPlot('chart-greedy-real', [
      {
        x: years,
        y: greedyData.map(d => d.npv_road_cost),
        type: 'bar',
        name: 'Road Capital Cost',
        marker: { color: '#bdc3c7' },
        hovertemplate: '€%{y:,.0f}<extra>Road CapEx</extra>'
      },
      {
        x: years,
        y: greedyData.map(d => d.npv_sewer_cost),
        type: 'bar',
        name: 'Sewer Capital Cost',
        marker: { color: '#2196F3' },
        hovertemplate: '€%{y:,.0f}<extra>Sewer CapEx</extra>'
      }
    ], layoutReal, plotConfig);

    // 3. Virtual Costs & Risk Penalties
    const totalRisk = greedyData.map(d => d.npv_stranded_penalty + d.npv_overdue_penalty);
    const layoutRisk = baseLayout('3. Virtual Costs & Risk Penalties (NPV) — "The Cost of Waiting"', 'Virtual Costs (€ NPV)');
    layoutRisk.barmode = 'stack';
    Plotly.newPlot('chart-greedy-risk', [
      {
        x: years,
        y: greedyData.map(d => d.npv_stranded_penalty),
        type: 'bar',
        name: 'Stranded Asset Penalty (Roads)',
        marker: { color: '#e67e22' },
        hovertemplate: '€%{y:,.0f}<extra>Stranded Waste</extra>'
      },
      {
        x: years,
        y: greedyData.map(d => d.npv_overdue_penalty),
        type: 'bar',
        name: 'Overdue Penalties (Risk / Collapse)',
        marker: { color: '#c0392b' },
        hovertemplate: '€%{y:,.0f}<extra>Overdue Risk</extra>'
      },
      {
        x: years,
        y: totalRisk,
        type: 'scatter',
        mode: 'lines',
        name: 'Total Risk Trajectory',
        line: { color: '#ff7675', width: 2.5 },
        hovertemplate: '€%{y:,.0f}<extra>Total Risk</extra>'
      }
    ], layoutRisk, plotConfig);

    renderedTabs.greedy = true;
  }

  function renderMilpCharts(milpData, params) {
    if (renderedTabs.milp) return;
    const years = milpData.map(d => d.Intervention_Year);
    const capKm = (params.optimization.annual_sewer_capacity_m || 40000) / 1000;

    // 1. Capacity
    Plotly.newPlot('chart-milp-cap', [
      {
        x: years,
        y: milpData.map(d => d.Total_Meters / 1000),
        type: 'bar',
        name: 'Renovated Sewers (km)',
        marker: { color: '#0d7377', opacity: 0.9 },
        hovertemplate: '%{y:.2f} km<extra></extra>'
      },
      {
        x: [years[0], years[years.length - 1]],
        y: [capKm, capKm],
        type: 'scatter',
        mode: 'lines',
        name: `Max Capacity (${capKm} km)`,
        line: { color: '#e74c3c', width: 2.5, dash: 'dash' },
        hoverinfo: 'skip'
      }
    ], baseLayout('1. MILP Optimal Schedule: Sewer Capacity Utilization', 'Renovated Sewers (km)'), plotConfig);

    // 2. Real Financial Cash Flow (NPV) + Negative Salvage Value
    const layoutReal = baseLayout('2. Real Financial Cash Flow (NPV) & Terminal Salvage Rebate', 'Real Cash Flow (€ NPV)');
    layoutReal.barmode = 'relative';
    Plotly.newPlot('chart-milp-real', [
      {
        x: years,
        y: milpData.map(d => d.Road_Cap_NPV),
        type: 'bar',
        name: 'Road Capital Cost',
        marker: { color: '#bdc3c7' },
        hovertemplate: '€%{y:,.0f}<extra>Road CapEx</extra>'
      },
      {
        x: years,
        y: milpData.map(d => d.Sewer_Cap_NPV),
        type: 'bar',
        name: 'Sewer Capital Cost',
        marker: { color: '#2196F3' },
        hovertemplate: '€%{y:,.0f}<extra>Sewer CapEx</extra>'
      },
      {
        x: years,
        y: milpData.map(d => d.Salvage_Value_NPV),
        type: 'bar',
        name: 'Salvage Value Rebate (Future Life)',
        marker: { color: '#27ae60' },
        hovertemplate: '€%{y:,.0f}<extra>Salvage Credit</extra>'
      }
    ], layoutReal, plotConfig);

    // 3. Virtual Costs & Risk Penalties
    const overdue = milpData.map(d => d.Sewer_Overdue_NPV + d.Road_Overdue_NPV);
    const totalRisk = milpData.map((d, i) => d.Road_Stranded_NPV + overdue[i]);
    const layoutRisk = baseLayout('3. Virtual Costs & Risk Penalties (NPV) — Scheduled Assets', 'Virtual Costs (€ NPV)');
    layoutRisk.barmode = 'stack';
    Plotly.newPlot('chart-milp-risk', [
      {
        x: years,
        y: milpData.map(d => d.Road_Stranded_NPV),
        type: 'bar',
        name: 'Stranded Asset Penalty (Roads)',
        marker: { color: '#e67e22' },
        hovertemplate: '€%{y:,.0f}<extra>Stranded Waste</extra>'
      },
      {
        x: years,
        y: overdue,
        type: 'bar',
        name: 'Overdue Penalties (Sewer & Roads)',
        marker: { color: '#c0392b' },
        hovertemplate: '€%{y:,.0f}<extra>Overdue Risk</extra>'
      },
      {
        x: years,
        y: totalRisk,
        type: 'scatter',
        mode: 'lines',
        name: 'Total Risk Trajectory',
        line: { color: '#ff7675', width: 2.5 },
        hovertemplate: '€%{y:,.0f}<extra>Total Risk</extra>'
      }
    ], layoutRisk, plotConfig);

    renderedTabs.milp = true;
  }

  function renderComparisonCharts(compData) {
    if (renderedTabs.comparison) return;
    const g = compData.greedy_yearly;
    const m = compData.milp_yearly;
    const years = g.map(d => d.year);

    // 1. Annual Road Surface (m2/year)
    Plotly.newPlot('chart-comp-m2', [
      {
        x: years,
        y: g.map(d => d.road_m2 / 1000),
        type: 'scatter',
        mode: 'lines',
        name: 'Greedy (Linked m²)',
        line: { color: '#e74c3c', width: 2.5, dash: 'dash' },
        hovertemplate: '%{y:,.0f}k m²<extra>Greedy</extra>'
      },
      {
        x: years,
        y: m.map(d => d.road_m2 / 1000),
        type: 'scatter',
        mode: 'lines',
        name: 'MILP (Linked m²)',
        line: { color: '#2980b9', width: 2.5 },
        hovertemplate: '%{y:,.0f}k m²<extra>MILP</extra>'
      }
    ], baseLayout('Annual Street Paving Surface (Thousands m²/yr)', 'Thousands m²'), plotConfig);

    // 2. Stranded Asset Waste
    const layoutStranded = baseLayout('Stranded Asset Waste (Premature Road Destruction)', 'Millions € (NPV)');
    layoutStranded.barmode = 'group';
    Plotly.newPlot('chart-comp-stranded', [
      {
        x: years,
        y: g.map(d => d.road_stranded / 1e6),
        type: 'bar',
        name: 'Greedy (€380.7M)',
        marker: { color: '#e67e22', opacity: 0.85 },
        hovertemplate: '€%{y:.2f}M<extra>Greedy</extra>'
      },
      {
        x: years,
        y: m.map(d => d.road_stranded / 1e6),
        type: 'bar',
        name: 'MILP (€323.5M)',
        marker: { color: '#27ae60', opacity: 0.85 },
        hovertemplate: '€%{y:.2f}M<extra>MILP</extra>'
      }
    ], layoutStranded, plotConfig);

    // 3. Road Overdue Deterioration Risk
    Plotly.newPlot('chart-comp-road-risk', [
      {
        x: years,
        y: g.map(d => d.road_overdue / 1e9),
        type: 'scatter',
        mode: 'lines',
        name: 'Greedy Road Risk (€31.0B)',
        line: { color: '#c0392b', width: 2.5, dash: 'dash' },
        hovertemplate: '€%{y:.3f}B<extra>Greedy</extra>'
      },
      {
        x: years,
        y: m.map(d => d.road_overdue / 1e9),
        type: 'scatter',
        mode: 'lines',
        name: 'MILP Road Risk (€18.7B)',
        line: { color: '#16a085', width: 2.5 },
        hovertemplate: '€%{y:.3f}B<extra>MILP</extra>'
      }
    ], baseLayout('Road Deterioration Risk ("Decaying Streets Waiting")', 'Billions € (NPV)'), plotConfig);

    // 4. Cumulative Lifecycle NPV with Net Savings Fill
    const cumSum = (arr) => {
      let acc = 0;
      return arr.map(row => {
        acc += (row.sewer_cap + row.road_cap + row.road_stranded + row.sewer_overdue + row.road_overdue + row.salvage_value) / 1e9;
        return acc;
      });
    };
    const gCum = cumSum(g);
    const mCum = cumSum(m);

    Plotly.newPlot('chart-comp-cum', [
      {
        x: years,
        y: mCum,
        type: 'scatter',
        mode: 'lines',
        name: 'MILP Cumulative NPV (€114.9B)',
        line: { color: '#2980b9', width: 3 },
        hovertemplate: '€%{y:.2f}B<extra>MILP</extra>'
      },
      {
        x: years,
        y: gCum,
        type: 'scatter',
        mode: 'lines',
        name: 'Greedy Cumulative NPV (€121.7B)',
        line: { color: '#e67e22', width: 2.5, dash: 'dash' },
        fill: 'tonexty',
        fillcolor: 'rgba(39, 174, 96, 0.22)',
        hovertemplate: '€%{y:.2f}B<extra>Greedy</extra>'
      }
    ], baseLayout('Cumulative Lifecycle NPV (Green Area = €6.81B Savings)', 'Billions € (NPV)'), plotConfig);

    renderedTabs.comparison = true;
  }

  function resizeVisibleCharts(tabName) {
    const ids = {
      greedy: ['chart-greedy-cap', 'chart-greedy-real', 'chart-greedy-risk'],
      milp: ['chart-milp-cap', 'chart-milp-real', 'chart-milp-risk'],
      comparison: ['chart-comp-m2', 'chart-comp-stranded', 'chart-comp-road-risk', 'chart-comp-cum']
    }[tabName] || [];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.data) {
        Plotly.Plots.resize(el);
      }
    });
  }

  return {
    renderGreedyCharts,
    renderMilpCharts,
    renderComparisonCharts,
    resizeVisibleCharts
  };
})();
