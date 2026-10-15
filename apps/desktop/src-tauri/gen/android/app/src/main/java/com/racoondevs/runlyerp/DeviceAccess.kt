package com.racoondevs.runlyerp

import android.Manifest
import android.app.Activity
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.nfc.NfcAdapter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject

// No arbitrary Android intents/permissions are exposed to remote modules.
class DeviceAccess(private val activity: Activity) {
  private val handler = Handler(Looper.getMainLooper())
  private var nfcPending: Invoke? = null
  private val adapter get() = (activity.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
  private val nfc get() = NfcAdapter.getDefaultAdapter(activity)
  private val prefs get() = activity.getSharedPreferences("runly_device", Context.MODE_PRIVATE)

  private fun androidPermission(name: String) = when (name) {
    "camera" -> Manifest.permission.CAMERA
    "microphone" -> Manifest.permission.RECORD_AUDIO
    "notifications" -> if (Build.VERSION.SDK_INT >= 33) Manifest.permission.POST_NOTIFICATIONS else null
    "bluetooth" -> if (Build.VERSION.SDK_INT >= 31) Manifest.permission.BLUETOOTH_CONNECT else null
    else -> null
  }

  fun granted(name: String): Boolean {
    val permission = androidPermission(name)
    return permission == null || ContextCompat.checkSelfPermission(activity, permission) == PackageManager.PERMISSION_GRANTED
  }

  fun markRequested(name: String) { prefs.edit().putBoolean(name, true).apply() }

  private fun entry(name: String, available: Boolean, enabled: Boolean = true): JSObject {
    val permission = androidPermission(name)
    val state = when {
      !available -> "unsupported"
      granted(name) -> "granted"
      prefs.getBoolean(name, false) && permission != null && !ActivityCompat.shouldShowRequestPermissionRationale(activity, permission) -> "blocked"
      prefs.getBoolean(name, false) -> "denied"
      else -> "prompt"
    }
    return JSObject().apply { put("state", state); put("available", available); put("enabled", enabled) }
  }

  fun status() = JSObject().apply {
    put("camera", entry("camera", activity.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)))
    put("microphone", entry("microphone", activity.packageManager.hasSystemFeature(PackageManager.FEATURE_MICROPHONE)))
    put("notifications", entry("notifications", true, NotificationManagerCompat.from(activity).areNotificationsEnabled()))
    put("bluetooth", entry("bluetooth", adapter != null, if (granted("bluetooth")) adapter?.isEnabled == true else false))
    put("nfc", JSObject().apply { put("state", if (nfc == null) "unsupported" else "granted"); put("available", nfc != null); put("enabled", nfc?.isEnabled == true) })
    put("screen", JSObject().apply { put("state", "per-session"); put("available", true); put("enabled", true) })
  }

  fun settings(invoke: Invoke) {
    val name = invoke.getArgs().optString("permission", "")
    val intent = when (name) {
      "nfc" -> Intent(Settings.ACTION_NFC_SETTINGS)
      "bluetooth" -> Intent(Settings.ACTION_BLUETOOTH_SETTINGS)
      else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${activity.packageName}"))
    }
    try { activity.startActivity(intent); invoke.resolve() }
    catch (_: Exception) { invoke.reject("No se pudieron abrir los ajustes de Android.") }
  }

  fun bluetoothPaired(invoke: Invoke) {
    if (!granted("bluetooth")) { invoke.reject("BLUETOOTH_PERMISSION_REQUIRED"); return }
    val current = adapter
    if (current == null || !current.isEnabled) { invoke.reject("BLUETOOTH_UNAVAILABLE"); return }
    try {
      val devices = JSArray()
      current.bondedDevices.take(100).forEach { device ->
        devices.put(JSObject().apply { put("id", device.address); put("name", device.name ?: "Dispositivo Bluetooth"); put("type", device.type) })
      }
      invoke.resolve(JSObject().apply { put("devices", devices) })
    } catch (_: SecurityException) { invoke.reject("BLUETOOTH_PERMISSION_REQUIRED") }
  }

  fun bluetoothPrint(invoke: Invoke) {
    if (!granted("bluetooth")) { invoke.reject("BLUETOOTH_PERMISSION_REQUIRED"); return }
    val current = adapter
    if (current == null || !current.isEnabled) { invoke.reject("BLUETOOTH_UNAVAILABLE"); return }
    BluetoothPrinter.print(activity, current, invoke)
  }

  fun nfcRead(invoke: Invoke) {
    val current = nfc
    if (current == null || !current.isEnabled) { invoke.reject("NFC_UNAVAILABLE"); return }
    if (!activity.hasWindowFocus()) { invoke.reject("Abre Runly para leer una etiqueta NFC."); return }
    if (nfcPending != null) { invoke.reject("Ya hay una lectura NFC activa."); return }
    nfcPending = invoke
    try {
      current.enableReaderMode(activity, { tag ->
        activity.runOnUiThread {
          if (nfcPending === invoke) {
            nfcPending = null
            current.disableReaderMode(activity)
            handler.removeCallbacksAndMessages(null)
            invoke.resolve(JSObject().apply {
              put("id", tag.id.joinToString("") { "%02x".format(it.toInt() and 0xff) })
              put("technologies", JSArray(tag.techList.toList()))
            })
          }
        }
      }, NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or NfcAdapter.FLAG_READER_NFC_F or NfcAdapter.FLAG_READER_NFC_V or NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS, null)
      handler.postDelayed({ if (nfcPending === invoke) cancel("NFC_TIMEOUT") }, 30_000)
    } catch (_: Exception) { cancel("No se pudo iniciar la lectura NFC.") }
  }

  fun cancel(reason: String = "NFC_CANCELLED") {
    handler.removeCallbacksAndMessages(null)
    if (nfcPending != null) nfc?.disableReaderMode(activity)
    val pending = nfcPending
    nfcPending = null
    pending?.reject(reason)
  }
}
