/* =====================================================
   معالجة المايك
   المايك ← عزل ضوضاء (ذكاء اصطناعي) ← فلتر للهمهمة ← مستوى الصوت ← بوابة الصوت ← اللي يتكلم معك

   - البوابة (مثل "حساسية المايك" في الديسكورد) تقفل المايك إذا ما تتكلم،
     عشان صوت الكيبورد والمروحة ما يوصل.
   - المخرج مسار صوت ثابت ما يتغير حتى لو غيرت المايك أو الإعدادات،
     فالاتصال ما ينقطع.
   ===================================================== */
import { RnnoiseWorkletNode, GtcrnWorkletNode, loadRnnoise, loadGtcrn } from '/vendor/nsp/index.js';

const NSP = '/vendor/nsp/';

export class MicPipeline {
  constructor() {
    this.ctx = null;
    this.settings = {};
    this.raw = null;
    this.muted = false;
    this.open = false;         // البوابة مفتوحة (تتكلم)
    this.level = -100;         // مستوى الصوت الحالي بالديسيبل
    this.threshold = -50;
    this.floor = -70;          // مستوى الضوضاء اللي حولك (للوضع التلقائي)
    this.lastAbove = 0;
    this.wasm = {};
    this.modules = new Set();
    this.nsActive = 'off';     // نوع العزل اللي شغال فعلاً
    this.onChange = null;      // يتنادى لما يتغير (يتكلم / ما يتكلم)
    this.onTrack = null;       // يتنادى لو تغير مسار المخرج (نادر)
    this.onEnded = null;       // المايك انفصل
  }

  get stream() { return this.dest?.stream || null; }
  get track() { return this.dest?.stream.getAudioTracks()[0] || null; }
  get running() { return !!this.raw; }
  get speaking() { return this.open && !this.muted; }

