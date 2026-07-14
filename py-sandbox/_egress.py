"""Outbound egress control (pure; no spin_sdk import so it is unit-testable).

Per-sandbox allow-list, layered on the broad bound set in the Spin manifest. `host_allowed` is the
gate applied to every outbound request the sandbox makes.
"""

import re
import urllib.parse
import ipaddress

# RFC 6598 carrier-grade NAT / shared address space. Python's is_private only covers this
# on 3.13+, so name it explicitly to stay in lockstep with the TS backstop (ipaddr.js
# classifies it as carrierGradeNat, i.e. non-unicast).
_SHARED_V4 = ipaddress.ip_network("100.64.0.0/10")


def is_internal_host(host):
    """Loopback / link-local / private / internal targets are never reachable, even if
    explicitly allow-listed: the primary SSRF backstop (cloud metadata at
    169.254.169.254, *.spin.internal service chaining, etc.)."""
    h = (host or "").lower().strip(".")
    if h in ("", "localhost") or h.endswith((".localhost", ".internal", ".local")):
        return True
    try:
        ip = ipaddress.ip_address(h.strip("[]"))
    except ValueError:
        return False
    # Classify an IPv4-mapped IPv6 address (::ffff:a.b.c.d) by its embedded IPv4, so a
    # mapped internal target is blocked too. Mirrors the TS backstop's toIPv4Address path.
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:
        ip = mapped
    if ip.version == 4 and ip in _SHARED_V4:
        return True
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
