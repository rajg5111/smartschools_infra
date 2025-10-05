import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";

/**
 * Configuration for a Docker-based Lambda function
 */
export interface DockerLambdaConfig {
  /**
   * The function name
   */
  functionName: string;

  /**
   * The Docker image URI or build configuration
   */
  dockerImage: {
    /**
     * Existing ECR image URI (optional)
     */
    imageUri?: string;

    /**
     * Docker build configuration (optional)
     */
    build?: {
      /**
       * Path to the directory containing the Dockerfile
       */
      directory: string;

      /**
       * Dockerfile name (default: 'Dockerfile')
       */
      file?: string;

      /**
       * Build arguments
       */
      buildArgs?: { [key: string]: string };

      /**
       * Target stage for multi-stage builds
       */
      target?: string;
    };
  };

  /**
   * Environment variables for the Lambda function
   */
  environment?: { [key: string]: string };

  /**
   * Lambda function timeout (default: 30 seconds)
   */
  timeout?: cdk.Duration;

  /**
   * Lambda function memory size (default: 128 MB)
   */
  memorySize?: number;

  /**
   * Lambda function description
   */
  description?: string;

  /**
   * IAM policies to attach to the Lambda execution role
   */
  additionalPolicies?: iam.PolicyStatement[];

  /**
   * Log retention period (default: 7 days)
   */
  logRetention?: logs.RetentionDays;

  /**
   * Whether to enable X-Ray tracing (default: false)
   */
  enableTracing?: boolean;

  /**
   * VPC configuration (optional)
   */
  vpc?: {
    vpcId: string;
    subnetIds: string[];
    securityGroupIds: string[];
  };

  /**
   * Reserved concurrency (optional)
   */
  reservedConcurrency?: number;
}

/**
 * Properties for the Lambda construct
 */
export interface LambdaConstructProps {
  /**
   * The environment (e.g., 'development', 'production')
   */
  environment: string;

  /**
   * Project name for tagging and naming
   */
  projectName: string;

  /**
   * Lambda function configurations
   */
  functions: DockerLambdaConfig[];

  /**
   * Common environment variables for all functions
   */
  commonEnvironment?: { [key: string]: string };

  /**
   * Default timeout for all functions (can be overridden per function)
   */
  defaultTimeout?: cdk.Duration;

  /**
   * Default memory size for all functions (can be overridden per function)
   */
  defaultMemorySize?: number;
}

/**
 * Lambda construct for creating Docker-based Lambda functions
 */
export class LambdaConstruct extends Construct {
  public readonly functions: Map<string, lambda.Function> = new Map();
  public readonly executionRoles: Map<string, iam.Role> = new Map();

  constructor(scope: Construct, id: string, props: LambdaConstructProps) {
    super(scope, id);

    const environment = props.environment;
    const projectName = props.projectName;

    // Create Lambda functions
    props.functions.forEach((functionConfig) => {
      this.createDockerLambdaFunction(
        {
          ...functionConfig,
          environment: {
            ...props.commonEnvironment,
            ...functionConfig.environment,
          },
          timeout:
            functionConfig.timeout ||
            props.defaultTimeout ||
            cdk.Duration.seconds(30),
          memorySize:
            functionConfig.memorySize || props.defaultMemorySize || 128,
        },
        environment,
        projectName
      );
    });
  }

