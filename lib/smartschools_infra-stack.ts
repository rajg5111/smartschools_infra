import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  ApiGatewayConstruct,
  DynamoDBConstruct,
  LambdaConstruct,
} from "./constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";

export interface SmartschoolsInfraStackProps extends cdk.StackProps {
  //  state?: string;
  environment: string;
}

export class SmartschoolsInfraStack extends cdk.Stack {
  private readonly context: {
    // state?: string;
    environment: string;
  };

  constructor(
    scope: Construct,
    id: string,
    props: SmartschoolsInfraStackProps
  ) {
    super(scope, id, props);

    // Extract context from props, CDK context, or use defaults
    this.context = {
      // state: props?.state,
      environment: props.environment,
    };

    // Use state as stage for API Gateway
    // const stage = this.context.state;

    // Create enhanced API Gateway with best practices
    const apiGateway = new ApiGatewayConstruct(this, "AdminApiGateway", {
      apiName: `SchoolAPI-${this.context.environment}`,
      description:
        "REST API for SmartSchools application with enterprise-grade security and monitoring",
      environment: this.context.environment,
      enableCors: true,
      corsOrigins: this.getCorsOrigins(this.context.environment),
      enableValidation: true,
      //enableApiKey: this.context.environment === "production",
      // throttlingRateLimit: this.getThrottlingRateLimit(
      //   this.context.environment
      // ),
      // throttlingBurstLimit: this.getThrottlingBurstLimit(
      //   this.context.environment
      // ),
      enableWaf: false,
      enableDetailedMetrics: false,
    });

    // Add example API resources with proper structure
    //this.addApiResources(apiGateway);
    //Read-only role for reporting and analytics
    const readOnlyRole = new iam.Role(this, "DynamoDBReadOnlyRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: `Read-only access to DynamoDB tables`,
      roleName: `DynamoDB-ReadOnly-${this.context.environment}`,
    });

