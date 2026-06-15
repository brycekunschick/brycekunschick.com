#!/usr/bin/env python3
"""
river_forecast.py - 7-day fishability forecast for the Ohio River @ Toronto, OH

Default action now builds a slick HTML DASHBOARD and opens it in your browser
(tabs for Forecast / Current Conditions / Watershed Rain / How It Works, with
interactive discharge + rainfall charts). Use --console for the old text output.

WHAT IT DOES (unchanged logic, prettier output)
  1. NOW (gauge truth)   USGS discharge + 24h trend at 3 gauges.
  2. TRAJECTORY (model)  GloFAS 7-day discharge forecast, normalized to its own
                         11-yr monthly climatology (so "high" = high for the season).
  3. RAIN (driver)       Upstream-basin precipitation, shown so you can see the
                         pulse coming and the ~2-5 day travel lag to Toronto.

Watch DISCHARGE, not height (the lock-and-dams regulate height, not flow).
Clarity is inferred from flow level + rising/falling limb, then calibrated to
your eyes with --log.

USAGE
  py river_forecast.py                 # build + open the HTML dashboard (default)
  py river_forecast.py --console       # old text report in the terminal
  py river_forecast.py --refresh-clim  # rebuild the GloFAS climatology cache
  py river_forecast.py --log 4         # after a trip, log observed clarity 1-5
  py river_forecast.py --history       # show your logged trips + your cutoffs
  py river_forecast.py --export        # dump the raw data CSVs

No third-party packages. (Charts use Chart.js from a CDN in the browser.)
"""

import argparse
import csv
import datetime as dt
import json
import os
import pathlib
import statistics
import urllib.request
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))

# --- your spot ---------------------------------------------------------------
TORONTO = (40.464, -80.601)              # Ohio River @ Toronto, OH

USGS_SITES = {
    "03086000": ("Ohio R @ Sewickley (mainstem, ~1-2 day lead)", "lead"),
    "03107500": ("Beaver R @ Beaver Falls (tributary)",          "trib"),
    "03109500": ("Little Beaver Ck @ E.Liverpool (LOCAL mud)",   "local"),
}

BASIN_POINTS = [
    (40.445, -80.006, "Pittsburgh/confluence"),
    (41.858, -79.162, "Allegheny headwaters"),
    (39.641, -79.957, "Mon headwaters"),
    (40.987, -80.340, "Beaver basin"),
]

CLIM_FILE = os.path.join(HERE, "glofas_climatology.json")
LOG_FILE = os.path.join(HERE, "river_log.csv")
HTML_FILE = os.path.join(HERE, "river.html")
TIMEOUT = 90

RAIN_NOTABLE_MM = 15.0
PULSE_LAG_DAYS = 3


# ---------------------------------------------------------------------------
def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "river_forecast/3.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.load(r)


def pctl(sorted_vals, p):
    if not sorted_vals:
        return None
    i = int(round(p * (len(sorted_vals) - 1)))
    return sorted_vals[i]


# === 1. NOW: USGS gauges =====================================================
def usgs_now():
    sites = ",".join(USGS_SITES)
    url = ("https://waterservices.usgs.gov/nwis/iv/?format=json"
           "&sites=%s&parameterCd=00060&period=P3D&siteStatus=all" % sites)
    out = {}
    try:
        data = get_json(url)
    except Exception:
        return out
    for ts in data.get("value", {}).get("timeSeries", []):
        site = ts["sourceInfo"]["siteCode"][0]["value"]
        pts = []
        for v in ts["values"][0]["value"]:
            try:
                val = float(v["value"])
            except (TypeError, ValueError):
                continue
            if val <= -999:
                continue
            pts.append((dt.datetime.fromisoformat(v["dateTime"]), val))
        if not pts:
            continue
        pts.sort()
        latest_t, latest = pts[-1]
        target = latest_t - dt.timedelta(hours=24)
        day_ago = min(pts, key=lambda p: abs(p[0] - target))[1]
        pct = (latest - day_ago) / day_ago * 100 if day_ago else 0.0
        out[site] = (latest, pct)
    return out


