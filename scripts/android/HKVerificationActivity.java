package com.adipredictor.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class HKVerificationActivity extends Activity {
    private static final String ALLOWED_HOST = "www.hongkongpools.com";
    private WebView webView;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(2, 6, 23));

        TextView note = new TextView(this);
        note.setText("Verifikasi Sumber HK — selesaikan pemeriksaan keamanan secara manual, lalu tekan Gunakan tabel hasil.");
        note.setTextColor(Color.WHITE);
        note.setPadding(24, 18, 24, 18);
        root.addView(note, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.addJavascriptInterface(new ResultBridge(), "AdiResultBridge");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return !"https".equalsIgnoreCase(uri.getScheme()) || !ALLOWED_HOST.equalsIgnoreCase(uri.getHost());
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
            }
        });
        root.addView(webView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        LinearLayout buttons = new LinearLayout(this);
        Button cancel = new Button(this);
        cancel.setText("Batal");
        cancel.setOnClickListener(v -> finish());
        Button use = new Button(this);
        use.setText("Gunakan tabel hasil");
        use.setOnClickListener(v -> webView.evaluateJavascript(
            "(function(){var ts=Array.from(document.querySelectorAll('table')).filter(function(t){var x=(t.innerText||'').toLowerCase();return x.includes('1st')&&x.includes('starter')&&x.includes('consolation');});var body=(document.body&&document.body.innerText)||'';var d=(body.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\\s*,?\\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2}\\s*,?\\s+\\d{4}/i)||body.match(/\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}/)||[''])[0];var h='<div>'+d+'</div>'+ts.map(function(t){return t.outerHTML;}).join('');AdiResultBridge.accept(h,location.href);})()", null));
        buttons.addView(cancel, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        buttons.addView(use, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        root.addView(buttons);
        setContentView(root);
        webView.loadUrl("https://www.hongkongpools.com/live");
    }

    private final class ResultBridge {
        @JavascriptInterface public void accept(String html, String url) {
            runOnUiThread(() -> {
                Uri uri = Uri.parse(url == null ? "" : url);
                if (!"https".equalsIgnoreCase(uri.getScheme()) || !ALLOWED_HOST.equalsIgnoreCase(uri.getHost())) return;
                Intent result = new Intent();
                result.putExtra("html", html);
                result.putExtra("url", url);
                setResult(Activity.RESULT_OK, result);
                finish();
            });
        }
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (webView != null) { webView.removeJavascriptInterface("AdiResultBridge"); webView.destroy(); }
        CookieManager.getInstance().removeAllCookies(null);
        CookieManager.getInstance().flush();
        super.onDestroy();
    }
}
