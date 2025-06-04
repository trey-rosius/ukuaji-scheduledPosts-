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
import { ScheduleGroup } from "aws-cdk-lib/aws-scheduler";
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
import { DataConstruct } from "./data-construct";
import { StateMachineConstruct } from "./statemachine-construct";
import { AppSyncConstruct } from "./appsync-construct";
import { knowledgeBaseConstruct } from "./knowledgebase-construct";

export class SchedulePostsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const dataConstruct = new DataConstruct(this, "DataConstruct");
    const stateMachineConstruct = new StateMachineConstruct(
      this,
      "StateMachineConstruct"
    );
    const scheduleRole = new iam.Role(this, "scheduleRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
    });
    // Schedule group for all the user schedules
    const postscheduleGroup = new ScheduleGroup(this, "PostScheduleGroup", {
      scheduleGroupName: "PostScheduleGroup",
      removalPolicy: RemovalPolicy.DESTROY,
    });
    // Event Bus used for application
    const eventBus = new events.EventBus(this, "rocreateEventBus", {
      eventBusName: "rocreateEventBus",
    });
    const kbConstruct = new knowledgeBaseConstruct(
      this,
      "KnowledgeBaseConstruct",
      {}
    );
    const appSyncConstruct = new AppSyncConstruct(this, "AppSyncConstruct", {
      postsTable: dataConstruct.postsTable,
      scheduledRole: scheduleRole,
      knowledgeBase: kbConstruct.knowledgeBase,
      postScheduledGroupName: postscheduleGroup.scheduleGroupName,
      generatePostStateMachine: stateMachineConstruct.generatePostStateMachine,
      eventbus: eventBus,
    });

    const pipeRole = new Role(this, "ScheduledPostsPipeRole", {
      assumedBy: new ServicePrincipal("pipes.amazonaws.com"),
    });

    dataConstruct.postsTable.grantReadWriteData(
      appSyncConstruct.schedulePostsFunction
    );
    dataConstruct.postsTable.grantStreamRead(pipeRole);
    eventBus.grantPutEventsTo(pipeRole);

    // Create EventBridge Pipe, to connect new DynamoDB items to EventBridge.
    new pipes.CfnPipe(this, "schedulePostPipe", {
      roleArn: pipeRole.roleArn,
      source: dataConstruct.postsTable.tableStreamArn!,
      sourceParameters: {
        dynamoDbStreamParameters: {
          startingPosition: "LATEST",
          batchSize: 3,
        },
        filterCriteria: {
          filters: [
            {
              pattern: JSON.stringify({
                eventName: ["INSERT"],
                dynamodb: {
                  NewImage: {
                    entity: {
                      S: ["POST"],
                    },
                  },
                },
              }),
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
        inputTemplate: '{"posts": <$.dynamodb.NewImage>}',
      },
    });

    const policyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["appsync:GraphQL"],
      resources: [
        `${appSyncConstruct.scheduledPostGraphqlApi.arn}/types/Mutation/*`,
      ],
    });

    const ebRuleRole = new Role(this, "AppSyncEventBridgeRole", {
      assumedBy: new ServicePrincipal("events.amazonaws.com"),
      inlinePolicies: {
        PolicyStatement: new PolicyDocument({
          statements: [policyStatement],
        }),
      },
    });

    eventBus.grantPutEventsTo(stateMachineConstruct.stateMachineRole);

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
            appSyncConstruct.scheduledPostGraphqlApi.node
              .defaultChild as appsync.CfnGraphQLApi
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

    new events.CfnRule(this, "GeneratedImagesResponse", {
      eventBusName: eventBus.eventBusName,

      eventPattern: {
        source: ["generatedImages.response"],
        "detail-type": ["generated.images"],
      },
      targets: [
        {
          id: "GeneratedImagesResponse",
          arn: (
            appSyncConstruct.scheduledPostGraphqlApi.node
              .defaultChild as appsync.CfnGraphQLApi
          ).attrGraphQlEndpointArn,
          roleArn: ebRuleRole.roleArn,
          appSyncParameters: {
            graphQlOperation: `mutation GenerateImagesResponse($input:[String!]!) { generateImagesResponse(input: $input){
             base64Images
            
            } }`,
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

    // CloudWatch Log group to catch all events through this event bus, for debugging.
    new events.Rule(this, "catchAllLogRule", {
      ruleName: "catch-all",
      eventBus: eventBus,
      eventPattern: {
        source: events.Match.prefix(""),
      },
      targets: [
        new targets.CloudWatchLogGroup(
          new logs.LogGroup(this, "rocreateLogsEvents", {
            logGroupName: "/aws/events/rocreateEventBus/logs",
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
      targets: [
        new targets.LambdaFunction(appSyncConstruct.schedulePostsFunction),
      ],
    });

    // Output the API URL and API Key
    new cdk.CfnOutput(this, "GraphQLAPIURL", {
      value: appSyncConstruct.scheduledPostGraphqlApi.graphqlUrl,
    });

    new cdk.CfnOutput(this, "GraphQLAPIKey", {
      value: appSyncConstruct.scheduledPostGraphqlApi.apiKey || "",
    });
  }
}