  private createDockerLambdaFunction(
    config: DockerLambdaConfig,
    environment: string,
    projectName: string
  ): void {
    const functionName = `${config.functionName}-${environment}`;

    // Create execution role
    const executionRole = new iam.Role(
      this,
      `${config.functionName}ExecutionRole`,
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        roleName: `${projectName}-${config.functionName}-ExecutionRole-${environment}`,
        description: `Execution role for ${config.functionName} Lambda function`,
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole"
          ),
        ],
      }
    );

    // Add VPC execution role if VPC is configured
    if (config.vpc) {
      executionRole.addManagedPolicy(
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaVPCAccessExecutionRole"
        )
      );
    }

    // Add X-Ray tracing permissions if enabled
    if (config.enableTracing) {
      executionRole.addManagedPolicy(
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess")
      );
    }

    // Add additional policies if provided
    if (config.additionalPolicies) {
      config.additionalPolicies.forEach((policy) => {
        executionRole.addToPolicy(policy);
      });
    }

    // Determine the Lambda code source
    let code: lambda.Code;

    if (config.dockerImage.imageUri) {
      // Use existing ECR image URI
      code = lambda.Code.fromEcrImage(
        ecr.Repository.fromRepositoryArn(
          this,
          `${config.functionName}Repository`,
          config.dockerImage.imageUri
        )
      );
    } else if (config.dockerImage.build) {
      // Build Docker image from source
      const buildOptions: any = {
        file: config.dockerImage.build.file,
        buildArgs: config.dockerImage.build.buildArgs,
      };

      // Add target if specified (for multi-stage builds)
      if (config.dockerImage.build.target) {
        buildOptions.target = config.dockerImage.build.target;
      }

      code = lambda.Code.fromDockerBuild(
        config.dockerImage.build.directory,
        buildOptions
      );
    } else {
      throw new Error(
        `Either imageUri or build configuration must be provided for ${config.functionName}`
      );
    }

    // Create the Lambda function
    const lambdaFunction = new lambda.Function(
      this,
      `${config.functionName}Function`,
      {
        functionName: functionName,
        runtime: lambda.Runtime.FROM_IMAGE,
        code: code,
        handler: lambda.Handler.FROM_IMAGE,
        role: executionRole,
        environment: config.environment,
        timeout: config.timeout,
        memorySize: config.memorySize,
        description:
          config.description || `${config.functionName} Lambda function`,
        tracing: config.enableTracing
          ? lambda.Tracing.ACTIVE
          : lambda.Tracing.DISABLED,
        logRetention: config.logRetention || logs.RetentionDays.ONE_WEEK,
      }
    );

    // Set reserved concurrency if specified
    if (config.reservedConcurrency !== undefined) {
      lambdaFunction.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["lambda:PutReservedConcurrencyConfig"],
          resources: [lambdaFunction.functionArn],
        })
      );
      // Note: Reserved concurrency must be set via API call or console after deployment
    }

    // Store references
    this.functions.set(config.functionName, lambdaFunction);
    this.executionRoles.set(config.functionName, executionRole);

    // Create outputs
    new cdk.CfnOutput(this, `${config.functionName}FunctionName`, {
      value: lambdaFunction.functionName,
      description: `${config.functionName} Lambda function name`,
      exportName: `${projectName}-${config.functionName}-FunctionName-${environment}`,
    });

    new cdk.CfnOutput(this, `${config.functionName}FunctionArn`, {
      value: lambdaFunction.functionArn,
      description: `${config.functionName} Lambda function ARN`,
      exportName: `${projectName}-${config.functionName}-FunctionArn-${environment}`,
    });

    // Add tags
    cdk.Tags.of(lambdaFunction).add("Environment", environment);
    cdk.Tags.of(lambdaFunction).add("Project", projectName);
    cdk.Tags.of(lambdaFunction).add("ManagedBy", "CDK");
    cdk.Tags.of(lambdaFunction).add("Function", config.functionName);
  }

  /**
   * Get a Lambda function by name
   */
  public getFunction(functionName: string): lambda.Function | undefined {
    return this.functions.get(functionName);
  }

  /**
   * Get an execution role by function name
   */
  public getExecutionRole(functionName: string): iam.Role | undefined {
    return this.executionRoles.get(functionName);
  }

  /**
   * Get all function names
   */
  public getAllFunctionNames(): string[] {
    return Array.from(this.functions.keys());
  }

  /**
   * Grant permissions to invoke a specific function
   */
  public grantInvoke(functionName: string, principal: iam.IPrincipal): void {
    const func = this.getFunction(functionName);
    if (func) {
      func.grantInvoke(principal);
    } else {
      throw new Error(`Function ${functionName} not found`);
    }
  }

  /**
   * Add environment variables to a specific function
   */
  public addEnvironment(
    functionName: string,
    key: string,
    value: string
  ): void {
    const func = this.getFunction(functionName);
    if (func) {
      func.addEnvironment(key, value);
    } else {
      throw new Error(`Function ${functionName} not found`);
    }
  }

  /**
   * Create a Lambda function alias
   */
  public createAlias(
    functionName: string,
    aliasName: string,
    version: lambda.IVersion
  ): lambda.Alias {
    const func = this.getFunction(functionName);
    if (!func) {
      throw new Error(`Function ${functionName} not found`);
    }

    return new lambda.Alias(this, `${functionName}${aliasName}Alias`, {
      aliasName: aliasName,
      version: version,
    });
  }
}
