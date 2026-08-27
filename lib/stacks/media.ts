import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import { computeLogoBucketName } from "../db/env";

interface MediaStackProps extends cdk.StackProps {
  stackProps?: {
    environment: string;
    branch: string;
  };
}

export class MediaStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly bucketName: string;
  public readonly publicBaseUrl: string;

  constructor(scope: Construct, id: string, props: MediaStackProps) {
    super(scope, id, props);

    const environment = props.stackProps?.environment || "dev";
    const isProd = environment === "prod";
    const branch = props.stackProps?.branch || "";

    this.bucketName = computeLogoBucketName(environment, branch);
    this.bucket = new s3.Bucket(this, "LogoBucket", {
      bucketName: this.bucketName,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    this.distribution = new cloudfront.Distribution(this, "LogoDistribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: isProd
          ? cloudfront.CachePolicy.CACHING_OPTIMIZED
          : cloudfront.CachePolicy.CACHING_DISABLED,
      },
      comment: `SAMS club logos (${environment})`,
    });
    this.publicBaseUrl = `https://${this.distribution.distributionDomainName}`;
  }
}
