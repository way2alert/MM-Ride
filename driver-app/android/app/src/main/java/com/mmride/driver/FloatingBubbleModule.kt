package com.mmride.driver

import android.content.Intent
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class FloatingBubbleModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        activeInstance = this
    }

    override fun getName(): String = "FloatingBubbleModule"

    companion object {
        var activeInstance: FloatingBubbleModule? = null

        fun notifyRideLogged(platform: String, fare: Double, paymentMethod: String) {
            val module = activeInstance ?: return
            try {
                val params = Arguments.createMap().apply {
                    putString("platform", platform)
                    putDouble("fare", fare)
                    putString("paymentMethod", paymentMethod)
                    putDouble("timestamp", System.currentTimeMillis().toDouble())
                }
                module.reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onOverlayRideLogged", params)
            } catch (e: Exception) {
                // Ignore if JS context destroyed
            }
        }
    }

    /**
     * Brings the MM Ride main activity immediately to the foreground over any running app
     * (e.g. Ola, Uber, Rapido, Google Maps). Allowed via SYSTEM_ALERT_WINDOW / Headwind MDM.
     */
    @ReactMethod
    fun bringAppToFront(promise: Promise) {
        try {
            val intent = Intent(reactContext, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("BRING_FRONT_ERROR", e.message, e)
        }
    }

    /**
     * Displays a high-visibility, urgent alert directly in the floating overlay over Ola/Uber
     * and optionally auto-launches MM Ride full-screen.
     */
    @ReactMethod
    fun showOverlayAlert(title: String, message: String, alertType: String, autoOpenApp: Boolean, promise: Promise) {
        try {
            val intent = Intent(reactContext, FloatingBubbleService::class.java).apply {
                action = FloatingBubbleService.ACTION_SHOW_ALERT
                putExtra(FloatingBubbleService.EXTRA_ALERT_TITLE, title)
                putExtra(FloatingBubbleService.EXTRA_ALERT_MESSAGE, message)
                putExtra(FloatingBubbleService.EXTRA_ALERT_TYPE, alertType)
                putExtra(FloatingBubbleService.EXTRA_AUTO_OPEN_APP, autoOpenApp)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }

            if (autoOpenApp) {
                val openIntent = Intent(reactContext, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                    addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                }
                reactContext.startActivity(openIntent)
            }

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SHOW_ALERT_ERROR", e.message, e)
        }
    }

    /**
     * Dismisses the active urgent alert banner from the floating overlay
     */
    @ReactMethod
    fun dismissOverlayAlert(promise: Promise) {
        try {
            val intent = Intent(reactContext, FloatingBubbleService::class.java).apply {
                action = FloatingBubbleService.ACTION_DISMISS_ALERT
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DISMISS_ALERT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun startBubble(options: ReadableMap?, promise: Promise) {
        try {
            // Verify overlay permission
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
                promise.reject("PERMISSION_DENIED", "SYSTEM_ALERT_WINDOW permission is not granted")
                return
            }

            val rides = options?.getInt("totalRides") ?: 0
            val earnings = options?.getDouble("totalEarnings") ?: 0.0

            val intent = Intent(reactContext, FloatingBubbleService::class.java).apply {
                action = FloatingBubbleService.ACTION_START
                putExtra(FloatingBubbleService.EXTRA_TOTAL_RIDES, rides)
                putExtra(FloatingBubbleService.EXTRA_TOTAL_EARNINGS, earnings)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_BUBBLE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopBubble(promise: Promise) {
        try {
            val intent = Intent(reactContext, FloatingBubbleService::class.java).apply {
                action = FloatingBubbleService.ACTION_STOP
            }
            reactContext.stopService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_BUBBLE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun updateBubbleStats(rides: Int, earnings: Double, promise: Promise) {
        try {
            val intent = Intent(reactContext, FloatingBubbleService::class.java).apply {
                action = FloatingBubbleService.ACTION_UPDATE
                putExtra(FloatingBubbleService.EXTRA_TOTAL_RIDES, rides)
                putExtra(FloatingBubbleService.EXTRA_TOTAL_EARNINGS, earnings)
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("UPDATE_BUBBLE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isBubbleRunning(promise: Promise) {
        promise.resolve(FloatingBubbleService.isRunning)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN built in Event Emitter Calls
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN built in Event Emitter Calls
    }
}
