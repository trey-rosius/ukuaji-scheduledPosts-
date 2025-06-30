import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import { PythonFunction } from "@aws-cdk/aws-lambda-python-alpha";
import {
  COMMON_TAGS,
  COMMON_LAMBDA_ENV_VARS,
  DEFAULT_LAMBDA_MEMORY_SIZE,
  DEFAULT_LOG_RETENTION_DAYS,
  DEFAULT_REMOVAL_POLICY,
} from "../constants";
import { MediaProcessingConstructProps } from "../types";
import { StateMachine } from "aws-cdk-lib/aws-stepfunctions";

/**
 * Construct for media processing resources
 */
export class MediaProcessingConstruct extends Construct {
  /**
   * The SQS queue for processing uploaded files
   */
  public readonly processingQueue: sqs.Queue;

  /**
   * The S3 bucket for processing uploaded files
   */
  public readonly mediaBucket: s3.Bucket;

  /**
   * The Lambda function for processing uploaded files
   */
  public readonly uploadProcessorFunction: PythonFunction;

  /**
   * The Lambda function for processing SQS messages
   */
  public readonly queueProcessorFunction: PythonFunction;

  /**
   * The extract text state machine reference
   */
  public extractTextStateMachine: StateMachine;

  /**
   * The transcribe media state machine reference
   */
  public transcribeMediaStateMachine: StateMachine;

  constructor(
    scope: Construct,
    id: string,
    props: MediaProcessingConstructProps
  ) {
    super(scope, id);

    const {
      postsTable,
      extractTextStateMachine,
      transcribeMediaStateMachine,
      extractTextHandlerFunction,
      postMediaBucket,
      knowledgeBase,
    } = props;

    this.mediaBucket = new s3.Bucket(this, "ScheduledPostDocsMediaBucket", {
      bucketName: `${cdk.Stack.of(this).account}-${
        cdk.Stack.of(this).region
      }-media`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      lifecycleRules: [
        {
          id: "DeleteOldVersions",
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
    });

    this.mediaBucket.grantReadWrite(extractTextHandlerFunction);
    extractTextStateMachine.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:PutObject"],
        resources: [
          this.mediaBucket.bucketArn,
          `${this.mediaBucket.bucketArn}/*`,
        ],
        effect: iam.Effect.ALLOW,
      })
    );

    transcribeMediaStateMachine.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:PutObject"],
        resources: [
          this.mediaBucket.bucketArn,
          `${this.mediaBucket.bucketArn}/*`,
        ],
        effect: iam.Effect.ALLOW,
      })
    );
    // Create an SQS queue for processing uploaded files
    this.processingQueue = new sqs.Queue(this, "ProcessingQueue", {
      queueName: "MediaProcessingQueue",
      visibilityTimeout: cdk.Duration.seconds(300), // 5 minutes
      retentionPeriod: cdk.Duration.days(14),
      deadLetterQueue: {
        queue: new sqs.Queue(this, "DeadLetterQueue", {
          queueName: "MediaProcessingDLQ",
          retentionPeriod: cdk.Duration.days(14),
        }),
        maxReceiveCount: 3,
      },
    });

    // Create a Lambda function for processing uploaded files
    this.uploadProcessorFunction = new PythonFunction(
      this,
      "UploadProcessorFunction",
      {
        entry: "./src/media_processing/",
        index: "upload_processor.py",
        handler: "lambda_handler",
        runtime: lambda.Runtime.PYTHON_3_12,
        memorySize: DEFAULT_LAMBDA_MEMORY_SIZE,
        timeout: cdk.Duration.seconds(30),
        logRetention: DEFAULT_LOG_RETENTION_DAYS,
        tracing: lambda.Tracing.ACTIVE,
        environment: {
          ...COMMON_LAMBDA_ENV_VARS,
          POST_TABLE: postsTable.tableName,
          QUEUE: this.processingQueue.queueUrl,
          BUCKET: this.mediaBucket.bucketName,
        },
      }
    );

    // Create a Lambda function for processing SQS messages
    this.queueProcessorFunction = new PythonFunction(
      this,
      "QueueProcessorFunction",
      {
        entry: "./src/media_processing/",
        index: "queue_processor.py",
        handler: "lambda_handler",
        runtime: lambda.Runtime.PYTHON_3_12,
        memorySize: 1024, // Higher memory for processing PDFs and media
        timeout: cdk.Duration.minutes(5),
        logRetention: DEFAULT_LOG_RETENTION_DAYS,
        tracing: lambda.Tracing.ACTIVE,
        environment: {
          ...COMMON_LAMBDA_ENV_VARS,
          POST_TABLE: postsTable.tableName,
          BUCKET: this.mediaBucket.bucketName,
          EXTRACT_TEXT_STATE_MACHINE_ARN:
            extractTextStateMachine.stateMachineArn || "",
          TRANSCRIBE_MEDIA_STATE_MACHINE_ARN:
            transcribeMediaStateMachine.stateMachineArn || "",
          STRANDS_KNOWLEDGE_BASE_ID: knowledgeBase.knowledgeBaseId,
          BYPASS_TOOL_CONSENT: "True",
        },
      }
    );

    this.queueProcessorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:ListDataSources",
          "bedrock:StartIngestionJob",
          "bedrock:GetIngestionJob",
          "bedrock:ListIngestionJobs",
          "bedrock:IngestKnowledgeBaseDocuments",
          "bedrock:AssociateThirdPartyKnowledgeBase",
        ],
        resources: ["*"],
        effect: iam.Effect.ALLOW,
      })
    );

    // Grant the upload processor function permissions to access the DynamoDB table
    postsTable.grantReadWriteData(this.uploadProcessorFunction);

    // Grant the upload processor function permissions to access the S3 bucket
    this.mediaBucket.grantReadWrite(this.uploadProcessorFunction);

    // Grant the upload processor function permissions to send messages to the SQS queue
    this.processingQueue.grantSendMessages(this.uploadProcessorFunction);

    // Grant the queue processor function permissions to access the DynamoDB table
    postsTable.grantReadWriteData(this.queueProcessorFunction);

    // Grant the queue processor function permissions to access the S3 bucket
    this.mediaBucket.grantReadWrite(this.queueProcessorFunction);

    // Grant the queue processor function permissions to receive and delete messages from the SQS queue
    this.processingQueue.grantConsumeMessages(this.queueProcessorFunction);

    // Add permissions for Bedrock and other AWS services
    this.queueProcessorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "stepfunctions:StartExecution",
        ],
        resources: ["*"], // Consider restricting to specific ARNs in production
        effect: iam.Effect.ALLOW,
      })
    );

    // Configure the S3 bucket to trigger the Lambda function when files are uploaded to the uploads/ path
    this.mediaBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(this.uploadProcessorFunction),
      {
        prefix: "uploads/",
      }

      // This will trigger for all uploads, we'll filter by path in the Lambda function
    );

    // Configure the SQS queue to trigger the Lambda function
    this.queueProcessorFunction.addEventSource(
      new cdk.aws_lambda_event_sources.SqsEventSource(this.processingQueue, {
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(30),
      })
    );

    // Apply common tags
    [
      this.processingQueue,
      this.uploadProcessorFunction,
      this.queueProcessorFunction,
    ].forEach((resource) => {
      Object.entries(COMMON_TAGS).forEach(([key, value]) => {
        cdk.Tags.of(resource).add(key, value);
      });
    });
  }
}
