import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { WorkflowConstruct } from "../../../lib/constructs/workflow-construct";
import {
  createMockDynamoDBTable,
  createMockEventBus,
  createMockKnowledgeBase,
} from "../../utils/test-utils";
import * as fs from "fs";

// mock out fs.readFileSync to return an ultra‑simple ASL string
jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  readFileSync: jest.fn(() =>
    JSON.stringify({
      Comment: "mock",
      StartAt: "Pass",
      States: { Pass: { Type: "Pass", End: true } },
    })
  ),
}));

describe("WorkflowConstruct", () => {
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");

    new WorkflowConstruct(stack, "WF", {
      postsTable: createMockDynamoDBTable(stack, "Tbl"),
      eventBus: createMockEventBus(stack, "Bus"),
      knowledgeBase: createMockKnowledgeBase(stack, "KB"),
    });

    template = Template.fromStack(stack);
  });

  /* -------------------------------------------------- */
  /* 1. Media bucket                                    */
  /* -------------------------------------------------- */
  it("creates a versioned, blocked S3 bucket", () => {
    const [bucket] = Object.values(
      template.findResources("AWS::S3::Bucket")
    ) as any[];
    expect(bucket.Properties.VersioningConfiguration.Status).toBe("Enabled");
    expect(
      bucket.Properties.PublicAccessBlockConfiguration.BlockPublicPolicy
    ).toBe(true);
  });

  /* -------------------------------------------------- */
  /* 2. Python agent Lambda env vars                    */
  /* -------------------------------------------------- */
  it("configures GeneratePostAgent Lambda with EVENT_BUS_NAME & KB id", () => {
    const pyFuncs = Object.values(
      template.findResources("AWS::Lambda::Function")
    ) as any[];
    const agent = pyFuncs.find((f) => f.Properties.Runtime === "python3.12");
    expect(agent).toBeDefined();
    const env = agent!.Properties.Environment.Variables;
    expect(env.EVENT_BUS_NAME).toBeDefined();
    expect(env.STRANDS_KNOWLEDGE_BASE_ID).toBeDefined();
  });

  /* -------------------------------------------------- */
  /* 3. State machines exist                            */
  /* -------------------------------------------------- */
  it("creates all five expected StepFunctions StateMachines", () => {
    const sms = template.findResources("AWS::StepFunctions::StateMachine");
    const names = Object.values(sms).map(
      (m: any) => m.Properties.StateMachineName
    );
    [
      "generatePostWithoutContextStateMachine",
      "GeneratePostWithContextStateMachine",
      "TextToVideoStateMachine",
      "ExtractTextFromFileStateMachine",
      "TranscribeMediaStateMachine",
    ].forEach((n) => expect(names).toContain(n));
  });

  /* -------------------------------------------------- */
  /* 4. Lambda starter permissions                      */
  /* -------------------------------------------------- */
  it("grants StartWorkflowFunction permission to start state machines", () => {
    const policies = Object.values(
      template.findResources("AWS::IAM::Policy")
    ) as any[];
    const hasStates = policies.some((p) =>
      JSON.stringify(p).includes("states:StartExecution")
    );
    expect(hasStates).toBe(true);
  });
});
