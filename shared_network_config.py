"""Shared network configuration loader for safety scripts.

Order of precedence:
1) hardcoded defaults in this module
2) values from sisuraksha_network.env at repository root
3) OS environment variables with matching keys
4) explicit overrides passed to load_network_config()
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, Mapping, Optional

NETWORK_ENV_FILENAME = "sisuraksha_network.env"

DEFAULT_NETWORK_CONFIG: Dict[str, str] = {
    "DRIVER_ID": "8c394627-e397-4bd5-928f-4cc66cfebac1",
    "PHONE_IP": "10.60.136.249:8080",
    "ESP32_CAM_IP": "sisuraksha-cam.local:81",
    "FOOTBOARD_CAMERA_SOURCE": "phone",
    "ESP32_IR_IP": "192.168.1.106",
    "FOOTBOARD_SERVER_URL": "http://localhost:5000/api/safety",
    "DRIVER_MONITOR_SERVER_URL": "http://localhost:5000/api/driver-monitor",
    "WINDOW_SAFETY_SERVER_URL": "http://localhost:5000/api/window-safety",
    "FOOTBOARD_WEBHOOK_PORT": "5001",
}


def _get_env_file_path() -> Path:
    return Path(__file__).resolve().parent / NETWORK_ENV_FILENAME


def _parse_env_file(file_path: Path) -> Dict[str, str]:
    values: Dict[str, str] = {}
    if not file_path.exists():
        return values

    for raw_line in file_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if value and len(value) >= 2 and value[0] == value[-1] and value[0] in {"\"", "'"}:
            value = value[1:-1]

        if key:
            values[key] = value

    return values


def load_network_config(overrides: Optional[Mapping[str, str]] = None) -> Dict[str, str]:
    """Load merged network configuration values."""
    config = dict(DEFAULT_NETWORK_CONFIG)
    config.update(_parse_env_file(_get_env_file_path()))

    for key in DEFAULT_NETWORK_CONFIG:
        env_value = os.getenv(key)
        if env_value is not None and env_value.strip() != "":
            config[key] = env_value.strip()

    if overrides:
        for key, value in overrides.items():
            if value is None:
                continue
            value_str = str(value).strip()
            if value_str:
                config[key] = value_str

    return config


def build_phone_video_url(phone_ip: str) -> str:
    if phone_ip.startswith(("http://", "https://")):
        return phone_ip
    return f"http://{phone_ip}/video"


def build_esp32cam_stream_url(esp32_cam_ip: str) -> str:
    if esp32_cam_ip.startswith(("http://", "https://")):
        return esp32_cam_ip
    return f"http://{esp32_cam_ip}/stream"


def build_phone_sensor_url(phone_ip: str) -> str:
    return f"http://{phone_ip}/sensors.json"
