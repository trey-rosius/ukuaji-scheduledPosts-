import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { EventsConstruct } from "../../../lib/constructs/events-construct";
import {
  createMockAppSyncApi,
  createMockLambdaFunction,
  createMockEventBus,
} from "../../utils/test-utils";

/**
 *  We don’t rely on exact `hasResourceProperties` matches for deeply‑nested
 *  structures. Instead, locate resources with `findResources` and assert the
 *  pieces we care about.
 */
describe("EventsConstruct", () => {
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");

    // minimal mock dynamo table with stream
    const table = new cdk.aws_dynamodb.Table(stack, "MockTable", {
      partitionKey: { name: "PK", type: cdk.aws_dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: cdk.aws_dynamodb.AttributeType.STRING },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      stream: cdk.aws_dynamodb.StreamViewType.NEW_IMAGE,
    });

    new EventsConstruct(stack, "Events", {
      postsTable: table,
      api: createMockAppSyncApi(stack, "MockApi"),
      schedulePostsFunction: createMockLambdaFunction(stack, "MockFunc"),
      eventBus: createMockEventBus(stack, "MockBus"),
    });

    template = Template.fromStack(stack);
  });

  /* -------------------------------------------------- */
  /* -------------------------------------------------- */
  /* 1. Pipe role + pipe                                */
  /* -------------------------------------------------- */
  it("creates an EventBridge Pipe with IAM role", () => {
    // locate role assumed by pipes.amazonaws.com (can’t use findResources filter
    // because it requires exact match)
    const pipeRole = Object.values(
      template.findResources("AWS::IAM::Role")
    ).find((r: any) =>
      JSON.stringify(r.Properties.AssumeRolePolicyDocument).includes(
        "pipes.amazonaws.com"
      )
    );
    expect(pipeRole).toBeDefined();

    // Pipe targeting the event bus
    const pipes = template.findResources("AWS::Pipes::Pipe");
    expect(Object.keys(pipes).length).toBe(1);
    const [pipe] = Object.values(pipes) as any[];
    expect(JSON.stringify(pipe.Properties.Source)).toMatch(/StreamArn/);
    expect(JSON.stringify(pipe.Properties.Target)).toMatch(/MockBus/);
  });

  it("creates role for EventBridge -> AppSync and a rule", () => {
    // role assumed by events.amazonaws.com
    const roles = Object.values(
      template.findResources("AWS::IAM::Role")
    ) as any[];
    const ebRole = roles.find((r) =>
      JSON.stringify(r.Properties.AssumeRolePolicyDocument).includes(
        "events.amazonaws.com"
      )
    );
    expect(ebRole).toBeDefined();

    // policy must allow appsync:GraphQL
    const policies = template.findResources("AWS::IAM::Policy");
    const gqlAllowed = Object.values(policies).some((p: any) =>
      JSON.stringify(p).includes("appsync:GraphQL")
    );
    expect(gqlAllowed).toBe(true);

    // rule for generated text exists
    const rules = template.findResources("AWS::Events::Rule");
    const genTextRule = Object.values(rules).find((r: any) =>
      JSON.stringify(r.Properties.EventPattern).includes("generated.text")
    );
    expect(genTextRule).toBeDefined();
  });

  /* -------------------------------------------------- */
  /* 3. Lambda‑target rule                              */
  /* -------------------------------------------------- */
  it("creates rule that targets the schedule‑posts Lambda", () => {
    const rules = Object.values(
      template.findResources("AWS::Events::Rule")
    ) as any[];
    const lambdaRule = rules.find((r) =>
      JSON.stringify(r.Properties.Targets || []).includes("MockFunc")
    );
    expect(lambdaRule).toBeDefined();
  });

  /* -------------------------------------------------- */
  /* -------------------------------------------------- */
  /* 4. Catch‑all log group                             */
  /* -------------------------------------------------- */
  it("creates CloudWatch log group and catch‑all rule", () => {
    expect(
      Object.keys(template.findResources("AWS::Logs::LogGroup")).length
    ).toBe(1);

    // catch‑all rule is the one whose EventPattern has a source prefix ""
    const catchAll = Object.values(
      template.findResources("AWS::Events::Rule")
    ).find((r: any) =>
      JSON.stringify(r.Properties.EventPattern).includes('"prefix":""')
    );
    expect(catchAll).toBeDefined();
  });
});
