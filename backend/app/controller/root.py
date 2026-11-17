from fastapi import APIRouter

root_router = APIRouter(tags=["System"])

@root_router.get("/")
async def root():
    return {"message": "TalsSphere API is running"}

@root_router.get("/health")
async def health():
    return {"status": "ok"}