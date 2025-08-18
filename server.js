const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const multer = require('multer');
const Database = require('better-sqlite3');
require('dotenv').config();

// Ensure required directories exist
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// Initialize DB
const dbPath = path.join(DATA_DIR, 'klut3rbox.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS boxes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    label TEXT
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    image_path TEXT,
    box_code TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (box_code) REFERENCES boxes(code) ON UPDATE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
  CREATE INDEX IF NOT EXISTS idx_items_box_code ON items(box_code);
  
  -- Full-text search virtual table for smarter search
  CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
    name, 
    description, 
    box_code, 
    content='items', 
    content_rowid='id',
    tokenize='porter'
  );
  
  -- Initial backfill into FTS for any rows missing
  INSERT INTO items_fts(rowid, name, description, box_code)
  SELECT id, name, coalesce(description, ''), box_code
  FROM items
  WHERE id NOT IN (SELECT rowid FROM items_fts);
  
  -- Keep FTS in sync
  CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
    INSERT INTO items_fts(rowid, name, description, box_code)
    VALUES (new.id, new.name, coalesce(new.description, ''), new.box_code);
  END;
  CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
    DELETE FROM items_fts WHERE rowid = old.id;
  END;
  CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
    UPDATE items_fts
    SET name = new.name,
        description = coalesce(new.description, ''),
        box_code = new.box_code
    WHERE rowid = new.id;
  END;
`);

// Ensure default box exists
db.prepare('INSERT OR IGNORE INTO boxes (code, label) VALUES (?, ?)').run('box1', 'Default Box 1');

// Express app
const app = express();
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(PUBLIC_DIR));

// Multer setup for image uploads
const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (_req, file, cb) {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `${timestamp}${ext}`);
  },
});
const upload = multer({ storage });

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Boxes endpoints
app.get('/api/boxes', (_req, res) => {
  const boxes = db.prepare('SELECT id, code, label FROM boxes ORDER BY code ASC').all();
  res.json(boxes);
});

app.post('/api/boxes', (req, res) => {
  const { code, label } = req.body || {};
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'code is required' });
  }
  try {
    const info = db.prepare('INSERT INTO boxes (code, label) VALUES (?, ?)').run(code, label || null);
    const box = db.prepare('SELECT id, code, label FROM boxes WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(box);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Box code already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create box' });
  }
});

// Boxes summary (with item counts)
app.get('/api/boxes/summary', (_req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT b.id, b.code, b.label, COUNT(i.id) AS item_count
         FROM boxes b
         LEFT JOIN items i ON i.box_code = b.code
         GROUP BY b.id, b.code, b.label
         ORDER BY b.code ASC`
      )
      .all();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load box summary' });
  }
});

// Update box label
app.put('/api/boxes/:code', (req, res) => {
  const code = String(req.params.code);
  const { label } = req.body || {};
  try {
    const info = db.prepare('UPDATE boxes SET label = ? WHERE code = ?').run(label || null, code);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    const box = db.prepare('SELECT id, code, label FROM boxes WHERE code = ?').get(code);
    res.json(box);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update box' });
  }
});

// Delete box (only if empty)
app.delete('/api/boxes/:code', (req, res) => {
  const code = String(req.params.code);
  try {
    const count = db.prepare('SELECT COUNT(1) AS c FROM items WHERE box_code = ?').get(code)?.c || 0;
    if (count > 0) return res.status(409).json({ error: 'Box not empty' });
    const info = db.prepare('DELETE FROM boxes WHERE code = ?').run(code);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete box' });
  }
});

