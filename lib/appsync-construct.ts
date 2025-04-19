import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import {
  AppsyncFunction,
  AuthorizationType,
  CfnDataSource,
  CfnGraphQLApi,
  CfnResolver,
  Code,
  Definition,
  FieldLogLevel,
  FunctionRuntime,
  GraphqlApi,
} from "aws-cdk-lib/aws-appsync";
import { CfnRule, EventBus } from "aws-cdk-lib/aws-events";
import {
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";

import { bedrock } from "@cdklabs/generative-ai-cdk-constructs";
import path = require("path");
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

import { CfnStateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { KnowledgeBaseBase } from "@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/bedrock";

type AppSyncConstructProps = {
  postsTable: ITable;
  scheduledRole: Role;
  knowledgeBase: KnowledgeBaseBase;
  postScheduledGroupName: string;
  generatePostStateMachine: CfnStateMachine;
  eventbus: EventBus;
};

export class AppSyncConstruct extends Construct {
  public readonly schedulePostsFunction: NodejsFunction;
  public readonly scheduledPostGraphqlApi: GraphqlApi;
  constructor(scope: Construct, id: string, props: AppSyncConstructProps) {
    super(scope, id);

    const {
      scheduledRole,
      postScheduledGroupName,
      generatePostStateMachine,
      eventbus,
      postsTable,
      knowledgeBase,
    } = props;
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
    this.scheduledPostGraphqlApi = new GraphqlApi(this, "Api", {
      name: "scheduledPostApp",
      definition: Definition.fromFile("schema/schema.graphql"),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: AuthorizationType.API_KEY,
        },
        additionalAuthorizationModes: [
          { authorizationType: AuthorizationType.IAM },
        ],
      },
      xrayEnabled: true,
      logConfig: {
        fieldLogLevel: FieldLogLevel.ALL,
      },
    });

    this.scheduledPostGraphqlApi.addEnvironmentVariable(
      "KNOWLEDGEBASE_ID",
      knowledgeBase.knowledgeBaseId
    );
    this.scheduledPostGraphqlApi.addEnvironmentVariable(
      "FOUNDATION_MODEL_ARN",
      "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0"
    );

    const noneDs = this.scheduledPostGraphqlApi.addNoneDataSource("None");

    this.scheduledPostGraphqlApi.createResolver("generatedTextResponse", {
      typeName: "Mutation",
      fieldName: "generatedText",
      runtime: FunctionRuntime.JS_1_0_0,
      dataSource: noneDs,
      code: Code.fromAsset("./resolvers/generatedText.js"),
    });

    this.scheduledPostGraphqlApi.createResolver("generatedImagesResponse", {
      typeName: "Mutation",
      fieldName: "generateImagesResponse",
      runtime: FunctionRuntime.JS_1_0_0,
      dataSource: noneDs,
      code: Code.fromAsset("./resolvers/generateImagesResponse.js"),
    });
    const bedrockRole = new Role(this, "BedRockRole", {
      assumedBy: new ServicePrincipal("appsync.amazonaws.com"),
    });
    const bedrockRetrieveAndGenerateDS =
      this.scheduledPostGraphqlApi.addHttpDataSource(
        "bedrockRetrieveAndGenerateDS",
        `https://bedrock-agent-runtime.us-east-1.amazonaws.com`,
        {
          authorizationConfig: {
            signingRegion: "us-east-1",
            signingServiceName: "bedrock",
          },
        }
      );
    bedrockRetrieveAndGenerateDS.grantPrincipal.addToPrincipalPolicy(
      new PolicyStatement({
        resources: [
          "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0",
          `arn:aws:bedrock:us-east-1:132260253285:knowledge-base/${knowledgeBase.knowledgeBaseId}`,
        ],
        actions: [
          "bedrock:InvokeModel",
          "bedrock:Retrieve",
          "bedrock:RetrieveAndGenerate",
        ],
      })
    );

    bedrockRole.addToPrincipalPolicy(
      new PolicyStatement({
        resources: [
          "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-canvas-v1:0",
        ],
        actions: ["bedrock:InvokeModel"],
      })
    );
    const bedrock_datasource = new CfnDataSource(this, "bedrock-datasource", {
      apiId: this.scheduledPostGraphqlApi.apiId,
      name: "BedrockDataSource",
      type: "AMAZON_BEDROCK_RUNTIME",
      serviceRoleArn: bedrockRole.roleArn,
    });
    new CfnResolver(this, "generateImagesResolver", {
      apiId: this.scheduledPostGraphqlApi.apiId,
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
        quality: "standard",
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
    /*
    new CfnResolver(this, "imageGuidedGenerationResolver", {
      apiId: this.scheduledPostGraphqlApi.apiId,
      fieldName: "imageGuidedGeneration",
      typeName: "Query",
      dataSourceName: bedrock_datasource.name,
      runtime: {
        name: "APPSYNC_JS",
        runtimeVersion: "1.0.0",
      },
      code: `
       import { invokeModel } from "@aws-appsync/utils/ai";
       import { runtime } from "@aws-appsync/utils";
       
       export function request(ctx) {
         const { prompt, conditionImage, numOfImages } = ctx.args.input;
       
         //const guardrail_id = ctx.env.GUARDRAIL_ID;
         // const guardrail_version = ctx.env.GUARDRAIL_VERSION;
       
         return invokeModel({
           modelId: "amazon.nova-canvas-v1:0",
           // guardrailIdentifier: guardrail_id,
           //guardrailVersion: guardrail_version,
           body: {
             taskType: "TEXT_IMAGE",
             textToImageParams: {
               text: prompt,
               conditionImage: conditionImage,
               controlMode: "SEGMENTATION",
               controlStrength: 0.3,
             },
             imageGenerationConfig: {
               numberOfImages: numOfImages,
               height: 1024,
               width: 720,
               cfgScale: 8,
               seed: 42,
             },
           },
         });
       }
       
       export function response(ctx) {
         console.log(\`result is \${ctx.result}\`);
         return ctx.result.images;
       }
       
       
       `,
    }).addDependency(bedrock_datasource);
*/
    new CfnResolver(this, "replaceImageBackgroundInputResolver", {
      apiId: this.scheduledPostGraphqlApi.apiId,
      fieldName: "replaceImageBackground",
      typeName: "Query",

      dataSourceName: bedrock_datasource.name,
      runtime: {
        name: "APPSYNC_JS",
        runtimeVersion: "1.0.0",
      },
      code: `
      import { invokeModel } from "@aws-appsync/utils/ai";
import { runtime } from "@aws-appsync/utils";

export function request(ctx) {
  const { prompt, image, maskPrompt, numOfImages } = ctx.args.input;

  //const guardrail_id = ctx.env.GUARDRAIL_ID;
  // const guardrail_version = ctx.env.GUARDRAIL_VERSION;

  return invokeModel({
    modelId: "amazon.nova-canvas-v1:0",
    // guardrailIdentifier: guardrail_id,
    //guardrailVersion: guardrail_version,
    body: {
      taskType: "TEXT_IMAGE",
      outPaintingParams: {
        image: image,
        text: prompt,
        maskPrompt: maskPrompt,
        outPaintingMode: "PRECISE",
      },
      imageGenerationConfig: {
        numberOfImages: numOfImages,
        height: 1024,
        width: 720,
        quality: "standard",
        cfgScale: 8,
        seed: 42,
      },
    },
  });
}

export function response(ctx) {
  console.log(\`result is \${ctx.result}\`);
  return ctx.result.images;
}

       
       `,
    }).addDependency(bedrock_datasource);

    const sendPostsFunction = new NodejsFunction(this, "sendPostsFunction", {
      entry: "./src/sendPosts.ts",
      ...functionSettings,
      environment: {
        ...envVariables,
      },
    });

    //* Init AppSync resolvers
    const retrieveAndGenerateResponseResolver =
      this.scheduledPostGraphqlApi.createResolver(
        "retrieveAndGenerateResponseResolver",

        {
          typeName: "Mutation",
          fieldName: "retrieveAndGenerateResponse",
          dataSource: bedrockRetrieveAndGenerateDS,
          runtime: FunctionRuntime.JS_1_0_0,
          code: Code.fromAsset(
            path.join(__dirname, "../resolvers/retrieveAndGenerateResponse.js")
          ),
        }
      );

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

    sendPostsFunction.grantInvoke(scheduledRole);

    this.schedulePostsFunction = new NodejsFunction(
      this,
      "schedulePostsFunction",
      {
        entry: "./src/schedulePosts.ts",
        ...functionSettings,
        environment: {
          ...envVariables,
          SCHEDULE_GROUP_NAME: postScheduledGroupName,
          SEND_POST_SERVICE_ARN: sendPostsFunction.functionArn,
          SCHEDULE_ROLE_ARN: scheduledRole.roleArn,
        },
        initialPolicy: [
          // Give lambda permission to create group, schedule and pass IAM role to the scheduler
          new PolicyStatement({
            // actions: ['scheduler:CreateSchedule', 'iam:PassRole', 'scheduler:CreateScheduleGroup'],
            actions: ["scheduler:CreateSchedule", "iam:PassRole"],
            resources: ["*"],
          }),
        ],
      }
    );

    // Grant the Lambda function permissions to start, describe, and stop the state machine execution.
    startWorkflowFunction.addToRolePolicy(
      new PolicyStatement({
        actions: [
          "states:StartExecution",
          "states:DescribeExecution",
          "states:StopExecution",
        ],
        resources: [generatePostStateMachine.attrArn],
      })
    );

    this.scheduledPostGraphqlApi
      .addDynamoDbDataSource("createPostDatasource", postsTable)
      .createResolver("createPostResolver", {
        typeName: "Mutation",
        fieldName: "createPost",
        code: Code.fromAsset(
          path.join(__dirname, "../resolvers/posts/createPosts.js")
        ),
        runtime: FunctionRuntime.JS_1_0_0,
      });

    //Create post

    this.scheduledPostGraphqlApi
      .addLambdaDataSource(
        "startStateMachineLambdaDatasource",
        startWorkflowFunction
      )
      .createResolver("startStateMachineResolver", {
        typeName: "Mutation",
        fieldName: "startStateMachine",
        code: Code.fromAsset(path.join(__dirname, "../invoke/invoke.js")),
        runtime: FunctionRuntime.JS_1_0_0,
      });
  }
}
