/**
 * Main controller for the Rotterdam Integrated Maintenance Optimization Dashboard.
 */

(async function () {
  const fmtEur = (val) => {
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    return `${sign}€${Math.round(abs).toLocaleString('en-US')}`;
  };

  const fmtSignedEur = (val) => {
    const abs = Math.abs(val);
    const sign = val > 0 ? '+' : val < 0 ? '-' : '';
    return `${sign}€${Math.round(abs).toLocaleString('en-US')}`;
  };

  const fmtCompactEur = (val) => {
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    if (abs >= 1e9) return `${sign}€${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}€${(abs / 1e6).toFixed(1)}M`;
    return fmtEur(val);
  };

  let appData = {};

  try {
    const [paramsRes, greedyRes, milpRes, compRes] = await Promise.all([
      fetch('data/parameters.json'),
      fetch('data/greedy_yearly.json'),
      fetch('data/milp_yearly.json'),
      fetch('data/comparison.json')
    ]);

    appData = {
      params: await paramsRes.json(),
      greedyYearly: await greedyRes.json(),
      milpYearly: await milpRes.json(),
      comparison: await compRes.json()
    };
  } catch (err) {
    console.error('Failed to initialize dashboard data:', err);
    return;
  }

  populateHome(appData.params, appData.comparison);
  populatePhysicalCards(appData.comparison);
  populateComparisonTab(appData.comparison);
  populateTakeawaysMetrics(appData.params);
  renderKatexEquations();
  setupTabs();

  function populateHome(params, comp) {
    const ns = params.network_stats || {};
    if (ns.total_sewer_km) {
      document.getElementById('stat-sewer-km').textContent = `${ns.total_sewer_km.toLocaleString('en-US')} km`;
    }
    if (ns.total_road_area_m2) {
      document.getElementById('stat-road-m2').textContent = `${(ns.total_road_area_m2 / 1e6).toFixed(1)} Million m²`;
    }
    if (ns.total_ssus) {
      document.getElementById('stat-ssu-count').textContent = `${ns.total_ssus.toLocaleString('en-US')} units`;
    }
    if (ns.total_street_units) {
      document.getElementById('stat-street-count').textContent = `${ns.total_street_units.toLocaleString('en-US')} units`;
    }

    const gTot = Object.values(comp.greedy_totals).reduce((a, b) => a + b, 0);
    const mTot = Object.values(comp.milp_totals).reduce((a, b) => a + b, 0);
    const netSavings = Math.abs(mTot - gTot);
    document.getElementById('hero-savings-highlight').textContent = fmtCompactEur(netSavings).replace('€', '€');

    const opt = params.optimization;
    const sew = params.sewerage;
    const rd = params.roads;

    const paramRows = [
      {
        name: 'Discount Rate',
        sym: 'r',
        val: `${(opt.discount_rate * 100).toFixed(1)}%`,
        desc: 'Annual rate used to discount future costs and salvage credits to 2025 Net Present Value (Dutch municipal standard).'
      },
      {
        name: 'Annual Sewer Capacity',
        sym: 'Cap',
        val: `${(opt.annual_sewer_capacity_m / 1000).toFixed(0)} km / yr`,
        desc: 'Maximum linear meters of gravity sewer renewable annually under municipal contractor constraints.'
      },
      {
        name: 'Base Sewer Unit Cost',
        sym: 'C_sewer',
        val: `€${sew.gravity_renewal_cost_per_m.toLocaleString('en-US')} / m`,
        desc: 'Direct civil construction cost per linear meter of gravity sewer pipe before operational overhead.'
      },
      {
        name: 'Sewer Operational Multiplier',
        sym: 'm_sewer',
        val: `${sew.operational_cost_multiplier.toFixed(2)} (+${sew.operational_cost_percentage}%)`,
        desc: 'Project management, engineering design, traffic diversion, and subsurface contingency overhead.'
      },
      {
        name: 'Road Operational Multiplier',
        sym: 'm_road',
        val: `${rd.operational_cost_multiplier.toFixed(2)} (+${rd.operational_cost_percentage}%)`,
        desc: 'Additional municipal overhead applied on top of surface & foundation replacement lookup rates.'
      },
      {
        name: 'Sewer Lifespan · Soil 1 (Zeer slap)',
        sym: 'L_1',
        val: `${sew.sewer_lifespan_soil_1} years`,
        desc: 'Pipe durability in very soft peat and organic sediment soils (highest subsidence urgency).'
      },
      {
        name: 'Sewer Lifespan · Soil 2 (Slap)',
        sym: 'L_2',
        val: `${sew.sewer_lifespan_soil_2} years`,
        desc: 'Pipe durability in soft clay soils (prevailing soil profile across Rotterdam).'
      },
      {
        name: 'Sewer Lifespan · Soil 3 (Normaal)',
        sym: 'L_3',
        val: `${sew.sewer_lifespan_soil_3} years`,
        desc: 'Pipe durability in stable sand and firm foundation zones.'
      },
      {
        name: 'Stranded Asset Coefficient',
        sym: 'α',
        val: `${opt.stranded_asset_coefficient_alpha.toFixed(2)} (100%)`,
        desc: 'Penalty multiplier applied to remaining unamortized road value when pavement is demolished prematurely for sewer works.'
      },
      {
        name: 'Overdue Penalty Base Rate',
        sym: 'β',
        val: `${(opt.overdue_penalty_coefficient_beta * 100).toFixed(0)}% / yr`,
        desc: 'Annual risk/failure penalty fraction per asset operating past its due date (calibrated above 4.3% capital recovery factor).'
      },
      {
        name: 'Risk Acceleration Factor',
        sym: 'γ',
        val: `${opt.overdue_acceleration_factor_gamma.toFixed(2)}`,
        desc: 'Exponential compounding exponent (years_late ^ γ) capturing accelerating collapse risk on severely overdue infrastructure.'
      }
    ];

    const tbody = document.querySelector('#parameters-table tbody');
    tbody.innerHTML = paramRows.map(p => `
      <tr>
        <td><strong>${p.name}</strong></td>
        <td><span class="code-pill">${p.sym}</span></td>
        <td class="is-num"><strong>${p.val}</strong></td>
        <td class="has-text-grey-light is-size-7">${p.desc}</td>
      </tr>
    `).join('');
  }

  function populatePhysicalCards(comp) {
    const gp = comp.greedy_physical;
    const mp = comp.milp_physical;

    document.getElementById('greedy-sewer-km').textContent = `${gp.total_sewer_km.toLocaleString('en-US')} km`;
    document.getElementById('greedy-avg-sewer').textContent = `${gp.avg_sewer_km_yr.toFixed(1)} km/yr`;
    document.getElementById('greedy-road-m2').textContent = `${(gp.total_road_m2 / 1e6).toFixed(2)} M m²`;
    document.getElementById('greedy-avg-road').textContent = `${Math.round(gp.avg_road_m2_yr / 1000).toLocaleString('en-US')}k m²/yr`;

    document.getElementById('milp-sewer-km').textContent = `${mp.total_sewer_km.toLocaleString('en-US')} km`;
    document.getElementById('milp-cap-pct').textContent = `${mp.capacity_utilization_pct.toFixed(1)}%`;
    document.getElementById('milp-road-m2').textContent = `${(mp.total_road_m2 / 1e6).toFixed(2)} M m²`;
    document.getElementById('milp-saved-m2').textContent = `${mp.asphalt_saved_m2.toLocaleString('en-US')} m²`;
    document.getElementById('milp-postponed-km').textContent = `${mp.postponed_km.toLocaleString('en-US')} km`;
    document.getElementById('milp-postponed-ssus').textContent = `${mp.postponed_ssus} SSUs assigned to t=9999`;
  }

  function populateComparisonTab(comp) {
    const s = comp.siloed_totals;
    const sp = comp.siloed_physical;
    const g = comp.greedy_totals;
    const m = comp.milp_totals;
    const gp = comp.greedy_physical;
    const mp = comp.milp_physical;

    const sTotal = s ? Object.values(s).reduce((a, b) => a + b, 0) : 0;
    const gCapex = g.sewer_cap + g.road_cap;
    const mCapex = m.sewer_cap + m.road_cap;
    const gTotal = Object.values(g).reduce((a, b) => a + b, 0);
    const mTotal = Object.values(m).reduce((a, b) => a + b, 0);

    // 3-Stage Value of Integration Progression Table
    if (s && sp) {
      const progRows = [
        {
          name: 'Siloed (No Integration · 0-yr lookahead)',
          events: sp.road_events,
          m2: sp.total_road_m2,
          roadCap: s.road_cap,
          stranded: s.road_stranded,
          roadRisk: s.road_overdue,
          totalNpv: sTotal,
          highlight: false
        },
        {
          name: 'Greedy Integrated (5-yr lookahead heuristic)',
          events: gp.road_events,
          m2: gp.total_road_m2,
          roadCap: g.road_cap,
          stranded: g.road_stranded,
          roadRisk: g.road_overdue,
          totalNpv: gTotal,
          highlight: false
        },
        {
          name: 'MILP Optimal Integrated (50-yr global horizon)',
          events: mp.road_events,
          m2: mp.total_road_m2,
          roadCap: m.road_cap,
          stranded: m.road_stranded,
          roadRisk: m.road_overdue,
          totalNpv: mTotal,
          highlight: true
        }
      ];

      document.querySelector('#integration-progression-table tbody').innerHTML = progRows.map(r => {
        const rowCls = r.highlight ? 'is-total-row' : '';
        const badge = r.highlight ? ' <span class="tag is-success-soft ml-1">Best</span>' : '';
        return `
          <tr class="${rowCls}">
            <td><strong>${r.name}</strong>${badge}</td>
            <td class="is-num">${r.events.toLocaleString('en-US')} works</td>
            <td class="is-num">${(r.m2 / 1e6).toFixed(2)} M m²</td>
            <td class="is-num">${fmtCompactEur(r.roadCap)}</td>
            <td class="is-num ${r.highlight ? 'val-saving' : ''}">${fmtCompactEur(r.stranded)}</td>
            <td class="is-num ${r.highlight ? 'val-saving' : ''}">${fmtCompactEur(r.roadRisk)}</td>
            <td class="is-num ${r.highlight ? 'val-saving' : ''}">${fmtCompactEur(r.totalNpv)}</td>
          </tr>
        `;
      }).join('');
    }

    // 5 Savings Breakdown Cards
    const breakdownCards = [
      {
        title: 'Real CapEx (Cash)',
        diff: mCapex - gCapex,
        pct: ((mCapex - gCapex) / gCapex) * 100,
        note: 'Lower net contractor outlays across 50 years',
        accent: 'accent-sewer'
      },
      {
        title: 'Stranded Asphalt Waste',
        diff: m.road_stranded - g.road_stranded,
        pct: ((m.road_stranded - g.road_stranded) / g.road_stranded) * 100,
        note: 'Dig-Once avoids digging up fresh pavement',
        accent: 'accent-green'
      },
      {
        title: 'Road Deterioration Risk',
        diff: m.road_overdue - g.road_overdue,
        pct: ((m.road_overdue - g.road_overdue) / g.road_overdue) * 100,
        note: 'Massive drop in decaying streets waiting on sewers',
        accent: 'accent-teal'
      },
      {
        title: 'Sewer Risk Trade-off',
        diff: m.sewer_overdue - g.sewer_overdue,
        pct: ((m.sewer_overdue - g.sewer_overdue) / g.sewer_overdue) * 100,
        note: 'Rebalanced pipe order to minimize global risk',
        accent: 'accent-orange'
      },
      {
        title: 'NET TOTAL LIFECYCLE',
        diff: mTotal - gTotal,
        pct: ((mTotal - gTotal) / gTotal) * 100,
        note: 'Total lifecycle NPV savings achieved by MILP',
        accent: 'accent-green'
      }
    ];

    document.getElementById('savings-breakdown-cards').innerHTML = breakdownCards.map(c => {
      const isSaving = c.diff < 0;
      const colorClass = isSaving ? 'has-text-success' : 'has-text-danger';
      return `
        <div class="column">
          <div class="stat-card ${c.accent}">
            <div class="stat-label">${c.title}</div>
            <div class="stat-value ${colorClass}" style="font-size: 1.35rem;">
              ${fmtCompactEur(c.diff)} <span class="is-size-7">(${c.pct > 0 ? '+' : ''}${c.pct.toFixed(1)}%)</span>
            </div>
            <div class="stat-sub">${c.note}</div>
          </div>
        </div>
      `;
    }).join('');

    // Master KPI Table rows
    const kpiRows = [
      {
        label: 'Total Sewers Renovated (km)',
        gStr: `${gp.total_sewer_km.toLocaleString('en-US')} km`,
        mStr: `${mp.total_sewer_km.toLocaleString('en-US')} km`,
        diffStr: `${(mp.total_sewer_km - gp.total_sewer_km).toFixed(1)} km`,
        pctStr: `${(((mp.total_sewer_km - gp.total_sewer_km) / gp.total_sewer_km) * 100).toFixed(1)}%`,
        type: 'neutral'
      },
      {
        label: 'Linked Road Surface Intervened (m²)',
        gStr: `${gp.total_road_m2.toLocaleString('en-US')} m²`,
        mStr: `${mp.total_road_m2.toLocaleString('en-US')} m²`,
        diffStr: `${(mp.total_road_m2 - gp.total_road_m2).toLocaleString('en-US')} m²`,
        pctStr: `${(((mp.total_road_m2 - gp.total_road_m2) / gp.total_road_m2) * 100).toFixed(1)}%`,
        type: 'saving'
      },
      {
        label: 'Sewer Capital Cost (NPV)',
        gVal: g.sewer_cap,
        mVal: m.sewer_cap
      },
      {
        label: 'Road Capital Cost (NPV)',
        gVal: g.road_cap,
        mVal: m.road_cap
      },
      {
        label: 'Total Real CapEx Outflow (NPV)',
        gVal: gCapex,
        mVal: mCapex,
        bold: true
      },
      {
        label: 'Stranded Asset Penalty (Road Waste)',
        gVal: g.road_stranded,
        mVal: m.road_stranded
      },
      {
        label: 'Sewer Overdue Failure Risk (NPV)',
        gVal: g.sewer_overdue,
        mVal: m.sewer_overdue
      },
      {
        label: 'Road Overdue Deterioration Risk (NPV)',
        gVal: g.road_overdue,
        mVal: m.road_overdue
      },
      {
        label: 'Terminal Salvage Value Credit (NPV)',
        gVal: g.salvage_value,
        mVal: m.salvage_value,
        denomAbs: true
      },
      {
        label: 'TOTAL LIFECYCLE NPV (Objective)',
        gVal: gTotal,
        mVal: mTotal,
        isTotal: true
      }
    ];

    const tbody = document.querySelector('#comparison-kpi-table tbody');
    tbody.innerHTML = kpiRows.map(r => {
      if (r.gStr) {
        const cls = r.type === 'saving' ? 'val-saving' : 'val-neutral';
        return `
          <tr>
            <td>${r.label}</td>
            <td class="is-num">${r.gStr}</td>
            <td class="is-num">${r.mStr}</td>
            <td class="is-num ${cls}">${r.diffStr}</td>
            <td class="is-num ${cls}">${r.pctStr}</td>
          </tr>
        `;
      }
      const diff = r.mVal - r.gVal;
      const denom = r.denomAbs ? Math.abs(r.gVal) : r.gVal;
      const pct = (diff / denom) * 100;
      const cls = diff < 0 ? 'val-saving' : diff > 0 ? 'val-increase' : 'val-neutral';
      const rowCls = r.isTotal ? 'is-total-row' : '';
      const labelHtml = (r.bold || r.isTotal) ? `<strong>${r.label}</strong>` : r.label;
      return `
        <tr class="${rowCls}">
          <td>${labelHtml}</td>
          <td class="is-num">${fmtEur(r.gVal)}</td>
          <td class="is-num">${fmtEur(r.mVal)}</td>
          <td class="is-num ${cls}">${fmtSignedEur(diff)}</td>
          <td class="is-num ${cls}">${pct > 0 ? '+' : ''}${pct.toFixed(1)}%</td>
        </tr>
      `;
    }).join('');
  }

  function populateTakeawaysMetrics(params) {
    const dq = params.data_quality;
    if (!dq) return;
    document.getElementById('dq-ssu-pct').textContent = `${dq.ssu_missing_year_pct}%`;
    document.getElementById('dq-ssu-score').textContent =
      `${dq.ssu_missing_year_pct}% (${dq.ssu_missing_year_count}/${params.network_stats.total_ssus}) missing`;
    document.getElementById('dq-road-score').textContent =
      `${dq.road_missing_surface_year_pct}% (${dq.road_missing_surface_year_count.toLocaleString('en-US')}) missing`;
  }

  function renderKatexEquations() {
    if (typeof katex === 'undefined') return;
    const eqs = {
      'math-var': 'X_{i,t} \\in \\{0, 1\\} \\quad \\forall i \\in I,\\; \\forall t \\in \\{2025, \\dots, 2074\\} \\cup \\{9999\\}',
      'math-obj': '\\min_{X} \\sum_{i \\in I} \\sum_{t \\in \\mathcal{T}} C_{i,t} \\cdot X_{i,t}',
      'math-c1': '\\sum_{t \\in \\mathcal{T}} X_{i,t} = 1 \\quad \\forall i \\in I \\quad \\text{(Single Scenario)}',
      'math-c2': '\\sum_{i \\in I} L_i \\cdot X_{i,t} \\le 40{,}000\\text{ m} \\quad \\forall t \\in [2025, 2074]'
    };
    Object.entries(eqs).forEach(([id, tex]) => {
      const el = document.getElementById(id);
      if (el) {
        katex.render(tex, el, { throwOnError: false, displayMode: false });
      }
    });
  }

  function activateTab(target) {
    const buttons = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.tab-panel');
    const targetPanel = document.getElementById(`tab-${target}`);
    if (!targetPanel) return;

    buttons.forEach(b => b.classList.toggle('is-active', b.getAttribute('data-tab') === target));
    panels.forEach(p => p.classList.remove('is-active'));
    targetPanel.classList.add('is-active');
    MapsManager.pauseAll();

    if (target === 'greedy') {
      ChartsManager.renderGreedyCharts(appData.greedyYearly, appData.params);
      ChartsManager.resizeVisibleCharts('greedy');
      MapsManager.initModelMaps('greedy');
    } else if (target === 'milp') {
      ChartsManager.renderMilpCharts(appData.milpYearly, appData.params);
      ChartsManager.resizeVisibleCharts('milp');
      MapsManager.initModelMaps('milp');
    } else if (target === 'comparison') {
      ChartsManager.renderComparisonCharts(appData.comparison);
      ChartsManager.resizeVisibleCharts('comparison');
    }
  }

  function setupTabs() {
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        history.replaceState(null, '', `#${target}`);
        activateTab(target);
      });
    });

    const initialHash = window.location.hash.replace('#', '');
    const queryTab = new URLSearchParams(window.location.search).get('tab');
    const startTab = queryTab || initialHash;
    if (startTab && startTab !== 'home') {
      activateTab(startTab);
    }
  }
})();
