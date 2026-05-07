import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });
const ddbDocClient = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
    try {
        // 1. รับค่าจาก Path Parameters
        const notificationId = event.pathParameters?.notification_id;

        if (!notificationId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing notification_id in path" })
            };
        }

        // 2. ดึงข้อมูลจากฐานข้อมูลโดยใช้ Partition Key
        const getResult = await ddbDocClient.send(new GetCommand({
            TableName: process.env.TABLE_NAME || "rightcall-logs",
            Key: { notification_id: notificationId }
        }));

        const logData = getResult.Item;

        // 3. กรณีไม่พบข้อมูลในระบบ
        if (!logData) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: "Notification not found" })
            };
        }

        // 4. ส่งกลับเฉพาะข้อมูลที่จำเป็น (Data Masking)
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                notification_id: logData.notification_id,
                task_id: logData.task_id,
                status: logData.status,
                disapprove_check: logData.disapprove_check
            })
        };

    } catch (error) {
        console.error("Error fetching notification status:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal Server Error" })
        };
    }
};