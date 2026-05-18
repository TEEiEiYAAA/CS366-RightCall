# SERVICE OVERVIEW – RightCall Service

---

## 1. Service Owner

**นายธีรัตม์ ศรีสุโข** | รหัสนักศึกษา `6609650442` | ภาคพิเศษ

---

## 2. Service Purpose

RightCall Service เป็นบริการที่รับผิดชอบในส่วนการแจ้งเตือนให้กับอาสาสมัครที่มีการลงทะเบียนกับ VolunteerMatch เพื่อช่วยให้อาสาสามารถเข้าถึงข้อมูลได้แบบเรียลไทม์ และเรียกยานพาหนะที่เหมาะสมกับสถานการณ์ภัยพิบัติที่เกิดขึ้นไปยังที่เกิดเหตุ รวมถึงมีระบบการเรียกยานพาหนะในรัศมีผ่าน link ที่แปะไว้กับ email โดยนำข้อมูลยานพาหนะมาจาก ResourceAllocation Service

---

## 3. Pain Point ที่แก้

แม้ว่าบริการของเพื่อนนั้นได้ทำการจับคู่อาสาเข้ากับ incidents ในพื้นที่เป็นที่เรียบร้อย แต่อาสากลับไม่รู้ว่าถูกจับคู่กับตำแหน่งไหน และในบางกรณีอาสาก็อาจไม่มียานพาหนะที่จะใช้เพื่อเข้าช่วยเหลือได้ ส่งผลให้เกิดความล่าช้า

บริการนี้จึงเข้ามาช่วยเป็นกระบอกเสียงและส่ง Email ตรงหาอาสาที่ลงชื่อไว้ในทันที ทำให้การช่วยเหลือทำได้ทั่วถึงและครบถ้วนมากยิ่งขึ้น

---

## 4. Target Users

อาสาสมัครจาก **VolunteerMatch**

---

## 5. Service Boundary

### In-Scope Responsibilities

- ได้รับข้อมูลอาสาที่ได้มีการ match เรียบร้อยจาก VolunteerMatch Service
- ส่ง request ยานพาหนะไปยัง ResourceAllocation Service
- ทำหน้าเว็บสำหรับให้อาสากดเข้าไปเรียกยานพาหนะที่ต้องการให้ไปรับตัวเอง
- ทำการแจ้งเตือนไปยังอาสาของ VolunteerMatch

### Out-of-Scope Responsibilities

- ลงทะเบียนอาสาสมัคร
- สร้างและจัดการ Task
- จับคู่อาสากับงานตามทักษะและพื้นที่
- การแสดงผลแผนที่
- ตรวจสอบตำแหน่งและเก็บข้อมูลของพาหนะ
- รับแจ้งเหตุจากผู้คน

---

## 6. Autonomy / Decision Logic

บริการมีความเป็นอิสระในการตัดสินใจเกี่ยวกับการนำเอาข้อมูล status จาก VolunteerMatch เข้ามาเพื่อตัดสินใจว่าจะส่งเมลหาอาสากับผู้ประสบภัย หรือส่งพาหนะให้ไปที่เกิดเหตุโดยอัตโนมัติ

### Status Logic

| Status | การทำงาน |
| :--- | :--- |
| `pending` | ระบบจะส่ง email แจ้งเตือนไปยังอาสาและผู้ประสบภัยทันที (รับประกัน 1 ครั้งต่อ task_id + status ด้วย Idempotency Guard) |
| `accepted` | ระบบจะ request พาหนะจาก ResourceAllocation เพื่อส่งพาหนะตรงไปจุดเกิดเหตุโดยอัตโนมัติ |

### การจับคู่ยานพาหนะตาม Incident Type

| incident_type | ยานพาหนะที่ส่ง |
| :--- | :--- |
| `flood` | `RESCUE_BOAT` |
| `earthquake` | `HELICOPTER` |
| `power_outage` | `POWER_GENERATOR_TRUCK` |
| `storm` | `AMBULANCE_VAN` |
| อื่นๆ / default | `HELICOPTER` |

### Idempotency Guard (กันส่ง Email ซ้ำ)

- ใช้ DynamoDB `ConditionExpression` เพื่อ "จอง slot" ก่อนส่ง email
- **Idempotency Key:** `{task_id}#{STATUS}` เช่น `T-1001#PENDING`
- หาก Key นี้มีอยู่แล้ว → ระบบข้ามการส่ง Email แต่ยังคืน `201` ตามปกติ

### การเรียกพาหนะแบบ Manual (อาสาร้องขอเอง)

- อาสาสมัครสามารถกดลิงก์ในอีเมลเพื่อเรียกพาหนะมารับตัวเองก่อนไปจุดเกิดเหตุ
- ระบบใช้ request_id รูปแบบ `VOL-{task_id}` เพื่อแยกออกจาก Auto Dispatch
- การเรียกแบบ Manual **ไม่สามารถยกเลิกได้** หลังจากยืนยันแล้ว

---

## 7. API Endpoints

