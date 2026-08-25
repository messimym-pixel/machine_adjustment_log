import express from "express";
import cors from "cors";
import os from "os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { query, initDb } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// ----------------------------------------------------
// Logger — structured console logs for Render dashboard
// ----------------------------------------------------
const logger = {
  _fmt(level, msg, meta) {
    const ts = new Date().toISOString();
    const metaStr = meta ? " " + JSON.stringify(meta) : "";
    return `[${ts}] [${level}] ${msg}${metaStr}`;
  },
  info (msg, meta) { console.log  (this._fmt("INFO ", msg, meta)); },
  warn (msg, meta) { console.warn (this._fmt("WARN ", msg, meta)); },
  error(msg, meta) { console.error(this._fmt("ERROR", msg, meta)); },
};

app.use(cors());
app.use(express.json());

// ----------------------------------------------------
// HTTP Request Logger Middleware
// ----------------------------------------------------
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? "error"
                : res.statusCode >= 400 ? "warn"
                : "info";
    logger[level](`${req.method} ${req.path}`, {
      status: res.statusCode,
      ms,
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress,
    });
  });
  next();
});

// Helper to get local network IP addresses for LAN sharing display
function getNetworkIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

// ----------------------------------------------------
// Health & Info Endpoint
// ----------------------------------------------------
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    networkIps: getNetworkIps(),
  });
});

// ----------------------------------------------------
// Lines API
// ----------------------------------------------------
app.get("/api/lines", async (req, res) => {
  try {
    const result = await query(`SELECT name FROM lines ORDER BY "createdAt" ASC`);
    res.json(result.rows.map((r) => r.name));
  } catch (error) {
    logger.error("Error fetching lines:", { message: error?.message ?? String(error) });
    res.status(500).json({ error: "Failed to fetch lines" });
  }
});

app.post("/api/lines", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Line name is required" });
    }
    const cleanName = name.trim();
    const id = `line-${Date.now()}`;
    const now = new Date().toISOString();

    await query(
      `INSERT INTO lines (id, name, "createdAt") VALUES ($1, $2, $3)`,
      [id, cleanName, now]
    );

    res.status(201).json({ id, name: cleanName });
  } catch (error) {
    logger.error("Error creating line:", { message: error?.message ?? String(error) });
    res.status(500).json({ error: error.message || "Failed to add line" });
  }
});

app.delete(["/api/lines", "/api/lines/:name"], async (req, res) => {
  try {
    const rawName = req.params.name || req.query.name || req.body?.name;
    if (!rawName) {
      return res.status(400).json({ error: "Line name is required" });
    }
    const cleanName = decodeURIComponent(rawName).trim();

    await query(`DELETE FROM lines WHERE name = $1 OR TRIM(name) = $1`, [cleanName]);

    res.json({ success: true, message: `Line "${cleanName}" deleted` });
  } catch (error) {
    logger.error("Error deleting line:", { message: error?.message ?? String(error) });
    res.status(500).json({ error: "Failed to delete line" });
  }
});

// ----------------------------------------------------
// Machines API
// ----------------------------------------------------
app.get("/api/machines", async (req, res) => {
  try {
    const result = await query(`SELECT * FROM machines ORDER BY "machineId" ASC`);
    res.json(result.rows);
  } catch (error) {
    logger.error("Error fetching machines:", { message: error?.message ?? String(error) });
    res.status(500).json({ error: "Failed to fetch machines" });
  }
});