    // Read-write role for application operations
    const readWriteRole = new iam.Role(this, "DynamoDBReadWriteRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: `Read-write access to DynamoDB tables`,
      roleName: `DynamoDB-ReadWrite-${this.context.environment}`,
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
        // Additional Lambda functions can be added here
      ],
    });

    // Grant Lambda functions permissions to access DynamoDB
    // This is already handled by the additionalPolicies above, but here's an alternative approach:
    // dynamoDBConstruct.table.grantReadWriteData(lambdaConstruct.getFunction("school-api")!);

    // Integrate Lambda functions with API Gateway
    this.addApiResources(apiGateway, lambdaConstruct);

    // Add tags for better resource management
    cdk.Tags.of(this).add("Project", "SmartSchools");
    cdk.Tags.of(this).add("Environment", this.context.environment);
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
   * Add API resources with proper structure, validation, and Lambda integrations
   */
  private addApiResources(
    apiGateway: ApiGatewayConstruct,
    lambdaConstruct: LambdaConstruct
  ): void {
    // Create API version prefix
    const v1Resource = apiGateway.addResource("v1");

    // Schools management endpoints
    const schoolsResource = apiGateway.addResource("schools", v1Resource);

    // Get Lambda function references
    const schoolsListFunction = lambdaConstruct.getFunction("schools-list");
    const schoolsCreateFunction = lambdaConstruct.getFunction("schools-create");
    const schoolsGetFunction = lambdaConstruct.getFunction("schools-get");
    const schoolsUpdateFunction = lambdaConstruct.getFunction("schools-update");
    const schoolsDeleteFunction = lambdaConstruct.getFunction("schools-delete");

    // Create validation models and validators
    const { createSchoolModel, updateSchoolModel } =
      this.createSchoolValidationModels(apiGateway);
    const requestValidator = apiGateway.createRequestValidator(
      "SchoolRequestValidator",
      true,
      true
    );

    // Schools endpoints with Lambda integrations and validation
    if (schoolsListFunction) {
      // GET /v1/schools - List all schools (query parameter validation)
      apiGateway.addLambdaIntegration(
        schoolsResource,
        "GET",
        schoolsListFunction,
        {
          requestValidator: requestValidator,
          requestParameters: {
            "method.request.querystring.limit": false,
            "method.request.querystring.offset": false,
            "method.request.querystring.search": false,
          },
        }
      );
    }

    if (schoolsCreateFunction) {
      // POST /v1/schools - Create a new school (body validation)
      apiGateway.addLambdaIntegration(
        schoolsResource,
        "POST",
        schoolsCreateFunction,
        {
          requestValidator: requestValidator,
          requestModels: {
            "application/json": createSchoolModel,
          },
        }
      );
    }

    // School by ID resource
    const schoolByIdResource = apiGateway.addResource(
      "{schoolId}",
      schoolsResource
    );

    if (schoolsGetFunction) {
      // GET /v1/schools/{schoolId} - Get specific school (path parameter validation)
      apiGateway.addLambdaIntegration(
        schoolByIdResource,
        "GET",
        schoolsGetFunction,
        {
          requestValidator: requestValidator,
          requestParameters: {
            "method.request.path.schoolId": true, // Required path parameter
          },
        }
      );
    }

    if (schoolsUpdateFunction) {
      // PUT /v1/schools/{schoolId} - Update school (path + body validation)
      apiGateway.addLambdaIntegration(
        schoolByIdResource,
        "PUT",
        schoolsUpdateFunction,
        {
          requestValidator: requestValidator,
          requestParameters: {
            "method.request.path.schoolId": true, // Required path parameter
          },
          requestModels: {
            "application/json": updateSchoolModel,
          },
        }
      );
    }

    if (schoolsDeleteFunction) {
      // DELETE /v1/schools/{schoolId} - Delete school (path parameter validation)
      apiGateway.addLambdaIntegration(
        schoolByIdResource,
        "DELETE",
        schoolsDeleteFunction,
        {
          requestValidator: requestValidator,
          requestParameters: {
            "method.request.path.schoolId": true, // Required path parameter
            "method.request.querystring.soft": false, // Optional query param for soft delete
          },
        }
      );
    }
  }

  /**
   * Create JSON Schema validation models for school endpoints
   * Models match the exact DynamoDB table structure defined in this stack
   */

  private createSchoolValidationModels(apiGateway: ApiGatewayConstruct): {
    createSchoolModel: any;
    updateSchoolModel: any;
  } {
    const schoolProperties = {
      school_name: {
        type: apigateway.JsonSchemaType.STRING,
        minLength: 2,
        maxLength: 100,
        description: "Official name of the school (GSI partition key)",
      },
      location: {
        type: apigateway.JsonSchemaType.STRING,
        minLength: 2,
        maxLength: 100,
        description: "School location - city, suburb, etc. (GSI sort key)",
      },
      primary_contact_email: {
        type: apigateway.JsonSchemaType.STRING,
        format: "email",
        maxLength: 100,
        description: "Primary contact's email address",
      },
      primary_contact_phone: {
        type: apigateway.JsonSchemaType.STRING,
        pattern: "^[+]?[0-9\\s\\-\\(\\)]{8,20}$",
        description: "Primary contact's phone number",
      },
      primary_contact_staff_id: {
        type: apigateway.JsonSchemaType.STRING,
        minLength: 1,
        maxLength: 50,
        description: "Primary contact's staff ID",
      },
    };
    // School creation model - matches DynamoDB table structure exactly
    const createSchoolModel = apiGateway.addModel("CreateSchoolModel", {
      type: apigateway.JsonSchemaType.OBJECT,
      required: [
        "school_unique_code",
        "school_name",
        "location",
        "primary_contact_email",
        "primary_contact_phone",
        "primary_contact_staff_id",
      ],
      properties: {
        ...schoolProperties,
        school_unique_code: {
          type: apigateway.JsonSchemaType.STRING,
          minLength: 3,
          maxLength: 50,
          pattern: "^[A-Z0-9_-]+$",
          description: "Unique identifier for the school (partition key)",
        },
      },
      additionalProperties: true, // Allow additional attributes as DynamoDB is schema-less
    });

    // School update model - all DynamoDB fields optional except school_unique_code cannot be updated
    const updateSchoolModel = apiGateway.addModel("UpdateSchoolModel", {
      type: apigateway.JsonSchemaType.OBJECT,
      minProperties: 1, // At least one field must be provided for update
      properties: schoolProperties,
      additionalProperties: true, // Allow additional attributes as DynamoDB is schema-less
    });

    return {
      createSchoolModel,
      updateSchoolModel,
    };
  }
}
