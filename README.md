# SERVICE OVERVIEW – RightCall Service

## 1. Service Owner
* นายธีรัตม์ ศรีสุโข รหัสนักศึกษา 6609650442 ภาคพิเศษ

## 2. Service Purpose
* RightCall Service เป็นบริการที่รับผิดชอบในส่วนการแจ้งเตือนให้กับอาสาสมัครที่มีการลงทะเบียนกับ ทาง VolunteerMatch เพื่อช่วยให้อาสาสามารถเข้าถึงข้อมูลได้แบบเรียลไทม์ และเรียกยานพาหนะที่เหมาะสมกับสถานการณ์ภัยพิบัติที่เกิดขึ้นไปยังที่เกิดเหตุ รวมถึงมีระบบการเรียกยานพาหนะในรัศมีผ่าน link ที่แปะไว้กับ email โดยนำข้อมูลยานพาหนะมาจาก ResourceAllocation Service

## 3. Pain Point ที่แก้
* แม้ว่าบริการของเพื่อนนั้นได้ทำการจับคู่อาสาเข้ากับ incidents ในพื้นที่เป็นที่เรียบร้อย แต่อาสากลับไม่รู้ ว่าถูกจับคู่กับตำแหน่งไหนและในบางกรณีอาสาก็อาจไม่มียานพาหนะที่จะใช้เพื่อเข้าช่วยเหลือได้ ส่งผลให้เกิด ความล่าช้า
* บริการนี้จึงเข้ามาช่วยเป็นกระบอกเสียงและส่ง Email ตรงหาอาสาที่ลงชื่อไว้ในทันที ทำให้การ ช่วยเหลือทำได้ทั่วถึงและครบถ้วนมากยิ่งขึ้น

## 4. Target Users
* อาสาสมัคร จากทาง VolunteerMatch

## 5. Service Boundary
* **In-Scope Responsibilities (สิ่งที่ระบบนี้รับผิดชอบ)**
  * ได้รับข้อมูลอาสาที่ได้มีการ match เรียบร้อยจาก VolunteerMatch Service
  * ส่ง request ยานพาหนะไปยัง ResourceAllocation Service
  * ทำหน้าเว็บสำหรับให้อาสากดเข้าไปเรียกยานพาหนะที่ต้องการให้ไปรับตัวเอง
  * ทำการแจ้งเตือนไปยังอาสาของ VolunteerMatch
* **Out-Scope Responsibilities (สิ่งที่ระบบนี้ไม่รับผิดชอบ)**
  * ลงทะเบียนอาสาสมัคร
  * สร้างและจัดการ Task
  * จับคู่อาสากับงานตามทักษะและพื้นที่
  * การแสดงผลแผนที่
  * ตรวจสอบตำแหน่งและเก็บข้อมูลของพาหนะ
  * รับแจ้งเหตุจากผู้คน

## 6. Autonomy / Decision Logic
* บริการมีความเป็นอิสระในการตัดสินใจเกี่ยวกับการนำเอาข้อมูล status จาก VolunteerMatch เข้ามาเพื่อตัดสินใจว่าจะส่งเมลหาอาสากับผู้ประสบภัย หรือส่งพาหนะให้ไปที่เกิดเหตุโดยอัตโนมัติ
* **status**
  * `pending` → ระบบจะส่ง email แจ้งเตือนไปยังอาสาและผู้ประสบภัยทันที (รับประกัน 1 ครั้งต่อ task_id + status ด้วย Idempotency Guard)
  * `accepted` → ระบบจะ request พาหนะจาก ResourceAllocation เพื่อส่งพาหนะตรงไปจุดเกิดเหตุโดยอัตโนมัติ
* **incident_type ที่จะใช้จับคู่เพื่อส่งยานพาหนะไปที่เกิดเหตุโดยอัตโนมัติ**
  * `flood` → RESCUE_BOAT
  * `earthquake` → HELICOPTER
  * `power_outage` → POWER_GENERATOR_TRUCK
  * `storm` → AMBULANCE_VAN
  * `(อื่นๆ / default)` → HELICOPTER
* **Idempotency Guard (กันส่ง Email ซ้ำ):**
  * ใช้ dynamoDB ConditionExpression เพื่อ "จอง slot" ก่อนส่ง email
  * Idempotency Key: `{task_id}#{STATUS}` เช่น `T-1001#PENDING`
  * หาก Key นี้มีอยู่แล้ว → ระบบข้ามการส่ง Email แต่ยังคืน 201 ตามปกติ
