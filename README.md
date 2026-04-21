# Better HN

An alternative frontend for Hacker News available at [bhn.vercel.app](https://bhn.vercel.app).

This fork keeps the original app lightweight while adding a few practical improvements for daily use.

## What This Fork Improves

- System theme mode, alongside light and dark.
- Better comment reading on mobile, including smoother in-page navigation and cleaner thread spacing.
- Built-in RSS feeds under `/rss`, including frontpage, newest, ask, show, polls, best, active, classic, and best comments.
- Docker runtime and container-friendly deployment setup.
- Official Hacker News favicon set.

See `CHANGES.md` for the full fork-specific change log.

## Docker

Create a `compose.yaml` with the published image:

```yaml
services:
  web:
    image: ghcr.io/karamanliev/better-hn:latest
    ports:
      - "3000:3000"
    restart: unless-stopped
```

Then run:

```sh
docker compose up -d
```

Then open `http://localhost:3000`.

[![Screenshot](https://github.com/user-attachments/assets/17fb41fa-04ac-4b9e-840b-f37ffc17e260)](https://bhn.vercel.app)

[![Screenshot](https://github.com/user-attachments/assets/5504a3ae-8bbc-4db6-a413-82e25dc546d9)](https://bhn.vercel.app)
