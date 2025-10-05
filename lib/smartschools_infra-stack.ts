import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  ApiGatewayConstruct,
  DynamoDBConstruct,
  LambdaConstruct,
} from "./constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";

export interface SmartschoolsInfraStackProps extends cdk.StackProps {
  state?: string;
  environment?: string;
}

export class SmartschoolsInfraStack extends cdk.Stack {
  private readonly context: {
    state: string;
    environment: string;
  };

  constructor(
    scope: Construct,
    id: string,
    props?: SmartschoolsInfraStackProps
  ) {
    super(scope, id, props);

    // Extract context from props, CDK context, or use defaults
    this.context = {
      state: props?.state || this.node.tryGetContext("state") || "dev",
      environment:
        props?.environment ||
        this.node.tryGetContext("environment") ||
        "development",
    };

    // Use state as stage for API Gateway
    const stage = this.context.state;

    // Create enhanced API Gateway with best practices
    const apiGateway = new ApiGatewayConstruct(this, "SmartSchoolsApiGateway", {
      apiName: "SmartSchoolsAPI",
      description:
        "REST API for SmartSchools application with enterprise-grade security and monitoring",
      stage: stage,
      enableCors: true,
      corsOrigins: this.getCorsOrigins(this.context.environment),
      enableValidation: true,
      //enableApiKey: this.context.environment === "production",
      throttlingRateLimit: this.getThrottlingRateLimit(
        this.context.environment
      ),
      throttlingBurstLimit: this.getThrottlingBurstLimit(
        this.context.environment
      ),
      enableWaf: false,
      enableDetailedMetrics: false,
    });

    // Add example API resources with proper structure
    //this.addApiResources(apiGateway);
    //Read-only role for reporting and analytics
    const readOnlyRole = new iam.Role(this, "DynamoDBReadOnlyRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: `Read-only access to DynamoDB tables`,
      roleName: `DynamoDB-ReadOnly-${this.node.tryGetContext("environment")}`,
    });

