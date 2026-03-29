# Savor — Catering Reservation & Ordering System (v2)

A full-stack catering platform built on Supabase, overhauled with a luxury editorial food aesthetic, new features, tightened security, and production-grade code quality.

---

## What Changed in v2

### 🎨 UI/UX Redesign
- **New aesthetic**: Warm editorial / luxury food magazine — Fraunces serif headings, DM Sans body, terracotta + espresso + cream palette
- **Login page**: Split-screen layout with animated hero panel and brand stats
- **Cart**: Replaced modal with a slide-in drawer featuring quantity +/− controls and live subtotal/tax/total
- **Product cards**: Category tags, smooth hover zoom, loading skeletons while data fetches
- **Order history**: Timeline-style cards with colored status badges
- **Profile page**: Avatar initials, member stats (total orders, completed, amount spent)
- **Admin dashboard**: Sidebar navigation, stats with progress bars, table-based order management, char-limited product form with live counter
- **Toast notifications**: All `alert()` calls replaced with styled toast system (success / error / warning / info)

### 🔒 Security
- **Admin registration is hidden**: The register form no longer has a public "Admin" dropdown. Users must tick a checkbox to reveal an invite code field
- **Admin invite code**: Set `ADMIN_INVITE_CODE` in `auth.js` (default: `SAVOR_ADMIN_2024`) — change this before deploying
- **Client-side validation**: Email format, password length (8+), required fields — all validated before any API call
- **Input sanitization**: `escHtml()` used throughout to prevent XSS in dynamic HTML
- **Password strength meter**: 4-bar visual feedback on registration

### ✨ New Features
- **Product categories**: Admin assigns a category (Starters, Mains, Desserts, Beverages, Snacks, Specials) per product
- **Search**: Live debounced search bar in navbar filters products by name/description
- **Category filter pills**: One-click category filtering on the menu page
- **Quantity controls**: Cart drawer has +/− buttons per item (not just remove)
- **Service charge**: 5% service charge auto-calculated in cart footer
- **Order reviews**: Completed orders show a ⭐ Review button; stored in the `review` JSONB field on the `orders` table
- **Admin stats breakdown**: Recent orders list + order status bar chart on dashboard
- **Bulk delete**: Checkbox-select multiple products and delete at once
- **Admin email display**: Admin's email shown in the navbar
- **Real-time updates**: Supabase realtime subscriptions kept for both products and orders

### 🛠 Code Quality
- All `alert()` → `showToast()` (exported from `firebase-config.js`)
- Loading states on all async buttons (spinner + disabled state)
- Centralized `setButtonLoading()` helper
- `escHtml()` sanitizer used for all user-sourced content rendered as HTML
- Cart persisted to `sessionStorage` (not `localStorage`, resets on tab close)
- `Promise.all()` for parallel stats queries
- Lazy section loading — orders/products only fetched when navigated to

---

## Database Changes Required

Add a `category` column to your `products` table:
```sql
ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'specials';
```

Add a `review` column to your `orders` table (for the review feature):
```sql
ALTER TABLE orders ADD COLUMN review JSONB;
```

All other table schemas remain the same as v1.

---

## Admin Invite Code

The default code is `SAVOR_ADMIN_2024`. Change it before deploying:

```javascript
// js/auth.js — line 7
const ADMIN_INVITE_CODE = 'YOUR_SECRET_CODE_HERE';
```

In production, validate this server-side using a Supabase Edge Function.

---

## Project Structure

```
catering-system/
├── index.html          # Login / Register (split-screen)
├── admin.html          # Admin dashboard (sidebar layout)
├── user.html           # User dashboard (menu + cart drawer)
├── css/
│   └── styles.css      # Full design system (CSS variables + components)
├── js/
│   ├── firebase-config.js   # Supabase client + showToast + logAction
│   ├── auth.js              # Auth logic + validation + admin invite code
│   ├── admin.js             # Admin: products, orders, stats, bulk delete
│   └── user.js              # User: browse, cart, orders, profile, reviews
└── README.md
```

---

## Setup

Same Supabase setup as v1. See the original README for table creation SQL and RLS policies.
Update `firebase-config.js` with your Supabase URL and anon key.
