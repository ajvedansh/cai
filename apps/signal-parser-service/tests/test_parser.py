"""
Unit tests for signal-parser-service.

External calls (Claude API, Redis) are mocked so tests run without
real credentials or infrastructure.
"""

import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.core.config import Settings
from app.models.trade_call import ParsedTradeCall, Segment, Direction, ParseResponse


# ── Helpers ───────────────────────────────────────────────────────────────────


def make_settings(**overrides) -> Settings:
    """Build a Settings instance with test defaults."""
    defaults = dict(
        app_env="test",
        redis_url="redis://localhost:6379",
        anthropic_api_key="test-key",
        anthropic_model="claude-3-5-haiku-20241022",
        confidence_threshold=0.85,
        stream_message_received="cai:message.received",
        stream_trade_call_created="cai:trade_call.created",
        stream_needs_review="cai:message.needs_review",
        consumer_group="signal-parser-group",
        consumer_name="signal-parser-1",
        api_key="test-api-key",
    )
    defaults.update(overrides)
    return Settings(**defaults)


def make_classifier_response(is_trade_signal: bool, confidence: float, reason: str = "") -> MagicMock:
    """Return a mock anthropic response for the classifier."""
    mock_response = MagicMock()
    mock_response.content = [MagicMock()]
    mock_response.content[0].text = json.dumps(
        {"is_trade_signal": is_trade_signal, "confidence": confidence, "reason": reason}
    )
    return mock_response


def make_extractor_response(data: dict) -> MagicMock:
    """Return a mock anthropic response for the extractor."""
    mock_response = MagicMock()
    mock_response.content = [MagicMock()]
    mock_response.content[0].text = json.dumps(data)
    return mock_response


# ── Test: ParsedTradeCall model validation ────────────────────────────────────


def test_target_split_validation():
    """target_split must sum to 100; mismatched values are normalised."""
    call = ParsedTradeCall(
        instrument="INFY",
        segment=Segment.EQUITY,
        direction=Direction.BUY,
        entry_price=1600.0,
        stop_loss=1520.0,
        targets=[1680.0, 1760.0, 1840.0],
        target_split=[10, 20, 30],  # sums to 60 — will be normalised
        trailing_sl=False,
        confidence=0.92,
    )
    assert sum(call.target_split) == 100


def test_target_split_already_100():
    """When split already sums to 100, it is kept as-is."""
    call = ParsedTradeCall(
        instrument="RELIANCE",
        segment=Segment.EQUITY,
        direction=Direction.BUY,
        entry_price=2500.0,
        stop_loss=2400.0,
        targets=[2600.0, 2700.0],
        target_split=[50, 50],
        trailing_sl=False,
        confidence=0.90,
    )
    assert call.target_split == [50, 50]


# ── Test: SignalParser orchestration ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_parse_valid_equity_signal():
    """A clear BUY signal should produce a valid ParsedTradeCall."""
    raw_text = "BUY INFY @ 1600 SL 1520 TP 1680/1760/1840 Equity"
    settings = make_settings()

    extractor_data = {
        "instrument": "INFY",
        "segment": "EQUITY",
        "direction": "BUY",
        "entry_price": 1600.0,
        "stop_loss": 1520.0,
        "targets": [1680.0, 1760.0, 1840.0],
        "target_split": [34, 33, 33],
        "trailing_sl": False,
        "risk_pct": None,
    }

    with patch("anthropic.Anthropic") as MockAnthropic:
        mock_client = MockAnthropic.return_value
        # First call → classifier; second call → extractor
        mock_client.messages.create.side_effect = [
            make_classifier_response(True, 0.95, "Clear BUY signal"),
            make_extractor_response(extractor_data),
        ]

        from app.services.parser import SignalParser

        parser = SignalParser(settings)
        trade_call, confidence, reason = await parser.parse(
            raw_text=raw_text,
            raw_message_id="msg-001",
            source_channel="test-channel",
        )

    assert trade_call is not None
    assert reason is None
    assert trade_call.instrument == "INFY"
    assert trade_call.segment == Segment.EQUITY
    assert trade_call.direction == Direction.BUY
    assert trade_call.entry_price == 1600.0
    assert trade_call.stop_loss == 1520.0
    assert trade_call.targets == [1680.0, 1760.0, 1840.0]
    assert confidence == pytest.approx(0.95)
    assert trade_call.confidence == pytest.approx(0.95)


@pytest.mark.asyncio
async def test_parse_returns_none_for_noise():
    """Noise text (not a trade signal) must return (None, low_confidence, reason)."""
    raw_text = "Great day at the market today!"
    settings = make_settings()

    with patch("anthropic.Anthropic") as MockAnthropic:
        mock_client = MockAnthropic.return_value
        mock_client.messages.create.return_value = make_classifier_response(
            False, 0.05, "No trade signal detected"
        )

        from app.services.parser import SignalParser

        parser = SignalParser(settings)
        trade_call, confidence, reason = await parser.parse(
            raw_text=raw_text,
            raw_message_id="msg-002",
            source_channel="general",
        )

    assert trade_call is None
    assert reason == "not_a_trade_signal"
    assert confidence == pytest.approx(0.05)


