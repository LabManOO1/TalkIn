from fastapi import APIRouter
from . import rooms, root, auth, schedule

rest_router = APIRouter()

rest_router.include_router(rooms.rooms_router)
rest_router.include_router(root.root_router)
rest_router.include_router(auth.auth_router)
rest_router.include_router(schedule.schedule_router)