import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as pipes from "aws-cdk-lib/aws-pipes";
import * as appsync from "aws-cdk-lib/aws-appsync";
import { EventsConstructProps } from "../types";
import { COMMON_TAGS } from "../constants";

/**
 * Construct for EventBridge events, rules, and pipes
 */
export class EventsConstruct extends Construct {
  constructor(scope: Construct, id: string, props: EventsConstructProps) {
    super(scope, id);

    const { postsTable, api, schedulePostsFunction, eventBus } = props;

    // Create a role for the EventBridge Pipe
    const pipeRole = new iam.Role(this, "PipeRole", {
      assumedBy: new iam.ServicePrincipal("pipes.amazonaws.com"),
      description:
        "Role for EventBridge Pipe to connect DynamoDB to EventBridge",
    });

    // Grant permissions to the pipe role
    postsTable.grantStreamRead(pipeRole);
    eventBus.grantPutEventsTo(pipeRole);

    // Create EventBridge Pipe to connect new DynamoDB items to EventBridge
    new pipes.CfnPipe(this, "SchedulePostPipe", {
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

    // Create a role for AppSync to be a target of EventBridge rules
    const appSyncEventBridgeRole = new iam.Role(
      this,
      "AppSyncEventBridgeRole",
      {
        assumedBy: new iam.ServicePrincipal("events.amazonaws.com"),
        description: "Role for EventBridge to invoke AppSync mutations",
      }
    );

    // Grant permissions to invoke AppSync mutations
    appSyncEventBridgeRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["appsync:GraphQL"],
        resources: [`${api.arn}/types/Mutation/*`],
      })
    );

    // Create a rule for generated text responses
    new events.CfnRule(this, "GeneratedTextResponse", {
      eventBusName: eventBus.eventBusName,
      eventPattern: {
        source: ["generatedText.response"],
        "detail-type": ["generated.text"],
      },
      targets: [
        {
          id: "GeneratedTextResponse",
          arn: (api.node.defaultChild as appsync.CfnGraphQLApi)
            .attrGraphQlEndpointArn,
          roleArn: appSyncEventBridgeRole.roleArn,
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

    // Create a rule for generated images responses
    new events.CfnRule(this, "GeneratedImagesResponse", {
      eventBusName: eventBus.eventBusName,
      eventPattern: {
        source: ["generatedImages.response"],
        "detail-type": ["generated.images"],
      },
      targets: [
        {
          id: "GeneratedImagesResponse",
          arn: (api.node.defaultChild as appsync.CfnGraphQLApi)
            .attrGraphQlEndpointArn,
          roleArn: appSyncEventBridgeRole.roleArn,
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

    // Create a CloudWatch Log group to catch all events through this event bus, for debugging
    const logsGroup = new logs.LogGroup(this, "EventsLogGroup", {
      logGroupName: "/aws/events/ScheduledPostsEventBus/logs",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create a rule to log all events for debugging
    new events.Rule(this, "CatchAllLogRule", {
      ruleName: "catch-all-events",
      eventBus: eventBus,
      eventPattern: {
        source: events.Match.prefix(""),
      },
      targets: [new targets.CloudWatchLogGroup(logsGroup)],
    });

    // Create a rule to trigger the schedule posts function when a post is created
    new events.Rule(this, "CreatePostSchedulesRule", {
      ruleName: "create-post-schedules",
      eventBus: eventBus,
      eventPattern: {
        source: events.Match.exactString("schedule.posts"),
        detailType: events.Match.exactString("SchedulePostCreated"),
      },
      targets: [new targets.LambdaFunction(schedulePostsFunction)],
    });

    // Apply common tags to all resources
    [logsGroup].forEach((resource) => {
      Object.entries(COMMON_TAGS).forEach(([key, value]) => {
        cdk.Tags.of(resource).add(key, value);
      });
    });
  }
}
