# 🛡️ MM Ride – Production Enterprise MDM Architecture & Specification

## Target Device
* **Hardware Model**: Redmi Note 9 (Xiaomi `merlin` / `merlinx`)
* **OS / ROM**: MIUI Global 14.0.3 Stable (Based on Android 13, API Level 33)
* **Designation**: Company-Owned Dedicated Fleet Device (COSU - Corporate-Owned Single-Use)
* **Primary Business App**: MM Ride Driver App (`com.mmride.driver`)

---

## 1. System Architecture

```mermaid
graph TD
    CloudAdmin["MM Ride Cloud MDM Console<br/>(Firebase / Node.js Backend)"] -->|Policy JSON / REST API| CloudDPC["Android Management API (AMAPI)<br/>OR Custom MM Ride DPC<br/>(com.mmride.dpc)"]
    CloudDPC -->|Device Owner Privileges (API 33)| DevicePolicyManager["Android DevicePolicyManager Subsystem<br/>(Redmi Note 9 - Android 13)"]
    DevicePolicyManager -->|LockTask / Kiosk Mode| DriverApp["MM Ride Driver Application<br/>(com.mmride.driver)"]
    DevicePolicyManager -->|Whitelisted Auxiliary| SystemDialer["System Phone Dialer<br/>(Emergency / Passenger Calls)"]
    DevicePolicyManager -->|Whitelisted Auxiliary| NavMaps["Google Maps Navigation<br/>(Turn-by-Turn Navigation)"]
    DevicePolicyManager -->|Enforce Restrictions| SystemLock["System Lockdown<br/>- Anti-Mock GPS<br/>- Block Settings & USB<br/>- Block Uninstall & Clear Data<br/>- Enforce FRP"]
```

---

## 2. Production vs Testing Architecture

| Dimension | Development / Testing Setup (Current) | Production Architecture (Target) |
|---|---|---|
| **DPC Agent** | `com.afwsamples.testdpc` (Google TestDPC) | **Android Management API (AMAPI CloudDPC)** OR **Custom MM Ride DPC (`com.mmride.dpc`)** |
| **Provisioning Channel** | Manual USB ADB (`dpm set-device-owner`) | **6-Tap QR Code Provisioning** or **Google Zero-Touch Provisioning (ZTP)** |
| **Reset Persistence** | **DOES NOT SURVIVE FACTORY RESET**. If wiped via recovery, DO is lost. | **Zero-Touch / FRP Protected**. Upon factory wipe, device re-enters enterprise setup automatically. |
| **Policy Delivery** | Manual UI toggles on phone screen | **Cloud-Managed Push** (Instant policy updates over LTE/Wi-Fi from MM Ride Admin Web) |
| **Driver App Deployment** | Manual ADB sideload (`adb install`) | **Managed Google Play Private Track** or **Silent DPC PackageInstaller** |

---

## 3. Production Enrollment Methods

### A. 6-Tap QR Code Enrollment (Recommended for Redmi Note 9)
1. On a fresh or factory-reset Redmi Note 9, tap the **Welcome / MIUI 14 Setup screen 6 times** in the same spot.
2. The phone activates the embedded Android Enterprise camera scanner.
3. Connect to Wi-Fi.
4. Scan the MM Ride Enterprise Enrollment QR code.
   * The QR code payload contains JSON metadata:
   ```json
   {
     "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.google.android.apps.work.clouddpc/.receivers.CloudDeviceAdminReceiver",
     "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": "https://play.google.com/managed/download/clouddpc.apk",
     "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
       "enrollmentToken": "MM_RIDE_FLEET_TOKEN_XYZ"
     },
     "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true
   }
   ```
5. Android automatically downloads the DPC and provisions it as **Permanent Device Owner** before the driver can ever reach the launcher.

### B. Development ADB Method (Current Migration / Testing Path)
* Used strictly during development when the device already has system files installed and operator does not want to factory-reset.
* **Pre-requisite**: 0 accounts registered on the device.
* **Command**:
  ```bash
  adb shell dpm set-device-owner com.afwsamples.testdpc/.DeviceAdminReceiver
  ```
* **Limitation**: If wiped from Recovery mode, the Device Owner must be re-applied manually via USB.

---

