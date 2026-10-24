package com.racoondevs.runlyerp

import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class HostControlsInstrumentedTest {
  private val instrumentation = InstrumentationRegistry.getInstrumentation()

  private fun evaluate(view: WebView, script: String): String {
    val done = CountDownLatch(1)
    var result = ""
    instrumentation.runOnMainSync {
      view.evaluateJavascript(script) { value -> result = value; done.countDown() }
    }
    assertTrue("El WebView debe responder", done.await(5, TimeUnit.SECONDS))
    return result
  }

  private fun eventually(message: String, predicate: () -> Boolean) {
    val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(6)
    while (System.nanoTime() < deadline) {
      if (predicate()) return
      Thread.sleep(100)
    }
    assertTrue(message, predicate())
  }

  @Test
  fun publishesInsetsAndKeepsBothSystemBarsInSyncWithTheme() {
    ActivityScenario.launch(MainActivity::class.java).use { scenario ->
      lateinit var view: WebView
      lateinit var controller: WindowInsetsControllerCompat
      var expectedTop = 0f
      var expectedBottom = 0f
      scenario.onActivity { activity ->
        // Isolate HostControls from remote services and the app's React state.
        view = WebView(activity)
        view.settings.javaScriptEnabled = true
        activity.setContentView(view)
        controller = WindowInsetsControllerCompat(activity.window, view)
        view.loadDataWithBaseURL("https://diagnostico.example/app/", """
          <!doctype html><html><head>
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <style>:root{--sat:max(env(safe-area-inset-top,0px),var(--native-inset-top,0px));
          --sab:max(env(safe-area-inset-bottom,0px),var(--native-inset-bottom,0px))}
          body{margin:0;background:white}#probe{padding-top:var(--sat);padding-bottom:var(--sab)}</style>
          </head><body><div id="probe">Diagnóstico de barras del sistema</div></body></html>
        """.trimIndent(), "text/html", "UTF-8", null)
        HostControls.attach(activity, view)
      }
      eventually("Los insets nativos deben llegar al documento") {
        evaluate(view, "parseFloat(document.documentElement.style.getPropertyValue('--native-inset-top')) >= 0") == "true"
      }
      scenario.onActivity { activity ->
        val bars = ViewCompat.getRootWindowInsets(view)!!.getInsetsIgnoringVisibility(
          WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or
            WindowInsetsCompat.Type.tappableElement()
        )
        val density = activity.resources.displayMetrics.density
        expectedTop = bars.top / density
        expectedBottom = bars.bottom / density
      }
      val resolved = JSONObject(evaluate(view, """
        (()=>{const s=getComputedStyle(document.getElementById('probe'));
        return {top:parseFloat(s.paddingTop),bottom:parseFloat(s.paddingBottom)}})()
      """.trimIndent()))
      assertEquals(expectedTop.toDouble(), resolved.getDouble("top"), 0.1)
      assertEquals(expectedBottom.toDouble(), resolved.getDouble("bottom"), 0.1)

      fun barsMatch(light: Boolean): Boolean {
        var match = false
        instrumentation.runOnMainSync {
          match = controller.isAppearanceLightStatusBars == light &&
            controller.isAppearanceLightNavigationBars == light
        }
        return match
      }
      eventually("Tema claro: ambas barras deben usar íconos oscuros") { barsMatch(true) }
      evaluate(view, "document.documentElement.classList.add('dark')")
      eventually("Tema oscuro: ambas barras deben usar íconos claros") { barsMatch(false) }
      evaluate(view, "document.documentElement.classList.remove('dark')")
      eventually("Volver a claro debe actualizar ambas barras") { barsMatch(true) }

      // Android/OEM code can update one bar independently of the other.
      instrumentation.runOnMainSync { controller.isAppearanceLightNavigationBars = false }
      eventually("La barra inferior debe recuperarse aunque la superior ya coincida") { barsMatch(true) }
    }
  }
}
