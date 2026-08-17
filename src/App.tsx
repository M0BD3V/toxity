import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell, Check, ChevronDown, CircleHelp, Hash, Headphones, LogOut, Maximize2, Mic, Minimize2, MonitorUp,
  PhoneCall, Plus, Search, Settings, UserPlus, Users, Video, Volume2, Send, X,
} from 'lucide-react';
import { requireSupabase } from './lib/supabase';
import {
  acceptFriendRequest, addFriendByNametag, addFriendToGroup, createGroup, getMyProfile, listFriendships,
  listGroupMembers, listGroups, listMessages, sendMessage, subscribeToMessages, subscribeToSocial, updateMyProfile,
  type ChatMessage, type Friendship, type Group, type Profile,
} from './lib/social';
import { ToxityCall } from './lib/call';

type Dialog = 'group' | 'friend' | 'profile' | 'invite' | null;
type Member = { role: string; profile: Profile };

function errorMessage(reason: unknown, fallback: string) {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === 'object' && 'message' in reason && typeof reason.message === 'string') return reason.message;
  return fallback;
}

function initials(name = 'Toxity') {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroupId, setActiveGroupId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [draft, setDraft] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(true);
  const [inCall, setInCall] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [camera, setCamera] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const [screenSources, setScreenSources] = useState<ToxityScreenSource[]>([]);
  const mediaRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<ToxityCall | null>(null);
  const activeGroup = useMemo(() => groups.find((group) => group.id === activeGroupId), [groups, activeGroupId]);
  const pendingRequests = useMemo(() => friendships.filter((item) => item.status === 'pending' && item.addressee_id === profile?.id), [friendships, profile?.id]);

  const loadSidebar = useCallback(async () => {
    const [myProfile, myGroups, friends] = await Promise.all([getMyProfile(), listGroups(), listFriendships()]);
    setProfile(myProfile); setGroups(myGroups); setFriendships(friends);
    setActiveGroupId((current) => current || myGroups[0]?.id || '');
  }, []);

  const loadConversation = useCallback(async (groupId: string) => {
    if (!groupId) { setMessages([]); setMembers([]); return; }
    const [nextMessages, nextMembers] = await Promise.all([listMessages(groupId), listGroupMembers(groupId)]);
    setMessages(nextMessages); setMembers(nextMembers);
  }, []);

  useEffect(() => {
    void loadSidebar().catch((error) => setNotice(error.message)).finally(() => setBusy(false));
  }, [loadSidebar]);

  useEffect(() => subscribeToSocial(() => void loadSidebar()), [loadSidebar]);

  useEffect(() => {
    void loadConversation(activeGroupId).catch((error) => setNotice(error.message));
    if (!activeGroupId) return;
    return subscribeToMessages(activeGroupId, () => void loadConversation(activeGroupId));
  }, [activeGroupId, loadConversation]);

  useEffect(() => () => callRef.current?.disconnect(), []);

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !activeGroupId) return;
    setDraft('');
    try { await sendMessage(activeGroupId, body); }
    catch (error) { setDraft(body); setNotice(errorMessage(error, 'Não foi possível enviar.')); }
  }

  async function joinCall() {
    if (!activeGroupId || !profile || !mediaRef.current) return;
    try {
      if (!callRef.current) callRef.current = new ToxityCall(mediaRef.current);
      if (!inCall) await callRef.current.connect(activeGroupId, profile.display_name);
      setInCall(true); setNotice('Conectado à call.');
    } catch (error) { setNotice(errorMessage(error, 'Falha ao conectar à call.')); }
  }

  async function toggleScreen() {
    await joinCall();
    if (!callRef.current) return;
    if (!sharing && window.toxity?.listScreenSources) {
      try {
        const sources = await window.toxity.listScreenSources();
        if (!sources.length) throw new Error('Nenhuma tela ou janela disponível.');
        setScreenSources(sources);
        return;
      } catch (error) { setNotice(errorMessage(error, 'Não foi possível listar as telas.')); return; }
    }
    try { setSharing(await callRef.current.toggleScreen()); }
    catch (error) { setNotice(errorMessage(error, 'Compartilhamento cancelado.')); }
  }

  async function startScreenShare(sourceId: string) {
    try {
      await window.toxity?.selectScreenSource(sourceId);
      setScreenSources([]);
      if (callRef.current) setSharing(await callRef.current.toggleScreen());
    } catch (error) { setNotice(errorMessage(error, 'Não foi possível compartilhar esta tela.')); }
  }

  function leaveCall() {
    callRef.current?.disconnect(); callRef.current = null;
    setInCall(false); setSharing(false); setCamera(false); setTheaterMode(false);
  }

  async function openFullscreen() {
    try { await mediaRef.current?.requestFullscreen(); }
    catch (error) { setNotice(errorMessage(error, 'Não foi possível abrir em tela cheia.')); }
  }

  if (busy) return <div className="app-loading"><img src="/assets/brand/svg/toxity-symbol.svg" alt="" /><span>Entrando na sua sintonia…</span></div>;

  return <div className="app-shell">
    <nav className="server-rail" aria-label="Grupos">
      <button className="brand-button active" title="Início Toxity"><img src="/assets/brand/svg/toxity-symbol.svg" alt="Toxity" /></button>
      <span className="rail-divider" />
      {groups.map((group, index) => <button key={group.id} onClick={() => setActiveGroupId(group.id)} title={group.name} className={`server-button server-${index % 3} ${group.id === activeGroupId ? 'active' : ''}`}>{initials(group.name)}</button>)}
      <button className="server-button add-server" title="Criar grupo" onClick={() => setDialog('group')}><Plus size={22} /></button>
    </nav>

    <aside className="channel-panel">
      <button className="server-title">{activeGroup?.name ?? 'Sua Toxity'} <ChevronDown size={17} /></button>
      <div className="channel-scroll">
        {!groups.length && <EmptyGroups onCreate={() => setDialog('group')} />}
        {activeGroup && <>
          <section className="group-intro"><span>ESPAÇO ATIVO</span><strong>{activeGroup.name}</strong><p>{activeGroup.description || 'Converse e compartilhe com seu grupo.'}</p></section>
          <ChannelGroup title="CONVERSA" label="geral" active icon="text" />
          <ChannelGroup title="AO VIVO" label="sala principal" active={inCall} icon="voice" onClick={() => void joinCall()} />
        </>}
        <section className="channel-group quick-actions"><header><span>PESSOAS</span></header><button onClick={() => setDialog('friend')}><UserPlus size={18} /><span>Adicionar por nametag</span></button></section>
      </div>
      {inCall && <div className="call-status"><div><strong>Voz conectada</strong><small>{activeGroup?.name}</small></div><button onClick={leaveCall} aria-label="Desconectar"><PhoneCall size={17} /></button></div>}
      <div className="user-bar">
        <div className="avatar me">{initials(profile?.display_name)}<span /></div>
        <div className="user-copy"><strong>{profile?.display_name}</strong><small>@{profile?.nametag}</small></div>
        <button title="Microfone" onClick={() => void callRef.current?.toggleMicrophone()}><Mic size={18} /></button>
        <button title="Áudio"><Headphones size={18} /></button>
        <button title="Editar perfil" onClick={() => setDialog('profile')}><Settings size={18} /></button>
      </div>
    </aside>

    <main className="content-panel">
      <header className="topbar">
        <div className="channel-heading"><Hash size={21} /><strong>{activeGroup ? 'geral' : 'início'}</strong><span>{activeGroup?.description || 'Crie um grupo para começar.'}</span></div>
        <div className="top-actions"><button className="notification-button" title="Notificações" onClick={() => setDialog('friend')}><Bell size={19} />{pendingRequests.length > 0 && <span>{pendingRequests.length}</span>}</button><button title="Amigos" onClick={() => setDialog('friend')}><Users size={19} /></button><label className="search"><Search size={16} /><input placeholder="Buscar" /></label><button title="Ajuda"><CircleHelp size={19} /></button></div>
      </header>
      <section className="chat-area">
        <div className="welcome-block"><span className="welcome-icon"><Hash size={30} /></span><h1>{activeGroup ? `Boas-vindas a ${activeGroup.name}` : 'Seu espaço começa aqui'}</h1><p>{activeGroup ? 'As mensagens abaixo são reais e sincronizadas pelo Supabase.' : 'Crie seu primeiro grupo no botão + abaixo.'}</p></div>
        <div className="message-list">
          {messages.map((message) => {
            const author = message.profiles?.display_name ?? (message.author_id === profile?.id ? profile.display_name : 'Pessoa Toxity');
            return <article className="message" key={message.id}><div className="avatar message-avatar">{initials(author)}</div><div><div className="message-meta"><strong>{author}</strong><time>{new Date(message.created_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time></div><p>{message.body}</p></div></article>;
          })}
          {activeGroup && !messages.length && <p className="empty-copy">Nenhuma mensagem ainda. Quebre o silêncio.</p>}
        </div>
        <form className="composer" onSubmit={submitMessage}><button type="button" title="Ações"><Plus size={20} /></button><input disabled={!activeGroup} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={activeGroup ? `Conversar em ${activeGroup.name}` : 'Crie um grupo para conversar'} />{draft.trim() && <button className="send-button" type="submit" title="Enviar"><Send size={18} /></button>}</form>
      </section>
    </main>

    <aside className="member-panel">
      <div className={`call-card ${theaterMode ? 'theater-mode' : ''}`}>
        <div className="call-card-head"><span><Volume2 size={17} /> Sala principal</span><div className="viewer-actions"><small>{inCall ? 'conectado' : 'pronto'}</small>{(sharing || camera) && <><button title={theaterMode ? 'Reduzir' : 'Ampliar'} onClick={() => setTheaterMode((value) => !value)}>{theaterMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button><button title="Tela cheia" onClick={() => void openFullscreen()}><Maximize2 size={16} /></button></>}</div></div>
        <div ref={mediaRef} onDoubleClick={() => (sharing || camera) && void openFullscreen()} className={`stream-preview media-stage ${sharing ? 'sharing' : ''}`}>{!sharing && !camera && <><img src="/assets/brand/svg/toxity-symbol.svg" alt="" /><strong>{inCall ? 'Você está na call' : 'Pronto para compartilhar?'}</strong><small>{activeGroup ? 'Mostre sua tela para o grupo.' : 'Selecione um grupo.'}</small></>}</div>
        <div className="call-actions"><button disabled={!activeGroup} className="primary" onClick={() => void toggleScreen()}><MonitorUp size={17} />{sharing ? 'Parar' : 'Compartilhar'}</button><button disabled={!activeGroup} onClick={async () => { await joinCall(); if (callRef.current) setCamera(await callRef.current.toggleCamera()); }} title="Câmera"><Video size={18} /></button></div>
      </div>
      <div className="member-heading"><span>MEMBROS — {members.length}</span><button title="Convidar para o grupo" onClick={() => setDialog('invite')}><UserPlus size={17} /></button></div>
      <div className="member-list">{members.map(({ role, profile: member }) => <div className="member" key={member.id}><div className="avatar member-avatar">{initials(member.display_name)}<span /></div><div><strong>{member.display_name}</strong><small>@{member.nametag} · {role}</small></div></div>)}</div>
    </aside>

    {notice && <div className="toast"><span>{notice}</span><button onClick={() => setNotice('')}><X size={15} /></button></div>}
    {dialog === 'group' && <GroupDialog onClose={() => setDialog(null)} onCreated={async (id) => { await loadSidebar(); setActiveGroupId(id); setDialog(null); setNotice('Grupo criado.'); }} />}
    {dialog === 'friend' && <FriendDialog profile={profile} friendships={friendships} onClose={() => setDialog(null)} onChanged={loadSidebar} />}
    {dialog === 'profile' && profile && <ProfileDialog profile={profile} onClose={() => setDialog(null)} onSaved={(next) => { setProfile(next); setDialog(null); setNotice('Perfil atualizado.'); }} />}
    {dialog === 'invite' && activeGroup && <InviteDialog group={activeGroup} profile={profile} friendships={friendships} members={members} onClose={() => setDialog(null)} onInvited={async () => { await loadConversation(activeGroup.id); setNotice('Amigo adicionado ao grupo.'); }} />}
    {!!screenSources.length && <ScreenPicker sources={screenSources} onClose={() => setScreenSources([])} onSelect={(id) => void startScreenShare(id)} />}
  </div>;
}

function ChannelGroup({ title, label, active, icon, onClick }: { title: string; label: string; active: boolean; icon: 'text' | 'voice'; onClick?: () => void }) {
  return <section className="channel-group"><header><span>{title}</span></header><button className={active ? 'active' : ''} onClick={onClick}>{icon === 'text' ? <Hash size={18} /> : <Volume2 size={18} />}<span>{label}</span></button></section>;
}

function EmptyGroups({ onCreate }: { onCreate: () => void }) { return <div className="empty-groups"><img src="/assets/brand/svg/toxity-symbol.svg" alt="" /><strong>Crie sua primeira sintonia</strong><p>Um grupo reúne mensagens, pessoas e chamadas.</p><button onClick={onCreate}><Plus size={16} /> Criar grupo</button></div>; }

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) { return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card"><header><h2>{title}</h2><button onClick={onClose}><X /></button></header>{children}</section></div>; }

function GroupDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => Promise<void> }) {
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  return <Modal title="Novo grupo" onClose={onClose}><form className="modal-form" onSubmit={async (event) => { event.preventDefault(); setLoading(true); setError(''); const data = new FormData(event.currentTarget); try { await onCreated(await createGroup(String(data.get('name')), String(data.get('description')))); } catch (reason) { setError(errorMessage(reason, 'Falha ao criar.')); setLoading(false); } }}><label>Nome<input name="name" minLength={2} maxLength={60} required autoFocus /></label><label>Descrição<textarea name="description" maxLength={240} /></label>{error && <p className="form-error">{error}</p>}<button className="modal-primary" disabled={loading}>{loading ? 'Criando…' : 'Criar grupo'}</button></form></Modal>;
}

