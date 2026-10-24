package com.igorwojda.showcase.app.presentation.game

import java.net.URI

internal const val GAME_ASSET_HOST = "appassets.androidplatform.net"
internal const val GAME_URL = "https://$GAME_ASSET_HOST/assets/cotienlo/index.html"
internal const val GAME_SAVE_KEY = "cotienlo_save_v1"

internal data class BundledGameAsset(val path: String, val mimeType: String)

/** Maps only this game's HTTPS origin and rejects decoded traversal before opening AssetManager. */
internal fun resolveGameAsset(url: String): BundledGameAsset? {
    val uri = runCatching { URI(url) }.getOrNull() ?: return null
    if (uri.scheme != "https" || uri.host != GAME_ASSET_HOST || uri.userInfo != null || uri.port != -1) return null
    val path = uri.path ?: return null
    if (!path.startsWith("/assets/cotienlo/") || path.endsWith('/')) return null
    if (path.any { it == '\\' || it.code < 32 } || path.split('/').any { it == "." || it == ".." }) return null
    val mimeType = when (path.substringAfterLast('.').lowercase()) {
        "html" -> "text/html"
        "js", "mjs" -> "application/javascript"
        "css" -> "text/css"
        "json" -> "application/json"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "svg" -> "image/svg+xml"
        "webp" -> "image/webp"
        "woff" -> "font/woff"
        "woff2" -> "font/woff2"
        "wasm" -> "application/wasm"
        else -> "application/octet-stream"
    }
    return BundledGameAsset(path.removePrefix("/assets/"), mimeType)
}

/** The payload is JSON-quoted by the native JSON encoder before it reaches this HTML boundary. */
internal fun injectLegacyGameSave(html: String, quotedLegacySave: String?): String {
    if (quotedLegacySave == null) return html
    val payload = quotedLegacySave.replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    val migration = """
        <script>try {
          if (localStorage.getItem('$GAME_SAVE_KEY') === null) localStorage.setItem('$GAME_SAVE_KEY', $payload);
        } catch (error) {}</script>
    """.trimIndent()
    val headStart = html.indexOf("<head", ignoreCase = true)
    require(headStart >= 0) { "The game HTML must include a head element." }
    val headEnd = html.indexOf('>', headStart)
    require(headEnd >= 0) { "The game HTML must include a head element." }
    return html.substring(0, headEnd + 1) + migration + html.substring(headEnd + 1)
}
