package app.nocta.tv;

import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.annotation.OptIn;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.common.VideoSize;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.CaptionStyleCompat;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.SubtitleView;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Lecteur vidéo natif de NOCTA sur Android TV (Media3 / ExoPlayer, avec les décodeurs audio
 * FFmpeg pour le DTS et le TrueHD). La vidéo est dessinée SOUS la page web, rendue
 * transparente : l'interface de lecture de NOCTA s'affiche par-dessus, comme avec mpv sur PC.
 * Les commandes et les événements imitent ceux de mpv, pour réutiliser la même interface.
 */
@CapacitorPlugin(name = "NoctaPlayer")
@OptIn(markerClass = UnstableApi.class)
public class NoctaPlayerPlugin extends Plugin {

    private ExoPlayer player;
    private PlayerView view;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<MediaItem.SubtitleConfiguration> extSubs = new ArrayList<>();
    private final List<TrackRef> refs = new ArrayList<>();
    private String src;
    private boolean started;
    private boolean ended;
    private float volume = 1f;
    private boolean muted;
    private String pendingSub;
    private Runnable ticker;

    /** Piste au format de mpv : identifiant par type, et sa place dans les pistes de Media3 */
    private static class TrackRef {
        String type;
        int id;
        Tracks.Group group;
        int index;
    }

    // ---------------------------------------------------------------- Lecture

    @PluginMethod
    public void open(PluginCall call) {
        final String url = call.getString("src");
        final double startAt = call.getDouble("startAt", 0.0);
        final double vol = call.getDouble("volume", 1.0);
        final String alang = call.getString("alang", "fr,fre,fra,en");
        main.post(() -> {
            try {
                if (player == null) create(alang);
                else setLanguages(alang);
                extSubs.clear();
                refs.clear();
                src = url;
                started = false;
                ended = false;
                long start = startAt > 5 ? (long) ((startAt - 3) * 1000) : 0;
                player.setMediaItem(buildItem(), start);
                player.prepare();
                player.setPlayWhenReady(true);
                volume = (float) Math.max(0, Math.min(1, vol));
                applyVolume();
                emit("start-file", null);
                emit("eof-reached", false);
                JSObject r = new JSObject();
                r.put("ok", true);
                call.resolve(r);
            } catch (Exception e) {
                JSObject r = new JSObject();
                r.put("ok", false);
                r.put("error", String.valueOf(e.getMessage()));
                call.resolve(r);
            }
        });
    }

    private void create(String alang) {
        DefaultTrackSelector selector = new DefaultTrackSelector(getContext());
        DefaultRenderersFactory renderers = new DefaultRenderersFactory(getContext())
            // Décodeurs FFmpeg (DTS, TrueHD…) quand l'appareil ne sait pas décoder la piste
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
            .setEnableDecoderFallback(true);
        player = new ExoPlayer.Builder(getContext(), renderers).setTrackSelector(selector).build();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true);
        setLanguages(alang);
        player.addListener(listener);

        view = new PlayerView(getActivity());
        view.setUseController(false);
        view.setFocusable(false);
        view.setFocusableInTouchMode(false);
        view.setKeepScreenOn(true);
        view.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
        view.setShutterBackgroundColor(Color.BLACK);
        view.setBackgroundColor(Color.BLACK);
        view.setPlayer(player);
        SubtitleView sv = view.getSubtitleView();
        if (sv != null) {
            sv.setStyle(new CaptionStyleCompat(Color.WHITE, Color.TRANSPARENT, Color.TRANSPARENT, CaptionStyleCompat.EDGE_TYPE_OUTLINE, Color.BLACK, null));
            sv.setFractionalTextSize(SubtitleView.DEFAULT_TEXT_SIZE_FRACTION * 1.15f);
            sv.setBottomPaddingFraction(0.07f);
        }

        // La vidéo passe sous la page web, qui devient transparente
        WebView web = getBridge().getWebView();
        ViewGroup parent = (ViewGroup) web.getParent();
        parent.addView(view, 0, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(Color.TRANSPARENT);
        web.requestFocus();

        ticker = new Runnable() {
            @Override
            public void run() {
                if (player == null) return;
                long dur = player.getDuration();
                emit("time-pos", player.getCurrentPosition() / 1000.0);
                if (dur != C.TIME_UNSET) emit("duration", dur / 1000.0);
                emit("demuxer-cache-time", player.getBufferedPosition() / 1000.0);
                main.postDelayed(this, 500);
            }
        };
        main.post(ticker);
    }

