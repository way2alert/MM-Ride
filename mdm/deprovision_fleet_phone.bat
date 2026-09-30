@echo off
title MM Ride - Fleet Phone MDM Deprovision / Unlock Tool
color 0C
echo ========================================================
echo        MM RIDE - FLEET PHONE DEPROVISION / UNLOCK
echo ========================================================
echo.
echo This tool removes the MDM Device Owner lock from the phone,
echo returning it back to normal personal phone status.
echo.
pause
echo.
echo [1/2] Checking ADB connection...
adb devices
echo.
echo [2/2] Removing Device Owner / MDM Admin...
adb shell dpm remove-active-admin com.afwsamples.testdpc/.DeviceAdminReceiver
if %errorlevel% neq 0 (
    echo [ERROR] Failed to remove Device Owner. Ensure USB Debugging is connected.
    pause
    exit /b %errorlevel%
)
echo.
echo ========================================================
echo [SUCCESS] MDM Device Owner has been successfully removed!
echo Phone is now unlocked and restored to normal personal use.
echo ========================================================
pause
