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
    }
}
