const { put } = require("@aws-appsync/utils/dynamodb");
const { createMockAppSyncContext } = require("../../../utils/test-utils");
const resolver = require("../../../../resolvers/users/createUserAccount");

// Mock the DynamoDB put function
jest.mock("@aws-appsync/utils/dynamodb", () => ({
  put: jest.fn().mockReturnValue({ operation: "PutItem" }),
}));

describe("createUserAccount resolver", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("creates a user account with the provided key and values", () => {
    // Create mock previous result from formatUserAccountInput
    const mockPrevResult = {
      key: {
        PK: "USER#mock-id-123",
        SK: "USER#mock-id-123",
      },
      values: {
        id: "mock-id-123",
        PK: "USER#mock-id-123",
        SK: "USER#mock-id-123",
        username: "testuser",
        firstName: "Test",
        lastName: "User",
        about: "Test user bio",
        email: "test@example.com",
        userType: "MEMBER",
        profilePicKey: "profile/test.jpg",
        profilePicUrl: "https://example.com/profile/test.jpg",
        createdOn: 1623868800000,
      },
      condition: {
        PK: { attributeExists: false },
        SK: { attributeExists: false },
      },
    };

    // Create mock context
    const mockContext = createMockAppSyncContext({}, null, null, {
      result: {
        key: mockPrevResult.key,
        values: mockPrevResult.values,
        condition: mockPrevResult.condition,
      },
    });

    // Execute the resolver
    const result = resolver.request(mockContext);

    // Verify the put function was called with the correct parameters
    expect(put).toHaveBeenCalledWith({
      key: mockPrevResult.key,
      item: mockPrevResult.values,
      condition: mockPrevResult.condition,
    });

    // Verify the result
    expect(result).toEqual({ operation: "PutItem" });
  });

  test("handles missing previous result gracefully", () => {
    // Create mock context with no previous result
    const mockContext = createMockAppSyncContext({}, null, null, {});

    // Execute the resolver
    expect(() => resolver.request(mockContext)).not.toThrow();
  });

  test("response function returns the result", () => {
    const mockResult = { id: "mock-id-123", username: "testuser" };
    const mockContext = {
      result: mockResult,
    };

    const result = resolver.response(mockContext);
    expect(result).toBe(mockResult);
  });

  test("logs the previous result", () => {
    // Mock console.log
    const originalConsoleLog = console.log;
    console.log = jest.fn();

    // Create mock previous result
    const mockPrevResult = {
      key: { PK: "USER#mock-id-123", SK: "USER#mock-id-123" },
      values: { id: "mock-id-123", username: "testuser" },
      condition: { PK: { attributeExists: false } },
    };

    // Create mock context
    const mockContext = createMockAppSyncContext({}, null, null, {
      result: mockPrevResult,
    });

    // Execute the resolver
    resolver.request(mockContext);

    // Verify console.log was called
    expect(console.log).toHaveBeenCalled();

    // Restore console.log
    console.log = originalConsoleLog;
  });

  test("extracts key, values, and condition from previous result", () => {
    // Create mock previous result
    const mockPrevResult = {
      key: { PK: "USER#mock-id-123", SK: "USER#mock-id-123" },
      values: { id: "mock-id-123", username: "testuser" },
      condition: { PK: { attributeExists: false } },
    };

    // Create mock context
    const mockContext = createMockAppSyncContext({}, null, null, {
      result: mockPrevResult,
    });

    // Execute the resolver
    resolver.request(mockContext);

    // Verify the put function was called with the correct parameters
    expect(put).toHaveBeenCalledWith({
      key: mockPrevResult.key,
      item: mockPrevResult.values,
      condition: mockPrevResult.condition,
    });
  });
});
