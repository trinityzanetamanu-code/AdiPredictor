package com.adipredictor.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import org.json.JSONObject;

/** Export only the inventoried envelope to a user-created document, never Intent extras. */
public final class LegacyExportDocument {
    private LegacyExportDocument() {}
    public static Intent createIntent() {
        return new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("application/json")
            .putExtra(Intent.EXTRA_TITLE, "adipredictor-legacy.json");
    }
    public static byte[] encode(String json) throws IOException {
        if (json == null || json.length() == 0) throw new IOException("EMPTY_EXPORT");
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > 16 * 1024 * 1024) throw new IOException("EXPORT_TOO_LARGE");
        try {
            JSONObject root = new JSONObject(json);
            if (root.optInt("schema_version") != 1 || !"AdiPredictor-Capacitor".equals(root.optString("origin")))
                throw new IOException("INVALID_EXPORT_ENVELOPE");
            JSONObject storage = root.getJSONObject("localStorage");
            Iterator<String> keys = storage.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                boolean known = key.equals("adipredictor:notification-preferences:v1")
                    || key.equals("adipredictor:delivered-notification-events:v1")
                    || key.equals("HK_LAST_VERIFIED_BOARD")
                    || key.matches("CANONICAL_CACHE_V1:(data/(hk|sdy|sgp)\\.json|predictions/(hk|sdy|sgp)/latest\\.json)");
                if (!known || !(storage.get(key) instanceof String)) throw new IOException("INVALID_EXPORT_KEY_OR_VALUE");
            }
        } catch (org.json.JSONException error) { throw new IOException("INVALID_EXPORT_JSON", error); }
        return bytes;
    }
    public static Uri selectedUri(int resultCode, Intent result) throws IOException {
        if (resultCode != Activity.RESULT_OK) return null;
        Uri uri = result == null ? null : result.getData();
        if (uri == null || !"content".equals(uri.getScheme())) throw new IOException("INVALID_DOCUMENT_URI");
        return uri;
    }
    public static int write(ContentResolver resolver, Uri uri, byte[] bytes) throws IOException {
        if (uri == null || !"content".equals(uri.getScheme())) throw new IOException("INVALID_DOCUMENT_URI");
        try (OutputStream stream = resolver.openOutputStream(uri, "wt")) {
            if (stream == null) throw new IOException("DOCUMENT_NOT_WRITABLE");
            for (int offset = 0; offset < bytes.length; offset += 65536)
                stream.write(bytes, offset, Math.min(65536, bytes.length - offset));
            stream.flush();
        }
        return bytes.length;
    }
}
