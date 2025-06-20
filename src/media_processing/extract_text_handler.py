import json
import logging
import os
import boto3
from agent_util import KnowledgeBaseSaver

from pathlib import Path
from urllib.parse import urlparse, unquote_plus
from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.utilities.typing import LambdaContext
s3 = boto3.client("s3")
# Initialize powertools
logger = Logger()
tracer = Tracer()
metrics = Metrics()

from urllib.parse import urlparse



saver = KnowledgeBaseSaver(
    knowledge_base_id=os.environ["STRANDS_KNOWLEDGE_BASE_ID"],
    bypass_tool_consent=os.environ.get("BYPASS_TOOL_CONSENT", "True"),
)

def bucket_and_key_from_s3_uri(uri: str) -> tuple[str, str]:
    """
    Return (bucket, key) from any valid S3 HTTPS URL.
    Supports both virtual-host and path-style formats.
    """
    p = urlparse(uri)

    # virtual-host style → bucket is in the host name
    #    e.g. my-bucket.s3.us-east-1.amazonaws.com
    if ".s3." in p.netloc:
        bucket = p.netloc.split(".s3")[0]
        key    = p.path.lstrip("/")          # drop leading '/'
        return bucket, key

    # path style → bucket is first path segment
    #    e.g. s3.us-east-1.amazonaws.com/my-bucket/some/key.txt
    path_parts = p.path.lstrip("/").split("/", 1)
    if len(path_parts) < 2:
        raise ValueError(f"Cannot parse bucket/key from {uri}")
    bucket, key = path_parts[0], path_parts[1]
    return bucket, key


@logger.inject_lambda_context(log_event=True)
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def lambda_handler(event, context: LambdaContext):
  
    logger.info("Received extracted text event")
    
    try:
        # Log the entire event for debugging
        logger.debug(f"Event received: {json.dumps(event)}")

        uri = event["transcriptionFileUri"]
        bucket, key = bucket_and_key_from_s3_uri(uri)
        logger.append_keys(bucket=bucket, key=key)

        obj  = s3.get_object(Bucket=bucket, Key=key)
        data = json.loads(obj["Body"].read())

        transcript = data['results']['transcripts'][0]['transcript']

        logger.info(f"loaded data {transcript}")

        result = saver.store_text(
            transcript,
            metadata={"source": "textract-lambda", "s3_key": key,"userId":"UserID"},
        )
        logger.info("Stored transcript in KB: %s", result)
   
        
    except Exception as e:
        logger.exception(f"Error processing extracted text: {e}")
        logger.exception("Error processing extracted text")
       
    
