// src/models/alertRecordDB.js
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

// ตั้งค่าการเชื่อมต่อ DynamoDB
const client = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-southeast-1" });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.ALERT_TABLE;

// ฟังก์ชันสำหรับบันทึกแจ้งเตือนใหม่ลง Database
const saveAlert = async (alertData) => {
    const params = {
        TableName: TABLE_NAME,
        Item: alertData,
    };
    await docClient.send(new PutCommand(params));
    return alertData;
};

// ฟังก์ชันสำหรับดึงข้อมูลแจ้งเตือนทั้งหมด (สำหรับการค้นหา/ดูประวัติ)
const getAllAlerts = async () => {
    const params = {
        TableName: TABLE_NAME,
    };
    const { Items } = await docClient.send(new ScanCommand(params));
    return Items;
};

module.exports = {
    saveAlert,
    getAllAlerts
};