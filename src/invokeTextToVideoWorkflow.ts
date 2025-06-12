import { AppSyncResolverHandler } from "aws-lambda";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { logger, metrics, tracer } from "./powertools/utilities";
import { TextToVideoInput } from "../appsync";

export const handler: AppSyncResolverHandler<
  { input: TextToVideoInput },
  Boolean
> = async (event, _context) => {
  const input = JSON.stringify({
    query: event.arguments.input.query,
    bucketUri: event.arguments.input.bucketUri,
    folderUUID: event.arguments.input.folderUUID,
    userId: event.arguments.input.userId,
  });

  logger.info(`Starting text-to-video workflow with input: ${input}`);

  const textToVideoStateMachineArn =
    process.env.TEXT_TO_VIDEO_STATE_MACHINE_ARN;

  if (!textToVideoStateMachineArn) {
    logger.error("TEXT_TO_VIDEO_STATE_MACHINE_ARN is not configured.");
    return false;
  }

  const client = new SFNClient({});

  try {
    const command = new StartExecutionCommand({
      stateMachineArn: textToVideoStateMachineArn,
      input: input,
    });

    const response = await client.send(command);
    logger.info(`Successfully started execution: ${response.executionArn}`);

    return true;
  } catch (error: any) {
    logger.error("Error starting Step Functions execution", { error });
    return false;
  }
};