def usgs_percentile(site, cfs):
    def num(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return None
    try:
        url = ("https://waterservices.usgs.gov/nwis/stat/?format=rdb"
               "&sites=%s&statReportType=daily&statTypeCd=p10,p50,p90"
               "&parameterCd=00060" % site)
        req = urllib.request.Request(url, headers={"User-Agent": "river_forecast/3.0"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            lines = r.read().decode().splitlines()
        rows = [ln for ln in lines if ln and not ln.startswith("#")]
        idx = {n: i for i, n in enumerate(rows[0].split("\t"))}
        today = dt.date.today()
        for ln in rows[2:]:
            c = ln.split("\t")
            if (c[idx["month_nu"]] == str(today.month)
                    and c[idx["day_nu"]] == str(today.day)):
                def cell(name):
                    i = idx.get(name)
                    return num(c[i]) if (i is not None and i < len(c)) else None
                p10, p50, p90 = cell("p10_va"), cell("p50_va"), cell("p90_va")
                if p50 is None:
                    return ""
                if p10 is not None and cfs <= p10:
                    return "very low"
                if cfs <= p50:
                    return "below normal"
                if p90 is not None and cfs > p90:
                    return "HIGH"
                return "above normal"
    except Exception:
        pass
    return ""


def trend_word(pct):
    if pct > 25:  return "RISING HARD"
    if pct > 10:  return "rising"
    if pct < -25: return "dropping fast"
    if pct < -10: return "falling"
    return "steady"


# === 2. TRAJECTORY: GloFAS discharge forecast + climatology ==================
def build_climatology():
    end = dt.date.today().replace(day=1) - dt.timedelta(days=1)
    start = dt.date(end.year - 11, 1, 1)
    url = ("https://flood-api.open-meteo.com/v1/flood?latitude=%s&longitude=%s"
           "&daily=river_discharge&start_date=%s&end_date=%s"
           % (TORONTO[0], TORONTO[1], start.isoformat(), end.isoformat()))
    data = get_json(url)
    t = data["daily"]["time"]; q = data["daily"]["river_discharge"]
    by_month = {m: [] for m in range(1, 13)}
    for i in range(len(t)):
        if q[i] is None:
            continue
        by_month[int(t[i][5:7])].append(float(q[i]))
    months = {}
    for m, arr in by_month.items():
        s = sorted(arr)
        months[str(m)] = {"p10": pctl(s, .10), "p50": pctl(s, .50),
                          "p75": pctl(s, .75), "p90": pctl(s, .90), "n": len(s)}
    clim = {"built": dt.date.today().isoformat(), "point": TORONTO, "months": months}
    with open(CLIM_FILE, "w") as f:
        json.dump(clim, f, indent=2)
    return clim


def load_climatology(force=False):
    if not force and os.path.exists(CLIM_FILE):
        try:
            clim = json.load(open(CLIM_FILE))
            built = dt.date.fromisoformat(clim["built"])
            if (dt.date.today() - built).days < 200 and clim.get("months"):
                return clim
        except Exception:
            pass
    print("  (building GloFAS climatology cache, ~11yr pull, one moment...)")
    return build_climatology()


def band_for(q, monthclim):
    p10, p50 = monthclim["p10"], monthclim["p50"]
    p75, p90 = monthclim["p75"], monthclim["p90"]
    if q <= p10:  return "very low",     0
    if q <= p50:  return "below normal", 0
    if q <= p75:  return "above normal", 1
    if q <= p90:  return "high",         2
    return "VERY HIGH", 3


def glofas_series(past_days=7, forecast_days=14):
    """Full daily ensemble: list of {date,control,median,p25,p75,max}."""
    url = ("https://flood-api.open-meteo.com/v1/flood?latitude=%s&longitude=%s"
           "&daily=river_discharge,river_discharge_median,river_discharge_p25,"
           "river_discharge_p75,river_discharge_max&forecast_days=%d&past_days=%d"
           % (TORONTO[0], TORONTO[1], forecast_days, past_days))
    d = get_json(url)["daily"]
    rows = []
    for i in range(len(d["time"])):
        med = d["river_discharge_median"][i]
        if med is None:
            med = d["river_discharge"][i]
        rows.append({"date": d["time"][i], "control": d["river_discharge"][i],
                     "median": med, "p25": d["river_discharge_p25"][i],
                     "p75": d["river_discharge_p75"][i],
                     "max": d["river_discharge_max"][i]})
    return rows


def glofas_forecast():
    """7-day-ish view used by the console report."""
    rows = glofas_series(past_days=2, forecast_days=11)
    return [{"date": r["date"], "med": r["median"], "p25": r["p25"],
             "p75": r["p75"], "max": r["max"]} for r in rows]


# === 3. RAIN: upstream basin precipitation ===================================
def rain_detail(past_days=5, forecast_days=14):
    """Per-point + basin-average precip. Returns (per_point_dict, basin_avg_dict)."""
    lats = ",".join(str(p[0]) for p in BASIN_POINTS)
    lons = ",".join(str(p[1]) for p in BASIN_POINTS)
    url = ("https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s"
           "&daily=precipitation_sum&forecast_days=%d&past_days=%d"
           "&timezone=America/New_York" % (lats, lons, forecast_days, past_days))
    arr = get_json(url)
    if isinstance(arr, dict):
        arr = [arr]
    per_point = {}      # name -> {date: mm}
    basin_avg = {}
    times = arr[0]["daily"]["time"]
    for k, loc in enumerate(arr):
        name = BASIN_POINTS[k][2]
        vals = loc["daily"]["precipitation_sum"]
        per_point[name] = {times[i]: (vals[i] or 0.0) for i in range(len(times))}
    for i, dte in enumerate(times):
        day_vals = [per_point[BASIN_POINTS[k][2]][dte] for k in range(len(arr))]
        basin_avg[dte] = sum(day_vals) / len(day_vals)
    return per_point, basin_avg, times


def basin_precip():
    _, basin_avg, _ = rain_detail()
    return basin_avg


# === classify (shared) =======================================================
def classify(med, mc, pct_change, p25, p75, mx, horizon):
    level_word, level = band_for(med, mc)
    score = level
    if pct_change is None:   trendw = "n/a"
    elif pct_change > 25:    trendw = "RISING HARD"; score += 2
    elif pct_change > 10:    trendw = "rising";      score += 1
    elif pct_change < -15:   trendw = "clearing";    score -= 1
    elif pct_change < -5:    trendw = "falling"
    else:                    trendw = "steady"

    upside, up_level = "-", 0
    if p75 is not None:
        pw, pl = band_for(p75, mc)
        if pl >= 2:
            upside, up_level = "may hit " + pw, pl
    if up_level < 2 and mx is not None:
        _, ml = band_for(mx, mc)
        if ml >= 3:
            upside = "spike possible"
    spread = (p75 - p25) / med if (med and p75 is not None and p25 is not None) else 0
    blowout = (mx / med) if (med and mx) else 1
    rain_risk = up_level >= 2 or spread >= 0.5 or blowout >= 2.2
    if rain_risk:
        score += 1

    score = max(0, score)
    verdict = "FISH" if score <= 0 else ("MARGINAL" if score <= 2 else "SKIP")
    if horizon <= 2 and not rain_risk:   conf = "high"
    elif horizon <= 4 and not rain_risk: conf = "med"
    else:                                conf = "low"
    return verdict, conf, level_word, trendw, upside


# === build everything into one payload =======================================
def build_payload():
    today = dt.date.today()
    clim = load_climatology()
    series = glofas_series(past_days=7, forecast_days=14)
    per_point, basin_avg, rain_times = rain_detail(past_days=5, forecast_days=14)
    now = usgs_now()

    by_date = {r["date"]: r for r in series}

    # antecedent wetness (last 5 days basin rain, strictly before today)
    ant = sum(v for d, v in basin_avg.items()
              if (today - dt.timedelta(days=5)).isoformat() <= d < today.isoformat())
    ant_word = ("WET - rain primes runoff" if ant > 25
                else ("normal" if ant > 8 else "dry"))

    # NOW gauges
    now_cards = []
    for site, (label, role) in USGS_SITES.items():
        if site in now:
            cfs, pct = now[site]
            pl = usgs_percentile(site, cfs)
            now_cards.append({"label": label, "role": role, "cfs": round(cfs),
                              "pct": round(pct, 1), "trend": trend_word(pct),
                              "pctl": pl, "site": site, "page": "gauge_%s.html" % site,
                              "watch": role == "local" and (pct > 25 or pl == "HIGH")})

    # 7-day verdicts
    fcast = []
    for h in range(0, 7):
        d = (today + dt.timedelta(days=h)).isoformat()
        r = by_date.get(d)
        if not r or r["median"] is None:
            continue
        mc = clim["months"][str(int(d[5:7]))]
        prev = by_date.get((today + dt.timedelta(days=h - 1)).isoformat())
        pct = None
        if prev and prev["median"]:
            pct = (r["median"] - prev["median"]) / prev["median"] * 100
        verdict, conf, lvl, trendw, upside = classify(
            r["median"], mc, pct, r["p25"], r["p75"], r["max"], h)
        rmm = basin_avg.get(d, 0.0)
        fcast.append({"date": d, "dayname": (today + dt.timedelta(days=h)).strftime("%a"),
                      "q": round(r["median"]), "level": lvl, "trend": trendw,
                      "rain": round(rmm, 1), "notable": rmm >= RAIN_NOTABLE_MM,
                      "upside": upside, "verdict": verdict, "conf": conf})

    # outlook days 8-11
    outlook = []
    for h in range(7, 11):
        d = (today + dt.timedelta(days=h)).isoformat()
        r = by_date.get(d)
        if r and r["median"] is not None:
            lw, _ = band_for(r["median"], clim["months"][str(int(d[5:7]))])
            outlook.append({"date": d, "dayname": (today + dt.timedelta(days=h)).strftime("%a"),
                            "q": round(r["median"]), "level": lw})

    # headline
    best = [f for f in fcast if f["verdict"] == "FISH"]
    avoid = [f for f in fcast if f["verdict"] == "SKIP"]
    rain_watch = []
    for d in sorted(basin_avg):
        if d >= today.isoformat() and basin_avg[d] >= RAIN_NOTABLE_MM:
            arrive = dt.date.fromisoformat(d) + dt.timedelta(days=PULSE_LAG_DAYS)
            rain_watch.append({"mm": round(basin_avg[d]), "date": d,
                               "arrive": arrive.strftime("%a %m-%d"),
                               "wet": ant > 25})

    # chart: discharge series with per-date climatology refs
    disch = []
    for r in series:
        mc = clim["months"][str(int(r["date"][5:7]))]
        disch.append({"date": r["date"], "median": r["median"], "p25": r["p25"],
                      "p75": r["p75"], "max": r["max"],
                      "clim_p50": round(mc["p50"]), "clim_p90": round(mc["p90"]),
                      "past": r["date"] < today.isoformat()})
    today_index = next((i for i, r in enumerate(disch)
                        if r["date"] == today.isoformat()), None)

    # chart: rainfall stacked by basin point
    rain_rows = []
    for dte in rain_times:
        rain_rows.append({"date": dte,
                          "points": {BASIN_POINTS[k][2]: round(per_point[BASIN_POINTS[k][2]][dte], 1)
                                     for k in range(len(BASIN_POINTS))},
                          "basin_avg": round(basin_avg[dte], 1),
                          "past": dte < today.isoformat()})
    rain_today_index = next((i for i, dte in enumerate(rain_times)
                             if dte == today.isoformat()), None)

    return {
        "generated": dt.datetime.now(dt.timezone.utc).astimezone(dt.timezone(dt.timedelta(hours=-4))).strftime("%A %b %d, %Y  %I:%M %p ET"),
        "now": now_cards,
        "antecedent": {"mm": round(ant), "word": ant_word},
        "forecast": fcast, "outlook": outlook,
        "headline": {"best": best, "avoid": avoid, "rain_watch": rain_watch},
        "discharge": disch, "today_index": today_index,
        "rain": rain_rows, "rain_today_index": rain_today_index,
        "basin_points": [{"name": n, "lat": la, "lon": lo} for la, lo, n in BASIN_POINTS],
        "notable_mm": RAIN_NOTABLE_MM,
    }


# === HTML rendering ==========================================================
HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ohio River @ Toronto - Fishing Forecast</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
:root{
  --bg:#0a0f1c; --panel:rgba(255,255,255,.045); --brd:rgba(255,255,255,.09);
  --txt:#e8eef7; --muted:#90a3bd; --accent:#38bdf8; --accent2:#22d3ee;
  --fish:#22c55e; --marg:#f59e0b; --skip:#ef4444;
}
*{box-sizing:border-box}
body{margin:0;color:var(--txt);font-family:Inter,system-ui,Segoe UI,Roboto,sans-serif;
  background:radial-gradient(1200px 700px at 75% -15%, #16294b 0%, #0a0f1c 55%) fixed;
  -webkit-font-smoothing:antialiased;min-height:100vh}
.wrap{max-width:1120px;margin:0 auto;padding:30px 20px 70px}
.title{font-size:clamp(26px,4vw,36px);font-weight:800;letter-spacing:-.02em;margin:0;
  background:linear-gradient(90deg,#7dd3fc,#22d3ee 55%,#34d399);
  -webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:var(--muted);margin:6px 0 0;font-size:14px}
.hero{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;
  margin:22px 0 8px;padding:18px 20px;border:1px solid var(--brd);border-radius:18px;
  background:linear-gradient(180deg,rgba(56,189,248,.10),rgba(255,255,255,.02))}
.hero .big{font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.hero .val{font-size:20px;font-weight:700;margin-top:3px}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0 18px}
.tab{cursor:pointer;border:1px solid var(--brd);background:var(--panel);color:var(--muted);
  padding:9px 16px;border-radius:999px;font-size:14px;font-weight:600;transition:.15s}
.tab:hover{color:var(--txt)}
.tab.active{color:#06121f;background:linear-gradient(90deg,#7dd3fc,#34d399);border-color:transparent}
.panel{display:none;animation:fade .25s ease}
.panel.active{display:block}
@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.card{border:1px solid var(--brd);background:var(--panel);border-radius:16px;padding:18px 18px;
  backdrop-filter:blur(6px)}
.grid{display:grid;gap:14px}
.g3{grid-template-columns:repeat(3,1fr)}
.g7{display:flex;gap:12px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:8px;scrollbar-width:none;scroll-behavior:smooth}
.g7::-webkit-scrollbar{display:none}
.g7 .card{flex:0 0 calc(40% - 6px);min-width:0}
@media(min-width:860px){.g7 .card{flex:0 0 calc(14.28% - 11px)}}
@media(max-width:860px){.g3{grid-template-columns:1fr}}
.fcard{text-align:center;padding:14px 10px}
.fcard .day{font-weight:700;font-size:15px}
.fcard .date{color:var(--muted);font-size:12px;margin-bottom:8px}
.chartbox canvas{-webkit-user-select:none;user-select:none;touch-action:pan-y}
.badge{display:inline-block;font-weight:800;font-size:13px;letter-spacing:.03em;
  padding:6px 12px;border-radius:999px;margin:4px 0}
.v-FISH{background:rgba(34,197,94,.16);color:#5ee398;border:1px solid rgba(34,197,94,.4)}
.v-MARGINAL{background:rgba(245,158,11,.16);color:#fbbf52;border:1px solid rgba(245,158,11,.4)}
.v-SKIP{background:rgba(239,68,68,.16);color:#fb7185;border:1px solid rgba(239,68,68,.45)}
.conf{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.fmeta{font-size:12px;color:var(--muted);margin-top:8px;line-height:1.5}
.fmeta b{color:var(--txt);font-weight:600}
.rainpill{display:inline-block;font-size:11px;padding:2px 7px;border-radius:6px;
  background:rgba(56,189,248,.14);color:#7dd3fc;margin-top:4px}
.rainpill.hot{background:rgba(245,158,11,.18);color:#fbbf52}
.gauge{padding:18px}
.gauge .lbl{font-size:13px;color:var(--muted)}
.gauge .lbl a.glink{color:inherit;text-decoration:none;border-bottom:1px dashed rgba(255,255,255,.22)}
.gauge .lbl a.glink:hover{color:var(--accent);border-color:var(--accent)}
.gauge .num{font-size:30px;font-weight:800;margin:6px 0 2px}
.gauge .unit{font-size:14px;color:var(--muted);font-weight:500}
.tag{display:inline-block;font-size:12px;padding:3px 9px;border-radius:999px;margin-right:6px;
  border:1px solid var(--brd);color:var(--muted)}
.tag.up{color:#fb7185;border-color:rgba(239,68,68,.4)}
.tag.dn{color:#5ee398;border-color:rgba(34,197,94,.4)}
.watch{color:#fbbf52;font-weight:600;font-size:12px;margin-top:8px}
h2.sec{font-size:16px;font-weight:700;margin:26px 0 12px;color:#cfe0f2}
.chartbox{position:relative;height:340px}
.note{color:var(--muted);font-size:13px;line-height:1.65}
.legend{display:flex;gap:18px;flex-wrap:wrap;color:var(--muted);font-size:12px;margin-top:10px}
.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
table.t{width:100%;border-collapse:collapse;font-size:13px}
table.t th,table.t td{padding:9px 10px;text-align:left;border-bottom:1px solid var(--brd)}
table.t th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.bp{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--brd);font-size:14px}
.bp:last-child{border:0}
.bp .co{color:var(--muted);font-size:12px}
.foot{color:var(--muted);font-size:12px;text-align:center;margin-top:34px}
a{color:var(--accent)}
.ant{display:inline-flex;align-items:center;gap:10px;font-size:14px}
.dot{width:10px;height:10px;border-radius:50%}
.outstrip{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
.outchip{border:1px solid var(--brd);background:var(--panel);border-radius:12px;padding:8px 12px;font-size:13px}
.outchip b{display:block;font-size:12px;color:var(--muted);font-weight:600}
</style></head>
<body><div class="wrap">
  <h1 class="title">Ohio River &middot; Toronto, OH</h1>
  <p class="sub">7-day forecast &nbsp;|&nbsp; <span id="gen"></span></p>

  <div class="hero" id="hero"></div>

  <div class="tabs">
    <div class="tab active" data-t="forecast">7-Day Forecast</div>
    <div class="tab" data-t="now">Current Conditions</div>
    <div class="tab" data-t="rain">Watershed Rain</div>
    <div class="tab" data-t="how">How It Works</div>
  </div>

  <div class="panel active" id="p-forecast">
    <div class="g7" id="fcards"></div>
    <h2 class="sec">Discharge trajectory (m&sup3;/s) &mdash; model median, ensemble range &amp; seasonal normal</h2>
    <div class="card"><div class="chartbox"><canvas id="dischargeChart"></canvas></div>
      <div class="legend">
        <span><i style="background:#38bdf8"></i>Ensemble median</span>
        <span><i style="background:rgba(56,189,248,.25)"></i>Likely range (p25-p75)</span>
        <span><i style="background:#fb7185"></i>Worst-case (max)</span>
        <span><i style="background:#94a3b8"></i>Normal (p50)</span>
        <span><i style="background:#f59e0b"></i>High threshold (p90)</span>
      </div></div>
    <h2 class="sec">Outlook (days 8-11)</h2>
    <div class="outstrip" id="outlook"></div>
  </div>

  <div class="panel" id="p-now">
    <div class="grid g3" id="gauges"></div>
    <h2 class="sec">Upstream ground saturation</h2>
    <div class="card" id="antcard"></div>
    <p class="note" style="margin-top:14px">These gauges are the ground truth right now &mdash; the river&rsquo;s
      live flow already contains every drop of past rain. Watch the LOCAL creek: it can muddy your bank
      even when the mainstem reads clean.<br><br><b style="color:var(--txt)">Tip:</b>
      click a gauge name for its full 3-month history chart + a USGS link.</p>
  </div>

  <div class="panel" id="p-rain">
    <h2 class="sec" style="margin-top:6px">Upstream basin rainfall (mm/day, stacked by sub-basin)</h2>
    <div class="card"><div class="chartbox"><canvas id="rainChart"></canvas></div></div>
    <div class="grid g3" style="margin-top:16px">
      <div class="card"><h2 class="sec" style="margin:0 0 10px">Rain watch</h2><div id="rainwatch" class="note"></div></div>
      <div class="card"><h2 class="sec" style="margin:0 0 10px">Sub-basins sampled</h2><div id="basinlist"></div></div>
      <div class="card"><h2 class="sec" style="margin:0 0 10px">Travel lag</h2>
        <p class="note" style="margin:0">Headwater rain takes <b style="color:var(--txt)">~2-5 days</b> to reach
        Toronto (leading edge ~1-2 days when flows are already high; full peak up to ~a week for big,
        widespread events). The discharge chart already routes this for you.</p></div>
    </div>
  </div>

  <div class="panel" id="p-how">
    <div class="card"><p class="note">
      <b style="color:var(--txt)">Watch discharge, not height.</b> The New Cumberland &amp; Pike Island
      lock-and-dams hold the river&rsquo;s <i>height</i> nearly constant, so stage is useless. They don&rsquo;t
      mask <i>discharge</i> (flow), which is what tracks high, fast, muddy water.<br><br>
      <b style="color:var(--txt)">Clarity is inferred, then calibrated.</b> No real-time turbidity sensor exists
      near Toronto, so the verdict blends flow LEVEL (vs the season&rsquo;s normal) with DIRECTION (mud rides the
      rising limb; water clears on the way down). Log trips with <code>--log 1..5</code> to tune it to your eyes.<br><br>
      <b style="color:var(--txt)">Rain is shown, not double-counted.</b> The GloFAS discharge forecast already
      bakes in forecast rainfall + soil moisture + routing. The rain tab is there so you can <i>see</i> the pulse
      coming and understand the lag &mdash; it isn&rsquo;t added into the score again.
    </p></div>
    <h2 class="sec">How each day is scored</h2>
    <div class="card"><table class="t">
      <tr><th>Ingredient</th><th>Rule</th><th>Points</th></tr>
      <tr><td>Level (flow vs monthly normal)</td><td>&le; median / above normal / high / very high</td><td>0 / +1 / +2 / +3</td></tr>
      <tr><td>Trend (hysteresis)</td><td>rising hard / rising / clearing</td><td>+2 / +1 / &minus;1</td></tr>
      <tr><td>Blow-out risk (ensemble)</td><td>p75 reaches &ldquo;high&rdquo;, wide spread, or max &ge; 2.2&times; median</td><td>+1</td></tr>
      <tr><td colspan="2"><b>Verdict</b></td><td>&le;0 FISH &middot; 1-2 MARGINAL &middot; &ge;3 SKIP</td></tr>
    </table></div>
  </div>

  <div style="text-align:center;margin-top:30px">
    <a href="https://www.wkbn.com/weather-cameras/east-liverpool/" target="_blank" rel="noopener"
       style="display:inline-block;border:1px solid var(--brd);background:var(--panel);color:var(--muted);
       padding:8px 16px;border-radius:999px;font-size:13px;font-weight:600;text-decoration:none">
       &#128247; Live Camera</a>
  </div>
  <p class="foot">Data: USGS NWIS &middot; GloFAS/ECMWF via Open-Meteo &middot; Open-Meteo precip.
     Tight lines. &#x1F3A3;</p>
</div>

<script>
const DATA = __PAYLOAD__;
document.getElementById('gen').textContent = DATA.generated;

/* ---- hero ---- */
(function(){
  const h = DATA.headline;
  const best = h.best.map(f=>f.dayname+' '+f.date.slice(5)).join(', ') || 'none clearly clean this week';
  const avoid = h.avoid.map(f=>f.dayname+' '+f.date.slice(5)).join(', ') || 'none';
  let rw = '';
  if(h.rain_watch.length){const r=h.rain_watch[0];
    rw = `<div><div class="big">Rain watch</div><div class="val">${r.mm} mm &rarr; pulse ~${r.arrive}</div></div>`;}
  document.getElementById('hero').innerHTML =
    `<div><div class="big">Preferable Conditions</div><div class="val" style="color:#5ee398">${best}</div></div>`+
    `<div><div class="big">Avoid</div><div class="val" style="color:#fb7185">${avoid}</div></div>`+ rw;
})();

/* ---- forecast cards ---- */
document.getElementById('fcards').innerHTML = DATA.forecast.map(f=>{
  const rp = f.rain>0 ? `<div class="rainpill ${f.notable?'hot':''}">&#127783; ${f.rain} mm</div>`:'';
  const up = (f.upside && f.upside!=='-') ? `<div class="fmeta">if it rains: <b>${f.upside}</b></div>`:'';
  return `<div class="card fcard">
    <div class="day">${f.dayname}</div><div class="date">${f.date.slice(5)}</div>
    <div class="badge v-${f.verdict}">${f.verdict}</div>
    <div class="conf">${f.conf} conf</div>
    <div class="fmeta"><b>${f.q}</b> m&sup3;/s<br>${f.level} &middot; ${f.trend}</div>
    ${rp}${up}</div>`;
}).join('');

/* ---- outlook ---- */
document.getElementById('outlook').innerHTML = DATA.outlook.map(o=>
  `<div class="outchip"><b>${o.dayname} ${o.date.slice(5)}</b>${o.q} m&sup3;/s &middot; ${o.level}</div>`
).join('') || '<span class="note">No extended outlook available.</span>';

/* ---- gauges ---- */
document.getElementById('gauges').innerHTML = DATA.now.map(g=>{
  const dir = g.pct>5?'up':(g.pct<-5?'dn':'');
  const arrow = g.pct>5?'&#9650;':(g.pct<-5?'&#9660;':'&#9644;');
  return `<div class="card gauge">
    <div class="lbl"><a class="glink" href="${g.page}">${g.label} <span style="opacity:.55">&#8599;</span></a></div>
    <div class="num">${g.cfs.toLocaleString()} <span class="unit">cfs</span></div>
    <span class="tag ${dir}">${arrow} ${g.trend} (${g.pct>0?'+':''}${g.pct}%/24h)</span>
    <span class="tag">${g.pctl||'—'}</span>
    ${g.watch?'<div class="watch">&#9888; local creek up &mdash; nearshore mud risk</div>':''}</div>`;
}).join('');

/* ---- antecedent ---- */
(function(){
  const a=DATA.antecedent; const col = a.mm>25?'#fb7185':(a.mm>8?'#fbbf52':'#5ee398');
  document.getElementById('antcard').innerHTML =
    `<div class="ant"><span class="dot" style="background:${col}"></span>
     <span>Last 5 days of upstream basin rain: <b>${a.mm} mm</b> &rarr; <b style="color:${col}">${a.word}</b></span></div>
     <p class="note" style="margin:10px 0 0">Wet ground makes the next rain run off faster and dirtier.</p>`;
})();

/* ---- rain watch + basins ---- */
document.getElementById('rainwatch').innerHTML = DATA.headline.rain_watch.length
  ? DATA.headline.rain_watch.map(r=>`&#127783; <b style="color:var(--txt)">${r.mm} mm</b> basin rain ~${r.date.slice(5)}
     &rarr; expect a discharge pulse at Toronto <b style="color:var(--txt)">~${r.arrive}</b>
     ${r.wet?'<span style="color:#fb7185">(worse &mdash; ground already wet)</span>':''}`).join('<br><br>')
  : 'No notable rain (&ge;'+DATA.notable_mm+' mm) in the upstream basin this week.';
document.getElementById('basinlist').innerHTML = DATA.basin_points.map(b=>
  `<div class="bp"><span>${b.name}</span><span class="co">${b.lat}, ${b.lon}</span></div>`).join('');

/* ---- charts ---- */
const gridc='rgba(255,255,255,.06)', txtc='#90a3bd';
Chart.defaults.color=txtc; Chart.defaults.font.family='Inter';

const todayLine={id:'todayLine',afterDraw(c){
  const idx=c.options.plugins.todayLine.idx; if(idx==null)return;
  const labels=c.data.labels; if(!labels||idx>=labels.length)return;
  const x=c.scales.x.getPixelForValue(labels[idx]); const {top,bottom}=c.chartArea;
  const cx=c.ctx; cx.save(); cx.strokeStyle='rgba(255,255,255,.35)'; cx.setLineDash([4,4]); cx.lineWidth=1;
  cx.beginPath(); cx.moveTo(x,top); cx.lineTo(x,bottom); cx.stroke();
  cx.setLineDash([]); cx.fillStyle='rgba(255,255,255,.6)'; cx.font='11px Inter'; cx.fillText('today',x+5,top+13);
  cx.restore();
}};

const d=DATA.discharge, dl=d.map(r=>r.date.slice(5));
new Chart(document.getElementById('dischargeChart'),{
  type:'line',
  data:{labels:dl,datasets:[
    {label:'p25',data:d.map(r=>r.p25),borderColor:'transparent',pointRadius:0,fill:false},
    {label:'p25-p75 range',data:d.map(r=>r.p75),borderColor:'transparent',pointRadius:0,
      backgroundColor:'rgba(56,189,248,.18)',fill:'-1'},
    {label:'Worst-case (max)',data:d.map(r=>r.max),borderColor:'#fb7185',borderWidth:1,
      borderDash:[3,3],pointRadius:0,fill:false},
    {label:'Median',data:d.map(r=>r.median),borderColor:'#38bdf8',borderWidth:2.5,
      pointRadius:0,tension:.3,fill:false},
    {label:'Normal (p50)',data:d.map(r=>r.clim_p50),borderColor:'#94a3b8',borderWidth:1,
      borderDash:[6,4],pointRadius:0,fill:false},
    {label:'High (p90)',data:d.map(r=>r.clim_p90),borderColor:'#f59e0b',borderWidth:1,
      borderDash:[6,4],pointRadius:0,fill:false},
  ]},
  options:{maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{display:false},todayLine:{idx:DATA.today_index},
      tooltip:{callbacks:{label:c=>c.dataset.label+': '+Math.round(c.parsed.y)+' m³/s'}}},
    scales:{x:{grid:{color:gridc}},y:{grid:{color:gridc},title:{display:true,text:'m³/s'}}}},
  plugins:[todayLine]
});

const r=DATA.rain, rl=r.map(x=>x.date.slice(5));
const bp=DATA.basin_points.map(b=>b.name);
const cols=['#38bdf8','#34d399','#a78bfa','#f59e0b'];
new Chart(document.getElementById('rainChart'),{
  type:'bar',
  data:{labels:rl,datasets:bp.map((n,i)=>({label:n,
    data:r.map(x=>x.points[n]),backgroundColor:cols[i%cols.length],stack:'s',
    borderRadius:3}))},
  options:{maintainAspectRatio:false,
    plugins:{legend:{position:'bottom',labels:{boxWidth:12}},todayLine:{idx:DATA.rain_today_index},
      tooltip:{mode:'index'}},
    scales:{x:{stacked:true,grid:{color:gridc}},
      y:{stacked:true,grid:{color:gridc},title:{display:true,text:'mm / day'}}}},
  plugins:[todayLine]
});

/* ---- tabs ---- */
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  document.getElementById('p-'+t.dataset.t).classList.add('active');
});
</script>
</body></html>
"""


def render_html(payload):
    return HTML_TEMPLATE.replace("__PAYLOAD__", json.dumps(payload))


# === per-gauge 3-month history pages =========================================
HISTORY_STEP_HOURS = 1     # resample USGS instantaneous data to this interval (1 = hourly)


def usgs_history(site, days=92, step_hours=HISTORY_STEP_HOURS):
    """Instantaneous discharge (cfs) for ~3 months, resampled to step_hours."""
    end = dt.date.today()
    start = end - dt.timedelta(days=days)
    url = ("https://waterservices.usgs.gov/nwis/iv/?format=json"
           "&sites=%s&parameterCd=00060&startDT=%s&endDT=%s"
           % (site, start.isoformat(), end.isoformat()))
    raw = []
    try:
        ts = get_json(url)["value"]["timeSeries"]
        series = next((s for s in ts
                       if s["variable"]["variableCode"][0]["value"] == "00060"), None)
        if series is None and ts:
            series = ts[0]
        for v in series["values"][0]["value"]:
            try:
                q = float(v["value"])
            except (TypeError, ValueError):
                continue
            if q <= -999:
                continue
            raw.append((dt.datetime.fromisoformat(v["dateTime"]), q))
    except Exception:
        return []
    # resample: average all readings within each step_hours bucket
    buckets = {}
    for t, q in raw:
        h = (t.hour // step_hours) * step_hours
        key = t.replace(hour=h, minute=0, second=0, microsecond=0)
        buckets.setdefault(key, []).append(q)
    return [{"t": k.strftime("%Y-%m-%d %H:%M"), "q": round(sum(b) / len(b))}
            for k, b in sorted(buckets.items())]


GAUGE_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__LABEL__ - 3-month discharge</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
:root{--brd:rgba(255,255,255,.09);--panel:rgba(255,255,255,.045);--txt:#e8eef7;--muted:#90a3bd;--accent:#38bdf8}
*{box-sizing:border-box}
body{margin:0;color:var(--txt);font-family:Inter,system-ui,Segoe UI,Roboto,sans-serif;
  background:radial-gradient(1200px 700px at 75% -15%,#16294b 0%,#0a0f1c 55%) fixed;min-height:100vh;-webkit-font-smoothing:antialiased}
.wrap{max-width:1000px;margin:0 auto;padding:26px 20px 60px}
.back{color:var(--muted);text-decoration:none;font-size:14px}
.back:hover{color:var(--accent)}
.title{font-size:clamp(22px,3.5vw,30px);font-weight:800;letter-spacing:-.02em;margin:14px 0 4px;
  background:linear-gradient(90deg,#7dd3fc,#34d399);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:var(--muted);margin:0 0 18px;font-size:14px}
.card{border:1px solid var(--brd);background:var(--panel);border-radius:16px;padding:18px;backdrop-filter:blur(6px)}
.chartbox{position:relative;height:420px}
.stats{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.stat{flex:1;min-width:150px;border:1px solid var(--brd);background:var(--panel);border-radius:14px;padding:14px 16px}
.stat .k{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.stat .v{font-size:24px;font-weight:800;margin-top:4px}
.stat .d{font-size:12px;color:var(--muted);margin-top:2px}
.btn{display:inline-block;border:1px solid var(--brd);background:var(--panel);color:var(--accent);
  padding:10px 18px;border-radius:999px;font-size:14px;font-weight:700;text-decoration:none}
.btn:hover{border-color:var(--accent)}
.foot{color:var(--muted);font-size:12px;text-align:center;margin-top:30px}
.empty{color:var(--muted);text-align:center;padding:60px 0}
</style></head>
<body><div class="wrap">
  <a class="back" href="river.html">&larr; Back to dashboard</a>
  <h1 class="title">__LABEL__</h1>
  <p class="sub">USGS gauge __SITE__ &middot; discharge (cfs), hourly &middot; past 3 months &middot; hover for any hour</p>
  <div class="stats" id="stats"></div>
  <div class="card"><div class="chartbox"><canvas id="c"></canvas></div></div>
  <div style="margin-top:18px"><a class="btn" href="__USGSURL__" target="_blank" rel="noopener">View live data on USGS &#8599;</a></div>
  <p class="foot">Source: USGS NWIS daily values. &#x1F3A3;</p>
</div>
<script>
const H=__DATA__;
if(!H.length){
  document.querySelector('.card').innerHTML='<div class="empty">No USGS daily data available for this period.</div>';
}else{
  const qs=H.map(p=>p.q), latest=H[H.length-1];
  const mn=Math.min(...qs), mx=Math.max(...qs);
  const mnp=H.find(p=>p.q===mn), mxp=H.find(p=>p.q===mx);
  document.getElementById('stats').innerHTML=
    `<div class="stat"><div class="k">Latest</div><div class="v">${latest.q.toLocaleString()}</div><div class="d">cfs &middot; ${latest.t}</div></div>`+
    `<div class="stat"><div class="k">3-mo low</div><div class="v">${mn.toLocaleString()}</div><div class="d">cfs &middot; ${mnp.t}</div></div>`+
    `<div class="stat"><div class="k">3-mo high</div><div class="v">${mx.toLocaleString()}</div><div class="d">cfs &middot; ${mxp.t}</div></div>`;
  const ctx=document.getElementById('c');
  const grad=ctx.getContext('2d').createLinearGradient(0,0,0,420);
  grad.addColorStop(0,'rgba(56,189,248,.35)');grad.addColorStop(1,'rgba(56,189,248,0)');
  Chart.defaults.color='#90a3bd';Chart.defaults.font.family='Inter';
  const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const isMobile=window.innerWidth<600;
  // Mobile: first of each month only. Desktop: every 7th midnight.
  const ticks=[]; let dc=0;
  H.forEach((p,i)=>{
    if(p.t.slice(11)==='00:00'){
      if(isMobile){ if(p.t.slice(8,10)==='01') ticks.push(i); }
      else { if(dc%7===0) ticks.push(i); }
      dc++;
    }
  });
  new Chart(ctx,{type:'line',
    data:{labels:H.map(p=>p.t),datasets:[{label:'Discharge (cfs)',
      data:qs,borderColor:'#38bdf8',borderWidth:2,pointRadius:0,tension:.25,fill:true,backgroundColor:grad}]},
    options:{maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:false},
        tooltip:{callbacks:{title:i=>H[i[0].dataIndex].t,label:c=>c.parsed.y.toLocaleString()+' cfs'}}},
      scales:{x:{grid:{color:'rgba(255,255,255,.06)'},
        afterBuildTicks:a=>{if(ticks.length)a.ticks=ticks.map(i=>({value:i}));},
        ticks:{autoSkip:false,maxRotation:0,minRotation:0,
          callback:v=>{const s=(typeof v==='number')?(H[v]&&H[v].t):v;
            return s?MON[+String(s).slice(5,7)-1]+(isMobile?'':' '+String(s).slice(8,10)):'';}}},
        y:{grid:{color:'rgba(255,255,255,.06)'},title:{display:true,text:'cfs'}}}}});
}
</script></body></html>
"""


def render_gauge_page(site, label, history):
    usgs = "https://waterdata.usgs.gov/monitoring-location/USGS-%s/" % site
    return (GAUGE_TEMPLATE.replace("__LABEL__", label).replace("__SITE__", site)
            .replace("__USGSURL__", usgs).replace("__DATA__", json.dumps(history)))


def open_dashboard(no_browser=False):
    print("Fetching data and building dashboard...")
    payload = build_payload()
    for site, (label, role) in USGS_SITES.items():
        page = os.path.join(HERE, "gauge_%s.html" % site)
        with open(page, "w", encoding="utf-8") as f:
            f.write(render_gauge_page(site, label, usgs_history(site)))
    with open(HTML_FILE, "w", encoding="utf-8") as f:
        f.write(render_html(payload))
    print("Saved: %s  (+ 3 gauge history pages)" % HTML_FILE)
    if not no_browser:
        webbrowser.open(pathlib.Path(HTML_FILE).as_uri())
        print("Opened in your default browser.")


# === console report (kept as --console) ======================================
def forecast_console():
    today = dt.date.today()
    clim = load_climatology()
    gl = glofas_forecast()
    rain = basin_precip()
    now = usgs_now()
    by_date = {g["date"]: g for g in gl}

    print("=" * 92)
    print(" OHIO RIVER @ TORONTO, OH  --  7-DAY FISHABILITY FORECAST   %s"
          % dt.datetime.now().strftime("%a %Y-%m-%d %H:%M"))
    print("=" * 92)
    print(" NOW (USGS gauges):")
    for site, (label, role) in USGS_SITES.items():
        if site in now:
            cfs, pct = now[site]
            pl = usgs_percentile(site, cfs)
            print("   %-44s %8.0f cfs  %-12s %s" % (label, cfs, trend_word(pct),
                  ("[" + pl + "]") if pl else ""))
    ant = sum(v for d, v in rain.items()
              if (today - dt.timedelta(days=5)).isoformat() <= d < today.isoformat())
    print("   Upstream ground (last 5d basin rain): %.0f mm" % ant)
    print("-" * 92)
    print(" %-11s %-3s %6s  %-12s %-11s %5s %-15s %s"
          % ("Date", "Day", "Q", "vs normal", "trend", "rain", "if it rains", "VERDICT"))
    print("-" * 92)
    for h in range(0, 7):
        d = (today + dt.timedelta(days=h)).isoformat()
        g = by_date.get(d)
        if not g or g["med"] is None:
            continue
        mc = clim["months"][str(int(d[5:7]))]
        prev = by_date.get((today + dt.timedelta(days=h - 1)).isoformat())
        pct = (g["med"] - prev["med"]) / prev["med"] * 100 if (prev and prev["med"]) else None
        verdict, conf, lvl, trendw, upside = classify(
            g["med"], mc, pct, g["p25"], g["p75"], g["max"], h)
        rmm = rain.get(d, 0.0)
        print(" %-11s %-3s %6.0f  %-12s %-11s %4.0f%1s %-15s %s (%s)"
              % (d, (today + dt.timedelta(days=h)).strftime("%a"), g["med"], lvl,
                 trendw, rmm, "*" if rmm >= RAIN_NOTABLE_MM else " ", upside, verdict, conf))
    print("-" * 92)
    print(" (Run without --console for the full graphical dashboard.)")


# === calibration log =========================================================
def log_trip(clarity):
    now = usgs_now()
    gl = {g["date"]: g for g in glofas_forecast()}
    today = dt.date.today().isoformat()
    row = {"date": today, "clarity_1to5": clarity,
           "glofas_q": round(gl[today]["med"]) if today in gl and gl[today]["med"] else ""}
    for site in USGS_SITES:
        row[site] = round(now[site][0]) if site in now else ""
    fields = ["date", "clarity_1to5", "glofas_q"] + list(USGS_SITES)
    new = not os.path.exists(LOG_FILE)
    with open(LOG_FILE, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        if new:
            w.writeheader()
        w.writerow(row)
    print("Logged %s: clarity=%s  glofas_q=%s  %s"
          % (today, clarity, row["glofas_q"], {s: row[s] for s in USGS_SITES}))


def show_history():
    if not os.path.exists(LOG_FILE):
        print("No log yet. Build one: py river_forecast.py --log <1-5>")
        return
    rows = list(csv.DictReader(open(LOG_FILE)))
    for r in rows:
        print(r)
    for key, lbl in (("03086000", "Sewickley cfs"), ("glofas_q", "GloFAS m3/s")):
        clear = [float(r[key]) for r in rows if r.get(key) and int(r["clarity_1to5"]) >= 4]
        muddy = [float(r[key]) for r in rows if r.get(key) and int(r["clarity_1to5"]) <= 2]
        if clear and muddy:
            print("\n%s -> clear(>=4) median %.0f ; muddy(<=2) median %.0f"
                  % (lbl, statistics.median(clear), statistics.median(muddy)))


# === export raw data CSVs ====================================================
def export_csvs():
    out = []
    s = glofas_series(past_days=7, forecast_days=14)
    p = os.path.join(HERE, "data_glofas_discharge_forecast.csv")
    with open(p, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date", "control_m3s", "ens_median_m3s", "ens_p25_m3s",
                    "ens_p75_m3s", "ens_max_m3s"])
        for r in s:
            w.writerow([r["date"], r["control"], r["median"], r["p25"], r["p75"], r["max"]])
    out.append(p)

    clim = load_climatology()
    p = os.path.join(HERE, "data_glofas_monthly_climatology.csv")
    with open(p, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["month", "p10_m3s", "p50_m3s", "p75_m3s", "p90_m3s", "n_days"])
        for m in range(1, 13):
            mc = clim["months"][str(m)]
            w.writerow([m, round(mc["p10"]), round(mc["p50"]), round(mc["p75"]),
                        round(mc["p90"]), mc["n"]])
    out.append(p)

    per_point, basin_avg, times = rain_detail(past_days=5, forecast_days=14)
    p = os.path.join(HERE, "data_basin_precip_forecast.csv")
    with open(p, "w", newline="") as f:
        w = csv.writer(f)
        names = [x[2] for x in BASIN_POINTS]
        w.writerow(["date"] + ["%s_mm" % n.replace(" ", "_") for n in names] + ["basin_avg_mm"])
        for dte in times:
            w.writerow([dte] + [round(per_point[n][dte], 2) for n in names]
                       + [round(basin_avg[dte], 2)])
    out.append(p)

    now = usgs_now()
    p = os.path.join(HERE, "data_usgs_gauges_now.csv")
    with open(p, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["usgs_site", "name", "role", "discharge_cfs", "change_24h_pct",
                    "trend", "percentile_for_date"])
        for site, (label, role) in USGS_SITES.items():
            if site in now:
                cfs, pct = now[site]
                w.writerow([site, label, role, round(cfs), round(pct, 1),
                            trend_word(pct), usgs_percentile(site, cfs)])
    out.append(p)

    print("Exported %d CSVs:" % len(out))
    for p in out:
        print("  " + p)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="7-day Ohio River fishability forecast")
    ap.add_argument("--console", action="store_true", help="text report instead of HTML")
    ap.add_argument("--refresh-clim", action="store_true", help="rebuild climatology cache")
    ap.add_argument("--log", type=int, metavar="1-5",
                    help="log observed clarity after a trip (1 muddy .. 5 clear)")
    ap.add_argument("--history", action="store_true", help="show logged trips")
    ap.add_argument("--export", action="store_true", help="dump the raw data CSVs")
    ap.add_argument("--no-browser", action="store_true",
                    help="skip opening browser (used in CI/GitHub Actions)")
    args = ap.parse_args()
    if args.refresh_clim:
        build_climatology(); print("Climatology cache rebuilt: %s" % CLIM_FILE)
    if args.log:
        log_trip(args.log)
    elif args.history:
        show_history()
    elif args.export:
        export_csvs()
    elif args.console:
        forecast_console()
    else:
        open_dashboard(no_browser=args.no_browser)