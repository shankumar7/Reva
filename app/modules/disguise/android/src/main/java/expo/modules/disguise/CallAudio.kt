package expo.modules.disguise

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build

/** Chooses where call sound goes: Bluetooth if one is connected, else a wired headset, else the earpiece. */
object CallAudio {
  private var active = false
  private var speaker = false
  private var callback: AudioDeviceCallback? = null

  private fun am(ctx: Context) = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private fun bluetoothTypes(): Set<Int> {
    val t = mutableSetOf(AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_HEARING_AID)
    if (Build.VERSION.SDK_INT >= 31) t.add(AudioDeviceInfo.TYPE_BLE_HEADSET)
    return t
  }
  private val wiredTypes = setOf(AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_USB_HEADSET)

  @Synchronized
  fun setActive(ctx: Context, on: Boolean) {
    val m = am(ctx)
    active = on
    if (on) {
      speaker = false
      m.mode = AudioManager.MODE_IN_COMMUNICATION
      if (callback == null) {
        callback = object : AudioDeviceCallback() {
          override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>?) { reroute(ctx) }
          override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>?) { reroute(ctx) }
        }
        m.registerAudioDeviceCallback(callback, null)
      }
      reroute(ctx)
    } else {
      callback?.let { m.unregisterAudioDeviceCallback(it) }
      callback = null
      if (Build.VERSION.SDK_INT >= 31) m.clearCommunicationDevice()
      else {
        @Suppress("DEPRECATION") m.stopBluetoothSco()
        @Suppress("DEPRECATION") m.isBluetoothScoOn = false
        @Suppress("DEPRECATION") m.isSpeakerphoneOn = false
      }
      m.mode = AudioManager.MODE_NORMAL
    }
  }

  @Synchronized
  fun setSpeaker(ctx: Context, on: Boolean) {
    speaker = on
    if (active) reroute(ctx)
  }

  @Synchronized
  private fun reroute(ctx: Context) {
    val m = am(ctx)
    if (!active) return
    try {
      if (Build.VERSION.SDK_INT >= 31) {
        val devices = m.availableCommunicationDevices
        val pick: AudioDeviceInfo? = if (speaker) devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
          else devices.firstOrNull { bluetoothTypes().contains(it.type) }
            ?: devices.firstOrNull { wiredTypes.contains(it.type) }
            ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE }
        if (pick != null) m.setCommunicationDevice(pick) else m.clearCommunicationDevice()
      } else {
        val outputs = m.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
        val bt = !speaker && outputs.any { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO }
        if (bt) {
          @Suppress("DEPRECATION") m.startBluetoothSco()
          @Suppress("DEPRECATION") m.isBluetoothScoOn = true
          @Suppress("DEPRECATION") m.isSpeakerphoneOn = false
        } else {
          @Suppress("DEPRECATION") m.stopBluetoothSco()
          @Suppress("DEPRECATION") m.isBluetoothScoOn = false
          @Suppress("DEPRECATION") m.isSpeakerphoneOn = speaker
        }
      }
    } catch (_: Exception) {
      // a headset that vanished while choosing: the next device change tries again
    }
  }

  fun route(ctx: Context): String {
    val m = am(ctx)
    if (!active) return "none"
    return try {
      if (Build.VERSION.SDK_INT >= 31) {
        val t = m.communicationDevice?.type
        when {
          t == null -> "earpiece"
          bluetoothTypes().contains(t) -> "bluetooth"
          wiredTypes.contains(t) -> "headset"
          t == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
          else -> "earpiece"
        }
      } else {
        @Suppress("DEPRECATION")
        when {
          m.isBluetoothScoOn -> "bluetooth"
          m.isSpeakerphoneOn -> "speaker"
          m.isWiredHeadsetOn -> "headset"
          else -> "earpiece"
        }
      }
    } catch (_: Exception) { "earpiece" }
  }
}
