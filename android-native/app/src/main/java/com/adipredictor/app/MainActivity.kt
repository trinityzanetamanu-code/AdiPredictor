package com.adipredictor.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.mutableStateOf

class MainActivity : ComponentActivity() {
    private val model: AppViewModel by viewModels()
    private val route = mutableStateOf<Pair<String, String>?>(null)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        acceptIntent(intent)
        setContent { NativeApp(model, route.value) { route.value = null } }
    }
    public override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); acceptIntent(intent) }
    private fun acceptIntent(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme == "adipredictor" && uri.host == "open") {
            val market = uri.getQueryParameter("market")?.takeIf { it in com.adipredictor.data.markets } ?: "HK"
            val page = uri.getQueryParameter("target")?.takeIf { it in pages } ?: "Analisis"
            route.value = market to page
        }
    }
    override fun onStart() { super.onStart(); model.foreground(true) }
    override fun onStop() { model.foreground(false); super.onStop() }
}
