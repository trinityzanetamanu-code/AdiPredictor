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
        // Saved Compose state already includes a consumed deep link. Replaying the
        // original intent on recreation would discard the user's later navigation.
        if (savedInstanceState == null) acceptIntent(intent)
        setContent { NativeApp(model, route.value) { route.value = null } }
    }
    // Navigation owns and saves the consumed route. Keep the launch intent
    // stable rather than retaining an already-consumed notification intent.
    public override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); acceptIntent(intent) }
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
