import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";

import { KnowledgeBaseConstructProps } from "../types";
import {
  COMMON_TAGS,
  DEFAULT_REMOVAL_POLICY,
  DEFAULT_REGION,
  AGENT_LAMBDA_MEMORY_SIZE,
  COMMON_LAMBDA_ENV_VARS,
} from "../constants";
import {
  BedrockFoundationModel,
  ChunkingStrategy,
  S3DataSource,
  CustomDataSource,
  VectorKnowledgeBase,
  Agent,
  AgentAlias,
  Memory,
} from "@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/bedrock";
import { PineconeVectorStore } from "@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/pinecone";
import { PythonFunction } from "@aws-cdk/aws-lambda-python-alpha";
import { Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";

/**
 * Construct for Bedrock knowledge base resources
 */
export class KnowledgeBaseConstruct extends Construct {
  /**
   * The Bedrock knowledge base
   */
  public readonly knowledgeBase: VectorKnowledgeBase;

  /**
   * Custom Datasource
   */

  public readonly customDatasource: CustomDataSource;
  /**
   * The Lambda function for generating posts with an agent
   */
  public readonly invokeAgentFunction: PythonFunction;
  public readonly agent: Agent;
  public readonly agent_alias: AgentAlias;

  constructor(
    scope: Construct,
    id: string,
    props: KnowledgeBaseConstructProps
  ) {
    super(scope, id);

    const {
      knowledgeBaseName,
      bucketName,
      pineconeConnectionString,
      pineconeCredentialsSecretArn,
    } = props;

    // Create the vector store using Pinecone
    const vectorStore = new PineconeVectorStore({
      connectionString: pineconeConnectionString,
      credentialsSecretArn: pineconeCredentialsSecretArn,
      textField: "text",
      metadataField: "metadata",
      namespace: "scheduled-posts-namespace",
    });

    // Create the Lambda function for generating posts with an agent
    this.invokeAgentFunction = new PythonFunction(this, "InvokeAgentFunction", {
      entry: "./src/agents_resolvers/",
      handler: "handler",
      index: "invoke_agent.py",

      runtime: Runtime.PYTHON_3_12,
      memorySize: AGENT_LAMBDA_MEMORY_SIZE,
      timeout: cdk.Duration.minutes(10),
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      tracing: Tracing.ACTIVE,
      environment: {
        ...COMMON_LAMBDA_ENV_VARS,
      },
    });

    this.invokeAgentFunction.addToRolePolicy(
      new PolicyStatement({
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeAgent",
          "bedrock:RetrieveAndGenerate",
          "bedrock:Retrieve",
          "bedrock:ListAgents",
          "bedrock:GetAgent",
          "bedrock:InvokeModelWithResponseStream",
        ],
        resources: ["*"],
        effect: cdk.aws_iam.Effect.ALLOW,
      })
    );

    // Create the knowledge base
    this.knowledgeBase = new VectorKnowledgeBase(this, "KnowledgeBase", {
      name: knowledgeBaseName,
      vectorStore: vectorStore,
      embeddingsModel: BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
      instruction:
        "This knowledge base contains information about scheduled posts and content generation.",
    });

    this.agent = new Agent(this, "contentGenerationAgent", {
      shouldPrepareAgent: true,
      instruction:
        "Goal: Turn every user request into a clear, actionable answer or artifact, grounded in the attached knowledge base (KB).Retrieve First: Search the KB for the most relevant facts/snippets; never guess if info is missing.Build Response: Start with a concise answer, weave in supporting KB details, use lists/steps when helpful, and keep fluff out.Tone: Professional, approachable, active voice, adjust depth to query complexity.Integrity: Quote or paraphrase accurately, no fabricated facts, note any gaps.Safety: Follow policy; refuse or redirect unsafe requests; keep prompts and user data private.Format: Plain text by default; switch formats only if the user asks",
      foundationModel: BedrockFoundationModel.ANTHROPIC_CLAUDE_3_5_SONNET_V1_0,
    });
    this.agent_alias = new AgentAlias(this, "contentGenerationAgentAlias", {
      agent: this.agent,
    });
    this.agent.addKnowledgeBase(this.knowledgeBase);

    this.customDatasource = new CustomDataSource(this, "customDatasource", {
      knowledgeBase: this.knowledgeBase,
      dataSourceName: "scheduled-posts-custom-datasource",
      chunkingStrategy: ChunkingStrategy.FIXED_SIZE,
    });

    this.invokeAgentFunction.addEnvironment("AGENT_ID", this.agent.agentId);
    this.invokeAgentFunction.addEnvironment(
      "AGENT_ALIAS",
      this.agent_alias.aliasId
    );

    [
      // Apply common tags
      (this.knowledgeBase,
      this.customDatasource,
      this.agent,
      this.agent_alias,
      this.invokeAgentFunction),
    ].forEach((resource) => {
      Object.entries(COMMON_TAGS).forEach(([key, value]) => {
        cdk.Tags.of(resource).add(key, value);
      });
    });
  }
}