## 4. Application Whitelist & System Subsystem Policy

To prevent the driver phone from becoming a generic entertainment tablet while ensuring critical vehicle operations function seamlessly:

### Allowed Applications (Whitelisted)
1. **`com.mmride.driver`** (Primary Kiosk Activity - Always Running)
2. **`com.afwsamples.testdpc`** / **`com.mmride.dpc`** (Device Policy Controller)
3. **`com.google.android.dialer`** / **`com.android.dialer`** (Voice calls to dispatch/riders)
4. **`com.android.incallui`** / **`com.android.phone`** (Core telephony engine)
5. **`com.google.android.apps.maps`** (Google Maps navigation via Android Intents)
6. **`com.google.android.gms`** (Google Play Services - GPS, FCM Push Notifications)
7. **`com.google.android.webview`** (Chromium rendering for MM Ride Driver UI)

### Blocked / Suspended Applications
* YouTube, Chrome, Social Media (Facebook, Instagram, WhatsApp Personal), Games, Sideloaded APKs.
* Google Play Store: Restricted via Managed Google Play (only whitelisted enterprise apps visible).
* Unknown Sources (`DISALLOW_INSTALL_UNKNOWN_SOURCES` = `true`).

---

## 5. Controlled Multi-App Kiosk Mode

True single-app lock prevents phone dialers and external navigation from ever displaying. Therefore, MM Ride uses **Controlled Multi-App Kiosk**:

1. **Lock Task Packages**:
   ```java
   dpm.setLockTaskPackages(adminComponent, new String[]{
       "com.mmride.driver",
       "com.google.android.dialer",
       "com.android.dialer",
       "com.google.android.apps.maps"
   });
   ```
2. **Lock Task Features**:
   ```java
   // Allows status bar clock/battery, but BLOCKS notification pulldown, home, and overview
   dpm.setLockTaskFeatures(adminComponent, 
       DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO |
       DevicePolicyManager.LOCK_TASK_FEATURE_KEYGUARD);
   ```
3. **Driver App Auto-Launch**:
   * `com.mmride.driver` registers as the default Home (`CATEGORY_HOME`, `CATEGORY_DEFAULT`) launcher.
   * If the driver presses Back or Home, the OS returns directly to the MM Ride duty screen.

---

## 6. Mandatory Security Restrictions (Anti-Tamper & Anti-Fraud)

Enforced via Android `UserManager` restrictions:

| Restriction Constant | Policy Action | Purpose |
|---|---|---|
| `DISALLOW_MOCK_LOCATION` | Blocks `Settings -> Mock Location App` | Prevents fake GPS apps & fake ride fraud |
| `DISALLOW_CONFIG_DATE_TIME` | Locks System Clock & Timezone | Enforces `setAutoTimeRequired(true)`; prevents fare manipulation |
| `DISALLOW_APPS_CONTROL` | Greys out `Force Stop`, `Clear Data`, `Clear Cache` | Prevents driver from killing background GPS logging |
| `DISALLOW_UNINSTALL_APPS` | Blocks package uninstallation | Prevents removing MM Ride Driver |
| `DISALLOW_INSTALL_UNKNOWN_SOURCES` | Disables sideloading APKs | Prevents malware, gambling, and unapproved APKs |
| `DISALLOW_FACTORY_RESET` | Greys out Factory Reset in Android Settings | Prevents ordinary driver from resetting company phone |
| `DISALLOW_MODIFY_ACCOUNTS` | Blocks adding personal Google / Mi accounts | Prevents device ownership confusion |
| `DISALLOW_CONFIG_TETHERING` | Disables Hotspot / Portable Tethering | Prevents draining company 4G/5G data pool |
| `DISALLOW_USB_FILE_TRANSFER` | Disables MTP / PTP | USB port only charges; prevents extracting rider data |
| `DISALLOW_DEBUGGING_FEATURES` | Disables ADB and Developer Options | Closes USB command backdoor after provisioning |
| `DISALLOW_SAFE_BOOT` | Disables Safe Mode boot | Prevents booting without MDM policies |

---

## 7. Factory Reset Protection (FRP) & Hardware Recovery Limits

