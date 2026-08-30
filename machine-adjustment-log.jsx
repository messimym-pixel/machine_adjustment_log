import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  LayoutDashboard, PlusCircle, History, Settings2, Menu, X,
  Search, Filter, Download, Trash2, Eye, Pencil, ChevronLeft, ChevronRight,
  Moon, Sun, AlertTriangle, CheckCircle2, Wrench, Gauge, Factory,
  RotateCcw, ChevronDown, XCircle, Calendar, Database, Clock,
} from "lucide-react";

/* ============================================================
   API BASE URL
   In dev: empty string → Vite proxy handles /api/* → localhost:3001
   In production (Vercel): reads VITE_API_URL → points to Render backend
   ============================================================ */
const API_BASE = import.meta.env.VITE_API_URL || "";

/* ============================================================
   CONSTANTS
   ============================================================ */

const LINES = ["Line 1", "Line 2", "Line 3", "SMT", "FATP", "NPI"];
const CATEGORIES = [
  "Setup", "Parameter Adjustment", "Quality Issue", "Machine Alarm",
  "Preventive Adjustment", "Product Change", "Trial Run", "Other",
];
const RESULTS = ["Normal", "Monitoring", "Failed", "Pending Verification"];
const STATUSES = ["Active", "Inactive", "Maintenance"];

const RESULT_STYLES = {
  Normal: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Monitoring: "bg-amber-50 text-amber-700 ring-amber-600/20",
  Failed: "bg-rose-50 text-rose-700 ring-rose-600/20",
  "Pending Verification": "bg-blue-50 text-blue-700 ring-blue-600/20",
};
const RESULT_STYLES_DARK = {
  Normal: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30",
  Monitoring: "bg-amber-500/10 text-amber-400 ring-amber-500/30",
  Failed: "bg-rose-500/10 text-rose-400 ring-rose-500/30",
  "Pending Verification": "bg-blue-500/10 text-blue-400 ring-blue-500/30",
};
const STATUS_STYLES = {
  Active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Inactive: "bg-slate-100 text-slate-600 ring-slate-500/20",
  Maintenance: "bg-amber-50 text-amber-700 ring-amber-600/20",
};
const STATUS_STYLES_DARK = {
  Active: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30",
  Inactive: "bg-slate-500/10 text-slate-400 ring-slate-500/30",
  Maintenance: "bg-amber-500/10 text-amber-400 ring-amber-500/30",
};

const DONUT_COLORS = {
  Normal: "#10b981",
  Monitoring: "#f59e0b",
  Failed: "#f43f5e",
  "Pending Verification": "#3b82f6",
};

const PARAMETER_OPTIONS = [
  "Temperature", "Pressure", "Speed", "Torque", "Voltage",
  "Alignment / Offset", "Height / Gap", "Flow Rate", "Vacuum / Suction",
  "Timing / Delay", "Other",
];
const PARAMETER_SUGGESTIONS = PARAMETER_OPTIONS;

/* ============================================================
   UTILITIES
   ============================================================ */

function pad(n, len = 2) {
  return String(n).padStart(len, "0");
}

function toDateStr(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTimeShort(dateStr, timeStr) {
  return `${formatDate(dateStr)} ${timeStr || ""}`.trim();
}

function nowDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowTimeStr() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function generateRecordId(records, dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const stamp = isNaN(d.getTime()) ? toDateStr(new Date()) : toDateStr(d);
  const prefix = `ADJ-${stamp}-`;
  const sameDay = records.filter((r) => r.recordId.startsWith(prefix));
  let maxNum = 0;
  sameDay.forEach((r) => {
    const numPart = parseInt(r.recordId.split("-")[2], 10);
    if (!isNaN(numPart) && numPart > maxNum) maxNum = numPart;
  });
  return `${prefix}${pad(maxNum + 1, 3)}`;
}

function minutesToHM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** Computes minutes between two "HH:MM" times. If end is earlier than start, assumes the downtime rolled past midnight. */
function computeDowntimeMinutes(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => isNaN(n))) return 0;
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60; // rolled past midnight
  return diff;
}

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday as start
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Returns { year, week } — the ISO-8601 week number (Mon–Sun, week 1 contains the year's first Thursday). */
function getISOWeekInfo(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

/** Returns the Monday (local date, midnight) that starts the given ISO year/week. */
function getISOWeekStart(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dayOfWeek = simple.getUTCDay() || 7;
  const monday = new Date(simple);
  if (dayOfWeek <= 4) monday.setUTCDate(simple.getUTCDate() - dayOfWeek + 1);
  else monday.setUTCDate(simple.getUTCDate() + 8 - dayOfWeek);
  return new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate());
}

function isoWeekValue(year, week) {
  return `${year}-W${pad(week)}`;
}

function parseIsoWeekValue(value) {
  const [y, w] = value.split("-W");
  return { year: Number(y), week: Number(w) };
}

/** Builds a dropdown-friendly list of ISO weeks around today: recent weeks first, current week included. */
function buildIsoWeekOptions(weeksBack = 20, weeksForward = 1) {
  const today = new Date();
  const currentInfo = getISOWeekInfo(today);
  const currentValue = isoWeekValue(currentInfo.year, currentInfo.week);
  const seen = new Set();
  const options = [];
  for (let i = weeksForward; i >= -weeksBack; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() + i * 7);
    const { year, week } = getISOWeekInfo(d);
    const value = isoWeekValue(year, week);
    if (seen.has(value)) continue;
    seen.add(value);
    const ws = getISOWeekStart(year, week);
    const we = new Date(ws); we.setDate(ws.getDate() + 6);
    const fmt = (dt) => dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    options.push({
      value,
      label: `Week ${week}, ${year} · ${fmt(ws)} – ${fmt(we)}`,
      isCurrent: value === currentValue,
    });
  }
  return options;
}

