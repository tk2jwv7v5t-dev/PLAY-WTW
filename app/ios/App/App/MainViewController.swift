import UIKit
import Capacitor

/// نفس شاشة Capacitor، بس نسجّل فيها plugin بث الشاشة الخاص بالتطبيق.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ScreenSharePlugin())
    }
}
