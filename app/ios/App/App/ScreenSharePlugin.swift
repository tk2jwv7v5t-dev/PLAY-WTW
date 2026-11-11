import Foundation
import UIKit
import ReplayKit
import Capacitor

/// يبدأ بث شاشة الآيفون: يحفظ رمز البث في مكان مشترك مع جزء البث (App Group)
/// ويفتح قائمة "بدء البث" حق الآيفون، وجزء البث (ScreenShare) يرسل الصور للسيرفر.
@objc(ScreenSharePlugin)
public class ScreenSharePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ScreenSharePlugin"
    public let jsName = "ScreenShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]

    static var appId: String { Bundle.main.bundleIdentifier ?? "com.playwtw.app" }
    static var groupId: String { "group." + appId }
    static var extensionId: String { appId + ".ScreenShare" }

    @objc func start(_ call: CAPPluginCall) {
        guard let url = call.getString("url"), let token = call.getString("token") else {
            call.reject("missing url or token")
            return
        }
        guard let shared = UserDefaults(suiteName: Self.groupId) else {
            call.reject("app group unavailable")
            return
        }
        shared.set(url, forKey: "url")
        shared.set(token, forKey: "token")
        shared.set(Date().timeIntervalSince1970, forKey: "at")
        shared.synchronize()

        DispatchQueue.main.async {
            let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 44, height: 44))
            picker.preferredExtension = Self.extensionId
            picker.showsMicrophoneButton = false
            picker.alpha = 0.01
            self.bridge?.viewController?.view.addSubview(picker)
            // نضغط زر القائمة بدال المستخدم عشان تطلع له قائمة "بدء البث"
            for case let button as UIButton in picker.subviews {
                button.sendActions(for: .touchUpInside)
                button.sendActions(for: .touchDown)
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { picker.removeFromSuperview() }
            call.resolve()
        }
    }
}
