"""
sis_engine.py  —  A self-contained analytics engine for multi-year primary
school grade data (Grade 1-5), built to ingest messy real-world workbooks like
'SUMMARY OF GRADES-AY2023-2026.xlsx' and emit clean, decision-grade information.

Design principles (grounded in how serious international-school systems work —
NWEA MAP Growth conditional growth, GL/FFT value-added, standards tracking):

  1. INGEST DEFENSIVELY. Headers drift between years (ISLAM->ISL, blank name
     header, different attendance labels). The loader fingerprints columns by
     *meaning*, not by exact string, and auto-detects the header row.

  2. NORMALIZE TO LONG (tidy) FORMAT. One row = one (student, year, subject,
     term, score). This is the schema an SIS database should store. It kills
     the "horizontal scroll nightmare" and never breaks when a subject is added.

  3. SEPARATE ATTAINMENT FROM PROGRESS. Attainment = how high. Progress =
     how much better than *expected given where the student started*. Raw
     year-over-year deltas are misleading because of ceiling effects and
     regression to the mean; we compute a conditional-growth PROGRESS INDEX
     (standardized residual from regressing this year on last year).

Public entry point:  run_pipeline(path, out_dir)
"""
from __future__ import annotations
import re, json, os
from dataclasses import dataclass, field
import numpy as np
import pandas as pd

# --------------------------------------------------------------------------- #
#  1.  COLUMN FINGERPRINTING  (the part that makes it robust to messy files)  #
# --------------------------------------------------------------------------- #

def _norm(h) -> str:
    return re.sub(r"[^a-z0-9]", "", str(h).lower())

# canonical subject  ->  list of substrings that identify it (checked in order)
SUBJECT_ALIASES = [
    ("ENGLISH",        ["english", "eng"]),
    ("MATH",           ["maths", "math"]),
    ("SCIENCE",        ["science", "sci"]),
    ("ARABIC",         ["arabic", "arab", "ara"]),
    ("ISLAMIC",        ["islamic", "islam", "isl"]),
    ("SOCIAL_STUDIES", ["socialstudies", "socstudies", "socstud", "socstu", "social", "soc", "ss"]),
    ("CIT",            ["cit"]),
    ("LIFE_SKILLS",    ["lifeskills", "lifeskill", "lifeskl", "lfskl", "life", "lf"]),
    ("COMPUTER",       ["computer", "computing", "comp", "ict"]),
    ("FRENCH",         ["french", "fr"]),
    ("ART",            ["art"]),
    ("PE",             ["physicaleducation", "pe"]),
]

def _match_subject(token_norm: str):
    for canon, keys in SUBJECT_ALIASES:
        for k in keys:
            if token_norm.startswith(k) or token_norm == k:
                return canon
    # contains-fallback
    for canon, keys in SUBJECT_ALIASES:
        if any(k in token_norm for k in keys):
            return canon
    return None

def classify_column(raw_header):
    """Return ('id'|'name'|'section'|'grade'|'subject'|'att'|'ignore', meta)."""
    n = _norm(raw_header)
    if n in ("no", "studentno", "studentid", "idno", "id", "rollno"):
        return "id", {}
    if n in ("name", "studentname", "fullname") or n.startswith("unnamed"):
        return "name", {}
    if n in ("section", "class", "sectionclass", "grsec", "gradesection"):
        return "section", {}
    if n in ("grade", "gradelevel", "yearlevel", "level"):
        return "grade", {}

    # attendance metric?
    metric = None
    if "schday" in n or "schooldays" in n or ("sch" in n and "day" in n):
        metric = "days_school"
    elif "present" in n or "dayspres" in n or "pres" in n:
        metric = "days_present"
    elif "absent" in n or "daysabs" in n or "abs" in n:
        metric = "days_absent"
    elif "tardy" in n or "tard" in n or "late" in n:
        metric = "days_tardy"
    if metric:
        term = 2 if ("t2" in n or n.endswith("2") or "-2" in str(raw_header)) else \
               (1 if ("t1" in n or n.endswith("1") or "-1" in str(raw_header)) else 0)
        if metric == "days_tardy" and not re.search(r"[12]$", n) and "t1" not in n and "t2" not in n:
            term = 0          # annual tardy (no term split)
        return "att", {"metric": metric, "term": term}

    # subject-term? e.g. "ENGLISH-T1 (6)", "ISL-T2", "MATHS T1"
    m = re.search(r"t\s*([12])", n)
    if m:
        term = int(m.group(1))
        token = re.split(r"t[12]", n)[0]          # text before the term marker
        subj = _match_subject(token)
        if subj:
            return "subject", {"subject": subj, "term": term}
    return "ignore", {}


