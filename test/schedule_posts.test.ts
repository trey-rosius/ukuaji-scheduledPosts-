import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { SchedulePostsStack } from "../lib/schedule_posts-stack";

describe("SchedulePostsStack Integration Tests", () => {
  let app: cdk.App;
  let stack: SchedulePostsStack;
  let template: Template;

  beforeEach(() => {
    // Mock environment variables
    process.env.PINECONE_CONNECTION_STRING =
      "https://mock-pinecone-connection.io";
    process.env.PINECONE_CREDENTIALS_SECRET_ARN =
      "arn:aws:secretsmanager:us-east-1:123456789012:secret:pinecone-mock";

    // Create the stack
    app = new cdk.App();
    stack = new SchedulePostsStack(app, "TestSchedulePostsStack");
    template = Template.fromStack(stack);
  });

  test("creates all required constructs", () => {
    // Verify that all constructs are created
    template.resourceCountIs("AWS::DynamoDB::Table", 1);
    template.resourceCountIs("AWS::Cognito::UserPool", 1);
    template.resourceCountIs("AWS::Cognito::UserPoolClient", 1);
    template.resourceCountIs("AWS::Events::EventBus", 1);
    template.resourceCountIs("AWS::AppSync::GraphQLApi", 1);
    template.resourceCountIs("AWS::WAFv2::WebACL", 1);
    template.resourceCountIs("AWS::S3::Bucket", 2); // At least 2 buckets (media and knowledge base)
    template.resourceCountIs("AWS::Scheduler::ScheduleGroup", 1);
    template.resourceCountIs("AWS::StepFunctions::StateMachine", 5); // At least 3 state machines
    template.resourceCountIs("AWS::Lambda::Function", 5); // At least 5 Lambda functions
    template.resourceCountIs("AWS::IAM::Role", 5); // At least 5 IAM roles
  });

  test("creates DynamoDB table with correct configuration", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "ScheduledPostsTable",
      BillingMode: "PAY_PER_REQUEST",
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: false,
      },
      StreamSpecification: {
        StreamViewType: "NEW_IMAGE",
      },
    });
  });

  test("creates Cognito user pool with secure configuration", () => {
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      UserPoolName: "ScheduledPostsUserPool",
      AccountRecoverySetting: {
        RecoveryMechanisms: [
          {
            Name: "verified_phone_number",
            Priority: 1,
          },
          {
            Name: "verified_email",
            Priority: 2,
          },
        ],
      },
      AutoVerifyAttributes: ["email"],
      Policies: {
        PasswordPolicy: {
          MinimumLength: 12,
          RequireLowercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
          RequireUppercase: true,
        },
      },
    });
  });

  test("creates AppSync API with correct authentication modes", () => {
    template.hasResourceProperties("AWS::AppSync::GraphQLApi", {
      Name: "ScheduledPostsApi",
      AuthenticationType: "API_KEY",
      AdditionalAuthenticationProviders: [
        {
          AuthenticationType: "AMAZON_COGNITO_USER_POOLS",
        },
        {
          AuthenticationType: "AWS_IAM",
        },
      ],
      XrayEnabled: true,
    });
  });

  test("creates WAF WebACL with security rules", () => {
    template.hasResourceProperties("AWS::WAFv2::WebACL", {
      DefaultAction: {
        Allow: {},
      },
      Scope: "REGIONAL",
      Rules: Match.arrayWith([
        Match.objectLike({
          Name: "RateLimitRule",
          Statement: {
            RateBasedStatement: {
              Limit: 1500,
              AggregateKeyType: "IP",
            },
          },
          Action: {
            Block: {},
          },
        }),
      ]),
    });
  });

  test("creates EventBridge event bus and rules", () => {
    template.hasResourceProperties("AWS::Events::EventBus", {
      Name: "ScheduledPostsEventBus",
    });

    // Verify that there's a rule to catch all events for debugging
    template.hasResourceProperties("AWS::Events::Rule", {
      EventBusName: {
        Ref: Match.anyValue(),
      },
      EventPattern: {
        source: [
          {
            prefix: "",
          },
        ],
      },
    });
  });

  test("creates Step Functions state machines with correct configurations", () => {
    // Verify that state machines have tracing and logging enabled
    template.hasResourceProperties("AWS::StepFunctions::StateMachine", {
      TracingConfiguration: {
        Enabled: true,
      },
      LoggingConfiguration: {
        Level: "ALL",
        IncludeExecutionData: true,
      },
    });
  });

  test("creates Lambda functions with proper permissions", () => {
    // Verify that Lambda functions have tracing enabled
    template.hasResourceProperties("AWS::Lambda::Function", {
      TracingConfig: {
        Mode: "Active",
      },
    });

    // Verify that Lambda functions have permissions to invoke Step Functions
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: [
              "states:StartExecution",
              "states:DescribeExecution",
              "states:StopExecution",
            ],
            Effect: "Allow",
          }),
        ]),
      },
    });
  });

  test("creates S3 buckets with secure configurations", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      VersioningConfiguration: {
        Status: "Enabled",
      },
    });
  });

  test("creates IAM roles with least privilege permissions", () => {
    // Verify that the scheduled role has the correct trust relationship
    template.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
              Service: "scheduler.amazonaws.com",
            },
          },
        ],
      },
      Description: "Role assumed by EventBridge Scheduler for scheduled posts",
    });
  });

  test("creates EventBridge Pipe to connect DynamoDB to EventBridge", () => {
    template.hasResourceProperties("AWS::Pipes::Pipe", {
      Source: {
        "Fn::GetAtt": [Match.anyValue(), "StreamArn"],
      },
      SourceParameters: {
        DynamoDBStreamParameters: {
          StartingPosition: "LATEST",
        },
        FilterCriteria: {
          Filters: [
            {
              Pattern: Match.anyValue(),
            },
          ],
        },
      },
      Target: {
        "Fn::GetAtt": [Match.anyValue(), "Arn"],
      },
    });
  });

  test("creates CloudWatch Log groups for monitoring", () => {
    template.hasResourceProperties("AWS::Logs::LogGroup", {
      RetentionInDays: 7,
    });
  });

  test("outputs important resource information", () => {
    template.hasOutput("GraphQLAPIURL", {});
    template.hasOutput("WafWebAclId", {});
    template.hasOutput("MediaBucketName", {});
    template.hasOutput("GraphQLAPIKey", {});
    template.hasOutput("UserPoolId", {});
    template.hasOutput("UserPoolClientId", {});
  });
});