| Method | Path | Description | Type |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/events/volunteer-match` | ส่งแจ้งเตือนผ่าน email (ส่งหลังเก็บ log ลง DB และสถานะเป็น pending) | Async |
| `POST` | `/api/v1/events/volunteer-match` | รับข้อมูลการจับคู่งานใหม่จาก VolunteerMatch บันทึก Log ลง DB (หาก status เป็น complete จะเรียกพาหนะจาก ResourceAllocation) | Sync |
| `GET` | `/api/v1/notifications/{notification_id}` | ดึงสถานะการตอบรับของอาสาจาก notification_id | Sync |
| `GET` | `/api/v1/volunteers/{volunteer_id}/notifications` | ดึงประวัติการแจ้งเตือนทั้งหมดของอาสาคนนั้น | Sync |
| `PATCH` | `/api/v1/notifications/{notification_id}/contact` | แก้ไข `recipient_email` จาก body | Sync |
| `GET` | `/api/v1/vehicles/request` | ให้อาสากดเรียกพาหนะมารับตัวเองก่อนไปจุดเกิดเหตุ | Sync |

---

## 8. Owned Data

ระบบใช้ **Amazon DynamoDB** เป็นฐานข้อมูลหลัก สำหรับเก็บประวัติการแจ้งเตือนและการตอบรับของอาสาสมัคร

- **Table Name:** `rightcall-logs`
- **Partition Key:** `notification_id` (String - UUID)
- **Sort Key:** (None)

### Schema

| Attribute | Type | Description |
| :--- | :--- | :--- |
| `notification_id` | string (PK) | รหัสกำกับการแจ้งเตือน (UUID) |
| `task_id` | string | รหัสภารกิจ (รับมาจาก VolunteerMatch) |
| `task_title` | string | ชื่อภารกิจ (รับมาจาก VolunteerMatch) |
| `match_id` | string | รหัสการจับคู่ (รับมาจาก VolunteerMatch) |
| `incident_id` | string | รหัสประจำตัวอาสาสมัคร (รับมาจาก VolunteerMatch) |
| `incident_type` | string | ประเภทของเหตุการณ์ |
| `urgency` | string | ระดับความเร่งด่วน |
| `volunteers_needed` | Number | จำนวนอาสาที่ต้องการ |
| `volunteer_id` | string | รหัสอาสาสมัคร (รับมาจาก VolunteerMatch) |
| `volunteer_email` | string | อีเมลอาสาสมัคร (บันทึกลง DynamoDB ในชื่อ `recipient_email`) |
| `victim_email` | string | อีเมลผู้ประสบภัย |
| `victim_phone` | string | เบอร์โทรผู้ประสบภัย |
| `location` | Map (JSON) | พิกัดจุดเกิดเหตุ (มี `lat` และ `lng`) |
| `status` | string | สถานะการตอบรับของอาสา |
| `disapprove_check` | boolean | ตรวจสอบการกดปฏิเสธงาน (อัปเดตโดย decline-handler) |
| `created_at` | Number | Timestamp เวลาที่สร้างการแจ้งเตือน (ms) |
| `vehicle_type_dispatched` | string | ประเภทพาหนะที่ระบบเลือกส่ง request ไปอัตโนมัติ |
| `dispatch_request_id` | string | รหัส Request ที่ส่งไป ResourceAllocation |
| `dispatch_status` | string | สถานะการ Dispatch พาหนะ |

---

## 9. Links

- **GitHub:** [https://github.com/TEEiEiYAAA/CS366-RightCall](https://github.com/TEEiEiYAAA/CS366-RightCall)
- **Video:** [https://drive.google.com/file/d/1FyOz2jPqXEW7lYtD1pM6XX2i-Zfnlgyi/view](https://drive.google.com/file/d/1FyOz2jPqXEW7lYtD1pM6XX2i-Zfnlgyi/view?usp=drive_link)

---

## 12. API Contracts (Synchronous)

---

### Contract #1 — Receive Volunteer Match Event

**Method:** `POST` | **Path:** `/api/v1/events/volunteer-match` | **Type:** Synchronous

**คำอธิบาย:** รับข้อมูลการจับคู่อาสาสมัครกับงานจาก VolunteerMatch ระบบจะแยกการทำงานตาม status:

- **PENDING** → บันทึกลง DynamoDB และส่งอีเมลหาอาสา/ผู้ประสบภัยผ่าน SNS (มีการเช็ค Idempotency ป้องกันส่งเมลซ้ำ)
- **ACCEPTED** → บันทึกลง DynamoDB และยิง API ขอพาหนะจาก ResourceAllocation ตรงไปจุดเกิดเหตุ (Auto Dispatch)

**Request Headers:** `Content-Type: application/json`

**Request Body:**

```json
{
  "match_id": "MATCH-8301BE3A",
  "task_id": "REQ-FULL-TEST2",
  "task_title": "มีคนติดอยู่บนชั้น 3 น้ำกำลังขึ้น",
  "incident_id": "INC-0099",
  "incident_type": "STORM",
  "status": "pending",
  "urgency": "high",
  "volunteers_needed": 1,
  "location_id": "BKK",
  "location": {
    "lat": 13.7563,
    "lng": 100.5018
  },
  "volunteer": {
    "id": "VOL-779CF019",
    "name": "กู้ภัย กรุงเทพมหานคร 5",
    "email": "teerat.sri@hotmail.com",
    "phone": "0821000005"
  },
  "victim": {
    "email": "victim@test.com",
    "phone": "0899999999"
  }
}
```

**Validation:** บังคับส่ง `volunteer.email` และ `location.lat` / `location.lng`

**Response — 201 Created:**

```json
{
  "message": "Dispatched and notified successfully",
  "notification_id": "fbfee35e-7fc7-44de-9148-c5f0044d92d9",
  "dispatch_request_id": "TASK-99887766",
  "vehicle_dispatched": "RESCUE_BOAT",
  "dispatch_status": "SKIPPED",
  "status": "pending"
}
```

**Response — Error:**

```json
{ "error": "Volunteer email is required" }
```

> **หมายเหตุ:** หากส่งซ้ำจะได้รับ `"message": "Already notified — duplicate request ignored"`

**Dependencies:**
- ResourceAllocation (ถ้า status = `ACCEPTED`)
- AWS SNS — 2 Topics: Volunteer และ Victim (ถ้า status = `PENDING`)
- Idempotency Guard เช็คจาก `task_id#STATUS`

