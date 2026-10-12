package com.adipredictor.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.adipredictor.data.*

fun scheduleReminders(context: Context) {
    val store = DiskStore(context); val preferences = Preferences(store).notifications()
    val alarm = context.getSystemService(AlarmManager::class.java)
    store.read("reminders:scheduled")?.split('\n')?.filter { it.isNotBlank() }?.forEach { key ->
        alarm.cancel(PendingIntent.getBroadcast(context, key.hashCode(), Intent(context, ReminderReceiver::class.java).setAction(key), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    }
    val upcoming = if (preferences["master"] == true && preferences["liveDraw"] == true) upcomingReminders(java.time.Instant.now()) else emptyList()
    upcoming.forEach { reminder ->
        val intent = Intent(context, ReminderReceiver::class.java).setAction(reminder.key)
            .putExtra("key", reminder.key).putExtra("market", reminder.market).putExtra("source", reminder.source)
        val pending = PendingIntent.getBroadcast(context, reminder.key.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.at.toEpochMilli(), pending)
    }
    store.write("reminders:scheduled", upcoming.joinToString("\n") { it.key })
}
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val preferences = Preferences(DiskStore(context))
        if (preferences.notifications()["master"] != true || preferences.notifications()["liveDraw"] != true) return
        val key = intent.getStringExtra("key") ?: return
        notify(context, Notice(key, "liveDraw", "Draw ${intent.getStringExtra("source")} akan dimulai", "Periksa LiveDraw dan status sumber", intent.getStringExtra("market") ?: "HK", "LiveDraw"), preferences)
    }
}
