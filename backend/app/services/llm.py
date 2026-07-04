from google import genai
from google.genai import types
from typing import List, Dict, Any
from app.config import settings

class LLMService:
    _client: genai.Client | None = None

    @classmethod
    def _get_client(cls) -> genai.Client:
        """
        Returns a cached Gemini API client, creating one if needed.
        Uses the new google-genai SDK (replaces deprecated google-generativeai).
        """
        if cls._client is None:
            cls._client = genai.Client(api_key=settings.GEMINI_API_KEY)
        return cls._client

    @classmethod
    def generate_standalone_query(cls, query: str, chat_history: List[Dict[str, str]]) -> str:
        """
        Reformulates the user's latest query to be standalone and self-contained
        by incorporating relevant context from the chat history.
        This is crucial for semantic search in multi-turn conversations.
        """
        if not chat_history:
            return query

        client = cls._get_client()

        # Format conversation history
        history_str = ""
        for msg in chat_history:
            role = "User" if msg.get("sender") == "user" else "Assistant"
            content = msg.get("content", "")
            history_str += f"{role}: {content}\n"

        prompt = f"""Given the following conversation history and a follow-up question, rewrite the follow-up question to be a standalone search query that contains all necessary context (like names, subjects, companies, etc.).
Do NOT answer the question. Just output the standalone query.

Conversation History:
{history_str}
Follow-up Question: {query}

Standalone Query:"""

        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            condensed = response.text.strip()
            return condensed if condensed else query
        except Exception as e:
            # Fallback to the original query if LLM call fails
            print(f"Error condensing query: {e}")
            return query

    @classmethod
    def generate_answer(
        cls,
        query: str,
        context_chunks: List[Dict[str, Any]],
        chat_history: List[Dict[str, str]]
    ) -> str:
        """
        Generates a grounded RAG response based strictly on the retrieved context chunks.
        Includes chat history for conversation context.
        """
        client = cls._get_client()

        # Format the source chunks with unique numbers for the model to cite
        sources_text = ""
        for idx, chunk in enumerate(context_chunks):
            source_id = idx + 1
            filename = chunk.get("filename", "Unknown Document")
            page_num = chunk.get("page_number", "?")
            content = chunk.get("content", "")
            sources_text += f"Source [{source_id}] (Document: {filename}, Page: {page_num}):\n{content}\n\n"

        # Build conversation history context
        history_text = ""
        for msg in chat_history:
            role = "User" if msg.get("sender") == "user" else "Assistant"
            content = msg.get("content", "")
            history_text += f"{role}: {content}\n"

        system_instruction = """You are an expert AI PDF Research Assistant named PaperMind.
Your goal is to answer the user's question accurately using ONLY the provided Source chunks.
Follow these strict instructions:
1. Ground your answer completely in the Source chunks. Do not assume or extrapolate beyond the text.
2. If the Source chunks do not contain enough information to answer the question, state clearly that you cannot find the answer in the uploaded documents. Do not hallucinate or use external knowledge.
3. For every claim, fact, or quote you use in your response, cite the Source number inline (e.g. [1], [2]).
4. Structure your response clearly using markdown formatting.
5. If the user asks general pleasantries (e.g. "hi", "how are you"), respond politely without requiring source citations, but keep the focus on helping them research their PDFs.
"""

        prompt = f"""Source Chunks:
{sources_text}

Conversation History (if any):
{history_text}

User's Question:
{query}

Answer:"""

        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.2,  # Low temperature for factual, deterministic responses
                ),
            )
            return response.text.strip()
        except Exception as e:
            return f"An error occurred while generating the response: {str(e)}"
