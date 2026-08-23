import asyncio
import json
import threading
import time

_clients: set = set()
_client_locks: dict = {}
_client_options: dict = {}
_realtime_seq: int = 0
_latest_realtime_lock = threading.Lock()
_latest_realtime_frame = None


async def _safe_send(websocket, msg: str):
    """Send com lock para evitar conflito de sends concorrentes."""
    lock = _client_locks.get(websocket)
    if not lock:
        return
    async with lock:
        try:
            await websocket.send(msg)
        except Exception:
            _clients.discard(websocket)


async def _safe_send_many(websocket, messages):
    """Envia varias mensagens para um cliente sob um unico lock."""
    lock = _client_locks.get(websocket)
    if not lock:
        return
    async with lock:
        try:
            for msg in messages:
                await websocket.send(msg)
        except Exception:
            _clients.discard(websocket)


async def _broadcast_all(msg: str):
    await asyncio.gather(
        *(_safe_send(client, msg) for client in set(_clients)),
        return_exceptions=True,
    )


def _client_label(client):
    opts = _client_options.get(client, {})
    name = opts.get("client_name") or "client"
    remote = getattr(client, "remote_address", None)
    return f"{name}@{remote}" if remote else name


def _make_realtime_frame(events: list):
    global _realtime_seq
    _realtime_seq += 1
    sent_at = round(time.time() * 1000.0, 3)
    return {
        "type": "realtime",
        "seq": _realtime_seq,
        "sentAt": sent_at,
        "events": events,
    }


def _publish_latest_realtime(events: list):
    global _latest_realtime_frame
    frame = _make_realtime_frame(events)
    with _latest_realtime_lock:
        _latest_realtime_frame = frame
    return frame


def get_latest_realtime_frame():
    with _latest_realtime_lock:
        return _latest_realtime_frame


async def _broadcast_realtime(events: list):
    """Envia eventos frequentes. Clientes opt-in recebem 1 frame WebSocket por tick."""
    if not events:
        return
    frame = _publish_latest_realtime(events)
    bundled_msg = json.dumps(frame)
    individual_msgs = [json.dumps(event) for event in events]
    tasks = []
    for client in set(_clients):
        opts = _client_options.get(client, {})
        if opts.get("native_realtime"):
            continue
        if opts.get("realtime_bundle"):
            tasks.append(_safe_send(client, bundled_msg))
        else:
            tasks.append(_safe_send_many(client, individual_msgs))
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
