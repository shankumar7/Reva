package expo.modules.disguise

import android.content.ComponentName
import android.content.ContentValues
import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File
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

    // Call sound: on = phone-call mode (echo cancelling, volume keys control the call), off = back to normal.
    Function("setCallAudio") { on: Boolean ->
      val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      if (on) {
        am.mode = AudioManager.MODE_IN_COMMUNICATION
      } else {
        @Suppress("DEPRECATION") am.isSpeakerphoneOn = false
        am.mode = AudioManager.MODE_NORMAL
      }
    }
    Function("setSpeaker") { on: Boolean ->
      val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      @Suppress("DEPRECATION") am.isSpeakerphoneOn = on
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

    // Copies a picture file into the phone's gallery (Pictures/Saved). Needs no permission on Android 10 and newer.
    AsyncFunction("saveImageToGallery") { path: String, displayName: String ->
      try {
        val resolver = ctx.contentResolver
        val values = ContentValues().apply {
          put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
          put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
          if (Build.VERSION.SDK_INT >= 29) {
            put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Saved")
            put(MediaStore.Images.Media.IS_PENDING, 1)
          }
        }
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return@AsyncFunction false
        resolver.openOutputStream(uri)?.use { out ->
          File(path.removePrefix("file://")).inputStream().use { it.copyTo(out) }
        }
        if (Build.VERSION.SDK_INT >= 29) {
          values.clear()
          values.put(MediaStore.Images.Media.IS_PENDING, 0)
          resolver.update(uri, values, null, null)
        }
        true
      } catch (e: Exception) {
        false
      }
    }
  }
}
