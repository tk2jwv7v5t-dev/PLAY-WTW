import Foundation
import UIKit
import ReplayKit
import Capacitor

/// يبدأ بث شاشة الآيفون: يحفظ رمز البث في مكان مشترك مع جزء البث (App Group)
/// ويعرض نافذة فيها زر "بدء البث" الحقيقي حق الآيفون. جزء البث (ScreenShare) يرسل الصور للسيرفر.
@objc(ScreenSharePlugin)
public class ScreenSharePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ScreenSharePlugin"
    public let jsName = "ScreenShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ping", returnType: CAPPluginReturnPromise)
    ]

    static var appId: String { Bundle.main.bundleIdentifier ?? "com.playwtw.app" }
    static var groupId: String { "group." + appId }
    static var extensionId: String { appId + ".ScreenShare" }

    @objc func ping(_ call: CAPPluginCall) {
        let group = UserDefaults(suiteName: Self.groupId) != nil
        call.resolve(["ok": true, "group": group, "ext": Self.extensionId])
    }

    @objc func start(_ call: CAPPluginCall) {
        guard let url = call.getString("url"), let token = call.getString("token") else {
            call.reject("missing url or token")
            return
        }
        // الطريقتين: المكان المشترك (لو يشتغل)، واتصال محلي داخل الجوال (يشتغل دايم)
        if let shared = UserDefaults(suiteName: Self.groupId) {
            shared.set(url, forKey: "url")
            shared.set(token, forKey: "token")
            shared.set(Date().timeIntervalSince1970, forKey: "at")
            shared.removeObject(forKey: "live")
            shared.synchronize()
        }
        LocalTokenServer.shared.serve(url: url, token: token)

        DispatchQueue.main.async {
            guard let host = self.bridge?.viewController else {
                call.reject("no view controller")
                return
            }
            let sheet = BroadcastSheet(extensionId: Self.extensionId, groupId: Self.groupId)
            sheet.modalPresentationStyle = .pageSheet
            if #available(iOS 15.0, *), let p = sheet.sheetPresentationController {
                p.detents = [.medium()]
                p.prefersGrabberVisible = true
            }
            host.present(sheet, animated: true)
            call.resolve(["ok": true])
        }
    }
}

/// نافذة صغيرة فيها زر بث الشاشة الحقيقي حق الآيفون (RPSystemBroadcastPickerView).
final class BroadcastSheet: UIViewController {
    private let extensionId: String
    private let groupId: String
    private let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 96, height: 96))
    private var timer: Timer?

    init(extensionId: String, groupId: String) {
        self.extensionId = extensionId
        self.groupId = groupId
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.07, green: 0.07, blue: 0.08, alpha: 1)

        let title = UILabel()
        title.text = "شارك شاشتك"
        title.font = .systemFont(ofSize: 22, weight: .bold)
        title.textColor = .white
        title.textAlignment = .center

        let hint = UILabel()
        hint.text = "اضغط الزر تحت، وتأكد إن PLAY WTW مختار، ثم اضغط «بدء البث».\nتقدر تطلع من التطبيق وشاشتك تنبث للي معك في الروم."
        hint.font = .systemFont(ofSize: 15)
        hint.textColor = UIColor(white: 0.75, alpha: 1)
        hint.textAlignment = .center
        hint.numberOfLines = 0

        picker.preferredExtension = extensionId
        picker.showsMicrophoneButton = false
        picker.backgroundColor = UIColor(red: 0.17, green: 0.17, blue: 0.19, alpha: 1)
        picker.layer.cornerRadius = 48
        picker.clipsToBounds = true
        for case let button as UIButton in picker.subviews {
            button.tintColor = .white
            button.imageView?.contentMode = .scaleAspectFit
        }

        let stack = UIStackView(arrangedSubviews: [title, hint, picker])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 18
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        picker.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -20),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),
            hint.widthAnchor.constraint(lessThanOrEqualToConstant: 340),
            picker.widthAnchor.constraint(equalToConstant: 96),
            picker.heightAnchor.constraint(equalToConstant: 96)
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // نحاول نفتح قائمة "بدء البث" لحالنا، ولو ما زبط يضغط الزر بنفسه
        for case let button as UIButton in picker.subviews {
            button.sendActions(for: .touchUpInside)
        }
        // جزء البث استلم الرمز = البث بدأ، نسكّر النافذة
        NotificationCenter.default.addObserver(forName: LocalTokenServer.served, object: nil, queue: .main) { [weak self] _ in
            self?.dismiss(animated: true)
        }
        // أول ما يبدأ البث نسكّر النافذة
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            if UserDefaults(suiteName: self.groupId)?.double(forKey: "live") ?? 0 > 0 {
                self.timer?.invalidate()
                self.dismiss(animated: true)
            }
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        timer?.invalidate()
        NotificationCenter.default.removeObserver(self)
    }
}
