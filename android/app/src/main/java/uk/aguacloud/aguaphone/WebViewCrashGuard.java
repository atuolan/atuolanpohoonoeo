package uk.aguacloud.aguaphone;

import android.util.Log;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.WebViewListener;

/**
 * 網頁程序（WebView 的 renderer）被系統收掉或自己當掉時接手。
 *
 * 沒有人處理的話（回傳 false），Android 會把整個 App 一起殺掉，使用者看到的就是閃退。
 * 記憶體吃緊時最常發生：手機記憶體小、聊天和圖片多，或 App 在背景被系統回收網頁程序。
 * 回傳 true 代表我們處理了，App 不會被殺；這個 WebView 已經不能再用，交給 MainActivity 重建畫面。
 *
 * onRenderProcessGone 是 Android 8（API 26）才有的，只在 8 以上註冊這個類別。
 */
class WebViewCrashGuard extends WebViewListener {

    private static final String TAG = "WebViewCrashGuard";

    private final MainActivity activity;

    WebViewCrashGuard(MainActivity activity) {
        this.activity = activity;
    }

    @Override
    public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
        boolean didCrash = detail != null && detail.didCrash();
        int priority = detail != null ? detail.rendererPriorityAtExit() : -1;
        // didCrash=false 是系統為了記憶體把網頁程序收掉；true 是網頁程序自己當掉（多半也是記憶體不夠）
        Log.e(TAG, "WebView 網頁程序結束 didCrash=" + didCrash + " rendererPriorityAtExit=" + priority);
        activity.onWebViewRenderProcessGone(webView);
        return true;
    }
}
