package com.racoondevs.runlyerp

import android.app.Activity
import android.net.Uri
import android.view.Gravity
import android.view.View
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.PopupMenu
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

// Bundled native navigation also works with older instance web deployments.
object HostControls {
  fun attach(activity: Activity, webView: WebView) {
    webView.post {
      val root = activity.findViewById<FrameLayout>(android.R.id.content)
      val density = activity.resources.displayMetrics.density
      fun dp(value: Int) = (value * density).toInt()
      val button = ImageButton(activity).apply {
        setImageResource(android.R.drawable.ic_menu_preferences)
        contentDescription = "Opciones de Runly: instancias y permisos"
        setBackgroundResource(android.R.drawable.btn_default)
        elevation = dp(6).toFloat()
        visibility = View.GONE
      }
      val layout = FrameLayout.LayoutParams(dp(48), dp(48), Gravity.BOTTOM or Gravity.START).apply {
        leftMargin = dp(12); bottomMargin = dp(12)
      }
      root.addView(button, layout)
      ViewCompat.setOnApplyWindowInsetsListener(button) { view, insets ->
        val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
        (view.layoutParams as FrameLayout.LayoutParams).bottomMargin = bars.bottom + dp(12)
        view.requestLayout()
        insets
      }
      ViewCompat.requestApplyInsets(button)
      button.setOnClickListener {
        PopupMenu(activity, button).apply {
          menu.add("Cambiar instancia").setOnMenuItemClickListener { open(webView, "manage"); true }
          menu.add("Permisos del dispositivo").setOnMenuItemClickListener { open(webView, "device"); true }
          show()
        }
      }
      val update = object : Runnable {
        override fun run() {
          if (activity.isDestroyed) return
          val url = Uri.parse(webView.url ?: "")
          button.visibility = if (url.scheme == "https" && url.path?.startsWith("/app/") == true && url.host != "tauri.localhost") View.VISIBLE else View.GONE
          button.postDelayed(this, 750)
        }
      }
      button.post(update)
    }
  }

  private fun open(webView: WebView, section: String) {
    // Rust validates the active origin; the native control cannot trust a URL itself.
    webView.evaluateJavascript("window.__TAURI_INTERNALS__.invoke('host_manage',{section:'$section'}).catch(()=>alert('No se pudo abrir el gestor. Intenta de nuevo.'))", null)
  }
}
