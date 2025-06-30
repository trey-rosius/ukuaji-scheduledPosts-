# Deploy

Before deploying this application, please create a pinecone index
(https://www.pinecone.io/).

# Create Free Pinecone Vector Database

Create a free vector pinecone database here `https://www.pinecone.io/`. They
offer a generous free tier that's perfect for our application.

![Free tier](https://d14x58xoxfhz1s.cloudfront.net/a725be13-6227-4d92-a6a1-3aaa936b54a2)

Create a project and then create a Serverless index within that project.

![Create Index](https://d14x58xoxfhz1s.cloudfront.net/b681e132-c458-44e4-9ad7-ca49817477e2)

![Create Index 2](https://d14x58xoxfhz1s.cloudfront.net/adb76426-efbc-4bde-a3eb-edf88ac9d804)

Once created, copy the host link and paste somewhere. We'll be needing it later.

![host link](https://d14x58xoxfhz1s.cloudfront.net/3e7f21e4-b692-4a25-b8e3-e807b012d39d)

Also navigate to the `API KEY` menu on the left and create a new API KEY. We'll
add this `API KEY` to `AWS SECRETS MANAGER` and use it alongside the host url to
access the pinecone index.

![api key menu](https://d14x58xoxfhz1s.cloudfront.net/9170a315-d787-48fe-aae2-0b7808d2495a)

![api key](https://d14x58xoxfhz1s.cloudfront.net/f6ca4177-6c5c-4e3c-872e-a466a462f829)

# Create PINECONE Secret

Log into your aws console, search and navigate to the aws secrets manager and
create a new secret.

![secret](https://d14x58xoxfhz1s.cloudfront.net/e5dc0369-d268-4ab2-a797-94adf6e5124a)

Select key/value, enter `apiKey` as key and value is the `API KEY` value you
created and copied from pinecone.

Add a secret name and save.

Once it's done creating, copy the secret arn and keep. We'll be needing it
later.

![secret](https://d14x58xoxfhz1s.cloudfront.net/902f4ced-4577-4e00-b8b0-c11795cdffe5)

# Add Secret ARN to Stack

Navigate to the stack file(`schedule_posts-stack.ts`) and replace the secrets
arn and pinecone host strings.

`pineconeConnectionString` `pineconeCredentialsSecretArn`

````ts
    // Create the knowledge base construct
    const knowledgeBaseConstruct = new KnowledgeBaseConstruct(
      this,
      "KnowledgeBaseConstruct",
      {
        knowledgeBaseName: "ScheduledPostsKnowledgeBase",
        bucketName: "scheduled-posts-knowledge-base-data",
        pineconeConnectionString:
          process.env.PINECONE_CONNECTION_STRING ||
          "https://XXXXXXXXXXXXX.pinecone.io", // Should be in environment variables
        pineconeCredentialsSecretArn:
          process.env.PINECONE_CREDENTIALS_SECRET_ARN ||
          "arn:aws:secretsmanager:us-east-1::secret:XXXXXXXXXX",
      }
    );
    ```
````

# Deploy

```
cdk synth
cdk boostrap
cdk deploy
```
