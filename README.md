# SERVICE OVERVIEW

## RightCall Service

### 1. Service Owner
นายธีรัตม์ ศรีสุโข รหัสนักศึกษา 6609650442 ภาคพิเศษ

### 2. Service Purpose
RightCall Service เป็นบริการที่รับผิดชอบในส่วนการแจ้งเตือนให้กับอาสาสมัครที่มีการลงทะเบียนกับทางVolunteerMatch เพื่อช่วยให้อาสาสามารถเข้าถึงข้อมูลได้แบบเรียลไทม์ รวมถึงการแนะนำข้อมูลยานพาหนะในรัศมี โดยนำข้อมูลมาจาก ResourceAllocation Service นอกจากการแจ้งเตือนแล้วนั้นจะมีการให้ผู้ใช้กด decline events ได้ ก่อนจะทำการส่งข้อมูลกลับไป UPDATEในฐานข้อมูลของ VolunteerMatch 

### 3. Pain Point ที่แก้
แม้ว่าบริการของเพื่อนนั้นได้ทำการจับคู่อาสาเข้ากับ incidents ในพื้นที่เป็นที่เรียบร้อย แต่อาสาหลับไม่รู้ว่าถูกจับคู่กับตำแหน่งไหนและในบางกรณีอาสาก็อาจไม่มียานพาหนะที่จะใช้เพื่อเข้าช่วยเหลือได้ ส่งผลให้เกิดความล่าช้า บริการนี้จึงเข้ามาช่วยเป็นกระบอกเสียงและส่ง Emailหรือ SMS ตรงเข้ามือถือของอาสาที่ลงชื่อไว้ในทันที ทำให้การช่วยเหลือทำได้ทั่วถึงและครบถ้วนมากยิ่งขึ้น

### 4. Target Users
- อาสาสมัคร จากทาง VolunteerMatch

### 5. Service Boundary
**In-Scope Responsibilities (สิ่งที่ระบบนี้รับผิดชอบ)**
- ดึงข้อมูลอาสาที่ได้มีการ match เรียบร้อยมาจากฐานข้อมูลของ VolunteerMatch Service
- ดึงข้อมูลของยานพาหนะในพื้นที่จากฐานข้อมูลของ ResourceAllocation Service
- ทำการแจ้งเตือนไปยังอาสาของ VolunteerMatch
- นำคำตอบของอาสาไป UPDATE ในฐานข้อมูลของVolunteerMatch Service

**Out-Scope Responsibilities (สิ่งที่ระบบนี้ไม่รับผิดชอบ)**
- ลงทะเบียนอาสาสมัคร
- สร้างและจัดการ Task
- จับคู่อาสากับงานตามทักษะและพื้นที่
- การแสดงผลแผนที่
- ตรวจสอบตำแหน่งและเก็บข้อมูลของพาหนะ

### 6. Autonomy / Decision Logic
บริการมีความเป็นอิสระในการตัดสินใจเกี่ยวกับ:
- การตัดสินใจดึงข้อมูลยานพาหนะโดยอ้างอิงจากตำแหน่งที่ได้จากVolunteerMatch

การตัดสินใจอิงจาก:
- status: สถานะการทำงานปัจจุบัน (AVAILABLE, EN_ROUTE, ON_SITE, TRANSPORTING)
- current_location: Geography พิกัดปัจจุบันของทรัพยากรที่ได้รับจากระบบTelemetry (Lat/Long)

### 7. API Endpoints

เส้นทางสำหรับให้ระบบอื่น (เช่น VolunteerMatch) หรือผู้ใช้งาน เรียกเข้ามาที่ระบบ RightCall ผ่าน API Gateway

| Method | Path | Type | Description |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/v1/events/volunteer-match` | Sync | รับข้อมูลการจับคู่งานใหม่จาก VolunteerMatch บันทึก Log ลง DB และส่งอีเมลแจ้งเตือนผ่าน SNS |
| **GET** | `/api/v1/notifications/decline` | Sync | ลิงก์สำหรับอาสาสมัครคลิกจากในอีเมล เพื่อปฏิเสธงาน (ระบบจะอัปเดตสถานะใน DB เป็น `DECLINED`) |

## Coming Soon...
- เรียกข้อมูลของ "ResourceAllocation Service" เพื่อดูข้อมูลพาหนะ ตำแหน่ง และ จำนวนความจุที่พาหนะสามารถจุคนได้

---

## 8. Owned Data

ระบบใช้ **Amazon DynamoDB** เป็นฐานข้อมูลหลัก สำหรับเก็บประวัติการแจ้งเตือนและการตอบรับของอาสาสมัคร

- **Table Name:** `rightcall-logs`
- **Partition Key:** `notification_id` (String - UUID)
- **Sort Key:** *(None)*

**Attributes ในแต่ละ Item:**

| Attribute | Type | Description |
| :--- | :--- | :--- |
| `notification_id` | String | (Primary Key) รหัสกำกับการแจ้งเตือน (UUID) |
| `task_id` | String | รหัสภารกิจ (อ้างอิงจากระบบ VolunteerMatch) |
| `match_id` | String | รหัสการจับคู่ (อ้างอิงจากระบบ VolunteerMatch) |
| `volunteer_id` | String | รหัสประจำตัวอาสาสมัคร |
| `recipient_email` | String | อีเมลปลายทางที่ระบบส่งการแจ้งเตือนไปหา |
| `location` | Map | พิกัดจุดเกิดเหตุ (รูปแบบ: `{ "lat": 13.xxx, "lng": 100.xxx }`) |
| `vehicle_suggested` | String | ข้อความแนะนำยานพาหนะที่ได้จากระบบ Resource Allocation |
| `created_at` | Number | Timestamp (Epoch) วันเวลาที่สร้างการแจ้งเตือนนี้ |
| `status` | String | สถานะการตอบรับ (เริ่มต้น: `"PENDING"`, เมื่อปฏิเสธ: `"DECLINED"`) |
| `disapprove_check`| Boolean | Flag ตรวจสอบการปฏิเสธ (เริ่มต้น: `false`, เมื่อปฏิเสธ: `true`) |
