import { Handler } from "aws-lambda";
import {
  createMockLambdaEvent,
  createMockLambdaContext,
  MockDynamoDBClient,
  MockEventBridgeClient,
} from "../../utils/test-utils";
import { logger, metrics, tracer } from "../../../src/powertools/utilities";

// Import the handler function
const { handler } = require("../../../src/sendPosts");

// Mock AWS SDK clients
jest.mock("@aws-sdk/client-dynamodb", () => {
  return {
    DynamoDBClient: jest.fn().mockImplementation(() => {
      return {};
    }),
  };
});

jest.mock("@aws-sdk/lib-dynamodb", () => {
  const mockDynamoDBClient = new MockDynamoDBClient();

  return {
    DynamoDBDocumentClient: {
      from: jest.fn().mockReturnValue(mockDynamoDBClient),
    },
    GetCommand: jest.fn().mockImplementation((params) => {
      return { tableName: params.TableName, key: params.Key };
    }),
    UpdateCommand: jest.fn().mockImplementation((params) => {
      return {
        tableName: params.TableName,
        key: params.Key,
        updateExpression: params.UpdateExpression,
      };
    }),
  };
});

jest.mock("@aws-sdk/client-eventbridge", () => {
  const mockEventBridgeClient = new MockEventBridgeClient();

  return {
    EventBridgeClient: jest.fn().mockImplementation(() => {
      return mockEventBridgeClient;
    }),
    PutEventsCommand: jest.fn().mockImplementation((params) => {
      return { entries: params.Entries };
    }),
  };
});

// Mock the AWS Lambda Powertools
jest.mock("../../../src/powertools/utilities", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    appendKeys: jest.fn(),
  },
  metrics: {
    addMetric: jest.fn(),
    publishStoredMetrics: jest.fn(),
  },
  tracer: {
    captureMethod: jest.fn((name, fn) => fn),
    putAnnotation: jest.fn(),
    putMetadata: jest.fn(),
    getSegment: jest.fn().mockReturnValue({
      addError: jest.fn(),
    }),
  },
}));

describe("sendPosts Lambda Integration Tests", () => {
  let mockDynamoDBClient: MockDynamoDBClient;
  let mockEventBridgeClient: MockEventBridgeClient;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock clients
    mockDynamoDBClient = new MockDynamoDBClient();
    mockEventBridgeClient = new MockEventBridgeClient();

    // Setup mock responses
    const mockPost = {
      PK: "USER#user-123",
      SK: "POST#post-456",
      id: "post-456",
      userId: "user-123",
      content: "Test post content",
      platform: "X",
      status: "SCHEDULED",
      scheduledTime: "2023-06-16T12:00:00Z",
    };

    mockDynamoDBClient.mockGetItem({ Item: mockPost });
    mockEventBridgeClient.mockPutEvents({
      FailedEntryCount: 0,
      Entries: [{ EventId: "event-789" }],
    });

    // Inject mock clients into the module
    jest.mock("@aws-sdk/lib-dynamodb", () => {
      return {
        DynamoDBDocumentClient: {
          from: jest.fn().mockReturnValue(mockDynamoDBClient),
        },
        GetCommand: jest.fn(),
        UpdateCommand: jest.fn(),
      };
    });

    jest.mock("@aws-sdk/client-eventbridge", () => {
      return {
        EventBridgeClient: jest.fn().mockImplementation(() => {
          return mockEventBridgeClient;
        }),
        PutEventsCommand: jest.fn(),
      };
    });
  });

  test("processes a scheduled post event end-to-end", async () => {
    // Create mock event with post data
    const mockEvent = createMockLambdaEvent({
      postId: "post-456",
      userId: "user-123",
      detail: {
        postId: "post-456",
        userId: "user-123",
      },
    });

    const mockContext = createMockLambdaContext();

    // Execute the handler
    await handler(mockEvent, mockContext);

    // Verify logger was called with the event
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("received scheduled post event")
    );

    // Note: The actual implementation of sendPosts.ts is minimal,
    // so we can't verify much more without expanding the implementation.
    // As the function is expanded, this test should be updated to verify:
    // 1. DynamoDB interactions to fetch the post
    // 2. Social media API calls
    // 3. DynamoDB updates to mark the post as sent
    // 4. EventBridge events for post status updates
    // 5. Error handling and retries
  });

  test("handles errors gracefully", async () => {
    // Mock a DynamoDB error
    mockDynamoDBClient.mockGetItem = jest.fn().mockImplementation(() => {
      throw new Error("DynamoDB error");
    });

    // Create mock event
    const mockEvent = createMockLambdaEvent({
      postId: "post-456",
      userId: "user-123",
    });

    const mockContext = createMockLambdaContext();

    // Execute the handler
    await handler(mockEvent, mockContext);

    // Verify error was logged
    // Note: This assumes the handler has error handling. If not, this test will fail
    // and should be updated once error handling is implemented.
    expect(logger.error).toHaveBeenCalled();
  });

  test("handles different post platforms", async () => {
    // Test with different platforms
    const platforms = ["X", "FACEBOOK", "INSTAGRAM", "LINKEDIN"];

    for (const platform of platforms) {
      // Reset mocks
      jest.clearAllMocks();

      // Setup mock post with specific platform
      const mockPost = {
        PK: "USER#user-123",
        SK: "POST#post-456",
        id: "post-456",
        userId: "user-123",
        content: "Test post content",
        platform: platform,
        status: "SCHEDULED",
        scheduledTime: "2023-06-16T12:00:00Z",
      };

      mockDynamoDBClient.mockGetItem({ Item: mockPost });

      // Create mock event
      const mockEvent = createMockLambdaEvent({
        postId: "post-456",
        userId: "user-123",
        platform: platform,
      });

      const mockContext = createMockLambdaContext();

      // Execute the handler
      await handler(mockEvent, mockContext);

      // Verify logger was called
      expect(logger.info).toHaveBeenCalled();

      // Additional platform-specific verifications would go here
      // as the implementation is expanded
    }
  });

  test("records metrics for post sending", async () => {
    // Create mock event
    const mockEvent = createMockLambdaEvent({
      postId: "post-456",
      userId: "user-123",
    });

    const mockContext = createMockLambdaContext();

    // Execute the handler
    await handler(mockEvent, mockContext);

    // Verify metrics were recorded
    // Note: This assumes metrics are implemented. If not, this test should be
    // updated once metrics are added to the implementation.
    expect(metrics.addMetric).toHaveBeenCalled();
    expect(metrics.publishStoredMetrics).toHaveBeenCalled();
  });

  test("uses tracing for observability", async () => {
    // Create mock event
    const mockEvent = createMockLambdaEvent({
      postId: "post-456",
      userId: "user-123",
    });

    const mockContext = createMockLambdaContext();

    // Execute the handler
    await handler(mockEvent, mockContext);

    // Verify tracing was used
    // Note: This assumes tracing is implemented. If not, this test should be
    // updated once tracing is added to the implementation.
    expect(tracer.putAnnotation).toHaveBeenCalled();
    expect(tracer.putMetadata).toHaveBeenCalled();
  });
});