@pytest.mark.asyncio
async def test_confidence_below_threshold_returns_needs_review():
    """A signal detected but below the confidence threshold goes to needs_review."""
    raw_text = "maybe buy INFY around 1600"
    settings = make_settings(confidence_threshold=0.85)

    with patch("anthropic.Anthropic") as MockAnthropic:
        mock_client = MockAnthropic.return_value
        # Classifier says it IS a signal but with low confidence
        mock_client.messages.create.return_value = make_classifier_response(
            True, 0.60, "Possible signal but ambiguous"
        )

        from app.services.parser import SignalParser

        parser = SignalParser(settings)
        trade_call, confidence, reason = await parser.parse(
            raw_text=raw_text,
            raw_message_id="msg-003",
            source_channel="test-channel",
        )

    assert trade_call is None
    assert reason == "low_confidence"
    assert confidence == pytest.approx(0.60)


# ── Test: FastAPI endpoints ───────────────────────────────────────────────────


@pytest.fixture
def mock_app():
    """
    Return a FastAPI test app with app.state pre-populated so the
    lifespan (Redis/Claude) is never invoked.
    """
    from fastapi import FastAPI
    from app.api import health as health_module
    from app.api import parse as parse_module
    from app.core.config import get_settings

    test_app = FastAPI()
    test_app.include_router(health_module.router)
    test_app.include_router(parse_module.router)

    # Inject mocked state
    mock_redis = AsyncMock()
    mock_redis.ping = AsyncMock(return_value=True)
    mock_redis.xlen = AsyncMock(return_value=0)
    mock_redis.xinfo_groups = AsyncMock(return_value=[])

    mock_parser = AsyncMock()
    mock_parser.model_version = "claude-3-5-haiku-20241022"

    mock_publisher = AsyncMock()
    mock_publisher.get_stream_info = AsyncMock(
        return_value={
            "trade_call_created_stream_length": 0,
            "needs_review_stream_length": 0,
        }
    )

    test_app.state.redis = mock_redis
    test_app.state.parser = mock_parser
    test_app.state.publisher = mock_publisher

    # Override settings dependency to use test API key
    test_settings = make_settings()

    def override_settings():
        return test_settings

    test_app.dependency_overrides[get_settings] = override_settings

    return test_app, mock_parser


@pytest.mark.asyncio
async def test_health_endpoint(mock_app):
    """GET /health should return 200 with status ok."""
    test_app, _ = mock_app
    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "signal-parser-service"
    assert body["redis"] == "connected"


@pytest.mark.asyncio
async def test_parse_test_endpoint_success(mock_app):
    """POST /api/v1/parse/test should return 200 with a parsed trade call."""
    test_app, mock_parser = mock_app

    parsed = ParsedTradeCall(
        instrument="RELIANCE",
        segment=Segment.EQUITY,
        direction=Direction.BUY,
        entry_price=2500.0,
        stop_loss=2400.0,
        targets=[2600.0],
        target_split=[100],
        trailing_sl=False,
        confidence=0.92,
    )
    mock_parser.parse = AsyncMock(return_value=(parsed, 0.92, None))

    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/parse/test",
            json={
                "raw_text": "BUY RELIANCE @ 2500 SL 2400 TP 2600",
                "source_channel": "test-ch",
                "raw_message_id": "msg-test-1",
            },
            headers={"x-api-key": "test-api-key"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["needs_review"] is False
    assert body["data"]["instrument"] == "RELIANCE"


@pytest.mark.asyncio
async def test_parse_test_endpoint_needs_review(mock_app):
    """When parser returns None, the endpoint should indicate needs_review."""
    test_app, mock_parser = mock_app
    mock_parser.parse = AsyncMock(return_value=(None, 0.40, "not_a_trade_signal"))

    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/parse/test",
            json={
                "raw_text": "Just some random text",
                "source_channel": "test-ch",
                "raw_message_id": "msg-test-2",
            },
            headers={"x-api-key": "test-api-key"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is False
    assert body["needs_review"] is True
    assert body["reason"] == "not_a_trade_signal"


@pytest.mark.asyncio
async def test_parse_test_endpoint_unauthorized(mock_app):
    """Missing or wrong API key should return 401."""
    test_app, _ = mock_app

    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/parse/test",
            json={"raw_text": "BUY INFY @ 1600 SL 1520"},
            headers={"x-api-key": "wrong-key"},
        )

    assert response.status_code == 401
