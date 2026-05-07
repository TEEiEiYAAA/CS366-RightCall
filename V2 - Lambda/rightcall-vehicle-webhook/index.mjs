import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { SNSClient, ListSubscriptionsByTopicCommand, PublishCommand } from "@aws-sdk/client-sns";

const client = new DynamoDBClient({ region: "us-east-1" });
const dynamo = DynamoDBDocumentClient.from(client);
const snsClient = new SNSClient({ region: "us-east-1" });

export const handler = async (event) => {
    try {
        // 1. รับค่าจาก URL
        const notificationId = event.queryStringParameters?.notification_id;

        if (!notificationId) {
            return {
                statusCode: 400,
                headers: { "Content-Type": "text/html; charset=UTF-8" },
                body: "<h2>เกิดข้อผิดพลาด: ไม่พบรหัสอ้างอิง (notification_id)</h2>"
            };
        }

        // 2. ดึงข้อมูลจาก DynamoDB
        const result = await dynamo.send(new GetCommand({
            TableName: process.env.TABLE_NAME || "rightcall-logs",
            Key: { notification_id: notificationId }
        }));
        const logData = result.Item;

        if (!logData) {
            return {
                statusCode: 404,
                headers: { "Content-Type": "text/html; charset=UTF-8" },
                body: "<h2>เกิดข้อผิดพลาด: ไม่พบข้อมูลงานนี้ในระบบ</h2>"
            };
        }

        // 3. ยิง API จองรถ (น้ำปั่น)
        const resourcePayload = {
            incident_location: logData.location,
            location: logData.location,
            destination_type: "incident_scene",
            destination_id: logData.location_id || "UNKNOWN",
            severity: logData.urgency || "high",
            required_resource_type: logData.incident_type || "general",
            required_capabilities: logData.volunteers_needed || 1
        };

        const allocateUrl = `${process.env.RESOURCE_ALLOCATION_API || 'http://35.174.170.62:3000'}/v1/resources/allocate`;

        const response = await fetch(allocateUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESOURCE_API_TOKEN || 'dispatcher-dev-token'}`,
                'Content-Type': 'application/json',
                'x-trace-id': notificationId
            },
            body: JSON.stringify(resourcePayload)
        });

        if (!response.ok) {
            return {
                statusCode: response.status,
                headers: { "Content-Type": "text/html; charset=UTF-8" },
                body: "<h2>เกิดข้อผิดพลาดในการจองยานพาหนะ กรุณาลองใหม่อีกครั้ง</h2>"
            };
        }

        const allocationResult = await response.json();

        // =========================================================
        // 4. LOGIC เพิ่มเติม: เช็คสถานะ SNS และแจ้งเตือนประชาชน
        // =========================================================
        const victimEmail = logData.victim_email;
        const victimTopicArn = process.env.SNS_TOPIC_VICTIM_ARN;

        if (victimEmail && victimTopicArn) {
            try {
                // ดึงรายการสมาชิกเพื่อเช็คว่า Confirm หรือยัง
                const listSubData = await snsClient.send(new ListSubscriptionsByTopicCommand({
                    TopicArn: victimTopicArn
                }));

                const subscription = listSubData.Subscriptions.find(sub => sub.Endpoint === victimEmail);

                // ถ้ากดยืนยันแล้ว (ไม่อยู่ในสถานะ PendingConfirmation) ให้ส่งเมลทันที
                if (subscription && subscription.SubscriptionArn !== "PendingConfirmation") {
                    const victimMessage = `เรียน ประชาชน\n\nขณะนี้อาสาสมัครได้เรียกยานพาหนะเรียบร้อยแล้ว\nรายละเอียดรถ: ${allocationResult.resource_type || "รถฉุกเฉิน"}\nทะเบียน/รหัส: ${allocationResult.resource_id || "-"}\nคนขับจะถึงภายใน: ${allocationResult.estimated_arrival_time_min || "-"} นาที\n\nกรุณาเตรียมตัวในพื้นที่ปลอดภัย`;

                    await snsClient.send(new PublishCommand({
                        TopicArn: victimTopicArn,
                        Subject: `[แจ้งสถานะ] รถฉุกเฉินกำลังเดินทางไปหาคุณ`,
                        Message: victimMessage
                    }));
                    console.log(`[RightCall] Alert sent to victim: ${victimEmail}`);
                } else {
                    console.log(`[RightCall] Victim hasn't confirmed SNS yet. Skipping email.`);
                }
            } catch (snsErr) {
                console.error("SNS Check/Publish Error:", snsErr);
                // ไม่ต้อง return error เพื่อให้หน้าเว็บจองรถยังแสดงผลได้ปกติ
            }
        }

        // 5. สร้าง HTML ตอบกลับอาสา
        const htmlResponse = `
            <!DOCTYPE html>
            <html lang="th">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>สถานะการเรียกยานพาหนะ</title>
                <style>
                    body { font-family: sans-serif; background-color: #f4f7f6; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                    .card { background-color: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); max-width: 400px; width: 100%; text-align: center; }
                    .info-box { background-color: #e8f4f8; padding: 15px; border-radius: 8px; margin-bottom: 15px; text-align: left; }
                    .status { font-weight: bold; color: #27ae60; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>เรียกยานพาหนะสำเร็จ!</h2>
                    <div class="info-box">
                        <p><strong>ยานพาหนะ:</strong> ${allocationResult.resource_type || "-"}</p>
                        <p><strong>ทะเบียน/รหัสรถ:</strong> ${allocationResult.resource_id || "-"}</p>
                        <p><strong>คนขับ:</strong> ${allocationResult.driver_contact || "-"}</p>
                        <p><strong>สถานะ:</strong> <span class="status">${allocationResult.status || "CONFIRMED"}</span></p>
                    </div>
                    <p style="color: #7f8c8d; font-size: 14px;">ระบบได้ส่งแจ้งเตือนไปที่อีเมลประชาชนแล้ว (หากเขายืนยันการรับข่าวสาร)</p>
                </div>
            </body>
            </html>
        `;

        return {
            statusCode: 200,
            headers: { "Content-Type": "text/html; charset=UTF-8" },
            body: htmlResponse
        };

    } catch (error) {
        console.error("Webhook Error:", error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "text/html; charset=UTF-8" },
            body: "<h2>เกิดข้อผิดพลาดในระบบเซิร์ฟเวอร์</h2>"
        };
    }
};