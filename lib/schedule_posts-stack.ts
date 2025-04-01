import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as pipes from "aws-cdk-lib/aws-pipes";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";
import { CfnScheduleGroup } from "aws-cdk-lib/aws-scheduler";
import { LambdaTarget } from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import { CfnOutput, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as appsync from "aws-cdk-lib/aws-appsync";
import {
  CfnDataSource,
  CfnGraphQLSchema,
  FunctionRuntime,
} from "aws-cdk-lib/aws-appsync";

import { readFileSync } from "fs";
import { CfnStateMachine } from "aws-cdk-lib/aws-stepfunctions";
import {
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";

export class SchedulePostsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Path to your ASL definition file (adjust the relative path as needed)
    const aslFilePath = path.join(
      __dirname,
      "../workflow/state_machine_worflow.asl.json"
    );
    const definitionJson = JSON.parse(readFileSync(aslFilePath, "utf8"));

    // Create an IAM role for Step Functions (states.amazonaws.com must be allowed to assume this role)
    const stateMachineRole = new iam.Role(this, "StateMachineRole", {
      assumedBy: new iam.ServicePrincipal("states.amazonaws.com"),
      description: "IAM Role assumed by the Step Functions state machine",
    });

    // Grant permission to call Bedrock's InvokeModel on any foundation model.
    stateMachineRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );

    const bedrockRole = new iam.Role(this, "BedRockRole", {
      assumedBy: new iam.ServicePrincipal("appsync.amazonaws.com"),
    });
    const scheduleRole = new iam.Role(this, "scheduleRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
    });

    bedrockRole.addToPrincipalPolicy(
      new PolicyStatement({
        resources: [
          "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-canvas-v1:0",
        ],
        actions: ["bedrock:InvokeModel"],
      })
    );

    // Create the state machine using the CfnStateMachine construct
    const generatePostStateMachine = new CfnStateMachine(
      this,
      "GeneratePostStateMachine",
      {
        stateMachineName: "GeneratePostStateMachine",
        roleArn: stateMachineRole.roleArn,
        // Pass the ASL definition as a string
        definitionString: JSON.stringify(definitionJson),
        stateMachineType: "STANDARD", // or 'EXPRESS' if preferred
      }
    );
    const envVariables = {
      // AWS_ACCOUNT_ID: Stack.of(this).account,
      POWERTOOLS_SERVICE_NAME: "scheduled-posts",
      POWERTOOLS_LOGGER_LOG_LEVEL: "WARN",
      POWERTOOLS_LOGGER_SAMPLE_RATE: "0.01",
      POWERTOOLS_LOGGER_LOG_EVENT: "true",
      POWERTOOLS_METRICS_NAMESPACE: "ScheduledPosts",
    };

    const functionSettings = {
      handler: "handler",
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      memorySize: 256,

      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      tracing: cdk.aws_lambda.Tracing.ACTIVE,
      bundling: {
        minify: true,
      },
    };

    const sendPostsFunction = new NodejsFunction(this, "sendPostsFunction", {
      entry: "./src/sendPosts.ts",
      ...functionSettings,
      environment: {
        ...envVariables,
      },
    });

    const scheduledPostGraphqlApi = new appsync.GraphqlApi(this, "Api", {
      name: "scheduledPostApp",
      definition: appsync.Definition.fromFile("schema/schema.graphql"),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
        },
        additionalAuthorizationModes: [
          { authorizationType: appsync.AuthorizationType.IAM },
        ],
      },
      xrayEnabled: true,
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ALL,
      },
    });
    const bedrock_datasource = new CfnDataSource(this, "bedrock-datasource", {
      apiId: scheduledPostGraphqlApi.apiId,
      name: "BedrockDataSource",
      type: "AMAZON_BEDROCK_RUNTIME",
      serviceRoleArn: bedrockRole.roleArn,
    });

    const startWorkflowFunction = new NodejsFunction(
      this,
      "startStepFunctionsWorkflow",
      {
        entry: "./src/startStateMachine.ts",
        ...functionSettings,
        environment: {
          ...envVariables,
          STATE_MACHINE_ARN: generatePostStateMachine.attrArn,
        },
      }
    );

    sendPostsFunction.grantInvoke(scheduleRole);
    // Schedule group for all the user schedules
    const postscheduleGroup = new CfnScheduleGroup(this, "PostScheduleGroup", {
      name: "PostScheduleGroup",
    });

    const schedulePostsFunction = new NodejsFunction(
      this,
      "schedulePostsFunction",
      {
        entry: "./src/schedulePosts.ts",
        ...functionSettings,
        environment: {
          ...envVariables,
          SCHEDULE_GROUP_NAME: postscheduleGroup.name || "",
          SEND_POST_SERVICE_ARN: sendPostsFunction.functionArn,
          SCHEDULE_ROLE_ARN: scheduleRole.roleArn,
        },
        initialPolicy: [
          // Give lambda permission to create group, schedule and pass IAM role to the scheduler
          new iam.PolicyStatement({
            // actions: ['scheduler:CreateSchedule', 'iam:PassRole', 'scheduler:CreateScheduleGroup'],
            actions: ["scheduler:CreateSchedule", "iam:PassRole"],
            resources: ["*"],
          }),
        ],
      }
    );

    // Grant the Lambda function permissions to start, describe, and stop the state machine execution.
    startWorkflowFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "states:StartExecution",
          "states:DescribeExecution",
          "states:StopExecution",
        ],
        resources: [generatePostStateMachine.attrArn],
      })
    );
    // Event Bus used for application
    const eventBus = new events.EventBus(this, "ScheduledPostEventBus", {
      eventBusName: "ScheduledPostEventBus",
    });

    const noneDs = scheduledPostGraphqlApi.addNoneDataSource("None");
    // The DynamoDB table for users
    const postsTable = new dynamodb.Table(this, "postsTable", {
      tableName: "postSchedulerTable",
      partitionKey: {
        name: "postId",
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_IMAGE,
    });

    scheduledPostGraphqlApi.createResolver("generatedTextResponse", {
      typeName: "Mutation",
      fieldName: "generatedText",
      runtime: FunctionRuntime.JS_1_0_0,
      dataSource: noneDs,
      code: appsync.Code.fromAsset("./resolvers/generatedText.js"),
    });

    new appsync.CfnResolver(this, "generateImagesResolver", {
      apiId: scheduledPostGraphqlApi.apiId,
      fieldName: "generateImages",
      typeName: "Query",

      dataSourceName: bedrock_datasource.name,
      runtime: {
        name: "APPSYNC_JS",
        runtimeVersion: "1.0.0",
      },
      code: `import { invokeModel } from "@aws-appsync/utils/ai";
import { runtime } from "@aws-appsync/utils";

export function request(ctx) {
  const input = ctx.args.input;

  //const guardrail_id = ctx.env.GUARDRAIL_ID;
  // const guardrail_version = ctx.env.GUARDRAIL_VERSION;

  return invokeModel({
    modelId: "amazon.nova-canvas-v1:0",
    // guardrailIdentifier: guardrail_id,
    //guardrailVersion: guardrail_version,
    body: {
      
      taskType: "TEXT_IMAGE",
      "textToImageParams": {
            "text": input
        },
      imageGenerationConfig: {
        numberOfImages: 1,
        height: 1024,
        width: 720,
        cfgScale: 8,
        seed: 42,
      },
      
    },
  });
}

export function response(ctx) {
  console.log(\`result is \${ctx.result.images}\`);
  return ctx.result.images;
}`,
    }).addDependency(bedrock_datasource);

    const lambdaDatasource = scheduledPostGraphqlApi
      .addLambdaDataSource(
        "startStateMachineLAmbdaDatasource",
        startWorkflowFunction
      )
      .createResolver("startStateMachineResolver", {
        typeName: "Mutation",
        fieldName: "startStateMachine",
        code: appsync.Code.fromAsset(
          path.join(__dirname, "../invoke/invoke.js")
        ),
        runtime: appsync.FunctionRuntime.JS_1_0_0,
      });

    // CloudWatch Log group to catch all events through this event bus, for debugging.
    new events.Rule(this, "catchAllLogRule", {
      ruleName: "catch-all",
      eventBus: eventBus,
      eventPattern: {
        source: events.Match.prefix(""),
      },
      targets: [
        new targets.CloudWatchLogGroup(
          new logs.LogGroup(this, "ScheduledPostsBusAllEvents", {
            logGroupName: "/aws/events/ScheduledPostsEventBus/logs",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          })
        ),
      ],
    });

    // Create a rule. Listen for event and trigger lambda to create schedule
    new events.Rule(this, "create-post-schedules", {
      ruleName: "create-post-schedules",
      eventBus: eventBus,
      eventPattern: {
        source: events.Match.exactString("schedule.posts"),
        detailType: events.Match.exactString("SchedulePostCreated"),
      },
      targets: [new targets.LambdaFunction(schedulePostsFunction)],
    });

    const pipeRole = new iam.Role(this, "ScheduledPostsPipeRole", {
      assumedBy: new iam.ServicePrincipal("pipes.amazonaws.com"),
    });

    postsTable.grantReadWriteData(schedulePostsFunction);
    postsTable.grantStreamRead(pipeRole);
    eventBus.grantPutEventsTo(pipeRole);

    // Create EventBridge Pipe, to connect new DynamoDB items to EventBridge.
    new pipes.CfnPipe(this, "schedulepostpipe", {
      roleArn: pipeRole.roleArn,
      source: postsTable.tableStreamArn!,
      sourceParameters: {
        dynamoDbStreamParameters: {
          startingPosition: "LATEST",
          batchSize: 3,
        },
        filterCriteria: {
          filters: [
            {
              pattern: '{"eventName" : ["INSERT"] }',
            },
          ],
        },
      },
      target: eventBus.eventBusArn,
      targetParameters: {
        eventBridgeEventBusParameters: {
          detailType: "SchedulePostCreated",
          source: "schedule.posts",
        },
        inputTemplate: '{"postId": <$.dynamodb.NewImage.postId.S>}',
      },
    });

    const policyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["appsync:GraphQL"],
      resources: [`${scheduledPostGraphqlApi.arn}/types/Mutation/*`],
    });

    const ebRuleRole = new Role(this, "AppSyncEventBridgeRole", {
      assumedBy: new ServicePrincipal("events.amazonaws.com"),
      inlinePolicies: {
        PolicyStatement: new PolicyDocument({
          statements: [policyStatement],
        }),
      },
    });

    eventBus.grantPutEventsTo(stateMachineRole);

    new events.CfnRule(this, "GeneratedTextResponse", {
      eventBusName: eventBus.eventBusName,

      eventPattern: {
        source: ["generatedText.response"],
        "detail-type": ["generated.text"],
      },
      targets: [
        {
          id: "GeneratedTextResponse",
          arn: (
            scheduledPostGraphqlApi.node.defaultChild as appsync.CfnGraphQLApi
          ).attrGraphQlEndpointArn,
          roleArn: ebRuleRole.roleArn,
          appSyncParameters: {
            graphQlOperation: `mutation GeneratedText($input:String!) { generatedText(input: $input) { text} }`,
          },
          inputTransformer: {
            inputPathsMap: {
              input: "$.detail.input",
            },
            inputTemplate: JSON.stringify({
              input: "<input>",
            }),
          },
        },
      ],
    });

    // Output the API URL and API Key
    new cdk.CfnOutput(this, "GraphQLAPIURL", {
      value: scheduledPostGraphqlApi.graphqlUrl,
    });

    new cdk.CfnOutput(this, "GraphQLAPIKey", {
      value: scheduledPostGraphqlApi.apiKey || "",
    });
  }
}
