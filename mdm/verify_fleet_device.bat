@echo off
setlocal EnableDelayedExpansion
title MM Ride - Strict Device Owner Verification (Redmi Note 9)
color 0F

echo ===============================================================================
echo            MM RIDE FLEET - READ-ONLY POST-SETUP VERIFICATION
echo ===============================================================================
echo Target: Redmi Note 9 (MIUI 14.0.3 / Android 13)
echo Rules:
echo  - Strictly read-only; no settings will be modified.
echo  - Only reports [PASS] DEVICE OWNER ACTIVE if confirmed in dumpsys device_policy.
echo ===============================================================================
echo.

set "OVERALL_STATUS=PASS"

:: 1. ADB Connection
echo [*] Checking ADB Device Connection...
adb get-state >nul 2>&1
if %errorlevel% neq 0 (
    echo [FAIL] Device not detected via ADB or unauthorized.
    set "OVERALL_STATUS=FAIL"
    goto :final_summary
)
echo [PASS] ADB Device Connected and Authorized.
echo.

:: 2. Hardware and OS Version Check
echo [*] Checking Target Device Specs...
for /f "tokens=*" %%a in ('adb shell getprop ro.product.model 2^>nul') do set "DEV_MODEL=%%a"
for /f "tokens=*" %%a in ('adb shell getprop ro.build.version.release 2^>nul') do set "DEV_ANDROID=%%a"
for /f "tokens=*" %%a in ('adb shell getprop ro.miui.ui.version.name 2^>nul') do set "DEV_MIUI=%%a"
for /f "tokens=*" %%a in ('adb shell getprop ro.build.version.incremental 2^>nul') do set "DEV_INCREMENTAL=%%a"

echo     Model:        !DEV_MODEL!
echo     Android OS:   !DEV_ANDROID!
echo     MIUI Version: !DEV_MIUI! (!DEV_INCREMENTAL!)

if "!DEV_ANDROID!"=="13" (
    echo [PASS] Android 13 detected.
) else (
    echo [WARNING] Expected Android 13, but found: !DEV_ANDROID!
    if "!OVERALL_STATUS!"=="PASS" set "OVERALL_STATUS=WARNING"
)
echo.

:: 3. User / Profile State Check
echo [*] Checking User Profile Integrity...
adb shell pm list users > "%TEMP%\verify_users.tmp" 2>&1
findstr /i "UserInfo{0:" "%TEMP%\verify_users.tmp" >nul 2>&1
set "HAS_USER0=%errorlevel%"
findstr /i "UserInfo{10:" "%TEMP%\verify_users.tmp" >nul 2>&1
set "HAS_USER10=%errorlevel%"
findstr /i "UserInfo{999:" "%TEMP%\verify_users.tmp" >nul 2>&1
set "HAS_USER999=%errorlevel%"

if "!HAS_USER0!"=="0" (
    echo [PASS] Primary user (User 0) active.
) else (
    echo [FAIL] Primary user (User 0) not detected.
    set "OVERALL_STATUS=FAIL"
)

if "!HAS_USER10!"=="0" (
    echo [WARNING] Secondary user / Second Space detected (UserInfo{10...}).
    if "!OVERALL_STATUS!"=="PASS" set "OVERALL_STATUS=WARNING"
)
if "!HAS_USER999!"=="0" (
    echo [WARNING] Dual Apps user detected (UserInfo{999...}).
    if "!OVERALL_STATUS!"=="PASS" set "OVERALL_STATUS=WARNING"
)
del "%TEMP%\verify_users.tmp" >nul 2>&1
echo.

:: 4. Strict Device Owner Verification via dumpsys device_policy
echo [*] Verifying Android Device Owner Status in dumpsys device_policy...
adb shell dumpsys device_policy > "%TEMP%\verify_dpm.tmp" 2>&1

set "DO_FOUND=0"
set "DO_PACKAGE="

findstr /i "Device Owner:" "%TEMP%\verify_dpm.tmp" > "%TEMP%\do_line.tmp" 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%l in ('type "%TEMP%\do_line.tmp"') do (
        echo     Raw Policy Line: %%l
    )
    findstr /i "admin=" "%TEMP%\verify_dpm.tmp" > "%TEMP%\do_admin.tmp" 2>&1
    for /f "tokens=*" %%m in ('type "%TEMP%\do_admin.tmp"') do (
        echo     Active Admin Component: %%m
    )
    
    :: Check for TestDPC or Production MM Ride DPC
    findstr /i "com.afwsamples.testdpc" "%TEMP%\verify_dpm.tmp" >nul 2>&1
    if %errorlevel% equ 0 (
        set "DO_FOUND=1"
        set "DO_PACKAGE=com.afwsamples.testdpc (DEVELOPMENT / TEST DPC)"
    )
    findstr /i "com.mmride.dpc" "%TEMP%\verify_dpm.tmp" >nul 2>&1
    if %errorlevel% equ 0 (
        set "DO_FOUND=1"
        set "DO_PACKAGE=com.mmride.dpc (PRODUCTION MM RIDE DPC)"
    )
    findstr /i "com.mmride.mdm" "%TEMP%\verify_dpm.tmp" >nul 2>&1
    if %errorlevel% equ 0 (
        set "DO_FOUND=1"
        set "DO_PACKAGE=com.mmride.mdm (PRODUCTION MM RIDE MDM)"
    )
    findstr /i "com.google.android.apps.work.clouddpc" "%TEMP%\verify_dpm.tmp" >nul 2>&1
    if %errorlevel% equ 0 (
        set "DO_FOUND=1"
        set "DO_PACKAGE=com.google.android.apps.work.clouddpc (ANDROID MANAGEMENT API)"
    )
)

