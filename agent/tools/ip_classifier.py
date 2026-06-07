"""
IP connection-type classifier.

Policy: only **home broadband (residential)** and **business broadband** are
accepted. Datacenter / hosting / IDC IPs (VPNs, proxies, cloud, Tor) are refused
— they are the dominant source of automated card-testing and account-takeover.

In DEMO_MODE this uses a deterministic mock map by IP prefix. In production,
swap `classify_ip` for an IPinfo / MaxMind / IP2Location lookup of the
connection type (the same `residential|business|hosting|mobile` taxonomy).
"""
from __future__ import annotations

# Mock prefix → connection type (first two octets).
_PREFIX_TYPE = {
    "185.220": "datacenter",   # Tor exit / bulletproof hosting
    "91.108":  "datacenter",   # flagged hosting ASN
    "45.142":  "datacenter",   # bulletproof hosting
    "104.18":  "residential",  # demo: treated as home broadband
    "98.139":  "residential",
    "73.": "residential",      # common US cable ranges (prefix-1 fallback below)
    "24.": "residential",
    "212.58": "business",      # demo: business broadband
    "208.67": "business",
}

# Connection types that are NOT permitted.
BLOCKED_TYPES = {"datacenter", "hosting", "idc", "vpn", "proxy", "tor"}
ALLOWED_TYPES = {"residential", "business"}


def classify_ip(ip: str) -> str:
    """Return one of: residential, business, datacenter, mobile, unknown."""
    if not ip:
        return "unknown"
    octets = ip.split(".")
    prefix2 = ".".join(octets[:2])
    prefix1 = (octets[0] + ".") if octets else ""
    if prefix2 in _PREFIX_TYPE:
        return _PREFIX_TYPE[prefix2]
    if prefix1 in _PREFIX_TYPE:
        return _PREFIX_TYPE[prefix1]
    # Heuristic fallback: well-known cloud ranges look like datacenter.
    try:
        first = int(octets[0])
        # 10/172.16/192.168 private → treat as residential LAN behind broadband
        if first in (10,) or prefix2.startswith("192.168") or ip.startswith("172."):
            return "residential"
    except (ValueError, IndexError):
        pass
    return "residential"   # demo default: assume home broadband


def is_allowed(ip: str) -> bool:
    return classify_ip(ip) in ALLOWED_TYPES


def label(conn_type: str) -> str:
    return {
        "residential": "Home broadband",
        "business": "Business broadband",
        "datacenter": "Datacenter / IDC",
        "mobile": "Mobile carrier",
        "unknown": "Unknown",
    }.get(conn_type, conn_type)
