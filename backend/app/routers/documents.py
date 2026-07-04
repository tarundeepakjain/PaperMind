from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.security import HTTPAuthorizationCredentials
from app.auth import security, get_current_user
from app.services.pdf_processor import PDFProcessor
from app.services.embeddings import EmbeddingService
from app.config import settings
import app.db as db
import httpx
from typing import List, Dict, Any

router = APIRouter(
    prefix="/documents",
    tags=["documents"]
)

async def upload_to_supabase_storage(file_bytes: bytes, file_path: str, token: str) -> bool:
    """
    Uploads raw file bytes to Supabase Storage bucket 'documents'.
    Uses the user's JWT token for authorization to respect storage RLS policies.
    """
    url = f"{settings.SUPABASE_URL}/storage/v1/object/documents/{file_path}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/pdf"
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, content=file_bytes, headers=headers)
            if resp.status_code == 200:
                return True
            else:
                print(f"Supabase Storage Upload failed: {resp.status_code} - {resp.text}")
                return False
    except Exception as e:
        print(f"Exception during Supabase Storage Upload: {str(e)}")
        return False

async def delete_from_supabase_storage(file_path: str, token: str) -> bool:
    """
    Deletes the file from Supabase Storage bucket 'documents'.
    """
    url = f"{settings.SUPABASE_URL}/storage/v1/object/documents/{file_path}"
    headers = {
        "Authorization": f"Bearer {token}"
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.delete(url, headers=headers)
            return resp.status_code == 200
    except Exception as e:
        print(f"Exception during Supabase Storage Deletion: {str(e)}")
        return False

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Uploads a PDF document, extracts text, chunks it, generates embeddings,
    saves the metadata and chunks/embeddings to DB, and stores the PDF in Supabase Storage.
    """
    user = get_current_user(credentials)
    token = credentials.credentials

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF documents are supported."
        )

    # Read file content
    file_bytes = await file.read()
    file_size = len(file_bytes)

    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty."
        )

    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File is too large ({file_size / (1024*1024):.1f} MB). Maximum allowed size is 100 MB."
        )

    # Extract text and split into chunks
    try:
        chunks = PDFProcessor.extract_text_and_chunks(file_bytes)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to process PDF: {str(e)}"
        )

    if not chunks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No readable text found in the PDF."
        )

    # Generate embeddings for the chunks
    try:
        chunk_texts = [c["content"] for c in chunks]
        embeddings = EmbeddingService.get_embeddings(chunk_texts)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate embeddings: {str(e)}"
        )

    # Save document metadata to database
    storage_path = f"{user['id']}/{file.filename}"
    try:
        doc = db.create_document(
            user_id=user["id"],
            filename=file.filename,
            file_path=storage_path,
            file_size=file_size
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save document metadata: {str(e)}"
        )

    # Save chunks and embeddings to database
    try:
        db.insert_document_chunks(
            document_id=doc["id"],
            chunks=chunks,
            embeddings=embeddings
        )
    except Exception as e:
        # Rollback metadata insert if chunks insert fails
        db.delete_document(doc["id"], user["id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save document chunks and embeddings: {str(e)}"
        )

    # Upload PDF file to Supabase Storage
    # We do not fail the request if storage upload fails, but we include status in response
    storage_success = await upload_to_supabase_storage(file_bytes, storage_path, token)

    return {
        "message": "Document uploaded and processed successfully.",
        "document": {
            "id": doc["id"],
            "filename": doc["filename"],
            "file_size": doc["file_size"],
            "created_at": doc["created_at"]
        },
        "chunks_count": len(chunks),
        "storage_uploaded": storage_success
    }

@router.get("", response_model=List[Dict[str, Any]])
async def list_documents(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Lists all documents belonging to the authenticated user.
    """
    user = get_current_user(credentials)
    try:
        docs = db.get_documents_by_user(user["id"])
        return docs
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve documents: {str(e)}"
        )

@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Deletes a document, its chunks/embeddings (via cascade), and its raw PDF from storage.
    """
    user = get_current_user(credentials)
    token = credentials.credentials

    # Verify document exists and belongs to the user
    try:
        doc = db.get_document(document_id, user["id"])
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database query failed: {str(e)}"
        )

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found or does not belong to you."
        )

    # Delete from database (cascade deletes chunks automatically)
    try:
        deleted = db.delete_document(document_id, user["id"])
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete document: {str(e)}"
        )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not delete document from database."
        )

    # Delete from storage
    storage_deleted = await delete_from_supabase_storage(doc["file_path"], token)

    return {
        "message": "Document deleted successfully.",
        "document_id": document_id,
        "storage_deleted": storage_deleted
    }
