"""Public website API (/api/v1/public/*) — read-only content + contact + data-deletion requests."""
from __future__ import annotations

import os
import re
import secrets
from datetime import timedelta
from html import escape
from typing import Optional

import jwt
from fastapi import APIRouter, Request
from pydantic import BaseModel
from pymongo import ReturnDocument

from .. import catalog as C
from .. import live
from ..core import JWT_SECRET, ApiError, RateLimiter, client_ip, get_db, new_id, next_cursor, now, page_args
from ..mailer import try_send

router = APIRouter(prefix="/public", tags=["public"])
RL = RateLimiter()
ART = "/api/static/game"
EMAIL_RX = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
MIN_FILL_S = 3.0

INFO = {  # website copy for the catalog (mirrors mobile/src/config/catalog.ts names)
    "character": {"rush": ("Rush", "The original rival — fast feet, red hoodie.", "hero_rush.png"), "zoe": ("Zoe", "Pink-haired trickster who never misses a jump.", "hero_zoe.png"),
                  "kai": ("Kai", "Cool-headed surfer with lightning reflexes.", "hero_kai.png"), "shadow": ("Shadow", "Hooded runner who owns the night.", "hero_shadow.png"),
                  "nova": ("Nova", "Futuristic speedster in white and cyan.", "hero_nova.png"), "leo": ("Leo", "Mohawk-wearing showman in green and gold.", "hero_leo.png")},
    "board": {"default": ("Default", "Your trusty first board.", "board_default.png"), "flame": ("Flame", "Leaves a trail of fire.", "board_flame.png"),
              "neon": ("Neon", "Glows through every tunnel.", "board_neon.png"), "dragon": ("Dragon", "Scaled and fierce.", "board_dragon.png"),
              "ice": ("Ice", "Frosty and smooth.", "board_ice.png"), "galaxy": ("Galaxy", "Cosmic swirl from another world.", "board_galaxy.png")},
    "world": {"city": ("City", "Where every rival starts.", "city_bg.jpg"), "beach": ("Beach", "Sun, sand and boardwalk trains.", "world_beach.jpg"),
              "snow": ("Snow", "Icy tracks and snowy roofs.", "world_snow.jpg"), "night": ("Night City", "Neon lights after dark.", "world_night.jpg"),
              "temple": ("Temple", "Ancient ruins in the jungle.", "world_temple.jpg"), "lava": ("Lava", "Run fast — the ground is hot.", "world_lava.jpg")},
}
POWERUPS = [("magnet", "Coin Magnet", "Pulls nearby coins to you.", "pu_magnet.png"), ("shield", "Shield", "Absorbs one crash.", "pu_shield.png"),
            ("speed", "Speed Boost", "A burst of speed — obstacles can't touch you.", "pu_speed.png"), ("x2", "Score x2", "Doubles your score for a while.", "pu_x2.png"),
            ("hoverboard", "Hoverboard", "Ride over one crash per run.", "board_default.png")]


def _unlock(price, level):
    if price is None:
        return {"type": "free", "label": "Free"}
    if price == "ad":
        return {"type": "ad", "label": "Unlock by watching ads"}
    lbl = f"{price['amount']:,} {price['currency']}"
    return {"type": "currency", "currency": price["currency"], "amount": price["amount"], "level": level, "label": f"{lbl} · Lv {level}" if level else lbl}


@router.get("/catalog")
async def public_catalog():
    pub = (await live.published())["data"]["catalog"]
    out = {}
    for kind, plural in (("character", "characters"), ("board", "boards"), ("world", "worlds")):
        out[plural] = [{"id": i, "name": INFO[kind][i][0], "description": INFO[kind][i][1], "art_url": f"{ART}/{INFO[kind][i][2]}",
                        "unlock": _unlock(it.get("price"), it.get("unlock_level"))} for i, it in pub.get(kind, {}).items() if it.get("enabled", True) and i in INFO[kind]]
    out["powerups"] = [{"id": i, "name": n, "description": d, "art_url": f"{ART}/{a}"} for i, n, d, a in POWERUPS]
    out["art_base_url"] = ART
    out["version"] = live.current_version
    return out


@router.get("/news")
async def news(limit: int = 10, cursor: Optional[str] = None):
    lim, off = page_args(limit, cursor)
    items = [n async for n in get_db().news.find({"status": "published"}, {"_id": 0, "body": 0, "created_by": 0}).sort("published_at", -1).skip(off).limit(lim)]
    return {"items": items, "next_cursor": next_cursor(off, lim, len(items)), "empty_message": None if items or off else "No news yet — check back soon"}


@router.get("/news/{slug}")
async def article(slug: str):
    n = await get_db().news.find_one({"slug": slug, "status": "published"}, {"_id": 0, "created_by": 0})
    if not n:
        raise ApiError(404, "not_found", "Article not found")
    return n


@router.get("/faq")
async def faq():
    return {"items": [f async for f in get_db().faq.find({"status": "published"}, {"_id": 0, "faq_id": 1, "question": 1, "answer": 1, "order": 1}).sort([("order", 1), ("created_at", 1)])]}


