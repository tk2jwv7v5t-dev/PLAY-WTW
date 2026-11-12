import UIKit
import Capacitor

/// نفس شاشة Capacitor، بس نسجّل فيها plugin بث الشاشة الخاص بالتطبيق.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        // احتياط: لو ما تسجّل من القائمة نسجّله هنا
        if bridge?.plugin(withName: "ScreenShare") == nil {
            bridge?.registerPluginInstance(ScreenSharePlugin())
        }
    }
}
