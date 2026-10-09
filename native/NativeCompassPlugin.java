package io.github.compass.app;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

/**
 * Reads the Android rotation-vector sensor directly and sends the rotation
 * matrix (device -> East/North/Up) to the web layer as "orientation" events.
 */
@CapacitorPlugin(name = "NativeCompass")
public class NativeCompassPlugin extends Plugin implements SensorEventListener {

    private SensorManager manager;
    private Sensor sensor;
    private boolean wanted = false;
    private boolean registered = false;
    private final float[] matrix = new float[9];

    @PluginMethod
    public void start(PluginCall call) {
        manager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        sensor = null;
        if (manager != null) {
            sensor = manager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
            if (sensor == null) {
                sensor = manager.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR);
            }
        }
        JSObject result = new JSObject();
        if (sensor == null) {
            result.put("available", false);
            call.resolve(result);
            return;
        }
        wanted = true;
        register();
        result.put("available", registered);
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        wanted = false;
        unregister();
        call.resolve();
    }

    @Override
    protected void handleOnPause() {
        unregister();
        super.handleOnPause();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (wanted) {
            register();
        }
    }

    @Override
    protected void handleOnDestroy() {
        wanted = false;
        unregister();
        super.handleOnDestroy();
    }

    private void register() {
        if (manager != null && sensor != null && !registered) {
            registered = manager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME);
        }
    }

    private void unregister() {
        if (manager != null && registered) {
            manager.unregisterListener(this);
        }
        registered = false;
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        try {
            SensorManager.getRotationMatrixFromVector(matrix, event.values);
        } catch (IllegalArgumentException e) {
            return;
        }
        JSArray values = new JSArray();
        try {
            for (float v : matrix) {
                values.put((double) v);
            }
        } catch (JSONException e) {
            return;
        }
        JSObject data = new JSObject();
        data.put("matrix", values);
        notifyListeners("orientation", data);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // Not used.
    }
}
