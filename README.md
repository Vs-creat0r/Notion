# Site Engineer Follow-up Website — Walkthrough

## What Was Built

A **mobile-first responsive website** for site engineers to capture/upload photos, auto-detect GPS location with area names, extract text from images via OCR, and export all follow-up data to Excel.

---

## Project Structure

```
Site-follow-up/
├── app.py              ← Flask backend (all API routes)
├── database.py         ← SQLite helper (CRUD functions)
├── requirements.txt    ← Python dependencies
├── site_followup.db    ← Auto-created SQLite database
├── uploads/            ← Stored photos
├── templates/
│   └── index.html      ← Main page (SPA)
└── static/
    ├── css/style.css   ← Mobile-first dark theme
    └── js/app.js       ← Frontend logic (geolocation, OCR, CRUD)
```

---

## Key Features

| Feature | How It Works |
|---------|-------------|
| 📸 **Photo Capture** | Uses `<input capture="environment">` to open device camera directly |
| 📁 **Photo Upload** | Standard file picker, accepts any image format |
| 📍 **GPS Location** | Browser Geolocation API with `enableHighAccuracy: true` → Nominatim reverse geocoding for area name |
| 📄 **OCR Text Extraction** | Tesseract.js runs client-side in the browser — no server install needed |
| 👷 **Name CRUD** | Bottom sheet modal to add/edit/delete engineer names |
| 📊 **Excel Export** | openpyxl generates `.xlsx` with Date header, Time/Name/Location/Photo columns, and embedded photos |

---

## How to Run

```bash
cd "d:\Programs\N8N Sites\Business\Notion\Site-follow-up"
pip install -r requirements.txt
python app.py
```

Server starts at **http://localhost:5000** (also accessible on your local network at `http://<your-ip>:5000`)

---

## API Verification Results

| Test | Result |
|------|--------|
| `GET /` (main page) | ✅ HTTP 200 |
| `GET /api/names` | ✅ Returns `[]` |
| `POST /api/names` with `{"name": "Rahul Sharma"}` | ✅ Returns `{"id": 1, "name": "Rahul Sharma"}` |
| `GET /api/entries` | ✅ Returns `[]` |

---

## Mobile Access

> [!TIP]
> To test on your phone, connect to the same WiFi network and open `http://192.168.29.40:5000` in your phone browser. The GPS location feature and camera capture will work best on mobile.
