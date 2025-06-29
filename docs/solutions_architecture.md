## Solutions Architecture

![solutions_architecture](/assets/solutions_architecture.png)

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

### Resource Tagging

All stacks apply **mandatory tags** (`AWS CDK Aspects`):

| Key           | Value                     | Rationale                        |
| ------------- | ------------------------- | -------------------------------- |
| `Project`     | `Ukuaji`                  | Easy cost allocation             |
| `Environment` | `dev` \| `test` \| `prod` | Promote least-privilege policies |
| `Owner`       | GitHub username or team   | Accountability                   |
| `CostCenter`  | CloudFinance code         | Chargeback / showback            |
| `Stack`       | Logical stack id          | Quickly locate resources         |

### Separation of Concerns

| Principle                                                 | Implementation                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Stacks** encapsulate **deployment boundaries**          | `SchedulePostsStack` wires together independent domain constructs.     |
| **Constructs** model **single-responsibility components** | Each `*-construct.ts` exposes a minimal interface (e.g. tables, ARNs). |
| **Reusability** across stages (dev/test/prod)             | Context vars + `cdk.json` enable environment-agnostic deployments.     |

```
lib/
├── constructs/
│   ├── auth-construct.ts
│   ├── database-construct.ts
│   ├── knowledge-base-construct.ts
│   ├── media-processing-construct.ts
│   ├── workflow-construct.ts
|   ├── events-construct.ts
│   ├── waf-construct.ts
│   └── appsync-construct.ts
├── schedule_posts-stack.ts
└── types.ts / constants.ts
```

![stack-constructs](./assets/stack-construct-img.png)