function isWithinRange(dateStr, start, end) {
  if (!start && !end) return true;
  const d = dateStr;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

function csvEscape(val) {
  const s = String(val ?? "");
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function exportCSV(records, filename = "adjustment-history.csv") {
  const headers = [
    "Record ID", "Date", "Machine", "Production Line", "Category",
    "Problem / Reason", "Parameter", "Before", "After", "Adjustment Details",
    "Downtime Start", "Downtime End", "Downtime (min)", "Result", "Adjusted By", "Verified By", "Remark",
  ];
  const rows = records.map((r) => [
    r.recordId, r.adjustmentDate, r.machineName, r.productionLine,
    r.category, r.problemReason, r.parameterName, r.beforeAdjustment, r.afterAdjustment,
    r.adjustmentDetails, r.downtimeStart, r.downtimeEnd, r.downtimeMinutes, r.result, r.adjustedBy, r.verifiedBy, r.remark,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Builds chart-ready buckets for a given period + date range */
function buildTrendBuckets(records, period, range) {
  const buckets = [];
  function bumpMachine(bucket, r) {
    const name = r.machineName || "Unknown";
    if (!bucket.machines[name]) bucket.machines[name] = { count: 0, downtime: 0, line: r.productionLine };
    bucket.machines[name].count += 1;
    bucket.machines[name].downtime += Number(r.downtimeMinutes) || 0;
  }

  if (period === "day") {
    for (let h = 0; h < 24; h += 2) {
      buckets.push({ key: `${pad(h)}:00`, label: `${pad(h)}:00`, count: 0, downtime: 0, machines: {} });
    }
    records.forEach((r) => {
      if (r.adjustmentDate !== range.refDay) return;
      const hour = parseInt((r.downtimeStart || "00:00").split(":")[0], 10);
      const bucketIdx = Math.min(Math.floor(hour / 2), buckets.length - 1);
      buckets[bucketIdx].count += 1;
      buckets[bucketIdx].downtime += Number(r.downtimeMinutes) || 0;
      bumpMachine(buckets[bucketIdx], r);
    });
  } else if (period === "week") {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const start = new Date(range.weekStart);
    days.forEach((d, i) => {
      const dt = new Date(start);
      dt.setDate(start.getDate() + i);
      buckets.push({ key: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`, label: d, count: 0, downtime: 0, machines: {} });
    });
    records.forEach((r) => {
      const idx = buckets.findIndex((b) => b.key === r.adjustmentDate);
      if (idx >= 0) {
        buckets[idx].count += 1;
        buckets[idx].downtime += Number(r.downtimeMinutes) || 0;
        bumpMachine(buckets[idx], r);
      }
    });
  } else {
    // month: bucket by week-of-month (Week 1..Week 5)
    const [y, m] = range.monthKey.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const weekCount = Math.ceil(daysInMonth / 7);
    for (let w = 0; w < weekCount; w++) {
      buckets.push({ key: `w${w}`, label: `Week ${w + 1}`, count: 0, downtime: 0, machines: {} });
    }
    records.forEach((r) => {
      const [ry, rm, rd] = r.adjustmentDate.split("-").map(Number);
      if (ry !== y || rm !== m) return;
      const w = Math.floor((rd - 1) / 7);
      if (buckets[w]) {
        buckets[w].count += 1;
        buckets[w].downtime += Number(r.downtimeMinutes) || 0;
        bumpMachine(buckets[w], r);
      }
    });
  }
  return buckets;
}

/* ============================================================
   SAMPLE DATA
   ============================================================ */

function buildSampleMachines() {
  const now = new Date().toISOString();
  const list = [
    ["SMT Printer 01", "DEK Horizon 03i", "SMT", "SMT Production", "Active"],
    ["SMT Mounter 01", "Yamaha YSM40R", "SMT", "SMT Production", "Active"],
    ["SMT Mounter 02", "Yamaha YSM40R", "SMT", "SMT Production", "Active"],
    ["Reflow Oven 01", "Heller 1809 MK5", "SMT", "SMT Production", "Active"],
    ["AOI Machine 01", "Koh Young Zenith", "SMT", "Quality", "Maintenance"],
    ["ICT Tester 01", "Keysight i3070", "FATP", "Test Engineering", "Active"],
    ["Assembly Machine 01", "Fuji NXT III", "FATP", "Final Assembly", "Active"],
    ["Packing Machine 01", "Sanko PK-200", "FATP", "Packing", "Inactive"],
  ];
  return list.map(([machineName, machineModel, productionLine, department, status], i) => ({
    id: `m-${i + 1}`,
    machineId: `MC-${pad(i + 1, 3)}`,
    machineName,
    machineModel,
    productionLine,
    department,
    status,
    createdAt: now,
    updatedAt: now,
  }));
}

function buildSampleRecords(machines) {
  const now = new Date();
  const problems = [
    "Solder paste print misaligned on pad", "Component pickup error rate increasing",
    "Reflow profile drifting above spec", "Board tilt detected during AOI scan",
    "Torque reading intermittently low", "Excess vibration during placement",
    "Test yield dropped after last product change", "Nozzle wear causing skipped parts",
    "Line changeover for new product variant", "Alarm triggered on axis 2 servo",
    "Preventive check per maintenance schedule", "Packing seal pressure inconsistent",
  ];
  const details = [
    "Adjusted parameter per SOP and re-verified with test board.",
    "Replaced worn part and recalibrated to spec.",
    "Updated recipe parameter and ran verification lot.",
    "Cleaned sensor and re-ran calibration routine.",
    "Escalated to maintenance team, temporary parameter adjustment applied.",
  ];
  const people = ["Somchai P.", "Nisa T.", "Anan K.", "Wipa S.", "Chai R.", "Kanya M."];

  const records = [];
  let counter = 0;
  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const d = new Date(now);
    d.setDate(now.getDate() - dayOffset);
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    // not every day has records — vary density
    const recordsToday = dayOffset % 4 === 0 ? 2 : (dayOffset % 3 === 0 ? 1 : (dayOffset % 7 === 0 ? 0 : 1));
    for (let j = 0; j < recordsToday; j++) {
      counter += 1;
      const machine = machines[(dayOffset * 3 + j) % machines.length];
      const hour = 6 + ((dayOffset * 5 + j * 7) % 16);
      const minute = (dayOffset * 11 + j * 13) % 60;
      const timeStr = `${pad(hour)}:${pad(minute)}`;
      const downtime = [0, 5, 10, 15, 20, 30, 45, 60, 90][(dayOffset + j) % 9];
      const downtimeStart = timeStr;
      const dtEndTotalMin = hour * 60 + minute + downtime;
      const downtimeEnd = `${pad(Math.floor(dtEndTotalMin / 60) % 24)}:${pad(dtEndTotalMin % 60)}`;
      const result = RESULTS[(dayOffset + j * 2) % RESULTS.length];
      const category = CATEGORIES[(dayOffset + j) % CATEGORIES.length];
      const param = PARAMETER_SUGGESTIONS[(dayOffset + j) % PARAMETER_SUGGESTIONS.length];
      const numPrefix = `ADJ-${toDateStr(d)}-`;
      const sameDayCount = records.filter((r) => r.recordId.startsWith(numPrefix)).length;
      records.push({
        id: `r-${counter}`,
        recordId: `${numPrefix}${pad(sameDayCount + 1, 3)}`,
        adjustmentDate: dateStr,
        machineId: machine.machineId,
        machineName: machine.machineName,
        productionLine: machine.productionLine,
        category,
        problemReason: problems[(dayOffset + j) % problems.length],
        parameterName: param,
        beforeAdjustment: `${20 + ((dayOffset + j) % 40)}`,
        afterAdjustment: `${22 + ((dayOffset + j) % 38)}`,
        adjustmentDetails: details[(dayOffset + j) % details.length],
        downtimeStart,
        downtimeEnd,
        downtimeMinutes: downtime,
        result,
        adjustedBy: people[(dayOffset + j) % people.length],
        verifiedBy: (dayOffset + j) % 3 === 0 ? people[(dayOffset + j + 2) % people.length] : "",
        remark: (dayOffset + j) % 5 === 0 ? "Follow-up check scheduled next shift." : "",
        createdAt: d.toISOString(),
        updatedAt: d.toISOString(),
      });
    }
  }
  return records;
}

/* ============================================================
   SMALL SHARED UI PRIMITIVES
   ============================================================ */

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function Badge({ children, tone, dark }) {
  const map = tone === "status" ? (dark ? STATUS_STYLES_DARK : STATUS_STYLES) : (dark ? RESULT_STYLES_DARK : RESULT_STYLES);
  const cls = map[children] || (dark ? "bg-slate-500/10 text-slate-300 ring-slate-500/30" : "bg-slate-100 text-slate-600 ring-slate-500/20");
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset whitespace-nowrap", cls)}>
      {children}
    </span>
  );
}

function Card({ children, className, dark }) {
  return (
    <div className={cx(
      "rounded-xl border shadow-sm",
      dark ? "bg-slate-900/85 backdrop-blur-md border-slate-700/80" : "bg-white/90 backdrop-blur-md border-slate-200/90",
      className
    )}>
      {children}
    </div>
  );
}

function SectionTitle({ title, subtitle, dark }) {
  return (
    <div className="mb-4">
      <h3 className={cx("text-sm font-semibold uppercase tracking-wide", dark ? "text-slate-300" : "text-slate-500")}>{title}</h3>
      {subtitle && <p className={cx("text-xs mt-0.5", dark ? "text-slate-500" : "text-slate-400")}>{subtitle}</p>}
    </div>
  );
}

function EmptyState({ icon: Icon, title, subtitle, dark }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className={cx("rounded-full p-3 mb-3", dark ? "bg-slate-700" : "bg-slate-100")}>
        <Icon className={cx("w-6 h-6", dark ? "text-slate-400" : "text-slate-400")} />
      </div>
      <p className={cx("text-sm font-medium", dark ? "text-slate-300" : "text-slate-600")}>{title}</p>
      {subtitle && <p className={cx("text-xs mt-1 max-w-xs", dark ? "text-slate-500" : "text-slate-400")}>{subtitle}</p>}
    </div>
  );
}

function LoadingRows({ dark }) {
  return (
    <div className="p-6 space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className={cx("h-4 rounded animate-pulse", dark ? "bg-slate-700" : "bg-slate-200")} style={{ width: `${80 - i * 10}%` }} />
      ))}
    </div>
  );
}

function LoadingOverlay({ message = "กำลังดำเนินการ...", dark }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div className={cx(
        "absolute inset-0 backdrop-blur-sm",
        dark ? "bg-slate-950/70" : "bg-slate-900/40"
      )} />
      {/* Dialog */}
      <div className={cx(
        "relative z-10 flex flex-col items-center gap-4 px-10 py-8 rounded-2xl shadow-2xl border",
        dark
          ? "bg-slate-800 border-slate-700 text-slate-100"
          : "bg-white border-slate-200 text-slate-800"
      )}>
        {/* Spinner */}
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 rounded-full border-4 border-blue-500/20" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 animate-spin" />
        </div>
        {/* Message */}
        <p className="text-sm font-medium tracking-wide">{message}</p>
        {/* Animated dots */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}


function Toast({ toast, dark }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className="fixed bottom-5 right-5 z-[100] animate-[fadeIn_0.2s_ease-out]">
      <div className={cx(
        "flex items-center gap-2.5 rounded-lg px-4 py-3 shadow-lg ring-1 text-sm font-medium",
        isError
          ? (dark ? "bg-rose-500/10 text-rose-300 ring-rose-500/30" : "bg-rose-50 text-rose-700 ring-rose-200")
          : (dark ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30" : "bg-emerald-50 text-emerald-700 ring-emerald-200")
      )}>
        {isError ? <XCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
        {toast.message}
      </div>
    </div>
  );
}

function ConfirmDialog({ open, title, message, onCancel, onConfirm, dark, confirmLabel = "Delete", danger = true }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40" onClick={onCancel}>
      <div
        className={cx("w-full max-w-sm rounded-xl p-5 shadow-xl", dark ? "bg-slate-800 text-slate-100" : "bg-white text-slate-900")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className={cx("rounded-full p-2 shrink-0", danger ? (dark ? "bg-rose-500/10" : "bg-rose-50") : (dark ? "bg-amber-500/10" : "bg-amber-50"))}>
            <AlertTriangle className={cx("w-5 h-5", danger ? (dark ? "text-rose-400" : "text-rose-600") : (dark ? "text-amber-400" : "text-amber-600"))} />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-sm">{title}</h4>
            <p className={cx("text-sm mt-1", dark ? "text-slate-400" : "text-slate-500")}>{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            className={cx("px-3 py-1.5 rounded-lg text-sm font-medium border", dark ? "border-slate-600 text-slate-200 hover:bg-slate-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={cx(
              "px-3 py-1.5 rounded-lg text-sm font-medium text-white",
              danger ? "bg-rose-600 hover:bg-rose-700" : "bg-blue-600 hover:bg-blue-700"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, thai, required, children, error, dark }) {
  return (
    <label className="block">
      <span className={cx("text-sm font-medium", dark ? "text-slate-200" : "text-slate-700")}>
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {thai && <span className={cx("block text-xs mt-0.5", dark ? "text-slate-500" : "text-slate-400")}>{thai}</span>}
      <div className="mt-1.5">{children}</div>
      {error && <span className="text-xs text-rose-500 mt-1 block">{error}</span>}
    </label>
  );
}

function baseInputCls(dark, hasError) {
  return cx(
    "w-full rounded-lg px-3 py-2 text-sm border outline-none transition-colors",
    dark ? "bg-slate-900 text-slate-100 placeholder:text-slate-500" : "bg-white text-slate-900 placeholder:text-slate-400",
    hasError
      ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
      : dark
        ? "border-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        : "border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
  );
}

/* Searchable dropdown for machine selection */
function SearchableSelect({ value, onChange, options, placeholder, dark, hasError, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className={cx("relative", open ? "z-50" : "z-10")} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cx(baseInputCls(dark, hasError), "flex items-center justify-between text-left", disabled && "opacity-50 cursor-not-allowed")}
      >
        <span className={value ? "" : dark ? "text-slate-500" : "text-slate-400"}>
          {value ? options.find((o) => o.value === value)?.label || value : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
      </button>
      {open && !disabled && (
        <div className={cx(
          "absolute z-50 mt-1 w-full rounded-lg border shadow-2xl max-h-60 overflow-auto",
          dark ? "bg-slate-800 border-slate-600 shadow-black/80" : "bg-white border-slate-200 shadow-slate-900/20"
        )}>
          <div className="p-2 sticky top-0 bg-inherit border-b border-inherit">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 opacity-50" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search machine..."
                className={cx("w-full pl-7 pr-2 py-1.5 rounded-md text-sm border outline-none", dark ? "bg-slate-900 border-slate-600 text-slate-100" : "bg-slate-50 border-slate-200")}
              />
            </div>
          </div>
          {filtered.length === 0 && (
            <div className={cx("px-3 py-2 text-sm", dark ? "text-slate-500" : "text-slate-400")}>No machines found</div>
          )}
          {filtered.map((o) => (
            <button
              type="button"
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); setQuery(""); }}
              className={cx(
                "w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors",
                dark ? "hover:bg-slate-700 text-slate-100" : "text-slate-700",
                value === o.value && (dark ? "bg-slate-700" : "bg-blue-50")
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   DATE RANGE PICKER (single calendar, click start then end)
   ============================================================ */

function toIsoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getCalendarCells(year, month) {
  const firstDayOfMonth = new Date(year, month, 1);
  const startWeekday = (firstDayOfMonth.getDay() + 6) % 7; // Monday = 0 ... Sunday = 6
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    cells.push({ date: d, iso: toIsoDate(d), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    cells.push({ date: d, iso: toIsoDate(d), inMonth: true });
  }
  while (cells.length < 42) {
    const prev = cells[cells.length - 1].date;
    const d = new Date(prev); d.setDate(d.getDate() + 1);
    cells.push({ date: d, iso: toIsoDate(d), inMonth: false });
  }
  return cells;
}

function DateRangePicker({ startDate, endDate, onChange, dark, placeholder = "Select date range" }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const base = endDate || startDate ? new Date((endDate || startDate) + "T00:00:00") : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  const [hoverIso, setHoverIso] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function openPicker() {
    const base = endDate || startDate ? new Date((endDate || startDate) + "T00:00:00") : new Date();
    setView({ year: base.getFullYear(), month: base.getMonth() });
    setHoverIso(null);
    setOpen(true);
  }

  function handleDayClick(iso) {
    if (!startDate || endDate) {
      onChange({ startDate: iso, endDate: "" });
      return;
    }
    if (iso < startDate) onChange({ startDate: iso, endDate: startDate });
    else onChange({ startDate, endDate: iso });
    setOpen(false);
  }

  function shiftMonth(delta) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function applyPreset(preset) {
    const today = new Date();
    if (preset === "today") {
      const iso = toIsoDate(today);
      onChange({ startDate: iso, endDate: iso });
    } else if (preset === "last7") {
      const start = new Date(today); start.setDate(today.getDate() - 6);
      onChange({ startDate: toIsoDate(start), endDate: toIsoDate(today) });
    } else if (preset === "thisMonth") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      onChange({ startDate: toIsoDate(start), endDate: toIsoDate(end) });
    }
    setOpen(false);
  }

  const cells = getCalendarCells(view.year, view.month);
  const previewing = Boolean(startDate) && !endDate && Boolean(hoverIso);
  const rangeStart = previewing ? (hoverIso < startDate ? hoverIso : startDate) : startDate;
  const rangeEnd = previewing ? (hoverIso < startDate ? startDate : hoverIso) : endDate;

  const label = startDate
    ? endDate ? `${formatDate(startDate)} – ${formatDate(endDate)}` : `${formatDate(startDate)} – …`
    : placeholder;

  const weekdayLabels = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const presetBtnCls = cx("text-[11px] px-2 py-1 rounded-md border", dark ? "border-slate-600 text-slate-300 hover:bg-slate-700" : "border-slate-200 text-slate-500 hover:bg-slate-50");

  return (
    <div className={cx("relative", open ? "z-50" : "z-10")} ref={ref}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={cx(baseInputCls(dark), "flex items-center gap-2 text-left")}
      >
        <Calendar className="w-4 h-4 shrink-0 opacity-60" />
        <span className={cx("truncate", !startDate && (dark ? "text-slate-500" : "text-slate-400"))}>{label}</span>
      </button>

      {open && (
        <div
          className={cx("absolute z-50 mt-1 rounded-xl border shadow-2xl p-3 w-[300px]", dark ? "bg-slate-800 border-slate-600 shadow-black/80" : "bg-white border-slate-200 shadow-slate-900/20")}
          onMouseLeave={() => setHoverIso(null)}
        >
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => shiftMonth(-1)} className={cx("p-1 rounded-md", dark ? "hover:bg-slate-700" : "hover:bg-slate-100")}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className={cx("text-sm font-semibold", dark ? "text-slate-100" : "text-slate-700")}>{monthLabel}</span>
            <button type="button" onClick={() => shiftMonth(1)} className={cx("p-1 rounded-md", dark ? "hover:bg-slate-700" : "hover:bg-slate-100")}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-1 text-center">
            {weekdayLabels.map((w) => (
              <span key={w} className={cx("text-[11px] font-medium py-1", dark ? "text-slate-500" : "text-slate-400")}>{w}</span>
            ))}
            {cells.map(({ iso, inMonth }) => {
              const isStart = iso === rangeStart;
              const isEnd = iso === rangeEnd;
              const isEndpoint = isStart || isEnd;
              const inRange = Boolean(rangeStart) && Boolean(rangeEnd) && iso > rangeStart && iso < rangeEnd;
              return (
                <button
                  type="button"
                  key={iso}
                  onMouseEnter={() => setHoverIso(iso)}
                  onClick={() => handleDayClick(iso)}
                  className={cx(
                    "text-xs h-8 w-full flex items-center justify-center transition-colors rounded-full",
                    !inMonth && (dark ? "text-slate-600" : "text-slate-300"),
                    isEndpoint && "bg-blue-600 text-white font-semibold",
                    !isEndpoint && inRange && (dark ? "bg-blue-500/20 text-blue-200" : "bg-blue-50 text-blue-700"),
                    !isEndpoint && !inRange && (dark ? "hover:bg-slate-700" : "hover:bg-slate-100")
                  )}
                >
                  {new Date(iso + "T00:00:00").getDate()}
                </button>
              );
            })}
          </div>

          <div className={cx("flex items-center justify-between gap-2 mt-3 pt-3 border-t", dark ? "border-slate-700" : "border-slate-100")}>
            <div className="flex gap-1">
              <button type="button" onClick={() => applyPreset("today")} className={presetBtnCls}>Today</button>
              <button type="button" onClick={() => applyPreset("last7")} className={presetBtnCls}>Last 7d</button>
              <button type="button" onClick={() => applyPreset("thisMonth")} className={presetBtnCls}>This Month</button>
            </div>
            <button type="button" onClick={() => onChange({ startDate: "", endDate: "" })} className={cx("text-[11px] font-medium", dark ? "text-rose-400 hover:text-rose-300" : "text-rose-600 hover:text-rose-700")}>
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   SUMMARY CARDS
   ============================================================ */

function SummaryCards({ stats, dark }) {
  const items = [
    { label: "Total Adjustments", thai: "จำนวนรายการปรับตั้งทั้งหมด", value: stats.total, icon: Wrench, color: "blue" },
    { label: "Machines Adjusted", thai: "จำนวนเครื่องจักรที่มีการปรับตั้ง", value: stats.machinesAdjusted, icon: Factory, color: "violet" },
    { label: "Total Downtime", thai: "เวลาหยุดเครื่องรวม", value: minutesToHM(stats.totalDowntime), icon: Clock, color: "amber" },
    { label: "Most Adjusted Machine", thai: "เครื่องที่ปรับตั้งมากที่สุด", value: stats.mostAdjusted || "-", icon: Gauge, color: "rose", small: true },
  ];
  const colorMap = {
    blue: dark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600",
    violet: dark ? "bg-violet-500/10 text-violet-400" : "bg-violet-50 text-violet-600",
    amber: dark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600",
    rose: dark ? "bg-rose-500/10 text-rose-400" : "bg-rose-50 text-rose-600",
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {items.map((it) => (
        <Card key={it.label} dark={dark} className="p-4">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className={cx("text-xs font-medium", dark ? "text-slate-400" : "text-slate-500")}>{it.label}</p>
              <p className={cx("text-[11px]", dark ? "text-slate-500" : "text-slate-400")}>{it.thai}</p>
              <p className={cx("mt-2 font-semibold text-slate-900", dark && "text-white", it.small ? "text-base truncate" : "text-2xl")} title={String(it.value)}>
                {it.value}
              </p>
            </div>
            <div className={cx("rounded-lg p-2 shrink-0", colorMap[it.color])}>
              <it.icon className="w-5 h-5" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ============================================================
   DASHBOARD FILTERS
   ============================================================ */

function DashboardFilters({ filters, setFilters, machines, dark }) {
  const weekOptions = useMemo(() => buildIsoWeekOptions(20, 1), []);
  return (
    <Card dark={dark} className="p-4 overflow-visible relative z-20">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className={cx("text-xs font-medium block mb-1", dark ? "text-slate-400" : "text-slate-500")}>Period</label>
          <div className={cx("inline-flex rounded-lg border p-0.5", dark ? "border-slate-600 bg-slate-900" : "border-slate-200 bg-slate-50")}>
            {["day", "week", "month"].map((p) => (
              <button
                key={p}
                onClick={() => setFilters((f) => ({ ...f, period: p }))}
                className={cx(
                  "px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors",
                  filters.period === p
                    ? "bg-blue-600 text-white shadow-sm"
                    : dark ? "text-slate-300 hover:bg-slate-800" : "text-slate-500 hover:bg-white"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        {filters.period === "week" && (
          <div className="min-w-[220px]">
            <label className={cx("text-xs font-medium block mb-1", dark ? "text-slate-400" : "text-slate-500")}>ISO Week</label>
            <select
              value={filters.isoWeek}
              onChange={(e) => setFilters((f) => ({ ...f, isoWeek: e.target.value }))}
              className={baseInputCls(dark)}
            >
              {weekOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}{o.isCurrent ? " (current)" : ""}</option>
              ))}
            </select>
          </div>
        )}
        <div className="min-w-[180px]">
          <label className={cx("text-xs font-medium block mb-1", dark ? "text-slate-400" : "text-slate-500")}>Machine</label>
          <select
            value={filters.machine}
            onChange={(e) => setFilters((f) => ({ ...f, machine: e.target.value }))}
            className={baseInputCls(dark)}
          >
            <option value="all">All Machines</option>
            {machines.map((m) => <option key={m.id} value={m.machineName}>{m.machineName}</option>)}
          </select>
        </div>
        <div>
          <label className={cx("text-xs font-medium block mb-1", dark ? "text-slate-400" : "text-slate-500")}>Date Range</label>
          <DateRangePicker
            startDate={filters.startDate}
            endDate={filters.endDate}
            onChange={({ startDate, endDate }) => setFilters((f) => ({ ...f, startDate, endDate }))}
            dark={dark}
          />
          <span className={cx("text-[11px] block mt-0.5", dark ? "text-slate-500" : "text-slate-400")}>Overrides period above</span>
        </div>
        {(filters.machine !== "all" || filters.startDate || filters.endDate) && (
          <button
            onClick={() => setFilters((f) => ({ ...f, machine: "all", startDate: "", endDate: "" }))}
            className={cx("text-xs font-medium px-3 py-2 rounded-lg border", dark ? "border-slate-600 text-slate-300 hover:bg-slate-700" : "border-slate-200 text-slate-500 hover:bg-slate-50")}
          >
            Clear
          </button>
        )}
      </div>
    </Card>
  );
}

/* ============================================================
   CHARTS
   ============================================================ */

function ChartCard({ title, thai, children, dark, isEmpty }) {
  return (
    <Card dark={dark} className="p-4">
      <SectionTitle title={title} subtitle={thai} dark={dark} />
      {isEmpty ? (
        <EmptyState icon={Gauge} title="No data for this period" subtitle="Try widening the date range or choosing a different filter." dark={dark} />
      ) : (
        <div className="h-64">{children}</div>
      )}
    </Card>
  );
}

const axisColor = (dark) => (dark ? "#94a3b8" : "#64748b");
const gridColor = (dark) => (dark ? "#334155" : "#e2e8f0");

/** Custom tooltip for the trend charts — breaks the bucket down by machine. */
function MachineBreakdownTooltip({ active, payload, label, dark, metric }) {
  if (!active || !payload || !payload.length) return null;
  const bucket = payload[0].payload;
  const machineEntries = Object.entries(bucket.machines || {}).sort((a, b) => b[1].count - a[1].count);

  return (
    <div
      className={cx(
        "rounded-lg shadow-lg text-xs px-3 py-2.5 min-w-[190px]",
        dark ? "bg-slate-800 border border-slate-600 text-slate-100" : "bg-white border border-slate-200 text-slate-700"
      )}
    >
      <p className="font-semibold mb-1.5">{label}</p>
      {machineEntries.length === 0 ? (
        <p className={dark ? "text-slate-400" : "text-slate-400"}>No adjustments</p>
      ) : (
        <div className="space-y-1">
          {machineEntries.map(([name, info]) => (
            <div key={name} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{name}</p>
                {info.line && <p className={cx("text-[10px]", dark ? "text-slate-500" : "text-slate-400")}>{info.line}</p>}
              </div>
              <span className={cx("shrink-0 font-semibold", dark ? "text-blue-400" : "text-blue-600")}>
                {metric === "downtime" ? `${info.downtime}m` : info.count}
              </span>
            </div>
          ))}
          <div className={cx("mt-1.5 pt-1.5 border-t flex justify-between font-semibold", dark ? "border-slate-700" : "border-slate-100")}>
            <span>Total</span>
            <span>{metric === "downtime" ? `${bucket.downtime}m` : bucket.count}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function AdjustmentTrendChart({ buckets, dark }) {
  const empty = buckets.every((b) => b.count === 0);
  return (
    <ChartCard title="Adjustment Trend" thai="แนวโน้มการปรับตั้งเครื่อง" dark={dark} isEmpty={empty}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor(dark)} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor(dark) }} axisLine={{ stroke: gridColor(dark) }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: axisColor(dark) }} axisLine={false} tickLine={false} />
          <Tooltip content={<MachineBreakdownTooltip dark={dark} metric="count" />} cursor={{ fill: dark ? "#33415580" : "#f1f5f980" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="count" name="Adjustments" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function DowntimeTrendChart({ buckets, dark }) {
  const empty = buckets.every((b) => b.downtime === 0);
  return (
    <ChartCard title="Downtime Trend" thai="แนวโน้มเวลาหยุดเครื่อง (นาที)" dark={dark} isEmpty={empty}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={buckets} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor(dark)} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor(dark) }} axisLine={{ stroke: gridColor(dark) }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: axisColor(dark) }} axisLine={false} tickLine={false} />
          <Tooltip content={<MachineBreakdownTooltip dark={dark} metric="downtime" />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="downtime" name="Downtime (min)" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function ByMachineChart({ records, dark }) {
  const counts = {};
  records.forEach((r) => { counts[r.machineName] = (counts[r.machineName] || 0) + 1; });
  const data = Object.entries(counts)
    .map(([machineName, count]) => ({ machineName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  return (
    <ChartCard title="Adjustments by Machine" thai="จำนวนการปรับตั้งแยกตามเครื่อง (Top 5)" dark={dark} isEmpty={data.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor(dark)} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: axisColor(dark) }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="machineName" width={110} tick={{ fontSize: 11, fill: axisColor(dark) }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: dark ? "#1e293b" : "#fff", border: `1px solid ${gridColor(dark)}`, borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="count" name="Adjustments" fill="#6366f1" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function TopDowntimeByMachineChart({ records, dark }) {
  const downtimeMap = {};
  records.forEach((r) => {
    const mins = Number(r.downtimeMinutes) || 0;
    downtimeMap[r.machineName] = (downtimeMap[r.machineName] || 0) + mins;
  });
  const data = Object.entries(downtimeMap)
    .filter(([_, downtime]) => downtime > 0)
    .map(([machineName, downtime]) => ({ machineName, downtime }))
    .sort((a, b) => b.downtime - a.downtime)
    .slice(0, 5);

  return (
    <ChartCard title="Top 5 Downtime by Machine" thai="เวลาหยุดเครื่องสะสมแยกตามเครื่อง (Top 5)" dark={dark} isEmpty={data.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor(dark)} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: axisColor(dark) }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="machineName" width={110} tick={{ fontSize: 11, fill: axisColor(dark) }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(value) => [`${value} mins (${minutesToHM(value)})`, "Total Downtime"]}
            contentStyle={{ background: dark ? "#1e293b" : "#fff", border: `1px solid ${gridColor(dark)}`, borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="downtime" name="Downtime (min)" fill="#f59e0b" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function ResultDonutChart({ records, dark }) {
  const data = RESULTS.map((res) => ({ name: res, value: records.filter((r) => r.result === res).length })).filter((d) => d.value > 0);
  return (
    <ChartCard title="Adjustment Result" thai="สัดส่วนผลลัพธ์การปรับตั้ง" dark={dark} isEmpty={data.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
            {data.map((d) => <Cell key={d.name} fill={DONUT_COLORS[d.name]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: dark ? "#1e293b" : "#fff", border: `1px solid ${gridColor(dark)}`, borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ============================================================
   DOWNTIME BY LINE
   ============================================================ */

const DOWNTIME_TARGET_ORANGE = 5;   // > 5%  → orange
const DOWNTIME_TARGET_RED = 10;     // > 10% → red
const SHIFT_HOURS_PER_DAY = 24;     // factory runs 24 hours per day

function getLineDowntimeData(records, startDate, endDate) {
  // Count how many distinct days are in the range
  let dayCount = 1;
  if (startDate && endDate) {
    const s = new Date(startDate + "T00:00:00");
    const e = new Date(endDate + "T00:00:00");
    dayCount = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
  }
  const totalPossibleMinutes = dayCount * SHIFT_HOURS_PER_DAY * 60;

  return LINES.map((line) => {
    const lineRecords = records.filter((r) => r.productionLine === line);
    const totalDowntime = lineRecords.reduce((sum, r) => sum + (Number(r.downtimeMinutes) || 0), 0);
    const rate = totalPossibleMinutes > 0 ? (totalDowntime / totalPossibleMinutes) * 100 : 0;
    const rateRounded = Math.round(rate * 10) / 10;
    const color = rateRounded > DOWNTIME_TARGET_RED ? "#ef4444"
      : rateRounded > DOWNTIME_TARGET_ORANGE ? "#f97316"
      : "#22c55e";
    const colorClass = rateRounded > DOWNTIME_TARGET_RED
      ? { bg: "bg-red-50 dark:bg-red-500/10", text: "text-red-600", badge: "bg-red-100 text-red-700", bar: "bg-red-500" }
      : rateRounded > DOWNTIME_TARGET_ORANGE
      ? { bg: "bg-orange-50 dark:bg-orange-500/10", text: "text-orange-600", badge: "bg-orange-100 text-orange-700", bar: "bg-orange-500" }
      : { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600", badge: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" };
    return { line, totalDowntime, rate: rateRounded, color, colorClass, count: lineRecords.length };
  });
}

function DowntimeByLineSection({ records, filters, dark }) {
  const lineData = useMemo(
    () => getLineDowntimeData(records, filters.startDate, filters.endDate),
    [records, filters.startDate, filters.endDate]
  );

  const hasAnyData = lineData.some((d) => d.totalDowntime > 0);

  // Custom bar colors for recharts
  const barData = lineData.map((d) => ({ ...d, fill: d.color }));

  return (
    <div className="space-y-4">
      {/* Summary Cards per Line */}
      <Card dark={dark} className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className={cx("text-sm font-semibold", dark ? "text-slate-100" : "text-slate-800")}>
              Downtime Rate by Line
            </p>
            <p className={cx("text-xs", dark ? "text-slate-400" : "text-slate-500")}>
              อัตราหยุดเครื่องแยกตามสายการผลิต · Target: <span className="text-orange-500 font-medium">&gt;5% 🟠</span> · <span className="text-red-500 font-medium">&gt;10% 🔴</span>
            </p>
          </div>
          <div className={cx("text-xs px-2 py-1 rounded-md", dark ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500")}>
            Base: {SHIFT_HOURS_PER_DAY}h/day
          </div>
        </div>

        {/* Line cards grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {lineData.map((d) => {
            const isOver10 = d.rate > DOWNTIME_TARGET_RED;
            const isOver5 = d.rate > DOWNTIME_TARGET_ORANGE;
            const bgDark = isOver10
              ? "bg-red-500/10 border border-red-500/30"
              : isOver5
              ? "bg-orange-500/10 border border-orange-500/30"
              : "bg-emerald-500/10 border border-emerald-500/30";
            const bgLight = isOver10
              ? "bg-red-50 border border-red-200"
              : isOver5
              ? "bg-orange-50 border border-orange-200"
              : "bg-emerald-50 border border-emerald-200";
            const textDark = isOver10 ? "text-red-400" : isOver5 ? "text-orange-400" : "text-emerald-400";
            const textLight = isOver10 ? "text-red-600" : isOver5 ? "text-orange-600" : "text-emerald-700";
            const rateTextDark = isOver10 ? "text-red-300" : isOver5 ? "text-orange-300" : "text-emerald-300";
            const rateTextLight = isOver10 ? "text-red-700" : isOver5 ? "text-orange-700" : "text-emerald-800";

            return (
              <div
                key={d.line}
                className={cx(
                  "rounded-xl p-3 flex flex-col gap-1.5",
                  dark ? bgDark : bgLight
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cx("text-xs font-semibold truncate", dark ? textDark : textLight)}>
                    {d.line}
                  </span>
                  {isOver10 && <span className="text-base">🔴</span>}
                  {!isOver10 && isOver5 && <span className="text-base">🟠</span>}
                  {!isOver5 && <span className="text-base">🟢</span>}
                </div>
                <p className={cx("text-2xl font-bold leading-none", dark ? rateTextDark : rateTextLight)}>
                  {d.rate}%
                </p>
                <p className={cx("text-[11px]", dark ? "text-slate-400" : "text-slate-500")}>
                  {minutesToHM(d.totalDowntime)} downtime
                </p>
                <p className={cx("text-[11px]", dark ? "text-slate-500" : "text-slate-400")}>
                  {d.count} adjustment{d.count !== 1 ? "s" : ""}
                </p>
                {/* Mini progress bar */}
                <div className={cx("mt-0.5 h-1.5 rounded-full overflow-hidden", dark ? "bg-slate-700" : "bg-white/60")}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (d.rate / 20) * 100)}%`,
                      backgroundColor: d.color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Bar Chart comparison */}
      <Card dark={dark} className="p-4">
        <SectionTitle title="Downtime Rate Comparison" subtitle="เปรียบเทียบ Downtime Rate (%) แต่ละสายการผลิต" dark={dark} />
        {!hasAnyData ? (
          <EmptyState icon={Gauge} title="No downtime data for this period" subtitle="Try widening the date range or choosing a different filter." dark={dark} />
        ) : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor(dark)} vertical={false} />
                <XAxis dataKey="line" tick={{ fontSize: 12, fill: axisColor(dark) }} axisLine={{ stroke: gridColor(dark) }} tickLine={false} />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: axisColor(dark) }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                  domain={[0, (dataMax) => Math.max(dataMax + 2, 15)]}
                />
                <Tooltip
                  formatter={(value, name, props) => [
                    `${value}% (${minutesToHM(props.payload.totalDowntime)})`,
                    "Downtime Rate",
                  ]}
                  contentStyle={{
                    background: dark ? "#1e293b" : "#fff",
                    border: `1px solid ${gridColor(dark)}`,
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                {/* Target reference lines */}
                <ReferenceLine y={DOWNTIME_TARGET_ORANGE} stroke="#f97316" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: `${DOWNTIME_TARGET_ORANGE}%`, position: "insideTopRight", fontSize: 10, fill: "#f97316" }} />
                <ReferenceLine y={DOWNTIME_TARGET_RED} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: `${DOWNTIME_TARGET_RED}%`, position: "insideTopRight", fontSize: 10, fill: "#ef4444" }} />
                <Bar dataKey="rate" name="Downtime Rate (%)" radius={[4, 4, 0, 0]} isAnimationActive>
                  {barData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {/* Legend */}
        <div className="flex items-center gap-4 mt-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
            <span className={cx("text-xs", dark ? "text-slate-400" : "text-slate-500")}>≤{DOWNTIME_TARGET_ORANGE}% OK</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-orange-500 inline-block" />
            <span className={cx("text-xs", dark ? "text-slate-400" : "text-slate-500")}>&gt;{DOWNTIME_TARGET_ORANGE}% Warning</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-500 inline-block" />
            <span className={cx("text-xs", dark ? "text-slate-400" : "text-slate-500")}>&gt;{DOWNTIME_TARGET_RED}% Critical</span>
          </div>
          <span className={cx("text-[11px] ml-auto", dark ? "text-slate-500" : "text-slate-400")}>
            * Rate = Downtime ÷ ({SHIFT_HOURS_PER_DAY}h × days in range)
          </span>
        </div>
      </Card>
    </div>
  );
}

/* ============================================================
   DASHBOARD PAGE
   ============================================================ */

function DashboardPage({ records, machines, dark }) {
  const currentWeek = getISOWeekInfo(new Date());
  const [filters, setFilters] = useState({
    period: "week",
    machine: "all",
    startDate: "",
    endDate: "",
    isoWeek: isoWeekValue(currentWeek.year, currentWeek.week),
  });

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (filters.machine !== "all" && r.machineName !== filters.machine) return false;
      if (!isWithinRange(r.adjustmentDate, filters.startDate, filters.endDate)) return false;
      return true;
    });
  }, [records, filters]);

  // Resolved Monday-start date for whichever ISO week is selected in the dropdown.
  const selectedWeekStart = useMemo(() => {
    const { year, week } = parseIsoWeekValue(filters.isoWeek);
    return getISOWeekStart(year, week);
  }, [filters.isoWeek]);

  const periodScoped = useMemo(() => {
    if (filters.startDate || filters.endDate) return filtered; // explicit range wins
    const today = new Date();
    if (filters.period === "day") {
      const todayStr = nowDateStr();
      return filtered.filter((r) => r.adjustmentDate === todayStr);
    }
    if (filters.period === "week") {
      const ws = selectedWeekStart;
      const we = new Date(ws); we.setDate(ws.getDate() + 6);
      const wsStr = `${ws.getFullYear()}-${pad(ws.getMonth() + 1)}-${pad(ws.getDate())}`;
      const weStr = `${we.getFullYear()}-${pad(we.getMonth() + 1)}-${pad(we.getDate())}`;
      return filtered.filter((r) => r.adjustmentDate >= wsStr && r.adjustmentDate <= weStr);
    }
    const monthKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
    return filtered.filter((r) => r.adjustmentDate.startsWith(monthKey));
  }, [filtered, filters, selectedWeekStart]);

  const stats = useMemo(() => {
    const total = periodScoped.length;
    const machineSet = new Set(periodScoped.map((r) => r.machineName));
    const totalDowntime = periodScoped.reduce((sum, r) => sum + (Number(r.downtimeMinutes) || 0), 0);
    const counts = {};
    periodScoped.forEach((r) => { counts[r.machineName] = (counts[r.machineName] || 0) + 1; });
    const mostAdjusted = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    return { total, machinesAdjusted: machineSet.size, totalDowntime, mostAdjusted };
  }, [periodScoped]);

  const buckets = useMemo(() => {
    const today = new Date();
    const range = {
      refDay: nowDateStr(),
      weekStart: selectedWeekStart,
      monthKey: `${today.getFullYear()}-${pad(today.getMonth() + 1)}`,
    };
    return buildTrendBuckets(periodScoped, filters.period, range);
  }, [periodScoped, filters.period, selectedWeekStart]);

  return (
    <div className="space-y-5">
      <DashboardFilters filters={filters} setFilters={setFilters} machines={machines} dark={dark} />
      <SummaryCards stats={stats} dark={dark} />
      <DowntimeByLineSection records={periodScoped} filters={filters} dark={dark} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AdjustmentTrendChart buckets={buckets} dark={dark} />
        <DowntimeTrendChart buckets={buckets} dark={dark} />
        <ByMachineChart records={periodScoped} dark={dark} />
        <TopDowntimeByMachineChart records={periodScoped} dark={dark} />
        <div className="lg:col-span-2">
          <ResultDonutChart records={periodScoped} dark={dark} />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   NEW ADJUSTMENT FORM
   ============================================================ */

const emptyForm = () => ({
  adjustmentDate: nowDateStr(),
  machineId: "",
  machineName: "",
  productionLine: "",
  category: "",
  problemReason: "",
  parameterName: "",
  beforeAdjustment: "",
  afterAdjustment: "",
  adjustmentDetails: "",
  downtimeStart: "",
  downtimeEnd: "",
  result: "",
  adjustedBy: "",
  verifiedBy: "",
  remark: "",
});

function NewAdjustmentPage({ machines, records, lines = LINES, onSave, dark, showToast }) {
  const [form, setForm] = useState(emptyForm());
  const [errors, setErrors] = useState({});
  const activeMachines = machines.filter((m) => m.status === "Active");

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleMachineSelect(machineName) {
    const machine = machines.find((m) => m.machineName === machineName);
    setForm((f) => ({
      ...f,
      machineName,
      machineId: machine?.machineId || "",
      productionLine: machine?.productionLine || f.productionLine,
    }));
  }

  const computedDowntime = useMemo(
    () => computeDowntimeMinutes(form.downtimeStart, form.downtimeEnd),
    [form.downtimeStart, form.downtimeEnd]
  );
  const crossesMidnight = form.downtimeStart && form.downtimeEnd && form.downtimeEnd < form.downtimeStart;

  function validate() {
    const errs = {};
    if (!form.machineName) errs.machineName = "Please select a machine";
    if (!form.adjustmentDate) errs.adjustmentDate = "Date is required";
    if (!form.problemReason.trim()) errs.problemReason = "Problem / reason is required";
    if (!form.adjustedBy.trim()) errs.adjustedBy = "Adjusted by is required";
    if (!form.downtimeStart) errs.downtimeStart = "Downtime start is required";
    if (!form.downtimeEnd) errs.downtimeEnd = "Downtime end is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) {
      showToast("Please fix the highlighted fields before saving.", "error");
      return;
    }
    const record = {
      id: `r-${Date.now()}`,
      recordId: generateRecordId(records, form.adjustmentDate),
      ...form,
      downtimeMinutes: computeDowntimeMinutes(form.downtimeStart, form.downtimeEnd),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const success = await onSave(record);
    if (success !== false) {
      setForm(emptyForm());
      setErrors({});
    }
  }

  function handleClear() {
    setForm(emptyForm());
    setErrors({});
  }

  const machineOptions = activeMachines.map((m) => ({ value: m.machineName, label: `${m.machineName} · ${m.machineModel}` }));

  return (
    <div className="max-w-4xl space-y-5">
      <Card dark={dark} className="p-5 relative z-10">
        <SectionTitle title="Adjustment Timing" subtitle="เวลาในการปรับตั้งเครื่อง" dark={dark} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Adjustment Date" required error={errors.adjustmentDate} dark={dark}>
            <input type="date" value={form.adjustmentDate} onChange={(e) => update("adjustmentDate", e.target.value)} className={baseInputCls(dark, errors.adjustmentDate)} />
          </FormField>
        </div>
      </Card>

      <Card dark={dark} className="p-5 relative z-30">
        <SectionTitle title="Machine & Line" subtitle="เครื่องจักรและสายการผลิต" dark={dark} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Machine Name" required error={errors.machineName} dark={dark}>
            <SearchableSelect
              value={form.machineName}
              onChange={handleMachineSelect}
              options={machineOptions}
              placeholder="Select an active machine"
              dark={dark}
              hasError={errors.machineName}
            />
          </FormField>
          <FormField label="Production Line" dark={dark}>
            <select value={form.productionLine} onChange={(e) => update("productionLine", e.target.value)} className={baseInputCls(dark)}>
              <option value="">Select a line</option>
              {lines.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </FormField>
          <FormField label="Adjustment Category" dark={dark}>
            <select value={form.category} onChange={(e) => update("category", e.target.value)} className={baseInputCls(dark)}>
              <option value="">Select a category</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField label="Result" dark={dark}>
            <select value={form.result} onChange={(e) => update("result", e.target.value)} className={baseInputCls(dark)}>
              <option value="">Select a result</option>
              {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </FormField>
        </div>
      </Card>

      <Card dark={dark} className="p-5 relative z-20">
        <SectionTitle title="Problem & Adjustment Details" subtitle="ปัญหาและรายละเอียดการปรับตั้ง" dark={dark} />
        <div className="space-y-4">
          <FormField label="Problem / Reason for Adjustment" required error={errors.problemReason} dark={dark}>
            <textarea rows={2} value={form.problemReason} onChange={(e) => update("problemReason", e.target.value)} className={baseInputCls(dark, errors.problemReason)} placeholder="Describe the issue that triggered this adjustment" />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Parameter Name" dark={dark}>
              <select
                value={form.parameterName}
                onChange={(e) => update("parameterName", e.target.value)}
                className={baseInputCls(dark)}
              >
                <option value="">Select Parameter</option>
                {PARAMETER_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Before Adjustment" dark={dark}>
              <input value={form.beforeAdjustment} onChange={(e) => update("beforeAdjustment", e.target.value)} className={baseInputCls(dark)} placeholder="Value before" />
            </FormField>
            <FormField label="After Adjustment" dark={dark}>
              <input value={form.afterAdjustment} onChange={(e) => update("afterAdjustment", e.target.value)} className={baseInputCls(dark)} placeholder="Value after" />
            </FormField>
          </div>
          <FormField label="Adjustment Details" dark={dark}>
            <textarea rows={2} value={form.adjustmentDetails} onChange={(e) => update("adjustmentDetails", e.target.value)} className={baseInputCls(dark)} placeholder="What action was taken to resolve it" />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <FormField label="Downtime Start" required error={errors.downtimeStart} dark={dark}>
              <input type="time" value={form.downtimeStart} onChange={(e) => update("downtimeStart", e.target.value)} className={baseInputCls(dark, errors.downtimeStart)} />
            </FormField>
            <FormField label="Downtime End" required error={errors.downtimeEnd} dark={dark}>
              <input type="time" value={form.downtimeEnd} onChange={(e) => update("downtimeEnd", e.target.value)} className={baseInputCls(dark, errors.downtimeEnd)} />
            </FormField>
            <div className="pb-0.5">
              <span className={cx("text-sm font-medium", dark ? "text-slate-200" : "text-slate-700")}>Downtime</span>
              <div className={cx(
                "mt-1.5 rounded-lg px-3 py-2 text-sm font-semibold",
                dark ? "bg-slate-900 text-blue-400 border border-slate-600" : "bg-blue-50 text-blue-700 border border-blue-100"
              )}>
                {form.downtimeStart && form.downtimeEnd ? minutesToHM(computedDowntime) : "—"}
              </div>
              {crossesMidnight && (
                <span className={cx("text-[11px] block mt-1", dark ? "text-slate-500" : "text-slate-400")}>Assumed to roll past midnight</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card dark={dark} className="p-5 relative z-10">
        <SectionTitle title="Sign-off" subtitle="ผู้ดำเนินการและผู้ตรวจสอบ" dark={dark} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Adjusted By" required error={errors.adjustedBy} dark={dark}>
            <input value={form.adjustedBy} onChange={(e) => update("adjustedBy", e.target.value)} className={baseInputCls(dark, errors.adjustedBy)} placeholder="Your name" />
          </FormField>
          <FormField label="Verified By" dark={dark}>
            <input value={form.verifiedBy} onChange={(e) => update("verifiedBy", e.target.value)} className={baseInputCls(dark)} placeholder="Optional" />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Remark" dark={dark}>
              <textarea rows={2} value={form.remark} onChange={(e) => update("remark", e.target.value)} className={baseInputCls(dark)} placeholder="Optional notes" />
            </FormField>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3 pb-4">
        <button onClick={handleSave} className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">
          Save Adjustment
        </button>
        <button onClick={handleClear} className={cx("px-5 py-2.5 rounded-lg text-sm font-semibold border", dark ? "border-slate-600 text-slate-200 hover:bg-slate-800" : "border-slate-300 text-slate-600 hover:bg-slate-50")}>
          Clear Form
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   VIEW / EDIT DRAWER
   ============================================================ */

function RecordDrawer({ record, mode, machines, lines = LINES, onClose, onSaveEdit, dark }) {
  const [form, setForm] = useState(record);
  useEffect(() => setForm(record), [record]);
  if (!record) return null;
  const isView = mode === "view";
  const activeMachines = machines.filter((m) => m.status === "Active" || m.machineName === record.machineName);
  const machineOptions = activeMachines.map((m) => ({ value: m.machineName, label: m.machineName }));

  function update(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  function handleSave() {
    onSaveEdit({ ...form, downtimeMinutes: computeDowntimeMinutes(form.downtimeStart, form.downtimeEnd), updatedAt: new Date().toISOString() });
  }

  const fieldRow = (label, value) => (
    <div className="flex justify-between gap-4 py-2 border-b border-dashed last:border-0" style={{ borderColor: dark ? "#334155" : "#e2e8f0" }}>
      <span className={cx("text-xs font-medium shrink-0", dark ? "text-slate-400" : "text-slate-500")}>{label}</span>
      <span className={cx("text-sm text-right", dark ? "text-slate-100" : "text-slate-800")}>{value || "-"}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/40" onClick={onClose}>
      <div
        className={cx("w-full sm:max-w-md h-full overflow-y-auto shadow-2xl", dark ? "bg-slate-800 text-slate-100" : "bg-white text-slate-900")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={cx("sticky top-0 flex items-center justify-between px-5 py-4 border-b", dark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200")}>
          <div>
            <h3 className="font-semibold">{isView ? "Adjustment Details" : "Edit Adjustment"}</h3>
            <p className={cx("text-xs", dark ? "text-slate-400" : "text-slate-500")}>{record.recordId}</p>
          </div>
          <button onClick={onClose} className={cx("p-1.5 rounded-lg", dark ? "hover:bg-slate-700" : "hover:bg-slate-100")}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {isView ? (
          <div className="p-5">
            {fieldRow("Date", formatDate(record.adjustmentDate))}
            {fieldRow("Machine", record.machineName)}
            {fieldRow("Production Line", record.productionLine)}
            {fieldRow("Category", record.category)}
            {fieldRow("Problem / Reason", record.problemReason)}
            {fieldRow("Parameter", record.parameterName)}
            {fieldRow("Before", record.beforeAdjustment)}
            {fieldRow("After", record.afterAdjustment)}
            {fieldRow("Details", record.adjustmentDetails)}
            {fieldRow("Downtime Start", record.downtimeStart)}
            {fieldRow("Downtime End", record.downtimeEnd)}
            {fieldRow("Downtime", minutesToHM(record.downtimeMinutes))}
            <div className="flex justify-between items-center gap-4 py-2">
              <span className={cx("text-xs font-medium", dark ? "text-slate-400" : "text-slate-500")}>Result</span>
              <Badge dark={dark}>{record.result || "-"}</Badge>
            </div>
            {fieldRow("Adjusted By", record.adjustedBy)}
            {fieldRow("Verified By", record.verifiedBy)}
            {fieldRow("Remark", record.remark)}
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <FormField label="Date" dark={dark}><input type="date" value={form.adjustmentDate} onChange={(e) => update("adjustmentDate", e.target.value)} className={baseInputCls(dark)} /></FormField>
            <FormField label="Machine Name" dark={dark}>
              <SearchableSelect value={form.machineName} onChange={(v) => update("machineName", v)} options={machineOptions} placeholder="Select machine" dark={dark} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Production Line" dark={dark}>
                <select value={form.productionLine} onChange={(e) => update("productionLine", e.target.value)} className={baseInputCls(dark)}>
                  {lines.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </FormField>
              <FormField label="Category" dark={dark}>
                <select value={form.category} onChange={(e) => update("category", e.target.value)} className={baseInputCls(dark)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </FormField>
            </div>
            <FormField label="Problem / Reason" dark={dark}>
              <textarea rows={2} value={form.problemReason} onChange={(e) => update("problemReason", e.target.value)} className={baseInputCls(dark)} />
            </FormField>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Parameter" dark={dark}>
                <select
                  value={form.parameterName}
                  onChange={(e) => update("parameterName", e.target.value)}
                  className={baseInputCls(dark)}
                >
                  <option value="">Select Parameter</option>
                  {Array.from(new Set([...PARAMETER_OPTIONS, form.parameterName].filter(Boolean))).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Before" dark={dark}><input value={form.beforeAdjustment} onChange={(e) => update("beforeAdjustment", e.target.value)} className={baseInputCls(dark)} /></FormField>
              <FormField label="After" dark={dark}><input value={form.afterAdjustment} onChange={(e) => update("afterAdjustment", e.target.value)} className={baseInputCls(dark)} /></FormField>
            </div>
            <FormField label="Adjustment Details" dark={dark}>
              <textarea rows={2} value={form.adjustmentDetails} onChange={(e) => update("adjustmentDetails", e.target.value)} className={baseInputCls(dark)} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Downtime Start" dark={dark}><input type="time" value={form.downtimeStart} onChange={(e) => update("downtimeStart", e.target.value)} className={baseInputCls(dark)} /></FormField>
              <FormField label="Downtime End" dark={dark}><input type="time" value={form.downtimeEnd} onChange={(e) => update("downtimeEnd", e.target.value)} className={baseInputCls(dark)} /></FormField>
            </div>
            <div className="flex items-center justify-between">
              <span className={cx("text-xs font-medium", dark ? "text-slate-400" : "text-slate-500")}>Computed downtime</span>
              <span className={cx("text-sm font-semibold", dark ? "text-blue-400" : "text-blue-600")}>
                {minutesToHM(computeDowntimeMinutes(form.downtimeStart, form.downtimeEnd))}
              </span>
            </div>
            <FormField label="Result" dark={dark}>
              <select value={form.result} onChange={(e) => update("result", e.target.value)} className={baseInputCls(dark)}>
                {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Adjusted By" dark={dark}><input value={form.adjustedBy} onChange={(e) => update("adjustedBy", e.target.value)} className={baseInputCls(dark)} /></FormField>
              <FormField label="Verified By" dark={dark}><input value={form.verifiedBy} onChange={(e) => update("verifiedBy", e.target.value)} className={baseInputCls(dark)} /></FormField>
            </div>
            <FormField label="Remark" dark={dark}><textarea rows={2} value={form.remark} onChange={(e) => update("remark", e.target.value)} className={baseInputCls(dark)} /></FormField>

            <div className="flex gap-2 pt-2">
              <button onClick={handleSave} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">Save Changes</button>
              <button onClick={onClose} className={cx("px-4 py-2 rounded-lg text-sm font-semibold border", dark ? "border-slate-600 text-slate-200" : "border-slate-300 text-slate-600")}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   ADJUSTMENT HISTORY PAGE
   ============================================================ */

function AdjustmentHistoryPage({ records, machines, lines = LINES, onUpdate, onDelete, dark, showToast }) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ machine: "all", line: "all", category: "all", result: "all", startDate: "", endDate: "" });
  const [sortBy, setSortBy] = useState("newest");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState(null); // { record, mode }
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let list = records.filter((r) => {
      if (filters.machine !== "all" && r.machineName !== filters.machine) return false;
      if (filters.line !== "all" && r.productionLine !== filters.line) return false;
      if (filters.category !== "all" && r.category !== filters.category) return false;
      if (filters.result !== "all" && r.result !== filters.result) return false;
      if (!isWithinRange(r.adjustmentDate, filters.startDate, filters.endDate)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${r.machineName} ${r.problemReason} ${r.adjustedBy} ${r.recordId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      const dtA = `${a.adjustmentDate}T${a.downtimeStart || "00:00"}`;
      const dtB = `${b.adjustmentDate}T${b.downtimeStart || "00:00"}`;
      if (sortBy === "newest") return dtB.localeCompare(dtA);
      if (sortBy === "oldest") return dtA.localeCompare(dtB);
      if (sortBy === "downtimeHigh") return b.downtimeMinutes - a.downtimeMinutes;
      if (sortBy === "downtimeLow") return a.downtimeMinutes - b.downtimeMinutes;
      return 0;
    });
    return list;
  }, [records, filters, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  useEffect(() => { setPage(1); }, [search, filters, sortBy, pageSize]);

  function clearFilters() {
    setFilters({ machine: "all", line: "all", category: "all", result: "all", startDate: "", endDate: "" });
    setSearch("");
  }

  function confirmDelete() {
    onDelete(deleteTarget.id);
    setDeleteTarget(null);
    showToast("Adjustment record deleted");
  }

  const selectCls = cx(baseInputCls(dark), "text-sm");

  return (
    <div className="space-y-4">
      <Card dark={dark} className="p-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search machine, reason, adjusted by, record ID..."
              className={cx(baseInputCls(dark), "pl-9")}
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={() => setShowFilters((s) => !s)}
              className={cx("flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border", dark ? "border-slate-600 text-slate-200 hover:bg-slate-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
            >
              <Filter className="w-3.5 h-3.5" /> Filters
            </button>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={selectCls}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="downtimeHigh">Highest Downtime</option>
              <option value="downtimeLow">Lowest Downtime</option>
            </select>
            <button onClick={() => exportCSV(filtered)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button onClick={clearFilters} className={cx("px-3 py-2 rounded-lg text-sm font-medium border", dark ? "border-slate-600 text-slate-300 hover:bg-slate-700" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
              Clear Filters
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 pt-4 border-t" style={{ borderColor: dark ? "#334155" : "#e2e8f0" }}>
            <div>
              <label className={cx("text-xs font-medium block mb-1", dark ? "text-slate-400" : "text-slate-500")}>Machine</label>
              <select value={filters.machine} onChange={(e) => setFilters((f) => ({ ...f, machine: e.target.value }))} className={selectCls}>
                <option value="all">All</option>
                {machines.map((m) => <option key={m.id} value={m.machineName}>{m.machineName}</option>)}
              </select>
            </div>
            <div>
              <label className={cx("text-xs font-medium block mb-1", dark ? "text-slate-400" : "text-slate-500")}>Production Line</label>
              <select value={filters.line} onChange={(e) => setFilters((f) => ({ ...f, line: e.target.value }))} className={selectCls}>
                <option value="all">All</option>
                {lines.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className={cx("text-xs font-medium block mb-1", dark ? "text-slate-400" : "text-slate-500")}>Category</label>
              <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} className={selectCls}>
                <option value="all">All</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={cx("text-xs font-medium block mb-1", dark ? "text-slate-400" : "text-slate-500")}>Result</label>
              <select value={filters.result} onChange={(e) => setFilters((f) => ({ ...f, result: e.target.value }))} className={selectCls}>
                <option value="all">All</option>
                {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={cx("text-xs font-medium block mb-1", dark ? "text-slate-400" : "text-slate-500")}>Start Date</label>
              <input type="date" value={filters.startDate} onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))} className={selectCls} />
            </div>
            <div>
              <label className={cx("text-xs font-medium block mb-1", dark ? "text-slate-400" : "text-slate-500")}>End Date</label>
              <input type="date" value={filters.endDate} onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))} className={selectCls} />
            </div>
          </div>
        )}
      </Card>

      <Card dark={dark} className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={History} title="No adjustment records found" subtitle="Try clearing filters or search terms, or add a new adjustment." dark={dark} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={cx("text-left border-b", dark ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-500")}>
                  {["Record ID", "Date", "Start Time", "Machine", "Line", "Category", "Problem / Reason", "Downtime", "Result", "Adjusted By", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((r) => (
                  <tr key={r.id} className={cx("border-b last:border-0", dark ? "border-slate-700 hover:bg-slate-700/40" : "border-slate-100 hover:bg-slate-50")}>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{r.recordId}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.adjustmentDate)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.downtimeStart || "-"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.machineName}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.productionLine}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.category}</td>
                    <td className="px-4 py-3 max-w-[220px] truncate" title={r.problemReason}>{r.problemReason}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{minutesToHM(r.downtimeMinutes)}</td>
                    <td className="px-4 py-3"><Badge dark={dark}>{r.result || "-"}</Badge></td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.adjustedBy}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setDrawer({ record: r, mode: "view" })} className={cx("p-1.5 rounded-md", dark ? "hover:bg-slate-600" : "hover:bg-slate-200")} title="View"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => setDrawer({ record: r, mode: "edit" })} className={cx("p-1.5 rounded-md", dark ? "hover:bg-slate-600" : "hover:bg-slate-200")} title="Edit"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteTarget(r)} className={cx("p-1.5 rounded-md text-rose-500", dark ? "hover:bg-rose-500/10" : "hover:bg-rose-50")} title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <div className={cx("flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t text-sm", dark ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-500")}>
            <div className="flex items-center gap-2">
              <span>Rows per page</span>
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className={cx(baseInputCls(dark), "!w-auto py-1")}>
                {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span>{(pageSafe - 1) * pageSize + 1}-{Math.min(pageSafe * pageSize, filtered.length)} of {filtered.length}</span>
              <div className="flex gap-1">
                <button disabled={pageSafe <= 1} onClick={() => setPage((p) => p - 1)} className={cx("p-1.5 rounded-md border disabled:opacity-40", dark ? "border-slate-600" : "border-slate-200")}><ChevronLeft className="w-4 h-4" /></button>
                <button disabled={pageSafe >= totalPages} onClick={() => setPage((p) => p + 1)} className={cx("p-1.5 rounded-md border disabled:opacity-40", dark ? "border-slate-600" : "border-slate-200")}><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {drawer && (
        <RecordDrawer
          record={drawer.record}
          mode={drawer.mode}
          machines={machines}
          lines={lines}
          dark={dark}
          onClose={() => setDrawer(null)}
          onSaveEdit={(updated) => { onUpdate(updated); setDrawer(null); showToast("Adjustment record updated"); }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete adjustment record?"
        message="Are you sure you want to delete this adjustment record? This cannot be undone."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        dark={dark}
      />
    </div>
  );
}

/* ============================================================
   MANAGE LINES MODAL (เพิ่ม / ลบ Line Name ใน All Lines)
   ============================================================ */

function ManageLinesModal({ open, lines, onAddLine, onDeleteLine, onClose, dark }) {
  const [newLineName, setNewLineName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  if (!open) return null;

  async function handleAdd(e) {
    e.preventDefault();
    const name = newLineName.trim();
    if (!name) return;
    if (lines.includes(name)) {
      alert(`Line "${name}" already exists / มีชื่อไลน์นี้อยู่แล้ว`);
      return;
    }
    const success = await onAddLine(name);
    if (success !== false) {
      setNewLineName("");
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className={cx("w-full max-w-md rounded-xl p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150", dark ? "bg-slate-800 text-slate-100 border border-slate-700" : "bg-white text-slate-900")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-base">Manage Production Lines</h3>
            <p className={cx("text-xs", dark ? "text-slate-400" : "text-slate-500")}>เพิ่มหรือลบชื่อสายการผลิตในช่อง All Lines</p>
          </div>
          <button onClick={onClose} className={cx("p-1.5 rounded-lg", dark ? "hover:bg-slate-700" : "hover:bg-slate-100")}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Input box to add new line */}
        <form onSubmit={handleAdd} className="flex gap-2 mb-4">
          <input
            value={newLineName}
            onChange={(e) => setNewLineName(e.target.value)}
            placeholder="พิมพ์ชื่อไลน์ใหม่ เช่น Line 4, Packaging..."
            className={cx(baseInputCls(dark), "flex-1 text-sm")}
            autoFocus
          />
          <button
            type="submit"
            disabled={!newLineName.trim()}
            className="flex items-center gap-1 px-3.5 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span>เพิ่ม</span>
          </button>
        </form>

        {/* List of current lines with delete button */}
        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <span className={cx("text-xs font-semibold uppercase tracking-wider", dark ? "text-slate-400" : "text-slate-500")}>
              รายการไลน์ทั้งหมด ({lines.length})
            </span>
            <span className={cx("text-[11px]", dark ? "text-slate-500" : "text-slate-400")}>กดถังขยะเพื่อลบ</span>
          </div>

          {lines.length === 0 ? (
            <p className={cx("text-xs py-4 text-center border rounded-lg border-dashed", dark ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-500")}>
              ไม่มีข้อมูลไลน์
            </p>
          ) : (
            lines.map((l) => (
              <div
                key={l}
                className={cx(
                  "flex items-center justify-between px-3 py-2 rounded-lg text-sm border transition-colors",
                  dark ? "bg-slate-700/40 border-slate-700 hover:bg-slate-700/70" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                )}
              >
                <span className="font-medium truncate pr-2">{l}</span>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(l)}
                  className={cx(
                    "p-1.5 rounded-md text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0",
                    dark ? "hover:text-rose-400" : "hover:text-rose-600"
                  )}
                  title={`ลบ ${l}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end mt-5 pt-3 border-t" style={{ borderColor: dark ? "#334155" : "#e2e8f0" }}>
          <button
            type="button"
            onClick={onClose}
            className={cx("px-4 py-2 rounded-lg text-sm font-medium border", dark ? "border-slate-600 text-slate-200 hover:bg-slate-700" : "border-slate-300 text-slate-700 hover:bg-slate-50")}
          >
            เสร็จสิ้น (Done)
          </button>
        </div>

        {/* Delete Confirmation */}
        <ConfirmDialog
          open={!!deleteTarget}
          title={`ลบชื่อไลน์ "${deleteTarget}"?`}
          message={`คุณแน่ใจหรือไม่ว่าต้องการลบชื่อไลน์ "${deleteTarget}" ออกจากระบบ? (เครื่องจักรที่เคยผูกกับไลน์นี้จะยังคงอยู่ แต่ชื่อไลน์นี้จะไม่แสดงในตัวเลือกอีกต่อไป)`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            onDeleteLine(deleteTarget);
            setDeleteTarget(null);
          }}
          dark={dark}
          confirmLabel="ลบ (Delete)"
        />
      </div>
    </div>
  );
}

/* ============================================================
   MACHINE MASTER PAGE
   ============================================================ */

const emptyMachineForm = (lines = LINES) => ({ machineName: "", machineModel: "", productionLine: lines[0] || "Line 1", status: "Active" });

function MachineFormModal({ open, initial, lines = LINES, onAddLine, onDeleteLine, onClose, onSave, dark }) {
  const [form, setForm] = useState(emptyMachineForm(lines));
  const [manageLinesOpen, setManageLinesOpen] = useState(false);

  useEffect(() => { if (open) setForm(initial || emptyMachineForm(lines)); }, [open, initial, lines]);
  if (!open) return null;

  function update(field, value) { setForm((f) => ({ ...f, [field]: value })); }
  function handleSubmit() {
    if (!form.machineName.trim()) return;
    onSave(form);
  }

  return (
    <>
      <div className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
        <div className={cx("w-full max-w-lg rounded-xl p-5 shadow-xl", dark ? "bg-slate-800 text-slate-100" : "bg-white text-slate-900")} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">{initial ? "Edit Machine" : "Add Machine"}</h3>
            <button onClick={onClose} className={cx("p-1.5 rounded-lg", dark ? "hover:bg-slate-700" : "hover:bg-slate-100")}><X className="w-4 h-4" /></button>
          </div>
          <div className="space-y-4">
            <FormField label="Machine Name" required dark={dark}>
              <input value={form.machineName} onChange={(e) => update("machineName", e.target.value)} className={baseInputCls(dark)} placeholder="e.g. SMT Mounter 03" />
            </FormField>
            <FormField label="Machine Model" dark={dark}>
              <input value={form.machineModel} onChange={(e) => update("machineModel", e.target.value)} className={baseInputCls(dark)} placeholder="e.g. Yamaha YSM40R" />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Production Line" dark={dark}>
                <div className="flex items-center gap-1.5">
                  <select value={form.productionLine} onChange={(e) => update("productionLine", e.target.value)} className={baseInputCls(dark)}>
                    {lines.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                  {onAddLine && (
                    <button
                      type="button"
                      onClick={() => setManageLinesOpen(true)}
                      className={cx("p-2 rounded-lg border shrink-0 text-slate-500 hover:text-blue-600 transition-colors", dark ? "border-slate-600 text-slate-300 hover:bg-slate-700" : "border-slate-200 text-slate-600 hover:bg-slate-100")}
                      title="เพิ่ม / ลบชื่อไลน์ (Manage Lines)"
                    >
                      <PlusCircle className="w-4 h-4 text-blue-500" />
                    </button>
                  )}
                </div>
              </FormField>
              <FormField label="Status" dark={dark}>
                <select value={form.status} onChange={(e) => update("status", e.target.value)} className={baseInputCls(dark)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={handleSubmit} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">Save Machine</button>
            <button onClick={onClose} className={cx("px-4 py-2 rounded-lg text-sm font-semibold border", dark ? "border-slate-600 text-slate-200" : "border-slate-300 text-slate-600")}>Cancel</button>
          </div>
        </div>
      </div>

      {manageLinesOpen && (
        <ManageLinesModal
          open={manageLinesOpen}
          lines={lines}
          onAddLine={onAddLine}
          onDeleteLine={onDeleteLine}
          onClose={() => setManageLinesOpen(false)}
          dark={dark}
        />
      )}
    </>
  );
}

function MachineMasterPage({ machines, records, lines = LINES, onAddLine, onDeleteLine, onAdd, onUpdate, onDelete, onResetDemo, dark, showToast }) {
  const [search, setSearch] = useState("");
  const [lineFilter, setLineFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modal, setModal] = useState(null); // { machine } or {} for add
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [manageLinesOpen, setManageLinesOpen] = useState(false);

  const filtered = machines.filter((m) => {
    if (lineFilter !== "all" && m.productionLine !== lineFilter) return false;
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    if (search.trim() && !m.machineName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function hasHistory(machineId) {
    return records.some((r) => r.machineId === machineId);
  }

  function handleSave(form) {
    if (modal?.machine) {
      onUpdate({ ...modal.machine, ...form, updatedAt: new Date().toISOString() });
      showToast("Machine updated");
    } else {
      const now = new Date().toISOString();
      onAdd({
        id: `m-${Date.now()}`,
        machineId: `MC-${pad(machines.length + 1, 3)}`,
        department: "",
        ...form,
        createdAt: now,
        updatedAt: now,
      });
      showToast("Machine added");
    }
    setModal(null);
  }

  function confirmDelete() {
    onDelete(deleteTarget.id);
    setDeleteTarget(null);
    showToast("Machine removed from master list");
  }

  return (
    <div className="space-y-4">
      <Card dark={dark} className="p-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search machine name..." className={cx(baseInputCls(dark), "pl-9")} />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1">
              <select value={lineFilter} onChange={(e) => setLineFilter(e.target.value)} className={baseInputCls(dark)}>
                <option value="all">All Lines</option>
                {lines.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              {onAddLine && (
                <button
                  type="button"
                  onClick={() => setManageLinesOpen(true)}
                  className={cx("px-2.5 py-2 rounded-lg border text-xs font-medium flex items-center gap-1 shrink-0 text-slate-500 hover:text-blue-600 transition-colors", dark ? "border-slate-600 text-slate-300 hover:bg-slate-700" : "border-slate-200 text-slate-600 hover:bg-slate-100")}
                  title="เพิ่ม / ลบชื่อไลน์ (Manage Lines)"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-blue-500" />
                  <span className="hidden sm:inline">Line</span>
                </button>
              )}
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={baseInputCls(dark)}>
              <option value="all">All Statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={() => setModal({})} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">
              <PlusCircle className="w-3.5 h-3.5" /> Add Machine
            </button>
            <button onClick={() => setResetConfirm(true)} className={cx("flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border", dark ? "border-slate-600 text-slate-200 hover:bg-slate-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
              <RotateCcw className="w-3.5 h-3.5" /> Reset Demo Data
            </button>
          </div>
        </div>
      </Card>

      <Card dark={dark} className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={Factory} title="No machines found" subtitle="Add a machine or adjust your search and filters." dark={dark} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={cx("text-left border-b", dark ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-500")}>
                  {["Machine ID", "Machine Name", "Model", "Line", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} className={cx("border-b last:border-0", dark ? "border-slate-700 hover:bg-slate-700/40" : "border-slate-100 hover:bg-slate-50")}>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{m.machineId}</td>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{m.machineName}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{m.machineModel}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{m.productionLine}</td>
                    <td className="px-4 py-3"><Badge tone="status" dark={dark}>{m.status}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setModal({ machine: m })} className={cx("p-1.5 rounded-md", dark ? "hover:bg-slate-600" : "hover:bg-slate-200")} title="Edit"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteTarget(m)} className={cx("p-1.5 rounded-md text-rose-500", dark ? "hover:bg-rose-500/10" : "hover:bg-rose-50")} title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <MachineFormModal
        open={!!modal}
        initial={modal?.machine}
        lines={lines}
        onAddLine={onAddLine}
        onDeleteLine={onDeleteLine}
        onClose={() => setModal(null)}
        onSave={handleSave}
        dark={dark}
      />

      <ManageLinesModal
        open={manageLinesOpen}
        lines={lines}
        onAddLine={onAddLine}
        onDeleteLine={onDeleteLine}
        onClose={() => setManageLinesOpen(false)}
        dark={dark}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this machine?"
        message={
          deleteTarget && hasHistory(deleteTarget.machineId)
            ? "This machine has adjustment history. The machine will be removed from the master list, but its past adjustment records will be kept and will still show its name."
            : "Are you sure you want to delete this machine from the master list?"
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        dark={dark}
      />

      <ConfirmDialog
        open={resetConfirm}
        title="Reset demo data?"
        message="This will replace all machines and adjustment records with the original sample data. Any changes you've made will be lost."
        onCancel={() => setResetConfirm(false)}
        onConfirm={() => { onResetDemo(); setResetConfirm(false); showToast("Demo data has been reset"); }}
        dark={dark}
        confirmLabel="Reset"
      />
    </div>
  );
}

/* ============================================================
   NAVIGATION / LAYOUT
   ============================================================ */

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "new", label: "New Adjustment", icon: PlusCircle },
  { key: "history", label: "Adjustment History", icon: History },
  { key: "machines", label: "Machine Master", icon: Settings2 },
];

function Sidebar({ page, setPage, dark, mobileOpen, setMobileOpen }) {
  const content = (
    <>
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className={cx("relative rounded-xl p-2 flex items-center justify-center shrink-0 shadow-sm", dark ? "bg-gradient-to-br from-blue-600 to-indigo-700 text-white" : "bg-gradient-to-br from-blue-500 to-blue-700 text-white")}>
          <Wrench className="w-5 h-5 drop-shadow-sm" />
          <Settings2 className="w-3.5 h-3.5 absolute -bottom-0.5 -right-0.5 text-amber-300 drop-shadow" />
        </div>
        <div>
          <p className={cx("font-semibold text-sm leading-tight", dark ? "text-white" : "text-slate-900")}>Machine Adjustment Record</p>
          <p className={cx("text-[11px] leading-tight", dark ? "text-slate-400" : "text-slate-400")}>ระบบบันทึกการปรับตั้งเครื่องจักร</p>
        </div>
      </div>
      <nav className="px-3 space-y-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => { setPage(item.key); localStorage.setItem("activePage", item.key); setMobileOpen(false); }}
            className={cx(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              page === item.key
                ? "bg-blue-600 text-white shadow-sm"
                : dark ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {item.label}
          </button>
        ))}
      </nav>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={cx("hidden lg:flex lg:flex-col w-64 shrink-0 border-r min-h-screen backdrop-blur-lg", dark ? "bg-slate-900/90 border-slate-700/80" : "bg-white/90 border-slate-200/80")}>
        {content}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[70] flex">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className={cx("relative w-64 h-full border-r flex flex-col backdrop-blur-xl shadow-2xl", dark ? "bg-slate-900/95 border-slate-700" : "bg-white/95 border-slate-200")}>
            <button onClick={() => setMobileOpen(false)} className={cx("absolute top-4 right-4 p-1.5 rounded-lg", dark ? "hover:bg-slate-800" : "hover:bg-slate-100")}>
              <X className="w-4 h-4" />
            </button>
            {content}
          </aside>
        </div>
      )}
    </>
  );
}

function Header({ page, dark, setDark, setMobileOpen, connected, serverInfo }) {
  const current = NAV_ITEMS.find((n) => n.key === page);
  return (
    <header className={cx("sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 py-4 border-b backdrop-blur-md", dark ? "bg-slate-900/85 border-slate-700/80" : "bg-white/85 border-slate-200/80")}>
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={() => setMobileOpen(true)} className={cx("lg:hidden p-2 rounded-lg", dark ? "hover:bg-slate-800" : "hover:bg-slate-100")}>
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <p className={cx("text-xs", dark ? "text-slate-500" : "text-slate-400")}>Machine Adjustment Record</p>
          <h1 className={cx("text-lg font-semibold truncate", dark ? "text-white" : "text-slate-900")}>{current?.label}</h1>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        {/* PostgreSQL (Neon) DB status badge */}
        <a
          href="https://console.neon.tech/app/projects/noisy-mountain-48433226"
          target="_blank"
          rel="noopener noreferrer"
          className={cx(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-opacity hover:opacity-75",
            connected
              ? dark ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700"
              : dark ? "bg-rose-500/10 border-rose-500/30 text-rose-400" : "bg-rose-50 border-rose-200 text-rose-700"
          )}
          title={connected ? "Connected to PostgreSQL (Neon) — click to open Neon Console" : "Database offline / disconnected"}
        >
          <Database className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{connected ? "PostgreSQL (Neon)" : "Database Offline"}</span>
          <span className="sm:hidden">{connected ? "Neon" : "Offline"}</span>
        </a>
        <button
          onClick={() => setDark((d) => !d)}
          className={cx("p-2 rounded-lg border", dark ? "border-slate-600 text-amber-300 hover:bg-slate-800" : "border-slate-200 text-slate-500 hover:bg-slate-50")}
          title="Toggle dark mode"
        >
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}

/* ============================================================
   ROOT APP
   ============================================================ */

export default function App() {
  const [dark, setDark] = useState(false);
  const [page, setPage] = useState(() => localStorage.getItem("activePage") || "dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [apiLoading, setApiLoading] = useState(null); // null = hidden, string = message shown
  const [toast, setToast] = useState(null);
  const [connected, setConnected] = useState(true);
  const [serverInfo, setServerInfo] = useState(null);
  const toastTimer = useRef(null);

  const [lines, setLines] = useState(LINES);
  const [machines, setMachines] = useState([]);
  const [records, setRecords] = useState([]);

  const showToast = useCallback((message, type = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Wrap any async API call with loading overlay
  const withApiLoading = useCallback(async (message, fn) => {
    setApiLoading(message);
    try {
      return await fn();
    } finally {
      setApiLoading(null);
    }
  }, []);


  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Check health
      try {
        const hRes = await fetch(`${API_BASE}/api/health`);
        if (hRes.ok) {
          const hData = await hRes.json();
          setServerInfo(hData);
          setConnected(true);
        }
      } catch (err) {
        console.warn("Health check failed:", err);
        setConnected(false);
      }

      // Fetch lines
      try {
        const lRes = await fetch(`${API_BASE}/api/lines`);
        if (lRes.ok) {
          const lData = await lRes.json();
          if (Array.isArray(lData) && lData.length > 0) {
            setLines(lData);
          }
        }
      } catch (err) {
        console.warn("Failed to fetch lines:", err);
      }

      // Fetch machines
      const mRes = await fetch(`${API_BASE}/api/machines`);
      if (!mRes.ok) throw new Error("Failed to fetch machines from API");
      const mData = await mRes.json();
      setMachines(mData);

      // Fetch records
      const rRes = await fetch(`${API_BASE}/api/records`);
      if (!rRes.ok) throw new Error("Failed to fetch records from API");
      const rData = await rRes.json();
      setRecords(rData);
      setConnected(true);
    } catch (err) {
      console.error("API error, falling back to local sample data:", err);
      setConnected(false);
      showToast("Cannot connect to server. Falling back to local preview mode.", "error");
      const ms = buildSampleMachines();
      setMachines(ms);
      setRecords(buildSampleRecords(ms));
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleAddLine(name) {
    try {
      const res = await fetch(`${API_BASE}/api/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        let errMsg = "Failed to add line";
        try {
          const err = await res.json();
          errMsg = err.error || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }
      setLines((prev) => (prev.includes(name) ? prev : [...prev, name]));
      showToast(`เพิ่มชื่อไลน์ "${name}" สำเร็จ`);
      return true;
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to add line", "error");
      return false;
    }
  }

  async function handleDeleteLine(name) {
    try {
      const res = await fetch(`${API_BASE}/api/lines/${encodeURIComponent(name)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        let errMsg = "Failed to delete line";
        try {
          const err = await res.json();
          errMsg = err.error || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }
      setLines((prev) => prev.filter((l) => l !== name));
      showToast(`ลบชื่อไลน์ "${name}" เรียบร้อยแล้ว`);
      return true;
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to delete line", "error");
      return false;
    }
  }

  async function handleSaveRecord(record) {
    try {
      const res = await fetch(`${API_BASE}/api/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save record");
      }
      const saved = await res.json();
      setRecords((prev) => [saved, ...prev]);
      showToast("Adjustment record saved to SQLite successfully");
      return true;
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to save record", "error");
      return false;
    }
  }

  async function handleUpdateRecord(updated) {
    try {
      const res = await fetch(`${API_BASE}/api/records/${updated.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update record");
      }
      const saved = await res.json();
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      showToast("Adjustment record updated in database");
      return true;
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to update record", "error");
      return false;
    }
  }

  async function handleDeleteRecord(id) {
    try {
      const res = await fetch(`${API_BASE}/api/records/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete record");
      }
      setRecords((prev) => prev.filter((r) => r.id !== id));
      showToast("Adjustment record deleted from database");
      return true;
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to delete record", "error");
      return false;
    }
  }

  async function handleAddMachine(machine) {
    try {
      const res = await fetch(`${API_BASE}/api/machines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(machine),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add machine");
      }
      const saved = await res.json();
      setMachines((prev) => [...prev, saved]);
      showToast("Machine added to SQLite database");
      return true;
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to add machine", "error");
      return false;
    }
  }

  async function handleUpdateMachine(updated) {
    try {
      const res = await fetch(`${API_BASE}/api/machines/${updated.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update machine");
      }
      const saved = await res.json();
      setMachines((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
      showToast("Machine updated in database");
      return true;
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to update machine", "error");
      return false;
    }
  }

  async function handleDeleteMachine(id) {
    try {
      const res = await fetch(`${API_BASE}/api/machines/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete machine");
      }
      setMachines((prev) => prev.filter((m) => m.id !== id));
      showToast("Machine removed from database");
      return true;
    } catch (err) {
      console.error(err);
      showToast(err.message || "Failed to delete machine", "error");
      return false;
    }
  }

  function handleResetDemo() {
    loadData();
  }

  return (
    <div className={cx("min-h-screen w-full flex relative overflow-x-hidden", dark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900")}>
      {/* Full-screen Background Wallpaper with person repairing machine */}
      <div
        className="fixed inset-0 pointer-events-none z-0 bg-cover bg-center bg-no-repeat transition-all duration-500"
        style={{
          backgroundImage: "url('/machine_repair_bg.jpg')",
        }}
      />
      {/* Soft Adaptive Tone Overlay */}
      <div
        className={cx(
          "fixed inset-0 pointer-events-none z-0 transition-colors duration-300",
          dark ? "bg-slate-950/80 backdrop-blur-[2px]" : "bg-slate-100/80 backdrop-blur-[2px]"
        )}
      />

      {/* Main Content Layout */}
      <div className="relative z-10 w-full flex min-h-screen">
        <Sidebar page={page} setPage={setPage} dark={dark} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
        <div className="flex-1 min-w-0 flex flex-col">
          <Header page={page} dark={dark} setDark={setDark} setMobileOpen={setMobileOpen} connected={connected} serverInfo={serverInfo} />
          <main className="flex-1 p-4 sm:p-6">
            {loading ? (
              <Card dark={dark}><LoadingRows dark={dark} /></Card>
            ) : (
              <>
                {page === "dashboard" && <DashboardPage records={records} machines={machines} dark={dark} />}
                {page === "new" && (
                  <NewAdjustmentPage
                    machines={machines}
                    records={records}
                    lines={lines}
                    onSave={handleSaveRecord}
                    dark={dark}
                    showToast={showToast}
                  />
                )}
                {page === "history" && (
                  <AdjustmentHistoryPage
                    records={records}
                    machines={machines}
                    lines={lines}
                    onUpdate={handleUpdateRecord}
                    onDelete={handleDeleteRecord}
                    dark={dark}
                    showToast={showToast}
                  />
                )}
                {page === "machines" && (
                  <MachineMasterPage
                    machines={machines}
                    records={records}
                    lines={lines}
                    onAddLine={handleAddLine}
                    onDeleteLine={handleDeleteLine}
                    onAdd={handleAddMachine}
                    onUpdate={handleUpdateMachine}
                    onDelete={handleDeleteMachine}
                    onResetDemo={handleResetDemo}
                    dark={dark}
                    showToast={showToast}
                  />
                )}
              </>
            )}
          </main>
        </div>
      </div>
      <Toast toast={toast} dark={dark} />
    </div>
  );
}
