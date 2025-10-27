import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import * as crypto from "crypto";
import * as bcrypt from "bcryptjs";

const dbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(dbClient);
const sesClient = new SESClient({});

const OTP_TABLE_NAME = process.env.OTP_TABLE_NAME;
const FROM_EMAIL_ADDRESS = process.env.FROM_EMAIL_ADDRESS;

export const handler = async (event: any) => {
  try {
    const { email } = JSON.parse(event.body);

    if (!email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Email is required" }),
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    // 1. Generate a 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // 2. Hash the OTP
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);

    // 3. Store in DynamoDB with a 5-minute TTL
    const ttl = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now
    const putCommand = new PutCommand({
      TableName: OTP_TABLE_NAME,
      Item: {
        email: email,
        otp: hashedOtp,
        expires: ttl,
      },
    });
    await ddbDocClient.send(putCommand);

    // 4. Send OTP via SES
    const sendEmailCommand = new SendEmailCommand({
      Source: FROM_EMAIL_ADDRESS,
      Destination: {
        ToAddresses: [email],
      },
      Message: {
        Subject: { Data: "Your SmartSchools Admin Portal OTP" },
        Body: {
          Text: { Data: `Your One-Time Password is: ${otp}` },
        },
      },
    });
    await sesClient.send(sendEmailCommand);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "OTP has been sent to your email." }),
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    };
  }
};
