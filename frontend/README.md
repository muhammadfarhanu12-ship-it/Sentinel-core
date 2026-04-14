<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/bdf6d9c8-96b0-4798-bfe7-cb93f3bde2c2

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and configure the backend URLs:
   `VITE_API_URL=https://sentinel-core-xcrz.onrender.com`
   `VITE_API_WS_URL=wss://sentinel-core-xcrz.onrender.com`
   `VITE_ADMIN_API_BASE_URL=https://sentinel-core-xcrz.onrender.com/api/v1/admin`
4. Run the app:
   `npm run dev`
