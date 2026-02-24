"""
rf_monitor/tests/test_threat_fusion.py
=======================================
Unit tests for the ThreatFusionEngine — no hardware or MongoDB required.
Run with: python -m pytest rf_monitor/tests/test_threat_fusion.py -v
"""
import pytest
import sys
import os

# Allow running from project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from rf_monitor.threat_fusion import ThreatFusionEngine, ThreatLevel


@pytest.fixture
def engine():
    """Fresh engine for each test."""
    return ThreatFusionEngine()


class TestThreatLevelMatrix:
    """Test all 4 threat level combinations."""

    def test_safe(self, engine):
        state = engine.update(elephant_detected=False, rf_status="SAFE")
        assert state.threat_level == ThreatLevel.SAFE
        assert state.priority == 0

    def test_wildlife_alert(self, engine):
        state = engine.update(elephant_detected=True, rf_status="SAFE")
        assert state.threat_level == ThreatLevel.WILDLIFE_ALERT
        assert state.priority == 1

    def test_human_intrusion(self, engine):
        state = engine.update(elephant_detected=False, rf_status="INTRUSION")
        assert state.threat_level == ThreatLevel.HUMAN_INTRUSION
        assert state.priority == 2

    def test_critical_alert(self, engine):
        state = engine.update(elephant_detected=True, rf_status="INTRUSION")
        assert state.threat_level == ThreatLevel.CRITICAL_ALERT
        assert state.priority == 3


class TestThreatStateTransitions:
    """Test that state transitions are tracked correctly."""

    def test_escalation(self, engine):
        s1 = engine.update(False, "SAFE")
        assert s1.threat_level == ThreatLevel.SAFE

        s2 = engine.update(True, "SAFE")
        assert s2.threat_level == ThreatLevel.WILDLIFE_ALERT

        s3 = engine.update(True, "INTRUSION")
        assert s3.threat_level == ThreatLevel.CRITICAL_ALERT

    def test_deescalation(self, engine):
        engine.update(True, "INTRUSION")
        state = engine.update(False, "SAFE")
        assert state.threat_level == ThreatLevel.SAFE

    def test_current_state_reflects_latest(self, engine):
        engine.update(True, "INTRUSION")
        engine.update(False, "SAFE")
        assert engine.current_state.threat_level == ThreatLevel.SAFE


class TestCallbacks:
    """Test callback registration on state change."""

    def test_callback_fires_on_change(self, engine):
        events = []
        engine.register_callback(lambda s: events.append(s.threat_level))
        engine.update(False, "SAFE")           # no change (starts SAFE)
        import time; time.sleep(0.05)          # let daemon threads fire
        assert len(events) == 0               # no change → no callback

        engine.update(True, "SAFE")            # changes → WILDLIFE_ALERT
        time.sleep(0.05)
        assert len(events) == 1
        assert events[0] == ThreatLevel.WILDLIFE_ALERT


class TestColors:
    """Verify each threat level has a color."""

    @pytest.mark.parametrize("level", [
        ThreatLevel.SAFE,
        ThreatLevel.WILDLIFE_ALERT,
        ThreatLevel.HUMAN_INTRUSION,
        ThreatLevel.CRITICAL_ALERT,
    ])
    def test_color_exists(self, level):
        assert level in ThreatLevel.COLORS
        assert ThreatLevel.COLORS[level].startswith("#")
