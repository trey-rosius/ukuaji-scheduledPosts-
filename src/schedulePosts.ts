import { logger, metrics, tracer } from "../src/powertools/utilities";

import {
  EVENTBRIDGE,
  extractDataFromEnvelope,
} from "@aws-lambda-powertools/jmespath/envelopes";
import {
  SchedulerClient,
  CreateScheduleCommand,
  FlexibleTimeWindowMode,
  ActionAfterCompletion,
} from "@aws-sdk/client-scheduler";
import { addMinutes, addDays, addMonths } from "date-fns";
import type { EventBridgeEvent } from "aws-lambda";
type DynamoDBPost = {
  id: { S: string };
  content: { S: string };
  createdOn: { N: string }; // Numbers are passed as strings in DynamoDB
  entity: { S: string };
  imageUrls?: { L: { S: string }[] };
  schedulePost: { BOOL: boolean };
  updatedOn: { NULL: true } | { N: string };
  userId: { S: string };
  schedule?: {
    M: {
      day: { N: string };
      hour: { N: string };
      minute: { N: string };
      month: { N: string };
      second: { N: string };
      year: { N: string };
    };
  };
};

type PostBody = {
  posts: DynamoDBPost;
};

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
export const handler = async (
  event: EventBridgeEvent<"SchedulePostCreated", PostBody>
) => {
  logger.info("This is the schedule post function");
  logger.info(`records ${JSON.stringify(event.detail.posts)}`);

  const records = extractDataFromEnvelope<PostBody>(event, EVENTBRIDGE);
  logger.info(`records are ${JSON.stringify(records)}`);

  const id = records.posts.id.S;
  logger.info(`post id is ${JSON.stringify(records.posts.id.S)}`);
  // Schedule for welcome email 2 minutes after sign up
  await createSchedule({
    name: `${id}-24hr-after-post-create`,
    description: `New post scheduled with id:${id}`,
    payload: { ...event.detail, context: "24hr" },
    time: `at(${addMinutes(new Date(), 2).toISOString().split(".")[0]})`,
  });
};
