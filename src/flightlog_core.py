from __future__ import annotations

import json
import math
import os
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any


class DJIParseError(RuntimeError):
    """Raised when dji-log.exe cannot parse the uploaded flight record."""


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_bool(value: Any) -> bool:
    return bool(value)


def _parse_datetime(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None

    candidate = value.strip()
    if not candidate:
        return None

    if candidate.endswith("Z"):
        candidate = candidate[:-1] + "+00:00"

    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        return None

    # A number of DJI logs include a 1970 placeholder value. Treat it as missing.
    if parsed.year < 2000:
        return None
    return parsed


def _extract_frames(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, dict):
        frames = data.get("frames") or data.get("records") or []
        return frames if isinstance(frames, list) else []
    if isinstance(data, list):
        return [frame for frame in data if isinstance(frame, dict)]
    return []


def _latlon_to_local_meters(
    ref_latitude: float, ref_longitude: float, latitude: float, longitude: float
) -> tuple[float, float]:
    earth_radius = 6_378_137.0
    lat_rad = math.radians(latitude)
    ref_lat_rad = math.radians(ref_latitude)

    delta_lat = lat_rad - ref_lat_rad
    delta_lon = math.radians(longitude - ref_longitude)

    x_meters = delta_lon * earth_radius * math.cos((lat_rad + ref_lat_rad) / 2.0)
    y_meters = delta_lat * earth_radius
    return x_meters, y_meters


def _calculate_bearing(dx: float, dy: float) -> float:
    if dx == 0.0 and dy == 0.0:
        return 0.0
    return (90.0 - math.degrees(math.atan2(dy, dx))) % 360.0


def _is_valid_coordinate(latitude: float | None, longitude: float | None) -> bool:
    if latitude is None or longitude is None:
        return False
    return -90.0 <= latitude <= 90.0 and -180.0 <= longitude <= 180.0


def _pick_reference_frame(frames: list[dict[str, Any]]) -> dict[str, Any] | None:
    for frame in frames:
        osd = frame.get("osd") or {}
        latitude = _safe_float(osd.get("latitude"))
        longitude = _safe_float(osd.get("longitude"))
        if _is_valid_coordinate(latitude, longitude):
            return frame
    return None


def _extract_home_point(frames: list[dict[str, Any]]) -> dict[str, float] | None:
    for frame in frames:
        home = frame.get("home") or {}
        latitude = _safe_float(home.get("latitude"))
        longitude = _safe_float(home.get("longitude"))
        altitude = _safe_float(home.get("altitude"))
        if _is_valid_coordinate(latitude, longitude) and (latitude != 0.0 or longitude != 0.0):
            return {
                "latitude": latitude,
                "longitude": longitude,
                "altitude_m": altitude or 0.0,
            }
    return None


class DJILogAnalyzer:
    def __init__(self, executable_path: str | os.PathLike[str], api_key: str):
        self.executable_path = str(executable_path)
        self.api_key = api_key

    def parse_log(
        self,
        log_path: str | os.PathLike[str],
        output_txt_path: str | os.PathLike[str] | None = None,
    ) -> dict[str, Any]:
        log_path = str(log_path)
        if not os.path.exists(log_path):
            raise FileNotFoundError(f"로그 파일을 찾을 수 없습니다: {log_path}")

        if output_txt_path is None:
            output_txt_path = os.path.splitext(log_path)[0] + "_decrypted.txt"

        command = [self.executable_path, log_path, "--api-key", self.api_key]
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )

        if result.returncode != 0:
            raise DJIParseError(result.stderr.strip() or "dji-log.exe returned a non-zero exit code.")

        Path(output_txt_path).write_text(result.stdout, encoding="utf-8")

        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            raise DJIParseError("복호화 결과를 JSON으로 변환하지 못했습니다.") from exc


