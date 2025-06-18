import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { KnowledgeBaseConstructProps } from "../types";
import {
  COMMON_TAGS,
  DEFAULT_REMOVAL_POLICY,
  DEFAULT_REGION,
} from "../constants";
import {
  BedrockFoundationModel,
  ChunkingStrategy,
  S3DataSource,
  CustomDataSource,
  VectorKnowledgeBase,
} from "@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/bedrock";
import { PineconeVectorStore } from "@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/pinecone";

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

    // Create the knowledge base
    this.knowledgeBase = new VectorKnowledgeBase(this, "KnowledgeBase", {
      name: knowledgeBaseName,
      vectorStore: vectorStore,
      embeddingsModel: BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
      instruction:
        "This knowledge base contains information about scheduled posts and content generation.",
    });

    this.customDatasource = new CustomDataSource(this, "customDatasource", {
      knowledgeBase: this.knowledgeBase,
      dataSourceName: "scheduled-posts-custom-datasource",
      chunkingStrategy: ChunkingStrategy.FIXED_SIZE,
    });

    // Apply common tags
    [this.knowledgeBase, this.customDatasource].forEach((resource) => {
      Object.entries(COMMON_TAGS).forEach(([key, value]) => {
        cdk.Tags.of(resource).add(key, value);
      });
    });
  }
}
