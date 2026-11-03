import ReplayKit
import UIKit
import UserNotifications

/// 看螢幕模式 第 0 步：可行性測試用的螢幕廣播擴充元件。
/// 不接 AI、不存圖、不送出，只確認：收得到畫面、縮得了圖、記憶體夠、發得了通知、App Group 讀寫得到。
class SampleHandler: RPBroadcastSampleHandler {
    static let appGroupId = "group.uk.aguacloud.aguaphone"
    static let appWroteKey = "screenWatch.appWrote"
    static let extensionCountKey = "screenWatch.extensionCount"

    /// 每隔幾秒抽一張畫面
    private let sampleInterval: TimeInterval = 30
    private var frameCount = 0
    private var reportCount = 0
    private var lastSampleAt = Date.distantPast
    private let ciContext = CIContext(options: [.cacheIntermediates: false])

    private var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: SampleHandler.appGroupId)
    }

    private func appGroupValue() -> String {
        guard let defaults = sharedDefaults else { return "讀不到（App Group 打不開）" }
        return defaults.string(forKey: SampleHandler.appWroteKey) ?? "讀不到（沒有 App 寫的值）"
    }

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        frameCount = 0
        reportCount = 0
        lastSampleAt = Date()
        notify(title: "看螢幕測試：開始了", body: "App Group：\(appGroupValue())")
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
        sharedDefaults?.set(reportCount, forKey: SampleHandler.extensionCountKey)

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
