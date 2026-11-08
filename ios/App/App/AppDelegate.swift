import UIKit
import Capacitor
import ReplayKit
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // 看螢幕模式 第 0 步（只在測試分支）：寫一個值進 App Group，讓擴充元件讀；順便要通知權限
        ScreenWatchProbe.writeAppValue()
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

/// 看螢幕模式 第 0 步：App 和擴充元件透過 App Group 互相讀寫，測試能不能共用資料
enum ScreenWatchProbe {
    static let appWroteKey = "screenWatch.appWrote"
    static let extensionCountKey = "screenWatch.extensionCount"
    static let extensionInfoKey = "screenWatch.extensionInfo"
    static let lastNotifyKey = "screenWatch.lastNotify"

    /// 能用的 App Group（全部）
    static let groupIds: [String] = SignedAppGroups.usable()

    /// 寫進每一個能用的 App Group
    static func writeAppValue() {
        let formatter = DateFormatter()
        formatter.dateFormat = "MM/dd HH:mm:ss"
        let value = "App 寫入：\(formatter.string(from: Date()))"
        for id in groupIds {
            UserDefaults(suiteName: id)?.set(value, forKey: appWroteKey)
        }
    }

    /// 回到 App 時跳出來的檢查報告：從每一個 App Group 找擴充元件寫的東西
    static func report() -> String {
        var lines = [
            "App Bundle ID：\(Bundle.main.bundleIdentifier ?? "?")",
            "簽名裡的 App Group：\(SignedAppGroups.describeSignature())",
        ]
        guard !groupIds.isEmpty else {
            lines.append("能用的 App Group：沒有（容器打不開）")
            return lines.joined(separator: "\n")
        }
        lines.append("能用的 App Group：\(groupIds.count) 個")

        var count = 0
        var info: String?
        var foundIn: String?
        var lastNotify: String?
        for id in groupIds {
            guard let defaults = UserDefaults(suiteName: id) else { continue }
            count = max(count, defaults.integer(forKey: extensionCountKey))
            if info == nil, let value = defaults.string(forKey: extensionInfoKey) {
                info = value
                foundIn = id
            }
            if lastNotify == nil {
                lastNotify = defaults.string(forKey: lastNotifyKey)
            }
        }
        lines.append("擴充元件寫入：第 \(count) 次")
        if let info = info, let foundIn = foundIn {
            lines.append("在 \(foundIn) 讀到擴充元件：\(info)")
        } else {
            lines.append("擴充元件那邊：\(groupIds.count) 個 App Group 都還沒讀到（還沒開始廣播，或兩邊沒有共同的 App Group）")
        }
        if let lastNotify = lastNotify {
            lines.append("擴充元件最後一次發通知：\(lastNotify)")
        }
        return lines.joined(separator: "\n")
    }
}

/// 看螢幕模式：像 DC 那樣在 App 裡開始分享螢幕。
/// 跳出系統的「開始廣播」視窗，並且已經選好我們的擴充元件，不用再去控制中心找。
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

/// 看螢幕模式 第 0 步：從自己執行檔的簽名讀出「實際拿到」的 App Group。
/// Sideloadly 用自己的 Apple ID 重簽時可能把 App Group 改名，寫死的名字就對不上；
/// 而且 UserDefaults(suiteName:) 名字對不上也不會回傳 nil，只會偷偷改用自己私有的儲存，
/// 所以要另外查簽名、再用 containerURL 確認容器真的打得開。
/// （App 和擴充元件是不同模組，這段在 AppDelegate.swift 和 SampleHandler.swift 各有一份，內容一樣）
enum SignedAppGroups {
    static let preferredId = "group.uk.aguacloud.aguaphone"

    /// 簽名裡的 App Group 清單；讀不到簽名回傳 nil
    static func fromSignature() -> [String]? {
        guard let url = Bundle.main.executableURL,
              let data = try? Data(contentsOf: url, options: .alwaysMapped),
              let xml = entitlementsXML(in: data),
              let plist = try? PropertyListSerialization.propertyList(from: xml, options: [], format: nil),
              let dict = plist as? [String: Any]
        else { return nil }
        return dict["com.apple.security.application-groups"] as? [String] ?? []
    }

    static func describeSignature() -> String {
        guard let groups = fromSignature() else { return "讀不到簽名" }
        return groups.isEmpty ? "沒有" : groups.joined(separator: "、")
    }