    // Read-write role for application operations
    const readWriteRole = new iam.Role(this, "DynamoDBReadWriteRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: `Read-write access to DynamoDB tables`,
      roleName: `DynamoDB-ReadWrite-${this.node.tryGetContext("environment")}`,
    });
    const basicLambdaPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName(
      "service-role/AWSLambdaBasicExecutionRole"
    );

    readOnlyRole.addManagedPolicy(basicLambdaPolicy);
    readWriteRole.addManagedPolicy(basicLambdaPolicy);
    new DynamoDBConstruct(this, "SmartSchoolsDynamoDB", {
      table: {
        tableName: `school-master`,
        partitionKey: {
          name: "school_unique_code",
          type: cdk.aws_dynamodb.AttributeType.STRING,
        },
        // sortKey: { name: "SK", type: cdk.aws_dynamodb.AttributeType.STRING },
        columns: [
          {
            name: "school_name",
            type: cdk.aws_dynamodb.AttributeType.STRING,
          },
          {
            name: "location",
            type: cdk.aws_dynamodb.AttributeType.STRING,
          },
          {
            name: "primary_contact_email",
            type: cdk.aws_dynamodb.AttributeType.STRING,
          },
          {
            name: "primary_contact_phone",
            type: cdk.aws_dynamodb.AttributeType.STRING,
          },
          {
            name: "primary_contact_staff_id",
            type: cdk.aws_dynamodb.AttributeType.STRING,
          },
        ],
        globalSecondaryIndexes: [
          {
            indexName: "SchoolNameGSI",
            partitionKey: {
              name: "school_name",
              type: cdk.aws_dynamodb.AttributeType.STRING,
            },
            sortKey: {
              name: "location",
              type: cdk.aws_dynamodb.AttributeType.STRING,
            },
            projectionType: cdk.aws_dynamodb.ProjectionType.ALL,
          },
        ],
      },
      projectName: "SmartSchools",
      environment: this.context.environment,
      readOnlyRole: readOnlyRole,
      readWriteRole: readWriteRole,
    });

    // Create Lambda functions with Docker containers
    const lambdaConstruct = new LambdaConstruct(this, "SmartSchoolsLambda", {
      environment: this.context.environment,
      projectName: "SmartSchools",
      commonEnvironment: {
        SCHOOLS_TABLE_NAME: `school-master-${this.context.environment}`,
        LOG_LEVEL: this.context.environment === "production" ? "warn" : "debug",
      },
      defaultTimeout: cdk.Duration.seconds(30),
      defaultMemorySize: 128,
      functions: [
        // List Schools Lambda
        {
          functionName: "schools-list",
          dockerImage: {
            build: {
              directory: "./lambda/schools-list",
              file: "Dockerfile",
            },
          },
          description: "List all schools with pagination support",
          timeout: cdk.Duration.seconds(30),
          memorySize: 256,
          enableTracing: true,
          logRetention: logs.RetentionDays.ONE_WEEK,
          additionalPolicies: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["dynamodb:Scan"],
              resources: [
                `arn:aws:dynamodb:${this.region}:${this.account}:table/school-master-${this.context.environment}`,
              ],
            }),
          ],
        },
        // Create School Lambda
        {
          functionName: "schools-create",
          dockerImage: {
            build: {
              directory: "./lambda/schools-create",
              file: "Dockerfile",
            },
          },
          description: "Create a new school record",
          timeout: cdk.Duration.seconds(30),
          memorySize: 256,
          enableTracing: true,
          logRetention: logs.RetentionDays.ONE_WEEK,
          additionalPolicies: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["dynamodb:GetItem", "dynamodb:PutItem"],
              resources: [
                `arn:aws:dynamodb:${this.region}:${this.account}:table/school-master-${this.context.environment}`,
              ],
            }),
          ],
        },
        // Get School Lambda
        {
          functionName: "schools-get",
          dockerImage: {
            build: {
              directory: "./lambda/schools-get",
              file: "Dockerfile",
            },
          },
          description: "Get a specific school by ID",
          timeout: cdk.Duration.seconds(15),
          memorySize: 128,
          enableTracing: true,
          logRetention: logs.RetentionDays.ONE_WEEK,
          additionalPolicies: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["dynamodb:GetItem"],
              resources: [
                `arn:aws:dynamodb:${this.region}:${this.account}:table/school-master-${this.context.environment}`,
              ],
            }),
          ],
        },
        // Update School Lambda
        {
          functionName: "schools-update",
          dockerImage: {
            build: {
              directory: "./lambda/schools-update",
              file: "Dockerfile",
            },
          },
          description: "Update an existing school record",
          timeout: cdk.Duration.seconds(30),
          memorySize: 256,
          enableTracing: true,
          logRetention: logs.RetentionDays.ONE_WEEK,
          additionalPolicies: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
              resources: [
                `arn:aws:dynamodb:${this.region}:${this.account}:table/school-master-${this.context.environment}`,
              ],
            }),
          ],
        },
        // Delete School Lambda
        {
          functionName: "schools-delete",
          dockerImage: {
            build: {
              directory: "./lambda/schools-delete",
              file: "Dockerfile",
            },
          },
          description: "Delete a school record (soft or hard delete)",
          timeout: cdk.Duration.seconds(30),
          memorySize: 256,
          enableTracing: true,
          logRetention: logs.RetentionDays.ONE_WEEK,
          additionalPolicies: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "dynamodb:GetItem",
                "dynamodb:DeleteItem",
                "dynamodb:UpdateItem",
              ],
              resources: [
                `arn:aws:dynamodb:${this.region}:${this.account}:table/school-master-${this.context.environment}`,
              ],
            }),
          ],
        },
        // {
        //   functionName: "school-notification",
        //   dockerImage: {
        //     build: {
        //       directory: "./lambda/school-notification",
        //       file: "Dockerfile",
        //     },
        //   },
        //   description: "School notification service for sending alerts",
        //   timeout: cdk.Duration.seconds(45),
        //   memorySize: 256,
        //   enableTracing: false,
        //   additionalPolicies: [
        //     new iam.PolicyStatement({
        //       effect: iam.Effect.ALLOW,
        //       actions: ["ses:SendEmail", "ses:SendRawEmail", "sns:Publish"],
        //       resources: ["*"],
        //     }),
        //   ],
        // },
      ],
    });

    // Grant Lambda functions permissions to access DynamoDB
    // This is already handled by the additionalPolicies above, but here's an alternative approach:
    // dynamoDBConstruct.table.grantReadWriteData(lambdaConstruct.getFunction("school-api")!);

    // Add tags for better resource management
    cdk.Tags.of(this).add("Project", "SmartSchools");
    cdk.Tags.of(this).add("Environment", this.context.environment);
    cdk.Tags.of(this).add("State", this.context.state);
    cdk.Tags.of(this).add("ManagedBy", "CDK");
  }

  /**
   * Get CORS origins based on environment
   */
  private getCorsOrigins(environment: string): string[] {
    switch (environment) {
      case "production":
        return [
          "https://smartschools.com",
          "https://www.smartschools.com",
          "https://app.smartschools.com",
        ];
      case "staging":
        return [
          "https://staging.smartschools.com",
          "https://staging-app.smartschools.com",
        ];
      case "development":
      default:
        return ["http://localhost:3000", "http://localhost:5173"]; // Common dev ports
    }
  }

  /**
   * Get throttling rate limit based on environment
   */
  private getThrottlingRateLimit(environment: string): number {
    switch (environment) {
      case "production":
        return 1000;
      case "staging":
        return 500;
      case "development":
      default:
        return 100;
    }
  }

  /**
   * Get throttling burst limit based on environment
   */
  private getThrottlingBurstLimit(environment: string): number {
    switch (environment) {
      case "production":
        return 2000;
      case "staging":
        return 1000;
      case "development":
      default:
        return 200;
    }
  }

  /**
   * Add API resources with proper structure
   */
  private addApiResources(apiGateway: ApiGatewayConstruct): void {
    // Create API version prefix
    const v1Resource = apiGateway.addResource("v1");

    // Authentication endpoints
    const authResource = apiGateway.addResource("auth", v1Resource);
    // authResource.addMethod("POST"); // Login endpoint
    // authResource.addResource("refresh").addMethod("POST"); // Token refresh
    // authResource.addResource("logout").addMethod("POST"); // Logout

    // Schools management endpoints
    const schoolsResource = apiGateway.addResource("schools", v1Resource);
    // schoolsResource.addMethod("GET"); // List schools
    // schoolsResource.addMethod("POST"); // Create school
    // schoolsResource.addResource("{schoolId}").addMethod("GET"); // Get specific school
    // schoolsResource.addResource("{schoolId}").addMethod("PUT"); // Update school
    // schoolsResource.addResource("{schoolId}").addMethod("DELETE"); // Delete school

    // Users management endpoints
    const usersResource = apiGateway.addResource("users", v1Resource);
    // usersResource.addMethod("GET"); // List users
    // usersResource.addMethod("POST"); // Create user
    // usersResource.addResource("{userId}").addMethod("GET"); // Get specific user
    // usersResource.addResource("{userId}").addMethod("PUT"); // Update user
    // usersResource.addResource("{userId}").addMethod("DELETE"); // Delete user

    // Administrative endpoints
    const adminResource = apiGateway.addResource("admin", v1Resource);
    // adminResource.addResource("metrics").addMethod("GET"); // System metrics
    // adminResource.addResource("logs").addMethod("GET"); // System logs

    // File upload/download endpoints
    const filesResource = apiGateway.addResource("files", v1Resource);
    // filesResource.addMethod("POST"); // Upload file
    // filesResource.addResource("{fileId}").addMethod("GET"); // Download file
    // filesResource.addResource("{fileId}").addMethod("DELETE"); // Delete file
  }

  /**
   * Get the current context (state and environment)
   */
  public getContext(): { state: string; environment: string } {
    return { ...this.context };
  }

  /**
   * Check if the current environment is production
   */
  public isProduction(): boolean {
    return this.context.environment === "production";
  }

  /**
   * Check if the current state is prod
   */
  public isProdState(): boolean {
    return this.context.state === "prod";
  }

  /**
   * Get environment-specific resource name
   */
  public getResourceName(baseName: string): string {
    return `${baseName}-${this.context.state}-${this.context.environment}`;
  }
}
