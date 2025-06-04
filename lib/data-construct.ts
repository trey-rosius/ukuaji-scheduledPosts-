import { Construct } from "constructs";
import {
  Table,
  AttributeType,
  BillingMode,
  ProjectionType,
  StreamViewType,
} from "aws-cdk-lib/aws-dynamodb";
import { RemovalPolicy } from "aws-cdk-lib";

export class DataConstruct extends Construct {
  public readonly postsTable: Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    // The DynamoDB table for users
    this.postsTable = new Table(this, "rocreateTable", {
      tableName: "rocreateTable",

      partitionKey: {
        name: "PK",
        type: AttributeType.STRING,
      },
      sortKey: {
        name: "SK",
        type: AttributeType.STRING,
      },

      billingMode: BillingMode.PAY_PER_REQUEST,

      removalPolicy: RemovalPolicy.DESTROY,
      stream: StreamViewType.NEW_IMAGE,
    });

    this.postsTable.addGlobalSecondaryIndex({
      indexName: "getAllUsers",
      partitionKey: {
        name: "GSI1PK",
        type: AttributeType.STRING,
      },
      sortKey: {
        name: "GSI1SK",
        type: AttributeType.STRING,
      },

      projectionType: ProjectionType.ALL,
    });

    this.postsTable.addGlobalSecondaryIndex({
      indexName: "getAllPosts",
      partitionKey: {
        name: "GSI2PK",
        type: AttributeType.STRING,
      },
      sortKey: {
        name: "GSI2SK",
        type: AttributeType.STRING,
      },

      projectionType: ProjectionType.ALL,
    });

    this.postsTable.addGlobalSecondaryIndex({
      indexName: "getUserByEmail",
      partitionKey: { name: "email", type: AttributeType.STRING },
      projectionType: ProjectionType.INCLUDE,
      nonKeyAttributes: [
        "PK",
        "SK",
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
  }
}
