from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from app.auth import security, get_current_user
from app.services.embeddings import EmbeddingService
from app.services.llm import LLMService
import app.db as db
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

router = APIRouter(
    prefix="/chats",
    tags=["chats"]
)

class CreateChatRequest(BaseModel):
    title: Optional[str] = Field(default=None, description="Title of the chat session")

class MessageRequest(BaseModel):
    message: str = Field(..., description="User message content")
    document_ids: Optional[List[str]] = Field(default=None, description="Optional document UUIDs to filter search context")

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_chat(
    req: CreateChatRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Creates a new chat session.
    """
    user = get_current_user(credentials)
    title = req.title or "New Research Chat"
    try:
        chat = db.create_chat(user["id"], title)
        return chat
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create chat session: {str(e)}"
        )

@router.get("", response_model=List[Dict[str, Any]])
async def list_chats(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Lists all chat sessions belonging to the authenticated user.
    """
    user = get_current_user(credentials)
    try:
        chats = db.get_chats_by_user(user["id"])
        return chats
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve chat sessions: {str(e)}"
        )

class RenameChatRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=100, description="New title for the chat session")

@router.delete("/{chat_id}")
async def delete_chat(
    chat_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Deletes a chat session and its complete message history.
    """
    user = get_current_user(credentials)
    try:
        # Check ownership
        chat = db.get_chat(chat_id, user["id"])
        if not chat:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat not found or does not belong to you."
            )
        
        db.delete_chat(chat_id, user["id"])
        return {"message": "Chat session deleted successfully.", "chat_id": chat_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete chat session: {str(e)}"
        )

@router.patch("/{chat_id}")
async def rename_chat(
    chat_id: str,
    req: RenameChatRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Renames a chat session title.
    """
    user = get_current_user(credentials)
    try:
        updated = db.rename_chat(chat_id, user["id"], req.title)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat not found or does not belong to you."
            )
        return updated
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to rename chat session: {str(e)}"
        )


@router.get("/{chat_id}/messages", response_model=List[Dict[str, Any]])
async def get_messages(
    chat_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Retrieves message history for a specific chat session.
    """
    user = get_current_user(credentials)
    try:
        # Verify ownership
        chat = db.get_chat(chat_id, user["id"])
        if not chat:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat not found or does not belong to you."
            )
        
        messages = db.get_messages_by_chat(chat_id, user["id"])
        return messages
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve message history: {str(e)}"
        )

@router.post("/{chat_id}/message")
async def send_message(
    chat_id: str,
    req: MessageRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Handles sending a user message, executing the RAG pipeline, and generating response with citations.
    """
    user = get_current_user(credentials)
    
    # 1. Verify chat ownership
    try:
        chat = db.get_chat(chat_id, user["id"])
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database lookup failed: {str(e)}"
        )
        
    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found or does not belong to you."
        )

    # 2. Retrieve conversation history
    try:
        history_records = db.get_messages_by_chat(chat_id, user["id"])
        chat_history = [
            {"sender": r["sender"], "content": r["content"]}
            for r in history_records
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve chat history: {str(e)}"
        )

    # 3. Formulate standalone search query (incorporating chat context)
    try:
        standalone_query = LLMService.generate_standalone_query(
            query=req.message,
            chat_history=chat_history
        )
    except Exception as e:
        print(f"Error generating standalone query: {str(e)}")
        standalone_query = req.message

    # 4. Generate embeddings for semantic search
    try:
        query_embedding = EmbeddingService.get_embedding(standalone_query)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to embed query: {str(e)}"
        )

    # 5. Semantic similarity search across document chunks
    try:
        matching_chunks = db.query_similar_chunks(
            user_id=user["id"],
            query_embedding=query_embedding,
            match_threshold=0.25, # Default similarity threshold
            match_count=5,        # Retrieve top 5 matches
            filter_document_ids=req.document_ids
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Similarity search query failed: {str(e)}"
        )

    # 6. Generate grounded response from Gemini RAG
    try:
        answer = LLMService.generate_answer(
            query=req.message,
            context_chunks=matching_chunks,
            chat_history=chat_history
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"LLM generation failed: {str(e)}"
        )

    # 7. Format citations metadata
    citations = []
    for idx, chunk in enumerate(matching_chunks):
        citations.append({
            "source_number": idx + 1,
            "document_id": str(chunk["document_id"]),
            "filename": chunk["filename"],
            "page_number": chunk["page_number"],
            "content": chunk["content"]
        })

    # 8. Log conversation to database
    try:
        user_msg = db.log_message(
            chat_id=chat_id,
            sender="user",
            content=req.message,
            citations=[]
        )
        assistant_msg = db.log_message(
            chat_id=chat_id,
            sender="assistant",
            content=answer,
            citations=citations
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to log chat messages: {str(e)}"
        )

    return {
        "user_message": user_msg,
        "assistant_message": assistant_msg
    }