* **การเรียกพาหนะแบบ Manual (อาสาร้องขอเอง):**
  * อาสาสมัครสามารถกดลิงก์ในอีเมลเพื่อเรียกพาหนะมารับตัวเองก่อนไปจุดเกิดเหตุ
  * ระบบใช้ request_id รูปแบบ `VOL-{task_id}` เพื่อแยกออกจาก Auto Dispatch
  * การเรียกแบบ Manual นี้ไม่สามารถยกเลิกได้หลังจากยืนยันแล้ว

## 7. API Endpoints
* เส้นทางสำหรับให้ระบบอื่น (เช่น VolunteerMatch) หรือผู้ใช้งาน เรียกเข้ามาที่ระบบ RightCall ผ่าน API Gateway

| Path | Description | Method / Contract |
| :--- | :--- | :--- |
| `/api/v1/events/volunteer-match` | ส่งแจ้งเตือนผ่าน email[จะส่งหลังเก็บ log ลง DB และสถานะเป็น pending] | POST / Async |
| `/api/v1/events/volunteer-match` | รับข้อมูลการจับคู่งานใหม่จาก VolunteerMatch บันทึก Log ลง DB [หลังได้รับข้อมูลจับคู่หาก status เป็น complete จะไปเรียกพาหนะจาก ResourceAllocation] | POST / Sync |
| `/api/v1/notifications/{notification_id}` | ให้ระบบอื่นนำ notification_id มาค้นหา เพื่อดึงสถานะการตอบรับของอาสา | GET / Sync |
| `/api/v1/volunteers/{volunteer_id}/notifications` | ดึงข้อมูลประวัติการแจ้งเตือนทั้งหมดที่เคยส่งไปยังอาสาคนนั้น | GET / Sync |
| `/api/v1/notifications/{notification_id}/contact` | แก้ไข recipient_email โดยรับข้อมูลจาก body เพื่อแก้ไขเฉพาะ field | PATCH / Sync |
| `/api/v1/vehicles/request` | ใช้เพื่อให้อาสากดเรียกพาหนะมารับตัวเองก่อนไปจุดเกิดเหตุ | GET / Sync |

## 8. Owned Data
* ระบบใช้ Amazon DynamoDB เป็นฐานข้อมูลหลัก สำหรับเก็บประวัติการแจ้งเตือนและการตอบรับของอาสาสมัคร
* **Table Name:** `rightcall-logs`
* **Partition Key:** `notification_id` (String - UUID)
* **Sort Key:** (None)
* **Attributes ในแต่ละ Item:**

| Attribute | Description | Type |
| :--- | :--- | :--- |
| `notification_id` | (Primary Key) รหัสกำกับการแจ้งเตือน (UUID) | string (PK) |
| `task_id` | รหัสภารกิจ (รับมาจากระบบ VolunteerMatch) | string |
| `task_title` | ชื่อภารกิจ (รับมาจากระบบ VolunteerMatch) | string |
| `match_id` | รหัสการจับคู่ (รับมาจากระบบ VolunteerMatch) | string |
| `incident_id` | รหัสประจำตัวอาสาสมัคร (รับมาจากระบบ VolunteerMatch) | string |
| `incident_type` | ประเภทของเหตุการณ์ | string |
| `urgency` | ระดับความเร่งด่วน | string |
| `volunteers_needed` | จำนวนอาสาที่ต้องการ | Number |
| `volunteer_id` | รหัสอาสาสมัคร (รับมาจาก VolunteerMatch) | string |
| `volunteer_email` | อีเมลอาสาสมัครที่ส่งแจ้งเตือนไป (ตอนบันทึกลง dynamoDB จะเปลี่ยนชื่อเป็น recipient_email) | string |
| `victim_email` | อีเมลผู้ประสบภัย | string |
| `victim_phone` | เบอร์โทรผู้ประสบภัย | string |
| `location` | พิกัดจุดเกิดเหตุ (มี lat และ lng) | Map (JSON) |
| `status` | สถานะการตอบรับของอาสา | string |
| `disapprove_check` | ตรวจสอบการกดปฏิเสธงาน (อัปเดตโดย decline-handler) | boolean |
| `created_at` | Timestamp เวลาที่สร้างการแจ้งเตือน (ms) | Number |
| `vehicle_type_dispatched` | ประเภทพาหนะที่ระบบเลือกส่ง request ไปอัตโนมัติ | string |
| `dispatch_request_id` | รหัส Request ที่ส่งไป ResourceAllocation | string |
| `dispatch_status` | สถานะการ Dispatch พาหนะ | string |

