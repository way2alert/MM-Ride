@echo off
setlocal EnableDelayedExpansion
title MM Ride - Fleet Phone MDM Deprovision / Unlock Tool
color 0C

echo ===============================================================================
echo        MM RIDE - FLEET PHONE DEPROVISION / UNLOCK TOOL
echo ===============================================================================
echo Purpose: Remove Device Owner / MDM Admin when a vehicle is decommissioned
echo          or the phone is reassigned.
echo ===============================================================================
echo.
echo WARNING: This will strip enterprise policies and return the phone to an
echo          unmanaged state.
echo.
pause

echo.
echo [1/3] Checking ADB connection...
adb get-state >nul 2>&1
if %errorlevel% neq 0 (
    echo [FAIL] Device not detected via ADB or unauthorized.
    pause
    exit /b 1
)
echo [PASS] ADB connected.
echo.

echo [2/3] Checking active Device Owner...
adb shell dpm list-owners > "%TEMP%\deprov_dpm.tmp" 2>&1
type "%TEMP%\deprov_dpm.tmp"

findstr /i "com.afwsamples.testdpc" "%TEMP%\deprov_dpm.tmp" >nul 2>&1
if %errorlevel% equ 0 (
    echo [*] Removing Development TestDPC Device Owner...
    adb shell dpm remove-active-admin com.afwsamples.testdpc/.DeviceAdminReceiver
)

findstr /i "com.mmride.dpc" "%TEMP%\deprov_dpm.tmp" >nul 2>&1
if %errorlevel% equ 0 (
    echo [*] Removing Production MM Ride DPC Device Owner...
    adb shell dpm remove-active-admin com.mmride.dpc/.DeviceAdminReceiver
)

del "%TEMP%\deprov_dpm.tmp" >nul 2>&1
echo.

echo [3/3] Verifying Device Owner removal...
adb shell dpm list-owners > "%TEMP%\deprov_verify.tmp" 2>&1
findstr /i "admin=" "%TEMP%\deprov_verify.tmp" >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARNING] An active Device Owner is still present:
    type "%TEMP%\deprov_verify.tmp"
) else (
    echo [PASS] Device Owner successfully removed. Device is now unmanaged.
)
del "%TEMP%\deprov_verify.tmp" >nul 2>&1

echo.
echo ===============================================================================
echo Deprovisioning complete.
echo ===============================================================================
pause
