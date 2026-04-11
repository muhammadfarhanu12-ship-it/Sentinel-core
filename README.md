<<<<<<< HEAD
# Sentinel-core
Cybersecurity tool to protect prompt 

## API versioning

All REST endpoints are available under `GET /api/v1/*` (recommended).

Legacy routes under `GET /api/*` are kept for compatibility.

## Security Logs API

### REST: `GET /api/v1/logs`
Query params (all optional):
- `limit` (1–1000, default 100)
- `offset` (default 0)
- `status` (`CLEAN` | `BLOCKED` | `REDACTED`)
- `threat_type` (string)
- `api_key_id` (int)
- `start_time` / `end_time` (ISO datetime, e.g. `2026-01-01T00:00:00Z`)
- `q` (keyword search across `endpoint`, `method`, `threat_type`)

Example:
`/api/v1/logs?limit=100&status=CLEAN&threat_type=SQL&api_key_id=1&start_time=2026-01-01T00:00:00Z&end_time=2026-01-31T23:59:59Z&q=/api/v1/scan`

### WebSocket: `/ws/logs`
Streams newly-created security logs to all connected clients in real time.

## Reports API

### `GET /api/v1/reports/threat-counts`
Query params (all optional):
- `granularity` (`daily` | `weekly`, default `daily`)
- `days` (1–365, default 30)
- `start_time` / `end_time` (ISO datetime)

### `GET /api/v1/reports/remediations`
Query params (all optional):
- `limit` (1–500, default 100)
- `offset` (default 0)
- `start_time` / `end_time` (ISO datetime)

### Exports
- `GET /api/v1/reports/threat-counts/export?format=csv|json`
- `GET /api/v1/reports/remediations/export?format=csv|json`
=======
#  Sentinel-Core: Autonomous AI Security Gateway
**An Intelligent Firewall & ASOC for the Agentic Era**

Sentinel-Core is a production-ready security gateway designed to protect LLM-based applications from emerging threats. Built on **Gemini 2.0 Flash**, it acts as a high-performance security layer that intercepts, analyzes, and mitigates threats in real-time.

---

## Project Demo
[Click here to watch the Project Demo](https://youtube.com/watch?v=Smoazm87aEE&si=oO_oi24Mp9i3gUFw) Note: This video showcases the live autonomous mitigation and Gemini-powered reasoning in action.*

---

## Key Features
* **Autonomous Threat Mitigation:** Executes system-level actions (IP Blocking, Server Isolation) based on high-confidence Gemini analysis.
* **Multimodal Security Audit:** Cross-references live dashboard visuals with backend logs to detect "Ghost Attacks."
* **Chain of Thought (CoT) Reasoning:** Provides a real-time "Reasoning Window" for security analysts to understand exactly *why* a request was flagged.
* **Privacy-First Redaction:** Integrated PII scanner that masks sensitive data (Emails, Passwords, Keys) before it reaches the cloud.
* **Full Admin Suite:** Manage API keys, monitor global threat volume, and control AI voice assistance from a single command center.

---

## Powered by Gemini API
Sentinel-Core leverages the **Gemini 2.0 Flash** model for its extreme speed and multimodal capabilities. The system is architected to utilize the **Free Tier** for rapid prototyping while remaining "Enterprise Ready" for Vertex AI deployment.

---

## Project Structure
```text
sentinel-core/
├── backend-ai/           # FastAPI Security Service
│   ├── app/              # Core Logic & Gemini Integration
│   ├── tests/            # Security Test Suites
│   └── requirements.txt  # Python Dependencies
├── frontend/             # React Dashboard & Playground
│   ├── src/              # UI Components & Hooks
│   └── package.json      # Node.js Dependencies
└── README.md             # Project Master Documentation

Installation & Setup
1. Backend Setup
cd backend-ai
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
# Create a .env file with your GEMINI_API_KEY
uvicorn app.main:app --reload

2. Frontend Setup
cd frontend
npm install
npm run dev

Dashboard Insight
Our central dashboard tracks 14,000+ threats with real-time distribution across Injections, PII Leaks, and Toxicity.
Disclaimer
Developed for the Gemini API Developer Competition 2026. This project showcases the power of autonomous AI in cybersecurity. Always ensure production-grade encryption is used alongside Sentinel-Core for enterprise data.

---

### Final Steps to Finish Your Submission:

1.  **YouTube Link:** Replace `YOUR_YOUTUBE_LINK_HERE` with the link you get after uploading to YouTube.
2.  **Asset Path:** I used `./assets/IMG-20260311-WA0005.jpg`. Make sure you create a folder named `assets` on GitHub and upload your dashboard image there, or update the path to match wherever you uploaded that image.
3.  **Sync:** Don't forget to `git add .`, `git commit -m "Finalized Master README"`, and `git push` to make it live on your repository.

**Would you like me to write the "Project Summary" text (the short blurb) for the actual competition submission form now?**
>>>>>>> 2b347bf808c4cd403ff9b05fc7698cf0cff91a88
