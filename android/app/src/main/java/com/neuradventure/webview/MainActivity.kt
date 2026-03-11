package com.neuradventure.webview

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Bundle
import android.text.format.Formatter
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.addCallback
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.*
import java.net.InetSocketAddress
import java.net.Socket

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val serverPort = 3001

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.web_view)
        setupWebView()

        // Auto-discover every time the app opens
        discoverAndLoad()

        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) webView.goBack() else finish()
        }
    }

    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
        }

        webView.webChromeClient = WebChromeClient()
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