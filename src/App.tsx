import {
  FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Download,
  Eye,
  FileText,
  Hash,
  Headphones,
  Image,
  LogOut,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  MoreHorizontal,
  Paperclip,
  PhoneCall,
  Plus,
  Pencil,
  Search,
  Settings,
  SmilePlus,
  Star,
  Trash2,
  UserPlus,
  Users,
  Video,
  Volume2,
  VolumeX,
  Send,
  X,
} from "lucide-react";
import { requireSupabase } from "./lib/supabase";
import {
  acceptFriendRequest,
  addFriendByNametag,
  addFriendToGroup,
  banGroupMember,
  clearCallPresence,
  configureChannel,
  createGroup,
  createGroupChannel,
  deleteGroup,
  getMyProfile,
  listCallPresence,
  listDirectMessages,
  listFriendships,
  listGroupChannels,
  listChannelMembers,
  listGroupMembers,
  listGroups,
  listMessages,
  listPresence,
  leaveGroup,
  renameGroup,
  sendDirectMessage,
  sendMessage,
  setGroupRole,
  setCallPresence,
  setUserPresence,
  subscribeToCallPresence,
  subscribeToDirectMessages,
  subscribeToGroupChannels,
  subscribeToMessages,
  subscribeToPresence,
  subscribeToSocial,
  updateMyProfile,
  uploadAttachment,
  uploadAvatar,
  type CallPresence,
  type ChannelAccessMode,
  type ChatMessage,
  type DirectMessage,
  type Friendship,
  type Group,
  type GroupChannel,
  type Profile,
  type UserPresence,
} from "./lib/social";
import { ToxityCall, type CallStream } from "./lib/call";
import toxitySymbol from "../assets/brand/svg/toxity-symbol.svg";

type Dialog =
  | "group"
  | "channel"
  | "channelSettings"
  | "friend"
  | "notifications"
  | "profile"
  | "invite"
  | "delete"
  | "leave"
  | "rename"
  | "stickers"
  | "publicProfile"
  | "audioSettings"
  | "memberPermissions"
  | null;
type Member = { role: string; profile: Profile };
type AudioKind = "audioinput" | "audiooutput";
type Sticker = { id: string; name: string; dataUrl: string };

function errorMessage(reason: unknown, fallback: string) {
  if (reason instanceof Error) return reason.message;
  if (
    reason &&
    typeof reason === "object" &&
    "message" in reason &&
    typeof reason.message === "string"
  )
    return reason.message;
  return fallback;
}

