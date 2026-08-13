from pathlib import Path

env = Path(__file__).resolve().parents[1] / ".env"
text = env.read_text(encoding="utf-8")
urls = []
for line in text.splitlines():
    s = line.strip()
    if "DATABASE_URL=" not in s or s.startswith("DATABASE_URL_"):
        continue
    raw = s.lstrip("#").strip()
    if not raw.startswith("DATABASE_URL="):
        continue
    url = raw.split("=", 1)[1].strip().strip('"').strip("'")
    if "@" not in url:
        continue
    host = url.split("@", 1)[1]
    urls.append((host, url))

out_dir = Path(__file__).resolve().parents[1]
for i, (host, url) in enumerate(urls):
    print(f"{i} HOST {host}")
    (out_dir / f".env.live.{i}.tmp").write_text(f"DATABASE_URL={url}\n", encoding="utf-8")
print(f"COUNT {len(urls)}")