function FriendDialog({ profile, friendships, onClose, onChanged }: { profile: Profile | null; friendships: Friendship[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const incoming = friendships.filter((item) => item.status === 'pending' && item.addressee_id === profile?.id);
  const accepted = friendships.filter((item) => item.status === 'accepted');
  return <Modal title="Pessoas" onClose={onClose}><form className="friend-add" onSubmit={async (event) => { event.preventDefault(); const form = event.currentTarget; setError(''); setMessage(''); const data = new FormData(form); try { await addFriendByNametag(String(data.get('nametag')).replace(/^@/, '')); setMessage('Pedido enviado.'); await onChanged(); form.reset(); } catch (reason) { setError(errorMessage(reason, 'Não foi possível adicionar.')); } }}><label>Adicionar por nametag<div><span>@</span><input name="nametag" placeholder="nametag" required pattern="[a-zA-Z0-9_]{3,20}" /><button><UserPlus size={16} /> Enviar</button></div></label></form>{error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}<div className="friend-section"><h3>Pedidos recebidos</h3>{incoming.map((item) => <div className="friend-row" key={item.requester_id}><div className="avatar">{initials(item.requester?.display_name)}</div><span><strong>{item.requester?.display_name}</strong><small>@{item.requester?.nametag}</small></span><button onClick={async () => { await acceptFriendRequest(item.requester_id); await onChanged(); }}><Check size={16} /> Aceitar</button></div>)}{!incoming.length && <p>Nenhum pedido pendente.</p>}</div><div className="friend-section"><h3>Amigos</h3>{accepted.map((item) => { const friend = item.requester_id === profile?.id ? item.addressee : item.requester; return <div className="friend-row" key={`${item.requester_id}-${item.addressee_id}`}><div className="avatar">{initials(friend?.display_name)}</div><span><strong>{friend?.display_name}</strong><small>@{friend?.nametag}</small></span></div>; })}{!accepted.length && <p>Sua lista ainda está vazia.</p>}</div></Modal>;
}

function ProfileDialog({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: (profile: Profile) => void }) {
  return <Modal title="Seu perfil" onClose={onClose}><form className="modal-form" onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); onSaved(await updateMyProfile({ display_name: String(data.get('displayName')), bio: String(data.get('bio')), status: String(data.get('status')) as Profile['status'] })); }}><label>Nome<input name="displayName" defaultValue={profile.display_name} minLength={2} maxLength={32} required /></label><label>Nametag<input value={`@${profile.nametag}`} disabled /></label><label>Bio<textarea name="bio" defaultValue={profile.bio} maxLength={280} /></label><label>Status<select name="status" defaultValue={profile.status}><option value="online">Online</option><option value="away">Ausente</option><option value="busy">Ocupado</option><option value="offline">Offline</option></select></label><button className="modal-primary">Salvar perfil</button><button type="button" className="logout-button" onClick={() => void requireSupabase().auth.signOut()}><LogOut size={16} /> Sair da conta</button></form></Modal>;
}

