package com.neuradventure.webview

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.text.format.Formatter
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.*
import java.net.InetSocketAddress
import java.net.Socket
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val defaultPort = 3001
    private val portRange = 3001..3030
    private val prefsName = "neuradventure_prefs"
    private val keyServerIp = "server_ip"
    private val keyServerPort = "server_port"
    private val keyLastUrl = "last_url"
    private val keyLastFullScanAtMs = "last_full_scan_at_ms"
    private val fullScanCooldownMs = 10 * 60 * 1000L

    private lateinit var webContainer: FrameLayout
    private var discoverJob: Job? = null
    private var responsivenessJob: Job? = null
    private var isRecreatingWebView = false

    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = fileChooserCallback ?: return@registerForActivityResult
            fileChooserCallback = null
            val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            callback.onReceiveValue(uris)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureSystemBars()
        setContentView(R.layout.activity_main)

        webContainer = findViewById(R.id.web_container)
        webView = findViewById(R.id.web_view)
        setupWebView()

        // Restore WebView state if available
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
            // Restore can fail silently; fall back if no URL is present.
            if (webView.url.isNullOrBlank()) {
                discoverAndLoad(allowFullScan = true, showToasts = true, throttleFullScan = false)
            } else {
                saveLastUrl(webView.url)
            }
        } else {
            // Fresh launch - discover and load
            discoverAndLoad(allowFullScan = true, showToasts = true, throttleFullScan = false)
        }

        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) webView.goBack() else finish()
        }
    }

    override fun onPause() {
        super.onPause()
        saveLastUrl(webView.url)
        webView.onPause()
        webView.pauseTimers()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.resumeTimers()
        webView.clearFocus()
        webView.requestFocus()
        webView.requestFocusFromTouch()
        try {
            webView.evaluateJavascript("window.dispatchEvent(new Event('na-resume'))", null)
        } catch (_: Throwable) {
            // ignore
        }
        scheduleResponsivenessWatchdog()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        discoverJob?.cancel()
        discoverJob = null
        responsivenessJob?.cancel()
        responsivenessJob = null
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        try {
            webView.stopLoading()
            webView.destroy()
        } catch (_: Throwable) {
            // ignore
        }
        super.onDestroy()
    }

    private fun configureSystemBars() {
        window.statusBarColor = Color.BLACK
        window.navigationBarColor = Color.TRANSPARENT

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.navigationBarDividerColor = Color.TRANSPARENT
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isNavigationBarContrastEnforced = false
            window.isStatusBarContrastEnforced = false
        }

        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.isAppearanceLightStatusBars = false
        controller.isAppearanceLightNavigationBars = false
    }

    private fun setupWebView() {
        webView.setBackgroundColor(Color.BLACK)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            allowFileAccess = true
            allowContentAccess = true
        }

        webView.webChromeClient =
            object : WebChromeClient() {
                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?,
                ): Boolean {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = filePathCallback

                    val intent =
                        try {
                            fileChooserParams?.createIntent()
                                ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                                    addCategory(Intent.CATEGORY_OPENABLE)
                                    type = "*/*"
                                }
                        } catch (e: Exception) {
                            fileChooserCallback = null
                            return false
                        }

                    return try {
                        fileChooserLauncher.launch(intent)
                        true
                    } catch (e: ActivityNotFoundException) {
                        fileChooserCallback?.onReceiveValue(null)
                        fileChooserCallback = null
                        Toast.makeText(this@MainActivity, "No file picker found.", Toast.LENGTH_SHORT).show()
                        false
                    }
                }
            }
        webView.webViewClient =
            object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url.toString()
                    if (url.startsWith("http")) return false
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    return true
                }

                override fun onPageFinished(view: WebView, url: String) {
                    saveLastUrl(url)
                }

                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    recreateWebViewAndReload("render_process_gone")
                    return true
                }
            }
    }

    private fun getSavedServerIp(): String? {
        val prefs = getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        return prefs.getString(keyServerIp, null)
    }

    private fun getSavedServerPort(): Int {
        val prefs = getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        return prefs.getInt(keyServerPort, defaultPort)
    }

    private fun getSavedLastUrl(): String? {
        val prefs = getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        return prefs.getString(keyLastUrl, null)
    }

    private fun getSavedLastFullScanAtMs(): Long {
        val prefs = getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        return prefs.getLong(keyLastFullScanAtMs, 0L)
    }

    private fun saveLastFullScanAtMs(nowMs: Long) {
        val prefs = getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        prefs.edit().putLong(keyLastFullScanAtMs, nowMs).apply()
    }

    private fun saveServerAddress(ip: String, port: Int) {
        val prefs = getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(keyServerIp, ip)
            .putInt(keyServerPort, port)
            .apply()
    }

    private fun saveLastUrl(url: String?) {
        val trimmed = url?.trim().orEmpty()
        if (trimmed.isBlank()) return
        val prefs = getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        prefs.edit().putString(keyLastUrl, trimmed).apply()
    }

    private fun loadUrlAndPersist(url: String) {
        saveLastUrl(url)
        webView.loadUrl(url)
    }

    private suspend fun tryConnect(ip: String, port: Int, timeoutMs: Int = 200): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                Socket().use { socket ->
                    socket.connect(InetSocketAddress(ip, port), timeoutMs)
                    true
                }
            } catch (e: Exception) {
                false
            }
        }
    }

    private fun shouldAllowFullScanNow(nowMs: Long = System.currentTimeMillis()): Boolean {
        val last = getSavedLastFullScanAtMs()
        return (nowMs - last) >= fullScanCooldownMs
    }

    private fun discoverAndLoad(allowFullScan: Boolean, showToasts: Boolean, throttleFullScan: Boolean) {
        discoverJob?.cancel()
        discoverJob = null

        val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val ipAddress = Formatter.formatIpAddress(wifiManager.connectionInfo.ipAddress)
        
        if (ipAddress == "0.0.0.0") {
            if (showToasts) Toast.makeText(this, "Please connect to Wi-Fi", Toast.LENGTH_LONG).show()
            return
        }

        // Use lifecycleScope for automatic cancellation
        discoverJob = lifecycleScope.launch {
            // Try saved IP and port first with quick timeout
            val savedIp = getSavedServerIp()
            val savedPort = getSavedServerPort()
            if (savedIp != null) {
                if (tryConnect(savedIp, savedPort)) {
                    loadUrlAndPersist("http://$savedIp:$savedPort")
                    return@launch
                }
            }

            // Saved address failed - try default port 3001 on localhost first
            if (tryConnect("127.0.0.1", defaultPort)) {
                saveServerAddress("127.0.0.1", defaultPort)
                loadUrlAndPersist("http://127.0.0.1:$defaultPort")
                return@launch
            }

            // Try all ports on localhost
            for (port in portRange) {
                if (tryConnect("127.0.0.1", port)) {
                    saveServerAddress("127.0.0.1", port)
                    loadUrlAndPersist("http://127.0.0.1:$port")
                    return@launch
                }
            }

            val nowMs = System.currentTimeMillis()
            val allowScan = allowFullScan && (!throttleFullScan || shouldAllowFullScanNow(nowMs))
            if (!allowScan) {
                if (showToasts) {
                    Toast.makeText(this@MainActivity, "Unable to reconnect (scan throttled)", Toast.LENGTH_SHORT).show()
                }
                return@launch
            }

            saveLastFullScanAtMs(nowMs)

            // Localhost failed - scan subnet with timeout
            val subnet = ipAddress.substringBeforeLast(".") + "."
            val foundAddress = withTimeoutOrNull(10000) {
                withContext(Dispatchers.IO) {
                    // Try default port 3001 first across subnet
                    suspend fun scanPort(port: Int): Pair<String, Int>? {
                        val batchSize = 32
                        val ips = (1..254).toList()
                        for (batch in ips.chunked(batchSize)) {
                            val jobs = batch.map { i ->
                                async {
                                    val testIp = subnet + i
                                    if (tryConnect(testIp, port, 100)) Pair(testIp, port) else null
                                }
                            }
                            val result = jobs.awaitAll().filterNotNull().firstOrNull()
                            if (result != null) return result
                        }
                        return null
                    }

                    val defaultResult = scanPort(defaultPort)
                    if (defaultResult != null) return@withContext defaultResult

                    // Try other ports across subnet
                    for (port in portRange) {
                        if (port == defaultPort) continue // Already tried
                        val result = scanPort(port)
                        if (result != null) return@withContext result
                    }
                    null
                }
            }

            withContext(Dispatchers.Main) {
                if (foundAddress != null) {
                    val (ip, port) = foundAddress
                    saveServerAddress(ip, port)
                    loadUrlAndPersist("http://$ip:$port")
                } else {
                    if (showToasts) {
                        Toast.makeText(this@MainActivity, "No app found on ports $portRange", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

    private fun scheduleResponsivenessWatchdog() {
        responsivenessJob?.cancel()
        responsivenessJob = lifecycleScope.launch {
            delay(50)
            val ok = withTimeoutOrNull(750) {
                suspendCancellableCoroutine<Boolean> { cont ->
                    try {
                        webView.evaluateJavascript("1") {
                            if (cont.isActive) cont.resume(true)
                        }
                    } catch (_: Throwable) {
                        if (cont.isActive) cont.resume(false)
                    }
                }
            }
            if (ok == true) return@launch
            recreateWebViewAndReload("unresponsive_watchdog")
        }
    }

    private fun recreateWebViewAndReload(reason: String) {
        if (isRecreatingWebView) return
        isRecreatingWebView = true

        try {
            discoverJob?.cancel()
            discoverJob = null
            responsivenessJob?.cancel()
            responsivenessJob = null

            val urlToLoad = (webView.url?.takeIf { !it.isNullOrBlank() } ?: getSavedLastUrl())
                ?.takeIf { it.startsWith("http") }

            try {
                webContainer.removeView(webView)
                webView.stopLoading()
                webView.destroy()
            } catch (_: Throwable) {
                // ignore
            }

            val newWebView = WebView(this).apply {
                id = R.id.web_view
                layoutParams =
                    FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT,
                    )
                setBackgroundColor(Color.BLACK)
            }

            webView = newWebView
            webContainer.addView(webView)
            setupWebView()

            if (!urlToLoad.isNullOrBlank()) {
                loadUrlAndPersist(urlToLoad)
            } else {
                discoverAndLoad(allowFullScan = true, showToasts = false, throttleFullScan = true)
            }
        } finally {
            isRecreatingWebView = false
        }
    }
}
