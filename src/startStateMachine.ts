import { AppSyncResolverHandler } from "aws-lambda";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { MutationStartAgentStateMachineArgs } from "../appsync";
import { logger, metrics, tracer } from "../src/powertools/utilities";

export const handler: AppSyncResolverHandler<
  MutationStartAgentStateMachineArgs,
  Boolean
> = async (event, _context) => {
  const input = JSON.stringify({ input: event.arguments.input });

  logger.info(`step functions input is ${input}`);

  const postWithContextStateMachineArn =
    process.env.POST_WITH_CONTEXT_STATE_MACHINE_ARN;

  if (!postWithContextStateMachineArn) {
    console.log("STATE_MACHINE_ARN is not configured.");

    return false;
  }

  const client = new SFNClient({});

  try {
    const command = new StartExecutionCommand({
      stateMachineArn: postWithContextStateMachineArn,
      input: input,
    });
    const response = await client.send(command);

    return true;
  } catch (error: any) {
    console.error("Error starting Step Functions execution", error);
    return false;
  }
};
