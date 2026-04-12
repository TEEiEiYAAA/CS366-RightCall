import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand, SubscribeCommand } from "@aws-sdk/client-sns";
import crypto from 'crypto'; 

const dbClient = new DynamoDBClient({ region: "us-east-1" });
const ddbDocClient = DynamoDBDocumentClient.from(dbClient);
const snsClient = new SNSClient({ region: "us-east-1" }); 

export const handler = async (event) => {
    try {
        if (!event.body) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing request body" }) };
        }

        const body = JSON.parse(event.body);
        const { task_id, match_id, volunteer_id, name, email, location, task_detail } = body;
        
        if (!email) {
            return { statusCode: 400, body: JSON.stringify({ error: "Email is required" }) };
        }

        const notificationId = crypto.randomUUID();

        // =========================================================
        // 1. DECISION LOGIC: ดึงข้อมูลรถจากระบบ "น้ำปั่น"
        // =========================================================
        let vehicleInfoText = "ไม่พบยานพาหนะฉุกเฉินในพื้นที่ของคุณ"; 
        
        if (location && location.lat && location.lng) {
            const resourceApiUrl = `${process.env.RESOURCE_ALLOCATION_API || 'http://localhost:3000'}/v1/resources/nearby?lat=${location.lat}&long=${location.lng}`;
            
            try {
                console.log(`[RightCall] Requesting vehicle data from: ${resourceApiUrl}`);
                const resourceResponse = await fetch(resourceApiUrl, { signal: AbortSignal.timeout(3000) }); 
                
                if (resourceResponse.ok) {
                    const resourceData = await resourceResponse.json();
                    if (resourceData.resources && resourceData.resources.length > 0) {
                        const vehicle = resourceData.resources[0]; 
                        vehicleInfoText = `แนะนำยานพาหนะ: ${vehicle.type} (${vehicle.vehicle_id}) ห่างออกไป ${vehicle.distance_km} กม.`;
                    }
                } else {
                    console.warn(`[RightCall] Resource API Failed: HTTP ${resourceResponse.status}`);
                }
            } catch (err) {
                console.error("[RightCall] Resource API Timeout or Error. Proceeding without vehicle data.");
            }
        }

        // =========================================================
        // 2. บันทึกลง DynamoDB (Owned Data)
        // =========================================================
        const newLog = {
            notification_id: notificationId,
            task_id: task_id,
            match_id: match_id,
            volunteer_id: volunteer_id,
            recipient_email: email,
            location: location,
            vehicle_suggested: vehicleInfoText,
            status: "PENDING",
            disapprove_check: false,
            created_at: Date.now()
        };

        await ddbDocClient.send(new PutCommand({
            TableName: process.env.TABLE_NAME || "rightcall-logs",
            Item: newLog
        }));
        console.log(`[RightCall] Saved to DynamoDB: ${notificationId}`);

        // =========================================================
        // 3. SNS: Auto-Subscribe และ แจ้งเตือน
        // =========================================================
        if (process.env.SNS_TOPIC_ARN) {
            
            // --- 3.1 สั่งให้ SNS นำอีเมลไปลงทะเบียนเข้ากลุ่ม ---
            try {
                await snsClient.send(new SubscribeCommand({
                    TopicArn: process.env.SNS_TOPIC_ARN,
                    Protocol: "email",
                    Endpoint: email,
                    ReturnSubscriptionArn: true
                }));
                console.log(`[RightCall] Auto-subscribed ${email} to SNS.`);
            } catch (subErr) {
                console.error("[RightCall] Failed to auto-subscribe:", subErr);
            }

            // --- 3.2 สร้างลิงก์ Decline และส่งข้อความ ---
            const apiGatewayUrl = process.env.API_GATEWAY_URL || "https://example.com";
            const declineUrl = `${apiGatewayUrl}/api/v1/notifications/decline?notification_id=${notificationId}`;
            
            const messageBody = `สวัสดีคุณ ${name},\n\nคุณได้รับการจับคู่งานใหม่ รหัสงาน: ${task_id}\nรายละเอียด: ${task_detail || "-"}\n\nพาหนะแนะนำ: ${vehicleInfoText}\n\nหากคุณไม่พร้อมปฏิบัติงาน กรุณากดปฏิเสธที่ลิงก์นี้:\n${declineUrl}`;

            try {
                await snsClient.send(new PublishCommand({
                    TopicArn: process.env.SNS_TOPIC_ARN,
                    Subject: "[RightCall] แจ้งเตือนภารกิจด่วน",
                    Message: messageBody
                }));
                console.log(`[RightCall] Email publish command sent to SNS for ${email}`);
            } catch (pubErr) {
                console.error("[RightCall] Failed to publish message:", pubErr);
            }
            
        } else {
            console.warn("[RightCall] SNS_TOPIC_ARN is not set. Skipped SNS operations.");
        }

        return {
            statusCode: 201,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: "Data received and logged successfully",
                notification_id: notificationId,
                status: "PENDING"
            })
        };

    } catch (error) {
        console.error("Error Processing Request:", error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Internal Server Error" })
        };
    }
};