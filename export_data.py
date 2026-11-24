"""
Export all processed data, comparison evaluations, and simplified GeoJSONs
for the Rotterdam Integrated Maintenance Optimization Web Dashboard.
"""

import json
import os
import re
import pandas as pd
import geopandas as gpd

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROCESSED_DIR = os.path.join(PROJECT_ROOT, "processed_data")
DATA_OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(DATA_OUT_DIR, exist_ok=True)


def export_parameters_and_stats(ssu_raw, roads_raw, params):
    """Export parameters.json enriched with exact network & data quality metrics."""
    out = dict(params)
    out["network_stats"] = {
        "total_ssus": int(len(ssu_raw)),
        "total_sewer_km": round(float(ssu_raw["len_gravity_m"].sum() / 1000.0), 1),
        "total_street_units": int(len(roads_raw)),
        "total_road_area_m2": round(float(roads_raw["Total_Area_m2"].sum()), 0),
        "soil_counts": {str(int(k)): int(v) for k, v in ssu_raw["soil_code"].value_counts().items()},
    }
    out["data_quality"] = {
        "ssu_missing_year_count": int(ssu_raw["oldest_pipe_year"].isna().sum()),
        "ssu_missing_year_pct": round(float(ssu_raw["oldest_pipe_year"].isna().mean() * 100), 1),
        "road_missing_surface_year_count": int(roads_raw["Surface_Year_Min"].isna().sum()),
        "road_missing_surface_year_pct": round(float(roads_raw["Surface_Year_Min"].isna().mean() * 100), 1),
        "road_unlinked_count": int(roads_raw["Sewer_Subsystem_ID"].isna().sum()),
        "road_unlinked_pct": round(float(roads_raw["Sewer_Subsystem_ID"].isna().mean() * 100), 1),
    }
    path = os.path.join(DATA_OUT_DIR, "parameters.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=2)
    print(f"Exported {path}")


def export_yearly_models():
    """Export greedy_yearly.json and milp_yearly.json."""
    greedy_df = pd.read_csv(os.path.join(PROCESSED_DIR, "greedy_results.csv"))
    cols_g = [
        "year", "sewer_m_renovated", "sewer_cost", "road_cost",
        "stranded_penalty", "sewer_overdue_penalty", "road_overdue_penalty",
        "npv_sewer_cost", "npv_road_cost", "npv_stranded_penalty",
        "npv_overdue_penalty", "npv_total"
    ]
    greedy_records = greedy_df[cols_g].to_dict(orient="records")
    path_g = os.path.join(DATA_OUT_DIR, "greedy_yearly.json")
    with open(path_g, "w") as f:
        json.dump(greedy_records, f)
    print(f"Exported {path_g} ({len(greedy_records)} rows)")

    milp_df = pd.read_csv(os.path.join(PROCESSED_DIR, "milp_yearly_results.csv"))
    cols_m = [
        "Intervention_Year", "Total_Meters", "Sewer_Cap_NPV",
        "Sewer_Overdue_NPV", "Road_Cap_NPV", "Road_Stranded_NPV",
        "Road_Overdue_NPV", "Salvage_Value_NPV"
    ]
    milp_records = milp_df[cols_m].to_dict(orient="records")
    path_m = os.path.join(DATA_OUT_DIR, "milp_yearly.json")
    with open(path_m, "w") as f:
        json.dump(milp_records, f)
    print(f"Exported {path_m} ({len(milp_records)} rows)")


def prepare_assets(ssu_raw, roads_raw, params):
    """Prepare SSU and Road dataframes identically to Notebook 08."""
    ssu = ssu_raw.copy()

    def get_sewer_lifespan(soil_code):
        if soil_code == 1:
            return params["sewerage"]["sewer_lifespan_soil_1"]
        if soil_code == 2:
            return params["sewerage"]["sewer_lifespan_soil_2"]
        if soil_code == 3:
            return params["sewerage"]["sewer_lifespan_soil_3"]
        return 40

    ssu["lifespan"] = ssu["soil_code"].apply(get_sewer_lifespan)
    median_years = ssu.groupby("soil_code")["oldest_pipe_year"].median()
    ssu["oldest_pipe_year"] = ssu.apply(
        lambda row: median_years[row["soil_code"]] if pd.isna(row["oldest_pipe_year"]) else row["oldest_pipe_year"],
        axis=1,
    )
    ssu["sewer_due_year"] = ssu["oldest_pipe_year"] + ssu["lifespan"]
    sewer_cost_per_m = params["sewerage"]["gravity_renewal_cost_per_m"]
    sewer_ops_mult = params["sewerage"]["operational_cost_multiplier"]
    ssu["sewer_cost"] = ssu["len_gravity_m"] * sewer_cost_per_m * sewer_ops_mult
    ssu = ssu.set_index("Ond_gebied")

    roads = roads_raw.copy()
    road_ops_mult = params["roads"]["operational_cost_multiplier"]
    roads["road_cost"] = roads["Total_Cost"] * road_ops_mult
    median_road_due = roads["Next_Intervention_Year"].median()
    roads["Next_Intervention_Year"] = roads["Next_Intervention_Year"].fillna(median_road_due)
    roads["road_due_year"] = roads["Next_Intervention_Year"]
    roads["road_lifespan"] = (roads["road_due_year"] - roads["Surface_Year_Min"]).fillna(40).clip(lower=40)
    roads = roads.set_index("Street_Unit_ID")
    return ssu, roads


def evaluate_schedule_comprehensive(sched_df, ssu, roads, params, lookahead_years=5):
    """Unified apples-to-apples evaluation from Notebook 08, also extracting road spatial years."""
    horizon_start = params["optimization"]["start_year"]
    horizon_end = params["optimization"]["end_year"]
    years = list(range(horizon_start, horizon_end + 1))
    r = params["optimization"]["discount_rate"]
    alpha = params["optimization"]["stranded_asset_coefficient_alpha"]
    beta = params["optimization"]["overdue_penalty_coefficient_beta"]
    gamma = params["optimization"].get("overdue_acceleration_factor_gamma", 1.05)

    def get_df(year):
        return 1 / ((1 + r) ** (year - horizon_start))

    total_costs = {
        "sewer_cap": 0.0,
        "road_cap": 0.0,
        "road_stranded": 0.0,
        "sewer_overdue": 0.0,
        "road_overdue": 0.0,
        "salvage_value": 0.0,
    }
    road_events = 0
    yearly_breakdown = {
        y: {
            "year": y,
            "sewer_cap": 0.0,
            "road_cap": 0.0,
            "road_stranded": 0.0,
            "sewer_overdue": 0.0,
            "road_overdue": 0.0,
            "salvage_value": 0.0,
            "sewer_m": 0.0,
            "road_m2": 0.0,
        }
        for y in years
    }

    ssu_years_map = {}
    road_years_map = {r_id: [] for r_id in roads.index}

    # Pre-group linked roads for speed
    roads_by_ssu = {k: v for k, v in roads.groupby("Sewer_Subsystem_ID")}

    for ssu_id, s_row in ssu.iterrows():
        t = int(sched_df.loc[ssu_id, "Intervention_Year"]) if ssu_id in sched_df.index else 9999
        ssu_years_map[ssu_id] = [t] if (t != 9999 and t <= horizon_end) else []

        # 1. Sewer CapEx & Salvage
        if t != 9999 and t <= horizon_end:
            cost_npv = float(s_row["sewer_cost"] * get_df(t))
            total_costs["sewer_cap"] += cost_npv
            yearly_breakdown[t]["sewer_cap"] += cost_npv
            yearly_breakdown[t]["sewer_m"] += float(s_row["len_gravity_m"])
            end_overdue = t
            residual_years = s_row["lifespan"] - (horizon_end - t)
            if residual_years > 0:
                salvage_npv = float(s_row["sewer_cost"] * (residual_years / s_row["lifespan"]) * get_df(horizon_end))
                total_costs["salvage_value"] -= salvage_npv
                yearly_breakdown[horizon_end]["salvage_value"] -= salvage_npv
        else:
            end_overdue = horizon_end + 1

        # 2. Sewer Overdue
        for y in range(horizon_start, end_overdue):
            if y >= s_row["sewer_due_year"]:
                years_late = y - s_row["sewer_due_year"] + 1
                pen_npv = float(s_row["sewer_cost"] * beta * (years_late ** gamma) * get_df(y))
                total_costs["sewer_overdue"] += pen_npv
                yearly_breakdown[y]["sewer_overdue"] += pen_npv

        # 3. Linked Road Costs & Salvage
        linked_roads = roads_by_ssu.get(ssu_id)
        if linked_roads is not None:
            for r_id, r_row in linked_roads.iterrows():
                current_due = r_row["road_due_year"]
                for y in years:
                    df = get_df(y)
                    if y == t:
                        cost_npv = float(r_row["road_cost"] * df)
                        total_costs["road_cap"] += cost_npv
                        yearly_breakdown[y]["road_cap"] += cost_npv
                        yearly_breakdown[y]["road_m2"] += float(r_row["Total_Area_m2"])
                        road_events += 1
                        road_years_map[r_id].append(y)
                        if y < current_due:
                            residual_ratio = (current_due - y) / r_row["road_lifespan"]
                            str_npv = float(alpha * r_row["road_cost"] * residual_ratio * df)
                            total_costs["road_stranded"] += str_npv
                            yearly_breakdown[y]["road_stranded"] += str_npv
                        current_due = y + r_row["road_lifespan"]
                    elif y < t:
                        if y == current_due and (t - y > lookahead_years):
                            cost_npv = float(r_row["road_cost"] * df)
                            total_costs["road_cap"] += cost_npv
                            yearly_breakdown[y]["road_cap"] += cost_npv
                            yearly_breakdown[y]["road_m2"] += float(r_row["Total_Area_m2"])
                            road_events += 1
                            road_years_map[r_id].append(y)
                            current_due = y + r_row["road_lifespan"]
                        if y >= current_due:
                            years_late = y - current_due + 1
                            pen_npv = float(r_row["road_cost"] * beta * (years_late ** gamma) * df)
                            total_costs["road_overdue"] += pen_npv
                            yearly_breakdown[y]["road_overdue"] += pen_npv
                    elif y > t:
                        if y == current_due:
                            cost_npv = float(r_row["road_cost"] * df)
                            total_costs["road_cap"] += cost_npv
                            yearly_breakdown[y]["road_cap"] += cost_npv
                            yearly_breakdown[y]["road_m2"] += float(r_row["Total_Area_m2"])
                            road_events += 1
                            road_years_map[r_id].append(y)
                            current_due = y + r_row["road_lifespan"]
                        if y >= current_due:
                            years_late = y - current_due + 1
                            pen_npv = float(r_row["road_cost"] * beta * (years_late ** gamma) * df)
                            total_costs["road_overdue"] += pen_npv
                            yearly_breakdown[y]["road_overdue"] += pen_npv
                if current_due > horizon_end:
                    salvage_npv = float(r_row["road_cost"] * ((current_due - horizon_end) / r_row["road_lifespan"]) * get_df(horizon_end))
                    total_costs["salvage_value"] -= salvage_npv
                    yearly_breakdown[horizon_end]["salvage_value"] -= salvage_npv

    # Also track unlinked roads for the spatial maps
    unlinked_roads = roads[roads["Sewer_Subsystem_ID"].isna()]
    for r_id, r_row in unlinked_roads.iterrows():
        current_due = r_row["road_due_year"]
        for y in years:
            if y == current_due:
                road_years_map[r_id].append(y)
                current_due = y + r_row["road_lifespan"]

    yearly_list = [yearly_breakdown[y] for y in years]
    return total_costs, yearly_list, ssu_years_map, road_years_map, road_events


def export_comparison_and_geo(ssu_raw, roads_raw, ssu, roads, params):
    greedy_sched = pd.read_csv(os.path.join(PROCESSED_DIR, "greedy_schedule.csv")).set_index("Ond_gebied")
    milp_sched = pd.read_csv(os.path.join(PROCESSED_DIR, "milp_schedule.csv")).set_index("Ond_gebied")

    print("Running apples-to-apples evaluation for comparison.json...")
    s_totals, s_yearly, _, _, s_road_events = evaluate_schedule_comprehensive(greedy_sched, ssu, roads, params, lookahead_years=0)
    g_totals, g_yearly, g_ssu_map, g_road_map, g_road_events = evaluate_schedule_comprehensive(greedy_sched, ssu, roads, params, lookahead_years=5)
    m_totals, m_yearly, m_ssu_map, m_road_map, m_road_events = evaluate_schedule_comprehensive(milp_sched, ssu, roads, params, lookahead_years=5)

    greedy_df = pd.read_csv(os.path.join(PROCESSED_DIR, "greedy_results.csv"))
    greedy_sewer_km_actual = float(greedy_df["sewer_m_renovated"].sum() / 1000.0)
    milp_df_yearly = pd.read_csv(os.path.join(PROCESSED_DIR, "milp_yearly_results.csv"))
    milp_sewer_km_actual = float(milp_df_yearly["Total_Meters"].sum() / 1000.0)

    s_road_m2 = sum(row["road_m2"] for row in s_yearly)
    g_road_m2 = sum(row["road_m2"] for row in g_yearly)
    m_road_m2 = sum(row["road_m2"] for row in m_yearly)
    postponed_km = float(milp_sched[milp_sched["Intervention_Year"] == 9999]["Len_m"].sum() / 1000.0)
    postponed_ssus = int((milp_sched["Intervention_Year"] == 9999).sum())

    comparison_data = {
        "siloed_totals": s_totals,
        "greedy_totals": g_totals,
        "milp_totals": m_totals,
        "greedy_yearly": g_yearly,
        "milp_yearly": m_yearly,
        "siloed_physical": {
            "road_events": int(s_road_events),
            "total_road_m2": round(s_road_m2, 0),
        },
        "greedy_physical": {
            "road_events": int(g_road_events),
            "total_sewer_km": round(greedy_sewer_km_actual, 1),
            "avg_sewer_km_yr": round(greedy_sewer_km_actual / 50.0, 2),
            "total_road_m2": round(g_road_m2, 0),
            "avg_road_m2_yr": round(g_road_m2 / 50.0, 0),
            "total_sewer_eval_km": round(sum(r["sewer_m"] for r in g_yearly) / 1000.0, 1),
        },
        "milp_physical": {
            "road_events": int(m_road_events),
            "total_sewer_km": round(milp_sewer_km_actual, 1),
            "avg_sewer_km_yr": round(milp_sewer_km_actual / 50.0, 2),
            "capacity_utilization_pct": round((milp_sewer_km_actual / 2000.0) * 100.0, 1),
            "total_road_m2": round(m_road_m2, 0),
            "avg_road_m2_yr": round(m_road_m2 / 50.0, 0),
            "asphalt_saved_m2": round(g_road_m2 - m_road_m2, 0),
            "postponed_km": round(postponed_km, 1),
            "postponed_ssus": postponed_ssus,
        },
    }

    comp_path = os.path.join(DATA_OUT_DIR, "comparison.json")
    with open(comp_path, "w") as f:
        json.dump(comparison_data, f)
    print(f"Exported {comp_path}")

    # Export simplified GeoJSONs
    print("Simplifying SSU and Road geometries for web maps...")
    ssu_geom = ssu_raw[["Ond_gebied", "len_gravity_m", "soil_code", "geometry"]].copy()
    ssu_geom["geometry"] = ssu_geom.geometry.simplify(tolerance=10.0, preserve_topology=True)
    ssu_geom = ssu_geom.to_crs(epsg=4326)

    roads_geom = roads_raw[["Street_Unit_ID", "Total_Area_m2", "geometry"]].copy()
    simplified = roads_geom.geometry.simplify(tolerance=5.0, preserve_topology=False)
    empty_mask = simplified.is_empty | simplified.isna()
    simplified.loc[empty_mask] = roads_raw.loc[empty_mask, "geometry"].simplify(tolerance=2.0, preserve_topology=True)
    roads_geom["geometry"] = simplified
    roads_geom = roads_geom.to_crs(epsg=4326)

    def write_slim_geojson(gdf, id_col, years_map, out_filename, extra_col=None, extra_name=None):
        base = json.loads(gdf.to_json(drop_id=True))
        slim_features = []
        for feat in base["features"]:
            if feat["geometry"] is None:
                continue
            fid = feat["properties"][id_col]
            yrs = years_map.get(fid, [])
            if not yrs:
                continue
            props = {
                "id": str(fid),
                "y": [int(y) for y in yrs],
            }
            if extra_col and extra_name:
                val = feat["properties"].get(extra_col)
                if val is not None:
                    props[extra_name] = round(float(val), 1)
            slim_features.append({
                "type": "Feature",
                "properties": props,
                "geometry": feat["geometry"],
            })
        fc = {"type": "FeatureCollection", "features": slim_features}
        compact = json.dumps(fc, separators=(",", ":"))
        rounded = re.sub(r"(\d+\.\d{5})\d+", r"\1", compact)
        out_path = os.path.join(DATA_OUT_DIR, out_filename)
        with open(out_path, "w") as f:
            f.write(rounded)
        size_mb = os.path.getsize(out_path) / (1024 * 1024)
        print(f"Exported {out_path} ({len(slim_features)} features, {size_mb:.2f} MB)")
        return size_mb

    total_geo_mb = 0.0
    total_geo_mb += write_slim_geojson(ssu_geom, "Ond_gebied", g_ssu_map, "greedy_ssu_geo.json", "len_gravity_m", "len_m")
    total_geo_mb += write_slim_geojson(roads_geom, "Street_Unit_ID", g_road_map, "greedy_road_geo.json", "Total_Area_m2", "area")
    total_geo_mb += write_slim_geojson(ssu_geom, "Ond_gebied", m_ssu_map, "milp_ssu_geo.json", "len_gravity_m", "len_m")
    total_geo_mb += write_slim_geojson(roads_geom, "Street_Unit_ID", m_road_map, "milp_road_geo.json", "Total_Area_m2", "area")
    print(f"Total GeoJSON payload size: {total_geo_mb:.2f} MB")


def main():
    with open(os.path.join(PROCESSED_DIR, "financial_parameters.json"), "r") as f:
        params = json.load(f)

    ssu_raw = gpd.read_file(os.path.join(PROCESSED_DIR, "sewer_subsystems.gpkg"))
    roads_raw = gpd.read_file(os.path.join(PROCESSED_DIR, "integrated_street_units.gpkg"))

    export_parameters_and_stats(ssu_raw, roads_raw, params)
    export_yearly_models()
    ssu, roads = prepare_assets(ssu_raw, roads_raw, params)
    export_comparison_and_geo(ssu_raw, roads_raw, ssu, roads, params)
    print("All web data exports completed successfully!")


if __name__ == "__main__":
    main()
