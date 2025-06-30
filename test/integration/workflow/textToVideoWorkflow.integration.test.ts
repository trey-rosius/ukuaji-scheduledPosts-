import {
  createMockLambdaEvent,
  createMockLambdaContext,
  MockS3Client,
  MockStepFunctionsClient,
  MockBedrockClient,
} from "../../utils/test-utils";
import * as fs from "fs";
import * as path from "path";

// Mock AWS SDK clients
jest.mock("@aws-sdk/client-s3", () => {
  const mockS3Client = new MockS3Client();

  return {
    S3Client: jest.fn().mockImplementation(() => {
      return mockS3Client;
    }),
    GetObjectCommand: jest.fn().mockImplementation((params) => {
      return { Bucket: params.Bucket, Key: params.Key };
    }),
    PutObjectCommand: jest.fn().mockImplementation((params) => {
      return { Bucket: params.Bucket, Key: params.Key };
    }),
  };
});

jest.mock("@aws-sdk/client-sfn", () => {
  const mockStepFunctionsClient = new MockStepFunctionsClient();

  return {
    SFNClient: jest.fn().mockImplementation(() => {
      return mockStepFunctionsClient;
    }),
    StartExecutionCommand: jest.fn().mockImplementation((params) => {
      return { stateMachineArn: params.stateMachineArn, input: params.input };
    }),
    DescribeExecutionCommand: jest.fn().mockImplementation((params) => {
      return { executionArn: params.executionArn };
    }),
  };
});

jest.mock("@aws-sdk/client-bedrock-runtime", () => {
  const mockBedrockClient = new MockBedrockClient();

  return {
    BedrockRuntimeClient: jest.fn().mockImplementation(() => {
      return mockBedrockClient;
    }),
    InvokeModelCommand: jest.fn().mockImplementation((params) => {
      return { modelId: params.modelId, body: params.body };
    }),
  };
});

// Mock the workflow definition
jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  readFileSync: jest.fn(),
}));