def find_header_row(raw: pd.DataFrame, scan=8) -> int:
    """Pick the row that looks most like a header (most recognizable columns)."""
    best_i, best_score = 0, -1
    for i in range(min(scan, len(raw))):
        score = 0
        for val in raw.iloc[i].tolist():
            kind, _ = classify_column(val)
            if kind in ("id", "name", "section", "subject", "att"):
                score += 1
        if score > best_score:
            best_i, best_score = i, score
    return best_i


def parse_section(value):
    """'G4B' -> (4, 'B').  '3A' -> (3,'A').  Returns (grade|None, sec|None)."""
    if pd.isna(value):
        return None, None
    m = re.search(r"(\d+)\s*([A-Za-z]?)", str(value))
    if not m:
        return None, None
    grade = int(m.group(1))
    sec = (m.group(2) or "").upper() or None
    return grade, sec


def _to_score(x):
    if pd.isna(x):
        return np.nan
    s = str(x).strip()
    if s.upper() in ("N/A", "NA", "NULL", "-", ""):
        return np.nan
    s = s.replace("%", "")
    try:
        return float(s)
    except ValueError:
        return np.nan


def year_start(label: str) -> int:
    m = re.search(r"(\d{4})", str(label))
    return int(m.group(1)) if m else 0

def year_clean(label: str) -> str:
    m = re.findall(r"(\d{4})", str(label))
    if len(m) >= 2:
        return f"{m[0]}-{m[1]}"
    return str(label)


# --------------------------------------------------------------------------- #
#  2.  LOAD + NORMALIZE  ->  tidy long tables                                  #
# --------------------------------------------------------------------------- #

@dataclass
class Tidy:
    scores: pd.DataFrame          # student_id, year, year_start, grade, section, subject, term, score
    attendance: pd.DataFrame      # student_id, year, year_start, grade, section, term, metric, value
    students: pd.DataFrame        # student_id, name (latest)
    audit: dict = field(default_factory=dict)


def load_workbook_tidy(path: str) -> Tidy:
    sheets = pd.read_excel(path, sheet_name=None, header=None)
    score_rows, att_rows, names = [], [], {}
    audit = {"sheets": {}}

    for sheet_name, raw in sheets.items():
        if year_start(sheet_name) == 0:          # skip non-year sheets
            continue
        hdr = find_header_row(raw)
        df = raw.iloc[hdr + 1:].copy()
        df.columns = raw.iloc[hdr].tolist()
        df = df.dropna(how="all")

        colmap = {c: classify_column(c) for c in df.columns}
        id_col   = next((c for c, (k, _) in colmap.items() if k == "id"), None)
        name_col = next((c for c, (k, _) in colmap.items() if k == "name"), None)
        sec_col  = next((c for c, (k, _) in colmap.items() if k == "section"), None)
        grd_col  = next((c for c, (k, _) in colmap.items() if k == "grade"), None)
        if id_col is None:
            id_col = df.columns[0]               # fallback
        if name_col is None:                     # blank/unlabeled name header
            for c, (k, _) in colmap.items():
                if k != "ignore" or c in (id_col, sec_col, grd_col):
                    continue
                col = df[c]
                txt = col.dropna().astype(str)
                if len(txt) and (txt.str.contains(r"[A-Za-z]").mean() > 0.6) \
                        and (pd.to_numeric(col, errors="coerce").notna().mean() < 0.3):
                    name_col = c
                    break

        yr   = year_clean(sheet_name)
        ystr = year_start(sheet_name)
        subj_cols = [(c, m) for c, (k, m) in colmap.items() if k == "subject"]
        att_cols  = [(c, m) for c, (k, m) in colmap.items() if k == "att"]
        audit["sheets"][sheet_name] = {
            "header_row_excel": int(hdr + 1),
            "students": int(df[id_col].notna().sum()),
            "subjects_detected": sorted({m["subject"] for _, m in subj_cols}),
            "attendance_detected": sorted({m["metric"] for _, m in att_cols}),
            "name_column": str(name_col),
        }

        for _, r in df.iterrows():
            sid = r[id_col]
            if pd.isna(sid):
                continue
            try:
                sid = int(float(sid))
            except (ValueError, TypeError):
                sid = str(sid).strip()
            grade, sec = (None, None)
            if sec_col is not None:
                grade, sec = parse_section(r[sec_col])
            if grade is None and grd_col is not None and pd.notna(r[grd_col]):
                try: grade = int(float(r[grd_col]))
                except (ValueError, TypeError): pass
            if name_col is not None and pd.notna(r[name_col]):
                names[sid] = str(r[name_col]).strip()

            for c, m in subj_cols:
                score_rows.append((sid, yr, ystr, grade, sec,
                                   m["subject"], m["term"], _to_score(r[c])))
            for c, m in att_cols:
                v = pd.to_numeric(r[c], errors="coerce")
                att_rows.append((sid, yr, ystr, grade, sec,
                                 m["term"], m["metric"], v))

    scores = pd.DataFrame(score_rows, columns=[
        "student_id","year","year_start","grade","section","subject","term","score"])
    attendance = pd.DataFrame(att_rows, columns=[
        "student_id","year","year_start","grade","section","term","metric","value"])
    students = (pd.DataFrame([(k, v) for k, v in names.items()],
                             columns=["student_id","name"])
                  .sort_values("student_id").reset_index(drop=True))
    return Tidy(scores, attendance, students, audit)


