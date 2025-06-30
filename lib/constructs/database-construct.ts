import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { DatabaseConstructProps } from "../types";
import {
  COMMON_TAGS,
  DEFAULT_REMOVAL_POLICY,
  TABLE_ATTRIBUTES,
  TABLE_INDEXES,
} from "../constants";

/**
 * Construct for database resources
 */
export class DatabaseConstruct extends Construct {
  /**
   * The DynamoDB table for posts
   */
  public readonly postsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DatabaseConstructProps) {
    super(scope, id);

    const { tableName, enablePITR = false } = props;

    // Create the DynamoDB table with a single-table design
    this.postsTable = new dynamodb.Table(this, "PostsTable", {
      tableName: tableName,
      partitionKey: {
        name: TABLE_ATTRIBUTES.PARTITION_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_ATTRIBUTES.SORT_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: DEFAULT_REMOVAL_POLICY,

      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: enablePITR,
      },
      stream: dynamodb.StreamViewType.NEW_IMAGE,
    });

    // Add global secondary index for getting all users
    this.postsTable.addGlobalSecondaryIndex({
      indexName: TABLE_INDEXES.ALL_USERS,
      partitionKey: {
        name: TABLE_ATTRIBUTES.GSI1_PARTITION_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_ATTRIBUTES.GSI1_SORT_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add global secondary index for getting all posts
    this.postsTable.addGlobalSecondaryIndex({
      indexName: TABLE_INDEXES.ALL_POSTS,
      partitionKey: {
        name: TABLE_ATTRIBUTES.GSI2_PARTITION_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_ATTRIBUTES.GSI2_SORT_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add global secondary index for getting all users
    this.postsTable.addGlobalSecondaryIndex({
      indexName: TABLE_INDEXES.ALL_USER_POSTS,
      partitionKey: {
        name: TABLE_ATTRIBUTES.GSI3_PARTITION_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_ATTRIBUTES.GSI3_SORT_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add global secondary index for getting all users
    this.postsTable.addGlobalSecondaryIndex({
      indexName: TABLE_INDEXES.ALL_PROMPTS,
      partitionKey: {
        name: TABLE_ATTRIBUTES.GSI4_PARTITION_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_ATTRIBUTES.GSI4_SORT_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add global secondary index for getting all subscriptions
    this.postsTable.addGlobalSecondaryIndex({
      indexName: TABLE_INDEXES.ALL_SUBSCRIPTIONS,
      partitionKey: {
        name: TABLE_ATTRIBUTES.GSI5_PARTITION_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_ATTRIBUTES.GSI5_SORT_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add global secondary index for getting user subscriptions
    this.postsTable.addGlobalSecondaryIndex({
      indexName: TABLE_INDEXES.USER_SUBSCRIPTIONS,
      partitionKey: {
        name: TABLE_ATTRIBUTES.GSI6_PARTITION_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_ATTRIBUTES.GSI6_SORT_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add global secondary index for getting user gallery
    this.postsTable.addGlobalSecondaryIndex({
      indexName: TABLE_INDEXES.GET_USER_GALLERY,
      partitionKey: {
        name: TABLE_ATTRIBUTES.GSI7_PARTITION_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: TABLE_ATTRIBUTES.GSI7_SORT_KEY,
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add global secondary index for getting users by email
    this.postsTable.addGlobalSecondaryIndex({
      indexName: TABLE_INDEXES.USER_BY_EMAIL,
      partitionKey: {
        name: TABLE_ATTRIBUTES.EMAIL,
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        TABLE_ATTRIBUTES.PARTITION_KEY,
        TABLE_ATTRIBUTES.SORT_KEY,
        "id",
        "username",
        "about",
        "profilePicUrl",
        "profilePicKey",
        "userType",
        "address",
        "firstName",
        "lastName",
        "createdOn",
      ],
    });

    // Apply common tags
    Object.entries(COMMON_TAGS).forEach(([key, value]) => {
      cdk.Tags.of(this.postsTable).add(key, value);
    });
  }
}
