package com.adipredictor.app

import android.content.Context
import android.content.Intent
import android.app.PendingIntent
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.adipredictor.data.*
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

internal object NativeServices {
    var transport: (Context) -> Transport = { RemoteTransport() }
    var boards: () -> DirectBoardSource = { DirectBoards() }
}

class DiskStore(context: Context) : Store {
    private val prefs = context.getSharedPreferences("adipredictor.native.v1", Context.MODE_PRIVATE)
    override fun read(key: String) = prefs.getString(key, null)
    override fun write(key: String, value: String) { check(prefs.edit().putString(key, value).commit()) { "CACHE_WRITE_FAILED" } }
}
class RemoteTransport(private val root: String = "https://raw.githubusercontent.com/trinityzanetamanu-code/AdiPredictor/main/public") : Transport {
    override suspend fun get(path: String): String = withContext(Dispatchers.IO) {
        require(!path.contains("..") && !path.contains(":") && !path.startsWith("/"))
        val connection = URL("$root/$path?_=${System.currentTimeMillis()}").openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 12000; connection.readTimeout = 12000; connection.useCaches = false
            val status = connection.responseCode
            check(status == 200) { "HTTP_$status" }
            connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        } finally { connection.disconnect() }
    }
}
class AssetsTransport(private val context: Context) : Transport {
    override suspend fun get(path: String) = withContext(Dispatchers.IO) { context.assets.open("public/$path").bufferedReader(Charsets.UTF_8).use { it.readText() } }
}
fun notify(context: Context, notice: Notice, preferences: Preferences) {
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel("updates", "Hasil dan prediksi", NotificationManager.IMPORTANCE_DEFAULT))
    if (!preferences.claim(notice.key)) return
    val intent = Intent(context, MainActivity::class.java).apply {
        data = android.net.Uri.parse("adipredictor://open?market=${notice.market}&target=${android.net.Uri.encode(notice.target)}")
        flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    val pending = PendingIntent.getActivity(context, notice.key.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(context, "updates").setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle(notice.title).setContentText(notice.body).setContentIntent(pending).setAutoCancel(true).build()
    try { manager.notify(notice.key.hashCode(), notification) } catch (_: SecurityException) { /* Permission may be revoked between check and delivery. */ }
}
