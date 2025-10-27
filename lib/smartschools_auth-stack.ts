import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";

export interface SmartSchoolsAuthStackProps extends cdk.StackProps {
  userPoolId: string;
  userPoolClientId: string;
}

export class SmartSchoolsAuthStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly jwtAuthorizer: apigateway.IAuthorizer;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB table to store OTPs
    const otpTable = new dynamodb.Table(this, "OtpTable", {
      partitionKey: { name: "email", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: "expires",
    });

    // Secret for JWT
    const jwtSecret = new secretsmanager.Secret(this, "JwtSecret", {
      secretName: "smartschools/jwt-secret",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: "key",
        excludePunctuation: true,
        includeSpace: false,
      },
    });

    // API Gateway
    this.api = new apigateway.RestApi(this, "AuthApi", {
      restApiName: "SmartSchools Auth Service",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // Lambda for requesting OTP
    const requestOtpLambda = new NodejsFunction(this, "RequestOtpHandler", {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: "lambda/auth-request-otp/index.ts",
      handler: "handler",
      environment: {
        OTP_TABLE_NAME: otpTable.tableName,
        FROM_EMAIL_ADDRESS:
          process.env.FROM_EMAIL_ADDRESS || "noreply@smartschools.com", // Configure a verified SES email
      },
    });

    // Lambda for verifying OTP and generating JWT
    const verifyOtpLambda = new NodejsFunction(this, "VerifyOtpHandler", {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: "lambda/auth-verify-otp/index.ts",
      handler: "handler",
      environment: {
        OTP_TABLE_NAME: otpTable.tableName,
        JWT_SECRET_ARN: jwtSecret.secretArn,
      },
    });

    // Grant permissions
    otpTable.grantReadWriteData(requestOtpLambda);
    otpTable.grantReadWriteData(verifyOtpLambda);
    jwtSecret.grantRead(verifyOtpLambda);

    // SES send email permission for request-otp lambda
    requestOtpLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: ["*"], // It's better to restrict this to your SES identity ARN
      })
    );

    // API Gateway Integrations
    const requestOtpIntegration = new apigateway.LambdaIntegration(
      requestOtpLambda
    );
    const verifyOtpIntegration = new apigateway.LambdaIntegration(
      verifyOtpLambda
    );

    const authResource = this.api.root.addResource("auth");
    authResource
      .addResource("request-otp")
      .addMethod("POST", requestOtpIntegration);
    authResource
      .addResource("verify-otp")
      .addMethod("POST", verifyOtpIntegration);

    // JWT Authorizer Lambda
    const authorizerLambda = new NodejsFunction(this, "JwtAuthorizerLambda", {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: "lambda/auth-jwt-authorizer/index.ts",
      handler: "handler",
      environment: {
        JWT_SECRET_ARN: jwtSecret.secretArn,
      },
    });
    jwtSecret.grantRead(authorizerLambda);

    this.jwtAuthorizer = new apigateway.TokenAuthorizer(
      this,
      "JwtRequestAuthorizer",
      {
        handler: authorizerLambda,
        identitySource: "method.request.header.Authorization",
      }
    );
  }
}