// Items endpoints
app.get('/api/items', (req, res) => {
  const { box_code, limit = 100, offset = 0 } = req.query;
  const lim = Math.max(1, Math.min(500, Number(limit)));
  const off = Math.max(0, Number(offset));
  try {
    let rows;
    if (box_code) {
      rows = db
        .prepare(
          'SELECT id, name, description, image_path, box_code, created_at FROM items WHERE box_code = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
        )
        .all(String(box_code), lim, off);
    } else {
      rows = db
        .prepare(
          'SELECT id, name, description, image_path, box_code, created_at FROM items ORDER BY created_at DESC LIMIT ? OFFSET ?'
        )
        .all(lim, off);
    }
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

app.post('/api/items', (req, res) => {
  const { name, description, image_path, box_code } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const code = box_code && typeof box_code === 'string' ? box_code : 'box1';
  try {
    const existingBox = db.prepare('SELECT code FROM boxes WHERE code = ?').get(code);
    if (!existingBox) return res.status(400).json({ error: `Unknown box_code ${code}` });
    const info = db
      .prepare('INSERT INTO items (name, description, image_path, box_code) VALUES (?, ?, ?, ?)')
      .run(String(name), description ? String(description) : null, image_path ? String(image_path) : null, code);
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// Delete item by id
app.delete('/api/items/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  try {
    const item = db.prepare('SELECT id, image_path FROM items WHERE id = ?').get(id);
    if (!item) return res.status(404).json({ error: 'Not found' });

    // Attempt to remove associated image if it is in our uploads folder
    if (item.image_path && typeof item.image_path === 'string') {
      const rel = item.image_path.replace(/^\/+/, '');
      const abs = path.join(__dirname, rel);
      if (abs.startsWith(UPLOADS_DIR) && fs.existsSync(abs)) {
        try { fs.unlinkSync(abs); } catch (_) { /* ignore */ }
      }
    }

    db.prepare('DELETE FROM items WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Search endpoint
app.get('/api/search', (req, res) => {
  const qRaw = (req.query.q || '').toString().trim();
  const boxFilter = (req.query.box_code || '').toString().trim();
  if (!qRaw && !boxFilter) return res.json([]);
  try {
    // Build FTS query: support fuzzy-ish by splitting words and using prefix*
    const terms = qRaw
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/[\p{P}\p{S}]+/gu, ''))
      .filter(Boolean);
    // Build OR and AND queries for FTS
    const orQuery = terms.length ? terms.map((t) => `${t}*`).join(' OR ') : '';
    const andQuery = terms.length ? terms.map((t) => `${t}*`).join(' ') : '';

    const runFts = (matchExpr) => {
      if (!matchExpr) return [];
      if (boxFilter) {
        return db.prepare(`
          SELECT i.id, i.name, i.description, i.image_path, i.box_code, i.created_at,
                 bm25(items_fts, 1.0, 0.8, 0.3) AS rank
          FROM items_fts JOIN items i ON items_fts.rowid = i.id
          WHERE items_fts MATCH ? AND i.box_code = ?
          ORDER BY rank ASC, i.created_at DESC
          LIMIT 200
        `).all(matchExpr, boxFilter);
      }
      return db.prepare(`
        SELECT i.id, i.name, i.description, i.image_path, i.box_code, i.created_at,
               bm25(items_fts, 1.0, 0.8, 0.3) AS rank
        FROM items_fts JOIN items i ON items_fts.rowid = i.id
        WHERE items_fts MATCH ?
        ORDER BY rank ASC, i.created_at DESC
        LIMIT 200
      `).all(matchExpr);
    };

    let rows = [];
    if (terms.length) {
      // Try inclusive OR first (broader), then stricter AND if needed
      rows = runFts(orQuery);
      if (rows.length === 0) rows = runFts(andQuery);
    } else if (boxFilter) {
      rows = db.prepare(`
        SELECT i.id, i.name, i.description, i.image_path, i.box_code, i.created_at
        FROM items i
        WHERE i.box_code = ?
        ORDER BY i.created_at DESC
        LIMIT 200
      `).all(boxFilter);
    }

    // Fallback to LIKE if FTS returned nothing
    if (rows.length === 0 && terms.length) {
      const likeTerms = terms.map((t) => `%${t}%`);
      const likeConds = terms.map(() => '(name LIKE ? OR description LIKE ?)').join(' OR ');
      if (boxFilter) {
        rows = db.prepare(
          `SELECT id, name, description, image_path, box_code, created_at
           FROM items
           WHERE (${likeConds}) AND box_code = ?
           ORDER BY created_at DESC
           LIMIT 200`
        ).all(...likeTerms.flatMap((x) => [x, x]), boxFilter);
      } else {
        rows = db.prepare(
          `SELECT id, name, description, image_path, box_code, created_at
           FROM items
           WHERE ${likeConds}
           ORDER BY created_at DESC
           LIMIT 200`
        ).all(...likeTerms.flatMap((x) => [x, x]));
      }
    }

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Upload image only
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const publicPath = `/uploads/${req.file.filename}`;
  res.status(201).json({ image_path: publicPath });
});

// Vision suggest (no save): infer one or multiple items
app.post('/api/vision-suggest', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const requested = (req.body?.box_code && typeof req.body.box_code === 'string') ? req.body.box_code : 'box1';
    const exists = db.prepare('SELECT code FROM boxes WHERE code = ?').get(requested);
    const box_code = exists ? requested : 'box1';

    const publicPath = `/uploads/${req.file.filename}`;

    let suggestedItems = [];
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey });
        const fullPath = path.join(UPLOADS_DIR, req.file.filename);
        const mime = req.file.mimetype || 'image/jpeg';
        const imageBuffer = fs.readFileSync(fullPath);
        const base64 = imageBuffer.toString('base64');
        const dataUrl = `data:${mime};base64,${base64}`;

        const prompt = `You help catalog household items stored in labeled boxes. Identify distinct items in the image.
Return JSON with key "items" as an array of up to 10 objects.
Each object must have: name (3-6 words, singular), description (<= 20 words).`;

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          temperature: 0.2,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: [ { type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } } ] },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'items_schema',
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['items'],
                properties: {
                  items: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 10,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['name'],
                      properties: {
                        name: { type: 'string', minLength: 1 },
                        description: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        const content = completion.choices?.[0]?.message?.content;
        if (content) {
          try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed?.items)) {
              suggestedItems = parsed.items.filter(Boolean).map(it => ({
                name: it?.name || '',
                description: it?.description || ''
              }));
            }
          } catch (_) {}
        }
      } catch (aiErr) {
        console.warn('AI vision-suggest failed:', aiErr?.message || aiErr);
      }
    }

    if (!suggestedItems || suggestedItems.length === 0) {
      const fallbackName = path.basename(req.file.originalname || req.file.filename, path.extname(req.file.originalname || req.file.filename));
      suggestedItems = [{ name: fallbackName, description: '' }];
    }

    res.json({ items: suggestedItems, image_path: publicPath, box_code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Vision suggest failed' });
  }
});

