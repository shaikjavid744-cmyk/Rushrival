"""Optional: seed ONE published demo news article (the site ships with none). python seed_demo_article.py [--remove]"""
import asyncio
import sys

from rr.core import get_db, now


async def main():
    db = get_db()
    if "--remove" in sys.argv:
        await db.news.delete_one({"news_id": "news_demo"})
        print("removed")
        return
    await db.news.update_one({"news_id": "news_demo"}, {"$setOnInsert": {
        "news_id": "news_demo", "slug": "temple-rush-is-live", "title": "Temple Rush is live!", "status": "published", "seed": "demo",
        "summary": "Collect 50 golden tokens in a single Temple run to win gems and coins.",
        "body": "The first Rush Rivals event is here. Head to the Temple, grab golden tokens and climb the event leaderboard.\n\nGood luck, Rival!",
        "image_url": "/api/static/game/world_temple.jpg", "created_by": "seed", "created_at": now(), "updated_at": now(), "published_at": now()}}, upsert=True)
    print("seeded demo article")


if __name__ == "__main__":
    asyncio.run(main())
