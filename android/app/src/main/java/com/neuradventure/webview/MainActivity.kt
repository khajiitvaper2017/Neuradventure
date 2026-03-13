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
import kotlinx.coroutines.*
import java.net.InetSocketAddress
import java.net.Socket

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val serverPort = 3001

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

        // Auto-discover every time the app opens
        discoverAndLoad()

        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) webView.goBack() else finish()
        }
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

    private fun discoverAndLoad() {
        val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val ipAddress = Formatter.formatIpAddress(wifiManager.connectionInfo.ipAddress)
        
        if (ipAddress == "0.0.0.0") {
            Toast.makeText(this, "Please connect to Wi-Fi", Toast.LENGTH_LONG).show()
            return
        }

        val subnet = ipAddress.substringBeforeLast(".") + "."

        // Using a lifecycle-aware scope is better, but GlobalScope/MainScope works for this one-shot task
        CoroutineScope(Dispatchers.IO).launch {
            val jobs = (1..254).map { i ->
                async {
                    val testIp = subnet + i
                    try {
                        Socket().use { socket ->
                            // 100ms is fast; increase to 200ms if your network is laggy
                            socket.connect(InetSocketAddress(testIp, serverPort), 100)
                            testIp
                        }
                    } catch (e: Exception) {
                        null
                    }
                }
            }

            val foundIp = jobs.awaitAll().filterNotNull().firstOrNull()

            withContext(Dispatchers.Main) {
                if (foundIp != null) {
                    webView.loadUrl("http://$foundIp:$serverPort")
                } else {
                    Toast.makeText(this@MainActivity, "No app found on port $serverPort", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}
