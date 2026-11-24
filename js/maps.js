/**
 * Leaflet.js interactive timeline maps for Greedy Baseline & MILP Optimizer tabs.
 * Uses Canvas rendering + pre-bucketed year layers for instant 60fps year slider playback.
 * SPARC Initiative · Rotterdam Infrastructure Optimization
 */

const MapsManager = (() => {
  const ROTTERDAM_CENTER = [51.9244, 4.4777];
  const BASE_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const BASE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors';

  const loadedModels = {
    greedy: false,
    milp: false
  };

  const loadingPromises = {};
  const instances = {};

  function resolveElement(candidateIds) {
    for (const id of candidateIds) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  function showLoading(container, text) {
    if (!container) return;
    container.innerHTML = `
      <div style="display:flex;height:100%;align-items:center;justify-content:center;flex-direction:column;gap:0.75rem;color:var(--text-muted);font-size:0.88rem;padding:1.5rem;text-align:center;">
        <div style="width:36px;height:36px;border:3px solid rgba(0,164,204,0.2);border-top-color:var(--primary-cyan);border-radius:50%;animation:map-spin 0.8s linear infinite;"></div>
        <div>${text || 'Loading spatial layers...'}</div>
      </div>
      <style>@keyframes map-spin { to { transform: rotate(360deg); } }</style>
    `;
  }

  function buildMapController(containerEl, sliderEl, playBtnEl, yearBadgeEl, countsEl, ssuGeo, roadGeo, mode, modelName) {
    if (!containerEl) {
      console.warn('Map container element is missing');
      return null;
    }

    containerEl.innerHTML = '';

    const renderer = L.canvas({ padding: 0.5 });
    const map = L.map(containerEl, {
      center: ROTTERDAM_CENTER,
      zoom: 11,
      preferCanvas: true,
      renderer: renderer
    });

    L.tileLayer(BASE_TILES, {
      maxZoom: 19,
      attribution: BASE_ATTR
    }).addTo(map);

    const ssuGroup = L.featureGroup().addTo(map);
    const roadGroup = L.featureGroup().addTo(map);

    // Pre-bucket layers by year for instant O(1) slider updates
    const ssuByYear = {};
    const roadByYear = {};
    const ssuFirstYear = new Map();
    const roadFirstYear = new Map();

    for (let y = 2025; y <= 2074; y++) {
      ssuByYear[y] = [];
      roadByYear[y] = [];
    }

    const isMilp = modelName === 'milp';

    const ssuStyle = {
      color: '#0284c7',
      weight: 1.5,
      fillColor: '#38bdf8',
      fillOpacity: 0.40,
      renderer: renderer
    };

    const roadStyle = {
      color: isMilp ? '#15803d' : '#b45309',
      weight: 2.2,
      fillColor: isMilp ? '#16a34a' : '#d97706',
      fillOpacity: 0.85,
      renderer: renderer
    };

    if (ssuGeo && ssuGeo.features) {
      L.geoJSON(ssuGeo, {
        style: () => ssuStyle,
        renderer: renderer,
        onEachFeature: (feature, layer) => {
          const p = feature.properties || {};
          const yrs = p.y || [];
          layer.bindPopup(() => `
            <div style="color:#1a202c;font-size:12px;font-family:Inter,system-ui,sans-serif;">
              <strong>Sewer Subsystem (SSU):</strong> ${p.id}<br>
              <strong>Gravity Length:</strong> ${p.len_m ? Number(p.len_m).toLocaleString() + ' m' : 'N/A'}<br>
              <strong>Scheduled Year:</strong> ${yrs.join(', ')}
            </div>
          `);
          if (yrs.length > 0) {
            const firstY = Math.min(...yrs);
            ssuFirstYear.set(layer, firstY);
            yrs.forEach(yr => {
              if (ssuByYear[yr]) ssuByYear[yr].push(layer);
            });
          }
        }
      });
    }

    if (roadGeo && roadGeo.features) {
      L.geoJSON(roadGeo, {
        style: () => roadStyle,
        renderer: renderer,
        onEachFeature: (feature, layer) => {
          const p = feature.properties || {};
          const yrs = p.y || [];
          layer.bindPopup(() => `
            <div style="color:#1a202c;font-size:12px;font-family:Inter,system-ui,sans-serif;">
              <strong>Street Unit:</strong> ${p.id}<br>
              <strong>Surface Area:</strong> ${p.area ? Number(p.area).toLocaleString() + ' m²' : 'N/A'}<br>
              <strong>Renovation Year(s):</strong> ${yrs.join(', ')}
            </div>
          `);
          if (yrs.length > 0) {
            const firstY = Math.min(...yrs);
            roadFirstYear.set(layer, firstY);
            yrs.forEach(yr => {
              if (roadByYear[yr]) roadByYear[yr].push(layer);
            });
          }
        }
      });
    }

    let currentRenderYear = null;
    let playTimer = null;

    function renderYear(targetYear) {
      targetYear = parseInt(targetYear, 10);
      if (yearBadgeEl) yearBadgeEl.textContent = targetYear;
      if (sliderEl) sliderEl.value = targetYear;

      if (mode === 'isolated') {
        ssuGroup.clearLayers();
        roadGroup.clearLayers();
        const ssus = ssuByYear[targetYear] || [];
        const roads = roadByYear[targetYear] || [];
        ssus.forEach(l => ssuGroup.addLayer(l));
        roads.forEach(l => roadGroup.addLayer(l));
        if (countsEl) {
          countsEl.textContent = `${ssus.length} SSUs · ${roads.length.toLocaleString('en-US')} Roads`;
        }
      } else {
        if (currentRenderYear === null || targetYear < currentRenderYear) {
          ssuGroup.clearLayers();
          roadGroup.clearLayers();
          for (const [layer, fy] of ssuFirstYear.entries()) {
            if (fy <= targetYear) ssuGroup.addLayer(layer);
          }
          for (const [layer, fy] of roadFirstYear.entries()) {
            if (fy <= targetYear) roadGroup.addLayer(layer);
          }
        } else {
          for (let y = currentRenderYear + 1; y <= targetYear; y++) {
            (ssuByYear[y] || []).forEach(l => {
              if (!ssuGroup.hasLayer(l)) ssuGroup.addLayer(l);
            });
            (roadByYear[y] || []).forEach(l => {
              if (!roadGroup.hasLayer(l)) roadGroup.addLayer(l);
            });
          }
        }
        if (countsEl) {
          countsEl.textContent = `${ssuGroup.getLayers().length} SSUs · ${roadGroup.getLayers().length.toLocaleString('en-US')} Roads`;
        }
      }
      currentRenderYear = targetYear;
    }

    function stopPlayback() {
      if (playTimer) {
        clearInterval(playTimer);
        playTimer = null;
        if (playBtnEl) playBtnEl.textContent = '▶ Play';
      }
    }

    if (sliderEl) {
      sliderEl.addEventListener('input', (e) => {
        stopPlayback();
        renderYear(e.target.value);
      });
    }

    if (playBtnEl) {
      playBtnEl.addEventListener('click', () => {
        if (playTimer) {
          stopPlayback();
        } else {
          if (sliderEl && parseInt(sliderEl.value, 10) >= 2074) {
            renderYear(2025);
          }
          playBtnEl.textContent = '⏸ Pause';
          playTimer = setInterval(() => {
            const currentVal = sliderEl ? parseInt(sliderEl.value, 10) : (currentRenderYear || 2025);
            const next = currentVal + 1;
            if (next > 2074) {
              stopPlayback();
            } else {
              renderYear(next);
            }
          }, 380);
        }
      });
    }

    // Initial render at 2030
    renderYear(2030);

    setTimeout(() => {
      map.invalidateSize();
    }, 120);

    return { map, stopPlayback, renderYear };
  }

  async function initModelMaps(modelName) {
    if (loadedModels[modelName]) {
      refreshSizes(modelName);
      return;
    }

    if (loadingPromises[modelName]) {
      return loadingPromises[modelName];
    }

    const isoContainer = resolveElement([`map-${modelName}-isolated`, `map-${modelName}-iso`]);
    const cumContainer = resolveElement([`map-${modelName}-cumulative`, `map-${modelName}-cum`]);

    const isoSlider = resolveElement([`slider-${modelName}-iso`, `slider-${modelName}-isolated`]);
    const cumSlider = resolveElement([`slider-${modelName}-cum`, `slider-${modelName}-cumulative`]);

    const isoPlay = resolveElement([`play-${modelName}-iso`, `play-${modelName}-isolated`]);
    const cumPlay = resolveElement([`play-${modelName}-cum`, `play-${modelName}-cumulative`]);

    const isoBadge = resolveElement([`badge-${modelName}-iso`, `year-${modelName}-iso`]);
    const cumBadge = resolveElement([`badge-${modelName}-cum`, `year-${modelName}-cum`]);

    const isoCounts = resolveElement([`counts-${modelName}-iso`, `counts-${modelName}-isolated`]);
    const cumCounts = resolveElement([`counts-${modelName}-cum`, `counts-${modelName}-cumulative`]);

    showLoading(isoContainer, 'Loading annual isolated spatial network...');
    showLoading(cumContainer, 'Loading cumulative footprint spatial network...');

    loadingPromises[modelName] = (async () => {
      try {
        const [ssuRes, roadRes] = await Promise.all([
          fetch(`data/${modelName}_ssu_geo.json`),
          fetch(`data/${modelName}_road_geo.json`)
        ]);

        if (!ssuRes.ok || !roadRes.ok) {
          throw new Error(`Failed to fetch GeoJSON layers for ${modelName} (${ssuRes.status}/${roadRes.status})`);
        }

        const [ssuGeo, roadGeo] = await Promise.all([ssuRes.json(), roadRes.json()]);

        const isoCtrl = buildMapController(
          isoContainer,
          isoSlider,
          isoPlay,
          isoBadge,
          isoCounts,
          ssuGeo,
          roadGeo,
          'isolated',
          modelName
        );

        const cumCtrl = buildMapController(
          cumContainer,
          cumSlider,
          cumPlay,
          cumBadge,
          cumCounts,
          ssuGeo,
          roadGeo,
          'cumulative',
          modelName
        );

        instances[modelName] = [isoCtrl, cumCtrl].filter(Boolean);
        loadedModels[modelName] = true;

        // Invalidate size to guarantee full canvas rendering
        [100, 300, 600].forEach(delay => {
          setTimeout(() => refreshSizes(modelName), delay);
        });
      } catch (err) {
        console.error('MapsManager error:', err);
        loadedModels[modelName] = false;
        [isoContainer, cumContainer].forEach(el => {
          if (el) {
            el.innerHTML = `<div class="map-loading has-text-danger" style="padding:2rem;text-align:center;font-size:0.9rem;">
              <strong>Error loading spatial layers:</strong><br>${err.message}
            </div>`;
          }
        });
      } finally {
        delete loadingPromises[modelName];
      }
    })();

    return loadingPromises[modelName];
  }

  function refreshSizes(modelName) {
    const list = modelName ? (instances[modelName] || []) : Object.values(instances).flat();
    list.forEach(ctrl => {
      if (ctrl && ctrl.map) {
        ctrl.map.invalidateSize();
      }
    });
  }

  function pauseAll() {
    Object.values(instances).flat().forEach(ctrl => {
      if (ctrl && ctrl.stopPlayback) ctrl.stopPlayback();
    });
  }

  window.addEventListener('resize', () => {
    refreshSizes();
  });

  const api = {
    initModelMaps,
    refreshSizes,
    pauseAll
  };

  if (typeof window !== 'undefined') {
    window.MapsManager = api;
  }

  return api;
})();