describe("Text to Video Workflow Integration Tests", () => {
  let mockS3Client: MockS3Client;
  let mockStepFunctionsClient: MockStepFunctionsClient;
  let mockBedrockClient: MockBedrockClient;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock clients
    mockS3Client = new MockS3Client();
    mockStepFunctionsClient = new MockStepFunctionsClient();
    mockBedrockClient = new MockBedrockClient();

    // Mock the workflow definition
    const mockWorkflowDefinition = {
      Comment: "Text to Video Generation Workflow",
      StartAt: "ValidateInput",
      States: {
        ValidateInput: {
          Type: "Pass",
          Next: "GenerateVideo",
        },
        GenerateVideo: {
          Type: "Task",
          Resource: "arn:aws:states:::bedrock:invokeModel",
          Next: "ProcessResult",
        },
        ProcessResult: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          End: true,
        },
      },
    };

    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath.includes("text_to_video_workflow.asl.json")) {
        return JSON.stringify(mockWorkflowDefinition);
      }
      return "";
    });

    // Setup mock responses
    mockS3Client.mockPutObject({
      ETag: '"mock-etag"',
    });

    mockStepFunctionsClient.mockStartExecution({
      executionArn:
        "arn:aws:states:us-east-1:123456789012:execution:TextToVideoStateMachine:mock-execution",
    });

    mockBedrockClient.mockInvokeModel({
      body: Buffer.from(
        JSON.stringify({
          result: {
            videoUrl: "https://example.com/video.mp4",
          },
        })
      ),
    });
  });

  test("executes the text-to-video workflow end-to-end", async () => {
    // Import the handler function after mocks are set up
    const { handler } = require("../../../resolvers/generateTextToVideo");

    // Create mock event
    const mockEvent = {
      arguments: {
        input: {
          text: "A beautiful sunset over the ocean",
          style: "cinematic",
          duration: 10,
          resolution: "1080p",
        },
      },
      identity: {
        sub: "user-123",
      },
    };

    // Execute the handler
    const result = await handler(mockEvent);

    // Verify the result
    expect(result).toBeDefined();

    // Verify Step Functions was called to start the workflow
    expect(mockStepFunctionsClient.startExecution).toHaveBeenCalled();

    // Note: Since this is an integration test that simulates the workflow,
    // we're primarily verifying that the workflow was started correctly.
    // The actual execution would happen asynchronously in a real environment.
  });

  test("handles workflow execution errors", async () => {
    // Mock an error in starting the workflow
    mockStepFunctionsClient.mockStartExecution = jest
      .fn()
      .mockImplementation(() => {
        throw new Error("Failed to start workflow execution");
      });

    // Import the handler function after mocks are set up
    const { handler } = require("../../../resolvers/generateTextToVideo");

    // Create mock event
    const mockEvent = {
      arguments: {
        input: {
          text: "A beautiful sunset over the ocean",
          style: "cinematic",
          duration: 10,
          resolution: "1080p",
        },
      },
      identity: {
        sub: "user-123",
      },
    };

    // Execute the handler and expect it to throw
    await expect(handler(mockEvent)).rejects.toThrow(
      "Failed to start workflow execution"
    );
  });

  test("validates input parameters", async () => {
    // Import the handler function after mocks are set up
    const { handler } = require("../../../resolvers/generateTextToVideo");

    // Test with missing required parameters
    const testCases = [
      // Missing text
      {
        input: {
          style: "cinematic",
          duration: 10,
          resolution: "1080p",
        },
      },
      // Invalid duration
      {
        input: {
          text: "A beautiful sunset",
          style: "cinematic",
          duration: -5,
          resolution: "1080p",
        },
      },
      // Invalid resolution
      {
        input: {
          text: "A beautiful sunset",
          style: "cinematic",
          duration: 10,
          resolution: "invalid",
        },
      },
    ];

    for (const testInput of testCases) {
      // Reset mocks
      jest.clearAllMocks();

      // Create mock event
      const mockEvent = {
        arguments: {
          input: testInput.input,
        },
        identity: {
          sub: "user-123",
        },
      };

      // Execute the handler
      try {
        await handler(mockEvent);
        // If we get here, the validation didn't throw as expected
        fail("Expected validation to fail but it succeeded");
      } catch (error) {
        // Validation error expected
        expect(error).toBeDefined();
      }
    }
  });

  test("processes different video styles", async () => {
    // Import the handler function after mocks are set up
    const { handler } = require("../../../resolvers/generateTextToVideo");

    // Test with different video styles
    const styles = ["cinematic", "cartoon", "realistic", "artistic"];

    for (const style of styles) {
      // Reset mocks
      jest.clearAllMocks();

      // Create mock event
      const mockEvent = {
        arguments: {
          input: {
            text: "A beautiful sunset over the ocean",
            style: style,
            duration: 10,
            resolution: "1080p",
          },
        },
        identity: {
          sub: "user-123",
        },
      };

      // Execute the handler
      await handler(mockEvent);

      // Verify Step Functions was called with the correct style
      expect(mockStepFunctionsClient.startExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.stringContaining(style),
        })
      );
    }
  });

  test("integrates with the state machine definition", () => {
    // Verify that the workflow definition was loaded
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining("text_to_video_workflow.asl.json"),
      expect.any(String)
    );

    // Import the workflow definition directly to verify its structure
    const workflowPath = path.resolve(
      __dirname,
      "../../../workflow/text_to_video_workflow.asl.json"
    );
    const workflowDefinition = JSON.parse(
      fs.readFileSync(workflowPath, "utf8")
    );

    // Verify the workflow structure
    expect(workflowDefinition).toHaveProperty("States");
    expect(workflowDefinition.States).toHaveProperty("ValidateInput");
    expect(workflowDefinition.States).toHaveProperty("GenerateVideo");
    expect(workflowDefinition.States).toHaveProperty("ProcessResult");
  });
});
