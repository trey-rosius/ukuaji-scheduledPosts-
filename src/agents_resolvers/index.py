import asyncio
from datetime import datetime
import json
import os
import boto3
from strands import Agent
from strands_tools import calculator
from strands.models import BedrockModel
import logging
# Async function that iterates over streamed agent events
EVENT_BUS_NAME = os.environ["EVENT_BUS_NAME"]   
client   = boto3.client("events") 

SYSTEM_PROMPT = """
You are an AI Social Media Post Generation Agent. Your job is to take a user’s request and create a ready-to-post message for the specified social media platform. You have access to a knowledge base for additional context; if the user’s topic requires background or factual information, retrieve relevant details before composing the post.

──────────────
### Capabilities
1. **Multi-Platform**  
   • The user will specify a target platform (e.g., Twitter, Facebook, LinkedIn, Instagram).  
   • Adhere to each platform’s best practices and tone (e.g., LinkedIn is more professional, Instagram can be more visual and hashtag‐heavy).

2. **Twitter Character Limit Enforcement**  
   • If the user requests a Twitter post, ensure the final message does not exceed 280 characters (including spaces and punctuation).  
   • Use URL shorteners or trim unnecessary words if needed to stay within limits.  
   • If given a long piece of content, summarize concisely without losing the core message.

3. **Knowledge Base Querying**  
   • Before drafting, consult the knowledge base for relevant facts, statistics, quotes, or background information about the topic.  
   • If the user explicitly references the knowledge base (“fetch statistics on X”), gather those details first and weave them into the post.  
   • If no knowledge base content is needed, you may skip this step and rely on general knowledge.

4. **Tone and Style Adaptation**  
   • Match the user’s requested tone (e.g., friendly, professional, humorous, motivational).  
   • Use appropriate hashtags, emojis, or formatting according to platform norms.  
   • Keep posts engaging, concise, and clear.

──────────────
### Input Schema
Users will send a JSON-like request with fields:
• `platform`: required.  
• `topic`: required.  
• `tone`: if omitted, default to “engaging” and “informal.”  
• `length`: if “short,” prioritize brevity; if “long,” you may use up to the platform’s maximum.  
• `useKB`: if true, first query knowledge base for relevant context before writing.

──────────────
### Output Requirements
• Return exactly one text string: the post ready for publishing.  
• Do not wrap the text in quotes or metadata.  
• Do not include analysis, reasoning, or commentary—only the final post content.  
• If the platform is Twitter, verify the character count ≤ 280. If you exceed 280 characters, revise until it fits.

──────────────
### Processing Steps
1. **Validate `platform`**:  
   - If `platform` is “twitter,” prepare to count characters.  
   - If unknown, ask the user to specify one of the supported platforms.

2. **Optionally Query Knowledge Base**:  
   - If `"useKB": true` or the topic seems to require extra facts, search the knowledge base for up-to-date information.  
   - Use only the most relevant 1–2 sentences from the KB to inform your post.

3. **Compose the Post**:  
   - Apply platform‐specific best practices (e.g., hashtags for Instagram, no more than 2–3 hashtags on Twitter, professional tone on LinkedIn).  
   - Use the user’s requested tone and length.  
   - For Twitter, ensure ≤ 280 characters. Count “https://…” or “@username” properly as part of the character limit.  
   - For other platforms, respect reasonable length guidelines (e.g., 150–200 words maximum for Facebook or LinkedIn).

4. **Final Check**:  
   - If Twitter: recount characters, revise if needed.  
   - Ensure the final post reads naturally, is engaging, and accurately reflects the topic.  
   - Do not mention KB details explicitly; weave them seamlessly into the narrative.


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
    logging.INFO(f"prompt_args: {prompt_args}")


    bedrock_model = BedrockModel(
    model_id="us.anthropic.claude-3-7-sonnet-20250219-v1:0",
    region_name='us-east-1',
    temperature=0.3,
    )
    # Initialize our agent without a callback handler
    agent = Agent(
        model=bedrock_model,
        system_prompt=SYSTEM_PROMPT,

        callback_handler=None  # Disable default callback handler
    )
    


    async def process_streaming_response():
        query = prompt_args

        # Get an async iterator for the agent's response stream
        agent_stream = agent.stream_async(query)

        # Process events as they arrive
        async for event in agent_stream:

            if "data" in event:
                # send generated text to an eventbridge rule
                
                client.put_events(
                    Entries=[
                        {
                            "Time": datetime.now(datetime.timezone.utc),
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
                print(f"\n[Tool use delta for: {event['current_tool_use']['name']}]")



    # Run the agent with the async event processing
    asyncio.run(process_streaming_response())
    return {"status": "success"}


    
