# ScinAsi

A lightweight personal web workspace for home-conducted scientific experiments. Built with offline-first client storage and backed by a Cloudflare Edge Gateway connected to Cloudflare D1 and Google Gemini.

---

## Architecture

- **Frontend:** Pure HTML5, CSS3, and modular Vanilla JS (`index.html`, `styles.css`, `db.js`, `sync.js`, `ai.js`, `app.js`). Hosted anywhere (GitHub Pages or local file).
- **Client Cache:** IndexedDB (`ScinAsi_LocalDB`) storing experiments, global gallery items, and outbox mutations.
- **Edge Gateway:** A Cloudflare Worker proxy (`worker.js`) executing SQL mutations on Cloudflare D1 and routing AI requests to Gemini with dual-model fallback.
- **AI Models:** Primary target `gemini-3.5-flash-lite` with automatic fallback to `gemini-3.1-flash-lite`.

---

## Cloudflare D1 Database Setup

Run this schema inside the Cloudflare D1 web console (`science-hub-db`):

```sql
CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    genre TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    duration TEXT NOT NULL,
    overview TEXT NOT NULL,
    requirements TEXT NOT NULL,
    roadmap TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS gallery_items (
    id TEXT PRIMARY KEY,
    experiment_id TEXT,
    media_type TEXT NOT NULL CHECK(media_type IN ('image', 'video')),
    url TEXT NOT NULL,
    caption TEXT,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER DEFAULT NULL,
    FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_experiments_updated ON experiments(updated_at);
CREATE INDEX IF NOT EXISTS idx_gallery_exp_id ON gallery_items(experiment_id);
CREATE INDEX IF NOT EXISTS idx_gallery_created ON gallery_items(created_at DESC);
