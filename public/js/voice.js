/* =====================================================
   الصوت والبث بين الأعضاء (WebRTC)
   كل عضو في الروم الصوتي يتصل مباشرة مع الباقين.
   الإشارات (offer/answer/ice) تمر عن طريق السيرفر بس.
   نستخدم نمط "perfect negotiation" عشان لو الطرفين بدأوا الاتصال بنفس اللحظة.
   ===================================================== */

export const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // سيرفر TURN يجي من السيرفر (/api/ice) إذا كان مفعّل
];

const DEGRADATION = { detail: 'maintain-resolution', motion: 'maintain-framerate', balanced: 'balanced' };

export class VoiceSession {
  constructor({ mySid, micTrack, send, onAudio, onScreen, onPeerState, iceServers }) {
    this.mySid = mySid;
    this.iceServers = iceServers?.length ? iceServers : ICE_SERVERS;
    this.micTrack = micTrack;
    this.micStream = new MediaStream(micTrack ? [micTrack] : []);
    this.screenCarrier = new MediaStream(); // هوية ثابتة لمسارات البث
    this.screenTracks = { video: null, audio: null };
    this.cfg = null;
    this.send = send;
    this.onAudio = onAudio;       // (sid, stream)
    this.onScreen = onScreen;     // (sid, stream)
    this.onPeerState = onPeerState || (() => {});
    this.peers = new Map();
  }

  // طرف واحد بس يبدأ الاتصال (صاحب المعرف الأصغر)، والثاني يرد عليه.
  // لو الاثنين بدأوا بنفس اللحظة، أحياناً الاتصال يعلق.
  connect(sid) {
    if (this.mySid < sid) this.addPeer(sid);
  }

