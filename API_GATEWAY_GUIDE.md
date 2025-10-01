# SmartSchools API Gateway - Enhanced Configuration

This document describes the enhanced API Gateway configuration implementing industry best practices for security, performance, monitoring, and reliability.

## 🏗️ Architecture Overview

The API Gateway construct implements a comprehensive REST API with enterprise-grade features:

- **Security**: WAF protection, API keys, CORS configuration
- **Performance**: Throttling, caching, compression
- **Monitoring**: CloudWatch logs, metrics, X-Ray tracing
- **Reliability**: Health checks, error handling, validation

## 🔧 Configuration Options

### Basic Configuration
```typescript
const apiGateway = new ApiGatewayConstruct(this, "SmartSchoolsApiGateway", {
  apiName: "SmartSchools API",
  description: "REST API for SmartSchools application",
  stage: "prod",
  enableCors: true,
});
```

### Enhanced Configuration
```typescript
const apiGateway = new ApiGatewayConstruct(this, "SmartSchoolsApiGateway", {
  apiName: "SmartSchools API",
  description: "REST API with enterprise security",
  stage: "prod",
  enableCors: true,
  corsOrigins: ["https://smartschools.com"],
  enableValidation: true,
  enableApiKey: true,
  throttlingRateLimit: 1000,
  throttlingBurstLimit: 2000,
  enableWaf: true,
  enableDetailedMetrics: true,
});
```

## 🛡️ Security Features

### 1. Web Application Firewall (WAF)
- **Managed Rule Sets**: Common rule set, known bad inputs protection
- **Rate Limiting**: IP-based rate limiting (2000 requests/5 minutes)
- **Monitoring**: CloudWatch metrics for all rules

### 2. API Key Management
- **Usage Plans**: Configurable quotas and throttling
- **Key Rotation**: Supports multiple keys per usage plan
- **Monitoring**: Request tracking and usage analytics

### 3. CORS Configuration
- **Environment-specific origins**: Production vs development origins
- **Credential support**: Only with specific origins
- **Header control**: Configurable allowed headers

### 4. Request Validation
- **Schema validation**: JSON schema-based request validation
- **Parameter validation**: Query and path parameter validation
- **Response models**: Standardized response formats

## 📊 Monitoring & Observability

### 1. CloudWatch Logs
- **Access Logs**: JSON format with standard fields
- **Error Logs**: Detailed error information
- **Performance Logs**: Request/response times

### 2. Metrics & Alarms
- **Standard Metrics**: Request count, latency, errors
- **Custom Metrics**: Business-specific metrics
- **Alerting**: Integration-ready for SNS notifications

### 3. X-Ray Tracing
- **Distributed Tracing**: End-to-end request tracking
- **Performance Analysis**: Bottleneck identification
- **Error Analysis**: Root cause analysis

## 🚀 Performance Optimization

### 1. Throttling
- **Rate Limiting**: Configurable per environment
- **Burst Protection**: Handles traffic spikes
- **Per-method Settings**: Fine-grained control

### 2. Compression
- **Minimum Size**: 1KB threshold
- **Content Types**: Automatic compression
- **Bandwidth Savings**: Reduced response sizes

### 3. Regional Endpoints
- **Lower Latency**: Regional API Gateway endpoints
- **High Availability**: Multi-AZ deployment
- **Custom Domains**: Support for branded domains

## 🔍 Health Monitoring

### Health Check Endpoint
- **URL**: `GET /health`
- **Response**: Comprehensive system status
- **Monitoring**: Memory usage, uptime, response time

Example response:
```json
{
  "status": "healthy",
  "timestamp": "2025-09-28T10:30:00.000Z",
  "version": "1.0.0",
  "environment": "prod",
  "region": "us-east-1",
  "checks": {
    "api": "ok",
    "memory": {...},
    "uptime": 3600
  },
  "responseTime": 45
}
```

## 🏛️ API Structure

### Version Management
```
/v1/
├── auth/
│   ├── POST (login)
│   ├── refresh/
│   └── logout/
├── schools/
│   ├── GET (list)
│   ├── POST (create)
│   └── {schoolId}/
├── users/
│   ├── GET (list)
│   ├── POST (create)
│   └── {userId}/
├── admin/
│   ├── metrics/
│   └── logs/
└── files/
    ├── POST (upload)
    └── {fileId}/
```

## 🛠️ Helper Methods

### Adding Resources
```typescript
const usersResource = apiGateway.addResource("users");
const securedResource = apiGateway.addSecuredResource("admin");
```

### Adding Lambda Integrations
```typescript
apiGateway.addLambdaIntegration(
  usersResource,
  "GET",
  getUsersFunction,
  {
    authorizationType: apigateway.AuthorizationType.AWS_IAM,
    apiKeyRequired: true
  }
);
```

### Request Validation
```typescript
const validator = apiGateway.createRequestValidator(
  "UserValidator",
  true, // validate body
  true  // validate parameters
);

const userModel = apiGateway.addModel("User", {
  type: apigateway.JsonSchemaType.OBJECT,
  properties: {
    name: { type: apigateway.JsonSchemaType.STRING },
    email: { type: apigateway.JsonSchemaType.STRING }
  },
  required: ["name", "email"]
});
```

## 🌍 Environment Configuration

### Development
- **CORS**: Localhost origins
- **Throttling**: 100 req/sec, 200 burst
- **WAF**: Disabled
- **API Key**: Disabled
- **Logging**: Full data trace enabled

### Staging
- **CORS**: Staging domain origins
- **Throttling**: 500 req/sec, 1000 burst
- **WAF**: Enabled
- **API Key**: Optional
- **Logging**: Info level

### Production
- **CORS**: Production domain origins
- **Throttling**: 1000 req/sec, 2000 burst
- **WAF**: Enabled with all rules
- **API Key**: Required
- **Logging**: Error level, no data trace

## 📋 Deployment Checklist

### Pre-deployment
- [ ] Configure AWS credentials
- [ ] Set environment context variables
- [ ] Review CORS origins
- [ ] Validate throttling limits
- [ ] Test health check endpoint

### Post-deployment
- [ ] Verify API Gateway URL
- [ ] Test health check: `curl https://api-url/health`
- [ ] Validate WAF rules in AWS Console
- [ ] Check CloudWatch logs
- [ ] Monitor API key usage

## 🔧 Maintenance

### Regular Tasks
- Monitor CloudWatch metrics and alarms
- Review WAF logs for security events
- Rotate API keys periodically
- Update CORS origins as needed
- Review and optimize throttling limits

### Troubleshooting
- Check CloudWatch logs for errors
- Use X-Ray for performance issues
- Monitor WAF blocked requests
- Validate API key usage patterns

## 📚 Additional Resources

- [AWS API Gateway Best Practices](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-basic-concept.html)
- [WAF Security Rules](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups.html)
- [CloudWatch Monitoring](https://docs.aws.amazon.com/apigateway/latest/developerguide/monitoring-cloudwatch.html)
- [X-Ray Tracing](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-xray.html)