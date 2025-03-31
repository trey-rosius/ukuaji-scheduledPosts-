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
import { CfnDataSource, CfnGraphQLSchema } from "aws-cdk-lib/aws-appsync";

import { readFileSync } from "fs";
import { CfnStateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";

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
      environment: {
        STATE_MACHINE_ARN: generatePostStateMachine.attrArn,
        ...envVariables,
      },
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      tracing: cdk.aws_lambda.Tracing.ACTIVE,
      bundling: {
        minify: true,
      },
    };
    const scheduledPostGraphqlApi = new appsync.GraphqlApi(this, "Api", {
      name: "scheduledPostApp",
      definition: appsync.Definition.fromFile("schema/schema.graphql"),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
        },
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
    // The DynamoDB table for users
    const usersTable = new dynamodb.Table(this, "postsTable", {
      tableName: "postSchedulerTable",
      partitionKey: {
        name: "userId",
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_IMAGE,
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
  }
}
