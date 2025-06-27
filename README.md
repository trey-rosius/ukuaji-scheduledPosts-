# Welcome to Ukuaji

## An AI social Media Post Scheduler

## Problem

We run a learning platform called Educloud academy(https://educloud.academy)
where we focus on teaching Cloud Computing and AI through hands on workshops.
We've created a lot of content in different formats.

- Text
- Images
- Videos.

Right now we're faced with a huge challenge. Marketing and distribution. We're
not posting content consistently on social media and that's hurting sales to the
max. Creating and posting content consistently is tough. Our platform has been
praised by many for it's unique content, but most reviewers end their sentences
with "underrated".We're still hidden. We've scouted the internet for post
scheduling services, but very few cater to all our needs. We especially wanted a
platform that'll consume the content we already have an then generated social
media content, based on our content. Privacy of our content is also a top
priority. We aren't okay with uploading our workshops to a third party knowledge
base.

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

## Solutions Architecture

# AWS Services Used

## Compute and Orchestration

- **AWS Lambda**:1 million free requests + 400 000 GB‑seconds compute/month
  (12‑month free tier)

- **AWS Step Functions**:Usage counts toward standard state transitions
  (12‑month trial)

## Event-Driven & Messaging

- **AWS SQS Queue** first 1 million requests free/month, 12‑month tier.
- **AWS EventBridge** : includes 100 000 events ingested and 100 000 events
  delivered free/month .
- **AWS EventBridge Scheduler**: Free Tier: As part of the Free Tier, you can
  get started with EventBridge Scheduler at no cost. You can make 14,000,000
  invocations per month for free.
- **AWS EventBridge Pipes** : usage falls under EventBridge free/event
  allowances

## Serverless GraphQL & Database

- **AWS AppSync** : includes 250 000 query & data modification operations, and
  25 000 real‑time updates/month (12‑month free tier).

- **Amazon DynamoDB** : 25 GB storage + 25 WCU + 25 RCU + 2.5 million stream
  read requests monthly (Always Free).
- **Pinecone**: Pay only for what you use with Pinecone.No upfront commitments,
  complete flexibility.

## Storage

- **AWS S3**: 5 GB standard storage + 20 000 GET + 2 000 PUT requests/month
  (Always Free)

## AI & Media Generation

- **AWS Bedrock (Agents/Knowledge Bases)** : no free tier; pay‑as‑you‑go for
  model inference & customization

- **Amazon Transcribe**: 60 minutes audio/month, free for first 12 months

- **Amazon Nova Canvas (image generation)** : billed per image: e.g., $0.04
  standard (no free allotment)

- **Amazon Nova Reel (video generation)** : billed per second: e.g., ~$0.08/

## Infrastructure As Code

**AWS CDK** : no runtime cost itself; you pay only for the resources it
provisions (e.g., Lambda, S3)

```
lib/
├── constructs/
│   ├── auth-construct.ts          # Cognito + secrets
│   ├── database-construct.ts      # DynamoDB tables & global indexes
│   ├── knowledge-base-construct.ts# S3 + Pinecone index + Bedrock KB
│   ├── media-processing-construct.ts # Transcribe + Step Functions video
│   ├── workflow-construct.ts      # Generic SFN wrapper + CloudWatch alarms
│   ├── waf-construct.ts           # L3 & L7 protection
│   └── appsync-construct.ts       # GraphQL API, data sources & resolvers
├── schedule_posts-stack.ts        # Root stack orchestrating sub-stacks
└── types.ts / constants.ts
```

### Separation of Concerns

| Principle                                                 | Implementation                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Stacks** encapsulate **deployment boundaries**          | `SchedulePostsStack` wires together independent domain constructs.     |
| **Constructs** model **single-responsibility components** | Each `*-construct.ts` exposes a minimal interface (e.g. tables, ARNs). |
| **Reusability** across stages (dev/test/prod)             | Context vars + `cdk.json` enable environment-agnostic deployments.     |

### Resource Tagging

All stacks apply **mandatory tags** (`AWS CDK Aspects`):

| Key           | Value                     | Rationale                        |
| ------------- | ------------------------- | -------------------------------- |
| `Project`     | `Ukuaji`                  | Easy cost allocation             |
| `Environment` | `dev` \| `test` \| `prod` | Promote least-privilege policies |
| `Owner`       | GitHub username or team   | Accountability                   |
| `CostCenter`  | CloudFinance code         | Chargeback / showback            |
| `Stack`       | Logical stack id          | Quickly locate resources         |

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
