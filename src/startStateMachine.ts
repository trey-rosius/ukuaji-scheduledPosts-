import { AppSyncResolverHandler } from "aws-lambda";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { MutationStartStateMachineArgs } from "../appsync";
import { logger, metrics, tracer } from "../src/powertools/utilities";

export const handler: AppSyncResolverHandler<
  MutationStartStateMachineArgs,
  Boolean
> = async (event, _context) => {
  // You can customize your input; here we use a fixed payload.

  const input = JSON.stringify({ prompts: event.arguments.input.prompts });
  logger.info(`prompt is ${JSON.stringify(event.arguments)}`);

  logger.info(`step functions input is ${input}`);
  const stateMachineArn = process.env.STATE_MACHINE_ARN;

  if (!stateMachineArn) {
    console.log("STATE_MACHINE_ARN is not configured.");

    return false;
  }

  const client = new SFNClient({});
  const command = new StartExecutionCommand({
    stateMachineArn,
    input,
  });

  try {
    const response = await client.send(command);
    return true;
  } catch (error: any) {
    console.error("Error starting Step Functions execution", error);
    return false;
  }
};
