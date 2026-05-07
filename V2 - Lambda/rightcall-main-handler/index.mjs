import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand, SubscribeCommand } from "@aws-sdk/client-sns";
import crypto from "crypto";

const dbClient = new DynamoDBClient({ region: "us-east-1" });
const ddbDocClient = DynamoDBDocumentClient.from(dbClient);
const snsClient = new SNSClient({ region: "us-east-1" });

export const handler = async (event) => {
    try {
        if (!event.body) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing request body" }) };
        }

        const body = JSON.parse(event.body);

        const {
            match_id,
            task_id,
            task_title,
            incident_id,
            incident_type,
            urgency,
            volunteers_needed,
            location,                                                                           // พิกัดจุดเกิดเหตุ → Google Maps
            volunteer: { id: volunteer_id, name: volunteer_name, email: volunteer_email, phone: volunteer_phone, location: volunteer_location },  // พิกัดอาสา → ResourceAllocation
            victim: { email: victim_email, phone: victim_phone }
        } = body;

        if (!volunteer_email) {
            return { statusCode: 400, body: JSON.stringify({ error: "Volunteer email is required" }) };
        }

        const notificationId = crypto.randomUUID();
        let vehicleInfoText = "ไม่พบยานพาหนะฉุกเฉินในพื้นที่ของคุณ";

        const coordForResource = volunteer_location || location;  // ใช้พิกัดอาสาก่อน ถ้าไม่มีค่อย fallback ไปจุดเกิดเหตุ
        if (coordForResource && coordForResource.lat && coordForResource.lng) {
            const traceId = event.headers && event.headers["x-trace-id"] ? event.headers["x-trace-id"] : crypto.randomUUID();
            const resourceApiUrl = `${process.env.RESOURCE_ALLOCATION_API || "http://localhost:3000"}/v1/resources/nearby?lat=${coordForResource.lat}&long=${coordForResource.lng}&radius_km=20`;

            try {
                console.log(
                    JSON.stringify({
                        level: "INFO",
                        trace_id: traceId,
                        action: "call_resource_allocation_api",
                        url: resourceApiUrl
                    })
                );

                const resourceResponse = await fetch(resourceApiUrl, {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${process.env.RESOURCE_API_TOKEN}`,
                        "x-trace-id": traceId,
                        Accept: "application/json"
                    },
                    signal: AbortSignal.timeout(2000)  // ต้องน้อยกว่า Lambda timeout
                });

                if (resourceResponse.ok) {
                    const resourceData = await resourceResponse.json();
                    if (resourceData.resources && resourceData.resources.length > 0) {
                        const vehicle = resourceData.resources[0];
                        vehicleInfoText = `แนะนำยานพาหนะ: ${vehicle.resource_type} ห่างออกไป ${vehicle.distance_from_center_km} กม.`;
                    }
                } else {
                    console.warn(
                        JSON.stringify({
                            level: "WARN",
                            trace_id: traceId,
                            message: `Resource API Failed: Status ${resourceResponse.status}`
                        })
                    );
                }
            } catch (err) {
                console.error(
                    JSON.stringify({
                        level: "ERROR",
                        trace_id: traceId,
                        message: "Resource API Timeout or Error",
                        error_detail: err.message
                    })
                );
            }
        }

        const newLog = {
            notification_id: notificationId,
            match_id,
            task_id,
            task_title,
            incident_id,
            incident_type,
            urgency,
            volunteers_needed,
            location,            // พิกัดจุดเกิดเหตุ
            volunteer_id,
            recipient_email: volunteer_email,
            victim_email,
            victim_phone,
            vehicle_suggested: vehicleInfoText,
            status: "PENDING",
            created_at: Date.now()
        };

        await ddbDocClient.send(
            new PutCommand({
                TableName: process.env.TABLE_NAME || "rightcall-logs",
                Item: newLog
            })
        );

        console.log(`[RightCall] Saved to DynamoDB: ${notificationId}`);

        // === ส่งเมลหาอาสาสมัคร (Volunteer Topic) ===
        if (process.env.SNS_TOPIC_ARN) {
            const apiGatewayUrl =
                process.env.API_GATEWAY_URL || "https://vk8ohzpki6.execute-api.us-east-1.amazonaws.com";

            const mapUrl = `https://maps.google.com/?q=${location.lat},${location.lng}`;
            const callVehicleWebhookUrl = `${apiGatewayUrl}/api/v1/vehicles/request?notification_id=${notificationId}`;

            const volunteerMessageBody = `สวัสดีคุณ ${volunteer_name},\n\nคุณได้รับการจับคู่งานใหม่\n----------------------------------------------------------------\nรายละเอียดภารกิจ:\n\nรายละเอียด: ${task_title || "-"}\nประเภท: ${incident_type || "-"}\nต้องการอาสาจำนวน: ${volunteers_needed || "-"} คน\nเบอร์ติดต่อของผู้ที่ต้องการความช่วยเหลือ: ${victim_phone || "-"}\n----------------------------------------------------------------\nรายละเอียดสถานที่:\n\nละติจูด: ${location.lat}\nลองจิจูด: ${location.lng}\n\nคลิกดูแผนที่ (Google Maps):\n${mapUrl}\n----------------------------------------------------------------\nหากคุณพร้อมออกเดินทาง คุณสามารถกดลิงก์ด้านล่างเพื่อเรียกยานพาหนะที่อยู่ใกล้เคียง จาก ResourceAllocation\n\nเรียกยานพาหนะ:\n${callVehicleWebhookUrl}`;

            try {
                await snsClient.send(
                    new PublishCommand({
                        TopicArn: process.env.SNS_TOPIC_ARN,  // rightcall-notify (เฉพาะอาสา)
                        Subject: `[ภารกิจ] ${task_title || "งานใหม่"}`,
                        Message: volunteerMessageBody
                    })
                );
                console.log(`[RightCall] Email sent to Volunteer: ${volunteer_email}`);
            } catch (pubErr) {
                console.error("[RightCall] Failed to send to Volunteer:", pubErr);
            }
        } else {
            console.warn("[RightCall] SNS_TOPIC_ARN is not set. Skipped Volunteer notification.");
        }

        // === ส่งเมลหาผู้ประสบภัย (Victim Topic แยกต่างหาก) ===
        if (victim_email && process.env.SNS_TOPIC_VICTIM_ARN) {
            // Subscribe victim เข้า Topic ของตัวเอง (ไม่ใช่ Topic อาสา)
            try {
                await snsClient.send(
                    new SubscribeCommand({
                        TopicArn: process.env.SNS_TOPIC_VICTIM_ARN,  // rightcall-notify-victim
                        Protocol: "email",
                        Endpoint: victim_email,
                        ReturnSubscriptionArn: true
                    })
                );
                console.log(`[RightCall] Victim ${victim_email} subscribed to victim topic.`);
            } catch (subErr) {
                console.error("[RightCall] Failed to subscribe Victim:", subErr);
            }

            const victimMessageBody = `เรียน ประชาชนที่เคารพ\n\nทางระบบได้รับเรื่องแล้ว และได้จัดอาสาสมัครเพื่อช่วยเหลือคุณเป็นที่เรียบร้อย\nหากต้องการติดต่ออาสาสมัคร สามารถติดต่อได้ทาง\nเบอร์: ${volunteer_phone || "-"}\n\nขอขอบพระคุณที่ใช้บริการ`;

            try {
                await snsClient.send(
                    new PublishCommand({
                        TopicArn: process.env.SNS_TOPIC_VICTIM_ARN,  // rightcall-notify-victim (เฉพาะผู้ประสบภัย)
                        Subject: `[รับเรื่องแล้ว] ${task_title || "แจ้งสถานะ"}`,
                        Message: victimMessageBody
                    })
                );
                console.log(`[RightCall] Email sent to Victim: ${victim_email}`);
            } catch (pubErr) {
                console.error("[RightCall] Failed to send to Victim:", pubErr);
            }
        } else if (victim_email && !process.env.SNS_TOPIC_VICTIM_ARN) {
            console.warn("[RightCall] SNS_TOPIC_VICTIM_ARN is not set. Skipped Victim notification.");
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