import { test, expect } from "vitest";
// import * as cdk from 'aws-cdk-lib';
// import { Template } from 'aws-cdk-lib/assertions';
// import * as SmartschoolsInfra from '../lib/smartschools_infra-stack';

// example test. To run these tests, uncomment this file along with the
// example resource in lib/smartschools_infra-stack.ts
test("SQS Queue Created", () => {
  //   const app = new cdk.App();
  //     // WHEN
  //   const stack = new SmartschoolsInfra.SmartschoolsInfraStack(app, 'MyTestStack');
  //     // THEN
  //   const template = Template.fromStack(stack);

  //   template.hasResourceProperties('AWS::SQS::Queue', {
  //     VisibilityTimeout: 300
  //   });
  expect(true).toBe(true); // Simple test to verify Vitest is working
});
