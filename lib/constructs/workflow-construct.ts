import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as s3 from "aws-cdk-lib/aws-s3";

import { PythonFunction } from "@aws-cdk/aws-lambda-python-alpha";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { WorkflowConstructProps } from "../types";
import {
  COMMON_TAGS,
  COMMON_LAMBDA_ENV_VARS,
  DEFAULT_LAMBDA_MEMORY_SIZE,
  DEFAULT_LOG_RETENTION_DAYS,
} from "../constants";
import * as path from "path";
import { readFileSync } from "fs";

/**
 * Construct for Step Functions workflows and related resources
 */
export class WorkflowConstruct extends Construct {
  /**
   * The Lambda function for generating posts with an agent
   */
  public readonly generatePostAgentFunction: PythonFunction;

  /**
   * The Step Function state machine for generating posts with context
   */
  public readonly generatePostWithContextStateMachine: sfn.StateMachine;

  /**
   * The Step Function state machine for generating posts without context
   */
  public readonly generatePostWithoutContextStateMachine: sfn.StateMachine;

  /**
   * The Step Function state machine for text-to-video generation
   */
  public readonly textToVideoStateMachine: sfn.StateMachine;

  /**
   * The Step Function state machine for extracting text from files
   */
  public readonly extractTextFromFileStateMachine: sfn.StateMachine;

  /**
   * The Step Function state machine for transcribing media files
   */
  public readonly transcribeMediaStateMachine: sfn.StateMachine;

  /**
   * The Lambda function for handling extracted text
   */
  public readonly extractTextHandlerFunction: PythonFunction;

  /**
   * The S3 bucket for storing generated videos and thumbnails
   */
  public readonly mediaBucket: s3.Bucket;

  /**
   * The Lambda function for starting workflows
   */
  public readonly startWorkflowFunction: NodejsFunction;