del "%TEMP%\do_line.tmp" >nul 2>&1
del "%TEMP%\do_admin.tmp" >nul 2>&1

if "!DO_FOUND!"=="1" (
    echo [PASS] DEVICE OWNER ACTIVE: !DO_PACKAGE!
) else (
    echo [FAIL] NO VALID DEVICE OWNER ACTIVE ON THIS DEVICE!
    echo        Device is running in unmanaged or standard mode.
    set "OVERALL_STATUS=FAIL"
)
del "%TEMP%\verify_dpm.tmp" >nul 2>&1
echo.

:: 5. MM Ride Driver Application Installation Check
echo [*] Checking MM Ride Driver Application (com.mmride.driver)...
adb shell pm path com.mmride.driver > "%TEMP%\driver_pkg.tmp" 2>&1
findstr /i "package:" "%TEMP%\driver_pkg.tmp" >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%p in ('type "%TEMP%\driver_pkg.tmp"') do (
        echo     Path: %%p
    )
    echo [PASS] MM Ride Driver App is installed.
) else (
    echo [WARNING] MM Ride Driver App (com.mmride.driver) is NOT installed.
    if "!OVERALL_STATUS!"=="PASS" set "OVERALL_STATUS=WARNING"
)
del "%TEMP%\driver_pkg.tmp" >nul 2>&1
echo.

:: 6. Essential Telephony and System Apps Check
echo [*] Checking Core System Apps Availability...
adb shell pm path com.android.phone >nul 2>&1
if %errorlevel% equ 0 (
    echo [PASS] Telephony subsystem (com.android.phone) available.
) else (
    echo [FAIL] Telephony subsystem missing or disabled!
    set "OVERALL_STATUS=FAIL"
)

adb shell pm path com.google.android.gms >nul 2>&1
if %errorlevel% equ 0 (
    echo [PASS] Google Play Services (com.google.android.gms) available.
) else (
    echo [WARNING] Google Play Services missing or disabled.
    if "!OVERALL_STATUS!"=="PASS" set "OVERALL_STATUS=WARNING"
)

adb shell pm path com.google.android.webview >nul 2>&1
set "WV_STATUS=%errorlevel%"
if "!WV_STATUS!" neq "0" (
    adb shell pm path com.android.webview >nul 2>&1
    set "WV_STATUS=!errorlevel!"
)
if "!WV_STATUS!"=="0" (
    echo [PASS] Android System WebView available.
) else (
    echo [WARNING] WebView package not found.
    if "!OVERALL_STATUS!"=="PASS" set "OVERALL_STATUS=WARNING"
)
echo.

:: 7. Security Restrictions Check (Location & USB Debugging)
echo [*] Checking System & Security Flags...
for /f "tokens=*" %%a in ('adb shell settings get secure location_mode 2^>nul') do set "LOC_MODE=%%a"
for /f "tokens=*" %%a in ('adb shell settings get global adb_enabled 2^>nul') do set "ADB_FLAG=%%a"

echo     Location Mode:  !LOC_MODE! (3 = High Accuracy GPS)
echo     ADB State Flag: !ADB_FLAG! (1 = Enabled, 0 = Disabled)

if "!LOC_MODE!"=="3" (
    echo [PASS] Location High Accuracy is active.
) else (
    echo [WARNING] Location mode is not High Accuracy (Current value: !LOC_MODE!).
    if "!OVERALL_STATUS!"=="PASS" set "OVERALL_STATUS=WARNING"
)

if "!ADB_FLAG!"=="1" (
    echo [WARNING] USB Debugging (ADB) is currently ENABLED.
    echo           Production Rule: After final provisioning, USB Debugging should be DISABLED.
    if "!OVERALL_STATUS!"=="PASS" set "OVERALL_STATUS=WARNING"
) else (
    echo [PASS] USB Debugging is DISABLED.
)
echo.

:: 8. Final Report
:final_summary
echo ===============================================================================
echo                         FINAL COMPLIANCE VERIFICATION
echo ===============================================================================
if "!OVERALL_STATUS!"=="PASS" (
    color 0A
    echo [PASS] DEVICE FULLY COMPLIANT WITH MM RIDE FLEET POLICY.
    echo        Device Owner is confirmed active and required subsystems are present.
) else if "!OVERALL_STATUS!"=="WARNING" (
    color 0E
    echo [WARNING] DEVICE FUNCTIONAL BUT HAS NON-CRITICAL WARNINGS.
    echo           Review items marked [WARNING] above.
) else (
    color 0C
    echo [FAIL] DEVICE COMPLIANCE FAILED.
    echo        Device is NOT in a valid Device Owner state or critical components are missing.
)
echo ===============================================================================
echo.
pause
