"""Pure baseline forecast math for weekly activity index."""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

TrendLabel = Literal["rising", "falling", "stable", "insufficient_data"]
ConfidenceLabel = Literal["low", "medium", "high"]

TREND_RISING_THRESHOLD = 0.25
TREND_FALLING_THRESHOLD = -0.25
Z_80 = 1.28  # 80% interval
DEFAULT_HORIZONS = (1, 2, 3, 4)
SEASON_LAG_WEEKS = 52
MA_WINDOW_WEEKS = 4
TREND_LOOKBACK_WEEKS = 8
WIDE_INTERVAL_THRESHOLD = 1.5


@dataclass(frozen=True)
class WeeklySeriesPoint:
    week_start: date
    value: float


@dataclass(frozen=True)
class ForecastPoint:
    horizon_weeks: int
    target_date: date
    predicted_activity_index: float
    lower_bound: float
    upper_bound: float
    predicted_trend: TrendLabel
    confidence_label: ConfidenceLabel


@dataclass(frozen=True)
class ResidualStats:
    """Per-horizon residual standard deviation from backtests."""

    by_horizon: dict[int, float]

    def sigma(self, horizon_weeks: int, fallback: float = 0.5) -> float:
        return self.by_horizon.get(horizon_weeks, fallback)


def _parse_week(value: str | date) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def add_weeks(week_start: date, n: int) -> date:
    return week_start + timedelta(days=7 * n)


def trend_from_change(change: float | None) -> TrendLabel:
    if change is None:
        return "insufficient_data"
    if change >= TREND_RISING_THRESHOLD:
        return "rising"
    if change <= TREND_FALLING_THRESHOLD:
        return "falling"
    return "stable"


def confidence_from_horizon(
    horizon_weeks: int,
    interval_width: float | None = None,
) -> ConfidenceLabel:
    base: ConfidenceLabel
    if horizon_weeks <= 1:
        base = "high"
    elif horizon_weeks == 2:
        base = "medium"
    else:
        base = "low"
    if interval_width is not None and interval_width > WIDE_INTERVAL_THRESHOLD:
        if base == "high":
            return "medium"
        if base == "medium":
            return "low"
    return base


def _make_forecast_point(
    origin_week: date,
    origin_value: float,
    horizon_weeks: int,
    predicted: float,
    sigma: float,
) -> ForecastPoint:
    half_width = Z_80 * sigma
    lower = predicted - half_width
    upper = predicted + half_width
    change = predicted - origin_value
    return ForecastPoint(
        horizon_weeks=horizon_weeks,
        target_date=add_weeks(origin_week, horizon_weeks),
        predicted_activity_index=round(predicted, 4),
        lower_bound=round(lower, 4),
        upper_bound=round(upper, 4),
        predicted_trend=trend_from_change(change),
        confidence_label=confidence_from_horizon(horizon_weeks, upper - lower),
    )


def persistence_forecast(
    history: list[WeeklySeriesPoint],
    origin_index: int,
    horizons: tuple[int, ...] = DEFAULT_HORIZONS,
    residual_stats: ResidualStats | None = None,
) -> list[ForecastPoint]:
    """Next h weeks equal the origin week's value."""
    origin = history[origin_index]
    stats = residual_stats or ResidualStats({})
    return [
        _make_forecast_point(
            origin.week_start,
            origin.value,
            h,
            origin.value,
            stats.sigma(h),
        )
        for h in horizons
    ]


def moving_average_forecast(
    history: list[WeeklySeriesPoint],
    origin_index: int,
    horizons: tuple[int, ...] = DEFAULT_HORIZONS,
    window_weeks: int = MA_WINDOW_WEEKS,
    residual_stats: ResidualStats | None = None,
) -> list[ForecastPoint]:
    """Forecast equals mean of last `window_weeks` values including origin."""
    origin = history[origin_index]
    start = max(0, origin_index - window_weeks + 1)
    window = [history[i].value for i in range(start, origin_index + 1)]
    if not window:
        return []
    ma = statistics.mean(window)
    stats = residual_stats or ResidualStats({})
    return [
        _make_forecast_point(origin.week_start, origin.value, h, ma, stats.sigma(h))
        for h in horizons
    ]