@router.get("/site-config")
async def site_config():
    r = (await live.published())["data"]["remote"]
    return {"store_url_android": r.get("store_url_android") or None, "latest_version": r.get("latest_version"), "maintenance": bool(r.get("maintenance")),
            "support_email": None, "tagline": "Run · Dodge · Collect · Compete"}


@router.get("/sitemap")
async def sitemap():
    pages = ["/", "/features", "/characters", "/worlds", "/boards", "/power-ups", "/news", "/download", "/faq", "/support", "/privacy", "/terms", "/cookies", "/account-deletion"]
    arts = [{"path": f"/news/{n['slug']}", "lastmod": n.get("updated_at") or n.get("published_at")} async for n in get_db().news.find({"status": "published"}, {"_id": 0, "slug": 1, "updated_at": 1, "published_at": 1})]
    return {"pages": [{"path": p} for p in pages] + arts, "disallow": ["/admin"]}


# ------------------------------------------------------------- contact -----
@router.get("/contact/form-token")
async def form_token():
    """Signed token proving when the form was rendered (minimum fill time 3 s)."""
    return {"form_token": jwt.encode({"typ": "contact", "iat_ms": int(now().timestamp() * 1000), "n": secrets.token_hex(6), "exp": now() + timedelta(hours=2)}, JWT_SECRET, algorithm="HS256"),
            "min_fill_seconds": MIN_FILL_S}


class Contact(BaseModel):
    name: str = ""
    email: str = ""
    category: str = ""
    message: str = ""
    website: str = ""  # honeypot — must stay empty
    form_token: str = ""


CATEGORIES = {"bug", "account", "purchase", "feedback", "other"}


def _check_token(t: str):
    try:
        d = jwt.decode(t, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise ApiError(400, "form_expired", "The form expired. Reload the page and try again.")
    if d.get("typ") != "contact":
        raise ApiError(400, "form_expired", "The form expired. Reload the page and try again.")
    if now().timestamp() * 1000 - d["iat_ms"] < MIN_FILL_S * 1000:
        raise ApiError(400, "spam_rejected", "Please take a moment to fill in the form.")


@router.post("/contact", status_code=201)
async def contact(body: Contact, request: Request):
    if body.website.strip():  # honeypot: silently useless for bots, no ticket
        raise ApiError(400, "spam_rejected", "Your message couldn't be sent.")
    fields = {}
    if not 1 <= len(body.name.strip()) <= 80:
        fields["name"] = "Enter your name"
    if not EMAIL_RX.match(body.email.strip()) or len(body.email) > 200:
        fields["email"] = "Enter a valid email"
    if body.category not in CATEGORIES:
        fields["category"] = "Choose a category"
    if len(body.message.strip()) < 10:
        fields["message"] = "Message must be at least 10 characters"
    elif len(body.message) > 4000:
        fields["message"] = "Message must be at most 4,000 characters"
    if fields:
        raise ApiError(422, "validation_error", "Please fix the highlighted fields", {"fields": fields})
    _check_token(body.form_token)
    RL.check(f"contact:{client_ip(request)}", 5, 3600)
    db = get_db()
    seq = await db.counters.find_one_and_update({"_id": "ticket"}, {"$inc": {"n": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    no = f"RR-{seq['n']:06d}"
    await db.tickets.insert_one({"ticket_no": no, "user_id": None, "name": body.name.strip(), "email": body.email.strip().lower(), "category": body.category,
                                 "message": body.message.strip(), "source": "website", "status": "open", "created_at": now(), "updated_at": now()})
    brand = escape(os.environ["EMAIL_FROM_NAME"])
    sent, reason = await try_send(to=body.email.strip(), subject=f"We got your message — {no}",
                                  html=f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">'
                                       f"<p>Hi {escape(body.name.strip())},</p><p>Thanks for contacting {brand} support. Your ticket number is <b>{no}</b>. We'll reply by email.</p>"
                                       f'<p style="font-size:12px;color:#888">Sent by {brand}. We never ask for your password by email.</p></td></tr></table>')
    await db.tickets.update_one({"ticket_no": no}, {"$set": {"confirmation_email_sent": sent, "confirmation_email_error": reason}})
    return {"ticket_no": no, "message": f"Thanks! Your ticket number is {no}", "confirmation_email_sent": sent}


class Deletion(BaseModel):
    email: str = ""
    confirm: bool = False
    note: str = ""


@router.post("/data-deletion", status_code=201)
async def data_deletion(body: Deletion, request: Request):
    fields = {}
    if not EMAIL_RX.match(body.email.strip()):
        fields["email"] = "Enter a valid email"
    if not body.confirm:
        fields["confirm"] = "Please confirm you want your data deleted"
    if fields:
        raise ApiError(422, "validation_error", "Please fix the highlighted fields", {"fields": fields})
    RL.check(f"deletion:{client_ip(request)}", 5, 3600)
    rid = new_id("del")
    await get_db().deletion_requests.insert_one({"request_id": rid, "email": body.email.strip().lower(), "note": body.note[:500], "status": "received", "ip": client_ip(request), "created_at": now()})
    return {"request_id": rid, "message": "We received your deletion request. We'll email you to confirm it's you before deleting your data."}
