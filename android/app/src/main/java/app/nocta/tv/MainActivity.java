package app.nocta.tv;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Lecteur vidéo natif, piloté par l'interface de NOCTA
        registerPlugin(NoctaPlayerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