// Quick add via image + optional AI
app.post('/api/quick-add', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const publicPath = `/uploads/${req.file.filename}`;

    let inferredName = null;
    let inferredDescription = null;

    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        // Lazy-load OpenAI client
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey });
        const fullPath = path.join(UPLOADS_DIR, req.file.filename);
        const mime = req.file.mimetype || 'image/jpeg';
        const imageBuffer = fs.readFileSync(fullPath);
        const base64 = imageBuffer.toString('base64');
        const dataUrl = `data:${mime};base64,${base64}`;

        const prompt = `You are helping catalog household items stored in labeled boxes. Given an image, provide:
1) A short item name (3-6 words, singular)
2) A one-sentence description (max 20 words)
Return only JSON with keys name and description.`;

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          temperature: 0.2,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
          response_format: { type: 'json_object' },
        });
        const content = completion.choices?.[0]?.message?.content;
        if (content) {
          try {
            const parsed = JSON.parse(content);
            inferredName = parsed.name || null;
            inferredDescription = parsed.description || null;
          } catch (_) {
            // ignore JSON parse error
          }
        }
      } catch (aiErr) {
        console.warn('AI quick-add failed, falling back:', aiErr?.message || aiErr);
      }
    }

    if (!inferredName) {
      inferredName = path.basename(req.file.originalname || req.file.filename, path.extname(req.file.originalname || req.file.filename));
    }

    const code = (req.body?.box_code && typeof req.body.box_code === 'string') ? req.body.box_code : 'box1';
    const existingBox = db.prepare('SELECT code FROM boxes WHERE code = ?').get(code);
    if (!existingBox) return res.status(400).json({ error: `Unknown box_code ${code}` });
    const info = db
      .prepare('INSERT INTO items (name, description, image_path, box_code) VALUES (?, ?, ?, ?)')
      .run(inferredName, inferredDescription, publicPath, code);
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(info.lastInsertRowid);

    res.status(201).json({ item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Quick add failed' });
  }
});

// Batch create items
app.post('/api/items/batch', (req, res) => {
  const payload = req.body || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) return res.status(400).json({ error: 'items array required' });
  if (items.length > 100) return res.status(400).json({ error: 'too many items (max 100)' });
  try {
    for (const it of items) {
      if (!it?.name || typeof it.name !== 'string') return res.status(400).json({ error: 'Each item requires name' });
      const code = (it.box_code && typeof it.box_code === 'string') ? it.box_code : 'box1';
      const existingBox = db.prepare('SELECT code FROM boxes WHERE code = ?').get(code);
      if (!existingBox) return res.status(400).json({ error: `Unknown box_code ${code}` });
    }

    const insert = db.prepare('INSERT INTO items (name, description, image_path, box_code) VALUES (?, ?, ?, ?)');
    const selectById = db.prepare('SELECT * FROM items WHERE id = ?');
    const tx = db.transaction((records) => {
      const created = [];
      for (const it of records) {
        const code = (it.box_code && typeof it.box_code === 'string') ? it.box_code : 'box1';
        const info = insert.run(String(it.name), it.description ? String(it.description) : null, it.image_path ? String(it.image_path) : null, code);
        created.push(selectById.get(info.lastInsertRowid));
      }
      return created;
    });
    const createdItems = tx(items);
    res.status(201).json({ items: createdItems });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create items batch' });
  }
});

// Fallback to SPA/static index for non-API GET routes
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
  next();
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Start HTTP server
const httpServer = app.listen(PORT, HOST, () => {
  console.log(`klut3rbox server listening at http://${HOST}:${PORT}`);
});

// Optional HTTPS for camera on mobile over LAN
try {
  const keyFile = process.env.SSL_KEY_FILE;
  const certFile = process.env.SSL_CERT_FILE;
  if (keyFile && certFile && fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    const https = require('https');
    const options = {
      key: fs.readFileSync(keyFile),
      cert: fs.readFileSync(certFile),
    };
    const SSL_PORT = Number(process.env.SSL_PORT) || 3443;
    https.createServer(options, app).listen(SSL_PORT, HOST, () => {
      console.log(`klut3rbox HTTPS at https://${HOST}:${SSL_PORT}`);
    });
  }
} catch (e) {
  console.warn('HTTPS setup failed:', e?.message || e);
}


