from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db import init_db_pool, close_db_pool
from app.routers import documents, chats

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize the database connection pool on startup
    init_db_pool()
    yield
    # Close the database connection pool on shutdown
    close_db_pool()

app = FastAPI(
    title="PaperMind API",
    description="Backend services for PaperMind AI PDF Research Assistant",
    version="1.0.0",
    lifespan=lifespan
)

# Include API Routers
app.include_router(documents.router, prefix="/api")
app.include_router(chats.router, prefix="/api")

# Set up CORS middleware — origins come from the CORS_ORIGINS env var
# We also include allow_origin_regex to support all Vercel previews/deployments and local development environments
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.onrender\.com|http://localhost:.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
        "api_version": "1.0.0"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.ENVIRONMENT == "development"
    )
