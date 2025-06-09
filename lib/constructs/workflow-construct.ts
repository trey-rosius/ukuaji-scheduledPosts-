import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
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
   * The Lambda function for starting workflows
   */
  public readonly startWorkflowFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: WorkflowConstructProps) {
    super(scope, id);

    const { eventBus, knowledgeBase } = props;

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

    // Grant permission to call Bedrock's InvokeModel
    stateMachineRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"], // Consider restricting to specific model ARNs in production
        effect: iam.Effect.ALLOW,
      })
    );

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

    // Grant the state machine permission to invoke the Lambda function
    this.generatePostAgentFunction.addPermission("InvokeFromStateMachine", {
      principal: new iam.ServicePrincipal("states.amazonaws.com"),
      sourceArn: this.generatePostWithContextStateMachine.stateMachineArn,
    });

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
        ],
        effect: iam.Effect.ALLOW,
      })
    );

    // Apply common tags
    [
      this.generatePostAgentFunction,
      this.generatePostWithContextStateMachine,
      this.generatePostWithoutContextStateMachine,
      this.startWorkflowFunction,
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
