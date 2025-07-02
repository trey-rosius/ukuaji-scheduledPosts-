const { util } = require("@aws-appsync/utils");
const { put } = require("@aws-appsync/utils/dynamodb");
const { createMockAppSyncContext } = require("../../../utils/test-utils");

// Import the resolvers
const formatUserAccountInput = require("../../../../resolvers/users/formatUserAccountInput");
const createUserAccount = require("../../../../resolvers/users/createUserAccount");
const defaultResolver = require("../../../../resolvers/pipeline/default");

// Mock the util.autoKsuid function
jest.mock("@aws-appsync/utils", () => ({
  util: {
    autoKsuid: jest.fn().mockReturnValue("mock-id-123"),
    time: {
      nowEpochMilliSeconds: jest.fn().mockReturnValue(1623868800000), // Fixed timestamp for testing
    },
  },
}));

// Mock the DynamoDB put function
jest.mock("@aws-appsync/utils/dynamodb", () => ({
  put: jest.fn().mockImplementation((params) => {
    return {
      operation: "PutItem",
      key: params.key,
      attributeValues: params.item,
    };
  }),
}));

describe("User Creation Pipeline Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("complete user creation pipeline works correctly", () => {
    // Step 1: Create mock input for the first resolver
    const mockUserInput = {
      username: "testuser",
      firstName: "Test",
      lastName: "User",
      about: "Test user bio",
      email: "test@example.com",
      userType: "MEMBER",
      profilePicKey: "profile/test.jpg",
      profilePicUrl: "https://example.com/profile/test.jpg",
    };

    // Create mock context for the first resolver
    const formatContext = createMockAppSyncContext({
      userInput: mockUserInput,
    });

    // Execute the first resolver (formatUserAccountInput)
    const formatResult = formatUserAccountInput.request(formatContext);

    // Verify the first resolver's output
    expect(formatResult).toHaveProperty("payload");
    expect(formatResult.payload).toHaveProperty("key");
    expect(formatResult.payload).toHaveProperty("values");
    expect(formatResult.payload).toHaveProperty("condition");
    expect(formatResult.payload.values.id).toBe("mock-id-123");
    expect(formatResult.payload.values.username).toBe("testuser");

    // Step 2: Create mock context for the second resolver with the first resolver's result
    const createContext = createMockAppSyncContext({}, null, null, {
      result: formatResult.payload,
    });

    // Execute the second resolver (createUserAccount)
    const createResult = createUserAccount.request(createContext);

    // Verify the second resolver's output
    expect(createResult).toHaveProperty("operation", "PutItem");
    expect(createResult).toHaveProperty("key");
    expect(createResult).toHaveProperty("attributeValues");
    expect(createResult.key).toEqual(formatResult.payload.key);
    expect(createResult.attributeValues).toEqual(formatResult.payload.values);

    // Mock the DynamoDB response
    const mockDynamoDBResponse = {
      ...formatResult.payload.values,
      // Add any additional fields that DynamoDB would return
    };

    // Step 3: Create mock context for the final resolver with the second resolver's result
    const defaultContext = createMockAppSyncContext({}, null, null, {
      result: mockDynamoDBResponse,
    });

    // Execute the final resolver (default)
    const finalResult = defaultResolver.response(defaultContext);

    // Verify the final result
    expect(finalResult).toEqual(mockDynamoDBResponse);
    expect(finalResult.id).toBe("mock-id-123");
    expect(finalResult.username).toBe("testuser");
    expect(finalResult.email).toBe("test@example.com");

    // Verify the util functions were called
    expect(util.autoKsuid).toHaveBeenCalledTimes(1);
    expect(util.time.nowEpochMilliSeconds).toHaveBeenCalledTimes(1);

    // Verify the DynamoDB put function was called with the correct parameters
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith({
      key: formatResult.payload.key,
      item: formatResult.payload.values,
      condition: formatResult.payload.condition,
    });
  });

  test("handles error in the pipeline gracefully", () => {
    // Mock the DynamoDB put function to throw an error
    put.mockImplementationOnce(() => {
      throw new Error("DynamoDB error");
    });

    // Step 1: Create mock input for the first resolver
    const mockUserInput = {
      username: "testuser",
      firstName: "Test",
      lastName: "User",
      email: "test@example.com",
    };

    // Create mock context for the first resolver
    const formatContext = createMockAppSyncContext({
      userInput: mockUserInput,
    });

    // Execute the first resolver (formatUserAccountInput)
    const formatResult = formatUserAccountInput.request(formatContext);

    // Create mock context for the second resolver with the first resolver's result
    const createContext = createMockAppSyncContext({}, null, null, {
      result: formatResult.payload,
    });

    // Execute the second resolver (createUserAccount) and expect it to throw
    expect(() => createUserAccount.request(createContext)).toThrow(
      "DynamoDB error"
    );
  });

  test("pipeline correctly handles all user properties", () => {
    // Step 1: Create mock input with all required properties
    const mockUserInput = {
      username: "completeuser",
      firstName: "Complete",
      lastName: "User",
      about: "User with all properties",
      email: "complete@example.com",
      userType: "ADMIN",
      profilePicKey: "profile/complete.jpg",
      profilePicUrl: "https://example.com/profile/complete.jpg",
      preferences: {
        theme: "dark",
        notifications: true,
        language: "en",
      },
    };

    // Create mock context for the first resolver
    const formatContext = createMockAppSyncContext({
      userInput: mockUserInput,
    });

    // Execute the first resolver (formatUserAccountInput)
    const formatResult = formatUserAccountInput.request(formatContext);

    // Create mock context for the second resolver with the first resolver's result
    const createContext = createMockAppSyncContext({}, null, null, {
      result: formatResult.payload,
    });

    // Execute the second resolver (createUserAccount)
    const createResult = createUserAccount.request(createContext);

    // Verify all properties are present in the result
    expect(createResult.attributeValues).toMatchObject({
      username: "completeuser",
      firstName: "Complete",
      lastName: "User",
      about: "User with all properties",
      email: "complete@example.com",
      userType: "ADMIN",
      profilePicKey: "profile/complete.jpg",
      profilePicUrl: "https://example.com/profile/complete.jpg",
      preferences: {
        theme: "dark",
        notifications: true,
        language: "en",
      },
    });
  });
});
