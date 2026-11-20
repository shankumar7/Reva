package expo.modules.disguise

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

/**
 * Runs while a call is on, so Android keeps the microphone and the network alive after you leave the app
 * or the screen locks. Its notification is dressed as a plain timer: no name, no mention of a call.
 */
class CallService : Service() {
  private var lock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) {
      nm.createNotificationChannel(NotificationChannel("timer", "Timer", NotificationManager.IMPORTANCE_LOW).apply {
        setShowBadge(false)
        lockscreenVisibility = Notification.VISIBILITY_SECRET
      })
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)
    val tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val n = Notification.Builder(this, "timer")
      .setContentTitle("Timer")
      .setContentText("Running")
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setOngoing(true)
      .setContentIntent(tap)
      .setVisibility(Notification.VISIBILITY_SECRET)
      .build()
    if (Build.VERSION.SDK_INT >= 29) startForeground(4101, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    else startForeground(4101, n)
    if (lock == null) {
      lock = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "reva:call").apply { acquire(4 * 60 * 60 * 1000L) }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    lock?.let { if (it.isHeld) it.release() }
    lock = null
    super.onDestroy()
  }
}
