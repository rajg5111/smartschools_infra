# Lambda Construct with Docker Support

This construct provides a comprehensive solution for creating AWS Lambda functions using Docker containers.

## Features

- **Docker-based Lambda functions** - Support for both pre-built images and build-from-source
- **Flexible configuration** - Per-function customization of timeout, memory, environment variables
- **IAM role management** - Automatic creation of execution roles with additional policies
- **Logging and monitoring** - CloudWatch logs with configurable retention and X-Ray tracing
- **Environment-based deployment** - Support for multiple environments (dev, staging, prod)

## Usage

### Basic Example

```typescript
import { LambdaConstruct } from "./constructs/lambda";

const lambdaConstruct = new LambdaConstruct(this, "MyLambda", {
  environment: "development",
  projectName: "MyProject",
  functions: [
    {
      functionName: "my-api",
      dockerImage: {
        build: {
          directory: "./lambda/my-api",
          file: "Dockerfile",
        },
      },
      description: "My API Lambda function",
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        TABLE_NAME: "my-table",
      },
    },
  ],
});
```

### Using Pre-built ECR Image

```typescript
{
  functionName: 'my-service',
  dockerImage: {
    imageUri: '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-repo:latest',
  },
  // ... other configuration
}
```

### Adding IAM Permissions

```typescript
{
  functionName: 'my-function',
  dockerImage: { /* ... */ },
  additionalPolicies: [
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
      resources: ['arn:aws:dynamodb:region:account:table/my-table'],
    }),
  ],
}
```

## Docker Image Structure

### Node.js Example

```dockerfile
FROM public.ecr.aws/lambda/nodejs:18

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ${LAMBDA_TASK_ROOT}

# Set the handler
CMD [ "index.handler" ]
```

### Python Example

```dockerfile
FROM public.ecr.aws/lambda/python:3.11

# Copy requirements
COPY requirements.txt ${LAMBDA_TASK_ROOT}

# Install dependencies
RUN pip install -r requirements.txt

# Copy source code
COPY src/ ${LAMBDA_TASK_ROOT}

# Set the handler
CMD [ "index.handler" ]
```

## Configuration Options

### DockerLambdaConfig

| Property               | Type              | Description                | Default        |
| ---------------------- | ----------------- | -------------------------- | -------------- |
| `functionName`         | string            | Lambda function name       | Required       |
| `dockerImage.imageUri` | string            | Pre-built ECR image URI    | Optional       |
| `dockerImage.build`    | object            | Docker build configuration | Optional       |
| `environment`          | object            | Environment variables      | `{}`           |
| `timeout`              | Duration          | Function timeout           | 30 seconds     |
| `memorySize`           | number            | Memory allocation (MB)     | 128            |
| `description`          | string            | Function description       | Auto-generated |
| `additionalPolicies`   | PolicyStatement[] | IAM policies               | `[]`           |
| `logRetention`         | RetentionDays     | Log retention period       | 7 days         |
| `enableTracing`        | boolean           | X-Ray tracing              | `false`        |
| `reservedConcurrency`  | number            | Reserved concurrency       | Undefined      |

## Methods

### Getting Functions

```typescript
// Get a specific function
const myFunction = lambdaConstruct.getFunction("my-api");

// Get execution role
const role = lambdaConstruct.getExecutionRole("my-api");

// Get all function names
const names = lambdaConstruct.getAllFunctionNames();
```

### Managing Permissions

```typescript
// Grant invoke permissions
lambdaConstruct.grantInvoke("my-api", apiGateway);

// Add environment variables
lambdaConstruct.addEnvironment("my-api", "NEW_VAR", "value");
```

## Deployment

1. **Build and deploy**:

   ```bash
   npm run build
   cdk deploy
   ```

2. **Docker images are built automatically** during CDK deployment

3. **Lambda functions are created** with the specified configuration

## Best Practices

1. **Use multi-stage builds** for smaller images
2. **Set appropriate memory and timeout** based on function requirements
3. **Use environment variables** for configuration
4. **Enable X-Ray tracing** for production functions
5. **Set log retention** to appropriate periods
6. **Use least-privilege IAM policies**

## Example Lambda Functions

The construct includes example functions in the `lambda/` directory:

- **`school-api/`** - Node.js API for school CRUD operations
- **`school-notification/`** - Python service for sending notifications

## Environment Variables

Common environment variables automatically set:

- `AWS_REGION` - AWS region
- `AWS_LAMBDA_FUNCTION_NAME` - Function name
- `LOG_LEVEL` - Logging level based on environment

## Monitoring

- **CloudWatch Logs** with configurable retention
- **CloudWatch Metrics** for monitoring performance
- **X-Ray Tracing** for distributed tracing (when enabled)
- **CDK Outputs** for function ARNs and names

## Troubleshooting

### Common Issues

1. **Docker build fails**:

   - Check Dockerfile syntax
   - Ensure all dependencies are available
   - Verify build context path

2. **Function timeout**:

   - Increase timeout in configuration
   - Optimize function code
   - Check for blocking operations

3. **Permission denied**:
   - Verify IAM policies
   - Check resource ARNs
   - Ensure execution role has necessary permissions

### Logs

Check CloudWatch logs for detailed error messages:

```bash
aws logs tail /aws/lambda/function-name --follow
```
