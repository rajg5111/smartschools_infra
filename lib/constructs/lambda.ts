import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
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
     * Docker build configuration (optional)
     */
    build?: {
      /**
       * Path to the directory containing the Dockerfile
       */
      directory: string;
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
  public readonly functions: Map<string, lambda.DockerImageFunction> =
    new Map();
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
    const functionName = `${environment.toLowerCase()}-${config.functionName}`;

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

    // Create log group
    const logGroup = new logs.LogGroup(this, `${config.functionName}LogGroup`, {
      retention: config.logRetention || logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      logGroupName: `/aws/lambda/${functionName}`,
    });

    // Determine the Docker image code source
    let code: lambda.DockerImageCode;

    if (config.dockerImage.build) {
      code = lambda.DockerImageCode.fromImageAsset(
        config.dockerImage.build.directory
      );
    } else {
      throw new Error(
        `Build configuration must be provided for ${config.functionName}`
      );
    }

    // Create the Lambda function using DockerImageFunction
    const lambdaFunction = new lambda.DockerImageFunction(
      this,
      `${config.functionName}Function`,
      {
        functionName: functionName,
        code: code,
        role: executionRole,
        environment: config.environment,
        timeout: config.timeout,
        memorySize: config.memorySize,
        description:
          config.description || `${config.functionName} Lambda function`,
        tracing: config.enableTracing
          ? lambda.Tracing.ACTIVE
          : lambda.Tracing.DISABLED,
        logGroup: logGroup,
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
  public getFunction(
    functionName: string
  ): lambda.DockerImageFunction | undefined {
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
