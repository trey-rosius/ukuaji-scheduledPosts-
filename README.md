# Welcome to Ukuaji

- [Introduction](/docs/1.introduction.md)

## Solution

**Ukuaji**, meaning "Growth" in Swahili, is an innovative application designed
to help grow your social media accounts by facilitating content creation and
scheduling. The platform empowers users with a comprehensive suite of features,
including:

- **Multimodal Retrieval-Augmented Generation (RAG) Pipeline:** A scalable
  content ingestion system that helps users craft posts uniquely aligned with
  their voice, style, and context.
- **AI-driven Image Generation:** Effortlessly create engaging visuals tailored
  for social media.
- **AI-driven Video Generation:** Generate compelling video content optimized
  for audience engagement.
- **Advanced Post Scheduling:** Efficiently plan, schedule, and automate social
  media posts for optimal impact.
- **Prompt Template Management:** Simplify content creation with customizable
  templates for consistent messaging.
- **Rich Media Gallery:** Access an extensive collection of royalty-free images
  and videos.
- **Subscription Monetization:** Seamlessly manage subscription plans to
  effectively monetize user access and usage.

## Domain Description

### auth-construct.ts

To protect the Appsync endpoint from unauthorized access, this construct creates
an AWS Cognito userpool and a userpool client.

### database-construct.ts

This construct creates a Dynamodb table and Global Secondary Indexes for
different access patterns of our application.

```
  ALL_USERS: "getAllUsers",
  ALL_POSTS: "getAllPosts",
  ALL_USER_POSTS: "getAllUserPosts",
  USER_GALLERY: "getUserGallery",
  ALL_PROMPTS: "getAllPrompts",
  USER_BY_EMAIL: "getUserByEmail",
  ALL_SUBSCRIPTIONS: "getAllSubscriptions",
  USER_SUBSCRIPTIONS: "getUserSubscriptions",
  GET_USER_GALLERY: "getUserGallery",

```

## Inspiration

## What it does

to be added later

## How I built it

`Ukuaji` is 95% Serverless.

## Challenges I ran into

- Video Generation using only the AWS Stepfunctions workflow and no lambda
  functions.
- Textract large PDF files through AWS Stepfunctions. I hit the 256KB limit
  multiple times.
- Strands `Store` and `Retrieve` tools for working with Knowledge bases.Still
  buggy and the `retrieve` tool takes a very long time to retrieve information
  from the knowledge base
- Nova video generation models(Nova Reels) aren't the best.
- Properly Calculate how many tokens each request to a Foundation model
  consumes.

## Accomplishments that i'm proud of

- I built a working prototype of the product under a month.
- Created a multimodal RAG pipeline with Strands Agents
-

## What I learned

## What's next for this app

```

```
