package uk.aguacloud.aguaphone;

import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.appcompat.app.AlertDialog;
import androidx.lifecycle.Lifecycle;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayDeque;

public class MainActivity extends BridgeActivity {

    /** 這段時間內重開畫面達到 CRASH_LOOP_LIMIT 次，就不再自動重開，改問使用者 */
    private static final long CRASH_LOOP_WINDOW_MS = 60_000L;
    private static final int CRASH_LOOP_LIMIT = 3;

    /** 最近幾次因為網頁程序結束而重開畫面的時間；static：重建 Activity 後還在，App 被關掉才清空 */
    private static final ArrayDeque<Long> recentRecoveries = new ArrayDeque<>();

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    /** 這個 Activity 的 WebView 網頁程序已經結束，要重建畫面 */
    private boolean webViewGone = false;

    private AlertDialog crashLoopDialog;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Android 15 以前也滿版（狀態列透明），和 15 以後一致；安全區域交給 CSS 的 --safe-area-inset-*
        // 一定要在 super.onCreate 之後：BridgeActivity 在裡面才換成 AppTheme.NoActionBar。
        // 提早呼叫會先用啟動畫面主題建好視窗，多出一條鋪著 splash 圖的標題列。
        EdgeToEdge.enable(this);

        // 網頁程序被收掉或當掉時重建畫面，不讓 Android 把整個 App 殺掉（閃退）。
        // onRenderProcessGone 是 Android 8 才有的，舊版不註冊，免得載入用不到的類別。
        if (bridge != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            bridge.addWebViewListener(new WebViewCrashGuard(this));
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        // 網頁程序是在背景時結束的：回到前景才重建
        if (webViewGone) recoverWebView();
    }

    @Override
    public void onDestroy() {
        mainHandler.removeCallbacksAndMessages(null);
        if (crashLoopDialog != null) {
            crashLoopDialog.dismiss();
            crashLoopDialog = null;
        }
        super.onDestroy();
    }

    /** WebViewCrashGuard 呼叫（主執行緒）：這個 WebView 已經不能再用 */
    void onWebViewRenderProcessGone(WebView webView) {
        if (webViewGone) return;
        webViewGone = true;

        // 死掉的 WebView 不能再畫、再操作：先從畫面拿掉（銷毀交給 Capacitor 在 Activity 結束時做）
        ViewParent parent = webView.getParent();
        if (parent instanceof ViewGroup) {
            ((ViewGroup) parent).removeView(webView);
        }

        // 在背景時先不重建，免得在背景載入整個網頁、又被系統收掉，反覆耗電；等 onStart
        if (getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.STARTED)) {
            // 等 onRenderProcessGone 回傳之後再重建
            mainHandler.post(this::recoverWebView);
        }
    }

    /** 重建 Activity：Capacitor 會建一個新的 WebView，從目前的網頁版本（含熱更新）重新載入 */
    private void recoverWebView() {
        if (isFinishing() || isDestroyed()) return;
        if (crashLoopDialog != null && crashLoopDialog.isShowing()) return;

        long now = SystemClock.elapsedRealtime();
        while (!recentRecoveries.isEmpty() && now - recentRecoveries.peekFirst() > CRASH_LOOP_WINDOW_MS) {
            recentRecoveries.pollFirst();
        }
        if (recentRecoveries.size() >= CRASH_LOOP_LIMIT) {
            showCrashLoopDialog();
            return;
        }
        recentRecoveries.addLast(now);
        recreate();
    }

    /** 一直當掉時不要無限重開，讓使用者決定再試或關掉 */
    private void showCrashLoopDialog() {
        crashLoopDialog = new AlertDialog.Builder(this)
            .setTitle(R.string.webview_crash_loop_title)
            .setMessage(R.string.webview_crash_loop_message)
            .setCancelable(false)
            .setPositiveButton(R.string.webview_crash_loop_retry, (dialog, which) -> {
                crashLoopDialog = null;
                recentRecoveries.clear();
                recreate();
            })
            .setNegativeButton(R.string.webview_crash_loop_close, (dialog, which) -> {
                crashLoopDialog = null;
                recentRecoveries.clear();
                finishAndRemoveTask();
            })
            .show();
    }
}
