package com.racoondevs.runlyerp

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.PowerManager
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject

// In-call audio output for the WebView (which can't pick a route itself):
// phone earpiece, loudspeaker, wired headset or Bluetooth. API 31+ uses the
// communication-device API; older versions fall back to speakerphone/SCO.
object AudioRoute {
  private fun manager(context: Context) = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private fun idFor(type: Int): String? = when (type) {
    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
    AudioDeviceInfo.TYPE_WIRED_HEADSET,
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
    AudioDeviceInfo.TYPE_USB_HEADSET -> "wired"
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "bluetooth"
    else -> if (Build.VERSION.SDK_INT >= 31 && type == AudioDeviceInfo.TYPE_BLE_HEADSET) "bluetooth" else null
  }

  private fun labelFor(id: String, name: CharSequence?): String = when (id) {
    "earpiece" -> "Teléfono"
    "speaker" -> "Altavoz"
    "wired" -> "Audífonos"
    else -> if (name.isNullOrBlank()) "Bluetooth" else "Bluetooth · $name"
  }

  fun list(context: Context): JSObject {
    val am = manager(context)
    val routes = JSArray()
    val seen = mutableSetOf<String>()
    var active: String? = null
    if (Build.VERSION.SDK_INT >= 31) {
      for (device in am.availableCommunicationDevices) {
        val id = idFor(device.type) ?: continue
        if (!seen.add(id)) continue
        routes.put(JSObject().apply { put("id", id); put("label", labelFor(id, device.productName)) })
      }
      active = am.communicationDevice?.let { idFor(it.type) }
    } else {
      val candidates = mutableListOf("earpiece", "speaker")
      @Suppress("DEPRECATION")
      if (am.isWiredHeadsetOn) candidates.add("wired")
      if (am.isBluetoothScoAvailableOffCall) candidates.add("bluetooth")
      for (id in candidates) routes.put(JSObject().apply { put("id", id); put("label", labelFor(id, null)) })
      @Suppress("DEPRECATION")
      active = when {
        am.isSpeakerphoneOn -> "speaker"
        am.isBluetoothScoOn -> "bluetooth"
        am.isWiredHeadsetOn -> "wired"
        else -> "earpiece"
      }
    }
    return JSObject().apply {
      put("routes", routes)
      put("active", active)
    }
  }

  // Some OEMs ignore setCommunicationDevice (or don't list the built-in
  // speaker), so the speaker falls back to the legacy speakerphone switch.
  @Suppress("DEPRECATION")
  private fun legacySet(am: AudioManager, id: String) {
    when (id) {
      "speaker" -> { am.stopBluetoothSco(); am.isBluetoothScoOn = false; am.isSpeakerphoneOn = true }
      "bluetooth" -> { am.isSpeakerphoneOn = false; am.startBluetoothSco(); am.isBluetoothScoOn = true }
      else -> { am.stopBluetoothSco(); am.isBluetoothScoOn = false; am.isSpeakerphoneOn = false }
    }
  }

  fun set(context: Context, id: String): Boolean {
    val am = manager(context)
    am.mode = AudioManager.MODE_IN_COMMUNICATION
    if (Build.VERSION.SDK_INT >= 31) {
      val device = am.availableCommunicationDevices.firstOrNull { idFor(it.type) == id }
      if (device != null && am.setCommunicationDevice(device) && am.communicationDevice?.let { idFor(it.type) } == id) return true
      if (id == "speaker") {
        am.clearCommunicationDevice()
        @Suppress("DEPRECATION")
        am.isSpeakerphoneOn = true
        return true
      }
      return false
    }
    legacySet(am, id)
    return true
  }

  // Hands the audio routing back to the system once the call is over.
  fun reset(context: Context) {
    val am = manager(context)
    if (Build.VERSION.SDK_INT >= 31) am.clearCommunicationDevice()
    @Suppress("DEPRECATION")
    run { am.stopBluetoothSco(); am.isBluetoothScoOn = false; am.isSpeakerphoneOn = false }
    am.mode = AudioManager.MODE_NORMAL
  }
}

// Turns the screen off (without locking the phone) while it is held against
// the ear, like a regular phone call. Released as soon as it is disabled.
object ProximityScreen {
  private var lock: PowerManager.WakeLock? = null

  fun set(context: Context, enabled: Boolean): Boolean {
    val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    if (!enabled) {
      lock?.let { if (it.isHeld) it.release() }
      lock = null
      return true
    }
    if (!pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) return false
    val current = lock ?: pm.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "runly:call-proximity").also {
      it.setReferenceCounted(false)
      lock = it
    }
    if (!current.isHeld) current.acquire(4 * 60 * 60 * 1000L)
    return true
  }
}
