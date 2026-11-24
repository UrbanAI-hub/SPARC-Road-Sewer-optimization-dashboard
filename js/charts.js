/**
 * Plotly.js interactive charts for Greedy, MILP, and Comparison tabs.
 * Styled to harmonize with the SPARC institutional design system.
 */

const ChartsManager = (() => {
  const renderedTabs = {
    greedy: false,
    milp: false,
    comparison: false
  };

  let cachedData = {
    greedy: null,
    milp: null,
    comparison: null,
    params: null
  };

  function isDarkTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  function getThemeColors() {
    const dark = isDarkTheme();
    return {
      textColor: dark ? '#f8fafc' : '#1e293b',
      textMuted: dark ? '#94a3b8' : '#64748b',
      gridColor: dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      zeroLineColor: dark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.12)',
      plotBg: dark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)'
    };
  }

  const baseLayout = (title, yTitle) => {
    const theme = getThemeColors();
    return {
      title: {
        text: title,
        font: { color: theme.textColor, size: 13, family: 'Inter, system-ui, sans-serif', weight: 700 },
        x: 0.01,
        xanchor: 'left',
        y: 0.97,
        yanchor: 'top'
      },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: theme.plotBg,
      font: { color: theme.textMuted, size: 11, family: 'Inter, sans-serif' },
      margin: { t: 64, r: 20, b: 44, l: 64 },
      xaxis: {
        title: { text: 'Planning Year', font: { size: 11, color: theme.textMuted } },
        gridcolor: theme.gridColor,
        zerolinecolor: theme.zeroLineColor,
        tickfont: { size: 10, color: theme.textMuted }
      },
      yaxis: {
        title: { text: yTitle, font: { size: 11, color: theme.textMuted } },
        gridcolor: theme.gridColor,
        zerolinecolor: theme.zeroLineColor,
        tickfont: { size: 10, color: theme.textMuted }
      },
      legend: {
        orientation: 'h',
        yanchor: 'bottom',
        y: 1.02,
        xanchor: 'left',
        x: 0,
        bgcolor: 'rgba(0,0,0,0)',
        font: { size: 11, color: theme.textColor }
      },
      hovermode: 'x unified'
    };
  };

  const plotConfig = {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
  };

  function renderGreedyCharts(greedyData, params) {
    cachedData.greedy = greedyData;
    cachedData.params = params;
    renderedTabs.greedy = true;

    const years = greedyData.map(d => d.year || d.Intervention_Year);
    const capKm = ((params && params.optimization && params.optimization.annual_sewer_capacity_m) || 40000) / 1000;

    // 1. Capacity
    const sewerKm = greedyData.map(d => (d.sewer_m !== undefined ? d.sewer_m : (d.sewer_m_renovated || 0)) / 1000);
    Plotly.newPlot('chart-greedy-cap', [
      {
        x: years,
        y: sewerKm,
        type: 'bar',
        name: 'Renovated Sewers (km)',
        marker: { color: '#00a4cc', opacity: 0.9 },
        hovertemplate: '%{y:.2f} km<extra>Renovated</extra>'
      },
      {
        x: [years[0], years[years.length - 1]],
        y: [capKm, capKm],
        type: 'scatter',
        mode: 'lines',
        name: `Statutory Contractor Ceiling (${capKm} km)`,
        line: { color: '#dc2626', width: 2.5, dash: 'dash' },
        hoverinfo: 'skip'
      }
    ], baseLayout('1. Heuristic Schedule: Annual Sewer Renewal vs. Capacity Limit', 'Renovated Sewers (km)'), plotConfig);

    // 2. Real Financial Cash Flow (NPV)
    const layoutReal = baseLayout('2. Real Capital Cash Flow (NPV) — Excavation & Paving Outflows', 'Real CapEx (€ NPV)');
    layoutReal.barmode = 'stack';
    Plotly.newPlot('chart-greedy-real', [
      {
        x: years,
        y: greedyData.map(d => d.road_cap !== undefined ? d.road_cap : d.npv_road_cost),
        type: 'bar',
        name: 'Road Pavement CapEx',
        marker: { color: '#64748b' },
        hovertemplate: '€%{y:,.0f}<extra>Road CapEx</extra>'
      },
      {
        x: years,
        y: greedyData.map(d => d.sewer_cap !== undefined ? d.sewer_cap : d.npv_sewer_cost),
        type: 'bar',
        name: 'Sewer Civil CapEx',
        marker: { color: '#00a4cc' },
        hovertemplate: '€%{y:,.0f}<extra>Sewer CapEx</extra>'
      }
    ], layoutReal, plotConfig);

    // 3. Risk & Capital Destruction
    const stranded = greedyData.map(d => d.road_stranded !== undefined ? d.road_stranded : (d.npv_stranded_penalty || 0));
    const sewerRisk = greedyData.map(d => d.sewer_overdue !== undefined ? d.sewer_overdue : (d.npv_overdue_penalty || 0));
    const roadRisk = greedyData.map(d => d.road_overdue !== undefined ? d.road_overdue : 0);
    const totalRisk = years.map((_, i) => stranded[i] + sewerRisk[i] + roadRisk[i]);

    const layoutRisk = baseLayout('3. Societal Deterioration Liability & Avoided Capital Destruction (NPV)', 'Liability & Waste (€ NPV)');
    layoutRisk.barmode = 'stack';
    Plotly.newPlot('chart-greedy-risk', [
      {
        x: years,
        y: stranded,
        type: 'bar',
        name: 'Capital Destruction (Stranded Asphalt)',
        marker: { color: '#d97706' },
        hovertemplate: '€%{y:,.0f}<extra>Stranded Waste</extra>'
      },
      {
        x: years,
        y: sewerRisk,
        type: 'bar',
        name: 'Sewer Collapse & Delay Risk',
        marker: { color: '#dc2626' },
        hovertemplate: '€%{y:,.0f}<extra>Sewer Risk</extra>'
      },
      {
        x: years,
        y: roadRisk,
        type: 'bar',
        name: 'Road Deterioration Risk',
        marker: { color: '#8a00cc' },
        hovertemplate: '€%{y:,.0f}<extra>Road Risk</extra>'
      },
      {
        x: years,
        y: totalRisk,
        type: 'scatter',
        mode: 'lines',
        name: 'Total Risk Trajectory',
        line: { color: '#f87171', width: 2.5 },
        hovertemplate: '€%{y:,.0f}<extra>Total Risk</extra>'
      }
    ], layoutRisk, plotConfig);
  }

  function renderMilpCharts(milpData, params) {
    cachedData.milp = milpData;
    cachedData.params = params;
    renderedTabs.milp = true;

    const years = milpData.map(d => d.year || d.Intervention_Year);
    const capKm = ((params && params.optimization && params.optimization.annual_sewer_capacity_m) || 40000) / 1000;

    // 1. Capacity
    const sewerKm = milpData.map(d => (d.sewer_m !== undefined ? d.sewer_m : (d.Total_Meters || 0)) / 1000);
    Plotly.newPlot('chart-milp-cap', [
      {
        x: years,
        y: sewerKm,
        type: 'bar',
        name: 'Renovated Sewers (km)',
        marker: { color: '#00a4cc', opacity: 0.9 },
        hovertemplate: '%{y:.2f} km<extra>Renovated</extra>'
      },
      {
        x: [years[0], years[years.length - 1]],
        y: [capKm, capKm],
        type: 'scatter',
        mode: 'lines',
        name: `Strict Statutory Ceiling (${capKm} km)`,
        line: { color: '#dc2626', width: 2.5, dash: 'dash' },
        hoverinfo: 'skip'
      }
    ], baseLayout('1. MILP Optimal Schedule: Sewer Renewal Under Strict 40 km Ceiling', 'Renovated Sewers (km)'), plotConfig);

    // 2. Real Financial Cash Flow (NPV) + Negative Salvage Value
    const layoutReal = baseLayout('2. Real Capital Outflows & Terminal Salvage Credit (NPV)', 'Real Cash Flow (€ NPV)');
    layoutReal.barmode = 'relative';
    Plotly.newPlot('chart-milp-real', [
      {
        x: years,
        y: milpData.map(d => d.road_cap !== undefined ? d.road_cap : d.Road_Cap_NPV),
        type: 'bar',
        name: 'Road Pavement CapEx',
        marker: { color: '#64748b' },
        hovertemplate: '€%{y:,.0f}<extra>Road CapEx</extra>'
      },
      {
        x: years,
        y: milpData.map(d => d.sewer_cap !== undefined ? d.sewer_cap : d.Sewer_Cap_NPV),
        type: 'bar',
        name: 'Sewer Civil CapEx',
        marker: { color: '#00a4cc' },
        hovertemplate: '€%{y:,.0f}<extra>Sewer CapEx</extra>'
      },
      {
        x: years,
        y: milpData.map(d => d.salvage_value !== undefined ? d.salvage_value : (d.Salvage_Value_NPV || 0)),
        type: 'bar',
        name: 'Terminal Salvage Value (2074 Asset Heritage)',
        marker: { color: '#16a34a' },
        hovertemplate: '€%{y:,.0f}<extra>Residual Value Credit</extra>'
      }
    ], layoutReal, plotConfig);

    // 3. Risk Penalties
    const stranded = milpData.map(d => d.road_stranded !== undefined ? d.road_stranded : (d.Road_Stranded_NPV || 0));
    const sewerRisk = milpData.map(d => d.sewer_overdue !== undefined ? d.sewer_overdue : (d.Sewer_Overdue_NPV || 0));
    const roadRisk = milpData.map(d => d.road_overdue !== undefined ? d.road_overdue : (d.Road_Overdue_NPV || 0));
    const totalRisk = years.map((_, i) => stranded[i] + sewerRisk[i] + roadRisk[i]);

    const layoutRisk = baseLayout('3. Societal Deterioration Liability & Avoided Capital Destruction (NPV)', 'Liability & Waste (€ NPV)');
    layoutRisk.barmode = 'stack';
    Plotly.newPlot('chart-milp-risk', [
      {
        x: years,
        y: stranded,
        type: 'bar',
        name: 'Capital Destruction (Stranded Asphalt)',
        marker: { color: '#d97706' },
        hovertemplate: '€%{y:,.0f}<extra>Stranded Waste</extra>'
      },
      {
        x: years,
        y: sewerRisk,
        type: 'bar',
        name: 'Sewer Risk (Trade-off Managed)',
        marker: { color: '#dc2626' },
        hovertemplate: '€%{y:,.0f}<extra>Sewer Risk</extra>'
      },
      {
        x: years,
        y: roadRisk,
        type: 'bar',
        name: 'Road Deterioration Risk (Heavily Suppressed)',
        marker: { color: '#8a00cc' },
        hovertemplate: '€%{y:,.0f}<extra>Road Risk</extra>'
      },
      {
        x: years,
        y: totalRisk,
        type: 'scatter',
        mode: 'lines',
        name: 'Total Risk Trajectory',
        line: { color: '#f87171', width: 2.5 },
        hovertemplate: '€%{y:,.0f}<extra>Total Risk</extra>'
      }
    ], layoutRisk, plotConfig);
  }

  function renderComparisonCharts(compData) {
    cachedData.comparison = compData;
    renderedTabs.comparison = true;

    const g = compData.greedy_yearly;
    const m = compData.milp_yearly;
    const years = g.map(d => d.year);

    // 1. Annual Road Surface
    Plotly.newPlot('chart-comp-m2', [
      {
        x: years,
        y: g.map(d => d.road_m2 / 1000),
        type: 'scatter',
        mode: 'lines',
        name: 'Heuristic Baseline (Linked m²)',
        line: { color: '#ea580c', width: 2.5, dash: 'dash' },
        hovertemplate: '%{y:,.0f}k m²<extra>Heuristic</extra>'
      },
      {
        x: years,
        y: m.map(d => d.road_m2 / 1000),
        type: 'scatter',
        mode: 'lines',
        name: 'MILP Optimal (Linked m²)',
        line: { color: '#00a4cc', width: 2.5 },
        hovertemplate: '%{y:,.0f}k m²<extra>MILP Optimal</extra>'
      }
    ], baseLayout('Annual Street Paving Surface (Thousands m²/yr)', 'Thousands m²'), plotConfig);

    // 2. Stranded Asphalt Waste
    const layoutStranded = baseLayout('Avoided Capital Destruction (Premature Pavement Excavation)', 'Millions € (NPV)');
    layoutStranded.barmode = 'group';
    Plotly.newPlot('chart-comp-stranded', [
      {
        x: years,
        y: g.map(d => d.road_stranded / 1e6),
        type: 'bar',
        name: 'Heuristic Baseline (€380.7M)',
        marker: { color: '#d97706', opacity: 0.85 },
        hovertemplate: '€%{y:.2f}M<extra>Heuristic</extra>'
      },
      {
        x: years,
        y: m.map(d => d.road_stranded / 1e6),
        type: 'bar',
        name: 'MILP Optimal (€323.5M · -€57.2M Saved)',
        marker: { color: '#16a34a', opacity: 0.85 },
        hovertemplate: '€%{y:.2f}M<extra>MILP Optimal</extra>'
      }
    ], layoutStranded, plotConfig);

    // 3. Road Overdue Deterioration Risk
    Plotly.newPlot('chart-comp-road-risk', [
      {
        x: years,
        y: g.map(d => d.road_overdue / 1e9),
        type: 'scatter',
        mode: 'lines',
        name: 'Heuristic Road Risk (€31.04B)',
        line: { color: '#dc2626', width: 2.5, dash: 'dash' },
        hovertemplate: '€%{y:.3f}B<extra>Heuristic</extra>'
      },
      {
        x: years,
        y: m.map(d => d.road_overdue / 1e9),
        type: 'scatter',
        mode: 'lines',
        name: 'MILP Road Risk (€18.68B · -39.8%)',
        line: { color: '#16a34a', width: 2.5 },
        hovertemplate: '€%{y:.3f}B<extra>MILP Optimal</extra>'
      }
    ], baseLayout('Road Deterioration Risk ("Achterstallig Onderhoud")', 'Billions € (NPV)'), plotConfig);

    // 4. Cumulative Lifecycle NPV
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
        name: 'MILP Optimal Cumulative NPV (€114.90B)',
        line: { color: '#00a4cc', width: 3 },
        hovertemplate: '€%{y:.2f}B<extra>MILP Optimal</extra>'
      },
      {
        x: years,
        y: gCum,
        type: 'scatter',
        mode: 'lines',
        name: 'Heuristic Baseline Cumulative NPV (€121.71B)',
        line: { color: '#d97706', width: 2.5, dash: 'dash' },
        fill: 'tonexty',
        fillcolor: 'rgba(22, 163, 74, 0.18)',
        hovertemplate: '€%{y:.2f}B<extra>Heuristic Baseline</extra>'
      }
    ], baseLayout('Cumulative Lifecycle NPV (Green Shading = €6.81B Net Savings)', 'Billions € (NPV)'), plotConfig);
  }

  function refreshAllCharts() {
    if (renderedTabs.greedy && cachedData.greedy) {
      renderedTabs.greedy = false;
      renderGreedyCharts(cachedData.greedy, cachedData.params);
    }
    if (renderedTabs.milp && cachedData.milp) {
      renderedTabs.milp = false;
      renderMilpCharts(cachedData.milp, cachedData.params);
    }
    if (renderedTabs.comparison && cachedData.comparison) {
      renderedTabs.comparison = false;
      renderComparisonCharts(cachedData.comparison);
    }
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
    resizeVisibleCharts,
    refreshAllCharts
  };
})();
