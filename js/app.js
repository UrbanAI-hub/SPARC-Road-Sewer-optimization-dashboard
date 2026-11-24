/**
 * Main application controller for the Rotterdam Integrated Infrastructure Optimization Dashboard.
 * SPARC Initiative · TU Delft · EUR · Gemeente Rotterdam
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

  // Populate UI views
  populateHome(appData.params, appData.comparison);
  populatePhysicalCards(appData.comparison);
  populateComparisonTab(appData.comparison);
  populateTakeawaysMetrics(appData.params);
  renderKatexEquations();
  setupTabs();
  setupThemeToggle();

  function populateHome(params, comp) {
    const ns = params.network_stats || {};
    if (ns.total_sewer_km) {
      const el = document.getElementById('stat-sewer-km');
      if (el) el.textContent = `${ns.total_sewer_km.toLocaleString('en-US')} km`;
    }
    if (ns.total_road_area_m2) {
      const el = document.getElementById('stat-road-m2');
      if (el) el.textContent = `${(ns.total_road_area_m2 / 1e6).toFixed(1)}M m²`;
    }
    if (ns.total_ssus) {
      const el = document.getElementById('stat-ssu-count');
      if (el) el.textContent = `${ns.total_ssus.toLocaleString('en-US')} Drainage Subsystems (SSUs)`;
    }
    if (ns.total_street_units) {
      const el = document.getElementById('stat-street-count');
      if (el) el.textContent = `${ns.total_street_units.toLocaleString('en-US')} Street Units (Crossings)`;
    }

    const gTot = Object.values(comp.greedy_totals).reduce((a, b) => a + b, 0);
    const mTot = Object.values(comp.milp_totals).reduce((a, b) => a + b, 0);
    const netSavings = Math.abs(mTot - gTot);
    const heroEl = document.getElementById('hero-savings-highlight');
    if (heroEl) heroEl.textContent = fmtCompactEur(netSavings);

    const opt = params.optimization;
    const sew = params.sewerage;
    const rd = params.roads;

    const paramRows = [
      {
        name: 'Annual Discount Rate',
        sym: 'r',
        val: `${(opt.discount_rate * 100).toFixed(1)}%`,
        desc: 'Discrete discount rate used to compute 2025 Net Present Value (NPV), per Dutch municipal capital guidelines.'
      },
      {
        name: 'Annual Sewer Works Ceiling',
        sym: 'Cap',
        val: `${(opt.annual_sewer_capacity_m / 1000).toFixed(0)} km / yr`,
        desc: 'Maximum linear meters of gravity sewer renewable annually under civil engineering contractor constraints.'
      },
      {
        name: 'Gravity Sewer Renewal Base Cost',
        sym: 'C_{sewer}',
        val: `€${sew.gravity_renewal_cost_per_m.toLocaleString('en-US')} / m`,
        desc: 'Direct civil construction cost per linear meter of gravity pipe replacement before overhead.'
      },
      {
        name: 'Sewer Operational Surcharge',
        sym: 'm_{sewer}',
        val: `${sew.operational_cost_multiplier.toFixed(2)} (+${sew.operational_cost_percentage}%)`,
        desc: 'Project management, civil engineering design, traffic rerouting, and geotechnical contingency factor.'
      },
      {
        name: 'Road Operational Surcharge',
        sym: 'm_{road}',
        val: `${rd.operational_cost_multiplier.toFixed(2)} (+${rd.operational_cost_percentage}%)`,
        desc: 'Municipal surcharge applied on top of surface, binder, and base course lookup prices.'
      },
      {
        name: 'Sewer Lifespan · Soil 1 (Zeer slap)',
        sym: 'L_1',
        val: `${sew.sewer_lifespan_soil_1} years`,
        desc: 'Durability in very soft peat and deltaic silt soils (highest subsidence urgency).'
      },
      {
        name: 'Sewer Lifespan · Soil 2 (Slap)',
        sym: 'L_2',
        val: `${sew.sewer_lifespan_soil_2} years`,
        desc: 'Durability in soft clay soils (prevailing soil condition across 93.7% of Rotterdam).'
      },
      {
        name: 'Sewer Lifespan · Soil 3 (Normaal)',
        sym: 'L_3',
        val: `${sew.sewer_lifespan_soil_3} years`,
        desc: 'Durability in stable sand and consolidated Pleistocene foundations.'
      },
      {
        name: 'Capital Destruction Multiplier',
        sym: 'α',
        val: `${opt.stranded_asset_coefficient_alpha.toFixed(2)} (100%)`,
        desc: 'Loss factor applied to unamortized straight-line road value when freshly repaved streets are demolished for pipe renewals.'
      },
      {
        name: 'Overdue Penalty Base Fraction',
        sym: 'β',
        val: `${(opt.overdue_penalty_coefficient_beta * 100).toFixed(0)}% / yr`,
        desc: 'Annual risk charge fraction per asset operating past due date (calibrated above the 4.3% capital recovery factor).'
      },
      {
        name: 'Risk Compounding Exponent',
        sym: 'γ',
        val: `${opt.overdue_acceleration_factor_gamma.toFixed(2)}`,
        desc: 'Exponential factor (years_late ^ γ) capturing non-linear deterioration and catastrophic collapse probability.'
      }
    ];

    const tbody = document.querySelector('#parameters-table tbody');
    if (tbody) {
      tbody.innerHTML = paramRows.map(p => `
        <tr>
          <td><strong>${p.name}</strong></td>
          <td><span class="code-pill">${p.sym}</span></td>
          <td class="is-num"><strong>${p.val}</strong></td>
          <td class="has-text-grey is-size-7">${p.desc}</td>
        </tr>
      `).join('');
    }
  }

  function populatePhysicalCards(comp) {
    const gp = comp.greedy_physical;
    const mp = comp.milp_physical;

    const setTxt = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    setTxt('greedy-sewer-km', `${gp.total_sewer_km.toLocaleString('en-US')} km`);
    setTxt('greedy-avg-sewer', `${gp.avg_sewer_km_yr.toFixed(1)} km/yr`);
    setTxt('greedy-road-m2', `${(gp.total_road_m2 / 1e6).toFixed(2)} M m²`);
    setTxt('greedy-avg-road', `${Math.round(gp.avg_road_m2_yr / 1000).toLocaleString('en-US')}k m²/yr`);

    setTxt('milp-sewer-km', `${mp.total_sewer_km.toLocaleString('en-US')} km`);
    setTxt('milp-cap-pct', `${mp.capacity_utilization_pct.toFixed(1)}%`);
    setTxt('milp-road-m2', `${(mp.total_road_m2 / 1e6).toFixed(2)} M m²`);
    setTxt('milp-saved-m2', `${mp.asphalt_saved_m2.toLocaleString('en-US')} m²`);
    setTxt('milp-postponed-km', `${mp.postponed_km.toLocaleString('en-US')} km`);
    setTxt('milp-postponed-ssus', `${mp.postponed_ssus} SSUs assigned to t=9999`);
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

    // 3-Stage Progression Table (Populate in Tab 1 and Tab 4)
    if (s && sp) {
      const progRows = [
        {
          name: 'Siloed Practice (Uncoordinated · 0-yr lookahead)',
          events: sp.road_events,
          m2: sp.total_road_m2,
          roadCap: s.road_cap,
          stranded: s.road_stranded,
          roadRisk: s.road_overdue,
          totalNpv: sTotal,
          highlight: false
        },
        {
          name: 'Heuristic Baseline (5-yr lookahead rule-of-thumb)',
          events: gp.road_events,
          m2: gp.total_road_m2,
          roadCap: g.road_cap,
          stranded: g.road_stranded,
          roadRisk: g.road_overdue,
          totalNpv: gTotal,
          highlight: false
        },
        {
          name: 'MILP Global Optimal (50-yr synchronized optimization)',
          events: mp.road_events,
          m2: mp.total_road_m2,
          roadCap: m.road_cap,
          stranded: m.road_stranded,
          roadRisk: m.road_overdue,
          totalNpv: mTotal,
          highlight: true
        }
      ];

      const progHtml = progRows.map(r => {
        const rowCls = r.highlight ? 'is-total-row' : '';
        const badge = r.highlight ? ' <span class="tag is-success-soft ml-1">Optimal</span>' : '';
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

      const tableEl = document.querySelector('#integration-progression-table tbody');
      if (tableEl) tableEl.innerHTML = progHtml;
    }

    // 5 Savings Breakdown Cards
    const breakdownCards = [
      {
        title: 'Real Capital Outflows (Cash)',
        diff: mCapex - gCapex,
        pct: ((mCapex - gCapex) / gCapex) * 100,
        note: 'Lower contractor procurement spend',
        accent: 'accent-sewer'
      },
      {
        title: 'Avoided Capital Destruction',
        diff: m.road_stranded - g.road_stranded,
        pct: ((m.road_stranded - g.road_stranded) / g.road_stranded) * 100,
        note: 'Avoids digging up fresh pavement',
        accent: 'accent-green'
      },
      {
        title: 'Road Deterioration Risk',
        diff: m.road_overdue - g.road_overdue,
        pct: ((m.road_overdue - g.road_overdue) / g.road_overdue) * 100,
        note: 'Drastic drop in decaying streets waiting on sewers',
        accent: 'accent-cyan'
      },
      {
        title: 'Sewer Risk Trade-off',
        diff: m.sewer_overdue - g.sewer_overdue,
        pct: ((m.sewer_overdue - g.sewer_overdue) / g.sewer_overdue) * 100,
        note: 'Rebalanced pipe queue to minimize global impact',
        accent: 'accent-orange'
      },
      {
        title: 'NET LIFECYCLE SAVINGS',
        diff: mTotal - gTotal,
        pct: ((mTotal - gTotal) / gTotal) * 100,
        note: '50-year global lifecycle NPV benefit',
        accent: 'accent-green'
      }
    ];

    const cardsContainer = document.getElementById('savings-breakdown-cards');
    if (cardsContainer) {
      cardsContainer.innerHTML = breakdownCards.map(c => {
        const isSaving = c.diff < 0;
        const colorClass = isSaving ? 'val-saving' : 'val-increase';
        return `
          <div class="column">
            <div class="stat-card ${c.accent}">
              <div>
                <div class="stat-label">${c.title}</div>
                <div class="stat-value ${colorClass}" style="font-size: 1.35rem;">
                  ${fmtCompactEur(c.diff)} <span class="is-size-7">(${c.pct > 0 ? '+' : ''}${c.pct.toFixed(1)}%)</span>
                </div>
              </div>
              <div class="stat-sub">${c.note}</div>
            </div>
          </div>
        `;
      }).join('');
    }

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
        label: 'Avoided Capital Destruction (Stranded Road Waste)',
        gVal: g.road_stranded,
        mVal: m.road_stranded
      },
      {
        label: 'Sewer Overdue Collapse & Failure Risk (NPV)',
        gVal: g.sewer_overdue,
        mVal: m.sewer_overdue
      },
      {
        label: 'Road Overdue Deterioration Risk (NPV)',
        gVal: g.road_overdue,
        mVal: m.road_overdue
      },
      {
        label: 'Terminal Salvage Value Credit (2074 Asset Heritage)',
        gVal: g.salvage_value,
        mVal: m.salvage_value,
        denomAbs: true
      },
      {
        label: 'TOTAL 50-YEAR LIFECYCLE NPV (Objective)',
        gVal: gTotal,
        mVal: mTotal,
        isTotal: true
      }
    ];

    const tbody = document.querySelector('#comparison-kpi-table tbody');
    if (tbody) {
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
  }

  function populateTakeawaysMetrics(params) {
    const dq = params.data_quality;
    if (!dq) return;
    const ssuPctEl = document.getElementById('dq-ssu-pct');
    if (ssuPctEl) ssuPctEl.textContent = `${dq.ssu_missing_year_pct}%`;
    const ssuScoreEl = document.getElementById('dq-ssu-score');
    if (ssuScoreEl) ssuScoreEl.textContent = `${dq.ssu_missing_year_pct}% (${dq.ssu_missing_year_count}/${params.network_stats.total_ssus}) missing`;
    const roadScoreEl = document.getElementById('dq-road-score');
    if (roadScoreEl) roadScoreEl.textContent = `${dq.road_missing_surface_year_pct}% (${dq.road_missing_surface_year_count.toLocaleString('en-US')}/${params.network_stats.total_street_units.toLocaleString('en-US')}) missing`;
  }

  function renderKatexEquations() {
    if (typeof katex === 'undefined') return;
    const eqs = {
      'math-var': 'X_{i,t} \\in \\{0, 1\\} \\quad \\forall i \\in I,\\; \\forall t \\in \\{2025, \\dots, 2074\\} \\cup \\{9999\\}',
      'math-cost-coeff': 'C_{i,t} = \\text{CapEx}_{i,t}^{\\text{sewer}} + \\text{Risk}_{i,t}^{\\text{sewer}} + \\text{CapEx}_{i,t}^{\\text{road}} + \\text{Stranded}_{i,t}^{\\text{road}} + \\text{Risk}_{i,t}^{\\text{road}} - \\text{Salvage}_{i,t}',
      'math-obj': '\\min_{X} \\sum_{i \\in I} \\sum_{t \\in \\mathcal{T}} C_{i,t} \\cdot X_{i,t}',
      'math-c1': '\\sum_{t \\in \\mathcal{T}} X_{i,t} = 1 \\quad \\forall i \\in I \\quad \\text{(Single Scenario per Subsystem)}',
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
    if (window.MapsManager) MapsManager.pauseAll();

    if (target === 'greedy') {
      ChartsManager.renderGreedyCharts(appData.greedyYearly, appData.params);
      ChartsManager.resizeVisibleCharts('greedy');
      if (window.MapsManager) MapsManager.initModelMaps('greedy');
    } else if (target === 'milp') {
      ChartsManager.renderMilpCharts(appData.milpYearly, appData.params);
      ChartsManager.resizeVisibleCharts('milp');
      if (window.MapsManager) MapsManager.initModelMaps('milp');
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

  function setupThemeToggle() {
    const toggleBtn = document.getElementById('theme-toggle');
    if (!toggleBtn) return;

    const savedTheme = localStorage.getItem('sparc_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    toggleBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('sparc_theme', next);
      toggleBtn.textContent = next === 'dark' ? '☀️' : '🌙';
      ChartsManager.refreshAllCharts();
    });
  }
})();
