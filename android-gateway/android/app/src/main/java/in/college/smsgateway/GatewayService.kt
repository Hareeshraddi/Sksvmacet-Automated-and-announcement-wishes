package in.college.smsgateway

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.telephony.SmsManager
import org.json.JSONObject
import java.io.BufferedInputStream
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors

class GatewayService : Service() {
    private var server: ServerSocket? = null
    private val pool = Executors.newCachedThreadPool()
    private val rateLock = Any()
    private val recentSends = mutableListOf<Long>()
    private var port = 8080
    private var token = ""

    override fun onCreate() {
        super.onCreate()
        running = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        port = intent?.getIntExtra("port", 8080) ?: 8080
        token = intent?.getStringExtra("token").orEmpty()
        startForegroundCompat()
        if (server == null) pool.execute { serve() }
        return START_STICKY
    }

    private fun startForegroundCompat() {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) {
            manager.createNotificationChannel(NotificationChannel("gateway", "SMS gateway", NotificationManager.IMPORTANCE_LOW))
        }
        val notification: Notification = Notification.Builder(this, "gateway")
            .setContentTitle("SMS gateway running")
            .setContentText("Listening on port $port")
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        else startForeground(1, notification)
    }

    private fun serve() {
        try {
            server = ServerSocket(port)
            while (running) {
                val socket = server?.accept() ?: break
                pool.execute { handle(socket) }
            }
        } catch (e: Exception) {
            notify("Gateway stopped: ${e.message}")
        }
    }

    private fun handle(socket: Socket) {
        socket.use { s ->
            try {
                s.soTimeout = 20000
                val input = BufferedInputStream(s.getInputStream())
                val requestLine = readLine(input) ?: return
                val parts = requestLine.split(" ")
                if (parts.size < 2) return
                val method = parts[0]
                val path = parts[1].substringBefore('?')
                var length = 0
                var suppliedToken = ""
                while (true) {
                    val line = readLine(input) ?: break
                    if (line.isEmpty()) break
                    val idx = line.indexOf(':')
                    if (idx > 0) {
                        when (line.substring(0, idx).trim().lowercase()) {
                            "content-length" -> length = line.substring(idx + 1).trim().toIntOrNull() ?: 0
                            "x-gateway-token" -> suppliedToken = line.substring(idx + 1).trim()
                        }
                    }
                }
                if (token.isNotEmpty() && suppliedToken != token) {
                    reply(s, 401, JSONObject().put("ok", false).put("error", "Invalid gateway token"))
                    return
                }
                when {
                    method == "GET" && path == "/health" ->
                        reply(s, 200, JSONObject().put("ok", true).put("device", Build.MODEL).put("port", port))
                    method == "POST" && path == "/send" -> {
                        if (length <= 0 || length > 100000) {
                            reply(s, 400, JSONObject().put("ok", false).put("error", "Invalid request body"))
                            return
                        }
                        val bytes = ByteArray(length)
                        var read = 0
                        while (read < length) {
                            val n = input.read(bytes, read, length - read)
                            if (n < 0) break
                            read += n
                        }
                        val json = JSONObject(String(bytes, 0, read, Charsets.UTF_8))
                        val text = json.optString("body").trim()
                        if (text.isEmpty()) {
                            reply(s, 400, JSONObject().put("ok", false).put("error", "Message body is empty"))
                            return
                        }
                        if (!withinRateLimit()) {
                            reply(s, 429, JSONObject().put("ok", false).put("error", "Android limits non-default SMS apps to about 30 messages per 30 minutes. Wait, or send fewer messages."))
                            return
                        }
                        try {
                            sendSms(json.optString("to"), text)
                            reply(s, 200, JSONObject().put("ok", true).put("id", System.currentTimeMillis().toString()))
                        } catch (e: SecurityException) {
                            reply(s, 502, JSONObject().put("ok", false).put("error", "SMS permission denied. Allow SMS for this app."))
                        } catch (e: Exception) {
                            reply(s, 502, JSONObject().put("ok", false).put("error", e.message ?: "SMS send failed"))
                        }
                    }
                    else -> reply(s, 404, JSONObject().put("ok", false).put("error", "Not found"))
                }
            } catch (e: Exception) {
                reply(s, 400, JSONObject().put("ok", false).put("error", e.message ?: "Bad request"))
            }
        }
    }

    private fun sendSms(rawTo: String, text: String) {
        val digits = rawTo.filter { it.isDigit() }
        val normalized = when {
            digits.length == 10 -> "+91$digits"
            digits.length == 12 && digits.startsWith("91") -> "+$digits"
            digits.length == 11 && digits.startsWith("0") -> "+91${digits.drop(1)}"
            else -> "+$digits"
        }
        val manager = if (Build.VERSION.SDK_INT >= 31) getSystemService(SmsManager::class.java) else SmsManager.getDefault()
        val parts = manager.divideMessage(text)
        if (parts.size > 1) manager.sendMultipartTextMessage(normalized, null, parts, null, null)
        else manager.sendTextMessage(normalized, null, text, null, null)
    }

    private fun withinRateLimit(): Boolean = synchronized(rateLock) {
        val now = System.currentTimeMillis()
        recentSends.removeAll { now - it > 30 * 60 * 1000L }
        if (recentSends.size >= 28) false else {
            recentSends.add(now)
            true
        }
    }

    private fun readLine(input: BufferedInputStream): String? {
        val sb = StringBuilder()
        while (true) {
            val c = input.read()
            if (c < 0) return if (sb.isEmpty()) null else sb.toString()
            if (c == '\n'.code) return sb.toString().trimEnd('\r')
            sb.append(c.toChar())
            if (sb.length > 8192) return null
        }
    }

    private fun reply(socket: Socket, code: Int, json: JSONObject) {
        try {
            val data = json.toString().toByteArray()
            val reason = if (code in 200..299) "OK" else "Error"
            val out = socket.getOutputStream()
            out.write("HTTP/1.1 $code $reason\r\nContent-Type: application/json\r\nContent-Length: ${data.size}\r\nConnection: close\r\n\r\n".toByteArray())
            out.write(data)
            out.flush()
        } catch (_: Exception) {
        }
    }

    private fun notify(text: String) {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel("gateway", "SMS gateway", NotificationManager.IMPORTANCE_LOW))
        manager.notify(2, Notification.Builder(this, "gateway")
            .setContentTitle("SMS gateway")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .build())
    }

    override fun onDestroy() {
        running = false
        try { server?.close() } catch (_: Exception) {}
        pool.shutdownNow()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        @Volatile var running = false
            private set
    }
}
