#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { SmartschoolsInfraStack } from "../lib/smartschools_infra-stack";

// Set up AWS credentials from environment variables
if (process.env.AWS_ACCESS_KEY && process.env.AWS_SECRET_ACCESS_KEY) {
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY;
  // process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
}

interface AppContext {
  environment: string;
}

const app = new cdk.App();

// Debug: Log environment variables
// console.log("Environment Variables:");
// console.log(
//   "AWS_ACCESS_KEY:",
//   process.env.AWS_ACCESS_KEY ? "***set***" : "undefined"
// );
// console.log(
//   "AWS_SECRET_ACCESS_KEY:",
//   process.env.AWS_SECRET_ACCESS_KEY ? "***set***" : "undefined"
// );
// console.log("AWS_PROJECTD_ENVIRONMENT:", process.env.AWS_PROJECTD_ENVIRONMENT);
// console.log("AWS_PROJECTD_STAGE:", process.env.AWS_PROJECTD_STAGE);
// console.log("AWS_DEFAULT_ACCOUNT:", process.env.AWS_DEFAULT_ACCOUNT);
// console.log("AWS_DEFAULT_REGION:", process.env.AWS_DEFAULT_REGION);

// Get context from CDK context or environment variables (using your variable names)
if (!process.env.AWS_PROJECTD_ENVIRONMENT) {
  throw new Error(
    "Missing required environment variable: AWS_PROJECTD_ENVIRONMENT"
  );
}
const context: AppContext = {
  environment: process.env.AWS_PROJECTD_ENVIRONMENT,
};

// Create stack with context-aware naming and configuration
const stackName = `admin-${context.environment}`;

new SmartschoolsInfraStack(app, stackName, {
  // Pass context to the stack
  environment: context.environment,

  // Don't specify env - this makes the stack environment-agnostic
  // CDK will automatically use the current AWS credentials and region
  // Comment out env to make it environment-agnostic
  // env: {
  //   account: process.env.AWS_DEFAULT_ACCOUNT,
  //   region: process.env.AWS_DEFAULT_REGION,
  // },

  // Stack description with context
  description: `SmartSchools Infrastructure Stack - (${context.environment})`,

  // Tags at stack level
});
