from fastapi import APIRouter
# pyrefly: ignore [missing-import]
from app.api.v1.endpoints import clients, messages, commands, admin, deposit

router = APIRouter()
router.include_router(clients.router, prefix="/clients", tags=["clients"])
router.include_router(messages.router, prefix="/clients/{client_id}/messages", tags=["messages"])
router.include_router(commands.router, prefix="/commands", tags=["commands"])
router.include_router(admin.router, prefix="/admin", tags=["admin"])
router.include_router(deposit.router, prefix="/deposit", tags=["deposit"])


