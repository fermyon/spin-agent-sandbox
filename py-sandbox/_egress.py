"""Outbound egress control (pure; no spin_sdk import so it is unit-testable).

Per-sandbox allow-list, layered on the broad Spin manifest bound. `host_allowed` is the
gate applied to every outbound request the sandbox makes.
"""

import re
import urllib.parse
import ipaddress


def is_internal_host(host):
    """Loopback / link-local / private / internal targets are never reachable, even if
    explicitly allow-listed — the primary SSRF backstop (cloud metadata at
    169.254.169.254, *.spin.internal service chaining, etc.)."""
    h = (host or "").lower().strip(".")
    if h in ("", "localhost") or h.endswith((".localhost", ".internal", ".local")):
        return True
    try:
        ip = ipaddress.ip_address(h.strip("[]"))
    except ValueError:
        return False
    return (
        ip.is_loopback or ip.is_link_local or ip.is_private
        or ip.is_reserved or ip.is_unspecified or ip.is_multicast
    )


def host_allowed(url, allowed):
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    if is_internal_host(host):
        return False  # deny internal/loopback/link-local targets unconditionally
    for raw in allowed or []:
        pat = re.sub(r"^[a-z]+://", "", raw, flags=re.I).split("/")[0].lower()
        if pat == "*":
            continue  # a bare "*" in the per-request envelope must not mean allow-all
        if pat.startswith("*."):
            base = pat[2:]
            if host == base or host.endswith("." + base):
                return True
        elif host == pat:
            return True
    return False
