//index.mjs  in rightcall-decliine-handler
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });
const ddbDocClient = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
    try {
        // ดึง notification_id จาก URL (Query String)
        const notification_id = event.queryStringParameters?.notification_id;

        if (!notification_id) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing notification_id" }) };
        }

        // --- STEP A: ค้นหาข้อมูลเดิมจาก DynamoDB ---
        const getResult = await ddbDocClient.send(new GetCommand({
            TableName: "rightcall-logs",
            Key: { notification_id: notification_id }
        }));

        const logData = getResult.Item;
        if (!logData) {
            return { statusCode: 404, body: JSON.stringify({ error: "Notification not found" }) };
        }

        // --- STEP B: อัปเดตข้อมูล Owned Data ของเราเองลง DynamoDB ---
        await ddbDocClient.send(new UpdateCommand({
            TableName: "rightcall-logs",
            Key: { notification_id: notification_id },
            UpdateExpression: "SET disapprove_check = :dc, #status = :s",
            ExpressionAttributeNames: {
                "#status": "status"
            },
            ExpressionAttributeValues: {
                ":dc": true,
                ":s": "DECLINED"
            }
        }));

        console.log(`[RightCall] Notification ${notification_id} marked as DECLINED.`);

        // ตอบกลับอาสาสมัคร
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                message: "ระบบได้รับแจ้งการปฏิเสธงานของคุณเรียบร้อยแล้ว ขอบคุณครับ",
                task_id: logData.task_id
            })
        };

    } catch (error) {
        console.error("Error Processing Decline:", error);
        return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
};