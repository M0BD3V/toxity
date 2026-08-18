import {
  LocalAudioTrack,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from "livekit-client";
import type { DenoiseState } from "@shiguredo/rnnoise-wasm";
import { requireSupabase } from "./supabase";

export class ToxityCall {
  private static noiseEngine?: Promise<{
    frameSize: number;
    createDenoiseState: () => DenoiseState;
  }>;
  static preloadNoiseSuppression() {
    if (localStorage.getItem("toxity:noise-suppression") === "false")
      return Promise.resolve();
    this.noiseEngine ??= import("@shiguredo/rnnoise-wasm").then(({ Rnnoise }) =>
      Rnnoise.load(),
    );
    return this.noiseEngine.then(() => undefined);
  }
  readonly room = new Room({ adaptiveStream: true, dynacast: true });
  private microphoneContext?: AudioContext;
  private microphoneSource?: MediaStream;
  private rnnoiseState?: DenoiseState;
  private noiseProcessor?: ScriptProcessorNode;
  private remoteAudio = new Map<
    string,
    Array<{ context: AudioContext; gain: GainNode }>
  >();
  private watchingStreams = false;
  screenShareHasAudio = true;

  constructor(
    private mediaRoot: HTMLElement,
    private onStateChange?: (state: {
      remoteMedia: boolean;
      participants: number;
    }) => void,
  ) {
    this.room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        _publication: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        this.attach(track, participant);
        this.notifyState();
      },
    );
    this.room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach().forEach((element) => element.remove());
      this.notifyState();
    });
    this.room.on(
      RoomEvent.TrackPublished,
      (publication: RemoteTrackPublication) => {
        if (
          (publication.kind === Track.Kind.Audio &&
            publication.source !== Track.Source.ScreenShareAudio) ||
          (publication.source !== Track.Source.ScreenShare &&
            publication.source !== Track.Source.ScreenShareAudio) ||
          this.watchingStreams
        )
          void publication.setSubscribed(true);
      },
    );
    this.room.on(RoomEvent.ParticipantConnected, () => {
      this.playEventSound("join");
      this.notifyState();
    });
    this.room.on(RoomEvent.ParticipantDisconnected, () => {
      this.playEventSound("leave");
      this.notifyState();
    });
  }

  private attach(track: RemoteTrack, participant: RemoteParticipant) {
    const element = track.attach();
    element.dataset.source = track.source;
    element.dataset.participantId = participant.identity;
    element.autoplay = true;
    element.setAttribute("playsinline", "true");
    this.mediaRoot.appendChild(element);
    if (element instanceof HTMLMediaElement) {
      const context = new AudioContext();
      const source = context.createMediaElementSource(element);
      const gain = context.createGain();
      gain.gain.value = Math.min(
        2,
        Math.max(
          0,
          Number(
            localStorage.getItem(`toxity:volume:${participant.identity}`) ?? 1,
          ),
        ),
      );
      source.connect(gain).connect(context.destination);
      element.volume = 1;
      this.remoteAudio.set(participant.identity, [
        ...(this.remoteAudio.get(participant.identity) ?? []),
        { context, gain },
      ]);
      void element.play().catch(() => undefined);
    }
  }

  private playEventSound(kind: "join" | "leave") {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = kind === "join" ? 660 : 390;
    gain.gain.value = 0.08;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.14);
    window.setTimeout(() => void context.close(), 250);
  }

  setParticipantVolume(participantId: string, value: number) {
    const volume = Math.min(2, Math.max(0, value));
    localStorage.setItem(`toxity:volume:${participantId}`, String(volume));
    this.remoteAudio.get(participantId)?.forEach(({ gain }) => {
      gain.gain.value = volume;
    });
  }

  setWatchingStreams(watching: boolean) {
    this.watchingStreams = watching;
    this.room.remoteParticipants.forEach((participant) =>
      participant.trackPublications.forEach((publication) => {
        if (
          publication.source === Track.Source.ScreenShare ||
          publication.source === Track.Source.ScreenShareAudio
        )
          void publication.setSubscribed(watching);
      }),
    );
  }

  private notifyState() {
    window.setTimeout(
      () =>
        this.onStateChange?.({
          remoteMedia: Boolean(this.mediaRoot.querySelector("[data-source]")),
          participants:
            this.room.remoteParticipants.size +
            (this.room.state === "connected" ? 1 : 0),
        }),
      0,
    );
  }

  async connect(
    groupId: string,
    channelId: string,
    displayName: string,
    microphone = true,
  ) {
    const client = requireSupabase();
    const { data: session } = await client.auth.getSession();
    if (!session.session)
      throw new Error("Faça login antes de entrar na call.");
    const { data, error } = await client.functions.invoke("livekit-token", {
      body: {
        group_id: groupId,
        room_name: `voice-${channelId}`,
        participant_name: displayName,
      },
    });
    if (error)
      throw new Error(error.message || "Não foi possível autorizar a call.");
    const credentials = data as {
      server_url: string;
      participant_token: string;
    };
    await this.room.connect(
      credentials.server_url,
      credentials.participant_token,
      { autoSubscribe: false },
    );
    this.room.remoteParticipants.forEach((participant) =>
      participant.trackPublications.forEach((publication) => {
        if (
          (publication.kind === Track.Kind.Audio &&
            publication.source !== Track.Source.ScreenShareAudio) ||
          (publication.source !== Track.Source.ScreenShare &&
            publication.source !== Track.Source.ScreenShareAudio)
        )
          void publication.setSubscribed(true);
      }),
    );
    if (microphone) await this.enableProcessedMicrophone();
    this.notifyState();
  }

  private async enableProcessedMicrophone() {
    const suppression =
      localStorage.getItem("toxity:noise-suppression") !== "false";
    const strength =
      Number(localStorage.getItem("toxity:noise-strength") ?? 100) / 100;
    const gainValue =
      Number(localStorage.getItem("toxity:microphone-gain") ?? 100) / 100;
    const deviceId = localStorage.getItem("toxity:microphone") || undefined;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        noiseSuppression: suppression,
        echoCancellation: true,
        autoGainControl: false,
      },
    });
    const context = new AudioContext({ sampleRate: 48000 });
    const source = context.createMediaStreamSource(stream);
    const highpass = context.createBiquadFilter();
    const gain = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const output = context.createMediaStreamDestination();
    highpass.type = "highpass";
    highpass.frequency.value = suppression ? 70 + strength * 80 : 20;
    gain.gain.value = Math.min(3, Math.max(0, gainValue));
    compressor.threshold.value = -10;
    compressor.knee.value = 18;
    compressor.ratio.value = 10;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    let inputNode: AudioNode = highpass;
    source.connect(highpass);
    if (suppression) {
      try {
        const rnnoise =
          (await ToxityCall.noiseEngine) ??
          (await (ToxityCall.noiseEngine =
            import("@shiguredo/rnnoise-wasm").then(({ Rnnoise }) =>
              Rnnoise.load(),
            )));
        const state = rnnoise.createDenoiseState();
        const processor = context.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (event) => {
          const input = event.inputBuffer.getChannelData(0);
          const rendered = event.outputBuffer.getChannelData(0);
          rendered.set(input);
          for (
            let offset = 0;
            offset + rnnoise.frameSize <= input.length;
            offset += rnnoise.frameSize
          ) {
            const original = input.slice(offset, offset + rnnoise.frameSize);
            const frame = Float32Array.from(
              original,
              (sample) => sample * 32768,
            );
            state.processFrame(frame);
            for (let index = 0; index < frame.length; index += 1)
              rendered[offset + index] =
                original[index] * (1 - strength) +
                (frame[index] / 32768) * strength;
          }
        };
        highpass.connect(processor);
        inputNode = processor;
        this.rnnoiseState = state;
        this.noiseProcessor = processor;
      } catch {
        inputNode = highpass;
      }
    }
    inputNode.connect(gain).connect(compressor).connect(output);
    this.microphoneContext = context;
    this.microphoneSource = stream;
    const processed = new LocalAudioTrack(
      output.stream.getAudioTracks()[0],
      undefined,
      true,
      context,
    );
    await this.room.localParticipant.publishTrack(processed, {
      source: Track.Source.Microphone,
    });
  }

  async toggleMicrophone() {
    await this.room.localParticipant.setMicrophoneEnabled(
      !this.room.localParticipant.isMicrophoneEnabled,
    );
  }
  async switchAudioDevice(
    kind: "audioinput" | "audiooutput",
    deviceId: string,
  ) {
    await this.room.switchActiveDevice(kind, deviceId);
  }
  async toggleCamera() {
    const enabled = !this.room.localParticipant.isCameraEnabled;
    await this.room.localParticipant.setCameraEnabled(enabled);
    this.refreshLocalPreview();
    return enabled;
  }
  async toggleScreen() {
    const enabled = !this.room.localParticipant.isScreenShareEnabled;
    this.screenShareHasAudio = true;
    try {
      await this.room.localParticipant.setScreenShareEnabled(enabled, {
        audio: true,
        contentHint: "motion",
        resolution: { width: 1920, height: 1080, frameRate: 60 },
      });
    } catch (error) {
      if (!enabled) throw error;
      await this.room.localParticipant
        .setScreenShareEnabled(false)
        .catch(() => undefined);
      await this.room.localParticipant.setScreenShareEnabled(true, {
        audio: false,
        contentHint: "motion",
        resolution: { width: 1920, height: 1080, frameRate: 60 },
      });
      this.screenShareHasAudio = false;
    }
    this.refreshLocalPreview();
    return enabled;
  }
  private refreshLocalPreview() {
    this.mediaRoot
      .querySelectorAll('[data-local="true"]')
      .forEach((element) => element.remove());
    for (const source of [Track.Source.ScreenShare, Track.Source.Camera]) {
      const track =
        this.room.localParticipant.getTrackPublication(source)?.track;
      if (!track) continue;
      const element = track.attach();
      element.dataset.local = "true";
      element.muted = true;
      element.autoplay = true;
      this.mediaRoot.appendChild(element);
    }
  }
  disconnect() {
    this.room.disconnect(true);
    this.microphoneSource?.getTracks().forEach((track) => track.stop());
    void this.microphoneContext?.close();
    this.noiseProcessor?.disconnect();
    this.rnnoiseState?.destroy();
    this.remoteAudio.forEach((nodes) =>
      nodes.forEach(({ context }) => void context.close()),
    );
    this.remoteAudio.clear();
    this.mediaRoot.replaceChildren();
    this.onStateChange?.({ remoteMedia: false, participants: 0 });
  }
}
