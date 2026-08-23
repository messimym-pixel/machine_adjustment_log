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

app.use(cors());
app.use(express.json());

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
    console.error("Error fetching lines:", error);
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
    console.error("Error creating line:", error);
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
    console.error("Error deleting line:", error);
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
    console.error("Error fetching machines:", error);
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
    console.error("Error creating machine:", error);
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
    console.error("Error updating machine:", error);
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
    console.error("Error deleting machine:", error);
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
    console.error("Error fetching records:", error);
    res.status(500).json({ error: "Failed to fetch records" });
  }
});

app.post("/api/records", async (req, res) => {
  try {
    const body = req.body;
    const now = new Date().toISOString();
    const id = body.id || `rec-${Date.now()}`;

    // Auto-generate recordId: ADJ-YYYYMMDD-XXX
    let recordId = body.recordId;
    if (!recordId) {
      const dateStr = body.adjustmentDate || now.slice(0, 10);
      const stamp = dateStr.replace(/-/g, "");
      const prefix = `ADJ-${stamp}-`;
      const sameDayResult = await query(
        `SELECT "recordId" FROM records WHERE "recordId" LIKE $1`,
        [`${prefix}%`]
      );
      let maxNum = 0;
      sameDayResult.rows.forEach((r) => {
        const parts = r.recordId.split("-");
        const numPart = parseInt(parts[2], 10);
        if (!isNaN(numPart) && numPart > maxNum) maxNum = numPart;
      });
      recordId = `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
    }

    const newRecord = {
      id,
      recordId,
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

    res.status(201).json(newRecord);
  } catch (error) {
    console.error("Error creating record:", error);
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
    console.error("Error updating record:", error);
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
    console.error("Error deleting record:", error);
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
      const ips = getNetworkIps();
      console.log(`====================================================`);
      console.log(` Machine Adjustment Log - Backend (PostgreSQL)`);
      console.log(` Listening on: http://localhost:${PORT}`);
      ips.forEach((ip) => {
        console.log(` LAN Access:   http://${ip}:${PORT}`);
      });
      console.log(`====================================================`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
