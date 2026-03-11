package com.neuradventure.webview

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.addCallback
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val prefsName = "webview_config"
    private val prefsUrlKey = "config_url"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.web_view)
        val settingsButton = findViewById<com.google.android.material.floatingactionbutton.FloatingActionButton>(
            R.id.settings_button
        )

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true

        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                return handleExternalUrl(request.url.toString())
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                return handleExternalUrl(url)
            }
        }

        val startUrl = loadConfiguredUrl()
        webView.loadUrl(startUrl)

        settingsButton.setOnClickListener {
            showUrlDialog()
        }

        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) {
                webView.goBack()
            } else {
                finish()
            }
        }
    }

    private fun loadConfiguredUrl(): String {
        val prefs = getSharedPreferences(prefsName, MODE_PRIVATE)
        val saved = prefs.getString(prefsUrlKey, null)
        if (!saved.isNullOrBlank()) {
            return saved
        }

        val assetUrl = readUrlFromAssets()
        if (!assetUrl.isNullOrBlank()) {
            return assetUrl
        }
        return getString(R.string.default_url)
    }

    private fun readUrlFromAssets(): String? {
        return try {
            assets.open("app_config.json").bufferedReader().use { reader ->
                val json = JSONObject(reader.readText())
                json.optString("url", null)
            }
        } catch (e: Exception) {
            null
        }
    }

    private fun showUrlDialog() {
        val view = layoutInflater.inflate(R.layout.dialog_url, null)
        val input = view.findViewById<TextInputEditText>(R.id.url_input)
        val current = loadConfiguredUrl()
        input.setText(current)

        MaterialAlertDialogBuilder(this)
            .setTitle(getString(R.string.settings))
            .setView(view)
            .setPositiveButton(getString(R.string.save)) { _, _ ->
                val raw = input.text?.toString()?.trim().orEmpty()
                val normalized = normalizeUrl(raw)
                if (normalized == null) {
                    Toast.makeText(this, R.string.invalid_url, Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                val prefs = getSharedPreferences(prefsName, MODE_PRIVATE)
                prefs.edit().putString(prefsUrlKey, normalized).apply()
                webView.loadUrl(normalized)
            }
            .setNegativeButton(getString(R.string.cancel), null)
            .show()
    }

    private fun normalizeUrl(input: String): String? {
        if (input.isBlank()) return null
        val withScheme = if (input.startsWith("http://") || input.startsWith("https://")) {
            input
        } else {
            "http://$input"
        }
        val uri = Uri.parse(withScheme)
        val scheme = uri.scheme?.lowercase()
        val host = uri.host
        if ((scheme == "http" || scheme == "https") && !host.isNullOrBlank()) {
            return withScheme
        }
        return null
    }

    private fun handleExternalUrl(url: String): Boolean {
        val uri = Uri.parse(url)
        val scheme = uri.scheme?.lowercase()
        if (scheme == "http" || scheme == "https") {
            return false
        }
        val intent = Intent(Intent.ACTION_VIEW, uri)
        startActivity(intent)
        return true
    }
}
