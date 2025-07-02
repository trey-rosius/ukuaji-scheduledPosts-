const { createMockAppSyncContext } = require("../../../utils/test-utils");
const resolver = require("../../../../resolvers/pipeline/default");

describe("default pipeline resolver", () => {
  test("request function returns an empty object", () => {
    const mockContext = createMockAppSyncContext();
    const result = resolver.request(mockContext);
    expect(result).toEqual({});
  });

  test("response function returns the previous result", () => {
    const mockPrevResult = {
      id: "mock-id-123",
      username: "testuser",
      email: "test@example.com",
    };

    const mockContext = createMockAppSyncContext({}, null, null, {
      result: mockPrevResult,
    });

    const result = resolver.response(mockContext);
    expect(result).toBe(mockPrevResult);
  });

  test("response function handles missing previous result", () => {
    const mockContext = createMockAppSyncContext();
    const result = resolver.response(mockContext);
    expect(result).toBeUndefined();
  });

  test("response function passes through complex objects", () => {
    const mockPrevResult = {
      user: {
        id: "mock-id-123",
        username: "testuser",
        profile: {
          firstName: "Test",
          lastName: "User",
        },
      },
      metadata: {
        createdAt: "2023-06-16T12:00:00Z",
        source: "API",
      },
    };

    const mockContext = createMockAppSyncContext({}, null, null, {
      result: mockPrevResult,
    });

    const result = resolver.response(mockContext);
    expect(result).toEqual(mockPrevResult);
  });

  test("response function handles array results", () => {
    const mockPrevResult = [
      { id: "user-1", username: "user1" },
      { id: "user-2", username: "user2" },
      { id: "user-3", username: "user3" },
    ];

    const mockContext = createMockAppSyncContext({}, null, null, {
      result: mockPrevResult,
    });

    const result = resolver.response(mockContext);
    expect(result).toEqual(mockPrevResult);
  });

  test("response function handles primitive values", () => {
    const testCases = ["string value", 123, true, false, null];

    testCases.forEach((testValue) => {
      const mockContext = createMockAppSyncContext({}, null, null, {
        result: testValue,
      });

      const result = resolver.response(mockContext);
      expect(result).toBe(testValue);
    });
  });
});
