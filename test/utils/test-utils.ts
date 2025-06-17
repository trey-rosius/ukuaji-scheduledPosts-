import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as events from "aws-cdk-lib/aws-events";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import { KnowledgeBaseBase } from "@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/bedrock";
import { StateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { PythonFunction } from "@aws-cdk/aws-lambda-python-alpha";

/**
 * Creates a mock DynamoDB table for testing
 */
export function createMockDynamoDBTable(
  scope: Construct,
  id: string
): dynamodb.Table {
  return new dynamodb.Table(scope, id, {
    partitionKey: {
      name: "PK",
      type: dynamodb.AttributeType.STRING,
    },
    sortKey: {
      name: "SK",
      type: dynamodb.AttributeType.STRING,
    },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  });
}

/**
 * Creates a mock Cognito user pool for testing
 */
export function createMockUserPool(
  scope: Construct,
  id: string
): cognito.UserPool {
  return new cognito.UserPool(scope, id, {
    selfSignUpEnabled: true,
    autoVerify: {
      email: true,
    },
    standardAttributes: {
      email: {
        required: true,
        mutable: true,
      },
    },
  });
}

/**
 * Creates a mock EventBridge event bus for testing
 */
export function createMockEventBus(
  scope: Construct,
  id: string
): events.EventBus {
  return new events.EventBus(scope, id);
}

/**
 * Creates a mock AppSync API for testing
 */
export function createMockAppSyncApi(
  scope: Construct,
  id: string
): appsync.GraphqlApi {
  return new appsync.GraphqlApi(scope, id, {
    name: "TestApi",
    schema: appsync.SchemaFile.fromAsset("schema/schema.graphql"),
    authorizationConfig: {
      defaultAuthorization: {
        authorizationType: appsync.AuthorizationType.API_KEY,
      },
    },
  });
}

/**
 * Creates a mock S3 bucket for testing
 */
export function createMockS3Bucket(scope: Construct, id: string): s3.Bucket {
  return new s3.Bucket(scope, id);
}

/**
 * Creates a mock IAM role for testing
 */
export function createMockIamRole(scope: Construct, id: string): iam.Role {
  return new iam.Role(scope, id, {
    assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
  });
}

/**
 * Creates a mock Lambda function for testing
 */
export function createMockLambdaFunction(
  scope: Construct,
  id: string
): lambda.Function {
  return new lambda.Function(scope, id, {
    runtime: lambda.Runtime.NODEJS_20_X,
    handler: "index.handler",
    code: lambda.Code.fromInline(`
      exports.handler = async (event) => {
        return { statusCode: 200, body: JSON.stringify({ message: 'Success' }) };
      };
    `),
  });
}

/**
 * Creates a mock NodejsFunction for testing
 */
export function createMockNodejsFunction(
  scope: Construct,
  id: string
): NodejsFunction {
  return new NodejsFunction(scope, id, {
    entry: "test/utils/mock-lambda.js",
    handler: "handler",
  });
}

/**
 * Creates a mock PythonFunction for testing
 */
export function createMockPythonFunction(scope: Construct, id: string): any {
  // Since we can't directly instantiate PythonFunction in tests without actual Python code,
  // we'll use a regular Lambda function as a stand-in for testing
  return new lambda.Function(scope, id, {
    runtime: lambda.Runtime.PYTHON_3_12,
    handler: "index.handler",
    code: lambda.Code.fromInline(`
      def handler(event, context):
          return {"statusCode": 200, "body": '{"message": "Success"}'}
    `),
  });
}

/**
 * Creates a mock StateMachine for testing
 */
export function createMockStateMachine(
  scope: Construct,
  id: string
): StateMachine {
  const lambdaFunction = createMockLambdaFunction(scope, `${id}Function`);

  return new StateMachine(scope, id, {
    definition: new cdk.aws_stepfunctions.Pass(scope, `${id}Pass`),
  });
}

/**
 * Creates a mock KnowledgeBaseBase for testing
 */
export function createMockKnowledgeBase(scope: Construct, id: string): any {
  // Since we can't directly instantiate KnowledgeBaseBase in tests,
  // we'll create a mock object with the necessary properties
  const bucket = createMockS3Bucket(scope, `${id}Bucket`);

  // Return a mock object that mimics the KnowledgeBaseBase interface
  return {
    knowledgeBaseId: "mock-knowledge-base-id",
    knowledgeBaseName: "MockKnowledgeBase",
    knowledgeBaseArn: `arn:aws:bedrock:us-east-1:123456789012:knowledge-base/mock-knowledge-base-id`,
    dataBucket: bucket,
    node: {
      id: id,
      scope: scope,
    },
  };
}

/**
 * Utility function to validate CloudFormation resources
 */
export function expectResourceProperties(
  template: Template,
  type: string,
  properties: any
): void {
  template.hasResourceProperties(type, properties);
}

/**
 * Utility function to validate CloudFormation resource count
 */
export function expectResourceCount(
  template: Template,
  type: string,
  count: number
): void {
  template.resourceCountIs(type, count);
}

/**
 * Mock context for testing AppSync resolvers
 */
export const createMockAppSyncContext = (
  args: any = {},
  identity: any = null,
  result: any = null,
  prev: any = null
) => {
  return {
    arguments: args,
    identity: identity,
    result: result,
    prev: prev,
    stash: {},
    request: { headers: {} },
    info: {
      fieldName: "mockField",
      parentTypeName: "Query",
      variables: {},
    },
  };
};

/**
 * Mock AWS Lambda event for testing Lambda functions
 */
export const createMockLambdaEvent = (data: any = {}) => {
  return {
    ...data,
    requestContext: {
      requestId: "mock-request-id",
    },
  };
};

/**
 * Mock AWS Lambda context for testing Lambda functions
 */
export const createMockLambdaContext = () => {
  return {
    awsRequestId: "mock-aws-request-id",
    functionName: "mock-function",
    functionVersion: "1",
    invokedFunctionArn:
      "arn:aws:lambda:us-east-1:123456789012:function:mock-function",
    memoryLimitInMB: "128",
    logGroupName: "/aws/lambda/mock-function",
    logStreamName: "2023/06/16/[$LATEST]abcdef123456",
    callbackWaitsForEmptyEventLoop: true,
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
};

/**
 * Mock DynamoDB client for testing
 */
export class MockDynamoDBClient {
  private mockResponses: Record<string, any> = {};

  public mockGetItem(response: any): void {
    this.mockResponses["getItem"] = response;
  }

  public mockPutItem(response: any): void {
    this.mockResponses["putItem"] = response;
  }

  public mockQuery(response: any): void {
    this.mockResponses["query"] = response;
  }

  public mockScan(response: any): void {
    this.mockResponses["scan"] = response;
  }

  public mockUpdateItem(response: any): void {
    this.mockResponses["updateItem"] = response;
  }

  public mockDeleteItem(response: any): void {
    this.mockResponses["deleteItem"] = response;
  }

  public getItem(): any {
    return this.mockResponses["getItem"] || { Item: null };
  }

  public putItem(): any {
    return this.mockResponses["putItem"] || {};
  }

  public query(): any {
    return this.mockResponses["query"] || { Items: [] };
  }

  public scan(): any {
    return this.mockResponses["scan"] || { Items: [] };
  }

  public updateItem(): any {
    return this.mockResponses["updateItem"] || {};
  }

  public deleteItem(): any {
    return this.mockResponses["deleteItem"] || {};
  }
}

/**
 * Mock S3 client for testing
 */
export class MockS3Client {
  private mockResponses: Record<string, any> = {};

  public mockGetObject(response: any): void {
    this.mockResponses["getObject"] = response;
  }

  public mockPutObject(response: any): void {
    this.mockResponses["putObject"] = response;
  }

  public mockListObjects(response: any): void {
    this.mockResponses["listObjects"] = response;
  }

  public mockDeleteObject(response: any): void {
    this.mockResponses["deleteObject"] = response;
  }

  public getObject(): any {
    return this.mockResponses["getObject"] || { Body: Buffer.from("") };
  }

  public putObject(): any {
    return this.mockResponses["putObject"] || {};
  }

  public listObjects(): any {
    return this.mockResponses["listObjects"] || { Contents: [] };
  }

  public deleteObject(): any {
    return this.mockResponses["deleteObject"] || {};
  }
}

/**
 * Mock EventBridge client for testing
 */
export class MockEventBridgeClient {
  private mockResponses: Record<string, any> = {};

  public mockPutEvents(response: any): void {
    this.mockResponses["putEvents"] = response;
  }

  public putEvents(): any {
    return (
      this.mockResponses["putEvents"] || { FailedEntryCount: 0, Entries: [] }
    );
  }
}

/**
 * Mock Bedrock client for testing
 */
export class MockBedrockClient {
  private mockResponses: Record<string, any> = {};

  public mockInvokeModel(response: any): void {
    this.mockResponses["invokeModel"] = response;
  }

  public mockRetrieveAndGenerate(response: any): void {
    this.mockResponses["retrieveAndGenerate"] = response;
  }

  public invokeModel(): any {
    return (
      this.mockResponses["invokeModel"] || {
        body: Buffer.from(JSON.stringify({ completion: "Mock response" })),
      }
    );
  }

  public retrieveAndGenerate(): any {
    return (
      this.mockResponses["retrieveAndGenerate"] || {
        output: { text: "Mock response" },
      }
    );
  }
}

/**
 * Mock Scheduler client for testing
 */
export class MockSchedulerClient {
  private mockResponses: Record<string, any> = {};

  public mockCreateSchedule(response: any): void {
    this.mockResponses["createSchedule"] = response;
  }

  public mockDeleteSchedule(response: any): void {
    this.mockResponses["deleteSchedule"] = response;
  }

  public createSchedule(): any {
    return (
      this.mockResponses["createSchedule"] || {
        ScheduleArn: "mock-schedule-arn",
      }
    );
  }

  public deleteSchedule(): any {
    return this.mockResponses["deleteSchedule"] || {};
  }
}

/**
 * Mock StepFunctions client for testing
 */
export class MockStepFunctionsClient {
  private mockResponses: Record<string, any> = {};

  public mockStartExecution(response: any): void {
    this.mockResponses["startExecution"] = response;
  }

  public startExecution(): any {
    return (
      this.mockResponses["startExecution"] || {
        executionArn: "mock-execution-arn",
      }
    );
  }
}
