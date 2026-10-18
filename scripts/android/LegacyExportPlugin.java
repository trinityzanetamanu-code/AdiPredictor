package com.adipredictor.app;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "LegacyExport")
public class LegacyExportPlugin extends Plugin {
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private volatile byte[] pending;
    @PluginMethod
    public void save(PluginCall call) {
        if (!busy.compareAndSet(false, true)) { call.reject("EXPORT_BUSY"); return; }
        try {
            pending = LegacyExportDocument.encode(call.getString("json"));
            // Capacitor saves pending calls into Activity state. Never put the
            // multi-megabyte payload in a Bundle or clipboard transaction.
            call.getData().remove("json");
            Intent intent = LegacyExportDocument.createIntent();
            getActivity().runOnUiThread(() -> {
                try { startActivityForResult(call, intent, "fileCreated"); }
                catch (Exception error) { clear(); call.reject("DOCUMENT_PICKER_UNAVAILABLE"); }
            });
        } catch (Exception error) { clear(); call.reject("INVALID_OR_UNAVAILABLE_EXPORT"); }
    }
    @ActivityCallback
    private void fileCreated(PluginCall call, androidx.activity.result.ActivityResult result) {
        if (call == null) { clear(); return; }
        try {
            Uri uri = LegacyExportDocument.selectedUri(result.getResultCode(), result.getData());
            if (uri == null) {
                clear(); JSObject response = new JSObject(); response.put("status", "CANCELLED"); call.resolve(response); return;
            }
            byte[] bytes = pending;
            if (bytes == null) { clear(); call.reject("EXPORT_INTERRUPTED_RETRY"); return; }
            execute(() -> {
                try {
                    int count = LegacyExportDocument.write(getContext().getContentResolver(), uri, bytes);
                    JSObject response = new JSObject(); response.put("status", "SAVED"); response.put("bytes", count); call.resolve(response);
                } catch (Exception error) { call.reject("EXPORT_WRITE_FAILED_RETRY"); }
                finally { clear(); }
            });
        } catch (Exception error) { clear(); call.reject("INVALID_DOCUMENT_RESULT"); }
    }
    private void clear() { pending = null; busy.set(false); }
    @Override protected void handleOnDestroy() { clear(); }
}
