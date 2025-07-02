# Deploy

Before deploying this application, please create a pinecone index
(https://www.pinecone.io/).

# Create Free Pinecone Vector Database

Create a free vector pinecone database here `https://www.pinecone.io/`. They
offer a generous free tier that's perfect for our application.

Create a project and then create a Serverless index within that project.

Once created, copy the host link and paste somewhere. We'll be needing it later.

Also navigate to the `API KEY` menu on the left and create a new API KEY. We'll
add this `API KEY` to `AWS SECRETS MANAGER` and use it alongside the host url to
access the pinecone index.

# Create PINECONE Secret

Log into your aws console, search and navigate to the aws secrets manager and
create a new secret.

Select key/value, enter `apiKey` as key and value is the `API KEY` value you
created and copied from pinecone.

Add a secret name and save.

Once it's done creating, copy the secret arn and keep. We'll be needing it
later.

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
