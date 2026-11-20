package expo.modules.disguise

import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DisguiseModule : Module() {
  private val ctx get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun alias(id: String) = ComponentName(ctx.packageName, ctx.packageName + ".alias." + id)

  override fun definition() = ModuleDefinition {
    Name("Disguise")

    // Turn on one launcher entry and off all the others. The phone's home screen may take a moment to notice.
    Function("setAlias") { id: String, all: List<String> ->
      val pm = ctx.packageManager
      pm.setComponentEnabledSetting(alias(id), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
      for (other in all) {
        if (other != id) {
          pm.setComponentEnabledSetting(alias(other), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
        }
      }
    }

    Function("currentAlias") { all: List<String> ->
      val pm = ctx.packageManager
      all.firstOrNull {
        val s = pm.getComponentEnabledSetting(alias(it))
        s == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
      }
    }

    // Home-screen shortcut with any name and picture you like.
    AsyncFunction("pinShortcut") { label: String, pngBase64: String? ->
      val bmp = pngBase64?.let {
        val bytes = Base64.decode(it, Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
      }
      val icon = if (bmp != null) IconCompat.createWithBitmap(bmp) else IconCompat.createWithResource(ctx, ctx.applicationInfo.icon)
      val intent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
        ?: throw IllegalStateException("no launcher entry")
      intent.action = Intent.ACTION_MAIN
      val info = ShortcutInfoCompat.Builder(ctx, "custom-" + System.currentTimeMillis())
        .setShortLabel(label)
        .setLongLabel(label)
        .setIcon(icon)
        .setIntent(intent)
        .build()
      ShortcutManagerCompat.isRequestPinShortcutSupported(ctx) && ShortcutManagerCompat.requestPinShortcut(ctx, info, null)
    }
  }
}
