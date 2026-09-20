package com.adipredictor.app;

import android.app.Activity;
import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HKVerification")
public class HKVerificationPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        Intent intent = new Intent(getContext(), HKVerificationActivity.class);
        startActivityForResult(call, intent, "verificationResult");
    }

    @ActivityCallback
    private void verificationResult(PluginCall call, androidx.activity.result.ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null) {
            JSObject response = new JSObject();
            response.put("status", "VERIFICATION_CANCELLED");
            call.resolve(response);
            return;
        }
        JSObject response = new JSObject();
        response.put("status", "RESULT_PAGE_READY");
        response.put("url", data.getStringExtra("url"));
        response.put("html", data.getStringExtra("html"));
        call.resolve(response);
    }
}
