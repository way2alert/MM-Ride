# 🛡️ MM Ride – Fleet Phone Android Enterprise MDM & Anti-Tamper Guide

This guide documents the enterprise-grade Mobile Device Management (MDM) and Anti-Tamper policies enforced on company-owned driver fleet phones for **MM Ride**.

---

## 🚀 Quick Automated Provisioning (2-Minute USB Method)

### Pre-requisites on Driver Phone:
1. **Remove all Accounts**: Go to `Settings -> Accounts` and remove all Google, Mi, WhatsApp, or other personal accounts.
2. **Disable Dual Apps / Second Space**: Ensure only `User 0` (Primary Owner) is active.
3. **Turn ON USB Debugging**: `Settings -> About Phone -> Tap Build Number 7 times -> Settings -> Developer Options -> Enable USB Debugging` (and "Install via USB" on Xiaomi/Redmi devices).

### Run Automated Script:
1. Connect the phone to the computer via USB cable.
2. Tap **"Always allow from this computer"** on the phone screen popup.
3. Simply double-click:
   ```cmd
   mdm\provision_fleet_phone.bat
   ```
4. Once completed, the phone will display `Success: Device owner set to package com.afwsamples.testdpc`.

---

## 🔒 Mandatory 15 Security Policies to Configure

Inside the **Test DPC** app on the phone, enforce the following settings:

| # | Policy Category | Test DPC Setting | Purpose / Protection |
|---|---|---|---|
| 1 | **Anti-Fraud** | `Disallow mock location` | Freezes fake GPS apps; prevents drivers from spoofing locations from home. |
| 2 | **Anti-Fraud** | `Disallow set time / time zone` | Prevents manipulating system clock to game surge pricing or duty shifts. |
| 3 | **Anti-Tamper** | `Disallow apps control` | Blocks `Clear Data`, `Clear Cache`, and `Force Stop` in Android Settings. |
| 4 | **Anti-Tamper** | `Disallow uninstall apps` | Blocks uninstalling the MM Ride Driver app. |
| 5 | **Anti-Theft** | `Disallow factory reset` | Blocks resetting/wiping the device to repurpose or sell company property. |
| 6 | **Anti-Theft** | `Disallow safe boot` | Prevents booting into Android Safe Mode to bypass restrictions. |
| 7 | **Asset Control** | `Disallow modify accounts` | Prevents drivers from signing into personal Google/Mi accounts. |
| 8 | **Asset Control** | `Disallow keyguard / password change` | Prevents drivers from setting personal PIN/Pattern locks that lock out the company. |
| 9 | **Cost Saving** | `Disallow tethering / portable hotspot` | Hides hotspot toggle; prevents draining company cellular data for personal devices. |
| 10 | **Data Privacy** | `Disallow USB file transfer` | USB port only charges; blocks copying passenger phone numbers or trip records. |
| 11 | **Security** | `Disallow install unknown sources` | Blocks sideloading APKs, pirated games, or betting apps. |
| 12 | **Automation** | `Permission policy -> Grant` | Automatically grants Location, Camera, and Phone permissions without prompting the driver. |
| 13 | **Bike UX** | `Stay on while plugged in -> AC & USB` | Keeps screen awake on bike charging mounts; prevents screen timeout while navigating. |
| 14 | **Privacy** | `Disallow screen capture` | Prevents screenshotting passenger details (PII protection). |
| 15 | **Kiosk Mode** | `Lock task mode -> MM Ride Driver App` | Single-app lockdown; disables Home, Back, and Status Bar so only MM Ride runs. |

---

## 🔓 Fleet Deprovisioning / Master Unlock

When a driver resigns, or a phone needs to be sent for repairs or reassigned to personal use:
1. Connect phone via USB with USB debugging enabled.
2. Double-click:
   ```cmd
   mdm\deprovision_fleet_phone.bat
   ```
   Or execute in terminal:
   ```powershell
   adb shell dpm remove-active-admin com.afwsamples.testdpc/.DeviceAdminReceiver
   ```
3. The phone instantly exits Device Owner mode and restores all standard Android functions.
