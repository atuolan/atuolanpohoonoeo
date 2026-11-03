import UIKit
import Capacitor
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
    static let appGroupId = "group.uk.aguacloud.aguaphone"
    static let appWroteKey = "screenWatch.appWrote"
    static let extensionCountKey = "screenWatch.extensionCount"

    static func writeAppValue() {
        let formatter = DateFormatter()
        formatter.dateFormat = "MM/dd HH:mm:ss"
        UserDefaults(suiteName: appGroupId)?.set("App 寫入：\(formatter.string(from: Date()))", forKey: appWroteKey)
    }

    /// 擴充元件寫的次數；App Group 打不開回傳 nil
    static func readExtensionCount() -> Int? {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return nil }
        return defaults.integer(forKey: extensionCountKey)
    }
}
