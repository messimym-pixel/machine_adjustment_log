# Machine Adjustment Log (LAN Shared + SQLite Database)

A full-stack **React + Vite + Tailwind CSS + Node.js (Express) + SQLite** system for tracking factory machine adjustments. Supports multi-user concurrent access across your local factory network (LAN / Wi-Fi).

## Architecture & Features

- **SQLite Database:** Powered by native Node.js SQLite with Write-Ahead Logging (WAL) for persistent, concurrent storage in `data/records.db`.
- **REST API Backend:** Express server listening on `0.0.0.0:3001` with full CRUD endpoints for machines and adjustment logs.
- **LAN Network Sharing:** Accessible from any PC, tablet, or smartphone on the local factory network.
- **Bilingual Interface:** Thai and English (EN / TH).
- **Dashboard & Analytics:** Real-time KPIs, adjustment frequency, downtime trends, and result breakdown.
- **Searchable History:** Filter by date, line, category, result, and 1-click CSV export.
- **Machine Master Data:** Register, update, and manage status of factory equipment.

## Project Structure

```
project/
├── start-server.bat             <- 1-click startup script for Windows
├── machine-adjustment-log.jsx   <- Main React UI component
├── data/
│   └── records.db               <- SQLite database file (created automatically)
├── server/                      <- Backend API service
│   ├── server.js                <- Express REST API routes & LAN binding
│   ├── db.js                    <- SQLite schema, connection & initial seeding
│   └── package.json
└── src/                         <- Vite React frontend
    ├── index.html
    ├── main.jsx
    ├── index.css
    ├── vite.config.js           <- Configured for 0.0.0.0 LAN access & /api proxy
    └── package.json
```

---

## How to Run

### Option 1: 1-Click Launch (Windows)
Double-click [`start-server.bat`](../start-server.bat) in the project root directory. It will start both the SQLite backend and the web application.

### Option 2: Command Line

#### 1. Start Both Backend and Frontend together:
```bash
cd src
npm run dev:all
```

#### 2. Or Start Backend and Frontend Separately:
**Backend API (Port 3001):**
```bash
cd server
npm install
node server.js
```

**Frontend Dashboard (Port 5173):**
```bash
cd src
npm install
npm run dev
```

---

## Accessing from other computers on the LAN

1. When the server starts, it prints your LAN IP address (e.g., `http://192.168.1.50:5173`).
2. Any computer, laptop, or tablet on the same Wi-Fi or Ethernet network can open that URL in their web browser to record or view machine adjustments in real-time.
3. Make sure Windows Firewall allows inbound connections on ports **5173** and **3001** if connecting across different machines.