## 9. Links 
* **Link Github:** https://github.com/TEEiEiYAAA/CS366-RightCall
* **Link Video:** https://drive.google.com/file/d/1FyOz2jPqXEW7lYtD1pM6XX2i-Zfnlgyi/view?usp=drive_link

---

## 12. Synchronous Function Contract

### API Contract #1: Receive Volunteer Match Event
* **ข้อมูลทั่วไป**
  * **Name:** Receive Volunteer Match
  * **Method:** POST
  * **Path:** `/api/v1/events/volunteer-match`
  * **Type:** Synchronous
* **คำอธิบาย:** รับข้อมูลการจับคู่อาสาสมัครกับงานจาก VolunteerMatch ระบบจะแยกการทำงานตาม status:
  * **PENDING:** บันทึกลง DynamoDB และส่งอีเมลหาอาสา/ผู้ประสบภัยผ่าน SNS (มีการเช็ค Idempotency ป้องกันส่งเมลซ้ำ)
  * **ACCEPTED:** บันทึกลง DynamoDB และยิง API ขอพาหนะจาก ResourceAllocation ตรงไปจุดเกิดเหตุ (Auto Dispatch)
* **Request:** * **Query Params:** ไม่มี
  * **Headers:** Content-Type: application/json
  * **Body (JSON):**
    ```json
    {
      "match_id": "MATCH-8301BE3A",
      "task_id": "REQ-FULL-TEST2",
      "task_title": " มีคนติดอยู่บนชั้น 3 น้ำกำลังขึ้น ",
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
        "name": " กู้ภัย กรุงเทพมหานคร 5",
        "email": "teerat.sri@hotmail.com",
        "phone": "0821000005"
      },
      "victim": {
        "email": "victim@test.com",
        "phone": "0899999999"
      }
    }
    ```
* **Validation:** บังคับส่ง `volunteer.email` และ `location.lat` / `location.lng`
* **Response:** * **Success:** 201 Created
  * **Body (JSON):**
    ```json
    {
      "message" : "Dispatched and notified successfully",
      "notification_id" : "fbfee35e-7fc7-44de-9148-c5f0044d92d9",
      "dispatch_request_id" : "TASK-99887766",
      "vehicle_dispatched" : "RESCUE_BOAT",
      "dispatch_status" : "SKIPPED",
      "status" : "pending"
    }
    ```
  * **Error:** `{"error":"Volunteer email is required"}`
  * **หมายเหตุ:** หากส่งซ้ำจะขึ้นว่า `"message" : "Already notified — duplicate request ignored"`
* **Dependency / Reliability:**
  * ResourceAllocation (ถ้า ACCEPTED)
  * AWS SNS (2 Topics: Volunteer และ Victim) (ถ้า PENDING)
  * Idempotency Guard ป้องกัน email ซ้ำโดยเช็คจาก `task_id#STATUS`

### API Contract #2 : Request Vehicle Webhook
* **ข้อมูลทั่วไป**
  * **Name:** Request Vehicle Webhook
  * **Method:** POST
  * **Path:** `/api/v1/vehicles/request`
  * **Type:** Synchronous
* **คำอธิบาย:** เปิดแสดงหน้าจอ HTML ให้ผู้ใช้เลือกประเภทยานพาหนะที่ต้องการ เมื่อผู้ใช้กด accepted (แนบ action=call) ระบบจะยิง API ไปจองพาหยะที่ ResourceAllocation
* **Request Query Params:**
  * `notification_id` (required)
  * `action` (optional, เช่น 'call')
  * `vehicle_type`, `vol_lat`, `vol_lng`, `inc_lat`, `inc_lng` (แนบมาตอน action=call)
