import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as iam from "aws-cdk-lib/aws-iam";
import { AppSyncConstruct } from "../../../lib/constructs/appsync-construct";
import {
  createMockDynamoDBTable,
  createMockUserPool,
  createMockEventBus,
  createMockKnowledgeBase,
  createMockNodejsFunction,
  createMockPythonFunction,
} from "../../utils/test-utils";

describe("AppSyncConstruct", () => {
  let template: Template;

  beforeEach(() => {
    const stack = new cdk.Stack();

    new AppSyncConstruct(stack, "TestAppSync", {
      userPool: createMockUserPool(stack, "UserPool"),
      postsTable: createMockDynamoDBTable(stack, "PostsTable"),
      scheduledRole: new iam.Role(stack, "ScheduledRole", {
        assumedBy: new iam.ServicePrincipal("events.amazonaws.com"),
      }),
      knowledgeBase: createMockKnowledgeBase(stack, "KnowledgeBase"),
      postScheduledGroupName: "MockPostScheduledGroup",
      eventBus: createMockEventBus(stack, "EventBus"),
      startWorkflowFunction: createMockNodejsFunction(stack, "StartWorkflow"),
      generatePostAgentFunction: createMockPythonFunction(
        stack,
        "GeneratePostAgent"
      ),
      invokeTextToVideoFunction: createMockNodejsFunction(stack, "InvokeT2V"),
    });

    template = Template.fromStack(stack);
  });

  /* ------------------------------------------------------------------ */
  /* 1.  GraphQL API basics                                             */
  /* ------------------------------------------------------------------ */
  it("creates an AppSync API with API KEY auth", () => {
    template.hasResourceProperties("AWS::AppSync::GraphQLApi", {
      AuthenticationType: "API_KEY",
      Name: "SchedulePostsAPI",
    });
  });

  /* ------------------------------------------------------------------ */
  /* 2.  Schema loaded – verify via findResources                       */
  /* ------------------------------------------------------------------ */
  it("loads the GraphQL schema file", () => {
    const schemas = template.findResources("AWS::AppSync::GraphQLSchema");
    // exactly one schema
    expect(Object.keys(schemas)).toHaveLength(1);
    const [schema] = Object.values(schemas) as any[];
    expect(typeof schema.Properties.Definition).toBe("string");
    expect(schema.Properties.Definition).toContain("schema {");
  });

  /* ------------------------------------------------------------------ */
  /* 3.  DynamoDB data source present                                   */
  /* ------------------------------------------------------------------ */
  it("configures at least one DynamoDB data source", () => {
    const ddbDS = template.findResources("AWS::AppSync::DataSource", {
      Type: "AMAZON_DYNAMODB",
    });
    expect(Object.keys(ddbDS).length).toBeGreaterThan(0);
    // quick sanity check on the first DS
    const [first] = Object.values(ddbDS) as any[];
    expect(first.Properties.DynamoDBConfig.TableName).toBeDefined();
  });

  /* ------------------------------------------------------------------ */
  /* 4.  IAM roles – there should be many, just spot‑check one policy   */
  /* ------------------------------------------------------------------ */
  it("creates IAM roles with AssumeRole for AppSync or Lambda", () => {
    const roles = template.findResources("AWS::IAM::Role");
    expect(Object.keys(roles).length).toBeGreaterThan(0);
    const roleDocs = Object.values(roles).map(
      (r) => r.Properties.AssumeRolePolicyDocument
    );
    const hasSts = roleDocs.some((doc: any) =>
      JSON.stringify(doc).includes("sts:AssumeRole")
    );
    expect(hasSts).toBe(true);
  });
});
