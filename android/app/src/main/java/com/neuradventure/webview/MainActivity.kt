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
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.ValueCallback
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.*
import java.net.InetSocketAddress
import java.net.Socket

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val defaultPort = 3001
    private val portRange = 3001..3030
    private val prefsName = "neuradventure_prefs"
    private val keyServerIp = "server_ip"
    private val keyServerPort = "server_port"

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

        webView = findViewById(R.id.web_view)
        setupWebView()

        // Restore WebView state if available
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            // Fresh launch - discover and load
            discoverAndLoad()
        }

        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) webView.goBack() else finish()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
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
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                if (url.startsWith("http")) return false
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
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

    private fun saveServerAddress(ip: String, port: Int) {
        val prefs = getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(keyServerIp, ip)
            .putInt(keyServerPort, port)
            .apply()
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

    private fun discoverAndLoad() {
        val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val ipAddress = Formatter.formatIpAddress(wifiManager.connectionInfo.ipAddress)
        
        if (ipAddress == "0.0.0.0") {
            Toast.makeText(this, "Please connect to Wi-Fi", Toast.LENGTH_LONG).show()
            return
        }

        // Use lifecycleScope for automatic cancellation
        lifecycleScope.launch {
            // Try saved IP and port first with quick timeout
            val savedIp = getSavedServerIp()
            val savedPort = getSavedServerPort()
            if (savedIp != null) {
                if (tryConnect(savedIp, savedPort)) {
                    webView.loadUrl("http://$savedIp:$savedPort")
                    return@launch
                }
            }

            // Saved address failed - try default port 3001 on localhost first
            if (tryConnect("127.0.0.1", defaultPort)) {
                saveServerAddress("127.0.0.1", defaultPort)
                webView.loadUrl("http://127.0.0.1:$defaultPort")
                return@launch
            }

            // Try all ports on localhost
            for (port in portRange) {
                if (tryConnect("127.0.0.1", port)) {
                    saveServerAddress("127.0.0.1", port)
                    webView.loadUrl("http://127.0.0.1:$port")
                    return@launch
                }
            }

            // Localhost failed - scan subnet with timeout
            val subnet = ipAddress.substringBeforeLast(".") + "."
            val foundAddress = withTimeoutOrNull(10000) {
                withContext(Dispatchers.IO) {
                    // Try default port 3001 first across subnet
                    val defaultPortJobs = (1..254).map { i ->
                        async {
                            val testIp = subnet + i
                            if (tryConnect(testIp, defaultPort, 100)) {
                                Pair(testIp, defaultPort)
                            } else null
                        }
                    }
                    val defaultResult = defaultPortJobs.awaitAll().filterNotNull().firstOrNull()
                    if (defaultResult != null) return@withContext defaultResult

                    // Try other ports across subnet
                    for (port in portRange) {
                        if (port == defaultPort) continue // Already tried
                        val portJobs = (1..254).map { i ->
                            async {
                                val testIp = subnet + i
                                if (tryConnect(testIp, port, 100)) {
                                    Pair(testIp, port)
                                } else null
                            }
                        }
                        val result = portJobs.awaitAll().filterNotNull().firstOrNull()
                        if (result != null) return@withContext result
                    }
                    null
                }
            }

            withContext(Dispatchers.Main) {
                if (foundAddress != null) {
                    val (ip, port) = foundAddress
                    saveServerAddress(ip, port)
                    webView.loadUrl("http://$ip:$port")
                } else {
                    Toast.makeText(this@MainActivity, "No app found on ports $portRange", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}