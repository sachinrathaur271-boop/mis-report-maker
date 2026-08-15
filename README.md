# MIS Report Maker — Production Setup Guide

Yeh package do parts mein hai:
- `backend/` — Node.js + Express API (auth, MongoDB, Razorpay billing, report engine)
- `frontend/app.html` — login/signup + upload + dashboard + Razorpay checkout UI

## 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

`.env` mein fill karo:

1. **MONGO_URI** — MongoDB Atlas free cluster bana lo (mongodb.com/atlas), connection string paste karo.
2. **JWT_SECRET** — koi bhi random 40+ character string.
3. **RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET** — Razorpay Dashboard → Settings → API Keys se lo (business KYC complete hona chahiye — proprietorship bhi chalta hai).
4. **RAZORPAY_WEBHOOK_SECRET** — Dashboard → Webhooks → naya webhook banate waqt jo secret set karoge wahi yaha daalo.

Run:
```bash
npm run dev
```
API `http://localhost:5000` par chalega.

## 2. Frontend Setup

`frontend/app.html` mein line dekho:
```js
const API_BASE = "http://localhost:5000/api";
```
Ise apne deployed backend URL se replace karo (production mein).

Isko kisi bhi static host par daal sakte ho — Vercel, Netlify, ya simple `npx serve frontend`.

## 3. Deployment (recommended, free/cheap tiers)

| Part | Recommended host |
|---|---|
| Backend (Node API) | Render.com (free tier) ya Railway.app |
| Database | MongoDB Atlas (free 512MB tier) |
| Frontend | Vercel / Netlify (free) |
| Payments | Razorpay (test mode free, live mode needs KYC) |

Deploy steps (Render example):
1. GitHub repo bana kar `backend/` push karo.
2. Render → New Web Service → repo connect → Build: `npm install`, Start: `npm start`.
3. Environment tab mein `.env` ke saare variables add karo.
4. Deploy hone ke baad jo URL milega, wahi `API_BASE` frontend mein daal do.

## 4. Payments — Manual UPI Flow

Abhi koi payment gateway integrate nahi hai. Flow simple hai:

1. User "Upgrade" click karta hai → UPI ID (`sachinrathaur271@okhdfcbank`) aur amount ke saath ek UPI pay button dikhta hai (mobile par seedha GPay/PhonePe/Paytm khulta hai)
2. User payment karke WhatsApp button dabata hai → pre-filled message ke saath `+91 9711685549` par screenshot bhejta hai
3. **Tum** payment confirm karke ise curl/Postman se manually upgrade karte ho:

```bash
curl -X POST https://<your-backend-domain>/api/billing/admin/upgrade \
  -H "Content-Type: application/json" \
  -H "x-admin-key: <tumhara JWT_SECRET>" \
  -d '{"email":"user@example.com","plan":"199"}'
```

Pending requests dekhne ke liye (jinhone Upgrade click kiya hai but abhi confirm nahi hua):
```bash
curl https://<your-backend-domain>/api/billing/admin/pending-requests \
  -H "x-admin-key: <tumhara JWT_SECRET>"
```

Monthly auto-downgrade (30 din baad plan expire) ke liye `/api/billing/cron/downgrade-expired` ko daily cron (Render Cron Job / cron-job.org) se hit karwao, header `x-cron-key: <JWT_SECRET>` ke saath.

> Baad mein jab chaho, isi backend mein Razorpay/UPI gateway wapas plug kar sakte ho — routes already isi structure ke around bane hain.

## 5. Business Templates

`backend/utils/templates.js` mein teen ready templates hain:
- **retail** — Revenue, Units Sold, Gross Margin, Top Product/Region
- **mis** — Department-wise value, Completion %, general operational KPIs
- **finance** — Income vs Expense, Net Cashflow, Top Expense Head, Avg Monthly Burn

Naya business type add karna ho to isi file mein ek naya object add karo (`columnHints`, `kpis`, `charts`) — engine automatically use kar lega, koi aur code change nahi chahiye.

## 6. What's NOT included (needs your setup)

- Automated payment verification (abhi manual — tum khud confirm karke upgrade karte ho)
- Production domain + SSL
- Email verification / password-reset flow (currently basic email+password only)
- File storage for uploaded originals (currently only cleaned data + KPIs are saved in DB, not the raw file — add S3/Cloudinary if you want to keep originals)
