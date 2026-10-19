package com.racoondevs.runlyerp

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

// Normal navigation lives in Runly's login and user menu, without an overlay.
// Launcher shortcuts also work with older instance web deployments.
object HostControls {
  private var pendingSection: String? = null

  fun handleIntent(intent: Intent) {
    pendingSection = when (intent.action) {
      "com.racoondevs.runlyerp.OPEN_INSTANCES" -> "manage"
      "com.racoondevs.runlyerp.OPEN_DEVICE" -> "device"
      else -> return
    }
  }

  fun attach(activity: Activity, webView: WebView) {
    webView.post {
      val root = activity.findViewById<FrameLayout>(android.R.id.content)
      val barsController = WindowInsetsControllerCompat(activity.window, root)
      val defaultLightStatusBar = barsController.isAppearanceLightStatusBars
      var previousLocal: Boolean? = null
      var opening = false
      val update = object : Runnable {
        override fun run() {
          if (activity.isDestroyed) return
          val url = Uri.parse(webView.url ?: "")
          val local = url.host == "tauri.localhost" || url.scheme == "tauri" || url.scheme == null
          if (previousLocal != local) {
            barsController.isAppearanceLightStatusBars = if (local) false else defaultLightStatusBar
            previousLocal = local
          }
          // Edge-to-edge: publish the system bar / cutout insets as CSS px so
          // overlays can clear the status and navigation bars (see runtime.css).
          ViewCompat.getRootWindowInsets(root)?.getInsets(
            WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
          )?.let { bars ->
            val d = activity.resources.displayMetrics.density
            webView.evaluateJavascript(
              "(()=>{const s=document.documentElement.style;" +
                "s.setProperty('--native-inset-top','${bars.top / d}px');" +
                "s.setProperty('--native-inset-bottom','${bars.bottom / d}px');" +
                "s.setProperty('--native-inset-left','${bars.left / d}px');" +
                "s.setProperty('--native-inset-right','${bars.right / d}px');})()",
              null
            )
          }
          val section = pendingSection
          if (section != null && !opening && (local || (url.scheme == "https" && url.path?.startsWith("/app/") == true))) {
            opening = true
            // Only the two hardcoded launcher actions reach here. Rust still
            // validates the current origin and cancels any in-flight connection.
            val command = if (local) """
              invoke('host_cancel_origin').then(() => {
                location.replace(location.href.split('#')[0] + '#$section');
                location.reload();
              })
            """ else "invoke('host_manage', {section:'$section'})"
            webView.evaluateJavascript("""
              (() => {
                const invoke = window.__TAURI_INTERNALS__?.invoke;
                if (!invoke) return false;
                $command.catch(() => alert('No se pudo abrir el gestor. Intenta de nuevo.'));
                return true;
              })()
            """.trimIndent()) { result ->
              opening = false
              if (result == "true" && pendingSection == section) pendingSection = null
            }
          }
          webView.postDelayed(this, 500)
        }
      }
      webView.post(update)
    }
  }
}
