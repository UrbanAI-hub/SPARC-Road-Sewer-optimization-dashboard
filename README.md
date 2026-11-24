# Rotterdam Integrated Road & Sewer Maintenance Optimization Dashboard

An interactive decision-support tool and benchmarking dashboard developed for the **Municipality of Rotterdam (Gemeente Rotterdam)**.

**Live Dashboard:** [https://urbanai-hub.github.io/SPARC-Road-Sewer-optimization-dashboard/](https://urbanai-hub.github.io/SPARC-Road-Sewer-optimization-dashboard/)

---

## Overview

Urban infrastructure systems suffer from an operational asymmetry under the **Dig-Once** principle:
* Excavating to replace an underground gravity sewer pipe **destroys** the road structure above.
* Resurfacing asphalt or rebuilding foundations does **not** disturb the sewer pipe below.

This pilot project benchmarks two joint maintenance planning strategies across Rotterdam's 2,676.6 km sewer network and 25.2 million m² street network over a 50-year planning horizon (2025–2074):
1. **Greedy Baseline Heuristic:** Urgency-ranked heuristic with a 5-year road lookahead window.
2. **Mixed-Integer Linear Programming (MILP) Optimizer:** Global 50-year mathematical optimization with exact Dig-Once synchronization and terminal salvage value corrections.

---

## Key Findings

* **€6.81 Billion Net Lifecycle Savings:** MILP optimization reduces total 50-year lifecycle NPV from €121.71B to €114.90B (-5.6%).
* **€57.2M Saved in Premature Asphalt Demolition:** Dig-Once synchronization eliminates 312,165 m² of redundant road paving and reduces Stranded Asset waste by 15.0%.
* **€12.36B Reduction in Road Deterioration Risk:** Coordinated timing cuts prolonged waiting periods on decaying street surfaces by 39.8%.

---

## Local Development

To run the dashboard locally:

```bash
# Clone the repository
git clone https://github.com/UrbanAI-hub/SPARC-Road-Sewer-optimization-dashboard.git
cd SPARC-Road-Sewer-optimization-dashboard

# Start a local static file server
python3 -m http.server 8080
```

Open `http://localhost:8080` in your web browser.

---

## Technology Stack

* **Frontend:** Bulma CSS (dark theme)
* **Interactive Charts:** Plotly.js
* **Geospatial Mapping:** Leaflet.js with Canvas rendering & TimeDimension slider
* **Mathematics:** KaTeX
* **Basemap:** CartoDB Voyager
