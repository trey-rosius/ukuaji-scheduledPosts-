import { AppSyncResolverHandler } from "aws-lambda";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { MutationStartStateMachineArgs } from "../appsync";
import { logger, metrics, tracer } from "../src/powertools/utilities";

export const handler: AppSyncResolverHandler<
  MutationStartStateMachineArgs,
  Boolean
> = async (event, _context) => {
  // You can customize your input; here we use a fixed payload.
  const prompt = [
    `Write a short(not more than 400 letters) and insightful social media post on ${event.arguments.input.prompts}`,
    "Generate 5 popular hashtags for the above post.Respond only with the hashtags and nothing else.",
  ];
  const input = JSON.stringify({ prompts: prompt });
  logger.info(`prompt is ${JSON.stringify(event.arguments)}`);

  logger.info(`step functions input is ${prompt}`);
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
