import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

// ตั้งค่าการเชื่อมต่อ DynamoDB
const client = new DynamoDBClient({ region: "us-east-1" });
const ddbDocClient = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
    try {
        // 1. รับค่า volunteer_id จาก Path Parameters
        const volunteerId = event.pathParameters?.volunteer_id;

        // ตรวจสอบว่ามีการส่ง volunteer_id มาหรือไม่
        if (!volunteerId) {
            return {
                statusCode: 400,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: "Missing volunteer_id in path" })
            };
        }

        console.log(`[RightCall] Scanning history for volunteer: ${volunteerId}`);

        // 2. ตั้งค่าคำสั่ง ScanCommand
        const command = new ScanCommand({
            TableName: process.env.TABLE_NAME || "rightcall-logs", // ชื่อตาราง
            FilterExpression: "volunteer_id = :vid",               // เงื่อนไขในการกรองข้อมูล
            ExpressionAttributeValues: {
                ":vid": volunteerId                                // ค่าที่จะนำไปเทียบ
            }
        });

        // 3. ส่งคำสั่งไปยัง DynamoDB
        const response = await ddbDocClient.send(command);

        // 4. จัดรูปแบบข้อมูลตอบกลับ
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                volunteer_id: volunteerId,
                total_records: response.Items ? response.Items.length : 0,
                history: response.Items || []
            })
        };

    } catch (error) {
        console.error("Error scanning volunteer history:", error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Internal Server Error" })
        };
    }
};