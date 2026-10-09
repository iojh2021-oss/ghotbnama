package io.github.compass.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeCompassPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