# --------------------------------------------------------------------------- #
#  3.  DERIVED TABLES                                                          #
# --------------------------------------------------------------------------- #

def subject_year(tidy: Tidy) -> pd.DataFrame:
    """Annual subject score = mean of its terms. Plus T2-T1 within-year delta."""
    s = tidy.scores.dropna(subset=["score"])
    piv = (s.pivot_table(index=["student_id","year","year_start","grade","section","subject"],
                         columns="term", values="score", aggfunc="mean")
             .reset_index())
    piv.columns = [str(c) if not isinstance(c, str) else c for c in piv.columns]
    t1 = piv["1"] if "1" in piv.columns else np.nan
    t2 = piv["2"] if "2" in piv.columns else np.nan
    piv["score_year"] = piv[[c for c in ("1","2") if c in piv.columns]].mean(axis=1)
    piv["term_delta"] = t2 - t1
    return piv

def student_year(sy: pd.DataFrame) -> pd.DataFrame:
    """Overall annual average across subjects (the headline attainment number)."""
    g = (sy.groupby(["student_id","year","year_start","grade","section"], dropna=False)
           .agg(overall=("score_year","mean"),
                subjects_taken=("subject","nunique"))
           .reset_index())
    return g

def attendance_year(tidy: Tidy) -> pd.DataFrame:
    a = tidy.attendance.dropna(subset=["value"])
    w = (a.groupby(["student_id","year","year_start"])
           .apply(lambda d: pd.Series({
               "days_school": d.loc[d.metric=="days_school","value"].sum(),
               "days_present": d.loc[d.metric=="days_present","value"].sum(),
               "days_absent": d.loc[d.metric=="days_absent","value"].sum(),
               "days_tardy": d.loc[d.metric=="days_tardy","value"].sum(),
           }), include_groups=False)
           .reset_index())
    w["absence_rate"] = np.where(w.days_school > 0,
                                 w.days_absent / w.days_school, np.nan)
    return w


# --------------------------------------------------------------------------- #
#  4.  THE ANALYST METRICS                                                     #
# --------------------------------------------------------------------------- #

def _progress_index(prev: pd.Series, curr: pd.Series):
    """Conditional growth: regress curr on prev; standardized residual = how
    much better/worse than expected GIVEN the starting point. Returns
    (progress_index_series, predicted_series, slope, intercept)."""
    x, y = prev.to_numpy(float), curr.to_numpy(float)
    ok = np.isfinite(x) & np.isfinite(y)
    if ok.sum() < 5:
        nan = pd.Series(np.nan, index=prev.index)
        return nan, nan, np.nan, np.nan
    b, a = np.polyfit(x[ok], y[ok], 1)
    pred = a + b * x
    resid = y - pred
    sd = np.nanstd(resid[ok], ddof=1) or 1.0
    return pd.Series(resid / sd, index=prev.index), pd.Series(pred, index=prev.index), b, a