def summarize_flight(data: Any) -> dict[str, Any]:
    details = data.get("details") if isinstance(data, dict) else {}
    details = details if isinstance(details, dict) else {}
    frames = _extract_frames(data)
    reference_frame = _pick_reference_frame(frames)

    if reference_frame is None:
        raise ValueError("유효한 위도/경도가 포함된 프레임을 찾지 못했습니다.")

    reference_osd = reference_frame.get("osd") or {}
    ref_latitude = _safe_float(reference_osd.get("latitude")) or 0.0
    ref_longitude = _safe_float(reference_osd.get("longitude")) or 0.0
    ref_altitude = _safe_float(reference_osd.get("altitude"))
    ref_fly_time = _safe_float(reference_osd.get("flyTime"))

    reference_custom = reference_frame.get("custom") or {}
    start_wall_time = _parse_datetime(reference_custom.get("dateTime"))

    telemetry: list[dict[str, Any]] = []
    fallback_step_seconds = 0.1

    for index, frame in enumerate(frames):
        osd = frame.get("osd") or {}
        custom = frame.get("custom") or {}
        app = frame.get("app") or {}

        latitude = _safe_float(osd.get("latitude"))
        longitude = _safe_float(osd.get("longitude"))
        if not _is_valid_coordinate(latitude, longitude):
            continue

        fly_time = _safe_float(osd.get("flyTime"))
        wall_time = _parse_datetime(custom.get("dateTime"))

        if fly_time is not None and ref_fly_time is not None:
            time_seconds = max(0.0, fly_time - ref_fly_time)
        elif wall_time is not None and start_wall_time is not None:
            time_seconds = max(0.0, (wall_time - start_wall_time).total_seconds())
        else:
            time_seconds = round(index * fallback_step_seconds, 3)

        height_m = _safe_float(osd.get("height"))
        altitude_m = _safe_float(osd.get("altitude"))
        if height_m is None and altitude_m is not None and ref_altitude is not None:
            height_m = altitude_m - ref_altitude
        if height_m is None:
            height_m = 0.0

        x_m, y_m = _latlon_to_local_meters(ref_latitude, ref_longitude, latitude, longitude)
        x_speed = _safe_float(osd.get("xSpeed")) or 0.0
        y_speed = _safe_float(osd.get("ySpeed")) or 0.0
        z_speed_axis = _safe_float(osd.get("zSpeed")) or 0.0
        yaw_deg = _safe_float(osd.get("yaw")) or 0.0

        telemetry.append(
            {
                "index": len(telemetry),
                "time_s": round(time_seconds, 3),
                "source_fly_time_s": fly_time,
                "timestamp": wall_time.isoformat() if wall_time else None,
                "latitude": latitude,
                "longitude": longitude,
                "x_m": round(x_m, 3),
                "y_m": round(y_m, 3),
                "z_m": round(height_m, 3),
                "height_m": round(height_m, 3),
                "altitude_m": round(altitude_m if altitude_m is not None else height_m, 3),
                "pitch_deg": round(_safe_float(osd.get("pitch")) or 0.0, 3),
                "roll_deg": round(_safe_float(osd.get("roll")) or 0.0, 3),
                "yaw_deg": round(yaw_deg, 3),
                "raw_horizontal_speed_mps": round(math.hypot(x_speed, y_speed), 3),
                "raw_vertical_speed_axis_mps": round(z_speed_axis, 3),
                "gps_level": int(_safe_float(osd.get("gpsLevel")) or 0),
                "is_on_ground": _safe_bool(osd.get("isOnGround")),
                "tip": str(app.get("tip") or ""),
                "warning": str(app.get("warn") or ""),
            }
        )

    if not telemetry:
        raise ValueError("텔레메트리를 구성할 수 있는 유효한 좌표가 없습니다.")

    total_distance_2d = 0.0
    total_distance_3d = 0.0
    max_horizontal_speed = 0.0
    max_climb_speed = 0.0
    max_descent_speed = 0.0

    for point in telemetry:
        point["segment_distance_2d_m"] = 0.0
        point["segment_distance_3d_m"] = 0.0
        point["derived_horizontal_speed_mps"] = 0.0
        point["derived_vertical_speed_mps"] = 0.0
        point["bearing_deg"] = point["yaw_deg"]

    for index in range(1, len(telemetry)):
        previous = telemetry[index - 1]
        current = telemetry[index]

        delta_time = max(current["time_s"] - previous["time_s"], 1e-3)
        delta_x = current["x_m"] - previous["x_m"]
        delta_y = current["y_m"] - previous["y_m"]
        delta_z = current["z_m"] - previous["z_m"]

        distance_2d = math.hypot(delta_x, delta_y)
        distance_3d = math.sqrt(delta_x * delta_x + delta_y * delta_y + delta_z * delta_z)
        horizontal_speed = distance_2d / delta_time
        vertical_speed = delta_z / delta_time

        current["segment_distance_2d_m"] = round(distance_2d, 3)
        current["segment_distance_3d_m"] = round(distance_3d, 3)
        current["derived_horizontal_speed_mps"] = round(horizontal_speed, 3)
        current["derived_vertical_speed_mps"] = round(vertical_speed, 3)
        current["bearing_deg"] = round(_calculate_bearing(delta_x, delta_y), 3)

        total_distance_2d += distance_2d
        total_distance_3d += distance_3d
        max_horizontal_speed = max(max_horizontal_speed, horizontal_speed)
        max_climb_speed = max(max_climb_speed, vertical_speed)
        max_descent_speed = min(max_descent_speed, vertical_speed)

    if len(telemetry) > 1:
        telemetry[0]["derived_horizontal_speed_mps"] = telemetry[1]["derived_horizontal_speed_mps"]
        telemetry[0]["derived_vertical_speed_mps"] = telemetry[1]["derived_vertical_speed_mps"]
        telemetry[0]["bearing_deg"] = telemetry[1]["bearing_deg"]

    latitudes = [point["latitude"] for point in telemetry]
    longitudes = [point["longitude"] for point in telemetry]
    x_values = [point["x_m"] for point in telemetry]
    y_values = [point["y_m"] for point in telemetry]
    z_values = [point["z_m"] for point in telemetry]

    home_point = _extract_home_point(frames) or {
        "latitude": telemetry[0]["latitude"],
        "longitude": telemetry[0]["longitude"],
        "altitude_m": telemetry[0]["altitude_m"],
    }

    duration_seconds = telemetry[-1]["time_s"] if telemetry else 0.0

    return {
        "aircraft_name": str(details.get("aircraftName") or "Unknown"),
        "serial_number": str(details.get("aircraftSn") or "Unknown"),
        "app_version": str(details.get("appVersion") or "Unknown"),
        "source_version": data.get("version") if isinstance(data, dict) else None,
        "frame_count": len(frames),
        "point_count": len(telemetry),
        "duration_s": round(duration_seconds, 3),
        "total_distance_2d_m": round(total_distance_2d, 3),
        "total_distance_3d_m": round(total_distance_3d, 3),
        "max_height_m": round(max(z_values), 3),
        "min_height_m": round(min(z_values), 3),
        "max_horizontal_speed_mps": round(max_horizontal_speed, 3),
        "max_climb_speed_mps": round(max_climb_speed, 3),
        "max_descent_speed_mps": round(abs(max_descent_speed), 3),
        "home_point": home_point,
        "geo_bounds": {
            "min_latitude": min(latitudes),
            "max_latitude": max(latitudes),
            "min_longitude": min(longitudes),
            "max_longitude": max(longitudes),
        },
        "local_bounds": {
            "min_x_m": round(min(x_values), 3),
            "max_x_m": round(max(x_values), 3),
            "min_y_m": round(min(y_values), 3),
            "max_y_m": round(max(y_values), 3),
            "min_z_m": round(min(z_values), 3),
            "max_z_m": round(max(z_values), 3),
        },
        "reference_point": {
            "latitude": ref_latitude,
            "longitude": ref_longitude,
            "altitude_m": ref_altitude or telemetry[0]["altitude_m"],
        },
        "telemetry": telemetry,
    }

