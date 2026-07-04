from sentence_transformers import SentenceTransformer
from typing import List
from app.config import settings
import torch

class EmbeddingService:
    _model = None

    @classmethod
    def get_model(cls) -> SentenceTransformer:
        """
        Lazily loads the SentenceTransformer model and stores it as a class singleton.
        Determines whether MPS (Apple Silicon GPU) or CPU is best for performance.
        """
        if cls._model is None:
            # Auto-detect best device for Mac
            device = "cpu"
            if torch.backends.mps.is_available():
                device = "mps"
            elif torch.cuda.is_available():
                device = "cuda"
            
            # Load the model
            cls._model = SentenceTransformer(settings.EMBEDDING_MODEL_NAME, device=device)
        return cls._model

    @classmethod
    def get_embedding(cls, text: str) -> List[float]:
        """
        Generates a vector embedding for a single text query.
        """
        model = cls.get_model()
        embedding = model.encode(text, convert_to_numpy=True)
        return embedding.tolist()

    @classmethod
    def get_embeddings(cls, texts: List[str]) -> List[List[float]]:
        """
        Generates vector embeddings for a list of text chunks in batch.
        """
        if not texts:
            return []
        model = cls.get_model()
        embeddings = model.encode(texts, convert_to_numpy=True)
        return embeddings.tolist()