function ScreenPicker({ sources, onClose, onSelect }: { sources: ToxityScreenSource[]; onClose: () => void; onSelect: (id: string) => void }) {
  return <Modal title="O que você quer compartilhar?" onClose={onClose}><div className="screen-picker">{sources.map((source) => <button key={source.id} onClick={() => onSelect(source.id)}><img src={source.thumbnail} alt="" /><span>{source.name}</span></button>)}</div></Modal>;
}

function InviteDialog({ group, profile, friendships, members, onClose, onInvited }: { group: Group; profile: Profile | null; friendships: Friendship[]; members: Member[]; onClose: () => void; onInvited: () => Promise<void> }) {
  const [error, setError] = useState(''); const [adding, setAdding] = useState('');
  const memberIds = new Set(members.map((item) => item.profile.id));
  const contacts = friendships.filter((item) => item.status === 'accepted').map((item) => item.requester_id === profile?.id ? item.addressee : item.requester).filter((friend): friend is Profile => Boolean(friend && !memberIds.has(friend.id)));
  return <Modal title={`Adicionar amigo a ${group.name}`} onClose={onClose}><div className="contact-picker"><p>Somente amizades aceitas podem entrar no grupo.</p>{contacts.map((friend) => <div className="friend-row" key={friend.id}><div className="avatar">{initials(friend.display_name)}</div><span><strong>{friend.display_name}</strong><small>@{friend.nametag}</small></span><button disabled={adding === friend.id} onClick={async () => { setAdding(friend.id); setError(''); try { await addFriendToGroup(group.id, friend.id); await onInvited(); } catch (reason) { setError(errorMessage(reason, 'Não foi possível adicionar.')); } finally { setAdding(''); } }}><Plus size={15} />{adding === friend.id ? 'Adicionando…' : 'Adicionar'}</button></div>)}{!contacts.length && <div className="empty-contacts"><Users size={24} /><strong>Nenhum contato disponível</strong><span>Envie um pedido de amizade e aguarde a pessoa aceitar.</span></div>}{error && <p className="form-error inline-error">{error}</p>}</div></Modal>;
}

export default App;
