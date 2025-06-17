import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { AuthConstructProps } from "../types";
import { COMMON_TAGS } from "../constants";

/**
 * Construct for authentication resources
 */
export class AuthConstruct extends Construct {
  /**
   * The Cognito user pool
   */
  public readonly userPool: cognito.UserPool;

  /**
   * The Cognito user pool client
   */
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthConstructProps = {}) {
    super(scope, id);

    // Create a Cognito user pool with secure defaults
    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: props.userPoolName || "ScheduledPostsUserPool",
      selfSignUpEnabled: true,
      accountRecovery: cognito.AccountRecovery.PHONE_AND_EMAIL,
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(3),
      },
      userVerification: {
        emailStyle: cognito.VerificationEmailStyle.CODE,
        emailSubject: "Verify your email for Scheduled Posts",
        emailBody: "Thanks for signing up! Your verification code is {####}",
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Important for user data
    });

    // Create a user pool client
    this.userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool: this.userPool,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      preventUserExistenceErrors: true,
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      authSessionValidity: cdk.Duration.minutes(3),
      enableTokenRevocation: true,
    });

    // Apply common tags
    Object.entries(COMMON_TAGS).forEach(([key, value]) => {
      cdk.Tags.of(this.userPool).add(key, value);
      cdk.Tags.of(this.userPoolClient).add(key, value);
    });
  }
}
