import ReplayKit
import UIKit
import UserNotifications

/// 看螢幕模式 第 0 步：可行性測試用的螢幕廣播擴充元件。
/// 不接 AI、不存圖、不送出，只確認：收得到畫面、縮得了圖、記憶體夠、發得了通知、App Group 讀寫得到。
class SampleHandler: RPBroadcastSampleHandler {
    static let appWroteKey = "screenWatch.appWrote"
    static let extensionCountKey = "screenWatch.extensionCount"
    static let extensionInfoKey = "screenWatch.extensionInfo"

    /// 每隔幾秒抽一張畫面
    private let sampleInterval: TimeInterval = 30
    private var frameCount = 0
    private var reportCount = 0
    private var lastSampleAt = Date.distantPast
    private let ciContext = CIContext(options: [.cacheIntermediates: false])

    /// 能用的 App Group（全部）
    private lazy var groupIds: [String] = SignedAppGroups.usable()

    /// 寫進每一個能用的 App Group（App 那邊挑哪個都讀得到）
    private func writeShared(_ value: Any, forKey key: String) {
        for id in groupIds {
            UserDefaults(suiteName: id)?.set(value, forKey: key)
        }
    }

    /// 從每一個 App Group 找 App 寫的值
    private func appGroupValue() -> String {
        guard !groupIds.isEmpty else { return "打不開（簽名裡：\(SignedAppGroups.describeSignature())）" }
        for id in groupIds {
            if let value = UserDefaults(suiteName: id)?.string(forKey: SampleHandler.appWroteKey) {
                return "\(value)（在 \(id)）"
            }
        }
        return "\(groupIds.count) 個都讀不到 App 寫的值"
    }

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        frameCount = 0
        reportCount = 0
        lastSampleAt = Date()
        let info = "Bundle ID：\(Bundle.main.bundleIdentifier ?? "?")｜簽名裡：\(SignedAppGroups.describeSignature())｜能用：\(groupIds.count) 個"
        writeShared(info, forKey: SampleHandler.extensionInfoKey)
        notify(title: "看螢幕測試：開始了", body: "App Group：\(appGroupValue())\n\(info)")
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video else { return }
        frameCount += 1

        let now = Date()
        guard now.timeIntervalSince(lastSampleAt) >= sampleInterval else { return }
        lastSampleAt = now

        // 同一時間只留一張縮圖，用完就丟
        let kb: Int = autoreleasepool {
            guard let jpeg = makeThumbnailJPEG(sampleBuffer) else { return -1 }
            return jpeg.count / 1024
        }

        reportCount += 1
        writeShared(reportCount, forKey: SampleHandler.extensionCountKey)

        let sizeText = kb >= 0 ? "\(kb) KB" : "縮圖失敗"
        notify(
            title: "看螢幕測試：第 \(reportCount) 次",
            body: "收到 \(frameCount) 張｜縮圖 \(sizeText)｜App Group：\(appGroupValue())"
        )
    }

    override func broadcastFinished() {
        notify(title: "看螢幕測試：結束了", body: "共 \(reportCount) 次")
    }

    /// 縮到寬 720、轉 JPEG
    private func makeThumbnailJPEG(_ sampleBuffer: CMSampleBuffer) -> Data? {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return nil }
        let image = CIImage(cvPixelBuffer: pixelBuffer)
        let width = image.extent.width
        guard width > 0 else { return nil }
        let scale = min(1, 720 / width)
        let scaled = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        return ciContext.jpegRepresentation(
            of: scaled,
            colorSpace: colorSpace,
            options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.6]
        )
    }

    private func notify(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
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
