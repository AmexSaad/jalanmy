package my.jalanmy.app;

import android.speech.tts.TextToSpeech;
import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

@CapacitorPlugin(name="JalanSpeech")
public class JalanSpeechPlugin extends Plugin {
    private TextToSpeech tts;
    private boolean ready = false;
    @Override public void load() {
        getActivity().runOnUiThread(() -> {
            tts = new TextToSpeech(getContext(), status -> {
                if (status == TextToSpeech.SUCCESS) {
                    int result = tts.setLanguage(Locale.forLanguageTag("ms-MY"));
                    ready = result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED;
                }
            });
        });
    }
    @PluginMethod public void speak(PluginCall call) {
        String text = call.getString("text", "");
        getActivity().runOnUiThread(() -> {
            if (!ready || tts == null) { call.reject("Pasang suara Bahasa Melayu dalam tetapan Text-to-speech telefon."); return; }
            if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "jalanmy") == TextToSpeech.ERROR) {
                call.reject("Suara tidak dapat dimainkan.");
            } else { call.resolve(); }
        });
    }
    @PluginMethod public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> { if (tts != null) tts.stop(); call.resolve(); });
    }
    @PluginMethod public void keepAwake(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getActivity().runOnUiThread(() -> {
            if (enabled) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }
    @Override protected void handleOnDestroy() {
        ready = false;
        if (tts != null) { tts.stop(); tts.shutdown(); tts = null; }
    }
}
