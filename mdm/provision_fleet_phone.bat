@echo off
setlocal EnableDelayedExpansion
title MM Ride - Development Fleet Provisioning (TestDPC)
color 0B

echo ===============================================================================
echo        MM RIDE - FLEET PHONE DEVELOPMENT / TESTING PROVISIONING
echo ===============================================================================
echo Target Device: Redmi Note 9 (MIUI 14.0.3 / Android 13)
echo Management DPC: com.afwsamples.testdpc (DEVELOPMENT ONLY)
echo.
echo [IMPORTANT ARCHITECTURE NOTE]
echo This script provisions the development DPC (TestDPC) via ADB.
echo ADB Device Owner does NOT survive a hardware recovery wipe or factory reset.
echo This tool is for testing and validation. For final production fleet rollout,
echo see: mdm\PRODUCTION_MDM_SPECIFICATION.md
echo ===============================================================================
echo.

:: 1. ADB Connection Check
echo [1/5] Checking ADB Connection...
adb get-state >nul 2>&1
if %errorlevel% neq 0 (
    echo [FAIL] Device not detected via ADB or unauthorized.
    echo        1. Plug phone into computer with USB cable.
    echo        2. Check phone screen for "Allow USB Debugging?" and choose Always Allow.
    echo.
    pause
    exit /b 1
)
echo [PASS] Device connected via ADB.
echo.

:: 2. Pre-requisite Safety Check: Existing Owners
echo [2/5] Inspecting Existing Management State...
adb shell dpm list-owners > "%TEMP%\prov_dpm.tmp" 2>&1
findstr /i "admin=" "%TEMP%\prov_dpm.tmp" >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARNING] Device already has an active owner:
    type "%TEMP%\prov_dpm.tmp"
    echo.
    echo If TestDPC is already Device Owner, no re-provisioning is needed.
    del "%TEMP%\prov_dpm.tmp" >nul 2>&1
    goto :verify_step
)
del "%TEMP%\prov_dpm.tmp" >nul 2>&1

:: 3. Pre-requisite Safety Check: Users & Accounts (Non-destructive)
echo [3/5] Inspecting Accounts and User Profiles (Non-destructive)...
adb shell pm list users > "%TEMP%\prov_users.tmp" 2>&1
findstr /i "UserInfo{10" "%TEMP%\prov_users.tmp" >nul 2>&1
set "HAS_USER10=%errorlevel%"
findstr /i "UserInfo{999" "%TEMP%\prov_users.tmp" >nul 2>&1
set "HAS_DUALAPPS=%errorlevel%"
del "%TEMP%\prov_users.tmp" >nul 2>&1

if "!HAS_USER10!"=="0" (
    echo [FAIL] ABORTING: Second Space or Secondary User detected.
    echo        Android DevicePolicyManager will reject Device Owner setup.
    echo        Go to Settings -^> Special Features -^> Second Space and turn it OFF.
    pause
    exit /b 2
)

if "!HAS_DUALAPPS!"=="0" (
    echo [FAIL] ABORTING: MIUI Dual Apps detected.
    echo        Android DevicePolicyManager will reject Device Owner setup.
    echo        Go to Settings -^> Apps -^> Dual apps and turn them OFF.
    pause
    exit /b 3
)

adb shell dumpsys account > "%TEMP%\prov_acc.tmp" 2>&1
findstr /i "Account {" "%TEMP%\prov_acc.tmp" > "%TEMP%\prov_acc_list.tmp" 2>&1
set "ACC_COUNT=0"
for /f "tokens=*" %%a in ('type "%TEMP%\prov_acc_list.tmp" 2^>nul') do (
    set /a ACC_COUNT+=1
    echo     Found Account: %%a
)
del "%TEMP%\prov_acc.tmp" >nul 2>&1
del "%TEMP%\prov_acc_list.tmp" >nul 2>&1

if !ACC_COUNT! gtr 0 (
    echo.
    echo [FAIL] ABORTING: !ACC_COUNT! registered account(s) detected!
    echo.
    echo [EXPLANATION OF ANDROID RESTRICTION]
    echo Android OS enforces that Device Owner CANNOT be established if accounts exist.
    echo This tool will NEVER silently wipe or remove user data.
    echo.
    echo ACTION REQUIRED BY OPERATOR:
    echo 1. Open phone Settings -^> Accounts ^& Sync.
    echo 2. Manually remove Google/Mi/WhatsApp accounts.
    echo 3. Re-run this script once accounts are removed.
    echo.
    pause
    exit /b 4
)
echo [PASS] No accounts detected. Ready for Device Owner setup.
echo.

:: 4. Install Development TestDPC APK
echo [4/5] Installing TestDPC APK...
if not exist "%~dp0TestDPC.apk" (
    echo [FAIL] TestDPC.apk not found in %~dp0
    pause
    exit /b 5
)

adb install -r -d "%~dp0TestDPC.apk"
if %errorlevel% neq 0 (
    echo [FAIL] APK installation failed.
    echo        On MIUI/Redmi Note 9, you MUST enable "Install via USB" in Developer Options.
    pause
    exit /b 6
)
echo [PASS] TestDPC APK installed.
echo.

:: 5. Set Device Owner Component
echo [5/5] Enforcing Device Owner...
adb shell dpm set-device-owner com.afwsamples.testdpc/.DeviceAdminReceiver > "%TEMP%\set_do_output.tmp" 2>&1
type "%TEMP%\set_do_output.tmp"

findstr /i "Success" "%TEMP%\set_do_output.tmp" >nul 2>&1
set "SET_DO_RES=%errorlevel%"
del "%TEMP%\set_do_output.tmp" >nul 2>&1

if "!SET_DO_RES!" neq "0" (
    echo.
    echo [FAIL] "dpm set-device-owner" returned an error!
    echo Device Owner was NOT established.
    echo Common Redmi Note 9 causes:
    echo  - Hidden accounts remaining in Settings -^> Accounts
    echo  - MIUI Security app blocking DeviceAdmin permission
    echo  - Another admin app active
    pause
    exit /b 7
)

:verify_step
echo.
echo ===============================================================================
echo           RUNNING INDEPENDENT POST-SETUP VERIFICATION
echo ===============================================================================
call "%~dp0verify_fleet_device.bat"
