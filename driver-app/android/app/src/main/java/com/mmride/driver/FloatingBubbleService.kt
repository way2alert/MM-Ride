package com.mmride.driver

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.text.InputType
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.app.NotificationCompat

class FloatingBubbleService : Service() {

    private var windowManager: WindowManager? = null
    private var bubbleContainer: LinearLayout? = null
    private var compactView: LinearLayout? = null
    private var expandedView: LinearLayout? = null
    private var bubbleParams: WindowManager.LayoutParams? = null

    private var selectedPlatform: String = "OLA"
    private var selectedPayment: String = "CASH"
    private var totalRides: Int = 0
    private var totalEarnings: Double = 0.0

    private var badgeTextView: TextView? = null
    private var fareInput: EditText? = null

    // Urgent Alert Overlay View & State
    private var alertBannerView: LinearLayout? = null
    private var alertTitleTextView: TextView? = null
    private var alertMessageTextView: TextView? = null
    private var hasActiveAlert: Boolean = false
    private var activeAlertTitle: String = ""
    private var activeAlertMessage: String = ""

    companion object {
        const val CHANNEL_ID = "mmride_floating_bubble_channel"
        const val NOTIFICATION_ID = 9981

        const val ALERT_CHANNEL_ID = "mmride_urgent_alerts_channel"
        const val ALERT_NOTIFICATION_ID = 9982

        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
        const val ACTION_UPDATE = "ACTION_UPDATE"
        const val ACTION_SHOW_ALERT = "ACTION_SHOW_ALERT"
        const val ACTION_DISMISS_ALERT = "ACTION_DISMISS_ALERT"

        const val EXTRA_TOTAL_RIDES = "EXTRA_TOTAL_RIDES"
        const val EXTRA_TOTAL_EARNINGS = "EXTRA_TOTAL_EARNINGS"
        const val EXTRA_ALERT_TITLE = "EXTRA_ALERT_TITLE"
        const val EXTRA_ALERT_MESSAGE = "EXTRA_ALERT_MESSAGE"
        const val EXTRA_ALERT_TYPE = "EXTRA_ALERT_TYPE"
        const val EXTRA_AUTO_OPEN_APP = "EXTRA_AUTO_OPEN_APP"

        var isRunning: Boolean = false
            private set
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as? WindowManager
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildForegroundNotification())
        createFloatingViews()
        isRunning = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START

        when (action) {
            ACTION_STOP -> {
                stopSelf()
            }
            ACTION_UPDATE -> {
                val rides = intent?.getIntExtra(EXTRA_TOTAL_RIDES, totalRides) ?: totalRides
                val earnings = intent?.getDoubleExtra(EXTRA_TOTAL_EARNINGS, totalEarnings) ?: totalEarnings
                updateStats(rides, earnings)
            }
            ACTION_START -> {
                val rides = intent?.getIntExtra(EXTRA_TOTAL_RIDES, totalRides) ?: totalRides
                val earnings = intent?.getDoubleExtra(EXTRA_TOTAL_EARNINGS, totalEarnings) ?: totalEarnings
                updateStats(rides, earnings)
            }
            ACTION_SHOW_ALERT -> {
                val title = intent?.getStringExtra(EXTRA_ALERT_TITLE) ?: "URGENT ALERT"
                val message = intent?.getStringExtra(EXTRA_ALERT_MESSAGE) ?: "Please open MM Ride immediately"
                val alertType = intent?.getStringExtra(EXTRA_ALERT_TYPE) ?: "GENERAL"
                val autoOpen = intent?.getBooleanExtra(EXTRA_AUTO_OPEN_APP, true) ?: true
                showAlertOverlay(title, message, alertType, autoOpen)
            }
            ACTION_DISMISS_ALERT -> {
                dismissAlertOverlay()
            }
        }

        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        bubbleContainer?.let {
            try {
                windowManager?.removeView(it)
            } catch (e: Exception) {
                // View might not be attached
            }
        }
        bubbleContainer = null
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // 1. Shift Overlay Background Channel
            val channel = NotificationChannel(
                CHANNEL_ID,
                "MM Ride Shift Overlay",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the 1-tap ride logger bubble active over Ola & Uber"
                setShowBadge(false)
            }
            nm.createNotificationChannel(channel)

