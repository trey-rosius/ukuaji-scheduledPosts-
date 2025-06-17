import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";
import { AppSyncConstructProps } from "../types";
import {
  COMMON_TAGS,
  COMMON_LAMBDA_ENV_VARS,
  DEFAULT_LAMBDA_MEMORY_SIZE,
  DEFAULT_LOG_RETENTION_DAYS,
  DEFAULT_API_KEY_EXPIRATION_DAYS,
  BEDROCK_MODELS,
  SUBSCRIPTION_FEATURES,
} from "../constants";

/**
 * Construct for AppSync API and related resources
 */
export class AppSyncConstruct extends Construct {
  /**
   * The AppSync GraphQL API
   */
  public readonly api: appsync.GraphqlApi;

  /**
   * The Lambda function for scheduling posts
   */
  public readonly schedulePostsFunction: NodejsFunction;

  /**
   * The Lambda function for sending posts
   */
  public readonly sendPostsFunction: NodejsFunction;

  public readonly startWorkflowFunction: NodejsFunction;

  /**
   * The Lambda function for invoking the text-to-video workflow
   */
  public readonly invokeTextToVideoFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: AppSyncConstructProps) {
    super(scope, id);

    const {
      postsTable,
      scheduledRole,
      knowledgeBase,
      postScheduledGroupName,
      eventBus,
      startWorkflowFunction,
      generatePostAgentFunction,

      userPool,
      invokeTextToVideoFunction,
    } = props;

    // Calculate API key expiration date
    const currentDate = new Date();
    const keyExpirationDate = new Date(
      currentDate.getTime() +
        DEFAULT_API_KEY_EXPIRATION_DAYS * 24 * 60 * 60 * 1000
    );

    // Create the AppSync API
    this.api = new appsync.GraphqlApi(this, "Api", {
      name: "SchedulePostsAPI",
      definition: appsync.Definition.fromFile("schema/schema.graphql"),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
          apiKeyConfig: {
            name: "default",
            description: "Default API key for scheduled posts API",
            expires: cdk.Expiration.atDate(keyExpirationDate),
          },
        },
        additionalAuthorizationModes: [
          {
            authorizationType: appsync.AuthorizationType.USER_POOL,
            userPoolConfig: {
              userPool: userPool,
            },
          },
          { authorizationType: appsync.AuthorizationType.IAM },
        ],
      },
      xrayEnabled: true,
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ALL,
      },
    });

    // Add environment variables to the API
    this.api.addEnvironmentVariable(
      "KNOWLEDGEBASE_ID",
      knowledgeBase.knowledgeBaseId
    );
    this.api.addEnvironmentVariable(
      "FOUNDATION_MODEL_ARN",
      BEDROCK_MODELS.CLAUDE_3_5_SONNET
    );

    // Create data sources
    const noneDs = this.api.addNoneDataSource("None");
    const dbDataSource = this.api.addDynamoDbDataSource(
      "PostsDataSource",
      postsTable
    );

    // Create resolvers for mutations
    this.api.createResolver("GeneratedTextResponse", {
      typeName: "Mutation",
      fieldName: "generatedText",
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      dataSource: noneDs,
      code: appsync.Code.fromAsset("./resolvers/generatedText.js"),
    });

    this.api.createResolver("GeneratedImagesResponse", {
      typeName: "Mutation",
      fieldName: "generateImagesResponse",
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      dataSource: noneDs,
      code: appsync.Code.fromAsset("./resolvers/generateImagesResponse.js"),
    });

    // Create Bedrock data sources
    const bedrockRole = new iam.Role(this, "BedrockRole", {
      assumedBy: new iam.ServicePrincipal("appsync.amazonaws.com"),
      description: "Role for AppSync to invoke Bedrock models",
    });

    // Create a data source for Bedrock Retrieve and Generate
    const bedrockRetrieveAndGenerateDS = this.api.addHttpDataSource(
      "BedrockRetrieveAndGenerateDS",
      `https://bedrock-agent-runtime.us-east-1.amazonaws.com`,
      {
        authorizationConfig: {
          signingRegion: "us-east-1",
          signingServiceName: "bedrock",
        },
      }
    );

    // Grant permissions to the Bedrock data source
    bedrockRetrieveAndGenerateDS.grantPrincipal.addToPrincipalPolicy(
      new iam.PolicyStatement({
        resources: [
          BEDROCK_MODELS.CLAUDE_3_5_SONNET,
          `arn:aws:bedrock:us-east-1:${
            cdk.Stack.of(this).account
          }:knowledge-base/${knowledgeBase.knowledgeBaseId}`,
        ],
        actions: [
          "bedrock:InvokeModel",
          "bedrock:Retrieve",
          "bedrock:RetrieveAndGenerate",
        ],
        effect: iam.Effect.ALLOW,
      })
    );

    // Grant permissions to the Bedrock role
    bedrockRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        resources: [BEDROCK_MODELS.NOVA_CANVAS],
        actions: ["bedrock:InvokeModel"],
        effect: iam.Effect.ALLOW,
      })
    );

    // Create a Bedrock data source
    const bedrockDataSource = new appsync.CfnDataSource(
      this,
      "BedrockDataSource",
      {
        apiId: this.api.apiId,
        name: "BedrockDataSource",
        type: "AMAZON_BEDROCK_RUNTIME",
        serviceRoleArn: bedrockRole.roleArn,
      }
    );

    // Create a resolver for generating images
    new appsync.CfnResolver(this, "GenerateImagesResolver", {
      apiId: this.api.apiId,
      fieldName: "generateImages",
      typeName: "Query",
      dataSourceName: bedrockDataSource.name,
      runtime: {
        name: "APPSYNC_JS",
        runtimeVersion: "1.0.0",
      },
      code: `import { invokeModel } from "@aws-appsync/utils/ai";
import { runtime } from "@aws-appsync/utils";

export function request(ctx) {
  const input = ctx.args.input;

  return invokeModel({
    modelId: "amazon.nova-canvas-v1:0",
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
    }).addDependency(bedrockDataSource);

    // Create a resolver for replacing image backgrounds
    new appsync.CfnResolver(this, "ReplaceImageBackgroundResolver", {
      apiId: this.api.apiId,
      fieldName: "replaceImageBackground",
      typeName: "Query",
      dataSourceName: bedrockDataSource.name,
      runtime: {
        name: "APPSYNC_JS",
        runtimeVersion: "1.0.0",
      },
      code: `
      import { invokeModel } from "@aws-appsync/utils/ai";
import { runtime } from "@aws-appsync/utils";

export function request(ctx) {
  const { prompt, image, maskPrompt, numOfImages } = ctx.args.input;

  return invokeModel({
    modelId: "amazon.nova-canvas-v1:0",
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
}`,
    }).addDependency(bedrockDataSource);

    // Create Lambda functions
    this.sendPostsFunction = new NodejsFunction(this, "SendPostsFunction", {
      entry: "./src/sendPosts.ts",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: DEFAULT_LAMBDA_MEMORY_SIZE,
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        ...COMMON_LAMBDA_ENV_VARS,
      },
      bundling: {
        minify: true,
      },
    });

    // Grant permissions to invoke the send posts function
    this.sendPostsFunction.grantInvoke(scheduledRole);

    this.api
      .addLambdaDataSource(
        "startStateMachineLambdaDatasource",
        startWorkflowFunction
      )
      .createResolver("startStateMachineResolver", {
        typeName: "Mutation",
        fieldName: "startAgentStateMachine",
        code: appsync.Code.fromAsset(
          path.join(__dirname, "../../invoke/invoke.js")
        ),
        runtime: appsync.FunctionRuntime.JS_1_0_0,
      });

    this.api
      .addLambdaDataSource(
        "generatePostAgentDatasource",
        generatePostAgentFunction
      )
      .createResolver("generatePostAgentResolver", {
        typeName: "Mutation",
        fieldName: "getGeneratedPostAgent",
        code: appsync.Code.fromAsset(
          path.join(__dirname, "../../invoke/invoke.js")
        ),
        runtime: appsync.FunctionRuntime.JS_1_0_0,
      });

    // Create the schedule posts function
    this.schedulePostsFunction = new NodejsFunction(
      this,
      "SchedulePostsFunction",
      {
        entry: "./src/schedulePosts.ts",
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: DEFAULT_LAMBDA_MEMORY_SIZE,
        logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
        tracing: lambda.Tracing.ACTIVE,
        environment: {
          ...COMMON_LAMBDA_ENV_VARS,
          SCHEDULE_GROUP_NAME: postScheduledGroupName,
          SEND_POST_SERVICE_ARN: this.sendPostsFunction.functionArn,
          SCHEDULE_ROLE_ARN: scheduledRole.roleArn,
        },
        bundling: {
          minify: true,
        },
      }
    );

    // Grant permissions to create schedules
    this.schedulePostsFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["scheduler:CreateSchedule", "iam:PassRole"],
        resources: ["*"],
        effect: iam.Effect.ALLOW,
      })
    );

    // Create a resolver for retrieving and generating responses
    this.api.createResolver("RetrieveAndGenerateResponseResolver", {
      typeName: "Mutation",
      fieldName: "retrieveAndGenerateResponse",
      dataSource: bedrockRetrieveAndGenerateDS,
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      code: appsync.Code.fromAsset(
        path.join(__dirname, "../../resolvers/retrieveAndGenerateResponse.js")
      ),
    });

    // Create a data source for the posts table
    this.api
      .addDynamoDbDataSource("CreatePostDataSource", postsTable)
      .createResolver("CreatePostResolver", {
        typeName: "Mutation",
        fieldName: "createPost",
        code: appsync.Code.fromAsset(
          path.join(__dirname, "../../resolvers/posts/createPosts.js")
        ),
        runtime: appsync.FunctionRuntime.JS_1_0_0,
      });

    // Create pipeline resolvers for user account operations
    const formatUserAccountFunction = new appsync.AppsyncFunction(
      this,
      "FormatUserAccountInput",
      {
        api: this.api,
        dataSource: noneDs,
        name: "formatUserAccountInput",
        code: appsync.Code.fromAsset(
          "./resolvers/users/formatUserAccountInput.js"
        ),
        runtime: appsync.FunctionRuntime.JS_1_0_0,
      }
    );

    const createUserAccountFunction = new appsync.AppsyncFunction(
      this,
      "CreateUserAccountFunction",
      {
        api: this.api,
        dataSource: dbDataSource,
        name: "createUserAccountFunction",
        code: appsync.Code.fromAsset("./resolvers/users/createUserAccount.js"),
        runtime: appsync.FunctionRuntime.JS_1_0_0,
      }
    );

    this.api.createResolver("CreateUserAccount", {
      typeName: "Mutation",
      code: appsync.Code.fromAsset("./resolvers/pipeline/default.js"),
      fieldName: "createUserAccount",
      pipelineConfig: [formatUserAccountFunction, createUserAccountFunction],
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    // Create pipeline resolvers for prompt templates
    const formatPromptTemplateFunction = new appsync.AppsyncFunction(
      this,
      "FormatPromptTemplateInput",
      {
        api: this.api,
        dataSource: noneDs,
        name: "formatPromptTemplateInput",
        code: appsync.Code.fromAsset(
          "./resolvers/promptTemplates/formatPromptTemplateInput.js"
        ),
        runtime: appsync.FunctionRuntime.JS_1_0_0,
      }
    );

    const createPromptTemplateFunction = new appsync.AppsyncFunction(
      this,
      "CreatePromptTemplateFunction",
      {
        api: this.api,
        dataSource: dbDataSource,
        name: "createPromptTemplateFunction",
        code: appsync.Code.fromAsset(
          "./resolvers/promptTemplates/createPromptTemplate.js"
        ),
        runtime: appsync.FunctionRuntime.JS_1_0_0,
      }
    );
    /*
    // Create pipeline resolvers for subscriptions
    const formatSubscriptionFunction = new appsync.AppsyncFunction(
      this,
      "FormatSubscriptionInput",
      {
        api: this.api,
        dataSource: noneDs,
        name: "formatSubscriptionInput",
        code: appsync.Code.fromAsset(
          "./resolvers/subscriptions/formatSubscriptionInput.js"
        ),
        runtime: appsync.FunctionRuntime.JS_1_0_0,
      }
    );

    const createSubscriptionFunction = new appsync.AppsyncFunction(
      this,
      "CreateSubscriptionFunction",
      {
        api: this.api,
        dataSource: dbDataSource,
        name: "createSubscriptionFunction",
        code: appsync.Code.fromAsset(
          "./resolvers/subscriptions/createSubscription.js"
        ),
        runtime: appsync.FunctionRuntime.JS_1_0_0,
      }
    );
*/
    // Create prompt template resolvers
    this.api.createResolver("CreatePromptTemplate", {
      typeName: "Mutation",
      code: appsync.Code.fromAsset("./resolvers/pipeline/default.js"),
      fieldName: "createPromptTemplate",
      pipelineConfig: [
        formatPromptTemplateFunction,
        createPromptTemplateFunction,
      ],
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });
    /*
    // Create subscription resolvers
    this.api.createResolver("CreateSubscription", {
      typeName: "Mutation",
      code: appsync.Code.fromAsset("./resolvers/pipeline/default.js"),
      fieldName: "createSubscription",
      pipelineConfig: [formatSubscriptionFunction, createSubscriptionFunction],
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    this.api.createResolver("GetSubscription", {
      typeName: "Query",
      fieldName: "getSubscription",
      dataSource: dbDataSource,
      code: appsync.Code.fromAsset(
        "./resolvers/subscriptions/getSubscription.js"
      ),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    this.api.createResolver("GetUserSubscription", {
      typeName: "Query",
      fieldName: "getUserSubscription",
      dataSource: dbDataSource,
      code: appsync.Code.fromAsset(
        "./resolvers/subscriptions/getUserSubscription.js"
      ),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    this.api.createResolver("GetAllSubscriptions", {
      typeName: "Query",
      fieldName: "getAllSubscriptions",
      dataSource: dbDataSource,
      code: appsync.Code.fromAsset(
        "./resolvers/subscriptions/getAllSubscriptions.js"
      ),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    this.api.createResolver("GetSubscriptionFeatures", {
      typeName: "Query",
      fieldName: "getSubscriptionFeatures",
      dataSource: noneDs,
      code: appsync.Code.fromAsset(
        "./resolvers/subscriptions/getSubscriptionFeatures.js"
      ),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    this.api.createResolver("UpdateSubscription", {
      typeName: "Mutation",
      fieldName: "updateSubscription",
      dataSource: dbDataSource,
      code: appsync.Code.fromAsset(
        "./resolvers/subscriptions/updateSubscription.js"
      ),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    this.api.createResolver("CancelSubscription", {
      typeName: "Mutation",
      fieldName: "cancelSubscription",
      dataSource: dbDataSource,
      code: appsync.Code.fromAsset(
        "./resolvers/subscriptions/cancelSubscription.js"
      ),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });
*/
    this.api.createResolver("GetPromptTemplate", {
      typeName: "Query",
      fieldName: "getPromptTemplate",
      dataSource: dbDataSource,
      code: appsync.Code.fromAsset(
        "./resolvers/promptTemplates/getPromptTemplate.js"
      ),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    this.api.createResolver("GetAllPromptTemplates", {
      typeName: "Query",
      fieldName: "getAllPromptTemplates",
      dataSource: dbDataSource,
      code: appsync.Code.fromAsset(
        "./resolvers/promptTemplates/getAllPromptTemplates.js"
      ),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    this.api.createResolver("UpdatePromptTemplate", {
      typeName: "Mutation",
      fieldName: "updatePromptTemplate",
      dataSource: dbDataSource,
      code: appsync.Code.fromAsset(
        "./resolvers/promptTemplates/updatePromptTemplate.js"
      ),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    this.api.createResolver("DeletePromptTemplate", {
      typeName: "Mutation",
      fieldName: "deletePromptTemplate",
      dataSource: dbDataSource,
      code: appsync.Code.fromAsset(
        "./resolvers/promptTemplates/deletePromptTemplate.js"
      ),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    this.api.createResolver("UpdateUserAccount", {
      typeName: "Mutation",
      fieldName: "updateUserAccount",
      dataSource: dbDataSource,
      code: appsync.Code.fromAsset("./resolvers/users/updateUserAccount.js"),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
    });

    // Add data source and resolver for the text-to-video workflow
    this.api
      .addLambdaDataSource(
        "invokeTextToVideoLambdaDatasource",
        invokeTextToVideoFunction
      )
      .createResolver("invokeTextToVideoResolver", {
        typeName: "Mutation",
        fieldName: "generateTextToVideo",
        code: appsync.Code.fromAsset(
          path.join(__dirname, "../../resolvers/generateTextToVideo.js")
        ),
        runtime: appsync.FunctionRuntime.JS_1_0_0,
      });

    // Apply common tags
    [
      this.api,
      this.schedulePostsFunction,
      this.sendPostsFunction,
      invokeTextToVideoFunction,
    ].forEach((resource) => {
      Object.entries(COMMON_TAGS).forEach(([key, value]) => {
        cdk.Tags.of(resource).add(key, value);
      });
    });
  }
}
