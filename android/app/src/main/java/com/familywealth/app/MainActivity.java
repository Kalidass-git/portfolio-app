package com.familywealth.app;

import android.os.Bundle;

import androidx.activity.EdgeToEdge;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Our own small plugin (print to PDF and share a file). It must be registered before super.onCreate.
        registerPlugin(NativeToolsPlugin.class);
        // Draw behind the system bars; Capacitor's SystemBars plugin keeps the page clear of them.
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        // The launch splash picture stays as the window background and shows through any strip the page does not cover
        // (it looked like a squashed banner above the header). Use the app's own plain colour instead.
        getWindow().setBackgroundDrawableResource(R.color.window_bg);
        // Text size is set inside the app (Aa button, Settings). Without this, Android's system font size is applied on top of it.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
