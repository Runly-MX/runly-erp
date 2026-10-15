package com.racoondevs.runlyerp

import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import java.io.IOException
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

// Raw bytes (ZPL) to a paired Bluetooth Classic printer over SPP/RFCOMM.
// Only already-paired devices: no discovery, so no BLUETOOTH_SCAN permission.
object BluetoothPrinter {
  private val SPP: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
  private const val CHUNK = 512
  private const val MAX_BYTES = 2 * 1024 * 1024
  private const val TIMEOUT_MS = 20_000L
  private val busy = AtomicBoolean(false)
  private val handler = Handler(Looper.getMainLooper())

  fun print(activity: Activity, adapter: BluetoothAdapter, invoke: Invoke) {
    val args = invoke.getArgs()
    val address = args.optString("address", "").uppercase()
    if (!BluetoothAdapter.checkBluetoothAddress(address)) { invoke.reject("INVALID_BLUETOOTH_ADDRESS"); return }
    val bytes = try { Base64.decode(args.optString("data", ""), Base64.DEFAULT) } catch (_: IllegalArgumentException) { null }
    if (bytes == null || bytes.isEmpty() || bytes.size > MAX_BYTES) { invoke.reject("INVALID_PRINT_DATA"); return }
    val paired: BluetoothDevice? = try {
      adapter.bondedDevices.firstOrNull { it.address.equals(address, ignoreCase = true) }
    } catch (_: SecurityException) { invoke.reject("BLUETOOTH_PERMISSION_REQUIRED"); return }
    if (paired == null) { invoke.reject("BLUETOOTH_NOT_PAIRED"); return }
    val device: BluetoothDevice = paired
    if (!busy.compareAndSet(false, true)) { invoke.reject("BLUETOOTH_BUSY"); return }

    Thread {
      val current = AtomicReference<BluetoothSocket?>(null)
      val timedOut = AtomicBoolean(false)
      // connect() has no timeout of its own; closing the socket unblocks it.
      val watchdog = Runnable { timedOut.set(true); closeQuietly(current.get()) }
      handler.postDelayed(watchdog, TIMEOUT_MS)
      val outcome: String? = try {
        if (Build.VERSION.SDK_INT < 31) try { adapter.cancelDiscovery() } catch (_: SecurityException) {}
        val socket = connect(device, current, timedOut)
        if (socket == null) { if (timedOut.get()) "BLUETOOTH_TIMEOUT" else "BLUETOOTH_CONNECT_FAILED" }
        else try {
          val out = socket.outputStream
          var offset = 0
          while (offset < bytes.size) {
            val size = minOf(CHUNK, bytes.size - offset)
            out.write(bytes, offset, size)
            out.flush()
            offset += size
          }
          // Some printers drop the tail of the job if the link closes at once.
          Thread.sleep(300)
          null
        } catch (_: IOException) { if (timedOut.get()) "BLUETOOTH_TIMEOUT" else "BLUETOOTH_WRITE_FAILED" }
      } catch (_: SecurityException) { "BLUETOOTH_PERMISSION_REQUIRED" }
      catch (_: InterruptedException) { "BLUETOOTH_WRITE_FAILED" }
      finally {
        handler.removeCallbacks(watchdog)
        closeQuietly(current.get())
        busy.set(false)
      }
      activity.runOnUiThread {
        if (outcome == null) invoke.resolve(JSObject().apply { put("bytes", bytes.size) })
        else invoke.reject(outcome)
      }
    }.apply { name = "runly-bt-print"; isDaemon = true }.start()
  }

  private fun closeQuietly(socket: BluetoothSocket?) { try { socket?.close() } catch (_: IOException) {} }

  // Secure RFCOMM first; many label printers only accept the insecure variant.
  private fun connect(device: BluetoothDevice, current: AtomicReference<BluetoothSocket?>, timedOut: AtomicBoolean): BluetoothSocket? {
    for (secure in listOf(true, false)) {
      if (timedOut.get()) return null
      val socket = try {
        if (secure) device.createRfcommSocketToServiceRecord(SPP) else device.createInsecureRfcommSocketToServiceRecord(SPP)
      } catch (_: IOException) { continue }
      current.set(socket)
      try { socket.connect(); return socket }
      catch (_: IOException) { closeQuietly(socket) }
    }
    return null
  }
}