def cohort_progress(syear: pd.DataFrame):
    """For every consecutive-year transition, match students present in both
    years and compute attainment + raw delta + conditional Progress Index."""
    years = sorted(syear.year.unique(), key=year_start)
    transitions = []
    rows = []
    for y0, y1 in zip(years, years[1:]):
        a = syear[syear.year == y0][["student_id","overall","grade"]].rename(
                columns={"overall":"prev","grade":"grade_prev"})
        b = syear[syear.year == y1][["student_id","overall","grade"]].rename(
                columns={"overall":"curr","grade":"grade_curr"})
        m = a.merge(b, on="student_id", how="inner")
        if m.empty:
            continue
        m["transition"] = f"{y0} → {y1}"
        m["raw_delta"] = m["curr"] - m["prev"]
        pi, pred, slope, icpt = _progress_index(m["prev"], m["curr"])
        m["expected"] = pred
        m["progress_index"] = pi
        rows.append(m)
        transitions.append({"transition": f"{y0} → {y1}", "n": int(len(m)),
                            "mean_prev": float(m.prev.mean()),
                            "mean_curr": float(m.curr.mean()),
                            "slope": float(slope)})
    detail = pd.concat(rows, ignore_index=True) if rows else pd.DataFrame()
    return detail, pd.DataFrame(transitions)


def subject_progress(sy: pd.DataFrame):
    """Per-subject conditional growth across each transition (which subjects
    add or lose value as the cohort advances)."""
    years = sorted(sy.year.unique(), key=year_start)
    out = []
    for y0, y1 in zip(years, years[1:]):
        for subj in sorted(sy.subject.unique()):
            a = sy[(sy.year==y0)&(sy.subject==subj)][["student_id","score_year"]].rename(columns={"score_year":"prev"})
            b = sy[(sy.year==y1)&(sy.subject==subj)][["student_id","score_year"]].rename(columns={"score_year":"curr"})
            m = a.merge(b, on="student_id", how="inner").dropna()
            if len(m) < 5:
                continue
            out.append({"transition": f"{y0} → {y1}", "subject": subj,
                        "n": len(m), "mean_prev": m.prev.mean(),
                        "mean_curr": m.curr.mean(),
                        "raw_change": m.curr.mean() - m.prev.mean()})
    return pd.DataFrame(out)


def curriculum_bottleneck(sy: pd.DataFrame):
    """Cross-sectional difficulty: mean score by (subject, grade), pooled across
    years. Answers 'which grade is the wall in each subject?'"""
    g = (sy.groupby(["subject","grade"])["score_year"].mean()
           .reset_index().pivot(index="subject", columns="grade", values="score_year"))
    # biggest single grade-to-grade drop per subject
    drops = []
    for subj, row in g.iterrows():
        vals = row.dropna()
        if len(vals) < 2:
            continue
        diffs = vals.diff().dropna()
        worst = diffs.idxmin()
        drops.append({"subject": subj, "hardest_step_into_grade": int(worst),
                      "drop_points": float(diffs.min())})
    return g, pd.DataFrame(drops).sort_values("drop_points")


def section_equity(sy: pd.DataFrame, gap_flag=4.0):
    """Within each (year, grade, subject), spread across sections."""
    g = (sy.dropna(subset=["section"])
           .groupby(["year","grade","subject","section"])["score_year"]
           .mean().reset_index())
    spread = (g.groupby(["year","grade","subject"])["score_year"]
                .agg(["max","min","mean","count"]).reset_index())
    spread["gap"] = spread["max"] - spread["min"]
    spread = spread[spread["count"] >= 2]
    spread["flag"] = spread["gap"] >= gap_flag
    return g, spread.sort_values("gap", ascending=False)


def attendance_impact(syear: pd.DataFrame, att: pd.DataFrame):
    """Quantify the achievement cost of absence. Regression slope + readable
    banded table."""
    m = syear.merge(att, on=["student_id","year","year_start"], how="inner").dropna(
            subset=["overall","days_absent"])
    if len(m) < 10:
        return {"available": False}, pd.DataFrame()
    b, a = np.polyfit(m["days_absent"], m["overall"], 1)
    r = np.corrcoef(m["days_absent"], m["overall"])[0,1]
    bands = pd.cut(m["days_absent"], [-1,0,3,7,14,9999],
                   labels=["0","1-3","4-7","8-14","15+"])
    tbl = (m.groupby(bands, observed=True)
             .agg(students=("overall","size"), mean_overall=("overall","mean"),
                  mean_absent=("days_absent","mean")).reset_index()
             .rename(columns={"days_absent":"absence_band"}))
    summary = {"available": True, "points_per_absence_day": float(b),
               "correlation": float(r), "n": int(len(m))}
    return summary, tbl


