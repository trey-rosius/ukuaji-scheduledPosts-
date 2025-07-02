const { util } = require("@aws-appsync/utils");
const { createMockAppSyncContext } = require("../../../utils/test-utils");
const resolver = require("../../../../resolvers/users/formatUserAccountInput");

// Mock the util.autoKsuid function
jest.mock("@aws-appsync/utils", () => ({
  util: {
    autoKsuid: jest.fn().mockReturnValue("mock-id-123"),
    time: {
      nowEpochMilliSeconds: jest.fn().mockReturnValue(1623868800000), // Fixed timestamp for testing
    },
  },
}));

describe("formatUserAccountInput resolver", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("formats user input correctly", () => {
    // Create mock input
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

    // Create mock context
    const mockContext = createMockAppSyncContext({
      userInput: mockUserInput,
    });

    // Execute the resolver
    const result = resolver.request(mockContext);

    // Verify the result
    expect(result).toEqual({
      payload: {
        key: {
          PK: "USER#mock-id-123",
          SK: "USER#mock-id-123",
        },
        values: {
          id: "mock-id-123",
          PK: "USER#mock-id-123",
          SK: "USER#mock-id-123",
          ENTITY: "USER",
          GSI1PK: "USER#",
          GSI1SK: "USER#mock-id-123",
          GSI6PK: "USER#mock-id-123",
          GSI6SK: "SUBSCRIPTION",
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
      },
    });

    // Verify util functions were called
    expect(util.autoKsuid).toHaveBeenCalledTimes(1);
    expect(util.time.nowEpochMilliSeconds).toHaveBeenCalledTimes(1);
  });

  test("generates unique IDs for each user", () => {
    // Mock different IDs for each call
    util.autoKsuid
      .mockReturnValueOnce("user-id-1")
      .mockReturnValueOnce("user-id-2");

    // Create mock inputs
    const mockUserInput1 = {
      username: "user1",
      firstName: "User",
      lastName: "One",
      about: "First user",
      email: "user1@example.com",
      userType: "MEMBER",
      profilePicKey: "profile/user1.jpg",
      profilePicUrl: "https://example.com/profile/user1.jpg",
    };

    const mockUserInput2 = {
      username: "user2",
      firstName: "User",
      lastName: "Two",
      about: "Second user",
      email: "user2@example.com",
      userType: "MEMBER",
      profilePicKey: "profile/user2.jpg",
      profilePicUrl: "https://example.com/profile/user2.jpg",
    };

    // Create mock contexts
    const mockContext1 = createMockAppSyncContext({
      userInput: mockUserInput1,
    });

    const mockContext2 = createMockAppSyncContext({
      userInput: mockUserInput2,
    });

    // Execute the resolver for both users
    const result1 = resolver.request(mockContext1);
    const result2 = resolver.request(mockContext2);

    // Verify the results have different IDs
    expect(result1.payload.key.PK).toBe("USER#user-id-1");
    expect(result2.payload.key.PK).toBe("USER#user-id-2");
    expect(result1.payload.values.id).not.toEqual(result2.payload.values.id);
  });

  test("handles all required user properties", () => {
    // Create mock input with all required properties
    const mockUserInput = {
      username: "completeuser",
      firstName: "Complete",
      lastName: "User",
      about: "User with all properties",
      email: "complete@example.com",
      userType: "ADMIN",
      profilePicKey: "profile/complete.jpg",
      profilePicUrl: "https://example.com/profile/complete.jpg",
    };

    // Create mock context
    const mockContext = createMockAppSyncContext({
      userInput: mockUserInput,
    });

    // Execute the resolver
    const result = resolver.request(mockContext);

    // Verify all properties are present in the result
    expect(result.payload.values).toMatchObject({
      username: "completeuser",
      firstName: "Complete",
      lastName: "User",
      about: "User with all properties",
      email: "complete@example.com",
      userType: "ADMIN",
      profilePicKey: "profile/complete.jpg",
      profilePicUrl: "https://example.com/profile/complete.jpg",
    });
  });

  test("response function returns the result", () => {
    const mockResult = { id: "mock-id-123" };
    const mockContext = {
      result: mockResult,
    };

    const result = resolver.response(mockContext);
    expect(result).toBe(mockResult);
  });
});
