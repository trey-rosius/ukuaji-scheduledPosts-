import { PineconeVectorStore } from "@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/pinecone";

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { ITable } from "aws-cdk-lib/aws-dynamodb";

import {
  BedrockFoundationModel,
  ChunkingStrategy,
  S3DataSource,
  VectorKnowledgeBase,
} from "@cdklabs/generative-ai-cdk-constructs/lib/cdk-lib/bedrock";

export class knowledgeBaseConstruct extends Construct {
  public readonly knowledgeBase: VectorKnowledgeBase;
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id);

    const pinecone_vectorstore = new PineconeVectorStore({
      connectionString:
        "https://ai-learning-app-kb-pbfqwcb.svc.aped-4627-b74a.pinecone.io",
      credentialsSecretArn:
        "arn:aws:secretsmanager:us-east-1:132260253285:secret:bedrock-pinecone-apikey-aToyuv",
      textField: "text",
      metadataField: "metadata",
      namespace: "ai-multitenant-app-namespace",
    });

    this.knowledgeBase = new VectorKnowledgeBase(
      this,
      "AIMultiTenantknowledgeBase",
      {
        name: "AIMultiTenantknowledgeBase",
        vectorStore: pinecone_vectorstore,

        embeddingsModel: BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
        instruction: "fill this in ",
      }
    );

    const ai_multitenant_bucket = new cdk.aws_s3.Bucket(
      this,
      "AIMultiTenantBucket",
      {
        versioned: false,
        encryption: cdk.aws_s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: cdk.aws_s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );

    new S3DataSource(this, "knowledgebaseS3Datasource", {
      bucket: ai_multitenant_bucket,
      knowledgeBase: this.knowledgeBase,

      dataSourceName: "ai-multitenant-s3-datasource",
      chunkingStrategy: ChunkingStrategy.FIXED_SIZE,
    });
  }
}
