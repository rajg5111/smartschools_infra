# S3 Website Hosting with CloudFront CDN

This guide explains how to use the S3 Website construct to host your SmartSchools admin panel.

## Architecture

- **S3 Bucket**: Stores your static website files (HTML, CSS, JS, images)
- **CloudFront CDN**: Global content delivery network for fast access
- **Origin Access Control (OAC)**: Secure access from CloudFront to S3 (AWS recommended method)
- **SSL/TLS**: HTTPS encryption enabled by default

## Features

✅ **Secure by default**: S3 bucket blocks public access, only CloudFront can access  
✅ **Global CDN**: Fast content delivery worldwide  
✅ **SPA Support**: Error pages redirect to index.html for client-side routing  
✅ **Compression**: Automatic gzip compression  
✅ **Cache optimization**: Optimized caching policies  
✅ **Custom domains**: Support for custom domain names with SSL certificates  
✅ **Auto-deployment**: Optional automatic deployment from local files

## Deployment Steps

### 1. Build Your React Application

```powershell
cd c:\smartschools_admin
npm run build
```

This creates a `dist` folder with your production-ready files.

### 2. Deploy Infrastructure

```powershell
cd c:\smartschools_infra
cdk deploy
```

This will create:

- S3 bucket: `smartschools-development-website`
- CloudFront distribution
- All necessary IAM policies

### 3. Upload Website Files

#### Option A: Manual Upload (AWS CLI)

```powershell
# Upload files to S3
aws s3 sync ../smartschools_admin/dist s3://smartschools-development-website --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
```

#### Option B: Automatic Deployment (Recommended)

Uncomment this line in `smartschools_infra-stack.ts`:

```typescript
const website = new S3WebsiteConstruct(this, "SmartSchoolsWebsite", {
  environment: this.context.environment,
  projectName: "SmartSchools",
  enableCloudFront: true,
  websiteSourcePath: "../smartschools_admin/dist", // ← Uncomment this
});
```

Then run `cdk deploy` - it will automatically upload your files and invalidate the cache.

### 4. Access Your Website

After deployment, check the CloudFront URL in the output:

```
Outputs:
SmartschoolsInfraStack.SmartSchoolsWebsiteCloudFrontURL = https://d1234567890abc.cloudfront.net
```

Visit this URL to access your website!

## Custom Domain Setup

### Prerequisites

1. **Domain registered** in Route 53 (or external registrar)
2. **ACM Certificate** created in **us-east-1** region (required for CloudFront)

### Steps

#### 1. Create SSL Certificate (us-east-1 only!)

```powershell
# Switch to us-east-1 region
aws acm request-certificate `
  --domain-name app.smartschools.com `
  --validation-method DNS `
  --region us-east-1
```

#### 2. Validate Certificate

Add the DNS validation records to your domain's DNS settings.

#### 3. Update Stack Configuration

```typescript
const website = new S3WebsiteConstruct(this, "SmartSchoolsWebsite", {
  environment: this.context.environment,
  projectName: "SmartSchools",
  enableCloudFront: true,
  domainName: "app.smartschools.com",
  certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/your-cert-id",
});
```

#### 4. Create Route 53 Record

After deployment, create an A record (alias) in Route 53:

```typescript
// Add to your stack
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";

const hostedZone = route53.HostedZone.fromLookup(this, "Zone", {
  domainName: "smartschools.com",
});

new route53.ARecord(this, "WebsiteAliasRecord", {
  zone: hostedZone,
  recordName: "app",
  target: route53.RecordTarget.fromAlias(
    new targets.CloudFrontTarget(website.distribution!)
  ),
});
```

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "18"

      - name: Install dependencies
        run: |
          cd smartschools_admin
          npm ci

      - name: Build
        run: |
          cd smartschools_admin
          npm run build

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Deploy to S3
        run: |
          aws s3 sync smartschools_admin/dist s3://smartschools-production-website --delete

      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} --paths "/*"
```

## Cache Invalidation

When you update your website, you need to invalidate the CloudFront cache:

```powershell
# Get distribution ID from CDK output
$DIST_ID = "YOUR_DISTRIBUTION_ID"

# Invalidate all files
aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"

# Invalidate specific files
aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/index.html" "/assets/*"
```

## Environment-Specific Configuration

### Development

```typescript
// Uses short retention, auto-delete on stack deletion
environment: "development";
```

### Production

```typescript
// Uses versioning, retained on stack deletion
environment: "production";
```

## Cost Estimation

### Development (Low Traffic)

- **S3**: ~$0.50/month (storage + requests)
- **CloudFront**: ~$1-5/month (first 50GB free tier)
- **Total**: ~$2-6/month

### Production (Medium Traffic - 10GB data transfer)

- **S3**: ~$2-5/month
- **CloudFront**: ~$10-20/month
- **Total**: ~$15-25/month

## Troubleshooting

### 403 Forbidden Error

- Check S3 bucket policy allows CloudFront OAI
- Verify CloudFront distribution is enabled
- Check file exists in S3 bucket

### 404 Not Found on Refresh (SPA)

- Error responses are configured to redirect to index.html
- If still having issues, check CloudFront error responses configuration

### Deployment Fails

```powershell
# Check CDK diff
cdk diff

# Verbose deployment
cdk deploy --verbose

# Check CloudFormation events
aws cloudformation describe-stack-events --stack-name SmartschoolsInfraStack
```

## Best Practices

1. ✅ **Always use CloudFront** - Never expose S3 bucket publicly
2. ✅ **Enable versioning in production** - Easy rollback capability
3. ✅ **Use cache invalidation** - After each deployment
4. ✅ **Compress assets** - Reduce bandwidth and improve load times
5. ✅ **Use custom domains** - Better branding and user experience
6. ✅ **Monitor CloudFront metrics** - Track performance and costs
7. ✅ **Set up CloudWatch alarms** - Get notified of issues

## Security Considerations

- ✅ S3 bucket blocks all public access
- ✅ CloudFront uses HTTPS by default
- ✅ Origin Access Control (OAC) ensures only CloudFront can access S3 using AWS SigV4
- ✅ Enforce SSL/TLS for all requests
- ✅ S3 bucket encryption enabled (SSE-S3)

## Next Steps

1. Set up continuous deployment with GitHub Actions
2. Add custom domain with SSL certificate
3. Configure CloudWatch alarms for monitoring
4. Set up AWS WAF for additional security
5. Enable CloudFront access logs for analytics

## Resources

- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [CloudFront Documentation](https://docs.aws.amazon.com/cloudfront/)
- [CDK S3 Deployment](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3_deployment-readme.html)
