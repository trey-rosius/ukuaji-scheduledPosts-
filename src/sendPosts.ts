import { Handler } from "aws-lambda";
import { logger, metrics, tracer } from "../src/powertools/utilities";
export const handler: Handler = async (event, context) => {
  logger.info(`received scheduled post event ${event}`);
};
