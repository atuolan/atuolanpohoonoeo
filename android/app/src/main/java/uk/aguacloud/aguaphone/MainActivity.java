package uk.aguacloud.aguaphone;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Android 15 以前也滿版（狀態列透明），和 15 以後一致；安全區域交給 CSS 的 --safe-area-inset-*
        // 一定要在 super.onCreate 之後：BridgeActivity 在裡面才換成 AppTheme.NoActionBar。
        // 提早呼叫會先用啟動畫面主題建好視窗，多出一條鋪著 splash 圖的標題列。
        EdgeToEdge.enable(this);
    }
}