function initials(name = "Toxity") {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function fileSize(size: number | null) {
  if (!size) return "";
  return size < 1024 * 1024
    ? `${Math.ceil(size / 1024)} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function playCallSound(kind: "join" | "leave") {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
    gain.connect(context.destination);
    const frequencies = kind === "join" ? [440, 660] : [620, 390];
    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.09);
      oscillator.stop(context.currentTime + 0.14 + index * 0.09);
    });
    window.setTimeout(() => void context.close(), 450);
  } catch {
    /* O áudio de interface não deve impedir a chamada. */
  }
}

function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroupId, setActiveGroupId] = useState("");
  const [channels, setChannels] = useState<GroupChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [activeFriendId, setActiveFriendId] = useState("");
  const [callPresence, setCallPresenceState] = useState<CallPresence[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [memberMenuId, setMemberMenuId] = useState<string | null>(null);
  const [memberPermissionsTarget, setMemberPermissionsTarget] =
    useState<Member | null>(null);
  const [favoriteGroupIds, setFavoriteGroupIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("toxity:favorite-groups") ?? "[]");
    } catch {
      return [];
    }
  });
  const [notice, setNotice] = useState("");
  const [viewingImage, setViewingImage] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const [stickers, setStickers] = useState<Sticker[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("toxity:stickers") ?? "[]");
    } catch {
      return [];
    }
  });
  const [busy, setBusy] = useState(true);
  const [inCall, setInCall] = useState(false);
  const [joining, setJoining] = useState(false);
  const [callGroupId, setCallGroupId] = useState("");
  const [callChannelId, setCallChannelId] = useState("");
  const [callChannelName, setCallChannelName] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [selectedChannelSettings, setSelectedChannelSettings] =
    useState<GroupChannel | null>(null);
  const [presence, setPresence] = useState<UserPresence[]>([]);
  const [sharing, setSharing] = useState(false);
  const [camera, setCamera] = useState(false);
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const [remoteMedia, setRemoteMedia] = useState(false);
  const [callParticipants, setCallParticipants] = useState(0);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState<string[]>([]);
  const [callStreams, setCallStreams] = useState<CallStream[]>([]);
  const [selectedStreamIds, setSelectedStreamIds] = useState<string[]>([]);
  const [fullscreenControls, setFullscreenControls] = useState(false);
  const [screenSources, setScreenSources] = useState<ToxityScreenSource[]>([]);
  const [audioPicker, setAudioPicker] = useState<AudioKind | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState(
    () => localStorage.getItem("toxity:microphone") ?? "",
  );
  const [selectedOutput, setSelectedOutput] = useState(
    () => localStorage.getItem("toxity:audio-output") ?? "",
  );
  const mediaRef = useRef<HTMLDivElement>(null);
  const callCardRef = useRef<HTMLDivElement>(null);
  const fullscreenTimerRef = useRef<number | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const callRef = useRef<ToxityCall | null>(null);
  const activeGroup = useMemo(
    () => groups.find((group) => group.id === activeGroupId),
    [groups, activeGroupId],
  );
  const orderedGroups = useMemo(
    () =>
      [...groups].sort(
        (a, b) =>
          Number(favoriteGroupIds.includes(b.id)) -
          Number(favoriteGroupIds.includes(a.id)),
      ),
    [groups, favoriteGroupIds],
  );

  function toggleFavoriteGroup(groupId: string) {
    setFavoriteGroupIds((current) => {
      const next = current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId];
      localStorage.setItem("toxity:favorite-groups", JSON.stringify(next));
      return next;
    });
    setGroupMenuOpen(false);
  }
  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId),
    [channels, activeChannelId],
  );
  const callGroup = useMemo(
    () => groups.find((group) => group.id === callGroupId),
    [groups, callGroupId],
  );
  const pendingRequests = useMemo(
    () =>
      friendships.filter(
        (item) =>
          item.status === "pending" && item.addressee_id === profile?.id,
      ),
    [friendships, profile?.id],
  );
  const contacts = useMemo(
    () =>
      friendships
        .filter((item) => item.status === "accepted")
        .map((item) =>
          item.requester_id === profile?.id ? item.addressee : item.requester,
        )
        .filter((friend): friend is Profile => Boolean(friend)),
    [friendships, profile?.id],
  );
  const activeFriend = useMemo(
    () => contacts.find((friend) => friend.id === activeFriendId),
    [contacts, activeFriendId],
  );
  const myGroupRole = members.find(
    (member) => member.profile.id === profile?.id,
  )?.role;
  const broadcasters = callPresence.filter(
    (item) =>
      item.channel_id === activeChannelId &&
      item.sharing &&
      item.user_id !== profile?.id,
  );

  const loadSidebar = useCallback(async () => {
    const [myProfile, myGroups, friends] = await Promise.all([
      getMyProfile(),
      listGroups(),
      listFriendships(),
    ]);
    setProfile(myProfile);
    setGroups(myGroups);
    setFriendships(friends);
    setActiveGroupId((current) => current || myGroups[0]?.id || "");
  }, []);

  const loadGroupData = useCallback(async (groupId: string) => {
    if (!groupId) {
      setChannels([]);
      setMembers([]);
      return;
    }
    const [nextChannels, nextMembers] = await Promise.all([
      listGroupChannels(groupId),
      listGroupMembers(groupId),
    ]);
    setChannels(nextChannels);
    setMembers(nextMembers);
    setActiveChannelId((current) =>
      nextChannels.some((channel) => channel.id === current)
        ? current
        : (nextChannels.find((channel) => channel.type === "text")?.id ??
          nextChannels[0]?.id ??
          ""),
    );
  }, []);

  const loadConversation = useCallback(async (channelId: string) => {
    if (!channelId) {
      setMessages([]);
      return;
    }
    setMessages(await listMessages(channelId));
  }, []);

  const loadDirectConversation = useCallback(async (friendId: string) => {
    if (!friendId) {
      setDirectMessages([]);
      return;
    }
    setDirectMessages(await listDirectMessages(friendId));
  }, []);

  const loadCallActivity = useCallback(
    async (groupId: string, channelId?: string) => {
      if (!groupId) {
        setCallPresenceState([]);
        return;
      }
      setCallPresenceState(await listCallPresence(groupId, channelId));
    },
    [],
  );

  useEffect(() => {
    void loadSidebar()
      .catch((error) => setNotice(error.message))
      .finally(() => setBusy(false));
  }, [loadSidebar]);

  useEffect(() => subscribeToSocial(() => void loadSidebar()), [loadSidebar]);

  useEffect(() => {
    void loadGroupData(activeGroupId).catch((error) =>
      setNotice(errorMessage(error, "Falha ao carregar canais.")),
    );
    if (!activeGroupId) return;
    return subscribeToGroupChannels(
      activeGroupId,
      () => void loadGroupData(activeGroupId),
    );
  }, [activeGroupId, loadGroupData]);

  useEffect(() => {
    if (!activeChannel) {
      setMessages([]);
      return;
    }
    void loadConversation(activeChannel.id).catch((error) =>
      setNotice(error.message),
    );
    return subscribeToMessages(
      activeChannel.id,
      () => void loadConversation(activeChannel.id),
    );
  }, [activeChannel, loadConversation]);

  useEffect(() => {
    if (activeChannel?.type === "voice")
      void ToxityCall.preloadNoiseSuppression();
  }, [activeChannel?.id, activeChannel?.type]);

  useEffect(() => {
    mediaRef.current
      ?.querySelectorAll<HTMLVideoElement>("video[data-stream-id]")
      .forEach((video) =>
        video.classList.toggle(
          "hidden-stream",
          selectedStreamIds.length > 0 &&
            !selectedStreamIds.includes(video.dataset.streamId ?? ""),
        ),
      );
  }, [callStreams, selectedStreamIds]);

  useEffect(() => {
    void loadDirectConversation(activeFriendId).catch((error) =>
      setNotice(errorMessage(error, "Falha ao carregar conversa.")),
    );
    if (!activeFriendId) return;
    return subscribeToDirectMessages(
      () => void loadDirectConversation(activeFriendId),
    );
  }, [activeFriendId, loadDirectConversation]);

  useEffect(() => {
    void loadCallActivity(activeGroupId);
    if (!activeGroupId) return;
    return subscribeToCallPresence(
      activeGroupId,
      () => void loadCallActivity(activeGroupId),
    );
  }, [activeGroupId, loadCallActivity]);

  useEffect(() => {
    const refresh = () =>
      void listPresence()
        .then(setPresence)
        .catch(() => undefined);
    refresh();
    return subscribeToPresence(refresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const heartbeat = async () => {
      const activity = (await window.toxity?.getActivity?.()) ?? {
        focused: document.hasFocus(),
        visible: !document.hidden,
        idleSeconds: 0,
      };
      if (cancelled) return;
      const state: UserPresence["state"] =
        activity.idleSeconds >= 300
          ? "away"
          : activity.focused && activity.visible
            ? "online"
            : "background";
      await setUserPresence(
        state,
        activity.focused,
        activity.idleSeconds,
      ).catch(() => undefined);
    };
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!inCall || !callGroupId || !callChannelId) return;
    const heartbeat = window.setInterval(
      () => void setCallPresence(callGroupId, callChannelId, sharing),
      10_000,
    );
    return () => window.clearInterval(heartbeat);
  }, [inCall, callGroupId, callChannelId, sharing]);

  useEffect(() => () => callRef.current?.disconnect(), []);

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if ((!body && !pendingFile) || (!activeFriendId && !activeChannel)) return;
    const file = pendingFile;
    setDraft("");
    setPendingFile(null);
    setUploading(true);
    try {
      const attachment = file ? await uploadAttachment(file) : undefined;
      if (activeFriendId)
        await sendDirectMessage(activeFriendId, body, attachment);
      else if (activeChannel)
        await sendMessage(activeGroupId, activeChannel.id, body, attachment);
    } catch (error) {
      setDraft(body);
      setPendingFile(file);
      setNotice(errorMessage(error, "Não foi possível enviar."));
    } finally {
      setUploading(false);
    }
  }

  async function sendSticker(sticker: Sticker) {
    if (!activeFriendId && !activeChannel) return;
    setUploading(true);
    try {
      const response = await fetch(sticker.dataUrl);
      const file = new File([await response.blob()], `${sticker.name}.png`, {
        type: "image/png",
      });
      const attachment = await uploadAttachment(file);
      if (activeFriendId)
        await sendDirectMessage(activeFriendId, "", attachment);
      else if (activeChannel)
        await sendMessage(activeGroupId, activeChannel.id, "", attachment);
      setDialog(null);
    } catch (error) {
      setNotice(errorMessage(error, "Não foi possível enviar a figurinha."));
    } finally {
      setUploading(false);
    }
  }

  function saveStickers(next: Sticker[]) {
    setStickers(next);
    localStorage.setItem("toxity:stickers", JSON.stringify(next));
  }

  async function joinCall(microphone = true) {
    if (joining || inCall) return;
    if (
      !activeGroupId ||
      activeChannel?.type !== "voice" ||
      !profile ||
      !mediaRef.current
    ) {
      setNotice("Selecione um canal de chamada primeiro.");
      return;
    }
    setJoining(true);
    try {
      if (!callRef.current)
        callRef.current = new ToxityCall(mediaRef.current, (state) => {
          setRemoteMedia(state.remoteMedia);
          setCallParticipants(state.participants);
          setActiveSpeakerIds(state.activeSpeakerIds);
          setCallStreams(state.streams);
          setSelectedStreamIds((current) =>
            current.filter((id) =>
              state.streams.some((stream) => stream.id === id),
            ),
          );
        });
      if (!inCall)
        await callRef.current.connect(
          activeGroupId,
          activeChannel.id,
          profile.display_name,
          microphone,
        );
      callRef.current.setWatchingStreams(!microphone);
      if (selectedMic)
        await callRef.current.switchAudioDevice("audioinput", selectedMic);
      if (selectedOutput)
        await callRef.current.switchAudioDevice("audiooutput", selectedOutput);
      await setCallPresence(activeGroupId, activeChannel.id, sharing);
      if (!inCall) playCallSound("join");
      setCallGroupId(activeGroupId);
      setCallChannelId(activeChannel.id);
      setCallChannelName(activeChannel.name);
      setInCall(true);
      setMicrophoneMuted(!microphone);
      setDeafened(false);
      setTheaterMode(true);
      setNotice(
        microphone ? "Você entrou na chamada." : "Assistindo à transmissão.",
      );
    } catch (error) {
      setNotice(errorMessage(error, "Falha ao conectar à call."));
    } finally {
      setJoining(false);
    }
  }

  async function toggleScreen() {
    await joinCall(true);
    if (!callRef.current) return;
    if (!sharing && window.toxity?.listScreenSources) {
      try {
        const sources = await window.toxity.listScreenSources();
        if (!sources.length)
          throw new Error("Nenhuma tela ou janela disponível.");
        setScreenSources(sources);
        return;
      } catch (error) {
        setNotice(errorMessage(error, "Não foi possível listar as telas."));
        return;
      }
    }
    try {
      const next = await callRef.current.toggleScreen();
      setSharing(next);
      if (next && !callRef.current.screenShareHasAudio)
        setNotice(
          "Tela compartilhada. Esta fonte não permitiu áudio, então a transmissão continuou somente com vídeo.",
        );
      await setCallPresence(
        callGroupId || activeGroupId,
        callChannelId || activeChannelId,
        next,
      );
    } catch (error) {
      setNotice(errorMessage(error, "Compartilhamento cancelado."));
    }
  }

  async function startScreenShare(sourceId: string) {
    try {
      await window.toxity?.selectScreenSource(sourceId);
      setScreenSources([]);
      if (callRef.current) {
        const next = await callRef.current.toggleScreen();
        setSharing(next);
        if (next && !callRef.current.screenShareHasAudio)
          setNotice(
            "Tela compartilhada sem áudio porque esta fonte recusou a captura sonora.",
          );
        await setCallPresence(
          callGroupId || activeGroupId,
          callChannelId || activeChannelId,
          next,
        );
      }
    } catch (error) {
      setNotice(
        errorMessage(error, "Não foi possível compartilhar esta tela."),
      );
    }
  }

  function leaveCall() {
    if (inCall) playCallSound("leave");
    if (callGroupId) void clearCallPresence(callGroupId);
    callRef.current?.disconnect();
    callRef.current = null;
    setInCall(false);
    setSharing(false);
    setCamera(false);
    setMicrophoneMuted(false);
    setDeafened(false);
    setTheaterMode(false);
    setRemoteMedia(false);
    setCallParticipants(0);
    setCallGroupId("");
    setCallChannelId("");
    setCallChannelName("");
  }

  async function openFullscreen() {
    try {
      await callCardRef.current?.requestFullscreen();
    } catch (error) {
      setNotice(errorMessage(error, "Não foi possível abrir em tela cheia."));
    }
  }

  function chooseStreams(ids: string[]) {
    setSelectedStreamIds(ids);
    mediaRef.current
      ?.querySelectorAll<HTMLVideoElement>("video[data-stream-id]")
      .forEach((video) => {
        video.classList.toggle(
          "hidden-stream",
          ids.length > 0 && !ids.includes(video.dataset.streamId ?? ""),
        );
        video.classList.remove("focused-stream");
      });
  }

  function revealFullscreenControls() {
    setFullscreenControls(true);
    if (fullscreenTimerRef.current)
      window.clearTimeout(fullscreenTimerRef.current);
    fullscreenTimerRef.current = window.setTimeout(
      () => setFullscreenControls(false),
      2200,
    );
  }

  async function openAudioPicker(kind: AudioKind) {
    try {
      if (kind === "audioinput")
        await navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) =>
            stream.getTracks().forEach((track) => track.stop()),
          );
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === kind,
      );
      setAudioDevices(devices);
      setAudioPicker(kind);
    } catch (error) {
      setNotice(
        errorMessage(
          error,
          "Não foi possível listar os dispositivos de áudio.",
        ),
      );
    }
  }

  async function chooseAudioDevice(kind: AudioKind, deviceId: string) {
    if (kind === "audioinput") {
      setSelectedMic(deviceId);
      localStorage.setItem("toxity:microphone", deviceId);
    } else {
      setSelectedOutput(deviceId);
      localStorage.setItem("toxity:audio-output", deviceId);
    }
    if (callRef.current && inCall)
      await callRef.current.switchAudioDevice(kind, deviceId);
    setAudioPicker(null);
    setNotice(
      kind === "audioinput"
        ? "Microfone selecionado."
        : "Saída de áudio selecionada.",
    );
  }

  function selectChannel(channel: GroupChannel) {
    setActiveFriendId("");
    setActiveChannelId(channel.id);
    setPendingFile(null);
  }

  if (busy)
    return (
      <div className="app-loading">
        <img src={toxitySymbol} alt="" />
        <span>Entrando na sua sintonia…</span>
      </div>
    );

  return (
    <div className="app-shell">
      <nav className="server-rail" aria-label="Grupos">
        <button
          className={`brand-button ${!activeGroupId ? "active" : ""}`}
          title="Início Toxity"
          onClick={() => {
            setActiveGroupId("");
            setActiveChannelId("");
            setActiveFriendId("");
          }}
        >
          <img src={toxitySymbol} alt="Toxity" />
        </button>
        <span className="rail-divider" />
        {orderedGroups.map((group, index) => (
          <button
            key={group.id}
            onClick={() => {
              setActiveGroupId(group.id);
              setActiveFriendId("");
            }}
            title={group.name}
            className={`server-button server-${index % 3} ${group.id === activeGroupId && !activeFriendId ? "active" : ""}`}
          >
            {initials(group.name)}
            {favoriteGroupIds.includes(group.id) && (
              <Star className="favorite-mark" size={10} fill="currentColor" />
            )}
          </button>
        ))}
        <button
          className="server-button add-server"
          title="Criar grupo"
          onClick={() => setDialog("group")}
        >
          <Plus size={22} />
        </button>
      </nav>

      <aside className="channel-panel">
        <div className="server-title">
          <span>
            {activeFriend
              ? "Conversas diretas"
              : (activeGroup?.name ?? "Sua Toxity")}
          </span>
          {activeGroup && !activeFriend && (
            <div className="group-menu-wrap">
              <button
                title="Opções do grupo"
                onClick={() => setGroupMenuOpen((open) => !open)}
              >
                <MoreHorizontal size={18} />
              </button>
              {groupMenuOpen && (
                <div className="group-menu">
                  {activeGroup.owner_id === profile?.id && (
                    <button
                      onClick={() => {
                        setDialog("rename");
                        setGroupMenuOpen(false);
                      }}
                    >
                      <Pencil size={14} /> Renomear grupo
                    </button>
                  )}
                  <button onClick={() => toggleFavoriteGroup(activeGroup.id)}>
                    <Star size={14} />
                    {favoriteGroupIds.includes(activeGroup.id)
                      ? "Desfavoritar"
                      : "Favoritar"}
                  </button>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(activeGroup.id);
                      setNotice("Identificação do grupo copiada.");
                      setGroupMenuOpen(false);
                    }}
                  >
                    <Copy size={14} /> Copiar identificação
                  </button>
                  {activeGroup.owner_id === profile?.id ? (
                    <button
                      className="danger"
                      onClick={() => {
                        setDialog("delete");
                        setGroupMenuOpen(false);
                      }}
                    >
                      <Trash2 size={14} /> Excluir grupo
                    </button>
                  ) : (
                    <button
                      className="danger"
                      onClick={() => {
                        setDialog("leave");
                        setGroupMenuOpen(false);
                      }}
                    >
                      <LogOut size={14} /> Sair do grupo
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="channel-scroll">
          {!groups.length && (
            <EmptyGroups onCreate={() => setDialog("group")} />
          )}
          {activeGroup && (
            <>
              <section className="group-intro">
                <span>ESPAÇO ATIVO</span>
                <strong>{activeGroup.name}</strong>
                <p>
                  {activeGroup.description ||
                    "Converse e compartilhe com seu grupo."}
                </p>
              </section>
              <section className="channel-group">
                <header>
                  <span>CANAIS DE TEXTO</span>
                  {activeGroup.owner_id === profile?.id && (
                    <button
                      onClick={() => setDialog("channel")}
                      title="Criar canal"
                    >
                      <Plus size={15} />
                    </button>
                  )}
                </header>
                {channels
                  .filter((channel) => channel.type === "text")
                  .map((channel) => (
                    <div className="channel-line" key={channel.id}>
                      <button
                        className={
                          !activeFriendId && activeChannelId === channel.id
                            ? "active"
                            : ""
                        }
                        onClick={() => selectChannel(channel)}
                      >
                        <Hash size={18} />
                        <span>{channel.name}</span>
                      </button>
                      {["owner", "admin"].includes(myGroupRole ?? "") && (
                        <button
                          className="channel-settings-button"
                          title="Permissões do canal"
                          onClick={() => {
                            setSelectedChannelSettings(channel);
                            setDialog("channelSettings");
                          }}
                        >
                          <Settings size={14} />
                        </button>
                      )}
                    </div>
                  ))}
              </section>
              <section className="channel-group">
                <header>
                  <span>CANAIS DE CHAMADA</span>
                  {activeGroup.owner_id === profile?.id && (
                    <button
                      onClick={() => setDialog("channel")}
                      title="Criar canal"
                    >
                      <Plus size={15} />
                    </button>
                  )}
                </header>
                {channels
                  .filter((channel) => channel.type === "voice")
                  .map((channel) => {
                    const present = callPresence.filter(
                      (item) => item.channel_id === channel.id,
                    );
                    return (
                      <div className="voice-channel-block" key={channel.id}>
                        <button
                          className={
                            !activeFriendId && activeChannelId === channel.id
                              ? "active"
                              : ""
                          }
                          onClick={() => selectChannel(channel)}
                        >
                          <Volume2 size={18} />
                          <span>{channel.name}</span>
                          {present.some((item) => item.sharing) && (
                            <small className="live-label">AO VIVO</small>
                          )}
                        </button>
                        {["owner", "admin"].includes(myGroupRole ?? "") && (
                          <button
                            className="channel-settings-button"
                            title="Permissões do canal"
                            onClick={() => {
                              setSelectedChannelSettings(channel);
                              setDialog("channelSettings");
                            }}
                          >
                            <Settings size={14} />
                          </button>
                        )}
                        {present.length > 0 && (
                          <div className="voice-presence">
                            {present.map((presence) => (
                              <button
                                className="voice-user"
                                key={presence.user_id}
                                onClick={() => {
                                  if (presence.profiles) {
                                    setSelectedProfile(presence.profiles);
                                    setDialog("publicProfile");
                                  }
                                }}
                              >
                                <Avatar
                                  profile={presence.profiles}
                                  small
                                  speaking={activeSpeakerIds.includes(
                                    presence.user_id,
                                  )}
                                />
                                <div>
                                  <strong>
                                    {presence.profiles?.display_name}
                                  </strong>
                                  <small>
                                    {presence.sharing
                                      ? "Em transmissão"
                                      : "Na chamada"}
                                  </small>
                                  {inCall &&
                                    presence.user_id !== profile?.id && (
                                      <label
                                        className="participant-volume"
                                        onClick={(event) =>
                                          event.stopPropagation()
                                        }
                                      >
                                        Volume{" "}
                                        {Math.round(
                                          Number(
                                            localStorage.getItem(
                                              `toxity:volume:${presence.user_id}`,
                                            ) ?? 1,
                                          ) * 100,
                                        )}
                                        %
                                        <input
                                          type="range"
                                          min="0"
                                          max="200"
                                          defaultValue={
                                            Number(
                                              localStorage.getItem(
                                                `toxity:volume:${presence.user_id}`,
                                              ) ?? 1,
                                            ) * 100
                                          }
                                          onChange={(event) =>
                                            callRef.current?.setParticipantVolume(
                                              presence.user_id,
                                              Number(event.target.value) / 100,
                                            )
                                          }
                                        />
                                      </label>
                                    )}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </section>
            </>
          )}
          <section className="channel-group direct-list">
            <header>
              <span>CONVERSAS DIRETAS</span>
            </header>
            {contacts.map((friend) => (
              <button
                key={friend.id}
                className={activeFriendId === friend.id ? "active" : ""}
                onClick={() => setActiveFriendId(friend.id)}
              >
                <Avatar profile={friend} small />
                <span>{friend.display_name}</span>
              </button>
            ))}
            {!contacts.length && <p>Seus amigos aparecerão aqui.</p>}
          </section>
        </div>
        {inCall && (
          <div className="call-status">
            <button
              className="call-return"
              onClick={() => {
                setActiveGroupId(callGroupId);
                setActiveChannelId(callChannelId);
                setActiveFriendId("");
              }}
            >
              <strong>Voz conectada</strong>
              <small>
                {callGroup?.name} · {callChannelName}
              </small>
            </button>
            <button onClick={leaveCall} aria-label="Desconectar">
              <PhoneCall size={17} />
            </button>
          </div>
        )}
        <div className="user-bar">
          <Avatar
            profile={profile}
            status={
              presence.find((item) => item.user_id === profile?.id)?.state ??
              "offline"
            }
          />
          <div className="user-copy">
            <strong>{profile?.display_name}</strong>
            <small>@{profile?.nametag}</small>
          </div>
          <button
            className={microphoneMuted ? "control-muted" : ""}
            title={
              inCall
                ? microphoneMuted
                  ? "Ativar microfone"
                  : "Mutar microfone"
                : "Escolher microfone"
            }
            onClick={async () => {
              if (!inCall) return void openAudioPicker("audioinput");
              if (callRef.current)
                setMicrophoneMuted(await callRef.current.toggleMicrophone());
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              void openAudioPicker("audioinput");
            }}
          >
            {microphoneMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            className={deafened ? "control-muted" : ""}
            title={
              inCall
                ? deafened
                  ? "Voltar a ouvir"
                  : "Não ouvir ninguém"
                : "Escolher saída de áudio"
            }
            onClick={() => {
              if (!inCall) return void openAudioPicker("audiooutput");
              const next = !deafened;
              callRef.current?.setDeafened(next);
              setDeafened(next);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              void openAudioPicker("audiooutput");
            }}
          >
            {deafened ? <VolumeX size={18} /> : <Headphones size={18} />}
          </button>
          <button title="Editar perfil" onClick={() => setDialog("profile")}>
            <Settings size={18} />
          </button>
        </div>
      </aside>

      <main className="content-panel">
        <header className="topbar">
          <button
            className={`channel-heading ${activeFriend ? "profile-heading" : ""}`}
            onClick={() => {
              if (activeFriend) {
                setSelectedProfile(activeFriend);
                setDialog("publicProfile");
              }
            }}
          >
            {activeFriend ? (
              <Users size={21} />
            ) : activeChannel?.type === "voice" ? (
              <Volume2 size={21} />
            ) : (
              <Hash size={21} />
            )}
            <strong>
              {activeFriend
                ? activeFriend.display_name
                : (activeChannel?.name ?? "início")}
            </strong>
            <span>
              {activeFriend
                ? `@${activeFriend.nametag}`
                : activeChannel?.type === "voice"
                  ? "Canal de chamada"
                  : activeGroup?.description || "Crie um grupo para começar."}
            </span>
          </button>
          <div className="top-actions">
            <button
              className="notification-button"
              title="Notificações"
              onClick={() => setDialog("notifications")}
            >
              <Bell size={19} />
              {pendingRequests.length > 0 && (
                <span>{pendingRequests.length}</span>
              )}
            </button>
            <button
              title="Amigos e adicionar por nametag"
              onClick={() => setDialog("friend")}
            >
              <Users size={19} />
            </button>
            <label className="search">
              <Search size={16} />
              <input placeholder="Buscar" />
            </label>
            <button title="Ajuda">
              <CircleHelp size={19} />
            </button>
          </div>
        </header>
        <section className="chat-area">
          <div className="welcome-block">
            <span className="welcome-icon">
              {activeFriend ? (
                <Users size={22} />
              ) : activeChannel?.type === "voice" ? (
                <Volume2 size={22} />
              ) : (
                <Hash size={22} />
              )}
            </span>
            <h1>
              {activeFriend
                ? `Conversa com ${activeFriend.display_name}`
                : activeChannel?.type === "voice"
                  ? activeChannel.name
                  : activeChannel
                    ? `#${activeChannel.name}`
                    : "Seu espaço começa aqui"}
            </h1>
            <p>
              {activeFriend
                ? "Este é o início da conversa particular entre vocês."
                : activeChannel?.type === "voice"
                  ? "Entre na chamada para conversar. O compartilhamento de tela fica disponível somente aqui."
                  : activeChannel
                    ? "Início deste canal de texto."
                    : "Crie seu primeiro grupo no botão + abaixo."}
            </p>
          </div>
          <div className="message-list">
            {(activeFriend ? directMessages : messages).map((message) => {
              const senderId =
                "author_id" in message ? message.author_id : message.sender_id;
              const author =
                message.profiles?.display_name ??
                (senderId === profile?.id
                  ? profile.display_name
                  : (activeFriend?.display_name ?? "Pessoa Toxity"));
              return (
                <article className="message" key={message.id}>
                  <Avatar
                    profile={{
                      display_name: author,
                      avatar_url: message.profiles?.avatar_url ?? null,
                    }}
                  />
                  <div>
                    <div className="message-meta">
                      <strong>{author}</strong>
                      <time>
                        {new Date(message.created_at).toLocaleString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    {message.body && <p>{message.body}</p>}
                    {message.attachment_url &&
                      (message.attachment_mime?.startsWith("image/") ? (
                        <button
                          className="message-image"
                          onClick={() =>
                            setViewingImage({
                              url: message.attachment_url!,
                              name: message.attachment_name ?? "Imagem enviada",
                            })
                          }
                        >
                          <img
                            src={message.attachment_url}
                            alt={message.attachment_name ?? "Imagem enviada"}
                          />
                        </button>
                      ) : (
                        <a
                          className="message-file"
                          href={message.attachment_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <FileText size={24} />
                          <span>
                            <strong>{message.attachment_name}</strong>
                            <small>{fileSize(message.attachment_size)}</small>
                          </span>
                          <Download size={17} />
                        </a>
                      ))}
                  </div>
                </article>
              );
            })}
            {(activeFriend
              ? !directMessages.length
              : activeGroup && !messages.length) && (
              <p className="empty-copy">
                Nenhuma mensagem ainda. Quebre o silêncio.
              </p>
            )}
          </div>
          {(activeFriend || activeChannel) && (
            <>
              {pendingFile && (
                <div className="pending-attachment">
                  <span>
                    {pendingFile.type.startsWith("image/") ? (
                      <Image size={16} />
                    ) : (
                      <FileText size={16} />
                    )}
                    <strong>{pendingFile.name}</strong>
                    <small>{fileSize(pendingFile.size)}</small>
                  </span>
                  <button onClick={() => setPendingFile(null)}>
                    <X size={15} />
                  </button>
                </div>
              )}
              <form className="composer" onSubmit={submitMessage}>
                <button
                  type="button"
                  title="Adicionar imagem"
                  onClick={() => imageInputRef.current?.click()}
                >
                  <Image size={19} />
                </button>
                <button
                  type="button"
                  title="Anexar arquivo"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip size={19} />
                </button>
                <button
                  type="button"
                  title="Figurinhas"
                  onClick={() => setDialog("stickers")}
                >
                  <SmilePlus size={19} />
                </button>
                <input
                  ref={imageInputRef}
                  className="hidden-file-input"
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setPendingFile(event.target.files?.[0] ?? null)
                  }
                />
                <input
                  ref={fileInputRef}
                  className="hidden-file-input"
                  type="file"
                  onChange={(event) =>
                    setPendingFile(event.target.files?.[0] ?? null)
                  }
                />
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={
                    activeFriend
                      ? `Mensagem para ${activeFriend.display_name}`
                      : `Conversar em #${activeChannel?.name}`
                  }
                />
                {(draft.trim() || pendingFile) && (
                  <button
                    disabled={uploading}
                    className="send-button"
                    type="submit"
                    title="Enviar"
                  >
                    {uploading ? (
                      <span className="send-spinner" />
                    ) : (
                      <Send size={18} />
                    )}
                  </button>
                )}
              </form>
            </>
          )}
        </section>
      </main>

      <aside className="member-panel">
        {(activeChannel?.type === "voice" || inCall) && (
          <div
            ref={callCardRef}
            onMouseMove={revealFullscreenControls}
            className={`call-card ${sharing || camera || remoteMedia ? "media-visible" : "compact-call"} ${theaterMode ? "theater-mode" : ""}`}
          >
            <div className="call-card-head">
              <span>
                <Volume2 size={17} />{" "}
                {inCall ? callChannelName : activeChannel?.name}
              </span>
              <div className="viewer-actions">
                <small>
                  {joining
                    ? "conectando…"
                    : inCall
                      ? `${callParticipants || 1} conectado${callParticipants === 1 ? "" : "s"}`
                      : "pronto"}
                </small>
                {(sharing || camera || remoteMedia) && (
                  <>
                    <button
                      title={theaterMode ? "Reduzir" : "Ampliar"}
                      onClick={() => setTheaterMode((value) => !value)}
                    >
                      {theaterMode ? (
                        <Minimize2 size={16} />
                      ) : (
                        <Maximize2 size={16} />
                      )}
                    </button>
                    <button
                      title="Tela cheia"
                      onClick={() => void openFullscreen()}
                    >
                      <Maximize2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
            {callStreams.length > 1 && (
              <div className="stream-selector">
                <button
                  className={selectedStreamIds.length === 0 ? "selected" : ""}
                  onClick={() => chooseStreams([])}
                >
                  Todas
                </button>
                {callStreams.map((stream) => (
                  <button
                    key={stream.id}
                    className={
                      selectedStreamIds.includes(stream.id) ? "selected" : ""
                    }
                    onClick={() =>
                      chooseStreams(
                        selectedStreamIds.includes(stream.id)
                          ? selectedStreamIds.filter((id) => id !== stream.id)
                          : [...selectedStreamIds, stream.id],
                      )
                    }
                  >
                    {stream.label}
                  </button>
                ))}
              </div>
            )}
            <div
              ref={mediaRef}
              onClick={(event) => {
                const target = event.target;
                if (target instanceof HTMLVideoElement) {
                  mediaRef.current
                    ?.querySelectorAll("video")
                    .forEach((video) =>
                      video.classList.remove("focused-stream"),
                    );
                  target.classList.add("focused-stream");
                }
              }}
              onDoubleClick={() =>
                (sharing || camera || remoteMedia) && void openFullscreen()
              }
              className={`stream-preview media-stage ${sharing || remoteMedia ? "sharing" : ""}`}
            />
            <div
              className={`fullscreen-call-controls ${fullscreenControls ? "visible" : ""}`}
            >
              <button onClick={() => void toggleScreen()}>
                <MonitorUp size={18} />
                {sharing ? "Parar tela" : "Compartilhar"}
              </button>
              <button
                onClick={async () => {
                  if (callRef.current)
                    setCamera(await callRef.current.toggleCamera());
                }}
              >
                <Video size={18} />
                Câmera
              </button>
              <button className="hangup" onClick={leaveCall}>
                <PhoneCall size={18} />
                Desligar
              </button>
              <button onClick={() => void document.exitFullscreen()}>
                <Minimize2 size={18} />
                Sair da tela cheia
              </button>
            </div>
            <div className="call-actions">
              {!inCall && broadcasters.length > 0 && (
                <button
                  className="watch-button"
                  onClick={() => void joinCall(false)}
                >
                  <Eye size={17} /> Assistir transmissão
                </button>
              )}
              {!inCall && (
                <button
                  className={broadcasters.length ? "" : "primary"}
                  disabled={!activeGroup || joining}
                  onClick={() => void joinCall(true)}
                >
                  <PhoneCall size={17} />{" "}
                  {joining ? "Conectando…" : "Entrar na chamada"}
                </button>
              )}
              {inCall && (
                <>
                  {broadcasters.length > 0 && !remoteMedia && (
                    <button
                      className="watch-button"
                      onClick={() => callRef.current?.setWatchingStreams(true)}
                    >
                      <Eye size={17} /> Assistir transmissão
                    </button>
                  )}
                  {remoteMedia && !sharing && (
                    <button
                      onClick={() => callRef.current?.setWatchingStreams(false)}
                    >
                      <X size={17} /> Fechar transmissão
                    </button>
                  )}
                  <button
                    disabled={!callGroupId}
                    className="primary"
                    onClick={() => void toggleScreen()}
                  >
                    <MonitorUp size={17} />
                    {sharing ? "Parar transmissão" : "Compartilhar tela"}
                  </button>
                  <button
                    disabled={!callGroupId}
                    onClick={async () => {
                      await joinCall();
                      if (callRef.current)
                        setCamera(await callRef.current.toggleCamera());
                    }}
                    title="Câmera"
                  >
                    <Video size={18} />{" "}
                    {camera ? "Desligar câmera" : "Ligar câmera"}
                  </button>
                  <button className="hangup" onClick={leaveCall}>
                    <PhoneCall size={18} /> Desligar
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        <div className="member-heading">
          <span>MEMBROS — {members.length}</span>
          <button
            title="Convidar para o grupo"
            onClick={() => setDialog("invite")}
          >
            <UserPlus size={17} />
          </button>
        </div>
        <div className="member-list">
          {members.map(({ role, profile: member }) => {
            const canManage =
              member.id !== profile?.id &&
              (myGroupRole === "owner" ||
                (myGroupRole === "admin" && role === "member"));
            return (
              <div className="member-row" key={member.id}>
                <button
                  className="member"
                  onClick={() => {
                    setSelectedProfile(member);
                    setDialog("publicProfile");
                  }}
                >
                  <Avatar
                    profile={member}
                    speaking={activeSpeakerIds.includes(member.id)}
                    status={
                      presence.find((item) => item.user_id === member.id)
                        ?.state ?? "offline"
                    }
                  />
                  <div>
                    <strong>{member.display_name}</strong>
                    <small>
                      @{member.nametag} · {role}
                    </small>
                  </div>
                </button>
                {canManage && (
                  <div className="member-actions-wrap">
                    <button
                      className="member-more-button"
                      title={`Opções de ${member.display_name}`}
                      onClick={() =>
                        setMemberMenuId((current) =>
                          current === member.id ? null : member.id,
                        )
                      }
                    >
                      <MoreHorizontal size={17} />
                    </button>
                    {memberMenuId === member.id && (
                      <div className="member-menu">
                        <span>FUNÇÃO NO GRUPO</span>
                        <button
                          className={role === "member" ? "selected" : ""}
                          disabled={role === "member"}
                          onClick={async () => {
                            try {
                              await setGroupRole(
                                activeGroup!.id,
                                member.id,
                                "member",
                              );
                              await loadGroupData(activeGroup!.id);
                              setNotice(
                                `${member.display_name} agora é membro comum.`,
                              );
                            } catch (error) {
                              setNotice(
                                errorMessage(
                                  error,
                                  "Não foi possível alterar a função.",
                                ),
                              );
                            } finally {
                              setMemberMenuId(null);
                            }
                          }}
                        >
                          Membro comum{" "}
                          {role === "member" && <Check size={14} />}
                        </button>
                        <button
                          className={role === "admin" ? "selected" : ""}
                          disabled={role === "admin"}
                          onClick={async () => {
                            try {
                              await setGroupRole(
                                activeGroup!.id,
                                member.id,
                                "admin",
                              );
                              await loadGroupData(activeGroup!.id);
                              setNotice(
                                `${member.display_name} agora é administrador.`,
                              );
                            } catch (error) {
                              setNotice(
                                errorMessage(
                                  error,
                                  "Não foi possível alterar a função.",
                                ),
                              );
                            } finally {
                              setMemberMenuId(null);
                            }
                          }}
                        >
                          Administrador{" "}
                          {role === "admin" && <Check size={14} />}
                        </button>
                        <div className="member-menu-divider" />
                        <button
                          onClick={() => {
                            setMemberPermissionsTarget({
                              role,
                              profile: member,
                            });
                            setDialog("memberPermissions");
                            setMemberMenuId(null);
                          }}
                        >
                          <Settings size={14} /> Permissões de canais
                        </button>
                        <button
                          className="danger"
                          onClick={async () => {
                            try {
                              await banGroupMember(activeGroup!.id, member.id);
                              await loadGroupData(activeGroup!.id);
                              setNotice(
                                `${member.display_name} foi bloqueado do grupo.`,
                              );
                            } catch (error) {
                              setNotice(
                                errorMessage(
                                  error,
                                  "Não foi possível bloquear.",
                                ),
                              );
                            } finally {
                              setMemberMenuId(null);
                            }
                          }}
                        >
                          <Trash2 size={14} /> Bloquear do grupo
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {notice && (
        <div className="toast">
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {dialog === "group" && (
        <GroupDialog
          onClose={() => setDialog(null)}
          onCreated={async (id) => {
            await loadSidebar();
            setActiveGroupId(id);
            setDialog(null);
            setNotice("Grupo criado.");
          }}
        />
      )}
      {dialog === "channel" && activeGroup && (
        <ChannelDialog
          group={activeGroup}
          onClose={() => setDialog(null)}
          onCreated={async (id) => {
            await loadGroupData(activeGroup.id);
            setActiveChannelId(id);
            setDialog(null);
            setNotice("Canal criado.");
          }}
        />
      )}
      {dialog === "channelSettings" && selectedChannelSettings && (
        <ChannelSettingsDialog
          channel={selectedChannelSettings}
          members={members}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            await loadGroupData(selectedChannelSettings.group_id);
            setDialog(null);
            setNotice("Permissões do canal atualizadas.");
          }}
        />
      )}
      {dialog === "memberPermissions" &&
        memberPermissionsTarget &&
        activeGroup && (
          <MemberPermissionsDialog
            member={memberPermissionsTarget}
            channels={channels}
            onClose={() => {
              setDialog(null);
              setMemberPermissionsTarget(null);
            }}
            onSaved={() => {
              setDialog(null);
              setMemberPermissionsTarget(null);
              setNotice("Permissões individuais atualizadas.");
            }}
          />
        )}
      {dialog === "friend" && (
        <FriendDialog
          profile={profile}
          friendships={friendships}
          onClose={() => setDialog(null)}
          onChanged={loadSidebar}
        />
      )}
      {dialog === "notifications" && (
        <NotificationsDialog
          profile={profile}
          friendships={friendships}
          onClose={() => setDialog(null)}
          onChanged={loadSidebar}
        />
      )}
      {dialog === "publicProfile" && selectedProfile && (
        <PublicProfileDialog
          viewer={profile}
          target={selectedProfile}
          friendships={friendships}
          presence={presence.find(
            (item) => item.user_id === selectedProfile.id,
          )}
          onClose={() => setDialog(null)}
          onChanged={loadSidebar}
        />
      )}
      {dialog === "profile" && profile && (
        <ProfileDialog
          profile={profile}
          onClose={() => setDialog(null)}
          onSaved={(next) => {
            setProfile(next);
            setDialog(null);
            setNotice("Perfil atualizado.");
          }}
        />
      )}
      {dialog === "invite" && activeGroup && (
        <InviteDialog
          group={activeGroup}
          profile={profile}
          friendships={friendships}
          members={members}
          onClose={() => setDialog(null)}
          onInvited={async () => {
            await loadConversation(activeGroup.id);
            setNotice("Amigo adicionado ao grupo.");
          }}
        />
      )}
      {dialog === "delete" && activeGroup && (
        <DeleteGroupDialog
          group={activeGroup}
          onClose={() => setDialog(null)}
          onDeleted={async () => {
            if (inCall) leaveCall();
            await deleteGroup(activeGroup.id);
            setDialog(null);
            setActiveGroupId("");
            await loadSidebar();
            setNotice("Grupo excluído.");
          }}
        />
      )}
      {dialog === "rename" && activeGroup && (
        <RenameGroupDialog
          group={activeGroup}
          onClose={() => setDialog(null)}
          onRenamed={async (name) => {
            await renameGroup(activeGroup.id, name);
            await loadSidebar();
            setDialog(null);
            setNotice("Grupo renomeado.");
          }}
        />
      )}
      {dialog === "leave" && activeGroup && (
        <LeaveGroupDialog
          group={activeGroup}
          onClose={() => setDialog(null)}
          onLeft={async () => {
            if (callGroupId === activeGroup.id) leaveCall();
            await leaveGroup(activeGroup.id);
            setDialog(null);
            setActiveGroupId("");
            await loadSidebar();
            setNotice("Você saiu do grupo.");
          }}
        />
      )}
      {dialog === "stickers" && (
        <StickerDialog
          stickers={stickers}
          uploading={uploading}
          onClose={() => setDialog(null)}
          onCreate={(sticker) => saveStickers([...stickers, sticker])}
          onDelete={(id) =>
            saveStickers(stickers.filter((sticker) => sticker.id !== id))
          }
          onSend={sendSticker}
        />
      )}
      {viewingImage && (
        <ImageViewer
          image={viewingImage}
          onClose={() => setViewingImage(null)}
        />
      )}
      {!!screenSources.length && (
        <ScreenPicker
          sources={screenSources}
          onClose={() => setScreenSources([])}
          onSelect={(id) => void startScreenShare(id)}
        />
      )}
      {audioPicker && (
        <AudioDeviceDialog
          kind={audioPicker}
          devices={audioDevices}
          selected={audioPicker === "audioinput" ? selectedMic : selectedOutput}
          onClose={() => setAudioPicker(null)}
          onSelect={(id) => void chooseAudioDevice(audioPicker, id)}
        />
      )}
    </div>
  );
}

function Avatar({
  profile,
  small = false,
  status,
  speaking = false,
}: {
  profile?: Pick<Profile, "display_name" | "avatar_url"> | null;
  small?: boolean;
  status?: UserPresence["state"];
  speaking?: boolean;
}) {
  return (
    <div
      className={`avatar ${small ? "avatar-small" : ""} ${speaking ? "speaking" : ""}`}
    >
      {profile?.avatar_url ? (
        <img src={profile.avatar_url} alt={profile.display_name} />
      ) : (
        initials(profile?.display_name)
      )}
      {status && <span className={`presence-dot ${status}`} />}
    </div>
  );
}

function NotificationsDialog({
  profile,
  friendships,
  onClose,
  onChanged,
}: {
  profile: Profile | null;
  friendships: Friendship[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const incoming = friendships.filter(
    (item) => item.status === "pending" && item.addressee_id === profile?.id,
  );
  return (
    <Modal title="Notificações" onClose={onClose}>
      <div className="friend-section">
        {incoming.map((item) => (
          <div className="friend-row" key={item.requester_id}>
            <Avatar profile={item.requester} small />
            <span>
              <strong>{item.requester?.display_name}</strong>
              <small>enviou um pedido de amizade</small>
            </span>
            <button
              onClick={async () => {
                await acceptFriendRequest(item.requester_id);
                await onChanged();
              }}
            >
              <Check size={16} /> Aceitar
            </button>
          </div>
        ))}
        {!incoming.length && <p>Nenhuma notificação pendente.</p>}
      </div>
    </Modal>
  );
}

function PublicProfileDialog({
  viewer,
  target,
  friendships,
  presence,
  onClose,
  onChanged,
}: {
  viewer: Profile | null;
  target: Profile;
  friendships: Friendship[];
  presence?: UserPresence;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const relation = friendships.find(
    (item) =>
      (item.requester_id === viewer?.id && item.addressee_id === target.id) ||
      (item.addressee_id === viewer?.id && item.requester_id === target.id),
  );
  const incoming =
    relation?.status === "pending" && relation.addressee_id === viewer?.id;
  return (
    <Modal title="Perfil" onClose={onClose}>
      <div className="public-profile">
        <Avatar profile={target} status={presence?.state ?? "offline"} />
        <h3>{target.display_name}</h3>
        <small>
          @{target.nametag} · {presenceLabel(presence?.state)}
        </small>
        <p>{target.bio || "Esta pessoa ainda não escreveu uma bio."}</p>
        {target.id !== viewer?.id &&
          (!relation ? (
            <button
              className="modal-primary"
              onClick={async () => {
                await addFriendByNametag(target.nametag);
                await onChanged();
              }}
            >
              Adicionar amigo
            </button>
          ) : incoming ? (
            <button
              className="modal-primary"
              onClick={async () => {
                await acceptFriendRequest(target.id);
                await onChanged();
              }}
            >
              Aceitar pedido
            </button>
          ) : (
            <button className="modal-primary" disabled>
              {relation.status === "accepted" ? "Amigos" : "Pedido enviado"}
            </button>
          ))}
      </div>
    </Modal>
  );
}

function presenceLabel(state?: UserPresence["state"]) {
  return state === "online"
    ? "Online"
    : state === "background"
      ? "Em segundo plano"
      : state === "away"
        ? "Ausente"
        : "Offline";
}

function EmptyGroups({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="empty-groups">
      <img src={toxitySymbol} alt="" />
      <strong>Crie sua primeira sintonia</strong>
      <p>Um grupo reúne mensagens, pessoas e chamadas.</p>
      <button onClick={onCreate}>
        <Plus size={16} /> Criar grupo
      </button>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="modal-card">
        <header>
          <h2>{title}</h2>
          <button onClick={onClose}>
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function GroupDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="Novo grupo" onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setLoading(true);
          setError("");
          const data = new FormData(event.currentTarget);
          try {
            await onCreated(
              await createGroup(
                String(data.get("name")),
                String(data.get("description")),
              ),
            );
          } catch (reason) {
            setError(errorMessage(reason, "Falha ao criar."));
            setLoading(false);
          }
        }}
      >
        <label>
          Nome
          <input name="name" minLength={2} maxLength={60} required autoFocus />
        </label>
        <label>
          Descrição
          <textarea name="description" maxLength={240} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="modal-primary" disabled={loading}>
          {loading ? "Criando…" : "Criar grupo"}
        </button>
      </form>
    </Modal>
  );
}

function ChannelDialog({
  group,
  onClose,
  onCreated,
}: {
  group: Group;
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title={`Novo canal em ${group.name}`} onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setLoading(true);
          const data = new FormData(event.currentTarget);
          try {
            await onCreated(
              await createGroupChannel(
                group.id,
                String(data.get("name")),
                String(data.get("type")) as "text" | "voice",
                String(data.get("accessMode")) as ChannelAccessMode,
              ),
            );
          } catch (reason) {
            setError(errorMessage(reason, "Não foi possível criar o canal."));
            setLoading(false);
          }
        }}
      >
        <label>
          Nome
          <input name="name" minLength={2} maxLength={40} required autoFocus />
        </label>
        <label>
          Tipo
          <select name="type">
            <option value="text">Canal de texto</option>
            <option value="voice">Canal de chamada</option>
          </select>
        </label>
        <label>
          Permissão
          <select name="accessMode">
            <option value="public">Público — todos participam</option>
            <option value="read_only">Somente leitura</option>
            <option value="locked">Visível, mas bloqueado</option>
            <option value="private">Privado — apenas autorizados</option>
          </select>
        </label>
        {error && <p className="form-error inline-error">{error}</p>}
        <button className="modal-primary" disabled={loading}>
          {loading ? "Criando…" : "Criar canal"}
        </button>
      </form>
    </Modal>
  );
}

function ChannelSettingsDialog({
  channel,
  members,
  onClose,
  onSaved,
}: {
  channel: GroupChannel;
  members: Member[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [mode, setMode] = useState<ChannelAccessMode>(
    channel.access_mode ?? "public",
  );
  const [allowed, setAllowed] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  return (
    <Modal title={`Permissões de #${channel.name}`} onClose={onClose}>
      <div className="modal-form">
        <label>
          Modo de acesso
          <select
            value={mode}
            onChange={(event) =>
              setMode(event.target.value as ChannelAccessMode)
            }
          >
            <option value="public">Público</option>
            <option value="read_only">Somente leitura</option>
            <option value="locked">Visível, mas bloqueado</option>
            <option value="private">Privado</option>
          </select>
        </label>
        {mode !== "public" && (
          <div className="permission-members">
            <strong>Usuários autorizados</strong>
            {members
              .filter((member) => member.role === "member")
              .map(({ profile }) => (
                <label key={profile.id}>
                  <input
                    type="checkbox"
                    checked={allowed.includes(profile.id)}
                    onChange={(event) =>
                      setAllowed((current) =>
                        event.target.checked
                          ? [...current, profile.id]
                          : current.filter((id) => id !== profile.id),
                      )
                    }
                  />{" "}
                  <Avatar profile={profile} small /> {profile.display_name}
                </label>
              ))}
          </div>
        )}
        <button
          className="modal-primary"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            await configureChannel(channel.id, mode, allowed);
            await onSaved();
          }}
        >
          Salvar permissões
        </button>
      </div>
    </Modal>
  );
}

function MemberPermissionsDialog({
  member,
  channels,
  onClose,
  onSaved,
}: {
  member: Member;
  channels: GroupChannel[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const restrictedChannels = channels.filter(
    (channel) =>
      channel.access_mode === "locked" || channel.access_mode === "private",
  );
  const [allowedByChannel, setAllowedByChannel] = useState<
    Map<string, string[]>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listChannelMembers(restrictedChannels.map((channel) => channel.id))
      .then((result) => {
        if (!cancelled) setAllowedByChannel(result);
      })
      .catch((reason) => {
        if (!cancelled)
          setError(
            errorMessage(reason, "Não foi possível carregar as permissões."),
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [member.profile.id]);

  function hasAccess(channelId: string) {
    return (allowedByChannel.get(channelId) ?? []).includes(member.profile.id);
  }

  function toggleAccess(channelId: string, allowed: boolean) {
    setAllowedByChannel((current) => {
      const next = new Map(current);
      const users = next.get(channelId) ?? [];
      next.set(
        channelId,
        allowed
          ? [...new Set([...users, member.profile.id])]
          : users.filter((id) => id !== member.profile.id),
      );
      return next;
    });
  }

  return (
    <Modal
      title={`Permissões de ${member.profile.display_name}`}
      onClose={onClose}
    >
      <div className="member-permissions-dialog">
        <p>
          {member.role === "admin"
            ? "Administradores já têm acesso a todos os canais. Estas marcações valem caso a pessoa volte a ser membro comum."
            : "Escolha os canais bloqueados ou privados que esta pessoa pode acessar."}
        </p>
        {loading ? (
          <p className="empty-copy">Carregando permissões…</p>
        ) : restrictedChannels.length ? (
          <div className="member-channel-permissions">
            {restrictedChannels.map((channel) => (
              <label key={channel.id}>
                <input
                  type="checkbox"
                  checked={hasAccess(channel.id)}
                  onChange={(event) =>
                    toggleAccess(channel.id, event.target.checked)
                  }
                />
                <span>
                  {channel.type === "voice" ? (
                    <Volume2 size={15} />
                  ) : (
                    <Hash size={15} />
                  )}
                  <strong>{channel.name}</strong>
                  <small>
                    {channel.access_mode === "private"
                      ? "Privado"
                      : "Bloqueado"}
                  </small>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="empty-copy">
            Este grupo ainda não tem canais privados ou bloqueados.
          </p>
        )}
        {error && <p className="form-error inline-error">{error}</p>}
        <button
          className="modal-primary"
          disabled={loading || saving}
          onClick={async () => {
            setSaving(true);
            setError("");
            try {
              await Promise.all(
                restrictedChannels.map((channel) =>
                  configureChannel(
                    channel.id,
                    channel.access_mode,
                    allowedByChannel.get(channel.id) ?? [],
                  ),
                ),
              );
              onSaved();
            } catch (reason) {
              setError(
                errorMessage(reason, "Não foi possível salvar as permissões."),
              );
              setSaving(false);
            }
          }}
        >
          {saving ? "Salvando…" : "Salvar permissões"}
        </button>
      </div>
    </Modal>
  );
}

function FriendDialog({
  profile,
  friendships,
  onClose,
  onChanged,
}: {
  profile: Profile | null;
  friendships: Friendship[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const incoming = friendships.filter(
    (item) => item.status === "pending" && item.addressee_id === profile?.id,
  );
  const accepted = friendships.filter((item) => item.status === "accepted");
  return (
    <Modal title="Pessoas" onClose={onClose}>
      <form
        className="friend-add"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          setError("");
          setMessage("");
          const data = new FormData(form);
          try {
            await addFriendByNametag(
              String(data.get("nametag")).replace(/^@/, ""),
            );
            setMessage("Pedido enviado.");
            await onChanged();
            form.reset();
          } catch (reason) {
            setError(errorMessage(reason, "Não foi possível adicionar."));
          }
        }}
      >
        <label>
          Adicionar por nametag
          <div>
            <span>@</span>
            <input
              name="nametag"
              placeholder="nametag"
              required
              pattern="[a-zA-Z0-9_]{3,20}"
            />
            <button>
              <UserPlus size={16} /> Enviar
            </button>
          </div>
        </label>
      </form>
      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}
      <div className="friend-section">
        <h3>Pedidos recebidos</h3>
        {incoming.map((item) => (
          <div className="friend-row" key={item.requester_id}>
            <div className="avatar">
              {initials(item.requester?.display_name)}
            </div>
            <span>
              <strong>{item.requester?.display_name}</strong>
              <small>@{item.requester?.nametag}</small>
            </span>
            <button
              onClick={async () => {
                await acceptFriendRequest(item.requester_id);
                await onChanged();
              }}
            >
              <Check size={16} /> Aceitar
            </button>
          </div>
        ))}
        {!incoming.length && <p>Nenhum pedido pendente.</p>}
      </div>
      <div className="friend-section">
        <h3>Amigos</h3>
        {accepted.map((item) => {
          const friend =
            item.requester_id === profile?.id ? item.addressee : item.requester;
          return (
            <div
              className="friend-row"
              key={`${item.requester_id}-${item.addressee_id}`}
            >
              <div className="avatar">{initials(friend?.display_name)}</div>
              <span>
                <strong>{friend?.display_name}</strong>
                <small>@{friend?.nametag}</small>
              </span>
            </div>
          );
        })}
        {!accepted.length && <p>Sua lista ainda está vazia.</p>}
      </div>
    </Modal>
  );
}

function ProfileDialog({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: (profile: Profile) => void;
}) {
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(profile.avatar_url);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [noiseSuppression, setNoiseSuppression] = useState(
    () => localStorage.getItem("toxity:noise-suppression") !== "false",
  );
  const [noiseStrength, setNoiseStrength] = useState(() =>
    Number(localStorage.getItem("toxity:noise-strength") ?? 100),
  );
  const [microphoneGain, setMicrophoneGain] = useState(() =>
    Number(localStorage.getItem("toxity:microphone-gain") ?? 100),
  );
  return (
    <Modal title="Seu perfil" onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setLoading(true);
          setError("");
          const data = new FormData(event.currentTarget);
          try {
            const avatarUrl = avatarFile
              ? await uploadAvatar(avatarFile)
              : profile.avatar_url;
            onSaved(
              await updateMyProfile({
                display_name: String(data.get("displayName")),
                bio: String(data.get("bio")),
                avatar_url: avatarUrl,
              }),
            );
          } catch (reason) {
            setError(errorMessage(reason, "Não foi possível salvar o perfil."));
            setLoading(false);
          }
        }}
      >
        <div className="avatar-editor">
          <Avatar
            profile={{
              display_name: profile.display_name,
              avatar_url: preview,
            }}
          />
          <label>
            Escolher foto
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setAvatarFile(file);
                if (file) setPreview(URL.createObjectURL(file));
              }}
            />
          </label>
          <small>PNG, JPG, WEBP ou GIF · até 5 MB</small>
        </div>
        <label>
          Nome
          <input
            name="displayName"
            defaultValue={profile.display_name}
            minLength={2}
            maxLength={32}
            required
          />
        </label>
        <label>
          Nametag
          <input value={`@${profile.nametag}`} disabled />
        </label>
        <label>
          Bio
          <textarea name="bio" defaultValue={profile.bio} maxLength={280} />
        </label>
        <div className="voice-settings">
          <strong>Processamento da sua voz</strong>
          <label className="toggle-row">
            <span>Supressão de ruído local</span>
            <input
              type="checkbox"
              checked={noiseSuppression}
              onChange={(event) => setNoiseSuppression(event.target.checked)}
            />
          </label>
          <label>
            Força da supressão — {noiseStrength}%
            <input
              type="range"
              min="0"
              max="100"
              value={noiseStrength}
              onChange={(event) => setNoiseStrength(Number(event.target.value))}
            />
          </label>
          <label>
            Amplificação do microfone — {microphoneGain}%
            <input
              type="range"
              min="0"
              max="300"
              value={microphoneGain}
              onChange={(event) =>
                setMicrophoneGain(Number(event.target.value))
              }
            />
          </label>
          <small>
            O processamento afeta somente a voz que você envia. Compressor e
            limitador protegem contra estouros.
          </small>
        </div>
        {error && <p className="form-error inline-error">{error}</p>}
        <button
          className="modal-primary"
          disabled={loading}
          onClick={() => {
            localStorage.setItem(
              "toxity:noise-suppression",
              String(noiseSuppression),
            );
            localStorage.setItem(
              "toxity:noise-strength",
              String(noiseStrength),
            );
            localStorage.setItem(
              "toxity:microphone-gain",
              String(microphoneGain),
            );
          }}
        >
          {loading ? "Salvando…" : "Salvar perfil"}
        </button>
        <button
          type="button"
          className="logout-button"
          onClick={() => void requireSupabase().auth.signOut()}
        >
          <LogOut size={16} /> Sair da conta
        </button>
      </form>
    </Modal>
  );
}

function ScreenPicker({
  sources,
  onClose,
  onSelect,
}: {
  sources: ToxityScreenSource[];
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <Modal title="O que você quer compartilhar?" onClose={onClose}>
      <div className="screen-picker">
        {sources.map((source) => (
          <button key={source.id} onClick={() => onSelect(source.id)}>
            <img src={source.thumbnail} alt="" />
            <span>{source.name}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function AudioDeviceDialog({
  kind,
  devices,
  selected,
  onClose,
  onSelect,
}: {
  kind: AudioKind;
  devices: MediaDeviceInfo[];
  selected: string;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <Modal
      title={
        kind === "audioinput" ? "Escolher microfone" : "Escolher saída de áudio"
      }
      onClose={onClose}
    >
      <div className="device-list">
        {devices.map((device, index) => (
          <button
            className={selected === device.deviceId ? "selected" : ""}
            key={device.deviceId}
            onClick={() => onSelect(device.deviceId)}
          >
            {kind === "audioinput" ? (
              <Mic size={18} />
            ) : (
              <Headphones size={18} />
            )}
            <span>
              {device.label ||
                `${kind === "audioinput" ? "Microfone" : "Saída"} ${index + 1}`}
            </span>
            {selected === device.deviceId && <Check size={16} />}
          </button>
        ))}
        {!devices.length && <p>Nenhum dispositivo disponível.</p>}
      </div>
    </Modal>
  );
}

function DeleteGroupDialog({
  group,
  onClose,
  onDeleted,
}: {
  group: Group;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="Excluir grupo" onClose={onClose}>
      <div className="delete-dialog">
        <Trash2 size={28} />
        <p>
          Excluir <strong>{group.name}</strong>? Todas as mensagens e chamadas
          desse grupo serão removidas permanentemente.
        </p>
        {error && <p className="form-error inline-error">{error}</p>}
        <div>
          <button onClick={onClose}>Cancelar</button>
          <button
            className="danger"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await onDeleted();
              } catch (reason) {
                setError(errorMessage(reason, "Não foi possível excluir."));
                setLoading(false);
              }
            }}
          >
            {loading ? "Excluindo…" : "Excluir grupo"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ImageViewer({
  image,
  onClose,
}: {
  image: { url: string; name: string };
  onClose: () => void;
}) {
  return (
    <div className="image-viewer" onClick={onClose}>
      <div
        className="image-viewer-toolbar"
        onClick={(event) => event.stopPropagation()}
      >
        <strong>{image.name}</strong>
        <a href={image.url} download={image.name} title="Baixar">
          <Download size={18} />
        </a>
        <button onClick={onClose} title="Fechar">
          <X size={20} />
        </button>
      </div>
      <img
        src={image.url}
        alt={image.name}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

function StickerDialog({
  stickers,
  uploading,
  onClose,
  onCreate,
  onDelete,
  onSend,
}: {
  stickers: Sticker[];
  uploading: boolean;
  onClose: () => void;
  onCreate: (sticker: Sticker) => void;
  onDelete: (id: string) => void;
  onSend: (sticker: Sticker) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState("");

  async function loadSticker(file?: File) {
    if (!file) return;
    const source = URL.createObjectURL(file);
    try {
      const image = new window.Image();
      image.src = source;
      await image.decode();
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      canvas
        .getContext("2d")!
        .drawImage(
          image,
          (image.naturalWidth - side) / 2,
          (image.naturalHeight - side) / 2,
          side,
          side,
          0,
          0,
          256,
          256,
        );
      setPreview(canvas.toDataURL("image/png", 0.9));
      setName(file.name.replace(/\.[^.]+$/, "").slice(0, 28));
      setCreating(true);
    } finally {
      URL.revokeObjectURL(source);
    }
  }

  return (
    <Modal title="Figurinhas" onClose={onClose}>
      <div className="sticker-dialog">
        <div className="sticker-tools">
          <label>
            <Plus size={16} /> Criar figurinha
            <input
              type="file"
              accept="image/*"
              onChange={(event) => void loadSticker(event.target.files?.[0])}
            />
          </label>
        </div>
        {creating && preview && (
          <div className="sticker-creator">
            <img src={preview} alt="Prévia da figurinha" />
            <input
              value={name}
              maxLength={28}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome da figurinha"
            />
            <button
              className="modal-primary"
              onClick={() => {
                onCreate({
                  id: crypto.randomUUID(),
                  name: name.trim() || "figurinha",
                  dataUrl: preview,
                });
                setCreating(false);
                setPreview("");
              }}
            >
              Salvar na coleção
            </button>
          </div>
        )}
        <div className="sticker-grid">
          {stickers.map((sticker) => (
            <div className="sticker-item" key={sticker.id}>
              <button
                disabled={uploading}
                onClick={() => void onSend(sticker)}
                title={`Enviar ${sticker.name}`}
              >
                <img src={sticker.dataUrl} alt={sticker.name} />
              </button>
              <span>{sticker.name}</span>
              <button
                className="sticker-delete"
                onClick={() => onDelete(sticker.id)}
                title="Excluir figurinha"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {!stickers.length && !creating && (
            <p>Sua coleção ainda está vazia.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function RenameGroupDialog({
  group,
  onClose,
  onRenamed,
}: {
  group: Group;
  onClose: () => void;
  onRenamed: (name: string) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="Renomear grupo" onClose={onClose}>
      <form
        className="modal-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setLoading(true);
          try {
            await onRenamed(
              String(new FormData(event.currentTarget).get("name")),
            );
          } catch (reason) {
            setError(errorMessage(reason, "Não foi possível renomear."));
            setLoading(false);
          }
        }}
      >
        <label>
          Nome
          <input
            name="name"
            defaultValue={group.name}
            minLength={2}
            maxLength={60}
            required
            autoFocus
          />
        </label>
        {error && <p className="form-error inline-error">{error}</p>}
        <button className="modal-primary" disabled={loading}>
          {loading ? "Salvando…" : "Salvar nome"}
        </button>
      </form>
    </Modal>
  );
}

function LeaveGroupDialog({
  group,
  onClose,
  onLeft,
}: {
  group: Group;
  onClose: () => void;
  onLeft: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="Sair do grupo" onClose={onClose}>
      <div className="delete-dialog">
        <LogOut size={28} />
        <p>
          Sair de <strong>{group.name}</strong>? Para voltar, você precisará ser
          convidado novamente.
        </p>
        {error && <p className="form-error inline-error">{error}</p>}
        <div>
          <button onClick={onClose}>Cancelar</button>
          <button
            className="danger"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await onLeft();
              } catch (reason) {
                setError(errorMessage(reason, "Não foi possível sair."));
                setLoading(false);
              }
            }}
          >
            {loading ? "Saindo…" : "Sair do grupo"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function InviteDialog({
  group,
  profile,
  friendships,
  members,
  onClose,
  onInvited,
}: {
  group: Group;
  profile: Profile | null;
  friendships: Friendship[];
  members: Member[];
  onClose: () => void;
  onInvited: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [adding, setAdding] = useState("");
  const memberIds = new Set(members.map((item) => item.profile.id));
  const contacts = friendships
    .filter((item) => item.status === "accepted")
    .map((item) =>
      item.requester_id === profile?.id ? item.addressee : item.requester,
    )
    .filter((friend): friend is Profile =>
      Boolean(friend && !memberIds.has(friend.id)),
    );
  return (
    <Modal title={`Adicionar amigo a ${group.name}`} onClose={onClose}>
      <div className="contact-picker">
        <p>Somente amizades aceitas podem entrar no grupo.</p>
        {contacts.map((friend) => (
          <div className="friend-row" key={friend.id}>
            <div className="avatar">{initials(friend.display_name)}</div>
            <span>
              <strong>{friend.display_name}</strong>
              <small>@{friend.nametag}</small>
            </span>
            <button
              disabled={adding === friend.id}
              onClick={async () => {
                setAdding(friend.id);
                setError("");
                try {
                  await addFriendToGroup(group.id, friend.id);
                  await onInvited();
                } catch (reason) {
                  setError(errorMessage(reason, "Não foi possível adicionar."));
                } finally {
                  setAdding("");
                }
              }}
            >
              <Plus size={15} />
              {adding === friend.id ? "Adicionando…" : "Adicionar"}
            </button>
          </div>
        ))}
        {!contacts.length && (
          <div className="empty-contacts">
            <Users size={24} />
            <strong>Nenhum contato disponível</strong>
            <span>Envie um pedido de amizade e aguarde a pessoa aceitar.</span>
          </div>
        )}
        {error && <p className="form-error inline-error">{error}</p>}
      </div>
    </Modal>
  );
}

export default App;