    /// 容器打得開的 App Group 全部列出來（原本的名字、簽名裡的、AltStore 類工具寫在 Info.plist 的，去掉重複）。
    /// Sideloadly 會給好幾個，而且 App 和擴充元件簽名裡的順序可能不一樣，
    /// 所以不能各挑「第一個」：兩邊都要寫進全部、從全部讀。
    static func usable() -> [String] {
        var candidates = [preferredId]
        candidates += fromSignature() ?? []
        candidates += Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String] ?? []
        var seen = Set<String>()
        return candidates.filter { id in
            guard seen.insert(id).inserted else { return false }
            return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id) != nil
        }
    }

    // MARK: - 解析 Mach-O 的 code signature

    private static func u32(_ d: Data, _ offset: Int, bigEndian: Bool) -> Int? {
        guard offset >= 0, offset + 4 <= d.count else { return nil }
        let i = d.startIndex + offset
        let b0 = UInt32(d[i]), b1 = UInt32(d[i + 1]), b2 = UInt32(d[i + 2]), b3 = UInt32(d[i + 3])
        let value: UInt32
        if bigEndian {
            value = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3
        } else {
            value = (b3 << 24) | (b2 << 16) | (b1 << 8) | b0
        }
        return Int(value)
    }

    /// 找出執行檔簽名裡的 entitlements（XML plist）
    private static func entitlementsXML(in d: Data) -> Data? {
        var base = 0
        // fat 執行檔（0xCAFEBABE，大端）：優先挑 arm64
        if u32(d, 0, bigEndian: true) == 0xCAFE_BABE {
            guard let archCount = u32(d, 4, bigEndian: true) else { return nil }
            var first: Int?
            var arm64: Int?
            for k in 0..<min(archCount, 8) {
                let entry = 8 + k * 20
                guard let cpu = u32(d, entry, bigEndian: true),
                      let offset = u32(d, entry + 8, bigEndian: true) else { return nil }
                if first == nil { first = offset }
                if arm64 == nil && cpu == 0x0100_000C { arm64 = offset }
            }
            guard let chosen = arm64 ?? first else { return nil }
            base = chosen
        }

        // 64 位元 Mach-O（0xFEEDFACF，小端），header 32 bytes
        guard u32(d, base, bigEndian: false) == 0xFEED_FACF,
              let commandCount = u32(d, base + 16, bigEndian: false) else { return nil }
        var p = base + 32
        for _ in 0..<min(commandCount, 1024) {
            guard let cmd = u32(d, p, bigEndian: false),
                  let size = u32(d, p + 4, bigEndian: false), size >= 8 else { return nil }
            if cmd == 0x1D { // LC_CODE_SIGNATURE
                guard let dataOffset = u32(d, p + 8, bigEndian: false) else { return nil }
                return entitlementsBlob(in: d, superBlob: base + dataOffset)
            }
            p += size
        }
        return nil
    }

    /// SuperBlob（0xFADE0CC0）裡找 slot 5 的 entitlements blob（0xFADE7171）
    private static func entitlementsBlob(in d: Data, superBlob s: Int) -> Data? {
        guard u32(d, s, bigEndian: true) == 0xFADE_0CC0,
              let count = u32(d, s + 8, bigEndian: true) else { return nil }
        for k in 0..<min(count, 64) {
            let entry = s + 12 + k * 8
            guard let slot = u32(d, entry, bigEndian: true),
                  let offset = u32(d, entry + 4, bigEndian: true) else { return nil }
            guard slot == 5 else { continue }
            let b = s + offset
            guard u32(d, b, bigEndian: true) == 0xFADE_7171,
                  let length = u32(d, b + 4, bigEndian: true),
                  length > 8, b + length <= d.count else { return nil }
            return d.subdata(in: (d.startIndex + b + 8)..<(d.startIndex + b + length))
        }
        return nil
    }
}

/// 看螢幕模式 第 0 步：把通知設定寫成看得懂的一行，查「為什麼沒跳通知」用。
/// （App 和擴充元件是不同模組，這段在 AppDelegate.swift 和 SampleHandler.swift 各有一份，內容一樣）
enum NotificationDiagnostics {
    static func describe(_ s: UNNotificationSettings) -> String {
        let auth: String
        switch s.authorizationStatus {
        case .authorized: auth = "允許"
        case .denied: auth = "不允許"
        case .notDetermined: auth = "還沒問過"
        case .provisional: auth = "安靜送達"
        case .ephemeral: auth = "暫時"
        @unknown default: auth = "不明"
        }
        var parts = [
            "權限\(auth)",
            "橫幅\(onOff(s.alertSetting))",
            "通知中心\(onOff(s.notificationCenterSetting))",
        ]
        if s.scheduledDeliverySetting == .enabled {
            parts.append("排程摘要開著（通知會晚點一起出現）")
        }
        return parts.joined(separator: "、")
    }

    private static func onOff(_ setting: UNNotificationSetting) -> String {
        switch setting {
        case .enabled: return "開"
        case .disabled: return "關"
        case .notSupported: return "不支援"
        @unknown default: return "不明"
        }
    }

    static func timeText() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter.string(from: Date())
    }
}
