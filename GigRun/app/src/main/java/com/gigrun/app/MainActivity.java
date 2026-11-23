package com.gigrun.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;

/**
 * GigRun is a WebView shell around the app in assets/www.
 * The page is served from https://appassets.androidplatform.net/ so camera, GPS and storage
 * work the same as in a normal secure web page. GigRunNative is the small bridge the page
 * uses for things only Android can do: turn-by-turn, reminders, saving and sharing images.
 */
public class MainActivity extends Activity {

    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/www/index.html";
    private static final int REQ_LOCATION = 11, REQ_CAMERA = 12, REQ_NOTIF = 13, REQ_FILE = 14;
    private static final int INK = 0xFF111A22;

    private WebView web;
    private FrameLayout root;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;
    private PermissionRequest pendingCamera;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        root = new FrameLayout(this);
        root.setBackgroundColor(INK);
        web = new WebView(this);
        web.setBackgroundColor(INK);
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        // Android 15 draws apps edge to edge. Pad the content so it stays clear of the system bars and the keyboard.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int l, t, r, b;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                l = i.left; t = i.top; r = i.right; b = i.bottom;
            } else {
                l = insets.getSystemWindowInsetLeft(); t = insets.getSystemWindowInsetTop();
                r = insets.getSystemWindowInsetRight(); b = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(l, t, r, b);
            return insets;
        });

        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (debuggable) WebView.setWebContentsDebuggingEnabled(true);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        web.addJavascriptInterface(new Bridge(), "GigRunNative");
        web.setWebViewClient(new AppClient());
        web.setWebChromeClient(new AppChrome());
        web.loadUrl(START_URL);
    }

    /* ---------------- serving the app from assets ---------------- */

    private class AppClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (!HOST.equals(u.getHost())) return null;
            String path = u.getPath();
            if (path == null || path.equals("/")) path = "/www/index.html";
            if (!path.startsWith("/www/") || path.contains("..")) return notFound();
            try {
                InputStream in = getAssets().open(path.substring(1));
                WebResourceResponse r = new WebResourceResponse(mime(path), "UTF-8", in);
                HashMap<String, String> h = new HashMap<>();
                h.put("Cache-Control", "no-cache");
                r.setResponseHeaders(h);
                return r;
            } catch (IOException e) {
                return notFound();
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (HOST.equals(u.getHost())) return false;
            String sc = u.getScheme() == null ? "" : u.getScheme();
            switch (sc) {
                case "http": case "https": case "tel": case "sms": case "smsto": case "mailto":
                case "geo": case "google.navigation": case "spotify":
                    openExternal(u);
                    break;
                default:
                    break;
            }
            return true; // never navigate the app away from its own page
        }
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
    }

    private static String mime(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    private boolean tryView(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        }
    }

    private void openExternal(Uri uri) {
        if (!tryView(uri)) Toast.makeText(this, "No app on this phone can open that.", Toast.LENGTH_SHORT).show();
    }

    /* ---------------- permissions the page asks for ---------------- */

    private boolean has(String perm) {
        return checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED;
    }

    private class AppChrome extends WebChromeClient {
        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (origin == null || !origin.contains(HOST)) { callback.invoke(origin, false, false); return; }
            if (has(Manifest.permission.ACCESS_FINE_LOCATION) || has(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                callback.invoke(origin, true, false);
            } else {
                geoCallback = callback;
                geoOrigin = origin;
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
            }
        }

        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(() -> {
                if (request.getOrigin() == null || !HOST.equals(request.getOrigin().getHost())) { request.deny(); return; }
                boolean wantsVideo = false, wantsOther = false;
                for (String r : request.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsVideo = true; else wantsOther = true;
                }
                if (!wantsVideo || wantsOther) { request.deny(); return; } // only the selfie camera, never the microphone
                if (has(Manifest.permission.CAMERA)) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                } else {
                    pendingCamera = request;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                }
            });
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            try {
                startActivityForResult(params.createIntent(), REQ_FILE);
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                return false;
            }
            return true;
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        boolean granted = false;
        for (int r : results) if (r == PackageManager.PERMISSION_GRANTED) granted = true;
        if (code == REQ_LOCATION && geoCallback != null) {
            geoCallback.invoke(geoOrigin, granted, false);
            geoCallback = null;
        } else if (code == REQ_CAMERA && pendingCamera != null) {
            if (granted) pendingCamera.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE}); else pendingCamera.deny();
            pendingCamera = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE && fileCallback != null) {
            Uri[] result = resultCode == RESULT_OK ? WebChromeClient.FileChooserParams.parseResult(resultCode, data) : null;
            fileCallback.onReceiveValue(result);
            fileCallback = null;
        }
    }

    /* ---------------- back, lifecycle ---------------- */

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("(window.__back && window.__back()) === true", value -> {
            if (!"true".equals(value)) moveTaskToBack(true);
        });
    }

    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onPause() { web.onPause(); super.onPause(); }
    @Override protected void onDestroy() { web.destroy(); super.onDestroy(); }

    /* ---------------- image saving ---------------- */

    private Uri insertImage(String base64, String name) {
        try {
            byte[] data = Base64.decode(base64, Base64.DEFAULT);
            ContentValues v = new ContentValues();
            v.put(MediaStore.Images.Media.DISPLAY_NAME, name);
            v.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
            v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/GigRun");
            v.put(MediaStore.Images.Media.IS_PENDING, 1);
            Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
            if (uri == null) return null;
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) return null;
                out.write(data);
            }
            v.clear();
            v.put(MediaStore.Images.Media.IS_PENDING, 0);
            getContentResolver().update(uri, v, null, null);
            return uri;
        } catch (Exception e) {
            return null;
        }
    }

    /* ---------------- the bridge the page calls ---------------- */

    public class Bridge {

        @JavascriptInterface
        public void navigate(final double lat, final double lng, final String label) {
            runOnUiThread(() -> {
                Uri nav = Uri.parse("google.navigation:q=" + lat + "," + lng + "&mode=d");
                if (tryView(nav)) return;
                Uri geo = Uri.parse("geo:" + lat + "," + lng + "?q=" + lat + "," + lng + "(" + Uri.encode(label == null ? "Job" : label) + ")");
                if (tryView(geo)) return;
                openExternal(Uri.parse("https://www.google.com/maps/dir/?api=1&destination=" + lat + "," + lng));
            });
        }

        @JavascriptInterface
        public void openUrl(final String url) {
            if (url == null) return;
            final Uri u = Uri.parse(url);
            String sc = u.getScheme();
            if (!"https".equals(sc) && !"http".equals(sc) && !"spotify".equals(sc)) return;
            runOnUiThread(() -> openExternal(u));
        }

        @JavascriptInterface
        public void shareText(final String text) {
            runOnUiThread(() -> {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(send, "Share"));
            });
        }

        @JavascriptInterface
        public boolean saveImage(String base64, String name) {
            return insertImage(base64, name) != null;
        }

        @JavascriptInterface
        public void shareImage(String base64, String name, final String caption) {
            final Uri uri = insertImage(base64, name);
            runOnUiThread(() -> {
                if (uri == null) { Toast.makeText(MainActivity.this, "Could not save the image.", Toast.LENGTH_SHORT).show(); return; }
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("image/png");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.putExtra(Intent.EXTRA_TEXT, caption);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(send, "Share review"));
            });
        }

        @JavascriptInterface
        public void scheduleReminder(String id, double whenMs, String title, String text) {
            Reminders.schedule(MainActivity.this, id, (long) whenMs, title, text);
        }

        @JavascriptInterface
        public void cancelReminder(String id) {
            Reminders.cancel(MainActivity.this, id);
        }

        @JavascriptInterface
        public void ensureNotifications() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 && !has(Manifest.permission.POST_NOTIFICATIONS)) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
                }
            });
        }
    }
}
