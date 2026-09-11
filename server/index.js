const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { randomUUID: uuidv4 } = require("crypto");
const { FILTERS, CATEGORIES } = require("./filters");

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const sessions = new Map();

setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, s] of sessions.entries()) {
    if (s.createdAt < cutoff) {
      try {
        fs.unlinkSync(path.join(UPLOAD_DIR, s.filename));
      } catch (_) {}
      sessions.delete(id);
    }
  }
}, 60 * 60 * 1000).unref();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safe = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : ".jpg";
    cb(null, `${uuidv4()}${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image uploads are allowed"));
    }
    cb(null, true);
  },
});

app.get("/api/filters", (_req, res) => {
  res.json({
    count: FILTERS.length,
    categories: CATEGORIES,
    filters: FILTERS.map(({ id, name, category, tier }) => ({
      id,
      name,
      category,
      tier: tier || "free",
    })),
  });
});

app.get("/api/filters/:id", (req, res) => {
  const filter = FILTERS.find((f) => f.id === req.params.id);
  if (!filter) return res.status(404).json({ error: "Filter not found" });
  res.json(filter);
});

app.post("/api/upload", (req, res) => {
  upload.single("photo")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Upload failed" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No photo uploaded. Choose an image first." });
    }
    const sessionId = uuidv4();
    sessions.set(sessionId, {
      filename: req.file.filename,
      originalName: req.file.originalname,
      mime: req.file.mimetype,
      createdAt: Date.now(),
    });
    res.json({
      sessionId,
      url: `/api/photo/${sessionId}`,
      originalName: req.file.originalname,
      size: req.file.size,
      message: "Photo uploaded. Filters are now available.",
    });
  });
});

app.get("/api/photo/:sessionId", (req, res) => {
  const s = sessions.get(req.params.sessionId);
  if (!s) return res.status(404).json({ error: "Session expired or not found. Upload a photo again." });
  const filePath = path.join(UPLOAD_DIR, s.filename);
  if (!fs.existsSync(filePath)) {
    sessions.delete(req.params.sessionId);
    return res.status(404).json({ error: "Photo file missing. Upload again." });
  }
  res.setHeader("Cache-Control", "private, max-age=300");
  res.type(s.mime || "image/jpeg");
  res.sendFile(filePath);
});

app.delete("/api/session/:sessionId", (req, res) => {
  const s = sessions.get(req.params.sessionId);
  if (s) {
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, s.filename));
    } catch (_) {}
    sessions.delete(req.params.sessionId);
  }
  res.json({ ok: true });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, filters: FILTERS.length, sessions: sessions.size });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Motio2Edit Filters running on http://0.0.0.0:${PORT}`);
  console.log(`${FILTERS.length} filters ready — UI locked until photo upload`);
});
