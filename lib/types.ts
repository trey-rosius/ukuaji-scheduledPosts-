import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as iam from "aws-cdk-lib/aws-iam";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { KnowledgeBaseBase } from "@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/bedrock";
import { StateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { PythonFunction } from "@aws-cdk/aws-lambda-python-alpha/lib/function";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs/lib/function";

/**
 * Properties for the AuthConstruct
 */
export interface AuthConstructProps {
  /**
   * The name of the user pool
   */
  userPoolName?: string;
}

/**
 * Properties for the DatabaseConstruct
 */
export interface DatabaseConstructProps {
  /**
   * The name of the DynamoDB table
   */
  tableName: string;

  /**
   * Whether to enable point-in-time recovery
   */
  enablePITR?: boolean;
}

/**
 * Properties for the KnowledgeBaseConstruct
 */
export interface KnowledgeBaseConstructProps {
  /**
   * The name of the knowledge base
   */
  knowledgeBaseName: string;

  /**
   * The name of the S3 bucket for knowledge base data
   */
  bucketName: string;

  /**
   * The connection string for Pinecone
   */
  pineconeConnectionString: string;

  /**
   * The ARN of the secret containing Pinecone credentials
   */
  pineconeCredentialsSecretArn: string;
}

/**
 * Properties for the WorkflowConstruct
 */
export interface WorkflowConstructProps {
  /**
   * The EventBridge event bus
   */
  eventBus: events.EventBus;

  /**
   * The Bedrock knowledge base
   */
  knowledgeBase: KnowledgeBaseBase;
}

/**
 * Properties for the EventsConstruct
 */
export interface EventsConstructProps {
  /**
   * The DynamoDB table for posts
   */
  postsTable: dynamodb.Table;

  /**
   * The EventBridge event bus
   */
  eventBus: events.EventBus;

  /**
   * The AppSync GraphQL API
   */
  api: appsync.GraphqlApi;

  /**
   * The Lambda function for scheduling posts
   */
  schedulePostsFunction: lambda.Function;
}

/**
 * Properties for the AppSyncConstruct
 */
export interface AppSyncConstructProps {
  /**
   * The DynamoDB table for posts
   */
  postsTable: dynamodb.Table;

  /**
   * The IAM role for scheduled tasks
   */
  scheduledRole: iam.Role;

  /**
   * The Bedrock knowledge base
   */
  knowledgeBase: KnowledgeBaseBase;

  /**
   * The name of the schedule group for posts
   */
  postScheduledGroupName: string;

  /**
   * The EventBridge event bus
   */
  eventBus: events.EventBus;

  /**
   * The Cognito user pool
   */
  userPool: cognito.UserPool;

  generatePostAgentFunction: PythonFunction;

  startWorkflowFunction: NodejsFunction;
}
