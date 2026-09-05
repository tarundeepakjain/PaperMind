from google import genai
from google.genai import types
from typing import List
from app.config import settings

class EmbeddingService:
    _client: genai.Client | None = None

    @classmethod
    def _get_client(cls) -> genai.Client:
        """
        Returns a cached Gemini API client instance.
        """
        if cls._client is None:
            cls._client = genai.Client(api_key=settings.GEMINI_API_KEY)
        return cls._client

    @classmethod
    async def get_embedding(cls, text: str) -> List[float]:
        """
        Generates a 384-dimensional vector embedding for a single text query
        using Gemini's gemini-embedding-001 API asynchronously (non-blocking).
        """
        client = cls._get_client()
        try:
            response = await client.aio.models.embed_content(
                model="gemini-embedding-001",
                contents=text,
                config=types.EmbedContentConfig(
                    output_dimensionality=384
                )
            )
            # Response contains a list of Embeddings under `embeddings`
            embedding_values = response.embeddings[0].values
            return embedding_values
        except Exception as e:
            print(f"Error generating embedding from Gemini API: {e}")
            # Fallback to zero vector if API call fails
            return [0.0] * 384

    @classmethod
    async def get_embeddings(cls, texts: List[str]) -> List[List[float]]:
        """
        Generates 384-dimensional vector embeddings for a list of text chunks in batch asynchronously.
        """
        if not texts:
            return []
        
        client = cls._get_client()
        try:
            response = await client.aio.models.embed_content(
                model="gemini-embedding-001",
                contents=texts,
                config=types.EmbedContentConfig(
                    output_dimensionality=384
                )
            )
            return [emb.values for emb in response.embeddings]
        except Exception as e:
            print(f"Error generating batch embeddings from Gemini API: {e}")
            # Fallback to zero vectors if API call fails
            return [[0.0] * 384 for _ in texts]

