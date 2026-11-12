import Foundation
import Network

/// يسلّم رمز البث لجزء البث (ScreenShare) عن طريق اتصال محلي داخل الجوال (127.0.0.1).
/// احتياط لو المكان المشترك (App Group) ما يشتغل، مثل التثبيت عن طريق TrollStore.
/// يشتغل دقيقتين بس، ويسلّم الرمز مرة وحدة ثم يقفل.
final class LocalTokenServer {
    static let shared = LocalTokenServer()
    static let port: UInt16 = 48653
    static let served = Notification.Name("PlayWTWTokenServed")

    private var listener: NWListener?
    private var payload = Data()
    private var expiry: DispatchWorkItem?

    func serve(url: String, token: String) {
        stop()
        guard let json = try? JSONSerialization.data(withJSONObject: ["url": url, "token": token]),
              let port = NWEndpoint.Port(rawValue: Self.port) else { return }
        payload = json
        let params = NWParameters.tcp
        params.requiredInterfaceType = .loopback
        params.allowLocalEndpointReuse = true
        guard let l = try? NWListener(using: params, on: port) else { return }
        l.newConnectionHandler = { [weak self] conn in
            guard let self = self else { conn.cancel(); return }
            let data = self.payload
            conn.start(queue: .main)
            conn.send(content: data, completion: .contentProcessed { _ in conn.cancel() })
            self.stop() // مرة وحدة بس
            NotificationCenter.default.post(name: LocalTokenServer.served, object: nil)
        }
        l.start(queue: .main)
        listener = l
        let work = DispatchWorkItem { [weak self] in self?.stop() }
        expiry = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 120, execute: work)
    }

    func stop() {
        expiry?.cancel()
        expiry = nil
        listener?.cancel()
        listener = nil
        payload = Data()
    }
}