* **Validation:** บังคับส่ง `volunteer.email` และ `location.lat` / `location.lng`
* **Response Success:** 201 Created
* **Body (JSON):**
  ```json
  {
    "resource_type": "RESCUE_BOAT",
    "resource_id": "BOAT-01",
    "driver_contact": "0888888888",
    "status": "DISPATCHED",
    "estimated_arrival_time_mins": 5
  }
  ### API Contract #3 : Get Notification
* [cite_start]**ข้อมูลทั่วไป** [cite: 145]
  * [cite_start]**Name:** Get Notification Status [cite: 146]
  * [cite_start]**Method:** GET [cite: 147]
  * [cite_start]**Path:** `/api/v1/notifications/{notification_id}` [cite: 148]
  * [cite_start]**Type:** Synchronous [cite: 149]
* [cite_start]**คำอธิบาย:** ดึงสถานะปัจจุบันของการแจ้งเตือน [cite: 150]
* [cite_start]**Request Query Params:** `notification_id` (required) [cite: 152]
* [cite_start]**Response Success:** 200 OK [cite: 153]
* [cite_start]**Body (JSON):** [cite: 154]
  ```json
  {
    "notification_id": "1fbb65bd-a0f1...",
    "task_id": "T-1001",
    "status": "PENDING",
    "disapprove_check": false
  }
  ### [cite_start]API Contract #4 : Get Volunteer History [cite: 161]
* [cite_start]**ข้อมูลทั่วไป** [cite: 162]
  * [cite_start]**Name:** Get Volunteer History [cite: 163]
  * [cite_start]**Method:** GET [cite: 164]
  * [cite_start]**Path:** `/api/v1/volunteers/{volunteer_id}/notifications` [cite: 165]
  * [cite_start]**Type:** Synchronous [cite: 166]
* [cite_start]**คำอธิบาย:** ดึงประวัติการแจ้งเตือนทั้งหมดที่เคยส่งหาอาสาสมัครคนนี้ [cite: 167]
* [cite_start]**Request Query Params:** `volunteer_id` (required) [cite: 168]
* [cite_start]**Response Success:** 200 OK [cite: 169]
* [cite_start]**Body (JSON):** [cite: 170]
  ```json
  {
    "volunteer_id": "V-12345",
    "total_records": 5,
    "history": [ { "/* logData1 */": "" }, { "/* logData2 */": "" } ]
  }
  14. Linked Data

incident_id: รหัสอ้างอิงเหตุการณ์หลัก เพื่อเชื่อมโยงการแจ้งเตือนและเรียกพาหนะไปยังจุดเกิดเหตุ   


incident_type และ urgency: อ้างอิงประเภทเหตุการณ์ เพื่อใช้การจับคู่พาหนะกับจุดเกิดเหตุ โดย RightCall จะไม่อัปเดตหรือแก้ไขค่าเหล่านี้เอง เพียงแค่จับคู่พาหนะและส่ง request   


location (lat/lng): พิกัดจุดเกิดเหตุที่ได้รับมา นำมาใช้กับการระบุที่เกิดเหตุให้อาสา และส่ง request พาหนะจาก ResourceAllocation   


task_id และ match_id: รหัสอ้างอิงงานและการจับคู่   


volunteer_id และ recipient_email: รหัสและ email ของอาสาสมัครที่ VolunteerMatch ส่งมาให้ระบบ RightCall ผู้ซึ่งเป็นคนกลางในการส่งสารให้กับอาสาและเรียกพาหนะไปยังที่เกิดเหตุแบบอัตโนมัติ   


dispatch_request_id และ vehicle_type_dispatched: ระบบนำรหัสที่จองรถสำเร็จมาเก็บเป็น Reference เพื่อให้ตรวจสอบย้อนหลังได้ว่า RightCall ร้องขอพาหนะชนิดใดไป   

15. Non-Functional Requirements

Performance: ระบบควรจะสามารถประมวลผลและตอบกลับได้ภายใน 5 วินาทีหลัง ส่งข้อมูล   


Reliability & Resilience: ระบบควรมีการป้องกันข้อมูลซ้ำซ้อน   


Security: การสื่อสารจาก RightCall ไปยัง ResourceAllocation มีการป้องกันด้วย Bearer Token ควบคู่กับการใช้ Idempotency-Key เพื่อความปลอดภัย   


Link Github: https://github.com/TEEiEiYAAA/CS366-RightCall   


Link Video: https://drive.google.com/file/d/1FyOz2jPqXEW7lYtD1pM6XX2i-Zfnlgyi/view?usp=drive_link