            // 2. Urgent Alerts Heads-Up Channel (High Priority with Sound, Vibration & Heads-Up Display)
            val alertChannel = NotificationChannel(
                ALERT_CHANNEL_ID,
                "MM Ride Critical Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Urgent alerts from fleet operations and safety sensors"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 600)
                setShowBadge(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            nm.createNotificationChannel(alertChannel)
        }
    }

    private fun postUrgentNotification(title: String, message: String) {
        try {
            val openAppIntent = Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            val pendingIntent = PendingIntent.getActivity(
                this,
                ALERT_NOTIFICATION_ID,
                openAppIntent,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE else PendingIntent.FLAG_UPDATE_CURRENT
            )

            val alertNotification = NotificationCompat.Builder(this, ALERT_CHANNEL_ID)
                .setContentTitle("🚨 $title")
                .setContentText(message)
                .setStyle(NotificationCompat.BigTextStyle().bigText(message))
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVibrate(longArrayOf(0, 400, 200, 400, 200, 600))
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setFullScreenIntent(pendingIntent, true)
                .build()

            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(ALERT_NOTIFICATION_ID, alertNotification)
        } catch (_: Exception) {}
    }

    private fun buildForegroundNotification(): Notification {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openAppIntent,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MM Ride Duty Shift Active 🏍️")
            .setContentText("1-Tap Ride Logger active over Ola, Uber & Rapido")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createFloatingViews() {
        val wm = windowManager ?: return

        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        bubbleParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = dp(16)
            y = dp(180)
        }

        // Root Container holds compact pill, expanded quick logger card, or urgent alert card
        bubbleContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }

        // 1. COMPACT DRAGGABLE PILL
        compactView = createCompactPillView()
        // 2. EXPANDED QUICK LOGGER CARD
        expandedView = createExpandedCardView()
        expandedView?.visibility = View.GONE
        // 3. URGENT OVERLAY ALERT CARD
        alertBannerView = createAlertBannerView()
        alertBannerView?.visibility = View.GONE

        bubbleContainer?.addView(compactView)
        bubbleContainer?.addView(expandedView)
        bubbleContainer?.addView(alertBannerView)

        attachTouchDragListener(compactView!!)

        wm.addView(bubbleContainer, bubbleParams)
    }

    /**
     * Compact floating pill view (Moves anywhere on screen, shows icon & ride count)
     */
    private fun createCompactPillView(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(8), dp(12), dp(8))

            // Background drawable with MM Ride Gold border
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#0A0D14"))
                setStroke(dp(2), Color.parseColor("#F59E0B"))
                cornerRadius = dp(24).toFloat()
            }

            // Bike Emoji
            addView(TextView(this@FloatingBubbleService).apply {
                text = "🏍️"
                textSize = 18f
            })

            // MM RIDE Title
            addView(TextView(this@FloatingBubbleService).apply {
                text = " MM RIDE "
                setTextColor(Color.parseColor("#F59E0B"))
                textSize = 12f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
            })

            // Badge Pill (Ride count / Earnings)
            badgeTextView = TextView(this@FloatingBubbleService).apply {
                text = "$totalRides rides"
                setTextColor(Color.BLACK)
                textSize = 11f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                setPadding(dp(8), dp(3), dp(8), dp(3))
                background = GradientDrawable().apply {
                    setColor(Color.parseColor("#F59E0B"))
                    cornerRadius = dp(12).toFloat()
                }
            }
            addView(badgeTextView)
        }
    }

    /**
     * Expanded Quick Fare Logger Card (Appears on top of Ola / Uber)
     */
    private fun createExpandedCardView(): LinearLayout {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val screenWidth = resources.displayMetrics.widthPixels
            val cardWidth = Math.min(dp(320), screenWidth - dp(32))
            layoutParams = LinearLayout.LayoutParams(cardWidth, LinearLayout.LayoutParams.WRAP_CONTENT)
            setPadding(dp(16), dp(14), dp(16), dp(16))

            background = GradientDrawable().apply {
                setColor(Color.parseColor("#111726"))
                setStroke(dp(2), Color.parseColor("#F59E0B"))
                cornerRadius = dp(16).toFloat()
            }
        }

        // Header: Title & Close [X] Button
        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val titleView = TextView(this).apply {
            text = "⚡ QUICK RIDE LOGGER"
            setTextColor(Color.parseColor("#F8FAFC"))
            textSize = 14f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val closeBtn = TextView(this).apply {
            text = "✕"
            setTextColor(Color.parseColor("#94A3B8"))
            textSize = 18f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(dp(8), dp(4), dp(8), dp(4))
            setOnClickListener {
                collapseCard()
            }
        }

        headerRow.addView(titleView)
        headerRow.addView(closeBtn)
        card.addView(headerRow)

        val subTextView = TextView(this).apply {
            text = "Direct entry while running Ola, Uber or Rapido"
            setTextColor(Color.parseColor("#64748B"))
            textSize = 11f
            setPadding(0, dp(2), 0, dp(12))
        }
        card.addView(subTextView)

        // 3 Platform Selector Buttons
        val platformRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, dp(12))
        }

        val olaBtn = createPlatformButton("OLA", "🚕 Ola", true)
        val uberBtn = createPlatformButton("UBER", "🚗 Uber", false)
        val rapidoBtn = createPlatformButton("RAPIDO", "🛵 Rapido", false)

        val buttons = listOf(olaBtn, uberBtn, rapidoBtn)

        val updatePlatformSelection = { selected: String ->
            selectedPlatform = selected
            for (btn in buttons) {
                val isSel = (btn.tag == selected)
                btn.background = GradientDrawable().apply {
                    setColor(if (isSel) Color.parseColor("#F59E0B") else Color.parseColor("#161F33"))
                    setStroke(dp(1), if (isSel) Color.parseColor("#F59E0B") else Color.parseColor("#334155"))
                    cornerRadius = dp(8).toFloat()
                }
                btn.setTextColor(if (isSel) Color.BLACK else Color.WHITE)
            }
        }

        olaBtn.setOnClickListener { updatePlatformSelection("OLA") }
        uberBtn.setOnClickListener { updatePlatformSelection("UBER") }
        rapidoBtn.setOnClickListener { updatePlatformSelection("RAPIDO") }

        platformRow.addView(olaBtn)
        platformRow.addView(uberBtn)
        platformRow.addView(rapidoBtn)
        card.addView(platformRow)

        // Fare Input Field
        fareInput = EditText(this).apply {
            hint = "Enter Fare (₹)"
            setHintTextColor(Color.parseColor("#64748B"))
            setTextColor(Color.WHITE)
            textSize = 20f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
            setPadding(dp(12), dp(10), dp(12), dp(10))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#161F33"))
                setStroke(dp(1), Color.parseColor("#334155"))
                cornerRadius = dp(10).toFloat()
            }
        }
        card.addView(fareInput)

        // Quick Amount Chips Row (+₹50, +₹100, +₹150, +₹200)
        val chipsRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(8), 0, dp(12))
        }

        val amounts = listOf(50, 100, 150, 200)
        for (amt in amounts) {
            val chip = TextView(this).apply {
                text = "₹$amt"
                setTextColor(Color.parseColor("#F59E0B"))
                textSize = 12f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
                setPadding(dp(8), dp(6), dp(8), dp(6))
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    setMargins(dp(2), 0, dp(2), 0)
                }
                background = GradientDrawable().apply {
                    setColor(Color.parseColor("rgba(245, 158, 11, 0.12)".let { "#262013" }))
                    setStroke(dp(1), Color.parseColor("#F59E0B"))
                    cornerRadius = dp(6).toFloat()
                }
                setOnClickListener {
                    fareInput?.setText(amt.toString())
                }
            }
            chipsRow.addView(chip)
        }
        card.addView(chipsRow)

        // Payment Mode Row: Cash vs Online
        val paymentRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, dp(12))
        }

        val cashBtn = Button(this).apply {
            text = "💵 Cash"
            textSize = 12f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, dp(38), 1f).apply {
                setMargins(0, 0, dp(4), 0)
            }
        }

        val upiBtn = Button(this).apply {
            text = "📱 Online / UPI"
            textSize = 12f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, dp(38), 1f).apply {
                setMargins(dp(4), 0, 0, 0)
            }
        }

        val updatePaymentSelection = { isCash: Boolean ->
            selectedPayment = if (isCash) "CASH" else "UPI"
            cashBtn.background = GradientDrawable().apply {
                setColor(if (isCash) Color.parseColor("#10B981") else Color.parseColor("#161F33"))
                cornerRadius = dp(8).toFloat()
            }
            cashBtn.setTextColor(if (isCash) Color.BLACK else Color.WHITE)

            upiBtn.background = GradientDrawable().apply {
                setColor(if (!isCash) Color.parseColor("#10B981") else Color.parseColor("#161F33"))
                cornerRadius = dp(8).toFloat()
            }
            upiBtn.setTextColor(if (!isCash) Color.BLACK else Color.WHITE)
        }

        cashBtn.setOnClickListener { updatePaymentSelection(true) }
        upiBtn.setOnClickListener { updatePaymentSelection(false) }
        updatePaymentSelection(true)

        paymentRow.addView(cashBtn)
        paymentRow.addView(upiBtn)
        card.addView(paymentRow)

        // Submit Button: Log Fare & Continue
        val submitBtn = Button(this).apply {
            text = "⚡ LOG FARE & CONTINUE"
            setTextColor(Color.BLACK)
            textSize = 14f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(0, dp(12), 0, dp(12))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#F59E0B"))
                cornerRadius = dp(10).toFloat()
            }
            setOnClickListener {
                submitRide()
            }
        }
        card.addView(submitBtn)

        // Footer: Open MM Ride App
        val openAppRow = TextView(this).apply {
            text = "↗️ Open Full MM Ride App"
            setTextColor(Color.parseColor("#94A3B8"))
            textSize = 11f
            gravity = Gravity.CENTER
            setPadding(0, dp(10), 0, 0)
            setOnClickListener {
                collapseCard()
                val intent = Intent(this@FloatingBubbleService, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                }
                startActivity(intent)
            }
        }
        card.addView(openAppRow)

        return card
    }

    private fun createPlatformButton(platform: String, label: String, isDefault: Boolean): Button {
        return Button(this).apply {
            tag = platform
            text = label
            textSize = 12f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, dp(38), 1f).apply {
                setMargins(dp(2), 0, dp(2), 0)
            }
            background = GradientDrawable().apply {
                setColor(if (isDefault) Color.parseColor("#F59E0B") else Color.parseColor("#161F33"))
                setStroke(dp(1), if (isDefault) Color.parseColor("#F59E0B") else Color.parseColor("#334155"))
                cornerRadius = dp(8).toFloat()
            }
            setTextColor(if (isDefault) Color.BLACK else Color.WHITE)
        }
    }

    private fun submitRide() {
        val textVal = fareInput?.text?.toString()?.trim() ?: ""
        val fare = textVal.toDoubleOrNull() ?: 0.0

        if (fare <= 0.0) {
            Toast.makeText(this, "Please enter a valid fare amount (₹)", Toast.LENGTH_SHORT).show()
            return
        }

        // Send event to React Native via FloatingBubbleModule
        FloatingBubbleModule.notifyRideLogged(selectedPlatform, fare, selectedPayment)

        totalRides += 1
        totalEarnings += fare
        updateStats(totalRides, totalEarnings)

        Toast.makeText(this, "✅ $selectedPlatform ₹${fare.toInt()} Logged!", Toast.LENGTH_LONG).show()

        fareInput?.setText("")
        collapseCard()
    }

    private fun expandCard() {
        val wm = windowManager ?: return
        val params = bubbleParams ?: return

        compactView?.visibility = View.GONE
        expandedView?.visibility = View.VISIBLE

        // Make window focusable so keyboard appears for entering fare
        params.flags = WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
        wm.updateViewLayout(bubbleContainer, params)
    }

    private fun collapseCard() {
        val wm = windowManager ?: return
        val params = bubbleParams ?: return

        expandedView?.visibility = View.GONE
        compactView?.visibility = View.VISIBLE

        // Return to non-focusable so driver touches underlying Ola/Uber app smoothly
        params.flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
        wm.updateViewLayout(bubbleContainer, params)
    }

    private fun updateStats(rides: Int, earnings: Double) {
        totalRides = rides
        totalEarnings = earnings
        badgeTextView?.text = if (rides > 0) "$rides • ₹${earnings.toInt()}" else "0 rides"
    }

    private fun createAlertBannerView(): LinearLayout {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val screenWidth = resources.displayMetrics.widthPixels
            val cardWidth = Math.min(dp(320), screenWidth - dp(32))
            layoutParams = LinearLayout.LayoutParams(cardWidth, LinearLayout.LayoutParams.WRAP_CONTENT)
            setPadding(dp(16), dp(14), dp(16), dp(16))

            background = GradientDrawable().apply {
                setColor(Color.parseColor("#450A0A"))
                setStroke(dp(2), Color.parseColor("#EF4444"))
                cornerRadius = dp(16).toFloat()
            }
        }

        // Header: Alert Title & Close [X] Button
        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        alertTitleTextView = TextView(this).apply {
            text = "🚨 URGENT ADMIN ALERT"
            setTextColor(Color.WHITE)
            textSize = 14f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val dismissBtn = TextView(this).apply {
            text = "✕"
            setTextColor(Color.parseColor("#FECACA"))
            textSize = 18f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(dp(8), dp(4), dp(8), dp(4))
            setOnClickListener {
                dismissAlertOverlay()
            }
        }

        headerRow.addView(alertTitleTextView)
        headerRow.addView(dismissBtn)
        card.addView(headerRow)

        // Message text
        alertMessageTextView = TextView(this).apply {
            text = "Action required immediately on MM Ride."
            setTextColor(Color.parseColor("#FEE2E2"))
            textSize = 12f
            setPadding(0, dp(6), 0, dp(14))
        }
        card.addView(alertMessageTextView)

        // Action Button: OPEN MM RIDE FULL-SCREEN
        val actionBtn = Button(this).apply {
            text = "↗️ OPEN MM RIDE NOW"
            setTextColor(Color.WHITE)
            textSize = 14f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(0, dp(12), 0, dp(12))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#DC2626"))
                cornerRadius = dp(10).toFloat()
            }
            setOnClickListener {
                launchAppToFront()
                dismissAlertOverlay()
            }
        }
        card.addView(actionBtn)

        return card
    }

    private fun showAlertOverlay(title: String, message: String, alertType: String, autoOpenApp: Boolean) {
        hasActiveAlert = true
        activeAlertTitle = title
        activeAlertMessage = message

        postUrgentNotification(title, message)

        if (autoOpenApp) {
            launchAppToFront()
        }

        val wm = windowManager ?: return
        val params = bubbleParams ?: return

        // Update pill view to alert styling
        badgeTextView?.apply {
            text = "🚨 $title"
            setTextColor(Color.WHITE)
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#DC2626"))
                cornerRadius = dp(12).toFloat()
            }
        }

        compactView?.background = GradientDrawable().apply {
            setColor(Color.parseColor("#450A0A"))
            setStroke(dp(2), Color.parseColor("#EF4444"))
            cornerRadius = dp(24).toFloat()
        }

        alertTitleTextView?.text = "🚨 $title"
        alertMessageTextView?.text = message

        // Show alert banner over Ola/Uber
        compactView?.visibility = View.GONE
        expandedView?.visibility = View.GONE
        alertBannerView?.visibility = View.VISIBLE

        params.flags = WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
        try {
            wm.updateViewLayout(bubbleContainer, params)
        } catch (_: Exception) {}
    }

    private fun dismissAlertOverlay() {
        hasActiveAlert = false
        val wm = windowManager ?: return
        val params = bubbleParams ?: return

        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.cancel(ALERT_NOTIFICATION_ID)
        } catch (_: Exception) {}

        // Restore normal pill
        compactView?.background = GradientDrawable().apply {
            setColor(Color.parseColor("#0A0D14"))
            setStroke(dp(2), Color.parseColor("#F59E0B"))
            cornerRadius = dp(24).toFloat()
        }

        badgeTextView?.apply {
            text = if (totalRides > 0) "$totalRides • ₹${totalEarnings.toInt()}" else "0 rides"
            setTextColor(Color.BLACK)
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#F59E0B"))
                cornerRadius = dp(12).toFloat()
            }
        }

        alertBannerView?.visibility = View.GONE
        expandedView?.visibility = View.GONE
        compactView?.visibility = View.VISIBLE

        params.flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
        try {
            wm.updateViewLayout(bubbleContainer, params)
        } catch (_: Exception) {}
    }

    private fun launchAppToFront() {
        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            startActivity(intent)
        } catch (_: Exception) {}
    }

    private fun attachTouchDragListener(view: View) {
        view.setOnTouchListener(object : View.OnTouchListener {
            private var initialX = 0
            private var initialY = 0
            private var initialTouchX = 0f
            private var initialTouchY = 0f
            private var isDragging = false

            override fun onTouch(v: View?, event: MotionEvent?): Boolean {
                val params = bubbleParams ?: return false
                val wm = windowManager ?: return false

                when (event?.action) {
                    MotionEvent.ACTION_DOWN -> {
                        initialX = params.x
                        initialY = params.y
                        initialTouchX = event.rawX
                        initialTouchY = event.rawY
                        isDragging = false
                        return true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = (event.rawX - initialTouchX).toInt()
                        val dy = (event.rawY - initialTouchY).toInt()

                        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                            isDragging = true
                        }

                        if (isDragging) {
                            params.x = initialX + dx
                            params.y = initialY + dy
                            wm.updateViewLayout(bubbleContainer, params)
                        }
                        return true
                    }
                    MotionEvent.ACTION_UP -> {
                        if (!isDragging) {
                            if (hasActiveAlert) {
                                launchAppToFront()
                            } else {
                                expandCard()
                            }
                        }
                        return true
                    }
                }
                return false
            }
        })
    }
}