  /**
   * The Lambda function for invoking the text-to-video workflow
   */
  public readonly invokeTextToVideoFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: WorkflowConstructProps) {
    super(scope, id);

    const { eventBus, knowledgeBase, postsTable } = props;

    // Create an S3 bucket for storing generated videos and thumbnails
    this.mediaBucket = new s3.Bucket(this, "MediaBucket", {
      bucketName: `${cdk.Stack.of(this).account}-${
        cdk.Stack.of(this).region
      }-saturn-posts-media`,
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

    // Create the Lambda function for generating posts with an agent
    this.generatePostAgentFunction = new PythonFunction(
      this,
      "GeneratePostAgentFunction",
      {
        entry: "./src/agents_resolvers/",
        handler: "lambda_handler",
        runtime: lambda.Runtime.PYTHON_3_12,
        memorySize: DEFAULT_LAMBDA_MEMORY_SIZE,
        timeout: cdk.Duration.minutes(10),
        logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
        tracing: lambda.Tracing.ACTIVE,
        environment: {
          ...COMMON_LAMBDA_ENV_VARS,
          EVENT_BUS_NAME: eventBus.eventBusName,
          STRANDS_KNOWLEDGE_BASE_ID: knowledgeBase.knowledgeBaseId,
        },
      }
    );

    // Create the Lambda function for handling extracted text
    this.extractTextHandlerFunction = new PythonFunction(
      this,
      "ExtractTextHandlerFunction",
      {
        entry: "./src/media_processing/",
        index: "extract_text_handler.py",
        handler: "lambda_handler",
        runtime: lambda.Runtime.PYTHON_3_12,
        memorySize: DEFAULT_LAMBDA_MEMORY_SIZE,
        timeout: cdk.Duration.minutes(5),
        logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
        tracing: lambda.Tracing.ACTIVE,
        environment: {
          ...COMMON_LAMBDA_ENV_VARS,
        },
      }
    );

    // Grant permissions to put events on the event bus
    eventBus.grantPutEventsTo(this.generatePostAgentFunction);

    // Grant permissions to invoke Bedrock models
    this.generatePostAgentFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:Retrieve",
          "bedrock:RetrieveAndGenerate",
        ],
        resources: ["*"], // Consider restricting to specific model ARNs in production
        effect: iam.Effect.ALLOW,
      })
    );

    // Create an IAM role for Step Functions
    const stateMachineRole = new iam.Role(this, "StateMachineRole", {
      assumedBy: new iam.ServicePrincipal("states.amazonaws.com"),
      description: "IAM Role assumed by the Step Functions state machine",
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaRole"
        ),
      ],
    });

    // Grant permissions to the state machine role
    eventBus.grantPutEventsTo(stateMachineRole);

    // Grant permission to call Bedrock's InvokeModel and AsyncInvoke operations
    stateMachineRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:InvokeModel",
          "bedrock:StartAsyncInvoke",
          "bedrock:GetAsyncInvoke",
        ],
        resources: ["*"], // Consider restricting to specific model ARNs in production
        effect: iam.Effect.ALLOW,
      })
    );

    // Grant permission to access the media bucket
    this.mediaBucket.grantReadWrite(stateMachineRole);

    this.mediaBucket.grantReadWrite(this.extractTextHandlerFunction);

    // Grant permission to access the DynamoDB table
    postsTable.grantReadWriteData(stateMachineRole);

    // Grant permission to invoke the Lambda function
    stateMachineRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [this.generatePostAgentFunction.functionArn],
        effect: iam.Effect.ALLOW,
      })
    );

    // Load the ASL definitions for the state machines
    const aslPostWithContextFilePath = path.join(
      __dirname,
      "../../workflow/generate_post_with_context_workflow.asl.json"
    );
    const postWithContextDefinitionJson = JSON.parse(
      readFileSync(aslPostWithContextFilePath, "utf8")
    );

    const aslPostWithoutContextFilePath = path.join(
      __dirname,
      "../../workflow/generate_post_without_context_workflow.asl.json"
    );
    const postWithoutContextDefinitionJson = JSON.parse(
      readFileSync(aslPostWithoutContextFilePath, "utf8")
    );

    // Create the state machine for generating posts without context
    this.generatePostWithoutContextStateMachine = new sfn.StateMachine(
      this,
      "GeneratePostWithoutContextStateMachine",
      {
        stateMachineName: "generatePostWithoutContextStateMachine",
        role: stateMachineRole,
        definitionBody: sfn.DefinitionBody.fromString(
          JSON.stringify(postWithoutContextDefinitionJson)
        ),
        tracingEnabled: true,
        logs: {
          destination: new cdk.aws_logs.LogGroup(
            this,
            "WithoutContextLogGroup",
            {
              logGroupName:
                "/aws/stepfunctions/generatePostWithoutContextStateMachine",
              retention: DEFAULT_LOG_RETENTION_DAYS,
              removalPolicy: cdk.RemovalPolicy.DESTROY,
            }
          ),
          level: sfn.LogLevel.ALL,
        },
      }
    );

    // Create the state machine for generating posts with context
    this.generatePostWithContextStateMachine = new sfn.StateMachine(
      this,
      "GeneratePostWithContextStateMachine",
      {
        stateMachineName: "GeneratePostWithContextStateMachine",
        role: stateMachineRole,
        definitionBody: sfn.DefinitionBody.fromString(
          JSON.stringify(
            this.replaceDefinitionPlaceholders(postWithContextDefinitionJson, {
              FUNCTION_ARN: this.generatePostAgentFunction.functionArn,
            })
          )
        ),
        tracingEnabled: true,
        logs: {
          destination: new cdk.aws_logs.LogGroup(this, "WithContextLogGroup", {
            logGroupName:
              "/aws/stepfunctions/GeneratePostWithContextStateMachine",
            retention: DEFAULT_LOG_RETENTION_DAYS,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          }),
          level: sfn.LogLevel.ALL,
        },
      }
    );

    // Load the ASL definition for the text-to-video workflow
    const aslTextToVideoFilePath = path.join(
      __dirname,
      "../../workflow/text_to_video_workflow.asl.json"
    );
    const textToVideoDefinitionJson = JSON.parse(
      readFileSync(aslTextToVideoFilePath, "utf8")
    );

    // Create the state machine for text-to-video generation
    this.textToVideoStateMachine = new sfn.StateMachine(
      this,
      "TextToVideoStateMachine",
      {
        stateMachineName: "TextToVideoStateMachine",
        role: stateMachineRole,
        definitionBody: sfn.DefinitionBody.fromString(
          JSON.stringify(
            this.replaceDefinitionPlaceholders(textToVideoDefinitionJson, {
              DYNAMODB_TABLE_ARN: postsTable.tableArn,
            })
          )
        ),
        tracingEnabled: true,
        logs: {
          destination: new cdk.aws_logs.LogGroup(this, "TextToVideoLogGroup", {
            logGroupName: "/aws/stepfunctions/TextToVideoStateMachine",
            retention: DEFAULT_LOG_RETENTION_DAYS,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          }),
          level: sfn.LogLevel.ALL,
        },
      }
    );

    // Grant the state machine permission to invoke the Lambda function
    this.generatePostAgentFunction.addPermission("InvokeFromStateMachine", {
      principal: new iam.ServicePrincipal("states.amazonaws.com"),
      sourceArn: this.generatePostWithContextStateMachine.stateMachineArn,
    });

    // Load the ASL definition for the extract text from file workflow
    const aslExtractTextFilePath = path.join(
      __dirname,
      "../../workflow/extract_text_from_file_workflow.asl.json"
    );
    const extractTextDefinitionJson = JSON.parse(
      readFileSync(aslExtractTextFilePath, "utf8")
    );

    // Load the ASL definition for the transcribe media workflow
    const aslTranscribeMediaFilePath = path.join(
      __dirname,
      "../../workflow/transcribe_media_workflow.asl.json"
    );
    const transcribeMediaDefinitionJson = JSON.parse(
      readFileSync(aslTranscribeMediaFilePath, "utf8")
    );

    // Grant Textract permissions to the state machine role
    // Grant Textract permissions to the state machine role
    stateMachineRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "textract:DetectDocumentText",
          "textract:StartDocumentTextDetection",
          "textract:GetDocumentTextDetection",
        ],
        resources: ["*"],
        effect: iam.Effect.ALLOW,
      })
    );

    // Grant Transcribe permissions to the state machine role
    stateMachineRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "transcribe:StartTranscriptionJob",
          "transcribe:GetTranscriptionJob",
        ],
        resources: ["*"],
        effect: iam.Effect.ALLOW,
      })
    );

    // Create the state machine for extracting text from files
    this.extractTextFromFileStateMachine = new sfn.StateMachine(
      this,
      "ExtractTextFromFileStateMachine",
      {
        stateMachineName: "ExtractTextFromFileStateMachine",
        role: stateMachineRole,
        definitionBody: sfn.DefinitionBody.fromString(
          JSON.stringify(
            this.replaceDefinitionPlaceholders(extractTextDefinitionJson, {
              FUNCTION_ARN: this.extractTextHandlerFunction.functionArn,
            })
          )
        ),
        tracingEnabled: true,
        logs: {
          destination: new cdk.aws_logs.LogGroup(this, "ExtractTextLogGroup", {
            logGroupName: "/aws/stepfunctions/ExtractTextFromFileStateMachine",
            retention: DEFAULT_LOG_RETENTION_DAYS,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          }),
          level: sfn.LogLevel.ALL,
        },
      }
    );

    // Create the state machine for transcribing media files
    this.transcribeMediaStateMachine = new sfn.StateMachine(
      this,
      "TranscribeMediaStateMachine",
      {
        stateMachineName: "TranscribeMediaStateMachine",
        role: stateMachineRole,
        definitionBody: sfn.DefinitionBody.fromString(
          JSON.stringify(
            this.replaceDefinitionPlaceholders(transcribeMediaDefinitionJson, {
              FUNCTION_ARN: this.extractTextHandlerFunction.functionArn,
            })
          )
        ),
        tracingEnabled: true,
        logs: {
          destination: new cdk.aws_logs.LogGroup(
            this,
            "TranscribeMediaLogGroup",
            {
              logGroupName: "/aws/stepfunctions/TranscribeMediaStateMachine",
              retention: DEFAULT_LOG_RETENTION_DAYS,
              removalPolicy: cdk.RemovalPolicy.DESTROY,
            }
          ),
          level: sfn.LogLevel.ALL,
        },
      }
    );

    // Grant the state machine permission to invoke the extract text handler function
    this.extractTextHandlerFunction.addPermission("InvokeFromStateMachine", {
      principal: new iam.ServicePrincipal("states.amazonaws.com"),
      sourceArn: this.extractTextFromFileStateMachine.stateMachineArn,
    });

    // Grant the state machine permission to invoke the extract text handler function from the transcribe media workflow
    this.extractTextHandlerFunction.addPermission(
      "InvokeFromTranscribeStateMachine",
      {
        principal: new iam.ServicePrincipal("states.amazonaws.com"),
        sourceArn: this.transcribeMediaStateMachine.stateMachineArn,
      }
    );

    // Create a Lambda function to start the workflows
    this.startWorkflowFunction = new NodejsFunction(
      this,
      "StartWorkflowFunction",
      {
        entry: "./src/startStateMachine.ts",
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: DEFAULT_LAMBDA_MEMORY_SIZE,
        logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
        tracing: lambda.Tracing.ACTIVE,
        environment: {
          ...COMMON_LAMBDA_ENV_VARS,
          POST_WITHOUT_CONTEXT_STATE_MACHINE_ARN:
            this.generatePostWithoutContextStateMachine.stateMachineArn,
          POST_WITH_CONTEXT_STATE_MACHINE_ARN:
            this.generatePostWithContextStateMachine.stateMachineArn,
          TEXT_TO_VIDEO_STATE_MACHINE_ARN:
            this.textToVideoStateMachine.stateMachineArn,
        },
      }
    );

    // Create a Lambda function to invoke the text-to-video workflow
    this.invokeTextToVideoFunction = new NodejsFunction(
      this,
      "InvokeTextToVideoFunction",
      {
        entry: "./src/invokeTextToVideoWorkflow.ts",
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: DEFAULT_LAMBDA_MEMORY_SIZE,
        logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
        tracing: lambda.Tracing.ACTIVE,
        environment: {
          ...COMMON_LAMBDA_ENV_VARS,
          TEXT_TO_VIDEO_STATE_MACHINE_ARN:
            this.textToVideoStateMachine.stateMachineArn,
        },
      }
    );

    // Grant the Lambda function permissions to start, describe, and stop the state machine execution
    this.startWorkflowFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "states:StartExecution",
          "states:DescribeExecution",
          "states:StopExecution",
        ],
        resources: [
          this.generatePostWithoutContextStateMachine.stateMachineArn,
          this.generatePostWithContextStateMachine.stateMachineArn,
          this.textToVideoStateMachine.stateMachineArn,
        ],
        effect: iam.Effect.ALLOW,
      })
    );

    // Grant the text-to-video Lambda function permissions to start, describe, and stop the state machine execution
    this.invokeTextToVideoFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "states:StartExecution",
          "states:DescribeExecution",
          "states:StopExecution",
        ],
        resources: [this.textToVideoStateMachine.stateMachineArn],
        effect: iam.Effect.ALLOW,
      })
    );

    // Apply common tags
    [
      this.generatePostAgentFunction,
      this.generatePostWithContextStateMachine,
      this.generatePostWithoutContextStateMachine,
      this.textToVideoStateMachine,
      this.extractTextFromFileStateMachine,
      this.transcribeMediaStateMachine,
      this.extractTextHandlerFunction,
      this.mediaBucket,
      this.startWorkflowFunction,
      this.invokeTextToVideoFunction,
    ].forEach((resource) => {
      Object.entries(COMMON_TAGS).forEach(([key, value]) => {
        cdk.Tags.of(resource).add(key, value);
      });
    });
  }

  /**
   * Replace placeholders in the state machine definition
   */
  private replaceDefinitionPlaceholders(
    definition: any,
    replacements: Record<string, string>
  ): any {
    const definitionString = JSON.stringify(definition);
    let replacedDefinition = definitionString;

    Object.entries(replacements).forEach(([key, value]) => {
      replacedDefinition = replacedDefinition.replace(
        new RegExp(`\\$\\{${key}\\}`, "g"),
        value
      );
    });

    return JSON.parse(replacedDefinition);
  }
}
