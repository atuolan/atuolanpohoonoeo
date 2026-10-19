package uk.aguacloud.aguaphone;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Android 15 以前也滿版（狀態列透明），和 15 以後一致；安全區域交給 CSS 的 --safe-area-inset-*
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
