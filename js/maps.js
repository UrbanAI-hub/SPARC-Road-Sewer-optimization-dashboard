/**
 * Leaflet.js interactive timeline maps for Greedy Baseline & MILP Optimizer tabs.
 * Uses Canvas rendering + pre-bucketed year layers for instant 60fps year slider playback.
 */

const MapsManager = (() => {
  const ROTTERDAM_CENTER = [51.9244, 4.4777];
  const CARTO_TILES = 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_3lqq_1_c453c5a181f94ac9b031a8df';
  const CARTO_ATTR = '&copy; OpenStreetMap contributors &copy; CARTO';

  const loadedModels = {
    greedy: false,
    milp: false
  };

  const instances = {};

  function buildMapController(mapId, sliderId, playBtnId, yearBadgeId, countsId, ssuGeo, roadGeo, mode) {
    const container = document.getElementById(mapId);
    container.innerHTML = '';

    const renderer = L.canvas({ padding: 0.5 });
    const map = L.map(mapId, {
      center: ROTTERDAM_CENTER,
      zoom: 11,
      preferCanvas: true,
      renderer: renderer
    });

    L.tileLayer(CARTO_TILES, {
      attribution: CARTO_ATTR,
      maxZoom: 19
    }).addTo(map);

    const ssuGroup = L.featureGroup().addTo(map);
    const roadGroup = L.featureGroup().addTo(map);

    // Pre-build Leaflet layers bucketed by year for O(1) slider updates
    const ssuByYear = {};
    const roadByYear = {};
    const ssuFirstYear = new Map();
    const roadFirstYear = new Map();

    for (let y = 2025; y <= 2074; y++) {
      ssuByYear[y] = [];
      roadByYear[y] = [];
    }

    const isMilp = mapId.includes('milp');

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

    L.geoJSON(ssuGeo, {
      style: () => ssuStyle,
      renderer: renderer,
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        const yrs = p.y || [];
        layer.bindPopup(
          `<div style="color:#1a202c;font-size:12px;">
            <strong>Sewer Subsystem (SSU):</strong> ${p.id}<br>
            <strong>Gravity Length:</strong> ${p.len_m ? Number(p.len_m).toLocaleString() + ' m' : 'N/A'}<br>
            <strong>Scheduled Year:</strong> ${yrs.join(', ')}
          </div>`
        );
        if (yrs.length > 0) {
          const firstY = Math.min(...yrs);
          ssuFirstYear.set(layer, firstY);
          yrs.forEach(yr => {
            if (ssuByYear[yr]) ssuByYear[yr].push(layer);
          });
        }
      }
    });

    L.geoJSON(roadGeo, {
      style: () => roadStyle,
      renderer: renderer,
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        const yrs = p.y || [];
        layer.bindPopup(
          `<div style="color:#1a202c;font-size:12px;">
            <strong>Street Unit:</strong> ${p.id}<br>
            <strong>Surface Area:</strong> ${p.area ? Number(p.area).toLocaleString() + ' m²' : 'N/A'}<br>
            <strong>Renovation Year(s):</strong> ${yrs.join(', ')}
          </div>`
        );
        if (yrs.length > 0) {
          const firstY = Math.min(...yrs);
          roadFirstYear.set(layer, firstY);
          yrs.forEach(yr => {
            if (roadByYear[yr]) roadByYear[yr].push(layer);
          });
        }
      }
    });

    const slider = document.getElementById(sliderId);
    const playBtn = document.getElementById(playBtnId);
    const yearBadge = document.getElementById(yearBadgeId);
    const countsEl = document.getElementById(countsId);

    let currentRenderYear = null;
    let playTimer = null;

    function renderYear(targetYear) {
      targetYear = parseInt(targetYear, 10);
      yearBadge.textContent = targetYear;
      slider.value = targetYear;

      if (mode === 'isolated') {
        ssuGroup.clearLayers();
        roadGroup.clearLayers();
        const ssus = ssuByYear[targetYear] || [];
        const roads = roadByYear[targetYear] || [];
        ssus.forEach(l => ssuGroup.addLayer(l));
        roads.forEach(l => roadGroup.addLayer(l));
        countsEl.textContent = `${ssus.length} SSUs · ${roads.length} Roads`;
      } else {
        // Cumulative mode: incremental or full rebuild if jumping backwards far
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
        countsEl.textContent = `${ssuGroup.getLayers().length} SSUs · ${roadGroup.getLayers().length} Roads`;
      }
      currentRenderYear = targetYear;
    }

    slider.addEventListener('input', (e) => {
      stopPlayback();
      renderYear(e.target.value);
    });

    function stopPlayback() {
      if (playTimer) {
        clearInterval(playTimer);
        playTimer = null;
        playBtn.textContent = '▶ Play';
      }
    }

    playBtn.addEventListener('click', () => {
      if (playTimer) {
        stopPlayback();
      } else {
        if (parseInt(slider.value, 10) >= 2074) {
          renderYear(2025);
        }
        playBtn.textContent = '⏸ Pause';
        playTimer = setInterval(() => {
          const next = parseInt(slider.value, 10) + 1;
          if (next > 2074) {
            stopPlayback();
          } else {
            renderYear(next);
          }
        }, 380);
      }
    });

    // Initial render at 2030
    renderYear(2030);

    return { map, stopPlayback };
  }

  async function initModelMaps(modelName) {
    if (loadedModels[modelName]) {
      refreshSizes(modelName);
      return;
    }
    loadedModels[modelName] = true;

    try {
      const [ssuRes, roadRes] = await Promise.all([
        fetch(`data/${modelName}_ssu_geo.json`),
        fetch(`data/${modelName}_road_geo.json`)
      ]);
      if (!ssuRes.ok || !roadRes.ok) {
        throw new Error(`Failed to fetch GeoJSON layers for ${modelName}`);
      }
      const [ssuGeo, roadGeo] = await Promise.all([ssuRes.json(), roadRes.json()]);

      const cumCtrl = buildMapController(
        `map-${modelName}-cum`,
        `slider-${modelName}-cum`,
        `play-${modelName}-cum`,
        `year-${modelName}-cum`,
        `counts-${modelName}-cum`,
        ssuGeo,
        roadGeo,
        'cumulative'
      );

      const isoCtrl = buildMapController(
        `map-${modelName}-iso`,
        `slider-${modelName}-iso`,
        `play-${modelName}-iso`,
        `year-${modelName}-iso`,
        `counts-${modelName}-iso`,
        ssuGeo,
        roadGeo,
        'isolated'
      );

      instances[modelName] = [cumCtrl, isoCtrl];
      setTimeout(() => refreshSizes(modelName), 120);
    } catch (err) {
      console.error(err);
      [`map-${modelName}-cum`, `map-${modelName}-iso`].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<div class="map-loading has-text-danger">Error loading spatial layers: ${err.message}</div>`;
      });
    }
  }

  function refreshSizes(modelName) {
    (instances[modelName] || []).forEach(ctrl => {
      ctrl.map.invalidateSize();
    });
  }

  function pauseAll() {
    Object.values(instances).flat().forEach(ctrl => ctrl.stopPlayback());
  }

  return {
    initModelMaps,
    refreshSizes,
    pauseAll
  };
})();
