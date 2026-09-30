@echo off
title MM Ride - Fleet Phone MDM Provisioning Tool
color 0A
echo ========================================================
echo        MM RIDE - FLEET PHONE MDM PROVISIONING
echo ========================================================
echo.
echo [1/4] Checking ADB connection...
adb devices
echo.
echo [2/4] Installing Test DPC MDM Agent...
adb install -r "%~dp0TestDPC.apk"
if %errorlevel% neq 0 (
    echo [ERROR] Installation failed. Ensure USB Debugging is ON and "Install via USB" is allowed on phone.
    pause
    exit /b %errorlevel%
)
echo.
echo [3/4] Enforcing Permanent Device Owner...
adb shell dpm set-device-owner com.afwsamples.testdpc/.DeviceAdminReceiver
if %errorlevel% neq 0 (
    echo.
    echo [WARNING] Device Owner set failed!
    echo Possible causes:
    echo   1. Phone still has Google / Mi / WhatsApp accounts. (Remove them in Settings -> Accounts).
    echo   2. Xiaomi Dual Apps / Second Space is active. (Turn them off in Settings -> Apps).
    echo.
    pause
    exit /b %errorlevel%
)
echo.
echo [4/4] Disabling Developer Settings & Mock Locations...
adb shell settings put global development_settings_enabled 0
echo.
echo ========================================================
echo [SUCCESS] Phone is now successfully provisioned as MM Ride Fleet Owner!
echo.
echo NEXT STEPS ON PHONE SCREEN:
echo  1. Open Test DPC App.
echo  2. Go to 'User Restrictions' -> Turn ON:
echo     - Disallow uninstall apps
echo     - Disallow apps control (Blocks clear cache/data)
echo     - Disallow factory reset
echo     - Disallow mock location
echo     - Disallow tethering (Blocks hotspot)
echo  3. Go to 'Permission Policy' -> Select 'Grant' (Auto-grant GPS).
echo  4. Optional: Setup 'Lock Task Mode' for MM Ride Driver app.
echo ========================================================
pause
