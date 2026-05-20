"""Tests for baseline forecast math."""

from __future__ import annotations

from datetime import date

import pytest

from scripts.lib.forecast_baselines import (
    WeeklySeriesPoint,
    build_history_from_values,
    compute_residual_stats,
    ensemble_forecast,
    moving_average_forecast,
    persistence_forecast,
    rolling_origin_indices,
    seasonal_naive_forecast,
    trend_forecast,
    trend_from_change,
)


def _history(values: list[float], start: date = date(2024, 1, 1)) -> list[WeeklySeriesPoint]:
    return [
        WeeklySeriesPoint(week_start=date.fromordinal(start.toordinal() + 7 * i), value=v)
        for i, v in enumerate(values)
    ]


class TestTrendFromChange:
    def test_rising(self):
        assert trend_from_change(0.3) == "rising"

    def test_falling(self):
        assert trend_from_change(-0.3) == "falling"

    def test_stable(self):
        assert trend_from_change(0.1) == "stable"


class TestPersistence:
    def test_flat_series(self):
        hist = _history([1.0, 1.5, 2.0, 2.5])
        forecasts = persistence_forecast(hist, origin_index=3, horizons=(1, 2))
        assert len(forecasts) == 2
        assert forecasts[0].predicted_activity_index == 2.5
        assert forecasts[0].horizon_weeks == 1
        assert forecasts[1].horizon_weeks == 2
        assert forecasts[0].target_date == date(2024, 1, 29)


class TestMovingAverage:
    def test_four_week_window(self):
        hist = _history([1.0, 2.0, 3.0, 4.0, 5.0])
        forecasts = moving_average_forecast(hist, origin_index=4, horizons=(1,))
        # mean of [2,3,4,5] = 3.5
        assert forecasts[0].predicted_activity_index == pytest.approx(3.5)


class TestTrend:
    def test_linear_upward(self):
        hist = _history([0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0])
        forecasts = trend_forecast(hist, origin_index=8, horizons=(1,))
        assert forecasts[0].predicted_activity_index > 8.0


class TestSeasonalNaive:
    def test_lag_52(self):
        values = [float(i) for i in range(60)]
        hist = _history(values)
        forecasts = seasonal_naive_forecast(hist, origin_index=59, horizons=(1,))
        # origin 59, lag 52, h=1 → index 59-52+1=8 → value 8.0
        assert forecasts[0].predicted_activity_index == pytest.approx(8.0)


class TestEnsemble:
    def test_mean_of_components(self):
        hist = _history([2.0, 2.0, 2.0, 2.0])
        p = persistence_forecast(hist, 3, horizons=(1,))
        ma = moving_average_forecast(hist, 3, horizons=(1,))
        ens = ensemble_forecast([p, ma], origin_value=2.0, origin_week=hist[3].week_start)
        assert len(ens) == 1
        assert ens[0].predicted_activity_index == pytest.approx(2.0)


class TestRollingOrigin:
    def test_latest_only(self):
        assert rolling_origin_indices(60, backfill_weeks=0) == [59]

    def test_backfill(self):
        indices = rolling_origin_indices(60, backfill_weeks=5)
        assert indices[-1] == 59
        assert len(indices) == 5


class TestBuildHistory:
    def test_sorted(self):
        h = build_history_from_values(
            ["2024-01-15", "2024-01-01", "2024-01-08"],
            [3.0, 1.0, 2.0],
        )
        assert h[0].value == 1.0
        assert h[-1].value == 3.0


class TestResidualStats:
    def test_sigma(self):
        stats = compute_residual_stats({1: [0.1, 0.2, 0.3], 2: [0.5]})
        assert stats.sigma(1) > 0
        assert stats.sigma(2) == pytest.approx(0.5)
        assert stats.sigma(99, fallback=0.25) == 0.25
