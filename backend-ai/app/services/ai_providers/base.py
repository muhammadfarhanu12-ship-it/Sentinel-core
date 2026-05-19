from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.schemas.gateway_schema import GatewayMessage, GatewayUsage


class ProviderConfigurationError(RuntimeError):
    pass


@dataclass(slots=True)
class ProviderFailure(Exception):
    code: str
    message: str
    retryable: bool = False


@dataclass(slots=True)
class ProviderResponse:
    provider: str
    model: str
    content: str
    usage: GatewayUsage
    raw_metadata: dict[str, Any]


class AIProvider:
    provider_name: str

    def validate_config(self) -> None:
        raise NotImplementedError

    async def generate(
        self,
        *,
        messages: list[GatewayMessage],
        model: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> ProviderResponse:
        raise NotImplementedError


def estimate_tokens(text: str) -> int:
    return max(1, (len(text or "") + 3) // 4)


def estimate_messages_tokens(messages: list[GatewayMessage]) -> int:
    return sum(estimate_tokens(message.content) for message in messages)
