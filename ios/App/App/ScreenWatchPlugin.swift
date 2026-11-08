import Capacitor
import ReplayKit
import UIKit

/// 讓網頁叫得到 ScreenWatchPlugin：Capacitor 載入後註冊這個 App 自己的外掛
class ScreenWatchBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ScreenWatchPlugin())
    }
}

/// 看螢幕模式（像 DC 分享螢幕）：網頁那邊的介面在 src/native/screenWatch.ts。
/// 廣播期間 App 會被系統暫停，真正看螢幕、送 AI、發通知的是螢幕廣播擴充元件（ScreenWatchBroadcast）。
@objc(ScreenWatchPlugin)
public class ScreenWatchPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ScreenWatchPlugin"
    public let jsName = "ScreenWatch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readReplies", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeReplies", returnType: CAPPluginReturnPromise),
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        if ScreenWatchPicker.extensionBundleId() == nil {
            call.resolve(["available": false, "reason": "這個 App 裡沒有螢幕廣播擴充元件，請重新安裝新版。"])
        } else if ScreenWatchStore.containers.isEmpty {
            call.resolve(["available": false, "reason": "App Group 打不開，沒辦法把設定交給擴充元件。"])
        } else {
            call.resolve(["available": true])
        }
    }

    /// 寫入看螢幕包，跳出系統的「開始廣播」視窗（已經選好我們的擴充元件）
    @objc func start(_ call: CAPPluginCall) {
        guard let pack = call.getString("pack"),
              let data = pack.data(using: .utf8),
              (try? JSONDecoder().decode(ScreenWatchPack.self, from: data)) != nil
        else {
            call.reject("看螢幕包格式不對")
            return
        }
        ScreenWatchStore.removeEverywhere(ScreenWatchShared.stopFile)
        guard ScreenWatchStore.writeEverywhere(data, to: ScreenWatchShared.packFile) else {
            call.reject("App Group 寫不進去，沒辦法把設定交給擴充元件")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let view = self?.bridge?.viewController?.view else {
                call.reject("找不到畫面，沒辦法跳出開始廣播的視窗")
                return
            }
            ScreenWatchPicker.show(in: view)
            call.resolve()
        }
    }

    /// 叫擴充元件停止（它下一次檢查時就會結束廣播，最多十幾秒）
    @objc func stop(_ call: CAPPluginCall) {
        ScreenWatchStore.writeEverywhere(ScreenWatchStopRequest(at: ScreenWatchShared.nowMs()), to: ScreenWatchShared.stopFile)
        call.resolve()
    }

    @objc func status(_ call: CAPPluginCall) {
        guard let status = ScreenWatchStore.readNewest(ScreenWatchStatus.self, from: ScreenWatchShared.statusFile) else {
            call.resolve(["active": false])
            return
        }
        // 擴充元件每 10 秒更新一次；太久沒更新代表已經停了（例如被系統關掉）
        let alive = status.active && ScreenWatchShared.nowMs() - status.heartbeatAt < 45_000
        var result: [String: Any] = [
            "active": alive,
            "chatId": status.chatId,
            "characterName": status.characterName,
            "startedAt": status.startedAt,
            "replies": status.replies,
        ]
        if let lastError = status.lastError {
            result["lastError"] = lastError
        }
        call.resolve(result)
    }

    @objc func readReplies(_ call: CAPPluginCall) {
        let items: [[String: Any]] = ScreenWatchStore.readReplies().map {
            ["id": $0.id, "chatId": $0.chatId, "at": $0.at, "content": $0.content]
        }
        call.resolve(["items": items])
    }

    @objc func removeReplies(_ call: CAPPluginCall) {
        let ids = (call.getArray("ids") ?? []).compactMap { $0 as? String }
        ScreenWatchStore.removeReplies(ids: Set(ids))
        call.resolve()
    }
}

/// 跳出系統的「開始廣播」視窗，並且已經選好我們的擴充元件，不用去控制中心找。
enum ScreenWatchPicker {
    /// 留著同一個 picker，不要每次都新增
    private static var picker: RPSystemBroadcastPickerView?

    /// 從 App 裡的 PlugIns 找出螢幕廣播擴充元件的 Bundle ID（Sideloadly 改了名字也找得到）
    static func extensionBundleId() -> String? {
        guard let url = Bundle.main.builtInPlugInsURL,
              let items = try? FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil)
        else { return nil }
        for item in items where item.pathExtension == "appex" {
            guard let bundle = Bundle(url: item),
                  let ext = bundle.infoDictionary?["NSExtension"] as? [String: Any],
                  ext["NSExtensionPointIdentifier"] as? String == "com.apple.broadcast-services-upload"
            else { continue }
            return bundle.bundleIdentifier
        }
        return nil
    }

    static func show(in view: UIView) {
        let picker = self.picker ?? RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
        self.picker = picker
        picker.preferredExtension = extensionBundleId()
        picker.showsMicrophoneButton = false
        picker.alpha = 0.01
        if picker.superview !== view {
            picker.removeFromSuperview()
            view.addSubview(picker)
        }
        // picker 本身是一顆按鈕，幫玩家按下去
        if let button = picker.subviews.compactMap({ $0 as? UIButton }).first {
            button.sendActions(for: .allTouchEvents)
        }
    }
}
