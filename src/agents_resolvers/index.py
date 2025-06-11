import asyncio
from datetime import datetime
import json
import os
import boto3
from strands import Agent
from strands_tools import use_llm, memory
from strands.models import BedrockModel
import logging
# Async function that iterates over streamed agent events
EVENT_BUS_NAME = os.environ["EVENT_BUS_NAME"]  
client   = boto3.client("events") 
STRANDS_KNOWLEDGE_BASE_ID=os.environ["STRANDS_KNOWLEDGE_BASE_ID"] 
SYSTEM_PROMPT = """
You are an AI Social Media Post Scheduler Agent designed to create insightful, engaging, and relevant social media posts tailored to user queries. Your responses must always be:

Relevant: Clearly address the core intent and context provided by the user.

Insightful: Include unique insights, compelling ideas, or interesting perspectives that add value and capture audience interest.

Concise and Engaging: Posts should be clear, concise, and tailored for the platform's typical audience and content style.

Platform-Specific: Customize your approach to suit specific social media platforms (e.g., Twitter character limit, LinkedIn's professional tone, Instagram's visual engagement).

Reasoning Process

When generating a post:

Clarify Intent: Identify the user's primary goal or message.

Contextual Integration: Pull relevant details and context from any provided knowledge base or content reference.

Audience Consideration: Tailor the language and tone to the intended audience's demographics, preferences, and platform norms.

Structure and Flow: Craft an engaging opening, insightful main content, and clear call-to-action or conclusion.

Guardrails

Do not generate misleading or exaggerated claims.

Ensure all content is respectful, appropriate, and inclusive.

Avoid ambiguous or vague wording; strive for clarity and precision.

Adhere strictly to platform-specific constraints, such as character limits or formatting guidelines.

Always reflect thoughtfully, ensuring each generated post is an exemplary piece of content designed to engage, inform, and inspire social media audiences.
"""

# Enables Strands debug log level
logging.getLogger("strands").setLevel(logging.DEBUG)

# Sets the logging format and streams logs to stderr
logging.basicConfig(
    format="%(levelname)s | %(name)s | %(message)s",
    handlers=[logging.StreamHandler()]
)
def lambda_handler(event, context):

    prompt_args = event.get("input", {})
    logging.info(f"prompt_args: {prompt_args}")
    logging.info(f"prompt_args: {prompt_args.get("topic","")}")

    topic = prompt_args.get("topic","")


    bedrock_model = BedrockModel(
    model_id="us.anthropic.claude-3-7-sonnet-20250219-v1:0",
    region_name='us-east-1',
    temperature=0.3,
    )
    # Initialize our agent without a callback handler
    agent = Agent(
        model=bedrock_model,
        system_prompt=SYSTEM_PROMPT,
        
        callback_handler=None,
        
    )
    # Run the agent with the async event processing
    asyncio.run(process_streaming_response(agent,topic))


    return {"status": "success"}
    


async def process_streaming_response(agent:Agent,topic:str):
   

        # Get an async iterator for the agent's response stream
        agent_stream = agent.stream_async(topic)

        # Process events as they arrive
        async for event in agent_stream:

            if "data" in event:
                # send generated text to an eventbridge rule
                logging.info(f"\n[Generated text for: {event['data']}]")
                
                client.put_events(
                    Entries=[
                        {
                            "Time": datetime.utcnow(),
                             "Source":"generatedText.response",
                             "DetailType":  "generated.text",
                            "Detail": json.dumps({
                                        "input":   event["data"]
                                    }),
                            'EventBusName': EVENT_BUS_NAME,
                           
                        },
                    ],
            
                )
                
            elif "current_tool_use" in event and event["current_tool_use"].get("name"):
                # Print tool usage information
               logging.info(f"\n[Tool use delta for: {event['current_tool_use']['name']}]")



  
    


    
