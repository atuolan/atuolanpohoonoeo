import ReplayKit
import UIKit
import UserNotifications

/// 看螢幕模式（像 DC 分享螢幕）的螢幕廣播擴充元件。
///
/// 廣播期間 App 會被系統暫停，所以這裡自己做完：
/// 每隔幾分鐘挑一張畫面縮小 → 填進網頁組好的請求送 AI → 用角色的名字發通知 → 把回覆存進 App Group，
/// App 回到前景時再寫進聊天。
///
/// - 畫面沒變的時候系統不會送新畫面進來，所以也不會看（省 API 額度）
/// - 擴充元件記憶體上限大約 50MB：同一時間只留一張縮圖，用完就丟
class SampleHandler: RPBroadcastSampleHandler {
    /// 多久檢查一次「要不要停止」、更新狀態
    private let checkInterval: TimeInterval = 10
    /// 縮圖寬度
    private let thumbnailWidth: CGFloat = 720
    /// 帶進提示詞、避免重複的最近幾則回覆
    private let recentReplyLimit = 3

    private let lock = NSLock()
    private var pack: ScreenWatchPack?
    private var startedAt = Date()
    private var nextLookAt = Date.distantFuture
    private var requestInFlight = false
    private var replyCount = 0
    private var recentReplies: [String] = []
    private var lastError: String?
    private var errorNotified = false
    private var finished = false
    private var checkTimer: DispatchSourceTimer?

