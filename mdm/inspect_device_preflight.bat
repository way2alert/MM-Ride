@echo off
setlocal EnableDelayedExpansion
title MM Ride - Pre-Flight Device Inspection (Redmi Note 9 / MIUI 14)
color 0B

echo ===============================================================================
echo        MM RIDE FLEET - READ-ONLY PRE-FLIGHT DEVICE INSPECTION
echo ===============================================================================
echo Target Device: Redmi Note 9 (MIUI 14.0.3 / Android 13)
echo Purpose: Inspect device state BEFORE provisioning WITHOUT modifying anything.
echo ===============================================================================
echo.

:: 1. ADB Connection Check
echo [*] Step 1: Checking ADB Connection...
adb get-state >nul 2>&1
if %errorlevel% neq 0 (
    echo [FAIL] Device not detected or ADB unauthorized.
    echo        1. Ensure phone is connected via USB.
    echo        2. Ensure USB Debugging is ON in Developer Options.
    echo        3. Check phone screen and tap "Always allow from this computer".
    goto :end
)
echo [PASS] ADB Device Connected and Authorized.
echo.

:: 2. Hardware and ROM Inspection
echo [*] Step 2: Inspecting Device Model ^& ROM Properties...
for /f "tokens=*" %%a in ('adb shell getprop ro.product.model 2^>nul') do set "DEVICE_MODEL=%%a"
for /f "tokens=*" %%a in ('adb shell getprop ro.product.brand 2^>nul') do set "DEVICE_BRAND=%%a"
for /f "tokens=*" %%a in ('adb shell getprop ro.build.version.release 2^>nul') do set "ANDROID_VER=%%a"
for /f "tokens=*" %%a in ('adb shell getprop ro.miui.ui.version.name 2^>nul') do set "MIUI_VER=%%a"
for /f "tokens=*" %%a in ('adb shell getprop ro.build.version.incremental 2^>nul') do set "MIUI_INC=%%a"

echo     - Brand:          !DEVICE_BRAND!
echo     - Model:          !DEVICE_MODEL!
echo     - Android:        !ANDROID_VER!
echo     - MIUI Version:   !MIUI_VER! (!MIUI_INC!)
echo.

:: 3. Check Existing Owners / Management State
echo [*] Step 3: Checking Existing Device Owner / Profile Owner...
adb shell dpm list-owners > "%TEMP%\dpm_owners.tmp" 2>&1
findstr /i "admin=" "%TEMP%\dpm_owners.tmp" >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARNING] An active Device Owner or Profile Owner is ALREADY present:
    type "%TEMP%\dpm_owners.tmp"
) else (
    echo [PASS] No existing Device Owner / Profile Owner detected. Device is unmanaged.
)
del "%TEMP%\dpm_owners.tmp" >nul 2>&1
echo.

:: 4. Inspect Users and Profiles (Secondary Users / Dual Apps / Second Space)
echo [*] Step 4: Checking Android User Profiles...
adb shell pm list users > "%TEMP%\pm_users.tmp" 2>&1
type "%TEMP%\pm_users.tmp"

findstr /i "UserInfo{10" "%TEMP%\pm_users.tmp" >nul 2>&1
set "HAS_USER10=%errorlevel%"
findstr /i "UserInfo{999" "%TEMP%\pm_users.tmp" >nul 2>&1
set "HAS_DUALAPPS=%errorlevel%"

if "!HAS_USER10!"=="0" (
    echo [FAIL] Second Space or Secondary User detected (UserInfo{10...}).
    echo        Device Owner CANNOT be set while multiple users exist.
    echo        Action: Disable Second Space in MIUI Settings -^> Special Features -^> Second Space.
) else if "!HAS_DUALAPPS!"=="0" (
    echo [FAIL] MIUI Dual Apps detected (UserInfo{999...}).
    echo        Device Owner CANNOT be set while Dual Apps is active.
    echo        Action: Go to Settings -^> Apps -^> Dual apps -^> Turn OFF all dual apps.
) else (
    echo [PASS] Single User state confirmed (User 0 only).
)
del "%TEMP%\pm_users.tmp" >nul 2>&1
echo.

:: 5. Inspect Accounts (Google, Mi, WhatsApp, etc.)
echo [*] Step 5: Checking for Registered Accounts...
adb shell dumpsys account > "%TEMP%\dump_account.tmp" 2>&1
findstr /i "Account {" "%TEMP%\dump_account.tmp" > "%TEMP%\accounts_list.tmp" 2>&1

set "ACCOUNT_COUNT=0"
for /f "tokens=*" %%a in ('type "%TEMP%\accounts_list.tmp" 2^>nul') do (
    set /a ACCOUNT_COUNT+=1
    echo     Found: %%a
)

if !ACCOUNT_COUNT! gtr 0 (
    echo [FAIL] !ACCOUNT_COUNT! account(s) detected on device!
    echo        Android Security Restriction:
    echo        "adb shell dpm set-device-owner" will FAIL if accounts exist.
    echo        Action Required:
    echo        Open Settings -^> Accounts ^& Sync -^> Manually Remove all accounts.
) else (
    echo [PASS] Zero registered accounts. Device is ready for ADB Device Owner provisioning.
)
del "%TEMP%\dump_account.tmp" >nul 2>&1
del "%TEMP%\accounts_list.tmp" >nul 2>&1
echo.

:: 6. Check Installed Business Packages
echo [*] Step 6: Checking Installed Packages...
adb shell pm path com.mmride.driver >nul 2>&1
if %errorlevel% equ 0 (
    echo [PASS] MM Ride Driver app (com.mmride.driver) is INSTALLED.
) else (
    echo [WARNING] MM Ride Driver app (com.mmride.driver) is NOT yet installed.
)

adb shell pm path com.afwsamples.testdpc >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] TestDPC (com.afwsamples.testdpc) is currently installed.
) else (
    echo [INFO] TestDPC is not installed.
)
echo.

:: 7. Summary
echo ===============================================================================
echo                              PRE-FLIGHT SUMMARY
echo ===============================================================================
if !ACCOUNT_COUNT! gtr 0 (
    echo [STATUS] NOT READY for ADB Device Owner provisioning.
    echo          Reason: Accounts must be removed first.
) else if "!HAS_USER10!"=="0" (
    echo [STATUS] NOT READY: Remove Second Space first.
) else if "!HAS_DUALAPPS!"=="0" (
    echo [STATUS] NOT READY: Disable MIUI Dual Apps first.
) else (
    echo [STATUS] READY FOR PROVISIONING.
    echo          The device meets all prerequisites for Device Owner setup.
)
echo ===============================================================================

:end
echo.
pause
