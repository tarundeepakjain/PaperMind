import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from typing import List, Dict, Any, Optional
from app.config import settings
import json

# Global pool variable. Initialized during main.py startup event.
pool: Optional[ConnectionPool] = None

def init_db_pool():
    """
    Initializes the psycopg connection pool using the DATABASE_URL.
    """
    global pool
    if pool is None:
        # Pydantic validates DATABASE_URL is present
        pool = ConnectionPool(
            conninfo=settings.DATABASE_URL,
            min_size=1,
            max_size=10,
            open=True,
            name="PaperMindPool"
        )
    return pool

def close_db_pool():
    """
    Closes the connection pool on application shutdown.
    """
    global pool
    if pool is not None:
        pool.close()
        pool = None

# Context manager to get database connection
class DatabaseConnection:
    def __enter__(self) -> psycopg.Connection:
        global pool
        if pool is None:
            init_db_pool()
        self.conn = pool.getconn()
        # Set row_factory to dict_row to return dicts instead of tuples
        self.conn.row_factory = dict_row
        return self.conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        global pool
        if pool is not None:
            # Commit if no exception occurred, else rollback
            if exc_type is None:
                self.conn.commit()
            else:
                self.conn.rollback()
            pool.putconn(self.conn)

# --- Database Operations ---

# 1. Documents Operations

def create_document(user_id: str, filename: str, file_path: str, file_size: int) -> Dict[str, Any]:
    with DatabaseConnection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.documents (user_id, filename, file_path, file_size)
                VALUES (%s, %s, %s, %s)
                RETURNING id, user_id, filename, file_path, file_size, created_at;
                """,
                (user_id, filename, file_path, file_size)
            )
            return cur.fetchone()

def get_documents_by_user(user_id: str) -> List[Dict[str, Any]]:
    with DatabaseConnection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, filename, file_path, file_size, created_at FROM public.documents WHERE user_id = %s ORDER BY created_at DESC;",
                (user_id,)
            )
            return cur.fetchall()

def get_document(document_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    with DatabaseConnection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, filename, file_path, file_size, created_at FROM public.documents WHERE id = %s AND user_id = %s;",
                (document_id, user_id)
            )
            return cur.fetchone()

def rename_document(document_id: str, user_id: str, new_filename: str) -> Optional[Dict[str, Any]]:
    with DatabaseConnection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE public.documents 
                SET filename = %s 
                WHERE id = %s AND user_id = %s 
                RETURNING id, filename, file_path, file_size, created_at;
                """,
                (new_filename, document_id, user_id)
            )
            return cur.fetchone()

def delete_document(document_id: str, user_id: str) -> bool:
    with DatabaseConnection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM public.documents WHERE id = %s AND user_id = %s RETURNING id;",
                (document_id, user_id)
            )
            return cur.fetchone() is not None


# 2. Document Chunks Operations

def insert_document_chunks(document_id: str, chunks: List[Dict[str, Any]], embeddings: List[List[float]]):
    """
    Inserts a list of document chunks and their corresponding embeddings into the database.
    """
    if len(chunks) != len(embeddings):
        raise ValueError("The number of chunks must match the number of embeddings.")
        
    with DatabaseConnection() as conn:
        with conn.cursor() as cur:
            # Construct parameters for bulk insert
            args_list = []
            for idx, chunk in enumerate(chunks):
                args_list.append((
                    document_id,
                    chunk["page_number"],
                    chunk["chunk_index"],
                    chunk["content"],
                    embeddings[idx] # passed directly as a float list, cast as vector in SQL query
                ))
            
            # Execute bulk insertion
            cur.executemany(
                """
                INSERT INTO public.document_chunks (document_id, page_number, chunk_index, content, embedding)
                VALUES (%s, %s, %s, %s, %s::vector);
                """,
                args_list
            )

