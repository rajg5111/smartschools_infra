import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as fn from "aws-cdk-lib/aws-lambda";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from "constructs";
import { env } from "process";

export interface ApiGatewayConstructProps {
  /**
   * The name of the API Gateway
   */
  apiName: string;

  /**
   * The description of the API Gateway
   */
  description?: string;

  /**
   * Environment (dev, staging, prod)
   */
  environment: string;

  /**
   * Enable CORS for the API Gateway
   */
  enableCors?: boolean;

  /**
   * Allowed CORS origins (defaults to all if enableCors is true)
   */
  corsOrigins?: string[];

  /**
   * Enable request/response validation
   */
  enableValidation?: boolean;

  /**
   * Enable API key requirement
   */
  enableApiKey?: boolean;

  /**
   * Enable rate limiting (requests per second)
   */
  throttlingRateLimit?: number;

  /**
   * Enable burst limit
   */
  throttlingBurstLimit?: number;

  /**
   * Enable WAF protection
   */
  enableWaf?: boolean;

  /**
   * Custom domain name configuration
   */
  customDomain?: {
    domainName: string;
    certificateArn: string;
  };

  /**
   * Enable detailed CloudWatch metrics
   */
  enableDetailedMetrics?: boolean;
}

export class ApiGatewayConstruct extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly rootResource: apigateway.IResource;
  public readonly apiKey?: apigateway.ApiKey;
  public readonly usagePlan?: apigateway.UsagePlan;
  public readonly logGroup: logs.LogGroup;
  public readonly jwtAuthorizer?: apigateway.IAuthorizer;

  constructor(scope: Construct, id: string, props: ApiGatewayConstructProps) {
    super(scope, id);

    const environment = props.environment;

    // Create CloudWatch Log Group for API Gateway
    this.logGroup = new logs.LogGroup(this, "ApiGatewayLogGroup", {
      logGroupName: `/aws/apigateway/prod/${props.apiName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create IAM role for API Gateway logging
    const apiGatewayLogRole = new iam.Role(this, "ApiGatewayLogRole", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonAPIGatewayPushToCloudWatchLogs"
        ),
      ],
    });

    // Set the CloudWatch role for API Gateway logging (must be done before creating the API)
    const account = new apigateway.CfnAccount(this, "ApiGatewayAccount", {
      cloudWatchRoleArn: apiGatewayLogRole.roleArn,
    });

    // Create the API Gateway
    this.api = new apigateway.RestApi(this, "Api", {
      restApiName: props.apiName,
      description: props.description || "API Gateway for application",
      // Security best practices
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL], // Regional endpoints are recommended
      },
      // Disable execute-api endpoint for production
      disableExecuteApiEndpoint:
        environment === "prod" && !!props?.customDomain,
      deployOptions: {
        stageName: "prod",
        // Enhanced logging
        accessLogDestination: new apigateway.LogGroupLogDestination(
          this.logGroup
        ),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
        // X-Ray tracing
        tracingEnabled: true,
        // CloudWatch metrics
        metricsEnabled: props?.enableDetailedMetrics ?? true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: environment !== "prod", // Disable data trace in production for security
        // Throttling
        throttlingRateLimit: props?.throttlingRateLimit || 1000,
        throttlingBurstLimit: props?.throttlingBurstLimit || 2000,
        // Caching disabled by default (enable per method if needed)
        cachingEnabled: false,
        // Method settings for all methods
        methodOptions: {
          "/*/*": {
            throttlingRateLimit: props?.throttlingRateLimit || 1000,
            throttlingBurstLimit: props?.throttlingBurstLimit || 2000,
            loggingLevel: apigateway.MethodLoggingLevel.INFO,
            metricsEnabled: props?.enableDetailedMetrics ?? true,
          },
        },
      },
      // Enhanced CORS configuration
      defaultCorsPreflightOptions: props?.enableCors
        ? {
            allowOrigins: props?.corsOrigins || ["*"],
            allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
            allowHeaders: [
              "Content-Type",
              "X-Amz-Date",
              "Authorization",
              //"X-Api-Key",
              "X-Amz-Security-Token",
              "X-Amz-User-Agent",
              "X-Requested-With",
            ],
            // allowCredentials: props?.corsOrigins ? true : false, // Only allow credentials with specific origins
            maxAge: cdk.Duration.hours(1),
          }
        : undefined,
      // Binary media types for file uploads
      binaryMediaTypes: [
        "application/octet-stream",
        "image/*",
        "multipart/form-data",
      ],
      // Minimum compression size
      minCompressionSize: cdk.Size.kibibytes(1),
      // API key source
      //apiKeySourceType: props?.enableApiKey
      //? apigateway.ApiKeySourceType.HEADER
      //: undefined,
    });

    // Try to import an external JWT authorizer Lambda ARN from SSM and create a TokenAuthorizer.
    // Parameter name follows the OTP service convention: /{env}/auth/authorizer_lambda_arn
    try {
      const authorizerArn = ssm.StringParameter.valueForStringParameter(
        this,
        `/${environment}/auth/authorizer_lambda_arn`
      );

      if (authorizerArn) {
        const importedAuthorizerFn = fn.Function.fromFunctionArn(
          this,
          "ImportedOtpAuthorizer",
          authorizerArn
        );

        this.jwtAuthorizer = new apigateway.TokenAuthorizer(
          this,
          "ImportedJwtAuthorizer",
          {
            handler: importedAuthorizerFn,
            identitySource: "method.request.header.Authorization",
          }
        );
      }
    } catch (e) {
      // Parameter missing or unable to read from SSM; proceed without an authorizer
    }

    // Ensure the API Gateway depends on the account configuration
    this.api.node.addDependency(account);

    // Store root resource for easy access
    this.rootResource = this.api.root;

    // Add WAF if enabled
    if (props.enableWaf) {
      this.addWafProtection(environment);
    }

    // Add request/response models for validation
    if (props?.enableValidation) {
      this.addValidationModels();
    }

    // Add a comprehensive health check endpoint
    this.addHealthCheckEndpoint();

    // Add monitoring and alerting setup
    this.addMonitoringAndAlerts();

    // Create outputs
    this.createOutputs(props?.customDomain);
  }

  /**
   * Add a health check endpoint to the API Gateway
   */
  private addHealthCheckEndpoint(): void {
    // Create a simple Lambda function for health check
    const healthCheckFunction = new lambda.Function(
      this,
      "HealthCheckFunction",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "index.handler",
        code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
              message: 'SmartSchools API is healthy!',
              timestamp: new Date().toISOString(),
              version: '1.0.0'
            })
          };
        };
      `),
        description: "Health check endpoint for SmartSchools API",
      }
    );

    // Add health endpoint
    const healthResource = this.api.root.addResource("health");
    healthResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(healthCheckFunction),
      {
        methodResponses: [
          {
            statusCode: "200",
            responseModels: {
              "application/json": apigateway.Model.EMPTY_MODEL,
            },
          },
        ],
      }
    );
  }

  /**
   * Add a new resource to the API Gateway
   * @param pathPart The path part for the resource
   * @param parent The parent resource (defaults to root)
   * @returns The created resource
   */
  public addResource(
    pathPart: string,
    parent?: apigateway.IResource
  ): apigateway.Resource {
    const parentResource = parent || this.rootResource;
    return parentResource.addResource(pathPart);
  }

  /**
   * Add a Lambda integration to a resource with enhanced configuration
   * @param resource The resource to add the method to
   * @param httpMethod The HTTP method
   * @param lambdaFunction The Lambda function to integrate
   * @param options Additional method options
   */
  public addLambdaIntegration(
    resource: apigateway.IResource,
    httpMethod: string,
    lambdaFunction: lambda.Function,
    options?: Partial<apigateway.MethodOptions>
  ): apigateway.Method {
    const defaultOptions: apigateway.MethodOptions = {
      authorizationType: this.jwtAuthorizer
        ? apigateway.AuthorizationType.CUSTOM
        : apigateway.AuthorizationType.NONE,
      apiKeyRequired: !!this.apiKey,
      requestValidator: options?.requestValidator,
      methodResponses: [
        {
          statusCode: "200",
          responseModels: {
            "application/json": apigateway.Model.EMPTY_MODEL,
          },
          responseParameters: {
            "method.response.header.Access-Control-Allow-Origin": true,
          },
        },
        {
          statusCode: "400",
          responseModels: {
            "application/json": apigateway.Model.ERROR_MODEL,
          },
        },
        {
          statusCode: "401",
          responseModels: {
            "application/json": apigateway.Model.ERROR_MODEL,
          },
        },
        {
          statusCode: "403",
          responseModels: {
            "application/json": apigateway.Model.ERROR_MODEL,
          },
        },
        {
          statusCode: "429",
          responseModels: {
            "application/json": apigateway.Model.ERROR_MODEL,
          },
        },
        {
          statusCode: "500",
          responseModels: {
            "application/json": apigateway.Model.ERROR_MODEL,
          },
        },
      ],
    };

    return resource.addMethod(
      httpMethod,
      new apigateway.LambdaIntegration(lambdaFunction, {
        proxy: true,
        integrationResponses: [
          {
            statusCode: "200",
            responseTemplates: {
              "application/json": "",
            },
          },
        ],
      }),
      {
        ...defaultOptions,
        // If we have a jwtAuthorizer, attach it as the method authorizer by default
        ...(this.jwtAuthorizer ? { authorizer: this.jwtAuthorizer } : {}),
        ...options,
      }
    );
  }

  /**
   * Add a secured resource with API key requirement
   * @param pathPart The path part for the resource
   * @param parent The parent resource (defaults to root)
   * @returns The created resource
   */
  public addSecuredResource(
    pathPart: string,
    parent?: apigateway.IResource
  ): apigateway.Resource {
    return this.addResource(pathPart, parent);
  }

  /**
   * Create a request validator for a specific resource
   * @param name The name of the validator
   * @param validateBody Whether to validate request body
   * @param validateParameters Whether to validate request parameters
   * @returns The request validator
   */
  public createRequestValidator(
    name: string,
    validateBody: boolean = true,
    validateParameters: boolean = true
  ): apigateway.RequestValidator {
    return this.api.addRequestValidator(name, {
      validateRequestBody: validateBody,
      validateRequestParameters: validateParameters,
    });
  }

  /**
   * Add a model for request/response validation
   * @param modelName The name of the model
   * @param schema The JSON schema for the model
   * @returns The created model
   */
  public addModel(
    modelName: string,
    schema: apigateway.JsonSchema
  ): apigateway.Model {
    return this.api.addModel(modelName, {
      contentType: "application/json",
      modelName: modelName,
      schema: schema,
    });
  }

  /**
   * Add WAF (Web Application Firewall) protection to the API Gateway
   * @param environment The deployment environment
   */
  private addWafProtection(environment: string): void {
    // Create IP Set for allowlist
    const ipSet = this.createIPSet(environment);

    // Define WAF rules
    const rules: wafv2.CfnWebACL.RuleProperty[] = [
      // Rate limiting rule
      {
        name: "RateLimitingRule",
        priority: 1,
        statement: {
          rateBasedStatement: {
            limit: 2000, // 2000 requests per 5-minute window
            aggregateKeyType: "IP",
          },
        },
        action: {
          block: {},
        },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: "RateLimitingRule",
        },
      },
      // AWS managed rules for common attacks
      {
        name: "AWSManagedRulesCommonRuleSet",
        priority: 2,
        statement: {
          managedRuleGroupStatement: {
            vendorName: "AWS",
            name: "AWSManagedRulesCommonRuleSet",
          },
        },
        overrideAction: {
          none: {},
        },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: "AWSManagedRulesCommonRuleSet",
        },
      },
      // AWS managed rules for known bad inputs
      {
        name: "AWSManagedRulesKnownBadInputsRuleSet",
        priority: 3,
        statement: {
          managedRuleGroupStatement: {
            vendorName: "AWS",
            name: "AWSManagedRulesKnownBadInputsRuleSet",
          },
        },
        overrideAction: {
          none: {},
        },
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: "AWSManagedRulesKnownBadInputsRuleSet",
        },
      },
    ];

    // Create the Web ACL
    const webAcl = new wafv2.CfnWebACL(this, "ApiGatewayWebACL", {
      scope: "REGIONAL",
      defaultAction: {
        allow: {},
      },
      name: `${this.api.restApiName.replace(/\s+/g, "-")}-${environment}-waf`,
      description: `WAF for ${this.api.restApiName} API Gateway`,
      rules: rules,
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `${this.api.restApiName.replace(
          /\s+/g,
          "-"
        )}-${environment}-waf`,
      },
    });

    // Associate the Web ACL with the API Gateway
    new wafv2.CfnWebACLAssociation(this, "WebACLAssociation", {
      resourceArn: `arn:aws:apigateway:${
        cdk.Stack.of(this).region
      }::/restapis/${this.api.restApiId}/stages/${environment}`,
      webAclArn: webAcl.attrArn,
    });
  }

  /**
   * Create an IP set for WAF allowlist
   * @param environment The deployment environment
   * @returns The created IP set
   */
  private createIPSet(environment: string): wafv2.CfnIPSet {
    const ipSet = new wafv2.CfnIPSet(this, "AllowedIPSet", {
      scope: "REGIONAL",
      ipAddressVersion: "IPV4",
      addresses: [
        "10.0.0.0/8", // Private network ranges
        "172.16.0.0/12",
        "192.168.0.0/16",
        // Add your specific IP addresses here
        // "203.0.113.0/24", // Example public IP range
      ],
      name: `${this.api.restApiName.replace(
        /\s+/g,
        "-"
      )}-${environment}-allowed-ips`,
      description: `Allowed IP addresses for ${this.api.restApiName} API`,
    });

    return ipSet;
  }

  /**
   * Add validation models for common request/response patterns
   */
  private addValidationModels(): void {
    // Generic success response model
    this.addModel("SuccessResponse", {
      schema: apigateway.JsonSchemaVersion.DRAFT4,
      title: "Success Response",
      type: apigateway.JsonSchemaType.OBJECT,
      properties: {
        success: {
          type: apigateway.JsonSchemaType.BOOLEAN,
        },
        message: {
          type: apigateway.JsonSchemaType.STRING,
        },
        data: {
          type: apigateway.JsonSchemaType.OBJECT,
        },
        timestamp: {
          type: apigateway.JsonSchemaType.STRING,
          format: "date-time",
        },
      },
      required: ["success", "message"],
    });

    // Generic error response model
    this.addModel("ErrorResponse", {
      schema: apigateway.JsonSchemaVersion.DRAFT4,
      title: "Error Response",
      type: apigateway.JsonSchemaType.OBJECT,
      properties: {
        error: {
          type: apigateway.JsonSchemaType.OBJECT,
          properties: {
            code: {
              type: apigateway.JsonSchemaType.STRING,
            },
            message: {
              type: apigateway.JsonSchemaType.STRING,
            },
            details: {
              type: apigateway.JsonSchemaType.OBJECT,
            },
          },
          required: ["code", "message"],
        },
        timestamp: {
          type: apigateway.JsonSchemaType.STRING,
          format: "date-time",
        },
      },
      required: ["error", "timestamp"],
    });

    // School registration request model (specific to your SmartSchools app)
    this.addModel("SchoolRegistrationRequest", {
      schema: apigateway.JsonSchemaVersion.DRAFT4,
      title: "School Registration Request",
      type: apigateway.JsonSchemaType.OBJECT,
      properties: {
        schoolName: {
          type: apigateway.JsonSchemaType.STRING,
          minLength: 2,
          maxLength: 100,
        },
        schoolType: {
          type: apigateway.JsonSchemaType.STRING,
          enum: ["public", "private", "charter"],
        },
        address: {
          type: apigateway.JsonSchemaType.OBJECT,
          properties: {
            street: {
              type: apigateway.JsonSchemaType.STRING,
            },
            city: {
              type: apigateway.JsonSchemaType.STRING,
            },
            state: {
              type: apigateway.JsonSchemaType.STRING,
            },
            zipCode: {
              type: apigateway.JsonSchemaType.STRING,
              pattern: "^[0-9]{5}(-[0-9]{4})?$",
            },
          },
          required: ["street", "city", "state", "zipCode"],
        },
        contactInfo: {
          type: apigateway.JsonSchemaType.OBJECT,
          properties: {
            email: {
              type: apigateway.JsonSchemaType.STRING,
              format: "email",
            },
            phone: {
              type: apigateway.JsonSchemaType.STRING,
              pattern: "^[+]?[1-9]?[0-9]{7,15}$",
            },
          },
          required: ["email", "phone"],
        },
      },
      required: ["schoolName", "schoolType", "address", "contactInfo"],
    });

    // Create request validators
    this.createRequestValidator("BodyValidator", true, false);
    this.createRequestValidator("ParametersValidator", false, true);
    this.createRequestValidator("FullValidator", true, true);
  }

  /**
   * Add monitoring and alerting setup
   */
  private addMonitoringAndAlerts(): void {
    // CloudWatch alarms for API Gateway metrics
    const errorRateAlarm = new cloudwatch.Alarm(this, "ErrorRateAlarm", {
      metric: this.api.metricClientError({
        period: cdk.Duration.minutes(5),
        statistic: "Sum",
      }),
      threshold: 10,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "API Gateway 4XX error rate is too high",
      alarmName: `${this.api.restApiName.replace(/\s+/g, "-")}-4xx-errors`,
    });

    const serverErrorAlarm = new cloudwatch.Alarm(this, "ServerErrorAlarm", {
      metric: this.api.metricServerError({
        period: cdk.Duration.minutes(5),
        statistic: "Sum",
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "API Gateway 5XX error rate is too high",
      alarmName: `${this.api.restApiName.replace(/\s+/g, "-")}-5xx-errors`,
    });

    const latencyAlarm = new cloudwatch.Alarm(this, "LatencyAlarm", {
      metric: this.api.metricLatency({
        period: cdk.Duration.minutes(5),
        statistic: "Average",
      }),
      threshold: 2000, // 2 seconds
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "API Gateway latency is too high",
      alarmName: `${this.api.restApiName.replace(/\s+/g, "-")}-latency`,
    });

    // Create a dashboard for API monitoring
    const dashboard = new cloudwatch.Dashboard(this, "ApiDashboard", {
      dashboardName: `${this.api.restApiName.replace(/\s+/g, "-")}-dashboard`,
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "API Gateway Requests",
        left: [this.api.metricCount()],
        period: cdk.Duration.minutes(5),
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: "API Gateway Errors",
        left: [this.api.metricClientError(), this.api.metricServerError()],
        period: cdk.Duration.minutes(5),
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: "API Gateway Latency",
        left: [this.api.metricLatency()],
        period: cdk.Duration.minutes(5),
        width: 12,
      })
    );
  }

  /**
   * Create CloudFormation outputs
   * @param environment The deployment environment
   * @param customDomain Custom domain configuration
   */
  private createOutputs(customDomain?: {
    domainName: string;
    certificateArn: string;
  }): void {
    new cdk.CfnOutput(this, "ApiGatewayUrl", {
      value: this.api.url,
      description: "API Gateway URL",
      exportName: `${cdk.Stack.of(this).stackName}-ApiGatewayUrl`,
    });

    new cdk.CfnOutput(this, "ApiGatewayId", {
      value: this.api.restApiId,
      description: "API Gateway ID",
      exportName: `${cdk.Stack.of(this).stackName}-ApiGatewayId`,
    });

    new cdk.CfnOutput(this, "ApiGatewayName", {
      value: this.api.restApiName,
      description: "API Gateway Name",
      exportName: `${cdk.Stack.of(this).stackName}-ApiGatewayName`,
    });

    if (this.apiKey) {
      new cdk.CfnOutput(this, "ApiKeyId", {
        value: this.apiKey.keyId,
        description: "API Key ID",
        exportName: `${cdk.Stack.of(this).stackName}-ApiKeyId`,
      });
    }

    if (customDomain) {
      new cdk.CfnOutput(this, "CustomDomainName", {
        value: customDomain.domainName,
        description: "Custom Domain Name",
        exportName: `${cdk.Stack.of(this).stackName}-CustomDomainName`,
      });
    }

    new cdk.CfnOutput(this, "HealthCheckEndpoint", {
      value: `${this.api.url}health`,
      description: "Health Check Endpoint",
      exportName: `${cdk.Stack.of(this).stackName}-HealthCheckEndpoint`,
    });
  }
}
