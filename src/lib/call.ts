import { Room, RoomEvent, Track, type RemoteTrack, type RemoteTrackPublication, type RemoteParticipant } from 'livekit-client';
import { requireSupabase } from './supabase';

export class ToxityCall {
  readonly room = new Room({ adaptiveStream: true, dynacast: true });

  constructor(private mediaRoot: HTMLElement) {
    this.room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => this.attach(track));
    this.room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => track.detach().forEach((element) => element.remove()));
    this.room.on(RoomEvent.TrackPublished, (_publication: RemoteTrackPublication, _participant: RemoteParticipant) => undefined);
  }

  private attach(track: RemoteTrack) {
    const element = track.attach();
    element.dataset.source = track.source;
    element.autoplay = true;
    this.mediaRoot.appendChild(element);
  }

  async connect(groupId: string, displayName: string) {
    const client = requireSupabase();
    const { data: session } = await client.auth.getSession();
    if (!session.session) throw new Error('Faça login antes de entrar na call.');
    const { data, error } = await client.functions.invoke('livekit-token', {
      body: { room_name: `group-${groupId}`, participant_name: displayName },
    });
    if (error) throw new Error(error.message || 'Não foi possível autorizar a call.');
    const credentials = data as { server_url: string; participant_token: string };
    await this.room.connect(credentials.server_url, credentials.participant_token);
    await this.room.localParticipant.setMicrophoneEnabled(true);
  }

  async toggleMicrophone() { await this.room.localParticipant.setMicrophoneEnabled(!this.room.localParticipant.isMicrophoneEnabled); }
  async toggleCamera() {
    const enabled = !this.room.localParticipant.isCameraEnabled;
    await this.room.localParticipant.setCameraEnabled(enabled);
    this.refreshLocalPreview();
    return enabled;
  }
  async toggleScreen() {
    const enabled = !this.room.localParticipant.isScreenShareEnabled;
    await this.room.localParticipant.setScreenShareEnabled(enabled, {
      audio: false, contentHint: 'motion', resolution: { width: 1920, height: 1080, frameRate: 60 },
    });
    this.refreshLocalPreview();
    return enabled;
  }
  private refreshLocalPreview() {
    this.mediaRoot.querySelectorAll('[data-local="true"]').forEach((element) => element.remove());
    for (const source of [Track.Source.ScreenShare, Track.Source.Camera]) {
      const track = this.room.localParticipant.getTrackPublication(source)?.track;
      if (!track) continue;
      const element = track.attach();
      element.dataset.local = 'true';
      element.muted = true;
      element.autoplay = true;
      this.mediaRoot.appendChild(element);
    }
  }
  disconnect() { this.room.disconnect(true); this.mediaRoot.replaceChildren(); }
}
