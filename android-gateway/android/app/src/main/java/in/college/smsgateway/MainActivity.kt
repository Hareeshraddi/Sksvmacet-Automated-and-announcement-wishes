package in.college.smsgateway

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.Collections

class MainActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var port: EditText
    private lateinit var token: EditText
    private lateinit var ipText: TextView
    private val prefs by lazy { getSharedPreferences("gateway", MODE_PRIVATE) }
    private val permissionRequest = 1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (18 * resources.displayMetrics.density).toInt()
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }
        layout.addView(TextView(this).apply {
            text = "Smart College SMS Gateway"
            textSize = 22f
        })
        layout.addView(TextView(this).apply {
            text = "Keep this phone on the same Wi-Fi as the college server. The server sends messages here; this phone's SIM sends the SMS. No API key and no third-party service is used."
            setPadding(0, pad / 2, 0, pad)
        })
        status = TextView(this).apply {
            text = "Stopped"
            setPadding(0, pad, 0, pad)
        }
        layout.addView(status)
        layout.addView(TextView(this).apply { text = "Port" })
        port = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            setText(prefs.getString("port", "8080"))
        }
        layout.addView(port)
        layout.addView(TextView(this).apply { text = "Shared token (optional, recommended on shared Wi-Fi)" })
        token = EditText(this).apply { setText(prefs.getString("token", "")) }
        layout.addView(token)
        ipText = TextView(this).apply {
            text = "This phone's address: ${localIp()}:${prefs.getString("port", "8080")}"
            setPadding(0, pad, 0, pad)
        }
        layout.addView(ipText)
        layout.addView(Button(this).apply {
            text = "Start gateway"
            setOnClickListener { startGateway() }
        })
        layout.addView(Button(this).apply {
            text = "Stop gateway"
            setOnClickListener {
                stopService(Intent(this@MainActivity, GatewayService::class.java))
                status.text = "Stopped"
            }
        })
        layout.addView(Button(this).apply {
            text = "Allow background running"
            setOnClickListener { allowBackground() }
        })
        layout.addView(TextView(this).apply {
            text = "Note: Android limits apps that are not the default SMS app to about 30 SMS per 30 minutes. This mode is for small batches and notices, not thousands of messages."
            setPadding(0, pad, 0, 0)
        })
        setContentView(layout)
        status.text = if (GatewayService.running) "Gateway service is running" else "Stopped"
    }

    private fun startGateway() {
        val needed = mutableListOf<String>()
        if (checkSelfPermission(Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) needed.add(Manifest.permission.SEND_SMS)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) needed.add(Manifest.permission.POST_NOTIFICATIONS)
        if (needed.isNotEmpty()) {
            requestPermissions(needed.toTypedArray(), permissionRequest)
            return
        }
        launch()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == permissionRequest) {
            if (grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) launch()
            else status.text = "SMS permission is required. Enable it in Settings > Apps > SMS Gateway > Permissions."
        }
    }

    private fun launch() {
        val p = port.text.toString().toIntOrNull()?.coerceIn(1024, 65535) ?: 8080
        prefs.edit().putString("port", p.toString()).putString("token", token.text.toString()).apply()
        val intent = Intent(this, GatewayService::class.java).putExtra("port", p).putExtra("token", token.text.toString())
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent) else startService(intent)
        ipText.text = "This phone's address: ${localIp()}:$p"
        status.text = "Running on port $p. Backend URL: http://${localIp()}:$p"
    }

    private fun allowBackground() {
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        if (!pm.isIgnoringBatteryOptimizations(packageName)) {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        }
    }

    private fun localIp(): String = try {
        val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())
        val addresses = interfaces.filter { it.isUp && !it.isLoopback }
            .flatMap { Collections.list(it.inetAddresses) }
            .filterIsInstance<Inet4Address>()
        addresses.firstOrNull { !it.isLinkLocalAddress }?.hostAddress ?: "phone-ip"
    } catch (e: Exception) {
        "phone-ip"
    }
}
