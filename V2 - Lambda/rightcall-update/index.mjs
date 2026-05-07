import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

// ตั้งค่าการเชื่อมต่อ DynamoDB
const client = new DynamoDBClient({ region: "us-east-1" });
const ddbDocClient = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
    try {
        // 1. รับค่า notification_id จาก Path Parameters
        const notificationId = event.pathParameters?.notification_id;

        // 2. ตรวจสอบว่ามีการส่ง Body มาหรือไม่
        if (!event.body) {
            return {
                statusCode: 400,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: "Missing request body" })
            };
        }

        // แปลงข้อมูล JSON จาก Body
        const body = JSON.parse(event.body);
        const newEmail = body.new_email;

        // 3. ตรวจสอบความครบถ้วนของข้อมูล
        if (!notificationId || !newEmail) {
            return {
                statusCode: 400,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: "Missing notification_id or new_email" })
            };
        }

        console.log(`[RightCall] Updating contact info for Notification ID: ${notificationId}`);

        // 4. ใช้ UpdateCommand เพื่อแก้ไขเฉพาะฟิลด์ recipient_email
        const command = new UpdateCommand({
            TableName: process.env.TABLE_NAME || "rightcall-logs", // ชื่อตารางเป้าหมาย 
            Key: { notification_id: notificationId },              // ค้นหาแถวด้วย Partition Key 
            UpdateExpression: "SET recipient_email = :email",      // กำหนดฟิลด์ที่จะแก้ไข 
            ExpressionAttributeValues: {
                ":email": newEmail                                 // แมปค่าอีเมลใหม่เข้ากับตัวแปร :email
            },
            ReturnValues: "ALL_NEW"                                // ขอให้ฐานข้อมูลส่งข้อมูลทั้งแถวที่อัปเดตเสร็จแล้วกลับมา
        });

        const response = await ddbDocClient.send(command);

        // 5. ส่งผลลัพธ์กลับไปยังผู้เรียกใช้งาน
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: "Contact info updated successfully",
                updated_data: response.Attributes // แสดงข้อมูลล่าสุดที่บันทึกในระบบ
            })
        };

    } catch (error) {
        console.error("Error updating contact info:", error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Internal Server Error" })
        };
    }
};