  addPeer(sid) {
    let p = this.peers.get(sid);
    if (p || sid === this.mySid) return p;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: 'max-bundle' });
    p = { sid, pc, polite: this.mySid > sid, makingOffer: false, ignoreOffer: false, remoteScreenId: null, sv: null, sa: null, mic: null, queue: Promise.resolve(),
      // الطرف اللي يستقبل الاتصال ما يرسل عروض لين يرد على أول عرض يجيه
      ready: this.mySid < sid };
    this.peers.set(sid, p);

    // لو الاتصال علق، نعيد محاولة ICE (من طرف واحد بس)
    p.watchdog = setInterval(() => {
      if (!this.peers.has(sid)) return clearInterval(p.watchdog);
      const st = pc.connectionState;
      if (st === 'connected') { p.stuck = 0; return; }
      if (pc.signalingState === 'stable' && ['new', 'connecting', 'failed', 'disconnected'].includes(st) && ++p.stuck >= 2 && !p.polite) {
        p.stuck = 0;
        pc.restartIce();
      }
    }, 4000);
    p.stuck = 0;

    // نقول له وش هوية مسار البث قبل أي عرض اتصال
    this.send(sid, { meta: { screen: this.screenCarrier.id } });

    pc.onnegotiationneeded = async () => {
      if (!p.ready) return; // المتصفح يعيدها لحاله بعد أول رد لو احتجناها
      try {
        p.makingOffer = true;
        await pc.setLocalDescription();
        this.send(sid, { desc: pc.localDescription });
      } catch (e) {
        console.warn('offer failed', e);
      } finally {
        p.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => { if (candidate) this.send(sid, { cand: candidate.toJSON() }); };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') pc.restartIce();
    };
    pc.onconnectionstatechange = () => this.onPeerState(sid, pc.connectionState);
    pc.onsignalingstatechange = () => {
      if (pc.signalingState === 'stable') this.tunePeer(p);
    };
    pc.ontrack = ({ track, streams }) => {
      const stream = streams[0] || new MediaStream([track]);
      if (track.kind === 'video' || stream.id === p.remoteScreenId) {
        p.remoteScreen = stream;
        this.onScreen(sid, stream);
      } else {
        p.remoteMic = stream;
        this.onAudio(sid, stream);
      }
    };

    if (this.micTrack) p.mic = pc.addTrack(this.micTrack, this.micStream);
    if (this.screenTracks.video) this.attachScreen(p);
    return p;
  }

  removePeer(sid) {
    const p = this.peers.get(sid);
    if (!p) return;
    this.peers.delete(sid);
    clearInterval(p.watchdog);
    p.pc.close();
  }

  onSignal(from, d) {
    if (!d || typeof d !== 'object') return;
    const p = this.peers.get(from) || this.addPeer(from);
    if (!p) return;
    // نعالج الإشارات بالترتيب، وحدة وحدة
    p.queue = p.queue.then(() => this.handleSignal(p, d));
  }

  async handleSignal(p, d) {
    const from = p.sid;
    if (d.meta) { p.remoteScreenId = d.meta.screen || null; return; }
    // المشاهد طلب جودة معينة لبثي (أو وقف الصورة)
    if (d.pref !== undefined) { p.pref = d.pref; this.tunePeer(p); return; }
    const pc = p.pc;
    if (pc.signalingState === 'closed') return;
    try {
      if (d.desc) {
        const collision = d.desc.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
        p.ignoreOffer = !p.polite && collision;
        if (p.ignoreOffer) return;
        await pc.setRemoteDescription(d.desc);
        if (d.desc.type === 'offer') {
          await pc.setLocalDescription();
          this.send(from, { desc: pc.localDescription });
          p.ready = true;
        }
      } else if (d.cand) {
        try { await pc.addIceCandidate(d.cand); } catch (e) { if (!p.ignoreOffer) console.warn('ice', e); }
      }
    } catch (e) {
      console.warn('signal failed', e);
    }
  }

  // نطلب من اللي يبث جودة معينة لنا: 1080 / 720 / 480، أو 0 = بدون صورة، أو null = تلقائي
  requestQuality(sid, height) {
    if (this.peers.has(sid)) this.send(sid, { pref: height });
  }

  // لو تغير مسار المايك (نادر) نبدله بدون ما نقطع الاتصال
  replaceMic(track) {
    this.micTrack = track;
    for (const p of this.peers.values()) p.mic?.replaceTrack(track).catch(() => {});
  }

  /* ---- بث الشاشة ---- */
  startScreen(stream, cfg) {
    this.cfg = cfg;
    this.screenTracks = { video: stream.getVideoTracks()[0] || null, audio: stream.getAudioTracks()[0] || null };
    for (const p of this.peers.values()) this.attachScreen(p);
  }

  attachScreen(p) {
    const { video, audio } = this.screenTracks;
    // أول مرة نضيف المسار (يحتاج تفاوض)، بعدها نبدل المسار بس (بدون تفاوض)
    if (p.sv) p.sv.replaceTrack(video).catch(() => {});
    else if (video) p.sv = p.pc.addTrack(video, this.screenCarrier);
    if (p.sa) p.sa.replaceTrack(audio).catch(() => {});
    else if (audio) p.sa = p.pc.addTrack(audio, this.screenCarrier);
    setTimeout(() => this.tunePeer(p), 500);
  }

  stopScreen() {
    this.screenTracks = { video: null, audio: null };
    for (const p of this.peers.values()) {
      p.sv?.replaceTrack(null).catch(() => {});
      p.sa?.replaceTrack(null).catch(() => {});
    }
  }

  setConfig(cfg) {
    this.cfg = cfg;
    for (const p of this.peers.values()) this.tunePeer(p);
  }

  async tunePeer(p) {
    if (p.pc.signalingState === 'closed') return;
    if (p.mic) await this.setParams(p.mic, (e) => { e.maxBitrate = 96000; e.priority = 'high'; e.networkPriority = 'high'; });
    if (p.sa && this.screenTracks.audio) await this.setParams(p.sa, (e) => { e.maxBitrate = 192000; });
    if (p.sv && this.screenTracks.video && this.cfg) {
      const cfg = this.cfg;
      // كل مشاهد له اتصال لحاله، فنقدر نعطي كل واحد الجودة اللي طلبها
      const srcH = this.screenTracks.video.getSettings().height || 1080;
      const want = p.pref;
      const scale = want > 0 && want < srcH ? srcH / want : 1;
      const bitrate = Math.max(0.6, cfg.bitrate / (scale * scale));
      const fps = want > 0 && want <= 480 ? Math.min(cfg.fps, 30) : cfg.fps;
      await this.setParams(p.sv, (e) => {
        e.active = want !== 0;
        e.maxBitrate = Math.round(bitrate * 1e6);
        e.maxFramerate = fps;
        e.scaleResolutionDownBy = scale;
        e.priority = 'high';
        e.networkPriority = 'high';
      }, DEGRADATION[cfg.mode]);
    }
  }

  async setParams(sender, edit, degradation) {
    try {
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) return; // التفاوض ما خلص، نرجع لها بعدين
      edit(params.encodings[0]);
      if (degradation) params.degradationPreference = degradation;
      try { await sender.setParameters(params); }
      catch {
        delete params.degradationPreference;
        await sender.setParameters(params);
      }
    } catch (e) {
      console.warn('setParameters', e);
    }
  }

  close() {
    for (const p of this.peers.values()) { clearInterval(p.watchdog); p.pc.close(); }
    this.peers.clear();
  }
}
