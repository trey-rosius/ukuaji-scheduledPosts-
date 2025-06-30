import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as iam from "aws-cdk-lib/aws-iam";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as waf from "aws-cdk-lib/aws-wafv2";
import {
  Agent,
  AgentAlias,
  KnowledgeBaseBase,
} from "@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/bedrock";
import { StateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { PythonFunction } from "@aws-cdk/aws-lambda-python-alpha/lib/function";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs/lib/function";
import * as s3 from "aws-cdk-lib/aws-s3";

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

  /**
   * The DynamoDB table for posts
   */
  postsTable: dynamodb.Table;
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
 * Properties for the MediaProcessingConstruct
 */
export interface MediaProcessingConstructProps {
  /**
   * The S3 bucket for media uploads
   */
  postMediaBucket: s3.Bucket;

  /**
   * The DynamoDB table for posts
   */
  postsTable: dynamodb.Table;

  /**
   * The Step Functions state machine for extracting text from files
   */
  extractTextStateMachine: StateMachine;

  /**
   * The Step Functions state machine for transcribing media files
   */
  transcribeMediaStateMachine: StateMachine;

  extractTextHandlerFunction: PythonFunction;
  knowledgeBase: KnowledgeBaseBase;
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
   * Agent
   */

  agent: Agent;

  /**
   * Agent Alias
   */

  agentAlias: AgentAlias;

  /**
   * invoke agent lambda functio
   */

  invokeAgentLambda: PythonFunction;

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

  /**
   * The Lambda function for invoking the text-to-video workflow
   */
  invokeTextToVideoFunction: NodejsFunction;
}

/**
 * Properties for the WafConstruct
 */
export interface WafConstructProps {
  /**
   * The AppSync GraphQL API to protect
   */
  api: appsync.GraphqlApi;

  /**
   * The name of the WAF WebACL
   * @default "GraphQLApiProtection"
   */
  webAclName?: string;

  /**
   * The rate limit for requests per 5-minute window
   * @default 1000
   */
  rateLimit?: number;

  /**
   * Whether to enable AWS managed rule sets
   * @default true
   */
  enableManagedRules?: boolean;
}
