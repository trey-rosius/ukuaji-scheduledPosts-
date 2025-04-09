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
    this.postsTable = new Table(this, "postsTable", {
      tableName: "postSchedulerTable",
      partitionKey: {
        name: "postId",
        type: AttributeType.STRING,
      },
      removalPolicy: RemovalPolicy.DESTROY,
      stream: StreamViewType.NEW_IMAGE,
    });
  }
}