    private let ciContext = CIContext(options: [.cacheIntermediates: false])
    private let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 120
        configuration.timeoutIntervalForResource = 180
        return URLSession(configuration: configuration)
    }()

    // MARK: - 廣播開始／結束

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        guard let pack = ScreenWatchStore.readNewest(ScreenWatchPack.self, from: ScreenWatchShared.packFile) else {
            finish(reason: "請從 203 Phone 聊天裡的「分享螢幕」開始")
            return
        }
        let now = Date()
        lock.lock()
        self.pack = pack
        startedAt = now
        nextLookAt = now.addingTimeInterval(pack.firstDelaySeconds)
        lock.unlock()

        writeStatus()
        startCheckTimer()
    }

    override func broadcastFinished() {
        lock.lock()
        finished = true
        lock.unlock()
        checkTimer?.cancel()
        writeStatus()
    }

    /// 自己結束廣播（玩家按停止、時間到、沒有看螢幕包）。系統會跳出 reason。
    private func finish(reason: String) {
        lock.lock()
        let alreadyFinished = finished
        finished = true
        lock.unlock()
        guard !alreadyFinished else { return }
        checkTimer?.cancel()
        writeStatus()
        finishBroadcastWithError(NSError(
            domain: "ScreenWatch",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: reason]
        ))
    }

    /// 定時檢查：玩家有沒有按停止、時間到了沒，順便更新狀態（畫面沒變時不會有新畫面進來，不能靠畫面觸發）
    private func startCheckTimer() {
        let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .utility))
        timer.schedule(deadline: .now() + checkInterval, repeating: checkInterval)
        timer.setEventHandler { [weak self] in self?.check() }
        checkTimer = timer
        timer.resume()
    }

    private func check() {
        lock.lock()
        let pack = self.pack
        let startedAt = self.startedAt
        let isFinished = finished
        lock.unlock()
        guard let pack = pack, !isFinished else { return }

        if let stop = ScreenWatchStore.readNewest(ScreenWatchStopRequest.self, from: ScreenWatchShared.stopFile),
           stop.at >= startedAt.timeIntervalSince1970 * 1000 {
            finish(reason: "已經停止分享螢幕")
            return
        }
        if Date().timeIntervalSince(startedAt) >= pack.maxSeconds {
            finish(reason: "已經分享 \(Int(pack.maxSeconds / 60)) 分鐘，自動停止")
            return
        }
        writeStatus()
    }

    // MARK: - 畫面

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video else { return }
        let now = Date()

        lock.lock()
        guard let pack = pack, !finished, !requestInFlight, now >= nextLookAt else {
            lock.unlock()
            return
        }
        requestInFlight = true
        nextLookAt = now.addingTimeInterval(pack.intervalSeconds)
        let context = contextText(now: now)
        lock.unlock()

        // 同一時間只留一張縮圖，用完就丟
        let jpeg: Data? = autoreleasepool { makeThumbnailJPEG(sampleBuffer) }
        guard let jpeg = jpeg else {
            lock.lock()
            requestInFlight = false
            lock.unlock()
            return
        }
        look(jpeg: jpeg, context: context, pack: pack)
    }

    /// 縮到寬 720、轉 JPEG
    private func makeThumbnailJPEG(_ sampleBuffer: CMSampleBuffer) -> Data? {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return nil }
        let image = CIImage(cvPixelBuffer: pixelBuffer)
        let width = image.extent.width
        guard width > 0 else { return nil }
        let scale = min(1, thumbnailWidth / width)
        let scaled = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        return ciContext.jpegRepresentation(
            of: scaled,
            colorSpace: colorSpace,
            options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.6]
        )
    }

    /// 給 AI 的當下情況：時間、看了多久、剛剛說過的話（不要重複）
    private func contextText(now: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        let minutes = Int(now.timeIntervalSince(startedAt) / 60)
        var text = "現在是 \(formatter.string(from: now))，已經一起看了 \(minutes) 分鐘。"
        if !recentReplies.isEmpty {
            let quoted = recentReplies.map { "「\($0)」" }.joined(separator: "")
            text += "你剛剛看螢幕時說過：\(quoted)，不要重複一樣的話。"
        }
        return text
    }

    // MARK: - 送 AI

    private func look(jpeg: Data, context: String, pack: ScreenWatchPack) {
        guard let url = URL(string: pack.request.url) else {
            lookFailed("API 網址不對：\(pack.request.url)")
            return
        }
        let body = pack.request.body
            .replacingOccurrences(of: ScreenWatchShared.contextPlaceholder, with: Self.jsonEscaped(context))
            .replacingOccurrences(of: ScreenWatchShared.imagePlaceholder, with: jpeg.base64EncodedString())

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        for (name, value) in pack.request.headers {
            request.setValue(value, forHTTPHeaderField: name)
        }
        request.httpBody = Data(body.utf8)

        session.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { return }
            if let error = error {
                self.lookFailed("連不上 AI：\(error.localizedDescription)")
                return
            }
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200..<300).contains(statusCode) else {
                let detail = data.flatMap { String(data: $0, encoding: .utf8) }.map { String($0.prefix(200)) } ?? ""
                self.lookFailed("AI 回應錯誤 \(statusCode)：\(detail)")
                return
            }
            guard let reply = Self.extractReply(data, format: pack.request.format),
                  !reply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            else {
                self.lookFailed("AI 沒有回應內容")
                return
            }
            self.lookSucceeded(reply, pack: pack)
        }.resume()
    }

    private func lookSucceeded(_ reply: String, pack: ScreenWatchPack) {
        let text = Self.notificationText(reply)
        lock.lock()
        replyCount += 1
        lastError = nil
        recentReplies.append(String(text.prefix(60)))
        if recentReplies.count > recentReplyLimit {
            recentReplies.removeFirst(recentReplies.count - recentReplyLimit)
        }
        requestInFlight = false
        lock.unlock()

        ScreenWatchStore.saveReply(ScreenWatchReply(
            id: UUID().uuidString,
            chatId: pack.chatId,
            at: ScreenWatchShared.nowMs(),
            content: reply
        ))
        writeStatus()
        if !text.isEmpty {
            notify(title: pack.characterName, body: text)
        }
    }

    private func lookFailed(_ message: String) {
        lock.lock()
        lastError = message
        requestInFlight = false
        let shouldNotify = !errorNotified
        errorNotified = true
        let name = pack?.characterName ?? "看螢幕"
        lock.unlock()

        writeStatus()
        // 同一次分享只通知一次錯誤，不要一直跳
        if shouldNotify {
            notify(title: "\(name)看不到你的螢幕", body: message)
        }
    }

    /// 從 API 回應拿出文字
    static func extractReply(_ data: Data?, format: String) -> String? {
        guard let data = data,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }

        if format == "anthropic" {
            let blocks = json["content"] as? [[String: Any]] ?? []
            var text = ""
            for block in blocks where block["type"] as? String == "text" {
                text += block["text"] as? String ?? ""
            }
            return text
        }

        guard let choices = json["choices"] as? [[String: Any]],
              let message = choices.first?["message"] as? [String: Any]
        else { return nil }
        if let content = message["content"] as? String {
            return content
        }
        if let parts = message["content"] as? [[String: Any]] {
            return parts.compactMap { $0["text"] as? String }.joined()
        }
        return nil
    }

    /// 通知上顯示的文字：拿掉思考過程，有 <msg> 就只留 <msg> 裡的話，再拿掉其他標籤
    static func notificationText(_ raw: String) -> String {
        var text = raw.replacingOccurrences(
            of: "<think(?:ing)?>[\\s\\S]*?</think(?:ing)?>",
            with: "",
            options: [.regularExpression, .caseInsensitive]
        )
        if let regex = try? NSRegularExpression(pattern: "<msg(?:\\s[^>]*)?>([\\s\\S]*?)</msg>", options: [.caseInsensitive]) {
            let range = NSRange(text.startIndex..., in: text)
            let messages = regex.matches(in: text, range: range).compactMap { match -> String? in
                guard let inner = Range(match.range(at: 1), in: text) else { return nil }
                return String(text[inner])
            }
            if !messages.isEmpty {
                text = messages.joined(separator: "\n")
            }
        }
        text = text.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        let lines = text
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        let joined = lines.joined(separator: "\n")
        return joined.count > 200 ? String(joined.prefix(200)) + "…" : joined
    }

    /// 放進 JSON 字串裡面用（不含前後的引號）
    static func jsonEscaped(_ string: String) -> String {
        guard let data = try? JSONEncoder().encode(string),
              let quoted = String(data: data, encoding: .utf8),
              quoted.count >= 2
        else { return "" }
        return String(quoted.dropFirst().dropLast())
    }

    // MARK: - 狀態、通知

    private func writeStatus() {
        lock.lock()
        guard let pack = pack else {
            lock.unlock()
            return
        }
        let status = ScreenWatchStatus(
            active: !finished,
            chatId: pack.chatId,
            characterName: pack.characterName,
            startedAt: startedAt.timeIntervalSince1970 * 1000,
            heartbeatAt: ScreenWatchShared.nowMs(),
            replies: replyCount,
            lastError: lastError
        )
        lock.unlock()
        ScreenWatchStore.writeEverywhere(status, to: ScreenWatchShared.statusFile)
    }

    private func notify(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.threadIdentifier = "screen-watch"
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
    }
}