### Software Restriction vs Hardware Reality
* `DISALLOW_FACTORY_RESET` removes the "Factory data reset" button inside MIUI Settings.
* **Hardware Reality on Redmi Note 9**: A driver can physically power off the phone, hold `Power + Volume Up`, and boot into **Mi-Recovery 3.0/5.0**, selecting "Wipe Data". **No software MDM in the world can intercept physical recovery button combinations on consumer Android phones without Knox-like hardware silicon.**

### The Defense: Android Factory Reset Protection (FRP) Policy
To make a recovery wipe useless to a thief or dishonest driver, the DPC enforces `setFactoryResetProtectionPolicy`:

```java
List<String> adminAccountIds = Collections.singletonList("109876543210987654321"); // MM Ride Corporate Google Account ID
FactoryResetProtectionPolicy frpPolicy = new FactoryResetProtectionPolicy.Builder()
    .setFactoryResetProtectionAccounts(adminAccountIds)
    .setFactoryResetProtectionEnabled(true)
    .build();
dpm.setFactoryResetProtectionPolicy(adminComponent, frpPolicy);
```

* **Outcome**: If a driver wipes the phone via Mi-Recovery:
  1. The phone formats user storage.
  2. Upon booting, Android detects FRP is armed.
  3. The phone REFUSES to proceed past the first screen until the **MM Ride Corporate Google Account** password is typed.
  4. The phone cannot be used, sold, or repurposed.

---

## 8. Remote Admin Commands & API Specification

The MM Ride Cloud Admin console controls the fleet via the following API endpoints:

```
POST /api/v1/fleet/devices/{deviceId}/actions
```

### Action Payloads:

1. **Remote Lock**:
   ```json
   {
     "action": "LOCK_DEVICE",
     "message": "MM Ride Fleet Lock: Duty Shift Suspended. Contact Dispatch: +91-9876543210"
   }
   ```
2. **Emergency Remote Wipe (Lost/Stolen)**:
   ```json
   {
     "action": "WIPE_DATA",
     "flags": 0, // WIPE_EXTERNAL_STORAGE
     "reason": "Vehicle reported stolen"
   }
   ```
3. **Silent App Update**:
   ```json
   {
     "action": "INSTALL_PACKAGE",
     "packageUrl": "https://fleet.mmride.com/apks/driver-v1.2.0.apk",
     "packageName": "com.mmride.driver"
   }
   ```
4. **Compliance Status Ping**:
   * Reports battery %, GPS status, DPC version, last known location, tamper alerts.

---

## 9. Privacy & Telemetry Boundary (Driver Rights)

MM Ride fleet management strictly adheres to operational boundaries:

* ✅ **ALLOWED TELEMETRY**:
  * Real-time GPS coordinates during active duty shifts.
  * Vehicle speed and trip status.
  * Device battery level and network connectivity.
  * MM Ride Driver application crash logs.
* ❌ **STRICTLY PROHIBITED (Hard-coded prohibitions)**:
  * No background microphone or room audio recording (`RECORD_AUDIO` blocked in `app.json`).
  * No covert camera hijacking (`recordAudioAndroid: false`).
  * No access to personal phone calls, personal WhatsApp chats, or SMS contents.
  * No GPS tracking while the driver has toggled "Off-Duty" and signed out.

---

## 10. Redmi Note 9 (MIUI 14.0.3 / Android 13) Specific Quirks & Mitigations

### 1. MIUI Aggressive Background Process Killer
* **Problem**: MIUI kills background services (such as MM Ride background GPS tracking) after 10 minutes of screen off.
* **Mitigation**:
  * In `Settings -> Apps -> Manage Apps -> MM Ride Driver -> Battery Saver`: Select **"No Restrictions"**.
  * In `Settings -> Apps -> Manage Apps -> MM Ride Driver -> Autostart`: Toggle **ON**.
  * Set `Stay on while plugged in` = `AC & USB` in DPC so the screen stays awake when mounted on the bike.

### 2. MIUI Optimization Toggle
* Keep **MIUI Optimization** enabled. Disabling it breaks Android 13 runtime permission dialogs and system intent routing.

### 3. Second Space & Dual Apps
* Device Owner setup will fail if `UserInfo{10}` (Second Space) or `UserInfo{999}` (Dual Apps) exists. These must be permanently turned off in MIUI settings.
