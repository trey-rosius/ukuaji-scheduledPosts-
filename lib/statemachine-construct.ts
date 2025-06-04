import { Construct } from "constructs";
import {
  EventBus,
  EventField,
  Rule,
  RuleTargetInput,
} from "aws-cdk-lib/aws-events";
import {
  CfnStateMachine,
  DefinitionBody,
  StateMachine,
} from "aws-cdk-lib/aws-stepfunctions";
import { SfnStateMachine } from "aws-cdk-lib/aws-events-targets";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import {
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { readFileSync } from "fs";
import path = require("path");

export class StateMachineConstruct extends Construct {
  public readonly generatePostStateMachine: CfnStateMachine;
  public readonly stateMachineRole: Role;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Path to your ASL definition file (adjust the relative path as needed)
    const aslFilePath = path.join(
      __dirname,
      "../workflow/state_machine_worflow.asl.json"
    );
    const definitionJson = JSON.parse(readFileSync(aslFilePath, "utf8"));

    // Create an IAM role for Step Functions (states.amazonaws.com must be allowed to assume this role)
    this.stateMachineRole = new Role(this, "StateMachineRole", {
      assumedBy: new ServicePrincipal("states.amazonaws.com"),
      description: "IAM Role assumed by the Step Functions state machine",
    });

    // Grant permission to call Bedrock's InvokeModel on any foundation model.
    this.stateMachineRole.addToPolicy(
      new PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );

    // Create the state machine using the CfnStateMachine construct
    this.generatePostStateMachine = new CfnStateMachine(
      this,
      "roCreateGeneratePostStateMachine",
      {
        stateMachineName: "roCreateGeneratePostStateMachine",
        roleArn: this.stateMachineRole.roleArn,

        // Pass the ASL definition as a string
        definitionString: JSON.stringify(definitionJson),
        stateMachineType: "STANDARD", // or 'EXPRESS' if preferred
      }
    );
  }
}