def query_similar_chunks(
    user_id: str,
    query_embedding: List[float],
    match_threshold: float = 0.3,
    match_count: int = 5,
    filter_document_ids: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Queries similar chunks using vector cosine similarity.
    Integrates user-id filtering for RLS security and optional document-id filtering.
    """
    with DatabaseConnection() as conn:
        with conn.cursor() as cur:
            # We call the pgvector database function we created
            cur.execute(
                """
                SELECT id, document_id, page_number, chunk_index, content, similarity
                FROM match_chunks(%s::vector, %s, %s, %s, %s);
                """,
                (
                    query_embedding, 
                    match_threshold, 
                    match_count, 
                    user_id, 
                    filter_document_ids
                )
            )
            results = cur.fetchall()
            
            # Join with documents to retrieve original filenames for UI citations
            if results:
                doc_ids = list(set(r["document_id"] for r in results))
                cur.execute(
                    "SELECT id, filename FROM public.documents WHERE id = ANY(%s);",
                    (doc_ids,)
                )
                doc_map = {doc["id"]: doc["filename"] for doc in cur.fetchall()}
                
                for r in results:
                    r["filename"] = doc_map.get(r["document_id"], "Unknown Document")
            
            return results


# 3. Chat & Message Operations

def create_chat(user_id: str, title: str) -> Dict[str, Any]:
    with DatabaseConnection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO public.chats (user_id, title) VALUES (%s, %s) RETURNING id, user_id, title, created_at;",
                (user_id, title)
            )
            return cur.fetchone()

def get_chats_by_user(user_id: str) -> List[Dict[str, Any]]:
    with DatabaseConnection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, title, created_at FROM public.chats WHERE user_id = %s ORDER BY created_at DESC;",
                (user_id,)
            )
            return cur.fetchall()

def get_chat(chat_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    with DatabaseConnection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, title, created_at FROM public.chats WHERE id = %s AND user_id = %s;",
                (chat_id, user_id)
            )
            return cur.fetchone()

def delete_chat(chat_id: str, user_id: str) -> bool:
    with DatabaseConnection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM public.chats WHERE id = %s AND user_id = %s RETURNING id;",
                (chat_id, user_id)
            )
            return cur.fetchone() is not None

def rename_chat(chat_id: str, user_id: str, new_title: str) -> Optional[Dict[str, Any]]:
    with DatabaseConnection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE public.chats SET title = %s WHERE id = %s AND user_id = %s RETURNING id, title, created_at;",
                (new_title.strip(), chat_id, user_id)
            )
            return cur.fetchone()


def log_message(chat_id: str, sender: str, content: str, citations: List[Dict[str, Any]] = None) -> Dict[str, Any]:
    if citations is None:
        citations = []
    with DatabaseConnection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.messages (chat_id, sender, content, citations)
                VALUES (%s, %s, %s, %s)
                RETURNING id, chat_id, sender, content, citations, created_at;
                """,
                (chat_id, sender, content, json.dumps(citations))
            )
            res = cur.fetchone()
            # Parse json back for response formatting
            if res and isinstance(res["citations"], str):
                res["citations"] = json.loads(res["citations"])
            return res

def get_messages_by_chat(chat_id: str, user_id: str) -> List[Dict[str, Any]]:
    """
    Returns messages for a chat session, verifying first that the chat belongs to the user.
    """
    with DatabaseConnection() as conn:
        with conn.cursor() as cur:
            # Check ownership
            cur.execute("SELECT id FROM public.chats WHERE id = %s AND user_id = %s;", (chat_id, user_id))
            if not cur.fetchone():
                return []
                
            cur.execute(
                "SELECT id, sender, content, citations, created_at FROM public.messages WHERE chat_id = %s ORDER BY created_at ASC;",
                (chat_id,)
            )
            results = cur.fetchall()
            for r in results:
                # In PostgreSQL psycopg3, JSONB columns might be automatically decoded or returned as string/dict
                # We normalize it here
                if isinstance(r["citations"], str):
                    r["citations"] = json.loads(r["citations"])
            return results
