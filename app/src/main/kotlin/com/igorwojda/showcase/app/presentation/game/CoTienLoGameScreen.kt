package com.igorwojda.showcase.app.presentation.game

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.view.ViewGroup
import android.webkit.WebSettings
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import org.json.JSONObject
import org.json.JSONTokener
import java.io.ByteArrayInputStream
import java.io.IOException

private const val LEGACY_GAME_URL = "file:///android_asset/cotienlo/index.html"
private const val MAX_LEGACY_SAVE_BYTES = 65536

@Composable
fun CoTienLoGameScreen(
    modifier: Modifier = Modifier,
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val webViewReference = remember { mutableStateOf<WebView?>(null) }

    DisposableEffect(lifecycleOwner) {
        val observer =
            LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_RESUME -> webViewReference.value?.resumeGame()
                    Lifecycle.Event.ON_PAUSE, Lifecycle.Event.ON_STOP -> webViewReference.value?.pauseGame()
                    else -> Unit
                }
            }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            webViewReference.value?.pauseGame()
        }
    }

    AndroidView(
        modifier = modifier
            .fillMaxSize()
            .background(androidx.compose.ui.graphics.Color(0xFF0A0E14)),
        factory = { context ->
            createGameWebView(context, lifecycleOwner.lifecycle).also { webViewReference.value = it }
        },
        onRelease = { view ->
            if (webViewReference.value === view) webViewReference.value = null
            (view.webViewClient as? GameWebViewClient)?.release()
            view.evaluateJavascript("window.dispatchEvent(new Event('cotienlo:destroy'));") {
                view.stopLoading()
                view.onPause()
                view.removeAllViews()
                view.destroy()
            }
        },
    )
}

@SuppressLint("SetJavaScriptEnabled")
private fun createGameWebView(context: Context, lifecycle: Lifecycle): WebView =
    WebView(context).apply {
        layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
        setBackgroundColor(Color.parseColor("#0A0E14"))
        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = false
            loadWithOverviewMode = true
            useWideViewPort = true
            cacheMode = WebSettings.LOAD_DEFAULT
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
        }
        webViewClient = GameWebViewClient(context, lifecycle)
        if (!lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) onPause()
        loadUrl(LEGACY_GAME_URL)
    }

private class GameWebViewClient(private val context: Context, private val lifecycle: Lifecycle) : WebViewClient() {
    @Volatile private var released = false
    @Volatile private var legacySave: String? = null
    private var migrationStarted = false

    fun release() {
        released = true
    }

    override fun onPageFinished(view: WebView, url: String) {
        if (released) return
        if (url == LEGACY_GAME_URL && !migrationStarted) {
            migrationStarted = true
            val snapshot = """
                (function() { try {
                  window.dispatchEvent(new Event('cotienlo:destroy'));
                  var saved = localStorage.getItem('$GAME_SAVE_KEY');
                  return saved && saved.length <= $MAX_LEGACY_SAVE_BYTES ? saved : null;
                } catch (error) { return null; } })();
            """.trimIndent()
            view.evaluateJavascript(snapshot) { result ->
                if (!released) {
                    val saved = runCatching { JSONTokener(result).nextValue() as? String }.getOrNull()
                    legacySave = saved?.takeIf { it.toByteArray(Charsets.UTF_8).size <= MAX_LEGACY_SAVE_BYTES }
                    view.settings.allowFileAccess = false
                    view.loadUrl(GAME_URL)
                }
            }
            return
        }
        if (url == GAME_URL) {
            if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) view.resumeGame() else view.pauseGame()
        }
    }

    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
        if (request.url.scheme != "https" || request.url.host != GAME_ASSET_HOST) return null
        val asset = resolveGameAsset(request.url.toString())
        if (released || request.method != "GET" || asset == null) return missingAssetResponse()
        return try {
            val stream = context.assets.open(asset.path)
            val body = if (asset.path == "cotienlo/index.html") {
                val html = stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
                val migrated = injectLegacyGameSave(html, legacySave?.let(JSONObject::quote))
                ByteArrayInputStream(migrated.toByteArray(Charsets.UTF_8))
            } else {
                stream
            }
            WebResourceResponse(asset.mimeType, "UTF-8", body)
        } catch (_: IOException) {
            missingAssetResponse()
        }
    }
}

private fun missingAssetResponse(): WebResourceResponse =
    WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(byteArrayOf()))

private fun WebView.pauseGame() {
    evaluateJavascript("window.dispatchEvent(new Event('cotienlo:pause'));", null)
    onPause()
}

private fun WebView.resumeGame() {
    onResume()
    evaluateJavascript("window.dispatchEvent(new Event('cotienlo:resume'));", null)
}