def term_slump(sy: pd.DataFrame):
    t = (sy.groupby("subject")["term_delta"].mean().reset_index()
           .rename(columns={"term_delta":"avg_T2_minus_T1"})
           .sort_values("avg_T2_minus_T1"))
    overall = float(sy["term_delta"].mean())
    return t, overall


def volatility(sy: pd.DataFrame):
    """Per-student instability = std of term-to-term changes across all
    subjects/years. High = erratic learner who needs a closer look."""
    s = sy[["student_id","year_start","subject","term_delta"]].dropna()
    v = (s.groupby("student_id")["term_delta"]
           .agg(lambda x: np.std(x, ddof=1) if len(x) > 1 else np.nan)
           .reset_index().rename(columns={"term_delta":"volatility"}))
    return v


def risk_register(syear, prog_detail, att, students):
    """Fuse attainment + progress + attendance into actionable tiers.
    Tier priority: Critical > Attendance Risk > Slipping > Hidden Gem > On Track."""
    years = sorted(syear.year.unique(), key=year_start)
    latest = years[-1]
    base = syear[syear.year == latest][["student_id","overall","grade","section"]].copy()
    low_cut = base["overall"].quantile(0.25)

    last_trans = prog_detail[prog_detail.transition.str.endswith(latest)] \
        if not prog_detail.empty else pd.DataFrame()
    base = base.merge(last_trans[["student_id","progress_index","raw_delta","expected"]],
                      on="student_id", how="left")
    a_last = att[att.year == latest][["student_id","days_absent","absence_rate"]]
    base = base.merge(a_last, on="student_id", how="left")
    base = base.merge(students, on="student_id", how="left")

    def tier(r):
        low   = r.overall <= low_cut
        slip  = pd.notna(r.progress_index) and r.progress_index <= -1.0
        gem   = pd.notna(r.progress_index) and r.progress_index >= 1.0
        absnt = pd.notna(r.days_absent) and r.days_absent >= 12
        if low and (slip or absnt):
            return "🔴 Critical"
        if absnt:
            return "🟠 Attendance Risk"
        if slip:
            return "🟡 Slipping"
        if gem:
            return "🟢 Hidden Gem"
        return "⚪ On Track"

    base["tier"] = base.apply(tier, axis=1)
    def why(r):
        bits = []
        if pd.notna(r.progress_index):
            bits.append(f"progress {r.progress_index:+.1f}σ")
        if pd.notna(r.days_absent):
            bits.append(f"{int(r.days_absent)} absences")
        bits.append(f"avg {r.overall:.1f}")
        return "; ".join(bits)
    base["signals"] = base.apply(why, axis=1)
    order = {"🔴 Critical":0,"🟠 Attendance Risk":1,"🟡 Slipping":2,
             "🟢 Hidden Gem":3,"⚪ On Track":4}
    base["_o"] = base.tier.map(order)
    return base.sort_values(["_o","overall"]).drop(columns="_o"), latest


# --------------------------------------------------------------------------- #
#  5.  PIPELINE                                                                #
# --------------------------------------------------------------------------- #

def run_pipeline(path: str, out_dir: str) -> dict:
    os.makedirs(out_dir, exist_ok=True)
    tidy = load_workbook_tidy(path)
    sy   = subject_year(tidy)
    syear = student_year(sy)
    att  = attendance_year(tidy)

    prog_detail, prog_summary = cohort_progress(syear)
    subj_prog = subject_progress(sy)
    bottleneck_grid, bottleneck_drops = curriculum_bottleneck(sy)
    sec_detail, sec_spread = section_equity(sy)
    att_summary, att_bands = attendance_impact(syear, att)
    slump_tbl, slump_overall = term_slump(sy)
    vol = volatility(sy)
    risk, latest_year = risk_register(syear, prog_detail, att, tidy.students)

    result = {
        "tidy": tidy, "subject_year": sy, "student_year": syear,
        "attendance_year": att, "progress_detail": prog_detail,
        "progress_summary": prog_summary, "subject_progress": subj_prog,
        "bottleneck_grid": bottleneck_grid, "bottleneck_drops": bottleneck_drops,
        "section_spread": sec_spread, "attendance_summary": att_summary,
        "attendance_bands": att_bands, "term_slump": slump_tbl,
        "term_slump_overall": slump_overall, "volatility": vol,
        "risk": risk, "latest_year": latest_year, "audit": tidy.audit,
    }
    return result


if __name__ == "__main__":
    import sys
    r = run_pipeline(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "./out")
    print(json.dumps(r["audit"], indent=2))