  createContext(rate) {
    this.ctx?.close().catch(() => {});
    const opts = { latencyHint: 'interactive' };
    if (rate) opts.sampleRate = rate;
    this.ctx = new AudioContext(opts);
    this.modules.clear();
    this.dest = this.ctx.createMediaStreamDestination();
    this.inGain = this.ctx.createGain();
    this.gate = this.ctx.createGain();
    this.muteGain = this.ctx.createGain();
    this.monitor = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Float32Array(this.analyser.fftSize);
    this.gate.gain.value = 0;
    this.monitor.gain.value = 0;
    this.inGain.connect(this.analyser);
    this.inGain.connect(this.gate).connect(this.muteGain).connect(this.dest);
    this.muteGain.connect(this.monitor).connect(this.ctx.destination);
    this.setMuted(this.muted);
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 20);
  }

  async ensureContext() {
    if (!this.ctx) this.createContext(48000);
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
  }

  // يشغل المايك (أو يعيد تشغيله بإعدادات جديدة)
  async start(settings) {
    this.settings = { ...settings };
    await this.ensureContext();
    await this.rebuild();
  }

  async update(settings) {
    const prev = this.settings;
    this.settings = { ...settings };
    this.inGain && (this.inGain.gain.value = (this.settings.inVol ?? 100) / 100);
    const needsRestart = ['inDevice', 'ns', 'ec', 'agc'].some((k) => prev[k] !== this.settings[k]);
    if (this.running && needsRestart) await this.rebuild();
  }

  async rebuild() {
    const s = this.settings;
    this.disconnectChain();
    this.raw?.getTracks().forEach((t) => t.stop());
    this.raw = null;

    const audio = {
      echoCancellation: s.ec !== false,
      noiseSuppression: s.ns === 'browser',
      autoGainControl: s.agc !== false,
      channelCount: 1,
    };
    if (s.inDevice) audio.deviceId = { exact: s.inDevice };
    try {
      this.raw = await navigator.mediaDevices.getUserMedia({ audio });
    } catch (e) {
      if (!s.inDevice || !['OverconstrainedError', 'NotFoundError', 'NotReadableError'].includes(e.name)) throw e;
      delete audio.deviceId; // المايك المختار مو موجود، نرجع للافتراضي
      this.raw = await navigator.mediaDevices.getUserMedia({ audio });
    }
    this.raw.getAudioTracks()[0]?.addEventListener('ended', () => this.onEnded?.());

    try {
      this.src = this.ctx.createMediaStreamSource(this.raw);
    } catch {
      // فايرفوكس ما يقبل اختلاف معدل العينة بين المايك والمعالجة
      this.createContext(null);
      this.onTrack?.(this.track);
      this.src = this.ctx.createMediaStreamSource(this.raw);
    }

    let node = this.src;
    this.nsActive = s.ns === 'browser' ? 'browser' : 'off';
    this.nsError = null;
    if (s.ns === 'rnnoise' || s.ns === 'gtcrn') {
      try {
        this.dn = await this.denoiser(s.ns);
        node.connect(this.dn);
        node = this.dn;
        this.nsActive = s.ns;
      } catch (e) {
        console.warn('noise suppression failed', e);
        this.nsError = e;
      }
    }
    this.hp = this.ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 85;
    node.connect(this.hp);
    this.hp.connect(this.inGain);
    this.inGain.gain.value = (s.inVol ?? 100) / 100;
  }

  async denoiser(kind) {
    const ctx = this.ctx;
    if (kind === 'rnnoise') {
      if (ctx.sampleRate !== 48000) throw new Error('rnnoise needs 48kHz');
      this.wasm.rnnoise ??= await loadRnnoise({ url: NSP + 'rnnoise.wasm', simdUrl: NSP + 'rnnoise_simd.wasm' });
      if (!this.modules.has(kind)) { await ctx.audioWorklet.addModule(NSP + 'rnnoise/workletProcessor.js'); this.modules.add(kind); }
      return new RnnoiseWorkletNode(ctx, { wasmBinary: this.wasm.rnnoise, maxChannels: 1 });
    }
    if (ctx.sampleRate !== 48000 && ctx.sampleRate !== 16000) throw new Error('gtcrn needs 48kHz or 16kHz');
    this.wasm.gtcrn ??= await loadGtcrn({ url: NSP + 'gtcrn.wasm' });
    if (!this.modules.has(kind)) { await ctx.audioWorklet.addModule(NSP + 'gtcrn/workletProcessor.js'); this.modules.add(kind); }
    return new GtcrnWorkletNode(ctx, { wasmBinary: this.wasm.gtcrn, maxChannels: 1 });
  }

  disconnectChain() {
    for (const n of [this.src, this.dn, this.hp]) { try { n?.disconnect(); } catch { /* تجاهل */ } }
    try { this.dn?.destroy?.(); } catch { /* تجاهل */ }
    this.src = this.dn = this.hp = null;
  }

  stop() {
    this.disconnectChain();
    this.raw?.getTracks().forEach((t) => t.stop());
    this.raw = null;
    this.setMonitor(false);
    if (this.open) { this.open = false; this.gate.gain.value = 0; this.onChange?.(); }
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    this.muteGain.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.01);
    if (this.track) this.track.enabled = !m;
    this.onChange?.();
  }

  setMonitor(on) {
    if (this.monitor) this.monitor.gain.value = on ? 1 : 0;
  }

  // كل 20 ملي ثانية: نقيس الصوت ونقرر نفتح البوابة ولا نقفلها
  tick() {
    if (!this.analyser || !this.raw) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const db = 20 * Math.log10(Math.sqrt(sum / this.buf.length) + 1e-9);
    this.level = db;

    // نتتبع مستوى الضوضاء: ينزل بسرعة ويطلع ببطء (تقريباً 1 ديسيبل بالثانية)
    if (db < this.floor) this.floor = this.floor * 0.85 + db * 0.15;
    else this.floor += 0.02;
    this.floor = Math.min(-25, Math.max(-95, this.floor));

    const s = this.settings;
    this.threshold = s.gateAuto !== false ? Math.min(-30, Math.max(-62, this.floor + 14)) : (s.gateDb ?? -50);

    const now = performance.now();
    if (db > this.threshold) {
      this.lastAbove = now;
      if (!this.open) {
        this.open = true;
        this.gate.gain.setTargetAtTime(1, this.ctx.currentTime, 0.006);
        this.onChange?.();
      }
    } else if (this.open && now - this.lastAbove > 300) {
      this.open = false;
      this.gate.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.onChange?.();
    }
  }
}

/* ---- قياس صوت الناس الثانيين (مين يتكلم) ---- */
export class LevelWatcher {
  constructor(onChange) {
    this.onChange = onChange;
    this.items = new Map();
    this.timer = setInterval(() => this.tick(), 80);
  }
  ctx() {
    this.ac ??= new AudioContext();
    if (this.ac.state === 'suspended') this.ac.resume().catch(() => {});
    return this.ac;
  }
  watch(id, stream) {
    this.unwatch(id);
    try {
      const ctx = this.ctx();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      this.items.set(id, { src, an, buf: new Float32Array(an.fftSize), hold: 0, speaking: false });
    } catch { /* تجاهل */ }
  }
  unwatch(id) {
    const x = this.items.get(id);
    if (!x) return;
    try { x.src.disconnect(); } catch { /* تجاهل */ }
    this.items.delete(id);
    if (x.speaking) this.onChange(id, false);
  }
  speaking(id) { return !!this.items.get(id)?.speaking; }
  tick() {
    for (const [id, x] of this.items) {
      x.an.getFloatTimeDomainData(x.buf);
      let sum = 0;
      for (let i = 0; i < x.buf.length; i++) sum += x.buf[i] * x.buf[i];
      const rms = Math.sqrt(sum / x.buf.length);
      if (rms > 0.012) x.hold = 4; else if (x.hold > 0) x.hold--;
      const sp = x.hold > 0;
      if (sp !== x.speaking) { x.speaking = sp; this.onChange(id, sp); }
    }
  }
}
