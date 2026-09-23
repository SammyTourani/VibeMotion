// The playhead, shared by the preview, transcript and timeline without going
// through React state (it changes 60 times a second). Subscribers update the
// DOM directly.

type Listener = () => void;

export interface TransportDriver {
  play(): void;
  pause(): void;
  seekSrc(t: number): void;
  seekOut(t: number): void;
  setRate(r: number): void;
}

class Transport {
  /** Source time, seconds. */
  src = 0;
  /** Output time (after cuts), seconds. */
  out = 0;
  playing = false;
  rate = 1;
  private listeners = new Set<Listener>();
  private driver: TransportDriver | null = null;

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  attach(driver: TransportDriver | null) {
    this.driver = driver;
  }

  update(src: number, out: number, playing = this.playing) {
    this.src = src;
    this.out = out;
    this.playing = playing;
    for (const l of this.listeners) l();
  }

  reset() {
    this.update(0, 0, false);
    this.rate = 1;
  }

  play() {
    this.driver?.play();
  }
  pause() {
    this.driver?.pause();
  }
  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }
  seekSrc(t: number) {
    this.driver?.seekSrc(t);
  }
  seekOut(t: number) {
    this.driver?.seekOut(t);
  }
  setRate(r: number) {
    this.rate = r;
    this.driver?.setRate(r);
  }
}

export const transport = new Transport();