    /** Langues audio préférées (« fre,fra,fr,eng,en » façon mpv) */
    private void setLanguages(String alang) {
        String[] langs = alang.split(",");
        List<String> out = new ArrayList<>();
        for (String l : langs) if (!l.trim().isEmpty()) out.add(l.trim());
        player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
            .setPreferredAudioLanguages(out.toArray(new String[0]))
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
            .build());
    }

    private MediaItem buildItem() {
        return new MediaItem.Builder().setUri(Uri.parse(src)).setSubtitleConfigurations(new ArrayList<>(extSubs)).build();
    }

    @PluginMethod
    public void close(PluginCall call) {
        main.post(() -> {
            JSObject r = new JSObject();
            if (player != null) {
                long dur = player.getDuration();
                r.put("time", player.getCurrentPosition() / 1000.0);
                r.put("duration", dur == C.TIME_UNSET ? 0 : dur / 1000.0);
            }
            release();
            call.resolve(r);
        });
    }

    private void release() {
        if (ticker != null) main.removeCallbacks(ticker);
        ticker = null;
        if (player != null) {
            player.removeListener(listener);
            player.release();
            player = null;
        }
        if (view != null) {
            ViewGroup parent = (ViewGroup) view.getParent();
            if (parent != null) parent.removeView(view);
            view = null;
        }
        refs.clear();
        extSubs.clear();
    }

    // ---------------------------------------------------------------- Commandes façon mpv

    @PluginMethod
    public void cmd(PluginCall call) {
        final JSArray args = call.getArray("args");
        main.post(() -> {
            try {
                if (player != null && args != null && args.length() > 0) run(args);
            } catch (Exception ignored) {
            }
            call.resolve();
        });
    }

    private void run(JSONArray a) throws Exception {
        String c = a.getString(0);
        switch (c) {
            case "cycle":
                if ("pause".equals(a.optString(1))) player.setPlayWhenReady(!player.getPlayWhenReady());
                break;
            case "seek": {
                double v = a.getDouble(1);
                String mode = a.optString(2, "relative");
                long to = "absolute".equals(mode) ? (long) (v * 1000) : player.getCurrentPosition() + (long) (v * 1000);
                long dur = player.getDuration();
                if (dur != C.TIME_UNSET) to = Math.min(to, Math.max(0, dur - 1000));
                player.seekTo(Math.max(0, to));
                emit("seeking", true);
                break;
            }
            case "set_property":
                setProperty(a.getString(1), a.opt(2));
                break;
            case "sub-add": {
                String url = a.getString(1);
                String title = a.optString(3, "");
                String lang = a.optString(4, "");
                addSubtitle(url, title, lang);
                break;
            }
            default:
                break;
        }
    }

    private void setProperty(String name, Object v) {
        switch (name) {
            case "pause":
                player.setPlayWhenReady(!truthy(v));
                break;
            case "volume":
                volume = (float) Math.max(0, Math.min(1, number(v) / 100.0));
                applyVolume();
                emit("volume", (double) Math.round(volume * 100));
                break;
            case "mute":
                muted = truthy(v);
                applyVolume();
                emit("mute", muted);
                break;
            case "speed":
                player.setPlaybackParameters(new PlaybackParameters((float) number(v)));
                break;
            case "aid":
                select("audio", v);
                break;
            case "sid":
                select("sub", v);
                break;
            default:
                break;
        }
    }

    private void applyVolume() {
        if (player != null) player.setVolume(muted ? 0f : volume);
    }

    private void select(String type, Object v) {
        int trackType = "audio".equals(type) ? C.TRACK_TYPE_AUDIO : C.TRACK_TYPE_TEXT;
        TrackSelectionParameters.Builder b = player.getTrackSelectionParameters().buildUpon();
        if (v == null || v instanceof Boolean || "no".equals(String.valueOf(v))) {
            if (trackType == C.TRACK_TYPE_TEXT) b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true);
            player.setTrackSelectionParameters(b.build());
            return;
        }
        int id = (int) number(v);
        for (TrackRef r : refs) {
            if (r.type.equals(type) && r.id == id) {
                b.setTrackTypeDisabled(trackType, false);
                b.setOverrideForType(new TrackSelectionOverride(r.group.getMediaTrackGroup(), r.index));
                player.setTrackSelectionParameters(b.build());
                return;
            }
        }
    }

    /** Sous-titres d'un addon : ajoutés à la vidéo en cours, sans perdre la position */
    private void addSubtitle(String url, String title, String lang) {
        String lower = url.toLowerCase(Locale.ROOT);
        String mime = lower.contains(".vtt") ? MimeTypes.TEXT_VTT : (lower.contains(".ass") || lower.contains(".ssa")) ? MimeTypes.TEXT_SSA : MimeTypes.APPLICATION_SUBRIP;
        MediaItem.SubtitleConfiguration sub = new MediaItem.SubtitleConfiguration.Builder(Uri.parse(url))
            .setMimeType(mime)
            .setLanguage(lang.isEmpty() ? null : lang)
            .setLabel(title)
            .setId("ext:" + url)
            .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
            .build();
        extSubs.add(sub);
        pendingSub = url;
        long pos = player.getCurrentPosition();
        boolean play = player.getPlayWhenReady();
        player.setMediaItem(buildItem(), pos);
        player.prepare();
        player.setPlayWhenReady(play);
    }

    // ---------------------------------------------------------------- Événements

    private final Player.Listener listener = new Player.Listener() {
        @Override
        public void onPlaybackStateChanged(int state) {
            if (state == Player.STATE_BUFFERING) emit("paused-for-cache", true);
            if (state == Player.STATE_READY) {
                emit("paused-for-cache", false);
                emit("seeking", false);
                long dur = player.getDuration();
                if (dur != C.TIME_UNSET) emit("duration", dur / 1000.0);
                if (!started) {
                    started = true;
                    emit("playback-restart", null);
                }
            }
            if (state == Player.STATE_ENDED && !ended) {
                ended = true;
                emit("eof-reached", true);
            }
        }

        @Override
        public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
            emit("pause", !playWhenReady);
        }

        @Override
        public void onPlaybackParametersChanged(PlaybackParameters p) {
            emit("speed", (double) p.speed);
        }

        @Override
        public void onVideoSizeChanged(VideoSize s) {
            if (s.width > 0 && s.height > 0) {
                emit("dwidth", (double) Math.round(s.width * s.pixelWidthHeightRatio));
                emit("dheight", (double) s.height);
            }
        }

        @Override
        public void onTracksChanged(Tracks tracks) {
            publishTracks(tracks);
        }

        @Override
        public void onPlayerError(PlaybackException e) {
            JSObject d = new JSObject();
            d.put("name", "player-error");
            d.put("value", e.getErrorCodeName() + (e.getMessage() != null ? " · " + e.getMessage() : ""));
            notifyListeners("mpv", d);
            emit("end-file", "error");
        }
    };

    /** Liste des pistes au format de mpv (id, type, lang, title, selected, default, forced…) */
    private void publishTracks(Tracks tracks) {
        refs.clear();
        JSArray list = new JSArray();
        int[] counters = new int[3];
        Object aid = false, sid = false;
        TrackRef wanted = null;
        for (Tracks.Group g : tracks.getGroups()) {
            String type;
            int k;
            switch (g.getType()) {
                case C.TRACK_TYPE_VIDEO: type = "video"; k = 0; break;
                case C.TRACK_TYPE_AUDIO: type = "audio"; k = 1; break;
                case C.TRACK_TYPE_TEXT: type = "sub"; k = 2; break;
                default: continue;
            }
            for (int i = 0; i < g.length; i++) {
                Format f = g.getTrackFormat(i);
                TrackRef r = new TrackRef();
                r.type = type;
                r.id = ++counters[k];
                r.group = g;
                r.index = i;
                refs.add(r);
                boolean selected = g.isTrackSelected(i);
                JSObject t = new JSObject();
                t.put("id", r.id);
                t.put("type", type);
                if (f.language != null && !"und".equals(f.language)) t.put("lang", f.language);
                String label = f.label != null ? f.label : "";
                if (!g.isTrackSupported(i)) label = (label.isEmpty() ? "" : label + " · ") + "non lisible ici";
                if (!label.isEmpty()) t.put("title", label);
                t.put("selected", selected);
                t.put("default", (f.selectionFlags & C.SELECTION_FLAG_DEFAULT) != 0);
                t.put("forced", (f.selectionFlags & C.SELECTION_FLAG_FORCED) != 0);
                String codec = f.sampleMimeType != null ? f.sampleMimeType.replaceAll("^[a-z]+/", "") : (f.codecs != null ? f.codecs : "");
                t.put("codec", codec);
                if (f.channelCount != Format.NO_VALUE) t.put("demux-channel-count", f.channelCount);
                if (f.width != Format.NO_VALUE) t.put("demux-w", f.width);
                if (f.height != Format.NO_VALUE) t.put("demux-h", f.height);
                if (f.id != null && f.id.contains("ext:")) {
                    String u = f.id.substring(f.id.indexOf("ext:") + 4);
                    t.put("external", true);
                    t.put("external-filename", u);
                    if (u.equals(pendingSub)) wanted = r;
                }
                list.put(t);
                if (selected && "audio".equals(type)) aid = r.id;
                if (selected && "sub".equals(type)) sid = r.id;
            }
        }
        JSObject d = new JSObject();
        d.put("name", "track-list");
        d.put("value", list);
        notifyListeners("mpv", d);
        emit("aid", aid);
        emit("sid", sid);
        // Sous-titres d'addon qu'on vient d'ajouter : on les affiche
        if (wanted != null) {
            pendingSub = null;
            final TrackRef w = wanted;
            main.post(() -> select("sub", w.id));
        }
    }

    private void emit(String name, Object value) {
        JSObject d = new JSObject();
        d.put("name", name);
        d.put("value", value == null ? JSObject.NULL : value);
        notifyListeners("mpv", d);
    }

    // ---------------------------------------------------------------- Langues d'un fichier (VF vérifiée)

    /** Ouvre le début du fichier, sans l'afficher, pour lire ses pistes audio et sous-titres */
    @PluginMethod
    public void probe(PluginCall call) {
        final String url = call.getString("src");
        main.post(() -> {
            final ExoPlayer p = new ExoPlayer.Builder(getContext(), new DefaultRenderersFactory(getContext())
                .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)).build();
            p.setVolume(0f);
            final boolean[] done = { false };
            final Runnable finish = () -> {
                if (done[0]) return;
                done[0] = true;
                p.release();
            };
            p.addListener(new Player.Listener() {
                @Override
                public void onTracksChanged(Tracks tracks) {
                    if (done[0] || tracks.getGroups().isEmpty()) return;
                    JSArray audios = new JSArray(), subs = new JSArray();
                    for (Tracks.Group g : tracks.getGroups()) {
                        for (int i = 0; i < g.length; i++) {
                            Format f = g.getTrackFormat(i);
                            JSObject t = new JSObject();
                            t.put("lang", f.language == null || "und".equals(f.language) ? "" : f.language);
                            t.put("title", f.label == null ? "" : f.label);
                            t.put("forced", (f.selectionFlags & C.SELECTION_FLAG_FORCED) != 0);
                            if (g.getType() == C.TRACK_TYPE_AUDIO) audios.put(t);
                            if (g.getType() == C.TRACK_TYPE_TEXT) subs.put(t);
                        }
                    }
                    JSObject r = new JSObject();
                    r.put("ok", true);
                    r.put("audios", audios);
                    r.put("subs", subs);
                    call.resolve(r);
                    finish.run();
                }

                @Override
                public void onPlayerError(PlaybackException e) {
                    if (done[0]) return;
                    JSObject r = new JSObject();
                    r.put("ok", false);
                    call.resolve(r);
                    finish.run();
                }
            });
            p.setMediaItem(MediaItem.fromUri(url));
            p.setPlayWhenReady(false);
            p.prepare();
            main.postDelayed(() -> {
                if (done[0]) return;
                JSObject r = new JSObject();
                r.put("ok", false);
                call.resolve(r);
                finish.run();
            }, 20000);
        });
    }

    // ---------------------------------------------------------------- Cycle de vie

    @Override
    protected void handleOnPause() {
        if (player != null) player.setPlayWhenReady(false);
    }

    @Override
    protected void handleOnDestroy() {
        release();
    }

    private static boolean truthy(Object v) {
        if (v instanceof Boolean) return (Boolean) v;
        if (v instanceof Number) return ((Number) v).doubleValue() != 0;
        return v != null && !"no".equals(String.valueOf(v)) && !"false".equals(String.valueOf(v));
    }

    private static double number(Object v) {
        if (v instanceof Number) return ((Number) v).doubleValue();
        try {
            return Double.parseDouble(String.valueOf(v));
        } catch (Exception e) {
            return 0;
        }
    }
}