app.post("/api/machines", async (req, res) => {
  try {
    const { machineId, machineName, machineModel, productionLine, department, status } = req.body;
    if (!machineId || !machineName) {
      return res.status(400).json({ error: "Machine ID and Name are required" });
    }

    const now = new Date().toISOString();
    const id = req.body.id || `m-${Date.now()}`;
    const newMachine = {
      id,
      machineId,
      machineName,
      machineModel: machineModel || "-",
      productionLine: productionLine || "Line 1",
      department: department || "-",
      status: status || "Active",
      createdAt: now,
      updatedAt: now,
    };

    await query(
      `INSERT INTO machines (id, "machineId", "machineName", "machineModel", "productionLine", department, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        newMachine.id, newMachine.machineId, newMachine.machineName, newMachine.machineModel,
        newMachine.productionLine, newMachine.department, newMachine.status,
        newMachine.createdAt, newMachine.updatedAt,
      ]
    );

    res.status(201).json(newMachine);
  } catch (error) {
    logger.error("Error creating machine:", { message: error?.message ?? String(error) });
    res.status(500).json({ error: error.message || "Failed to create machine" });
  }
});

app.put("/api/machines/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { machineId, machineName, machineModel, productionLine, department, status } = req.body;
    const now = new Date().toISOString();

    const existing = await query(`SELECT * FROM machines WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(400).json({ error: "Machine not found" });
    }
    const prev = existing.rows[0];

    const updated = {
      ...prev,
      machineId: machineId || prev.machineId,
      machineName: machineName || prev.machineName,
      machineModel: machineModel !== undefined ? machineModel : prev.machineModel,
      productionLine: productionLine || prev.productionLine,
      department: department !== undefined ? department : prev.department,
      status: status || prev.status,
      updatedAt: now,
    };

    await query(
      `UPDATE machines
       SET "machineId" = $1, "machineName" = $2, "machineModel" = $3, "productionLine" = $4,
           department = $5, status = $6, "updatedAt" = $7
       WHERE id = $8`,
      [
        updated.machineId, updated.machineName, updated.machineModel, updated.productionLine,
        updated.department, updated.status, updated.updatedAt, id,
      ]
    );

    res.json(updated);
  } catch (error) {
    logger.error("Error updating machine:", { message: error?.message ?? String(error) });
    res.status(500).json({ error: error.message || "Failed to update machine" });
  }
});

app.delete("/api/machines/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`DELETE FROM machines WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Machine not found" });
    }
    res.json({ success: true, message: "Machine deleted successfully" });
  } catch (error) {
    logger.error("Error deleting machine:", { message: error?.message ?? String(error) });
    res.status(500).json({ error: "Failed to delete machine" });
  }
});

// ----------------------------------------------------
// Records (Adjustment Logs) API
// ----------------------------------------------------
app.get("/api/records", async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM records
      ORDER BY "adjustmentDate" DESC, "downtimeStart" DESC, "createdAt" DESC
    `);
    res.json(result.rows);
  } catch (error) {
    logger.error("Error fetching records:", { message: error?.message ?? String(error) });
    res.status(500).json({ error: "Failed to fetch records" });
  }
});

app.post("/api/records", async (req, res) => {
  try {
    const body = req.body;
    const now = new Date().toISOString();
    const id = body.id || `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Generate recordId: ADJ-YYYYMMDD-XXX using MAX() from DB
    // Wrapped in retry loop to handle rare concurrent insert collisions (pg error 23505)
    const buildRecord = async () => {
      let recordId = body.recordId;
      if (!recordId) {
        const dateStr = body.adjustmentDate || now.slice(0, 10);
        const stamp = dateStr.replace(/-/g, "");
        const prefix = `ADJ-${stamp}-`;
        const result = await query(
          `SELECT COALESCE(MAX(CAST(SPLIT_PART("recordId", '-', 3) AS INTEGER)), 0) AS maxnum
           FROM records WHERE "recordId" LIKE $1`,
          [`${prefix}%`]
        );
        const maxNum = parseInt(result.rows[0]?.maxnum ?? 0, 10);
        recordId = `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
      }
      return recordId;
    };

    const newRecord = {
      id,
      recordId: null,
      machineId: body.machineId || "",
      machineName: body.machineName || "-",
      productionLine: body.productionLine || "Line 1",
      adjustmentDate: body.adjustmentDate || now.slice(0, 10),
      category: body.category || "Setup",
      problemReason: body.problemReason || "-",
      parameterName: body.parameterName || "-",
      beforeAdjustment: body.beforeAdjustment || "-",
      afterAdjustment: body.afterAdjustment || "-",
      adjustmentDetails: body.adjustmentDetails || "-",
      downtimeStart: body.downtimeStart || "00:00",
      downtimeEnd: body.downtimeEnd || "00:00",
      downtimeMinutes: Number(body.downtimeMinutes) || 0,
      result: body.result || "Normal",
      adjustedBy: body.adjustedBy || "-",
      verifiedBy: body.verifiedBy || "-",
      remark: body.remark || "",
      createdAt: body.createdAt || now,
      updatedAt: now,
    };

    // Try INSERT, retry up to 5 times on unique recordId collision (pg error 23505)
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      newRecord.recordId = await buildRecord();
      try {
        await query(
          `INSERT INTO records (
            id, "recordId", "machineId", "machineName", "productionLine", "adjustmentDate", category,
            "problemReason", "parameterName", "beforeAdjustment", "afterAdjustment", "adjustmentDetails",
            "downtimeStart", "downtimeEnd", "downtimeMinutes", result, "adjustedBy", "verifiedBy", remark, "createdAt", "updatedAt"
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
          [
            newRecord.id, newRecord.recordId, newRecord.machineId, newRecord.machineName, newRecord.productionLine,
            newRecord.adjustmentDate, newRecord.category, newRecord.problemReason, newRecord.parameterName,
            newRecord.beforeAdjustment, newRecord.afterAdjustment, newRecord.adjustmentDetails,
            newRecord.downtimeStart, newRecord.downtimeEnd, newRecord.downtimeMinutes, newRecord.result,
            newRecord.adjustedBy, newRecord.verifiedBy, newRecord.remark, newRecord.createdAt, newRecord.updatedAt,
          ]
        );
        break; // INSERT succeeded — exit retry loop
      } catch (insertErr) {
        // 23505 = unique_violation in PostgreSQL
        if (insertErr.code === "23505" && insertErr.constraint === "records_recordId_key" && attempt < MAX_ATTEMPTS) {
          logger.warn(`recordId collision on attempt ${attempt}, retrying...`, { recordId: newRecord.recordId });
          await new Promise(r => setTimeout(r, attempt * 20)); // back-off
          continue;
        }
        throw insertErr; // re-throw unexpected errors
      }
    }

    res.status(201).json(newRecord);
  } catch (error) {
    logger.error("Error creating record:", { message: error?.message ?? String(error) });
    res.status(500).json({ error: error.message || "Failed to create record" });
  }
});

