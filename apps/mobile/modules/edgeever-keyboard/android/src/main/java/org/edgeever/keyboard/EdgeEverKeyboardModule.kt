package org.edgeever.keyboard

import android.content.Context
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.inputmethod.InputMethodManager
import android.webkit.WebView
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class EdgeEverKeyboardModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EdgeEverKeyboard")

    Function("show") {
      val activity = appContext.currentActivity ?: return@Function false
      activity.runOnUiThread {
        val focusedView = findLargestVisibleWebView(activity.window.decorView)
          ?: activity.currentFocus
          ?: return@runOnUiThread
        val inputMethodManager = activity.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        focusedView.requestFocus()
        focusedView.post {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            focusedView.windowInsetsController?.show(WindowInsets.Type.ime())
          } else {
            inputMethodManager.showSoftInput(focusedView, InputMethodManager.SHOW_IMPLICIT)
          }
        }
      }
      true
    }
  }

  private fun findLargestVisibleWebView(root: View): WebView? {
    val webViews = mutableListOf<WebView>()

    fun collect(view: View) {
      if (view is WebView && view.isShown && view.width > 0 && view.height > 0) {
        webViews.add(view)
      }
      if (view is ViewGroup) {
        for (index in 0 until view.childCount) {
          collect(view.getChildAt(index))
        }
      }
    }

    collect(root)
    return webViews.maxByOrNull { it.width.toLong() * it.height.toLong() }
  }
}
