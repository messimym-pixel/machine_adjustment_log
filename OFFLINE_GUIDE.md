# Factory Machine Adjustment Log — Offline Server Deployment Guide

คู่มือการย้ายและเปิดใช้งานระบบบน **เครื่อง Server ออฟไลน์ (ไม่มีอินเทอร์เน็ต)** ภายในโรงงาน

---

## 1. คุณสมบัติและความพร้อมใช้งานแบบ Offline 100%

* ✅ **ไม่มีการดึงข้อมูลจาก CDN ภายนอก:** ไอคอน (Lucide), ชาร์ต (Recharts), สไตล์ (Tailwind CSS) ถูกรวม (Bundle) อยู่ในไฟล์ `src/dist` แล้วทั้งหมด
* ✅ **ฐานข้อมูล SQLite แบบ Single-File:** ข้อมูลทั้งหมดจัดเก็บในไฟล์ `data/records.db`
* ✅ **รองรับ PM2 ในตัว:** มีแพ็กเกจ PM2 อยู่ใน `node_modules` ของโปรเจกต์ สามารถใช้คำสั่ง `npx pm2` ได้ทันทีโดยไม่ต้องต่อเน็ต
* ✅ **รวม Frontend + Backend บน Port 3001 เดียวกัน:** Express Backend ทำหน้าที่เป็นทั้ง Web Server ให้บริการหน้าเว็บ และเป็น REST API เชื่อมต่อ SQLite

---

## 2. ขั้นตอนการย้ายโปรเจกต์ไปเครื่อง Offline Server

1. **คัดลอกโฟลเดอร์โปรเจกต์ทั้งหมด (`project/`)** ลงใน Flash Drive หรือส่งผ่าน Shared Folder ไปวางบนเครื่อง Offline Server
2. **เครื่อง Offline Server ต้องติดตั้ง:**
   * **Node.js (เวอร์ชัน 18 ขึ้นไป หรือแนะนำ Node 22+)**
   *(สามารถโหลดตัวติดตั้ง `node-v...-x64.msi` ใส่ Flash Drive ไปติดตั้งบนเครื่องออฟไลน์ได้เลย)*

---

## 3. วิธีการเริ่มระบบบน Offline Server ด้วย PM2

### วิธีที่ 1: ดับเบิลคลิกไฟล์ Batch (ง่ายที่สุด)
* ดับเบิลคลิกที่ **`start-pm2.bat`**
* ระบบจะเปิด Service ผ่าน PM2 ในพื้นหลังทันที

### วิธีที่ 2: ใช้คำสั่งผ่าน Command Prompt
เปิด Terminal ในโฟลเดอร์โปรเจกต์แล้วรัน:

```bash
# เริ่มระบบด้วย PM2
npx pm2 start ecosystem.config.cjs

# ตรวจสอบสถานะการทำงาน
npx pm2 status

# ดู Logs การทำงานแบบ Real-time
npx pm2 logs

# รีสตาร์ทระบบ
npx pm2 restart ecosystem.config.cjs

# หยุดระบบ
npx pm2 stop ecosystem.config.cjs
```

---

## 4. การเข้าใช้งานจากเครื่องต่างๆ ในโรงงาน

* **บนเครื่อง Server เอง:** เปิดเว็บเบราว์เซอร์ไปที่ `http://localhost:3001`
* **บนเครื่องคอมพิวเตอร์ / แท็บเล็ต ในวง LAN เดียวกัน:**
  ```
  http://<IP_เครื่อง_Server>:3001
  (ตัวอย่าง: http://192.168.1.100:3001)
  ```

> [!TIP]
> **Windows Firewall:**
> หากเครื่องอื่นในวง LAN เข้าไม่ได้ ให้เปิดพอร์ต **3001** ใน Windows Defender Firewall ของเครื่อง Server (Inbound Rules -> Allow Port 3001 TCP)

---

## 5. การสำรองข้อมูล (Backup Database)

* สามารถสำรองข้อมูลได้ง่ายๆ โดยการคัดลอกไฟล์ **`data/records.db`** ไปเก็บไว้ในไดรฟ์สำรอง
