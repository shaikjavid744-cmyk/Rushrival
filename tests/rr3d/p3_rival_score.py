# helper: post a plausible online run for rival so the leaderboard has another player's row
import time, requests, uuid
from dotenv import dotenv_values
B = dotenv_values("/app/mobile/.env")["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api/v1"
d = requests.post(f"{B}/auth/login", json={"email": "rival@rushrivals.test", "password": "RushRival123!"}, headers={"X-Forwarded-For": "10.3.3.3"}).json()
h = {"Authorization": f"Bearer {d['access_token']}"}
s = requests.post(f"{B}/runs/start", json={"world": "city"}, headers=h).json()
time.sleep(21)
r = requests.post(f"{B}/runs/finish", json={**s, "duration": 30, "distance": 300, "coins": 20, "score": 520}, headers={**h, "Idempotency-Key": uuid.uuid4().hex})
print(r.status_code, r.text[:200])
