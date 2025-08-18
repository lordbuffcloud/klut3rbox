## klut3rbox

Local-first web app to catalog items in labeled boxes. Runs on your home network, stores data in a local SQLite database, supports photo quick-add, and can optionally use AI to suggest item names/descriptions from images.

Repository: [lordbuffcloud/klut3rbox](https://github.com/lordbuffcloud/klut3rbox)

### Features

- Simple, private inventory for your storage boxes
- Works offline on your LAN (no cloud required)
- Drag-and-drop or camera image upload for quick adds
- Optional AI assist for naming/description (if `OPENAI_API_KEY` is set)
- Fast search powered by SQLite FTS5

---

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm (comes with Node)
- OS: Windows, macOS, or Linux

No external database required. All data stays in the app folder under `data/` and `uploads/`.

---

### Quick Start (Clone, Install, Run)

1) Clone the repo

```bash
git clone https://github.com/lordbuffcloud/klut3rbox.git
cd klut3rbox
```

2) Install dependencies

```bash
npm install
```

3) (Optional) Configure environment

Create a `.env` file in the project root to override defaults and/or enable AI:

```
# Optional: enable AI-powered suggestions in /api/quick-add and /api/vision-suggest
OPENAI_API_KEY=your_openai_api_key

# Server bind and port (defaults shown)
HOST=0.0.0.0
PORT=3000

# Optional HTTPS (useful for camera access on mobile over LAN)
SSL_KEY_FILE=
SSL_CERT_FILE=
SSL_PORT=3443
```

4) Start the server

```bash
npm start
```

You should see a log like:

```
klut3rbox server listening at http://0.0.0.0:3000
```

5) Open the app

- On the same machine: `http://localhost:3000`
- From another device on your network: `http://<your-LAN-IP>:3000`

If Windows shows a firewall prompt the first time you run the server, allow access on Private networks so phones/tablets can reach it.

---

### Using the App (Basics)

- Add boxes (e.g., `box1`, `box2`) and give them labels
- Add items with name/description, optionally upload a photo
- Search by name/description; results are fast via SQLite FTS
- Default box `box1` is created automatically

Optional AI quick-add:

- Upload an image in the UI, and the app can suggest a name/description
- Requires `OPENAI_API_KEY` set in `.env`

---

### HTTPS for Mobile Camera (Optional)

Some mobile browsers need HTTPS to grant full camera access. If you want to enable HTTPS on your LAN:

1) Create or obtain a certificate and key file (self-signed is fine for LAN)
2) Set these in `.env`:

```
SSL_KEY_FILE=path\to\key.pem
SSL_CERT_FILE=path\to\cert.pem
SSL_PORT=3443
```

3) Restart `npm start` and open `https://<your-LAN-IP>:3443`

Tip: On macOS/Linux you can use `mkcert` to generate trusted local certs. On Windows, `mkcert` also works if you install it and its root CA.

---

### Data & Storage

- Database file: `data/klut3rbox.db` (WAL mode is enabled)
- Uploaded images: `uploads/`
- Both `data/` and `uploads/` are ignored by git and remain local to your machine

Backup:

1) Stop the server
2) Copy the `data/` and `uploads/` folders to your backup location

Restore:

1) Stop the server
2) Copy your backup `data/` and `uploads/` back into the project folder

---

### API Reference (Short)

Base URL: `http://localhost:3000`

- GET `/api/health`
  - Returns `{ status: "ok" }`

- GET `/api/boxes`
- POST `/api/boxes` JSON `{ code, label }`

- GET `/api/boxes/summary`
  - Returns boxes with item counts

- PUT `/api/boxes/:code` JSON `{ label }`
- DELETE `/api/boxes/:code`

- GET `/api/items?box_code=box1&limit=50&offset=0`
- POST `/api/items` JSON `{ name, description?, image_path?, box_code? }`
- DELETE `/api/items/:id`

- GET `/api/search?q=needle[&box_code=box1]`

- POST `/api/upload` multipart form: `image=@/path/to/file.jpg`
  - Returns `{ image_path: "/uploads/<file>" }`

- POST `/api/quick-add` multipart form: `image=@/path/to/file.jpg` (optional AI)
  - Returns `{ item }` saved into `box1` unless `box_code` is provided

- POST `/api/vision-suggest` multipart form: `image=@/path/to/file.jpg`
  - Returns `{ items: [ { name, description } ], image_path, box_code }` without saving items

Example (curl) – upload an image, then create an item referencing it:

```bash
# 1) Upload an image
curl -F image=@/path/to/photo.jpg http://localhost:3000/api/upload

# => { "image_path": "/uploads/17123456789.jpg" }

# 2) Create an item (to box1 by default)
curl -H "Content-Type: application/json" -d '{
  "name": "Red extension cord",
  "description": "25ft, indoor/outdoor",
  "image_path": "/uploads/17123456789.jpg"
}' http://localhost:3000/api/items
```

---

### Configuration

Env variables (via `.env` or shell):

- `OPENAI_API_KEY` – enable AI suggestions in quick-add/vision-suggest
- `HOST` – bind address (default `0.0.0.0`)
- `PORT` – HTTP port (default `3000`)
- `SSL_KEY_FILE`, `SSL_CERT_FILE`, `SSL_PORT` – enable optional HTTPS on LAN

---

### Troubleshooting

- Port already in use: change `PORT` in `.env` or stop the other service
- Cannot access from phone/tablet: ensure your PC and phone are on the same Wi‑Fi and that Windows/macOS firewall allows the Node process on Private networks
- AI suggestions do nothing: confirm `OPENAI_API_KEY` is set and valid; check server logs for warnings
- Images not showing: confirm the `uploads/` path returned by the API is reachable at `http://<host>:<port>/uploads/<file>`

---

### Development

```bash
npm run dev   # same as npm start in this project
```

Folder structure:

- `public/` – frontend assets and index.html
- `server.js` – Express API and static hosting
- `data/` – SQLite database
- `uploads/` – user-uploaded images

---

### License

ISC License. See `LICENSE` if present.

