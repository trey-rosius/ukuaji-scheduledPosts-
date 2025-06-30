import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { DatabaseConstruct } from "../../../lib/constructs/database-construct";
import { TABLE_ATTRIBUTES, TABLE_INDEXES } from "../../../lib/constants";

describe("DatabaseConstruct", () => {
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");

    new DatabaseConstruct(stack, "TestDatabaseConstruct", {
      tableName: "TestTable",
      enablePITR: true,
    });

    template = Template.fromStack(stack);
  });

  it("creates a DynamoDB table with correct core properties", () => {
    const tables = template.findResources("AWS::DynamoDB::Table");
    expect(Object.keys(tables)).toHaveLength(1);

    const [table] = Object.values(tables) as any[];
    expect(table.Properties.TableName).toBe("TestTable");
    expect(table.Properties.BillingMode).toBe("PAY_PER_REQUEST");

    // Key schema must include partition & sort keys
    expect(table.Properties.KeySchema).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          AttributeName: TABLE_ATTRIBUTES.PARTITION_KEY,
          KeyType: "HASH",
        }),
        expect.objectContaining({
          AttributeName: TABLE_ATTRIBUTES.SORT_KEY,
          KeyType: "RANGE",
        }),
      ])
    );

    // Stream + PITR
    expect(table.Properties.StreamSpecification.StreamViewType).toBe(
      "NEW_IMAGE"
    );
    expect(
      table.Properties.PointInTimeRecoverySpecification
        .PointInTimeRecoveryEnabled
    ).toBe(true);
  });

  it("creates all expected global secondary indexes", () => {
    const [table] = Object.values(
      template.findResources("AWS::DynamoDB::Table")
    ) as any[];

    const gsiNames = (table.Properties.GlobalSecondaryIndexes || []).map(
      (g: any) => g.IndexName
    );

    const expected = [
      TABLE_INDEXES.ALL_USERS,
      TABLE_INDEXES.ALL_POSTS,
      TABLE_INDEXES.ALL_USER_POSTS,
      TABLE_INDEXES.ALL_PROMPTS,
      TABLE_INDEXES.ALL_SUBSCRIPTIONS,
      TABLE_INDEXES.USER_BY_EMAIL,
    ];

    expected.forEach((name) => expect(gsiNames).toContain(name));
  });

  it("applies the correct removal policy", () => {
    template.hasResource("AWS::DynamoDB::Table", {
      DeletionPolicy: "Delete", // DESTROY in CDK translates to Delete
    });
  });

  it("creates a table with PITR disabled when not specified", () => {
    const app2 = new cdk.App();
    const stack2 = new cdk.Stack(app2, "StackNoPITR");
    new DatabaseConstruct(stack2, "DBNoPITR", {
      tableName: "TableNoPITR",
    });

    const tpl2 = Template.fromStack(stack2);
    const [tbl] = Object.values(
      tpl2.findResources("AWS::DynamoDB::Table")
    ) as any[];
    expect(
      tbl.Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled
    ).toBe(false);
  });
});
