"""
agent_util.py
-----------
Reusable helper for saving arbitrary text to a Knowledge Base
via a Strands Agent.

Usage
~~~~~
from agent_util import KnowledgeBaseSaver

saver = KnowledgeBaseSaver(
    knowledge_base_id=os.environ["STRANDS_KNOWLEDGE_BASE_ID"]
)

result = saver.store_text("any unstructured text here")
print(result)
"""

from __future__ import annotations
from typing import Any, Dict

from strands import Agent
from strands_tools import use_llm, memory
from strands.models import BedrockModel

# One-time system prompt for every agent you spawn
SYSTEM_PROMPT = """
You are a helpful “Knowledge-Saver” agent.

• Your job: take whatever unstructured text the user sends and turn it into a
  single JSON record ready to store in a knowledge base.

• No extra commentary or formatting. One user message → one JSON reply.
"""


class KnowledgeBaseSaver:
    """Create once, then call :py:meth:`store_text` from any module."""

    def __init__(
        self,
        knowledge_base_id: str,
        *,
        region: str = "us-east-1",
        model_id: str = "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
        temperature: float = 0.3,
        bypass_tool_consent: bool | str = True,
    ) -> None:
        self.knowledge_base_id = knowledge_base_id
        self.bypass_tool_consent = str(bypass_tool_consent)

        # Initialise Bedrock model & Agent only once per container
        self._bedrock_model = BedrockModel(
            model_id=model_id,
            region_name=region,
            temperature=temperature,
        )

        self._agent = Agent(
            model=self._bedrock_model,
            system_prompt=SYSTEM_PROMPT,
            tools=[use_llm, memory],
            callback_handler=None,  # no streaming / UI callbacks in Lambda
        )

   
    def store_text(self, text: str, *, metadata: Dict[str, Any] | None = None) -> dict:
        """
        Persist *text* into the configured Strands knowledge-base.

        Parameters
        ----------
        text : str
            Raw text to store.
        metadata : dict, optional
            Extra key-value pairs to attach to the record (tags, source, etc.).

        Returns
        -------
        dict
            The tool-returned payload (e.g. record ID, status).
        """
        payload: dict[str, Any] = {
            "action": "store",
            "content": text,
            "BYPASS_TOOL_CONSENT": self.bypass_tool_consent,
            "region_name": 'us-east-1',
            "STRANDS_KNOWLEDGE_BASE_ID": self.knowledge_base_id,
        }
        if metadata:
            payload["metadata"] = metadata

        return self._agent.tool.memory(**payload)
