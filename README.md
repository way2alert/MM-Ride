# MM RIDE – Production-Ready Bike-Taxi Driver Management Platform

**MM Ride** is a complete, production-grade driver & fleet management system built specifically for bike-taxi operations. Drivers utilize company/owner-provided eligible bikes to fulfill rides on external platforms such as Ola, Uber, and Rapido.

---

## 1. System Components

The codebase is organized into three primary modules:

1. **`admin-web/`**: Responsive Admin Web Control Panel (React 18 + Vite + Leaflet Live Monitoring + Dark Glassmorphic Design System).
2. **`driver-app/`**: MM Ride – Driver Android Application (React Native / Expo with work-period GPS tracking, geofence validation, handover checklist, and 12-state lifecycle engine).
3. **`backend/`**: Firebase Backend (Cloud Functions, strict Security Rules, Storage rules, composite indexes, and database bootstrap seed scripts).

---

## 2. Business Model & Financial Formula (Phase 1)

- **Vehicles**: Company / owner provided. Authorized work use only. No transfer or sub-leasing.
- **Petrol & Maintenance**: Paid by Owner.
- **No Joining Fee / No Security Deposit**.
- **Financial Calculation Formula (Calculated Server-Side Only)**:
  $$\text{Net Ride Income} = \text{Gross Platform Income (Ola/Uber)} - \text{Applicable Platform Fees}$$
  $$\text{Worker Share} = 50\% \times \text{Net Ride Income}$$
  $$\text{Owner Share} = 50\% \times \text{Net Ride Income}$$
  $$\text{Temporary Reserve Hold} = 10\% \times \text{Worker Share}$$
  $$\text{Payable Today} = \text{Worker Share} - \text{Temporary Reserve Hold} = 45\% \times \text{Net Ride Income}$$
- **Duty Limits**: Up to 12 hours per day. 1 weekly off.

---

## 3. Core Anti-Cheating & Security Principles

1. **Client Trust Zero**: No financial, status, speed, or duty calculation is executed with client authority. All calculations happen server-side.
2. **Immutable Audit Trail**: All actions (registrations, verifications, approvals, bike handovers, duty starts/ends, settlements, and manual adjustments) append to `auditLogs`. Updates and deletes are blocked at the rule level.
3. **Authorized Hub Geofencing**: Shift start and end locations are validated against authorized depots using the Haversine distance formula.
4. **Odometer Monotonicity**: Return odometer cannot be less than pickup odometer.
5. **Work-Period Only Telemetry**: GPS tracking is activated strictly during duty shifts.

---

## 4. Driver 12-State Lifecycle Machine

1. `REGISTERED` (Phone OTP verified)
2. `DOCUMENTS_SUBMITTED` (Profile & mandatory agreements signed)
3. `DOCUMENT_VERIFICATION_PENDING` (Aadhaar, PAN, DL uploaded)
4. `ADDRESS_VERIFICATION_PENDING` (Docs verified; awaiting physical field inspection)
5. `APPROVED` (All verifications confirmed)
6. `APPROVED_BIKE_NOT_ASSIGNED` (Awaiting fleet bike allocation)
7. `BIKE_ASSIGNED` (Vehicle allocated by Operations)
8. `BIKE_HANDOVER_PENDING` (Handover inspection checklist pending)
9. `ACTIVE_DRIVER` (Handover confirmed; authorized to start shifts)
10. `SUSPENDED` (Temporarily locked by Admin)
11. `REJECTED` (Application denied with recorded reason)
12. `ACCOUNT_CLOSED` (Employment terminated / bike returned)

---

## 5. Live Firebase Project Setup

Connected Project ID: `mm-ride-6899f`

### Configuration Files:
- **`firebase.json`**: Root configuration for Firestore, Functions, Storage, and Hosting.
- **`firestore.rules`**: Strict role-based rules (`SUPER_ADMIN`, `ADMIN`, `OPERATIONS`, `FINANCE`, `VIEW_ONLY`).
- **`storage.rules`**: Strict document, handover, and earnings proof access rules.
- **`firestore.indexes.json`**: Composite query indexes.
- **`.env`**: Project credentials.

---

## 6. How to Run Locally

### A. Admin Web Portal
```bash
cd "c:\MM Ride\admin-web"
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.
- **Test Credentials**: `admin@mmride.com` / `admin123`

### B. Driver Mobile App
```bash
cd "c:\MM Ride\driver-app"
npm install
npx expo start
```
- Press `a` to run on connected Android device / emulator.
- Press `w` to run on web.
- Test mobile number: `9876543210` with test OTP `123456`.

### C. Seed Initial Hubs & Fleet Bikes
```bash
cd "c:\MM Ride\backend\functions"
npm install
npm run seed
```

---

## 7. Deployment Instructions

### Deploy Firebase Rules & Functions:
```bash
# Inside c:\MM Ride:
npx firebase deploy --only firestore:rules,firestore:indexes,storage
npx firebase deploy --only functions
```

### Build & Deploy Admin Web to Firebase Hosting:
```bash
cd "c:\MM Ride\admin-web"
npm run build
cd ..
npx firebase deploy --only hosting
```
