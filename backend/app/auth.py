import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings
from typing import Dict, Any

# Security scheme for JWT Bearer tokens
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    """
    FastAPI dependency to authenticate requests.
    Verifies the Supabase JWT token by calling Supabase's /auth/v1/user endpoint.
    This approach works regardless of the JWT signing algorithm (HS256 or RS256).
    
    Returns:
        A dictionary containing user details, primarily 'id' (the UUID).
    """
    token = credentials.credentials
    try:
        # Verify the token against Supabase's auth REST API
        response = httpx.get(
            f"{settings.SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.SUPABASE_ANON_KEY,
            },
            timeout=10.0
        )
        
        if response.status_code == 401:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication token. Please log in again."
            )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Authentication service returned error {response.status_code}."
            )
        
        user_data = response.json()
        user_id = user_data.get("id")
        email = user_data.get("email")
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token payload is missing user ID."
            )
        
        return {
            "id": user_id,
            "email": email,
            "role": user_data.get("role", "authenticated")
        }

    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service timed out. Please try again."
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )
