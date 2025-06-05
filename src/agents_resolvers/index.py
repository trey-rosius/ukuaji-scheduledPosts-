import asyncio
from datetime import datetime
import json
import os
import boto3
from strands import Agent
from strands_tools import calculator
from strands.models import BedrockModel
# Async function that iterates over streamed agent events
EVENT_BUS_NAME = os.environ["EVENT_BUS_NAME"]   
client   = boto3.client("events") 
def handler(event,context):

    args = event.get("arguments", {})

    user_input = args.get("input") 
    user_id    = args.get("userId") 

    bedrock_model = BedrockModel(
    model_id="us.anthropic.claude-3-7-sonnet-20250219-v1:0",
    region_name='us-east-1',
    temperature=0.3,
    )
    # Initialize our agent without a callback handler
    agent = Agent(
        model=bedrock_model,
        tools=[calculator],
        callback_handler=None  # Disable default callback handler
    )
    


    async def process_streaming_response():
        query = "What is 25 * 48 and explain the calculation"

        # Get an async iterator for the agent's response stream
        agent_stream = agent.stream_async(query)

        # Process events as they arrive
        async for event in agent_stream:

            if "data" in event:
                # Print text chunks as they're generated
                print(event["data"], end="", flush=True)
                
                response = client.put_events(
                    Entries=[
                        {
                            "Time": datetime.utcnow(),
                             "Source":"generatedText.response",
                             "DetailType":  "generated.text",
                            "Detail": json.dumps({
                                        "input":   event["data"],
                                        "userId":  "userId"
                                    }),
                            'EventBusName': EVENT_BUS_NAME,
                           
                        },
                    ],
            
                )
                
            elif "current_tool_use" in event and event["current_tool_use"].get("name"):
                # Print tool usage information
                print(f"\n[Tool use delta for: {event['current_tool_use']['name']}]")






    # Run the agent with the async event processing
    asyncio.run(process_streaming_response())
    return "true"
    
