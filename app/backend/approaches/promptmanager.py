import json
import pathlib
import logging

import prompty
from openai.types.chat import ChatCompletionMessageParam


class PromptManager:

    def load_prompt(self, path: str):
        raise NotImplementedError

    def load_tools(self, path: str):
        raise NotImplementedError

    def render_prompt(self, prompt, data) -> list[ChatCompletionMessageParam]:
        raise NotImplementedError


class PromptyManager(PromptManager):

    PROMPTS_DIRECTORY = pathlib.Path(__file__).parent / "prompts"

    def load_prompt(self, path: str):
        return prompty.load(self.PROMPTS_DIRECTORY / path)

    def load_tools(self, path: str):
        return json.loads(open(self.PROMPTS_DIRECTORY / path).read())

    def render_prompt(self, prompt, data) -> list[ChatCompletionMessageParam]:
        try:
            return prompty.prepare(prompt, data)
        except ValueError as e:
            if "Invalid prompt format" in str(e):
                # Log the error and clean the data
                import logging
                logging.error(f"Invalid prompt format detected. Data: {data}")
                
                # Clean the past_messages to remove any malformed entries
                if isinstance(data, dict) and "past_messages" in data:
                    cleaned_messages = []
                    for msg in data["past_messages"]:
                        if isinstance(msg, dict) and "content" in msg and msg["content"]:
                            cleaned_messages.append(msg)
                    data["past_messages"] = cleaned_messages
                    logging.info(f"Cleaned past_messages, kept {len(cleaned_messages)} valid messages")
                    
                    # Retry with cleaned data
                    return prompty.prepare(prompt, data)
            raise
