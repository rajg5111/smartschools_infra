import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { ApiGatewayConstruct } from "./constructs";

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
      apiName: "SmartSchools API",
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