app.put("/api/records/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const now = new Date().toISOString();

    const existing = await query(`SELECT * FROM records WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Record not found" });
    }
    const prev = existing.rows[0];

    const updated = {
      ...prev,
      ...body,
      downtimeMinutes: body.downtimeMinutes !== undefined ? Number(body.downtimeMinutes) : prev.downtimeMinutes,
      updatedAt: now,
    };

    await query(
      `UPDATE records SET
        "machineId" = $1, "machineName" = $2, "productionLine" = $3, "adjustmentDate" = $4, category = $5,
        "problemReason" = $6, "parameterName" = $7, "beforeAdjustment" = $8, "afterAdjustment" = $9,
        "adjustmentDetails" = $10, "downtimeStart" = $11, "downtimeEnd" = $12, "downtimeMinutes" = $13,
        result = $14, "adjustedBy" = $15, "verifiedBy" = $16, remark = $17, "updatedAt" = $18
      WHERE id = $19`,
      [
        updated.machineId, updated.machineName, updated.productionLine, updated.adjustmentDate, updated.category,
        updated.problemReason, updated.parameterName, updated.beforeAdjustment, updated.afterAdjustment,
        updated.adjustmentDetails, updated.downtimeStart, updated.downtimeEnd, updated.downtimeMinutes,
        updated.result, updated.adjustedBy, updated.verifiedBy, updated.remark, updated.updatedAt,
        id,
      ]
    );

    res.json(updated);
  } catch (error) {
    logger.error("Error updating record:", { message: error?.message ?? String(error) });
    res.status(500).json({ error: error.message || "Failed to update record" });
  }
});

app.delete("/api/records/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`DELETE FROM records WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Record not found" });
    }
    res.json({ success: true, message: "Record deleted successfully" });
  } catch (error) {
    logger.error("Error deleting record:", { message: error?.message ?? String(error) });
    res.status(500).json({ error: "Failed to delete record" });
  }
});

// ----------------------------------------------------
// Serve Production Static Web Assets
// ----------------------------------------------------
const distPath = path.resolve(__dirname, "../src/dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// ----------------------------------------------------
// Start Server (after DB is initialized)
// ----------------------------------------------------
initDb()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      logger.info("Server started", {
        port: PORT,
        env: process.env.NODE_ENV || "development",
        db: "PostgreSQL (Neon)",
      });
      logger.info(`API ready at http://localhost:${PORT}/api/health`);
    });
  })
  .catch((err) => {
    logger.error("Failed to initialize database", { message: err.message });
    process.exit(1);
  });