---

### Contract #2 — Request Vehicle Webhook

**Method:** `POST` | **Path:** `/api/v1/vehicles/request` | **Type:** Synchronous

**คำอธิบาย:** เปิดแสดงหน้าจอ HTML ให้ผู้ใช้เลือกประเภทยานพาหนะที่ต้องการ เมื่อผู้ใช้กด accepted (แนบ `action=call`) ระบบจะยิง API ไปจองพาหนะที่ ResourceAllocation

**Query Parameters:**

| Parameter | Required | Description |
| :--- | :--- | :--- |
| `notification_id` | ✓ | รหัสการแจ้งเตือน |
| `action` | X | เช่น `call` |
| `vehicle_type` | X | ประเภทพาหนะ (แนบมาตอน action=call) |
| `vol_lat`, `vol_lng` | X | พิกัดของอาสา |
| `inc_lat`, `inc_lng` | X | พิกัดจุดเกิดเหตุ |

**Response — 201 Created:**

```json
{
  "resource_type": "RESCUE_BOAT",
  "resource_id": "BOAT-01",
  "driver_contact": "0888888888",
  "status": "DISPATCHED",
  "estimated_arrival_time_mins": 5
}
```

---

### Contract #3 — Get Notification Status

**Method:** `GET` | **Path:** `/api/v1/notifications/{notification_id}` | **Type:** Synchronous

**คำอธิบาย:** ดึงสถานะปัจจุบันของการแจ้งเตือน

**Path Parameter:** `notification_id` (required)

**Response — 200 OK:**

```json
{
  "notification_id": "1fbb65bd-a0f1...",
  "task_id": "T-1001",
  "status": "PENDING",
  "disapprove_check": false
}
```

---

### Contract #4 — Get Volunteer Notification History

**Method:** `GET` | **Path:** `/api/v1/volunteers/{volunteer_id}/notifications` | **Type:** Synchronous

**คำอธิบาย:** ดึงประวัติการแจ้งเตือนทั้งหมดที่เคยส่งหาอาสาสมัครคนนี้

**Path Parameter:** `volunteer_id` (required)

**Response — 200 OK:**

```json
{
  "volunteer_id": "V-12345",
  "total_records": 5,
  "history": [
    { "/* logData1 */": "" },
    { "/* logData2 */": "" }
  ]
}
```

---

## 14. Linked Data

| Field | วัตถุประสงค์ |
| :--- | :--- |
| `incident_id` | รหัสอ้างอิงเหตุการณ์หลัก เพื่อเชื่อมโยงการแจ้งเตือนและเรียกพาหนะไปยังจุดเกิดเหตุ |
| `incident_type`, `urgency` | อ้างอิงประเภทเหตุการณ์เพื่อจับคู่พาหนะ (RightCall ไม่อัปเดตค่าเหล่านี้เอง) |
| `location` (lat/lng) | พิกัดจุดเกิดเหตุ ใช้ระบุตำแหน่งให้อาสาและส่ง request พาหนะจาก ResourceAllocation |
| `task_id`, `match_id` | รหัสอ้างอิงงานและการจับคู่ |
| `volunteer_id`, `recipient_email` | รหัสและ email อาสาสมัครจาก VolunteerMatch |
| `dispatch_request_id`, `vehicle_type_dispatched` | รหัสและประเภทพาหนะที่จองสำเร็จ สำหรับตรวจสอบย้อนหลัง |

---

## 15. Non-Functional Requirements

| ด้าน | รายละเอียด |
| :--- | :--- |
| **Performance** | ประมวลผลและตอบกลับได้ภายใน 5 วินาทีหลังส่งข้อมูล |
| **Reliability & Resilience** | มีการป้องกันข้อมูลซ้ำซ้อนด้วย Idempotency Guard |
| **Security** | การสื่อสารจาก RightCall ไปยัง ResourceAllocation ป้องกันด้วย Bearer Token และ Idempotency-Key |
