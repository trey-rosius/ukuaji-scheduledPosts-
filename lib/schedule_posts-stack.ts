import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as iam from "aws-cdk-lib/aws-iam";
import { COMMON_TAGS } from "./constants";
import { DatabaseConstruct } from "./constructs/database-construct";

import { AuthConstruct } from "./constructs/auth-construct";
import { WorkflowConstruct } from "./constructs/workflow-construct";
import { EventsConstruct } from "./constructs/events-construct";
import { AppSyncConstruct } from "./constructs/appsync-construct";

import { WafConstruct } from "./constructs/waf-construct";

/**
 * Stack for the Scheduled Posts application
 */
export class SchedulePostsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create the IAM role for scheduled tasks
    const scheduledRole = new iam.Role(this, "ScheduledRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
      description: "Role assumed by EventBridge Scheduler for scheduled posts",
    });

    // Create a schedule group for all user schedules
    const postScheduleGroup = new scheduler.ScheduleGroup(
      this,
      "PostScheduleGroup",
      {
        scheduleGroupName: "PostScheduleGroup",
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );

    // Apply common tags to the schedule group
    Object.entries(COMMON_TAGS).forEach(([key, value]) => {
      cdk.Tags.of(postScheduleGroup).add(key, value);
    });

    // Create the database construct
    const databaseConstruct = new DatabaseConstruct(this, "DatabaseConstruct", {
      tableName: "ScheduledPostsTable",
      enablePITR: false, // Consider enabling for production
    });

    // Create the authentication construct
    const authConstruct = new AuthConstruct(this, "AuthConstruct", {
      userPoolName: "ScheduledPostsUserPool",
    });

    // Create the EventBridge event bus
    const eventBus = new cdk.aws_events.EventBus(this, "EventBus", {
      eventBusName: "ScheduledPostsEventBus",
    });

    // Apply common tags to the event bus
    Object.entries(COMMON_TAGS).forEach(([key, value]) => {
      cdk.Tags.of(eventBus).add(key, value);
    });

    const workflowConstruct = new WorkflowConstruct(this, "WorkflowConstruct", {
      eventBus: eventBus,
    });

    // Grant the queue processor function permission to start
    // Create the AppSync construct
    const appSyncConstruct = new AppSyncConstruct(this, "AppSyncConstruct", {
      postsTable: databaseConstruct.postsTable,
      scheduledRole: scheduledRole,

      postScheduledGroupName: postScheduleGroup.scheduleGroupName,
      generatePostAgentFunction: workflowConstruct.generatePostAgentFunction,
      startWorkflowFunction: workflowConstruct.startWorkflowFunction,
      invokeAgentLambda: workflowConstruct.generatePostAgentFunction,

      eventBus: eventBus,
      userPool: authConstruct.userPool,
    });

    // Create the WAF construct to protect the AppSync API
    const wafConstruct = new WafConstruct(this, "WafConstruct", {
      api: appSyncConstruct.api,
      webAclName: "ScheduledPostsApiProtection",
      rateLimit: 1500, // Allow 1500 requests per 5-minute window
      enableManagedRules: true, // Enable AWS managed rule sets
    });

    // Create the events construct after AppSync is created
    const eventsConstruct = new EventsConstruct(this, "EventsConstruct", {
      postsTable: databaseConstruct.postsTable,
      eventBus: eventBus,
      api: appSyncConstruct.api,
      schedulePostsFunction: appSyncConstruct.schedulePostsFunction,
    });

    // Grant the schedule posts function access to the DynamoDB table
    databaseConstruct.postsTable.grantReadWriteData(
      appSyncConstruct.schedulePostsFunction
    );

    // Output the API URL, API Key, and WAF WebACL ID
    new cdk.CfnOutput(this, "GraphQLAPIURL", {
      value: appSyncConstruct.api.graphqlUrl,
      description: "The URL of the GraphQL API",
    });

    new cdk.CfnOutput(this, "WafWebAclId", {
      value: wafConstruct.webAcl.attrId,
      description: "The ID of the WAF WebACL protecting the GraphQL API",
    });

    // Output the media bucket name
    new cdk.CfnOutput(this, "MediaBucketName", {
      value: workflowConstruct.mediaBucket.bucketName,
      description: "The name of the S3 bucket for media uploads",
    });

    new cdk.CfnOutput(this, "GraphQLAPIKey", {
      value: appSyncConstruct.api.apiKey || "",
      description: "The API key for the GraphQL API",
    });

    new cdk.CfnOutput(this, "UserPoolId", {
      value: authConstruct.userPool.userPoolId,
      description: "The ID of the Cognito User Pool",
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: authConstruct.userPoolClient.userPoolClientId,
      description: "The ID of the Cognito User Pool Client",
    });

    // Apply common tags to the stack
    Object.entries(COMMON_TAGS).forEach(([key, value]) => {
      cdk.Tags.of(this).add(key, value);
    });
  }
}
