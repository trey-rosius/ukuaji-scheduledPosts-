# Testing Strategy for Schedule Posts Application

This document outlines the testing strategy for the Schedule Posts application,
including unit tests, integration tests, and how to run them.

## Overview

The testing strategy for this application follows a comprehensive approach:

1. **Unit Tests**: Test individual components in isolation
2. **Integration Tests**: Test interactions between components
3. **Stack Tests**: Validate the CDK infrastructure

## Test Structure

```
test/
├── unit/                  # Unit tests for individual components
│   ├── constructs/        # Tests for CDK constructs
│   ├── resolvers/         # Tests for AppSync resolvers
│   │   ├── users/         # User-related resolver tests
│   │   ├── pipeline/      # Pipeline resolver tests
│   │   └── ...
│   └── lambda/            # Tests for Lambda functions
├── integration/           # Integration tests
│   ├── resolvers/         # Tests for resolver pipelines
│   ├── lambda/            # Tests for Lambda integrations
│   └── workflow/          # Tests for Step Functions workflows
├── utils/                 # Testing utilities and mocks
│   ├── test-utils.ts      # Common testing utilities
│   └── mock-lambda.js     # Mock Lambda implementations
└── schedule_posts.test.ts # Main stack tests
```

## Unit Tests

Unit tests focus on testing individual components in isolation, using mocks for
dependencies.

### CDK Construct Tests

CDK construct tests validate that the infrastructure is defined correctly:

- Resources are created with the correct properties
- IAM permissions are set correctly
- Resource relationships are established properly

Example:

```typescript
test("creates DynamoDB table with correct configuration", () => {
  template.hasResourceProperties("AWS::DynamoDB::Table", {
    TableName: "ScheduledPostsTable",
    BillingMode: "PAY_PER_REQUEST",
  });
});
```

### AppSync Resolver Tests

Resolver tests validate the business logic in AppSync resolvers:

- Input formatting and validation
- DynamoDB operations
- Response formatting

Example:

```typescript
test("formats user input correctly", () => {
  const mockUserInput = { username: "testuser" };
  const mockContext = createMockAppSyncContext({ userInput: mockUserInput });
  const result = resolver.request(mockContext);
  expect(result.payload.values.username).toBe("testuser");
});
```

### Lambda Function Tests

Lambda function tests validate the business logic in Lambda functions:

- Event handling
- Error handling
- Integration with AWS services

Example:

```typescript
test("logs the received event", async () => {
  const mockEvent = createMockLambdaEvent({ postId: "post-123" });
  await handler(mockEvent, mockContext);
  expect(logger.info).toHaveBeenCalled();
});
```

## Integration Tests

Integration tests validate the interactions between components:

### Resolver Pipeline Tests

Tests the complete pipeline of resolvers working together:

```typescript
test("complete user creation pipeline works correctly", async () => {
  // Step 1: Format user input
  const formatResult = formatUserAccountInput.request(formatContext);

  // Step 2: Create user account
  const createResult = createUserAccount.request(createContext);

  // Step 3: Return final result
  const finalResult = defaultResolver.response(defaultContext);

  // Verify the complete pipeline
  expect(finalResult.id).toBe("mock-id-123");
});
```

### Lambda Integration Tests

Tests Lambda functions with their integrations:

```typescript
test("processes a scheduled post event end-to-end", async () => {
  // Mock DynamoDB and EventBridge
  mockDynamoDBClient.mockGetItem({ Item: mockPost });

  // Execute the handler
  await handler(mockEvent, mockContext);

  // Verify integrations
  expect(mockEventBridgeClient.putEvents).toHaveBeenCalled();
});
```

### Workflow Integration Tests

Tests Step Functions workflows:

```typescript
test("executes the text-to-video workflow end-to-end", async () => {
  // Execute the handler that starts the workflow
  const result = await handler(mockEvent);

  // Verify Step Functions was called
  expect(mockStepFunctionsClient.startExecution).toHaveBeenCalled();
});
```

## Stack Tests

Stack tests validate the entire CDK stack:

```typescript
test("creates all required constructs", () => {
  template.resourceCountIs("AWS::DynamoDB::Table", 1);
  template.resourceCountIs("AWS::Cognito::UserPool", 1);
  template.resourceCountIs("AWS::Events::EventBus", 1);
});
```

## Running Tests

### Prerequisites

- Node.js 18+
- npm or yarn

### Install Dependencies

```bash
npm install
```

### Run All Tests

```bash
npm test
```

### Run Specific Test Categories

```bash
# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run a specific test file
npx jest test/unit/lambda/sendPosts.test.ts
```

### Test Coverage

Generate test coverage report:

```bash
npm run test:coverage
```

The coverage report will be available in the `coverage/` directory.

## Mocking Strategy

The application uses several mocking strategies:

### AWS SDK Mocks

AWS SDK clients are mocked to avoid making actual AWS calls:

```typescript
jest.mock("@aws-sdk/client-dynamodb", () => {
  return {
    DynamoDBClient: jest.fn().mockImplementation(() => {
      return mockDynamoDBClient;
    }),
  };
});
```

### AppSync Utilities Mocks

AppSync utilities are mocked for resolver testing:

```typescript
jest.mock("@aws-appsync/utils", () => ({
  util: {
    autoKsuid: jest.fn().mockReturnValue("mock-id-123"),
    time: {
      nowEpochMilliSeconds: jest.fn().mockReturnValue(1623868800000),
    },
  },
}));
```

### Lambda Powertools Mocks

Lambda Powertools are mocked for Lambda function testing:

```typescript
jest.mock("../../../src/powertools/utilities", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
  metrics: {
    addMetric: jest.fn(),
    publishStoredMetrics: jest.fn(),
  },
  tracer: {
    captureMethod: jest.fn((name, fn) => fn),
  },
}));
```

## Best Practices

1. **Isolation**: Each test should be independent and not rely on the state from
   other tests.
2. **Mocking**: Use mocks to isolate the component being tested.
3. **Assertions**: Make specific assertions about the expected behavior.
4. **Coverage**: Aim for high test coverage, especially for critical paths.
5. **Readability**: Write clear, descriptive test names and comments.

## CI/CD Integration

The tests are integrated into the CI/CD pipeline:

1. **Pull Request Validation**: All tests run on pull requests
2. **Deployment Validation**: Tests run before deployment to production
3. **Regression Testing**: Tests run after deployment to verify functionality

## Troubleshooting

### Common Issues

1. **Mock Reset**: Ensure mocks are reset between tests using
   `jest.clearAllMocks()`.
2. **AWS SDK Version**: Make sure the AWS SDK version in tests matches the
   version used in the application.
3. **Context Objects**: Ensure AppSync context objects have all required
   properties.

### Debugging Tests

To debug tests, use the following approaches:

1. **Verbose Output**: Run tests with the `--verbose` flag.
2. **Inspect Mocks**: Use `console.log` to inspect mock calls and arguments.
3. **Single Test**: Run a single test with `--watch` for iterative debugging.

```bash
npx jest test/unit/lambda/sendPosts.test.ts --watch
```
