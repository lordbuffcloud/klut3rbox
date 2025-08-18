## klut3rbox

Local web app to catalog items in labeled boxes. Runs on home network, stores data in SQLite, supports camera quick-add with optional AI.

### Setup

1) Install dependencies:

```bash
npm install
```

2) Optional: copy `.env.example` to `.env` and fill values:

```
OPENAI_API_KEY=your_key_if_using_ai
PORT=3000
HOST=0.0.0.0
SSL_KEY_FILE=path_to_key_optional
SSL_CERT_FILE=path_to_cert_optional
SSL_PORT=3443
```

3) Start the app:

```bash
npm run start
```

Open `http://<your-LAN-IP>:3000` from devices on your network.

### Data locations

- Database: `data/klut3rbox.db`
- Uploads: `uploads/`

### API Summary

- GET `/api/health`
- GET `/api/boxes`
- POST `/api/boxes` { code, label }
- GET `/api/items?box_code=box1&limit=50&offset=0`
- POST `/api/items` { name, description?, image_path?, box_code? }
- GET `/api/search?q=needle`
- POST `/api/upload` multipart `image`
- POST `/api/quick-add` multipart `image` (uses AI if configured, saves to `box1`)


