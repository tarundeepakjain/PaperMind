-- Enable the pgvector extension to support vector datasets
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable uuid-ossp for uuid generation if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Documents Table: Stores PDF file metadata
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- References auth.users (managed by Supabase)
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL, -- Storage bucket path
    file_size BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index user_id for fast queries
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);

-- 2. Document Chunks Table: Stores extracted text chunks and their embeddings
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(384) NOT NULL, -- matching 'all-MiniLM-L6-v2' (384 dimensions)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index document_id for cascading deletion and document-specific searches
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON public.document_chunks(document_id);

-- Create an HNSW index for fast vector similarity search (uses Cosine Distance)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw 
ON public.document_chunks 
USING hnsw (embedding vector_cosine_ops);

-- 3. Chats Table: Stores conversation headers
CREATE TABLE IF NOT EXISTS public.chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- References auth.users
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chats_user_id ON public.chats(user_id);

-- 4. Messages Table: Stores the user/assistant chat history
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    sender TEXT NOT NULL CHECK (sender IN ('user', 'assistant')),
    content TEXT NOT NULL,
    citations JSONB DEFAULT '[]'::jsonb, -- stores citation metadata (filename, page, snippet)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON public.messages(chat_id);

-- 5. Match Chunks SQL Function: Performs semantic similarity search
-- Filters by user_id to guarantee security and optionally filters by selected documents.
CREATE OR REPLACE FUNCTION match_chunks (
  query_embedding VECTOR(384),
  match_threshold FLOAT,
  match_count INT,
  filter_user_id UUID,
  filter_document_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  page_number INT,
  chunk_index INT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.page_number,
    dc.chunk_index,
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM
    public.document_chunks dc
  JOIN
    public.documents d ON dc.document_id = d.id
  WHERE
    d.user_id = filter_user_id
    AND (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
    AND (1 - (dc.embedding <=> query_embedding)) >= match_threshold
  ORDER BY
    dc.embedding <=> query_embedding
  LIMIT
    match_count;
END;
$$;
