import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

import pytest_asyncio

@pytest_asyncio.fixture
async def client():
    """AsyncClient bound to the FastAPI ASGI app (httpx ≥0.28 style)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac