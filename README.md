# PaperMind: AI PDF Research Assistant

PaperMind is a production-quality, responsive AI PDF Research Assistant that allows users to upload multiple PDF documents and perform semantic search and chat over them.

## Tech Stack

- **Frontend**: Next.js (React, TypeScript), Tailwind CSS, shadcn/ui
- **Backend**: FastAPI (Python), PyMuPDF (text extraction), Sentence Transformers (embeddings)
- **Database**: Supabase PostgreSQL with `pgvector` extension
- **Auth**: Supabase Authentication
- **Storage**: Supabase Storage
- **LLM**: Gemini API

## Project Structure

```
/PaperMind
  ├── frontend/              # Next.js frontend application
  ├── backend/               # FastAPI backend application
  └── README.md              # Project documentation
```

## Running the Application

Details for running the frontend and backend are documented in their respective subdirectories.
