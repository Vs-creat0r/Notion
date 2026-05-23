---
name: dashboard-executive-plan
description: Plan for executive purchase dashboard with graphs and quick-action buttons
metadata:
  type: project
  status: drafted
  tags: [dashboard, graphs, metrics, procurement-executive]
---

# Executive Purchase Dashboard Plan

## Overview
Create a fast-access, premium dashboard for procurement executives (Purchase Officers and Managers). It will visualize procurement workflows, spend analytics, request pipelines, and vendor distribution, while providing quick access to filter and take action on Purchase Orders (POs) and Material Requests (RFQs).

---

## 1. Graphs & Visualizations

| Graph | Purpose | Core Data | Visual Type | Notes |
|-------|---------|-----------|-------------|-------|
| **Daily Spend & PO Trend** | Visualize daily purchasing activity and total spend value. | `purchaseOrders._creationTime`, `totalAmount` | Area / Line Chart with Gradients | Show last 7-30 days. Smooth curves, rich tooltips. |
| **Pipeline Funnel** | Track requests as they move from CC -> PO -> Delivery -> Completed | `requests.status` | Vertical/Horizontal Funnel Bar | Color-coded by status priority (Amber to Emerald) |
| **Top Spend by Project/Site** | See which projects are consuming the most budget/materials | `requests.site`, `purchaseOrders` | Donut Chart | Interactive legend, hover effects to show exact % |
| **Top Vendors by Volume** | Identify which vendors we issue the most POs to | `vendors.name`, `purchaseOrders.vendorId` | Horizontal Bar Chart | Great for vendor relationship and negotiation insights |

*Implementation details*:  
- Use **recharts** (already installed) with customized `<Tooltip />` and gradients (`<defs><linearGradient/></defs>`).  
- Components live in `components/purchase/purchase-dashboard-graphs.tsx` or separated out.
- Ensure 100% responsiveness on mobile devices via `ResponsiveContainer`.

---

## 2. Executive Metrics & KPIs (Quick Actions)

| KPI Card | Metric | Visuals | Action / Link |
|----------|--------|---------|---------------|
| **Pending CC/RFQs** | Count of requests awaiting CC approval or PO creation | Warning Icon (Amber) | Click to jump to Requests tab |
| **Active Deliveries** | Count of POs currently in "Ordered" or "Transit" status | Truck Icon (Blue) | Click to jump to POs tab |
| **Total Daily Spend** | Total monetary value of POs issued today | TrendingUp Icon (Purple) | Sparkline background indicating weekly trend |
| **Open GRNs** | Count of pending Goods Receipt Notes | Check-circle Icon (Emerald) | Click to jump to GRN tab |

---

## 3. Data Sources & Convex Integration

| Source | Endpoint | Data Used |
|--------|----------|-----------|
| **Requests** | `api.requests.getAllRequests` | `{ status, site, _creationTime }` |
| **Purchase Orders** | `api.purchaseOrders.getAllPurchaseOrders` | `{ status, totalAmount, vendorId, _creationTime }` |
| **Vendors** | `api.vendors.getAll` | `{ _id, name }` |

*Performance Note*: Calculate aggregations via `useMemo` locally for immediate UI rendering, or build a dedicated Convex internal query if data scale requires server-side aggregation.

---

## 4. Acceptance Criteria & UI-UX Goals

- **Premium Aesthetics**: Use subtle borders, blurred backgrounds (glassmorphism if applicable), and vibrant semantic colors matching the theme.
- **Micro-interactions**: Hovering over a chart segment highlights it and dims the rest. Cards lift slightly on hover.
- **Responsiveness**: The grid intelligently reflows. Graphs stack cleanly on mobile without horizontal scrolling or squishing.
- **Zero Loading Jumps**: Use beautiful skeleton loaders while Convex queries are `undefined`.
- **Accuracy**: Data strictly maps to the current DB schema and statuses (`ready_for_cc`, `ordered`, `delivered`).

---

*Prepared for Implementation Review - Awaiting Approval*