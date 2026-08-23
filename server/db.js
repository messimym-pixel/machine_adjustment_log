import pg from "pg";
const { Pool } = pg;

// Read DATABASE_URL from environment (set on Render / local .env)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : false,
});

// Helper: run a query and return rows
export async function query(text, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

// Initialize tables (run once on startup)
export async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS machines (
      id TEXT PRIMARY KEY,
      "machineId" TEXT NOT NULL UNIQUE,
      "machineName" TEXT NOT NULL,
      "machineModel" TEXT NOT NULL,
      "productionLine" TEXT NOT NULL,
      department TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      "recordId" TEXT NOT NULL UNIQUE,
      "machineId" TEXT,
      "machineName" TEXT NOT NULL,
      "productionLine" TEXT NOT NULL,
      "adjustmentDate" TEXT NOT NULL,
      category TEXT NOT NULL,
      "problemReason" TEXT NOT NULL,
      "parameterName" TEXT NOT NULL,
      "beforeAdjustment" TEXT NOT NULL,
      "afterAdjustment" TEXT NOT NULL,
      "adjustmentDetails" TEXT NOT NULL,
      "downtimeStart" TEXT NOT NULL,
      "downtimeEnd" TEXT NOT NULL,
      "downtimeMinutes" INTEGER NOT NULL DEFAULT 0,
      result TEXT NOT NULL,
      "adjustedBy" TEXT NOT NULL,
      "verifiedBy" TEXT NOT NULL,
      remark TEXT,
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS lines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      "createdAt" TEXT NOT NULL
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_records_date ON records("adjustmentDate");`);
  await query(`CREATE INDEX IF NOT EXISTS idx_records_line ON records("productionLine");`);
  await query(`CREATE INDEX IF NOT EXISTS idx_records_result ON records(result);`);

  // Seed lines if empty
  const linesCount = await query(`SELECT COUNT(*) as count FROM lines`);
  if (parseInt(linesCount.rows[0].count) === 0) {
    const defaultLines = ["Line 1", "Line 2", "Line 3", "SMT", "FATP", "NPI"];
    const now = new Date().toISOString();
    for (let i = 0; i < defaultLines.length; i++) {
      await query(
        `INSERT INTO lines (id, name, "createdAt") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [`line-${i + 1}`, defaultLines[i], now]
      );
    }
  }

  // Seed machines & records if empty
  const machineCount = await query(`SELECT COUNT(*) as count FROM machines`);
  if (parseInt(machineCount.rows[0].count) === 0) {
    console.log("Seeding initial machine master data into PostgreSQL...");
    const sampleMachines = buildSampleMachines();
    for (const m of sampleMachines) {
      await query(
        `INSERT INTO machines (id, "machineId", "machineName", "machineModel", "productionLine", department, status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
        [m.id, m.machineId, m.machineName, m.machineModel, m.productionLine, m.department, m.status, m.createdAt, m.updatedAt]
      );
    }

    console.log("Seeding initial adjustment logs into PostgreSQL...");
    const sampleRecords = buildSampleRecords(sampleMachines);
    for (const r of sampleRecords) {
      await query(
        `INSERT INTO records (
          id, "recordId", "machineId", "machineName", "productionLine", "adjustmentDate", category,
          "problemReason", "parameterName", "beforeAdjustment", "afterAdjustment", "adjustmentDetails",
          "downtimeStart", "downtimeEnd", "downtimeMinutes", result, "adjustedBy", "verifiedBy", remark, "createdAt", "updatedAt"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) ON CONFLICT DO NOTHING`,
        [
          r.id, r.recordId, r.machineId, r.machineName, r.productionLine, r.adjustmentDate, r.category,
          r.problemReason, r.parameterName, r.beforeAdjustment, r.afterAdjustment, r.adjustmentDetails,
          r.downtimeStart, r.downtimeEnd, r.downtimeMinutes, r.result, r.adjustedBy, r.verifiedBy,
          r.remark, r.createdAt, r.updatedAt,
        ]
      );
    }
    console.log(`Seeded ${sampleMachines.length} machines and ${sampleRecords.length} records.`);
  }
}

// ─── Sample Data Builders ──────────────────────────────────────────────────

function pad(n, len = 2) {
  return String(n).padStart(len, "0");
}

function buildSampleMachines() {
  const now = new Date().toISOString();
  const list = [
    ["SMT Printer 01",    "DEK Horizon 03i",   "SMT",  "SMT Production", "Active"],
    ["SMT Mounter 01",    "Yamaha YSM40R",      "SMT",  "SMT Production", "Active"],
    ["SMT Mounter 02",    "Yamaha YSM40R",      "SMT",  "SMT Production", "Active"],
    ["Reflow Oven 01",    "Heller 1809 MK5",   "SMT",  "SMT Production", "Active"],
    ["AOI Machine 01",    "Koh Young Zenith",   "SMT",  "Quality",        "Maintenance"],
    ["ICT Tester 01",     "Keysight i3070",     "FATP", "Test Engineering","Active"],
    ["Assembly Machine 01","Fuji NXT III",      "FATP", "Final Assembly", "Active"],
    ["Packing Machine 01","Sanko PK-200",       "FATP", "Packing",        "Inactive"],
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
  const RESULTS = ["Normal", "Monitoring", "Failed", "Pending Verification"];
  const CATEGORIES = [
    "Setup", "Parameter Adjustment", "Quality Issue", "Machine Alarm",
    "Preventive Adjustment", "Product Change", "Trial Run", "Other",
  ];
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
      records.push({
        id: `rec-${counter}`,
        recordId: `ADJ-${dateStr.replace(/-/g, "")}-${pad(j + 1, 3)}`,
        machineId: machine.machineId,
        machineName: machine.machineName,
        productionLine: machine.productionLine,
        adjustmentDate: dateStr,
        category: CATEGORIES[(dayOffset + j) % CATEGORIES.length],
        problemReason: problems[(dayOffset + j * 3) % problems.length],
        parameterName: "Temperature / Offset",
        beforeAdjustment: "245°C / 0.05mm",
        afterAdjustment: "250°C / 0.02mm",
        adjustmentDetails: details[(dayOffset + j * 2) % details.length],
        downtimeStart,
        downtimeEnd,
        downtimeMinutes: downtime,
        result: RESULTS[(dayOffset + j * 2) % RESULTS.length],
        adjustedBy: people[(dayOffset + j) % people.length],
        verifiedBy: people[(dayOffset + j + 2) % people.length],
        remark: "",
        createdAt: d.toISOString(),
        updatedAt: d.toISOString(),
      });
    }
  }
  return records;
}

export default pool;
