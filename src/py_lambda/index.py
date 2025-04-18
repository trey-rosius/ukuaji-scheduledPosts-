import json
import os
import boto3
from aws_lambda_powertools import Logger, Tracer
from random import randint

bedrock_client = boto3.client("bedrock-runtime",region_name="us-east-1")
eventbridge_client = boto3.client("events", region_name="us-east-1")
eventbus_name = os.environ.get("EVENT_BUS_NAME")
logger = Logger(service="generate_images_lambda")
tracer = Tracer(service="generate_images_lambda")
def generate_images_handler(event,context):
    logger.info(f"Received event: {json.dumps(event, indent=2)}")
    try:





        # Configure the inference parameters.
        inference_params = {
            "taskType": "TEXT_IMAGE",
            "textToImageParams": {
                "text": "whimsical and ethereal soft-shaded story illustration: A woman in a large hat stands at the ship's railing looking out across the ocean",  # A description of the image you want
                "negativeText": "clouds, waves",  # List things to avoid
            },
            "imageGenerationConfig": {
                "numberOfImages": 3,  # Number of variations to generate. 1 to 5.
                "quality": "standard",  # Allowed values are "standard" and "premium"
                "width": 1280,  # See README for supported output resolutions
                "height": 720,  # See README for supported output resolutions
                "cfgScale": 7.0,  # How closely the prompt will be followed
                "seed": randint(0, 858993459),  # Use a random seed
            },
        }
        body_json = json.dumps(inference_params, indent=2)
        # Make the API call
        response = bedrock_client.invoke_model(
            body=body_json,
            modelId="amazon.nova-canvas-v1:0",
            accept="application/json",
            contentType="application/json",
        )

        response_body = json.loads(response.get("body").read())
        logger.info(response_body)
        eventbridge_response = eventbridge_client.put_events(
            Entries=[
                {
                    "Source": "generatedImages.response",
                    "DetailType": "generated.images",
                    "Detail": json.dumps(response_body["images"]),
                    "EventBusName": eventbus_name  # Or your custom bus name
                }
            ]
        )

        logger.info(f"EventBridge response: {eventbridge_response}")


        ## send response body in eventbridge 
        

        return True

      
       
    except Exception as e:
        logger.error(f"Unhandled error: {e}")
        return "an error occured"







