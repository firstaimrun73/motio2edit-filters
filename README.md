# Motio2Edit Filters

YouCut-style photo filter studio with **100 live looks**.

## Rule

**Filters are hidden until a photo is uploaded.**
The upload goes through the Express backend (`POST /api/upload`). Only then does the editor + live thumbnail strip appear — every thumb is *your* photo with that look applied (no stock filter images).

## Stack

- **Backend:** Node.js + Express + Multer (upload sessions)
- **Frontend:** Vanilla HTML/CSS/JS (Motio2Edit orange UI)
- **Rendering:** CSS filters + blend overlays in the browser; canvas export to JPEG

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/filters` | Catalog (id, name, category, tier) |
| GET | `/api/filters/:id` | Full filter recipe |
| POST | `/api/upload` | `multipart/form-data` field `photo` → `{ sessionId, url }` |
| GET | `/api/photo/:sessionId` | Serve uploaded image |
| DELETE | `/api/session/:sessionId` | Remove session |
| GET | `/api/health` | Health check |

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000

## Categories

Natural · Portrait · Cinematic · Film · Mono · Color · Vintage · Mood
