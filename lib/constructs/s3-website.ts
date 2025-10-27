import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";

/**
 * Properties for the S3 Website construct
 */
export interface S3WebsiteConstructProps {
  /**
   * The environment (e.g., 'development', 'production')
   */
  environment: string;

  /**
   * Project name for tagging and naming
   */
  projectName: string;

  /**
   * Enable CloudFront distribution (default: true)
   */
  enableCloudFront?: boolean;

  /**
   * Custom domain name for the website (optional)
   */
  domainName?: string;

  /**
   * Certificate ARN for HTTPS (required if domainName is provided)
   */
  certificateArn?: string;

  /**
   * Path to the website source files for deployment (optional)
   */
  websiteSourcePath?: string;

  /**
   * Enable versioning on the S3 bucket (default: false)
   */
  enableVersioning?: boolean;

  /**
   * Block public access (default: true when using CloudFront)
   */
  blockPublicAccess?: boolean;

  /**
   * Default root object (default: 'index.html')
   */
  defaultRootObject?: string;

  /**
   * Error page path (default: 'index.html' for SPA)
   */
  errorPage?: string;
}

/**
 * S3 Website construct for hosting static websites with CloudFront CDN
 */
export class S3WebsiteConstruct extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly distribution?: cloudfront.Distribution;
  public readonly bucketDeployment?: s3deploy.BucketDeployment;

  constructor(scope: Construct, id: string, props: S3WebsiteConstructProps) {
    super(scope, id);

    const environment = props.environment;
    const projectName = props.projectName;
    const enableCloudFront = props.enableCloudFront !== false;
    const blockPublicAccess = props.blockPublicAccess !== false;
    const defaultRootObject = props.defaultRootObject || "index.html";
    const errorPage = props.errorPage || "index.html";

    // Create S3 bucket for website hosting
    this.bucket = new s3.Bucket(this, "WebsiteBucket", {
      bucketName: `${projectName.toLowerCase()}-${environment.toLowerCase()}-website`,
      removalPolicy:
        environment === "production"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== "production",
      versioned: props.enableVersioning || false,
      blockPublicAccess: blockPublicAccess
        ? s3.BlockPublicAccess.BLOCK_ALL
        : s3.BlockPublicAccess.BLOCK_ACLS,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          maxAge: 3000,
        },
      ],
    });

    // If CloudFront is enabled, create distribution
    if (enableCloudFront) {
      // Create Origin Access Control for CloudFront (replaces deprecated OAI)
      const originAccessControl = new cloudfront.S3OriginAccessControl(
        this,
        "WebsiteOAC",
        {
          signing: cloudfront.Signing.SIGV4_ALWAYS,
        }
      );

      // Create CloudFront distribution
      let certificate;
      let domainNames;

      // Add custom domain if provided
      if (props.domainName && props.certificateArn) {
        certificate = cdk.aws_certificatemanager.Certificate.fromCertificateArn(
          this,
          "Certificate",
          props.certificateArn
        );
        domainNames = [props.domainName];
      }

      this.distribution = new cloudfront.Distribution(
        this,
        "WebsiteDistribution",
        {
          defaultBehavior: {
            origin: origins.S3BucketOrigin.withOriginAccessControl(
              this.bucket,
              {
                originAccessControl: originAccessControl,
              }
            ),
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
            cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
            compress: true,
            cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          },
          defaultRootObject: defaultRootObject,
          errorResponses: [
            {
              httpStatus: 404,
              responseHttpStatus: 200,
              responsePagePath: `/${errorPage}`,
              ttl: cdk.Duration.minutes(5),
            },
            {
              httpStatus: 403,
              responseHttpStatus: 200,
              responsePagePath: `/${errorPage}`,
              ttl: cdk.Duration.minutes(5),
            },
          ],
          priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
          enabled: true,
          comment: `${projectName} ${environment} website distribution`,
          domainNames: domainNames,
          certificate: certificate,
        }
      );

      // Deploy website files if source path is provided
      if (props.websiteSourcePath) {
        this.bucketDeployment = new s3deploy.BucketDeployment(
          this,
          "WebsiteDeployment",
          {
            sources: [s3deploy.Source.asset(props.websiteSourcePath)],
            destinationBucket: this.bucket,
            distribution: this.distribution,
            distributionPaths: ["/*"],
            prune: true,
            memoryLimit: 512,
          }
        );
      }

      // Output CloudFront URL
      new cdk.CfnOutput(this, "CloudFrontURL", {
        value: `https://${this.distribution.distributionDomainName}`,
        description: "CloudFront distribution URL",
        exportName: `${projectName}-CloudFrontURL-${environment}`,
      });

      new cdk.CfnOutput(this, "CloudFrontDistributionId", {
        value: this.distribution.distributionId,
        description: "CloudFront distribution ID",
        exportName: `${projectName}-CloudFrontDistributionId-${environment}`,
      });
    } else {
      // If not using CloudFront, enable website hosting directly on S3
      const websiteBucket = this.bucket as s3.Bucket;
      // Note: For website hosting without CloudFront, you'd need to modify bucket policies
      // This is less secure and not recommended for production
    }

    // Output S3 bucket name
    new cdk.CfnOutput(this, "WebsiteBucketName", {
      value: this.bucket.bucketName,
      description: "S3 bucket name for website hosting",
      exportName: `${projectName}-WebsiteBucketName-${environment}`,
    });

    new cdk.CfnOutput(this, "WebsiteBucketArn", {
      value: this.bucket.bucketArn,
      description: "S3 bucket ARN",
      exportName: `${projectName}-WebsiteBucketArn-${environment}`,
    });

    // Add tags
    cdk.Tags.of(this.bucket).add("Environment", environment);
    cdk.Tags.of(this.bucket).add("Project", projectName);
    cdk.Tags.of(this.bucket).add("ManagedBy", "CDK");
    cdk.Tags.of(this.bucket).add("Purpose", "WebsiteHosting");

    if (this.distribution) {
      cdk.Tags.of(this.distribution).add("Environment", environment);
      cdk.Tags.of(this.distribution).add("Project", projectName);
      cdk.Tags.of(this.distribution).add("ManagedBy", "CDK");
    }
  }

  /**
   * Grant read access to the bucket
   */
  public grantRead(identity: iam.IGrantable): iam.Grant {
    return this.bucket.grantRead(identity);
  }

  /**
   * Grant write access to the bucket
   */
  public grantWrite(identity: iam.IGrantable): iam.Grant {
    return this.bucket.grantWrite(identity);
  }

  /**
   * Grant read/write access to the bucket
   */
  public grantReadWrite(identity: iam.IGrantable): iam.Grant {
    return this.bucket.grantReadWrite(identity);
  }
}
