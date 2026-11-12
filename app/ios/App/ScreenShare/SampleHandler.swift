import ReplayKit
import Network
import CoreImage
import UIKit

/// جزء البث: الآيفون يعطينا صور الشاشة، نصغّرها ونحوّلها JPEG ونرسلها للسيرفر.
/// الذاكرة هنا محدودة (حوالي 50 ميقا)، فنرسل صورة وحدة بس في كل مرة ونتخطى الباقي.
class SampleHandler: RPBroadcastSampleHandler {
    private var session: URLSession?
    private var socket: URLSessionWebSocketTask?
    private let ciContext = CIContext(options: [.useSoftwareRenderer: false, .cacheIntermediates: false])
    private let colorSpace = CGColorSpaceCreateDeviceRGB()
    private let queue = DispatchQueue(label: "playwtw.screen.encode", qos: .userInitiated)
    private let lock = NSLock()
    private var sending = false
    private var lastSent: CFTimeInterval = 0
    private var finished = false

    private let minInterval: CFTimeInterval = 1.0 / 10.0 // 10 صور بالثانية
    private let maxSide: CGFloat = 1280
    private let quality: CGFloat = 0.5

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        let ext = Bundle.main.bundleIdentifier ?? ""
        let appId = ext.hasSuffix(".ScreenShare") ? String(ext.dropLast(".ScreenShare".count)) : ext
        let shared = UserDefaults(suiteName: "group." + appId)
        // أول شي: المكان المشترك. لو ما فيه رمز (مثل TrollStore) نطلبه من التطبيق عن طريق اتصال محلي
        if let url = shared?.string(forKey: "url"), let token = shared?.string(forKey: "token"),
           let at = shared?.double(forKey: "at"), Date().timeIntervalSince1970 - at < 120 {
            shared?.removeObject(forKey: "token")
            shared?.set(Date().timeIntervalSince1970, forKey: "live")
            connect(url: url, token: token)
            return
        }
        fetchFromApp { [weak self] url, token in
            guard let self = self else { return }
            guard let url = url, let token = token else {
                self.stop("افتح PLAY WTW، ادخل روم صوتي، واضغط زر الشاشة 🖥️ وبعدين «بدء البث».")
                return
            }
            shared?.set(Date().timeIntervalSince1970, forKey: "live")
            self.connect(url: url, token: token)
        }
    }

    /// نطلب الرمز من التطبيق (يكون مفتوح ورا قائمة البث) عن طريق 127.0.0.1
    private func fetchFromApp(_ done: @escaping (String?, String?) -> Void) {
        let conn = NWConnection(host: "127.0.0.1", port: 48653, using: .tcp)
        var finished = false
        let finish: (String?, String?) -> Void = { url, token in
            if finished { return }
            finished = true
            conn.cancel()
            done(url, token)
        }
        conn.stateUpdateHandler = { state in
            if case .failed = state { finish(nil, nil) }
        }
        conn.start(queue: queue)
        conn.receive(minimumIncompleteLength: 1, maximumLength: 16384) { data, _, _, _ in
            guard let data = data,
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                finish(nil, nil)
                return
            }
            finish(obj["url"] as? String, obj["token"] as? String)
        }
        queue.asyncAfter(deadline: .now() + 4) { finish(nil, nil) }
    }

    private func connect(url: String, token: String) {
        guard var comps = URLComponents(string: url) else { stop("صار خطأ في رابط البث."); return }
        comps.queryItems = [URLQueryItem(name: "token", value: token)]
        guard let wsURL = comps.url else { stop("صار خطأ في رابط البث."); return }
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        session = URLSession(configuration: config)
        socket = session?.webSocketTask(with: wsURL)
        socket?.maximumMessageSize = 1 << 20
        socket?.resume()
        listen()
    }

    private func listen() {
        socket?.receive { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .failure:
                self.stop("انتهى البث.")
            case .success:
                self.listen()
            }
        }
    }

    private func stop(_ message: String) {
        lock.lock()
        if finished { lock.unlock(); return }
        finished = true
        lock.unlock()
        socket?.cancel(with: .goingAway, reason: nil)
        let error = NSError(domain: "PLAYWTW", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        finishBroadcastWithError(error)
    }

    override func broadcastFinished() {
        let ext = Bundle.main.bundleIdentifier ?? ""
        let appId = ext.hasSuffix(".ScreenShare") ? String(ext.dropLast(".ScreenShare".count)) : ext
        UserDefaults(suiteName: "group." + appId)?.removeObject(forKey: "live")
        lock.lock(); finished = true; lock.unlock()
        socket?.cancel(with: .normalClosure, reason: nil)
        session?.invalidateAndCancel()
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video, let socket = socket else { return }
        let now = CACurrentMediaTime()
        lock.lock()
        if finished || sending || now - lastSent < minInterval { lock.unlock(); return }
        sending = true
        lastSent = now
        lock.unlock()

        guard let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { done(); return }
        var orientation = CGImagePropertyOrientation.up
        if let raw = CMGetAttachment(sampleBuffer, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil) as? NSNumber,
           let value = CGImagePropertyOrientation(rawValue: raw.uint32Value) {
            orientation = value
        }
        var image = CIImage(cvPixelBuffer: pixels).oriented(orientation)
        let extent = image.extent
        let scale = min(1, maxSide / max(extent.width, extent.height))
        if scale < 1 {
            image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        }
        let key = CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String)
        queue.async { [weak self] in
            guard let self = self else { return }
            let data: Data? = autoreleasepool {
                self.ciContext.jpegRepresentation(of: image, colorSpace: self.colorSpace, options: [key: self.quality])
            }
            guard let jpeg = data else { self.done(); return }
            socket.send(.data(jpeg)) { [weak self] error in
                self?.done()
                if error != nil { self?.stop("انقطع البث. تأكد من النت وجرّب مرة ثانية.") }
            }
        }
    }

    private func done() {
        lock.lock(); sending = false; lock.unlock()
    }
}
