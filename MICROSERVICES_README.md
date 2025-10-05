# School API Microservices Architecture

## Overview

The School API has been refactored from a single monolithic Lambda function into separate microservices, with each endpoint handled by its own dedicated Lambda function. This provides better scalability, monitoring, and maintainability.

## Architecture Benefits

### 🎯 **Single Responsibility Principle**

- Each Lambda function has one specific purpose
- Easier to understand, test, and maintain
- Reduced complexity per function

### ⚡ **Performance Optimization**

- Right-sized resources for each operation
- Faster cold starts with smaller codebases
- Independent scaling per endpoint

### 📊 **Better Monitoring**

- Granular metrics per operation
- Easier to identify performance bottlenecks
- Individual error tracking

### 💰 **Cost Optimization**

- Pay only for what each function uses
- Different memory/timeout configurations
- More efficient resource utilization

## Microservices Structure

```
lambda/
├── schools-list/          # GET /schools
├── schools-create/        # POST /schools
├── schools-get/           # GET /schools/{id}
├── schools-update/        # PUT /schools/{id}
├── schools-delete/        # DELETE /schools/{id}
└── school-notification/   # Notification service
```

## API Endpoints

### 1. List Schools

**Endpoint:** `GET /schools`  
**Lambda:** `schools-list`  
**Memory:** 256 MB  
**Timeout:** 30s

**Features:**

- Pagination support with `limit` and `lastKey` parameters
- Efficient DynamoDB scan operations
- Response includes total count and pagination info

**Query Parameters:**

- `limit` - Number of records to return (optional)
- `lastKey` - Pagination token (optional)

**Response:**

```json
{
  "schools": [...],
  "count": 25,
  "scannedCount": 100,
  "hasMore": true,
  "lastKey": "encoded-pagination-token"
}
```

### 2. Create School

**Endpoint:** `POST /schools`  
**Lambda:** `schools-create`  
**Memory:** 256 MB  
**Timeout:** 30s

**Features:**

- Input validation for required fields
- Duplicate school code detection
- Audit trail with timestamps
- Automatic status assignment

**Required Fields:**

- `school_unique_code`
- `school_name`
- `location`
- `primary_contact_email`

**Response:**

```json
{
  "message": "School created successfully",
  "school": {
    "school_unique_code": "SCH001",
    "school_name": "Example School"
    // ... other fields
  }
}
```

### 3. Get School

**Endpoint:** `GET /schools/{schoolId}`  
**Lambda:** `schools-get`  
**Memory:** 128 MB  
**Timeout:** 15s

**Features:**

- Fast single-item retrieval
- Optimized for read operations
- Minimal resource usage

**Response:**

```json
{
  "school": {
    "school_unique_code": "SCH001",
    "school_name": "Example School"
    // ... complete school record
  }
}
```

### 4. Update School

**Endpoint:** `PUT /schools/{schoolId}`  
**Lambda:** `schools-update`  
**Memory:** 256 MB  
**Timeout:** 30s

**Features:**

- Dynamic update expressions
- Existence validation
- Handles DynamoDB reserved words
- Partial updates supported

**Allowed Fields:**

- `school_name`
- `location`
- `primary_contact_email`
- `primary_contact_phone`
- `primary_contact_staff_id`
- `status`

**Response:**

```json
{
  "message": "School updated successfully",
  "school": {
    // ... updated school record
  }
}
```

### 5. Delete School

**Endpoint:** `DELETE /schools/{schoolId}`  
**Lambda:** `schools-delete`  
**Memory:** 256 MB  
**Timeout:** 30s

**Features:**

- Soft delete and hard delete options
- Existence validation before deletion
- Audit trail for soft deletes

**Query Parameters:**

- `softDelete=true` - Performs soft delete (marks as deleted)
- Default behavior is hard delete (permanent removal)

**Soft Delete Response:**

```json
{
  "message": "School soft deleted successfully",
  "school": {
    "status": "deleted",
    "deleted_at": "2025-10-06T10:00:00.000Z"
  }
}
```

## IAM Permissions

Each Lambda function has minimal required permissions:

### schools-list

- `dynamodb:Scan` - List all schools

### schools-create

- `dynamodb:GetItem` - Check for duplicates
- `dynamodb:PutItem` - Create new records

### schools-get

- `dynamodb:GetItem` - Read single record

### schools-update

- `dynamodb:GetItem` - Validate existence
- `dynamodb:UpdateItem` - Update records

### schools-delete

- `dynamodb:GetItem` - Validate existence
- `dynamodb:DeleteItem` - Hard delete
- `dynamodb:UpdateItem` - Soft delete

## Configuration

### Resource Sizing Strategy

| Function       | Memory | Timeout | Rationale                    |
| -------------- | ------ | ------- | ---------------------------- |
| schools-list   | 256 MB | 30s     | Handles scanning operations  |
| schools-create | 256 MB | 30s     | Input validation + DB writes |
| schools-get    | 128 MB | 15s     | Simple read operation        |
| schools-update | 256 MB | 30s     | Validation + update logic    |
| schools-delete | 256 MB | 30s     | Validation + delete logic    |

### Common Environment Variables

- `SCHOOLS_TABLE_NAME` - DynamoDB table name
- `LOG_LEVEL` - Logging verbosity (debug/warn)

## Error Handling

All functions implement consistent error handling:

- **400** - Bad Request (validation errors)
- **404** - Not Found (resource doesn't exist)
- **409** - Conflict (duplicate resources)
- **500** - Internal Server Error (unexpected errors)

## CORS Support

All endpoints include CORS headers:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: Content-Type`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`

## Monitoring & Logging

### CloudWatch Metrics

- Invocation count per function
- Duration per function
- Error rate per function
- Throttle rate per function

### X-Ray Tracing

- Enabled on all functions
- End-to-end request tracing
- Performance bottleneck identification

### Log Retention

- 1 week retention for all functions
- Structured JSON logging
- Request/response logging

## Deployment

```bash
# Deploy all microservices
cdk deploy

# Functions are built automatically from Docker containers
# Each function gets its own CloudFormation resources
```

## API Gateway Integration

Each Lambda function can be integrated with API Gateway:

```typescript
// Example integration
const api = new apigateway.RestApi(this, "SchoolsApi");
const schools = api.root.addResource("schools");

// GET /schools -> schools-list
schools.addMethod(
  "GET",
  new apigateway.LambdaIntegration(lambdaConstruct.getFunction("schools-list"))
);

// POST /schools -> schools-create
schools.addMethod(
  "POST",
  new apigateway.LambdaIntegration(
    lambdaConstruct.getFunction("schools-create")
  )
);

// GET /schools/{id} -> schools-get
const school = schools.addResource("{schoolId}");
school.addMethod(
  "GET",
  new apigateway.LambdaIntegration(lambdaConstruct.getFunction("schools-get"))
);
```

## Testing

Each microservice can be tested independently:

```bash
# Test individual functions
aws lambda invoke --function-name schools-list-development response.json

# Load testing per endpoint
# Integration testing across functions
# Unit testing per function
```

## Migration Benefits

### Before (Monolithic)

- ❌ Single large function handling all operations
- ❌ Same resources for different workloads
- ❌ Difficult to optimize performance
- ❌ Harder to debug issues

### After (Microservices)

- ✅ Dedicated function per operation
- ✅ Right-sized resources per workload
- ✅ Independent scaling and optimization
- ✅ Easier debugging and monitoring
- ✅ Better separation of concerns
- ✅ Independent deployment capability

This microservices architecture provides a solid foundation for scaling the School API while maintaining clean separation of concerns and optimal resource utilization.
