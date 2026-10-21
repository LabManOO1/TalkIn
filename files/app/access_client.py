from uuid import UUID

import httpx

from .domain import UserContext


class AccessDenied(Exception):
    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class AccessClient:
    """Проверяет JWT и участие во встрече через Backend API."""

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    async def verify(self, token: str, invite_code: str, *, allow_ended: bool = False) -> tuple[UserContext, UUID]:
        headers = {"Authorization": f"Bearer {token}"}
        code = invite_code.strip().upper()
        async with httpx.AsyncClient(timeout=10.0) as client:
            me_response = await client.get(f"{self.base_url}/auth/me", headers=headers)
            if me_response.status_code == 401:
                raise AccessDenied("Неверный или просроченный токен")
            me_response.raise_for_status()
            me = me_response.json()

            room_response = await client.get(f"{self.base_url}/rooms/{code}")
            if room_response.status_code == 404:
                raise AccessDenied("Комната не найдена")
            room_response.raise_for_status()
            room = room_response.json()

        user_id = UUID(str(me["id"]))
        room_id = UUID(str(room["room_id"]))
        status = str(room.get("status") or "active")
        if status != "active" and not allow_ended:
            raise AccessDenied("Комната уже завершена")

        participant = next(
            (item for item in room.get("participants") or [] if str(item.get("user_id")) == str(user_id)),
            None,
        )
        is_creator = str(room.get("created_by")) == str(user_id)
        is_member = is_creator or participant is not None
        return (
            UserContext(
                user_id=user_id,
                is_member=is_member,
                is_creator=is_creator,
                username=str(me.get("username") or "Участник"),
            ),
            room_id,
        )
