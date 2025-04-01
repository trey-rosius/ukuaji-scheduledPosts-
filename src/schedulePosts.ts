import { logger, metrics, tracer } from "../src/powertools/utilities";
import { Handler } from "aws-lambda";

import {
  SchedulerClient,
  CreateScheduleCommand,
  FlexibleTimeWindowMode,
  ActionAfterCompletion,
} from "@aws-sdk/client-scheduler";
import { addMinutes, addDays, addMonths } from "date-fns";

const client = new SchedulerClient({});
const createSchedule = ({ name, payload, description, time }: any) => {
  return client.send(
    new CreateScheduleCommand({
      Name: name,
      GroupName: process.env.SCHEDULE_GROUP_NAME,
      Target: {
        RoleArn: process.env.SCHEDULE_ROLE_ARN,
        Arn: process.env.SEND_POST_SERVICE_ARN,
        Input: JSON.stringify({ ...payload }),
      },
      ActionAfterCompletion: ActionAfterCompletion.DELETE,
      FlexibleTimeWindow: {
        Mode: FlexibleTimeWindowMode.OFF,
      },
      Description: description,
      ScheduleExpression: time,
    })
  );
};
export const handler: Handler = async (event, context) => {
  logger.info("This is the schedule post function");
  const postId = event.detail.postId;
  logger.info(`post id is ${postId}`);
  // Schedule for welcome email 2 minutes after sign up
  await createSchedule({
    name: `${postId}-24hr-after-post-create`,
    description: `New post scheduled with id:${postId}`,
    payload: { ...event.detail, context: "24hr" },
    time: `at(${addMinutes(new Date(), 2).toISOString().split(".")[0]})`,
  });
};
