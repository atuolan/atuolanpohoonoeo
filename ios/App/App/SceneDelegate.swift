import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    // 看螢幕模式 第 0 步（只在測試分支）：回到前景時顯示 App Group 檢查報告；內容跟上次一樣就不再跳
    private var lastScreenWatchReport: String?

    func sceneDidBecomeActive(_ scene: UIScene) {
        guard let root = window?.rootViewController, root.presentedViewController == nil else { return }
        let message = ScreenWatchProbe.report()
        guard message != lastScreenWatchReport else { return }
        lastScreenWatchReport = message
        let alert = UIAlertController(title: "看螢幕測試", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "好", style: .default))
        root.present(alert, animated: true)
    }
}