def trend_forecast(
    history: list[WeeklySeriesPoint],
    origin_index: int,
    horizons: tuple[int, ...] = DEFAULT_HORIZONS,
    lookback_weeks: int = TREND_LOOKBACK_WEEKS,
    residual_stats: ResidualStats | None = None,
) -> list[ForecastPoint]:
    """Linear extrapolation from last `lookback_weeks` values."""
    origin = history[origin_index]
    start = max(0, origin_index - lookback_weeks + 1)
    segment = history[start : origin_index + 1]
    if len(segment) < 2:
        return persistence_forecast(history, origin_index, horizons, residual_stats)

    xs = list(range(len(segment)))
    ys = [p.value for p in segment]
    n = len(xs)
    x_mean = statistics.mean(xs)
    y_mean = statistics.mean(ys)
    num = sum((xs[i] - x_mean) * (ys[i] - y_mean) for i in range(n))
    den = sum((xs[i] - x_mean) ** 2 for i in range(n))
    slope = num / den if den > 0 else 0.0
    intercept = y_mean - slope * x_mean

    stats = residual_stats or ResidualStats({})
    results: list[ForecastPoint] = []
    for h in horizons:
        x_future = len(segment) - 1 + h
        predicted = intercept + slope * x_future
        results.append(
            _make_forecast_point(origin.week_start, origin.value, h, predicted, stats.sigma(h))
        )
    return results


def seasonal_naive_forecast(
    history: list[WeeklySeriesPoint],
    origin_index: int,
    horizons: tuple[int, ...] = DEFAULT_HORIZONS,
    season_lag_weeks: int = SEASON_LAG_WEEKS,
    residual_stats: ResidualStats | None = None,
) -> list[ForecastPoint]:
    """Forecast h weeks ahead equals value at origin_index - season_lag + h."""
    origin = history[origin_index]
    stats = residual_stats or ResidualStats({})
    results: list[ForecastPoint] = []
    for h in horizons:
        lag_index = origin_index - season_lag_weeks + h
        if lag_index < 0 or lag_index >= len(history):
            # Fall back to persistence for this horizon
            predicted = origin.value
        else:
            predicted = history[lag_index].value
        results.append(
            _make_forecast_point(origin.week_start, origin.value, h, predicted, stats.sigma(h))
        )
    return results


def ensemble_forecast(
    component_forecasts: list[list[ForecastPoint]],
    origin_value: float,
    origin_week: date,
    residual_stats: ResidualStats | None = None,
) -> list[ForecastPoint]:
    """Mean of component point forecasts; pooled sigma for intervals."""
    if not component_forecasts:
        return []

    horizons = {fp.horizon_weeks for batch in component_forecasts for fp in batch}
    stats = residual_stats or ResidualStats({})
    results: list[ForecastPoint] = []

    for h in sorted(horizons):
        points: list[float] = []
        lowers: list[float] = []
        uppers: list[float] = []
        for batch in component_forecasts:
            for fp in batch:
                if fp.horizon_weeks == h:
                    points.append(fp.predicted_activity_index)
                    lowers.append(fp.lower_bound)
                    uppers.append(fp.upper_bound)
        if not points:
            continue

        mean_point = statistics.mean(points)
        sigma = stats.sigma(h)
        if sigma <= 0 and lowers and uppers:
            mean_lower = statistics.mean(lowers)
            mean_upper = statistics.mean(uppers)
            half_width = (mean_upper - mean_lower) / 2
        else:
            half_width = Z_80 * sigma

        lower = mean_point - half_width
        upper = mean_point + half_width
        change = mean_point - origin_value
        results.append(
            ForecastPoint(
                horizon_weeks=h,
                target_date=add_weeks(origin_week, h),
                predicted_activity_index=round(mean_point, 4),
                lower_bound=round(lower, 4),
                upper_bound=round(upper, 4),
                predicted_trend=trend_from_change(change),
                confidence_label=confidence_from_horizon(h, upper - lower),
            )
        )
    return results


def build_history_from_values(
    week_starts: list[str | date],
    values: list[float],
) -> list[WeeklySeriesPoint]:
    """Build sorted weekly series from parallel lists."""
    pairs = sorted(
        zip([_parse_week(w) for w in week_starts], values),
        key=lambda x: x[0],
    )
    return [WeeklySeriesPoint(week_start=w, value=v) for w, v in pairs]


def compute_residual_stats(
    errors_by_horizon: dict[int, list[float]],
) -> ResidualStats:
    """Compute residual std dev per horizon from backtest errors."""
    by_horizon: dict[int, float] = {}
    for h, errors in errors_by_horizon.items():
        if len(errors) >= 2:
            by_horizon[h] = float(statistics.pstdev(errors))
        elif len(errors) == 1:
            by_horizon[h] = abs(errors[0])
        else:
            by_horizon[h] = 0.5
    return ResidualStats(by_horizon=by_horizon)


def rolling_origin_indices(
    history_length: int,
    backfill_weeks: int = 0,
    min_history_weeks: int = SEASON_LAG_WEEKS + 4,
) -> list[int]:
    """
    Return origin indices for forecast generation.
    backfill_weeks=0 → only latest origin.
    backfill_weeks=N → last N origins (plus latest if not included).
    """
    if history_length < min_history_weeks:
        return []
    latest = history_length - 1
    if backfill_weeks <= 0:
        return [latest]
    start = max(min_history_weeks - 1, latest - backfill_weeks + 1)
    return list(range(start, latest + 1))
