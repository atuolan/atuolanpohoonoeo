import Foundation

// 看螢幕模式（像 DC 分享螢幕）：App 和螢幕廣播擴充元件共用的程式，兩個 target 都編這個檔。
//
// App（ScreenWatchPlugin）把「看螢幕包」寫進 App Group；擴充元件讀它、每隔幾分鐘把截圖填進請求送 AI、
// 發通知、把回覆存回 App Group；App 回到前景時讀回覆寫進聊天。

enum ScreenWatchShared {
    static let packFile = "screen-watch-pack.json"
    static let statusFile = "screen-watch-status.json"
    static let stopFile = "screen-watch-stop.json"
    static let repliesDirectory = "screen-watch-replies"

    /// 網頁組請求時放的佔位字串（跟 src/native/screenWatch.ts 一樣）
    static let imagePlaceholder = "__SCREEN_WATCH_IMAGE__"
    static let contextPlaceholder = "__SCREEN_WATCH_CONTEXT__"

    static func nowMs() -> Double {
        Date().timeIntervalSince1970 * 1000
    }
}

/// 網頁組好的看螢幕包（JSON，格式見 src/native/screenWatch.ts 的 ScreenWatchPack）
struct ScreenWatchPack: Codable {
    struct Request: Codable {
        var url: String
        var headers: [String: String]
        /// JSON 字串，裡面有圖片和情況的佔位字串
        var body: String
        /// "openai" 或 "anthropic"
        var format: String
    }

    var chatId: String
    var characterName: String
    var intervalSeconds: Double
    var maxSeconds: Double
    var firstDelaySeconds: Double
    var request: Request
}

/// 擴充元件存的一則回覆，App 回到前景時寫進聊天
struct ScreenWatchReply: Codable {
    var id: String
    var chatId: String
    /// 毫秒
    var at: Double
    /// AI 的原始回覆
    var content: String
}

/// 擴充元件現在的狀態（App 的面板顯示用）
struct ScreenWatchStatus: Codable {
    var active: Bool
    var chatId: String
    var characterName: String
    var startedAt: Double
    var heartbeatAt: Double
    var replies: Int
    var lastError: String?
}

/// App 叫擴充元件停止
struct ScreenWatchStopRequest: Codable {
    var at: Double
}

/// App Group 裡的檔案。
/// Sideloadly 會把 App Group 改名，而且給好幾個（順序是亂的）：
/// 設定類的檔案寫進每一個、讀最新的一份；回覆一則一個檔案，擴充元件寫進排序後第一個，App 每個都讀。
enum ScreenWatchStore {
    /// 打得開的 App Group 容器（排序過，App 和擴充元件拿到同一組時第一個會一樣）
    static let containers: [URL] = SignedAppGroups.usable().sorted().compactMap {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0)
    }

    @discardableResult
    static func writeEverywhere(_ data: Data, to name: String) -> Bool {
        var wrote = false
        for directory in containers {
            if (try? data.write(to: directory.appendingPathComponent(name), options: .atomic)) != nil {
                wrote = true
            }
        }
        return wrote
    }

    @discardableResult
    static func writeEverywhere<T: Encodable>(_ value: T, to name: String) -> Bool {
        guard let data = try? JSONEncoder().encode(value) else { return false }
        return writeEverywhere(data, to: name)
    }

    /// 讀最新的一份（看檔案修改時間）
    static func readNewest<T: Decodable>(_ type: T.Type, from name: String) -> T? {
        let files = containers
            .map { $0.appendingPathComponent(name) }
            .compactMap { url -> (date: Date, url: URL)? in
                let values = try? url.resourceValues(forKeys: [.contentModificationDateKey])
                guard let date = values?.contentModificationDate else { return nil }
                return (date, url)
            }
            .sorted { $0.date > $1.date }
        for file in files {
            if let data = try? Data(contentsOf: file.url),
               let value = try? JSONDecoder().decode(T.self, from: data) {
                return value
            }
        }
        return nil
    }

    static func removeEverywhere(_ name: String) {
        for directory in containers {
            try? FileManager.default.removeItem(at: directory.appendingPathComponent(name))
        }
    }

    // MARK: - 回覆（一則一個檔案，不用鎖）

    static func saveReply(_ reply: ScreenWatchReply) {
        guard let container = containers.first,
              let data = try? JSONEncoder().encode(reply) else { return }
        let directory = container.appendingPathComponent(ScreenWatchShared.repliesDirectory, isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? data.write(to: directory.appendingPathComponent("\(reply.id).json"), options: .atomic)
    }

    static func readReplies() -> [ScreenWatchReply] {
        var seen = Set<String>()
        var replies: [ScreenWatchReply] = []
        for container in containers {
            let directory = container.appendingPathComponent(ScreenWatchShared.repliesDirectory, isDirectory: true)
            let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
            for file in files where file.pathExtension == "json" {
                guard let data = try? Data(contentsOf: file),
                      let reply = try? JSONDecoder().decode(ScreenWatchReply.self, from: data),
                      seen.insert(reply.id).inserted
                else { continue }
                replies.append(reply)
            }
        }
        return replies.sorted { $0.at < $1.at }
    }

    static func removeReplies(ids: Set<String>) {
        for container in containers {
            let directory = container.appendingPathComponent(ScreenWatchShared.repliesDirectory, isDirectory: true)
            for id in ids {
                try? FileManager.default.removeItem(at: directory.appendingPathComponent("\(id).json"))
            }
        }
    }
}

/// 從自己執行檔的簽名讀出「實際拿到」的 App Group。
/// Sideloadly 用自己的 Apple ID 重簽時會把 App Group 改名；而且 UserDefaults(suiteName:) 名字對不上也不會回傳 nil，
/// 只會偷偷改用自己私有的儲存，所以要查簽名、再用 containerURL 確認容器真的打得開。
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
    /// Sideloadly 會給好幾個，而且 App 和擴充元件簽名裡的順序可能不一樣，不能各挑「第一個」。
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
