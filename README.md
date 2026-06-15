# 🏗️ Notion ERP Dashboard

A high-performance, enterprise-grade Next.js Progressive Web Application (PWA) tailored specifically for **internal construction site management**. 

This platform acts as a central nervous system for construction operations—bridging the gap between active construction sites and corporate management. It handles everything from real-time material requests to complex purchase order workflows and goods receipt tracking.

---

## 🌟 Key Features

### 👥 Role-Based Access Control
The application supports distinct hierarchical operations for **three primary roles** (plus Admins), ensuring strict access and approval chains:
1. **Site Engineers**: Initiate material requests, report from the ground, track deliveries, and create Goods Receipt Notes (GRN).
2. **Managers**: Review, approve, or reject material requests based on project budgets and timelines.
3. **PO Managers**: Consolidate approved requests, perform cost comparisons, and execute Purchase Orders (POs) with vendors.

### 🔄 End-to-End Supply Chain Tracking
- **Material Requests**: Multi-stage approval workflows (Draft -> Pending -> Approved -> PO Created).
- **Purchase Orders (POs)**: Automated PDF generation, smart vendor matching, and deep integration with the request pipeline.
- **Deliveries & GRN**: Live tracking of dispatches and seamless Good Receipt Notes entry right from the site.
- **Inventory Management**: Real-time stock sync preventing material shortages.

### ⚡ Best-in-Class Technical Functions
- **Real-Time Database Sync**: Powered by Convex `requests.ts` and `purchaseOrders.ts`, ensuring live updates across all user dashboards without manual refreshes.
- **Cost Comparisons (`costComparisons.ts`)**: Embedded intelligence to compare vendor quotes dynamically.
- **Integrated Comms (`chat.ts`, `stickyNotes.ts`, `presence.ts`)**: Built-in messaging and presence tracking for instant cross-team collaboration.
- **Interactive Maps (`sites.ts`, `Leaflet`)**: Geospatial tracking for deliveries and multiple construction site boundaries.
- **Installable PWA (`use-pwa.ts`)**: Fully offline-capable and installable on iOS/Android to ensure Site Engineers can work smoothly in low-network construction zones.

---

## 💻 Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (React 19)
- **Backend & Real-time DB**: [Convex](https://convex.dev/) (Type-safe & Schema-enforced)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **UI Components**: [Radix UI](https://www.radix-ui.com/) + custom glassmorphism designs.
- **Forms & Validation**: React Hook Form + Zod
- **Mapping & Charts**: React-Leaflet, Recharts
- **PDF Generation**: React-PDF, jsPDF, html2canvas
- **Data Storage**: Cloudflare R2 (for robust file/blueprint storage)

---

## 📂 Project Structure

```text
├── app/                  # Next.js App Router (Dashboards, API routes, Layouts)
├── components/           # Reusable UI Blocks (Organized by feature: GRN, POs, Chat)
│   ├── purchase/         # PO generation and multi-dialog handling
│   ├── requests/         # Material request forms
│   └── ui/               # Core design system components
├── convex/               # Backend logic, DB schema, and API Endpoints
│   ├── purchaseOrders.ts # Core PO logic
│   ├── requests.ts       # Material Request Engine
│   └── schema.ts         # Strictly typed database definitions
├── hooks/                # Custom React hooks (e.g., use-pwa)
└── public/               # Static assets & Service workers
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have Node.js version mapped correctly (check `package.json` engines) and your environment variables set up.

Create a `.env.local`:
```bash
# Convex Configuration
CONVEX_DEPLOYMENT=[your-convex-deployment]
NEXT_PUBLIC_CONVEX_URL=[your-convex-url]
CONVEX_SITE_URL=[your-convex-site]

# 3rd Party Assets & Maps
R2_ACCOUNT_ID=[...]
R2_ACCESS_KEY_ID=[...]
RESEND_API_KEY=[...]
NEXT_PUBLIC_GEOAPIFY_API_KEY=[...]

# JWT Auth
JWT_PRIVATE_KEY=[...]
JWT_PUBLIC_KEY=[...]
```

### Installation

1. **Install dependencies**:
```bash
npm install
```

2. **Start the localized development environment (Next.js + Convex)**:
```bash
npm run dev:all
```
Your internal dashboard will now be accessible at `http://localhost:3000`.

---

## 🛡️ License & Code

Designed strictly for **Internal Construction Management**. All proprietary workflows and functions are restricted to authorized personnel.
