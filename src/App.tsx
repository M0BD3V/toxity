import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell, Check, ChevronDown, CircleHelp, Hash, Headphones, LogOut, Mic, MonitorUp,
  PhoneCall, Plus, Search, Settings, UserPlus, Users, Video, Volume2, Send, X,
} from 'lucide-react';
import { requireSupabase } from './lib/supabase';
import {
  acceptFriendRequest, addFriendByNametag, createGroup, getMyProfile, listFriendships,
  listGroupMembers, listGroups, listMessages, sendMessage, subscribeToMessages, updateMyProfile,
  type ChatMessage, type Friendship, type Group, type Profile,
} from './lib/social';
import { ToxityCall } from './lib/call';

type Dialog = 'group' | 'friend' | 'profile' | null;
type Member = { role: string; profile: Profile };

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
  const mediaRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<ToxityCall | null>(null);
  const activeGroup = useMemo(() => groups.find((group) => group.id === activeGroupId), [groups, activeGroupId]);

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
    catch (error) { setDraft(body); setNotice(error instanceof Error ? error.message : 'Não foi possível enviar.'); }
  }

  async function joinCall() {
    if (!activeGroupId || !profile || !mediaRef.current) return;
    try {
      if (!callRef.current) callRef.current = new ToxityCall(mediaRef.current);
      if (!inCall) await callRef.current.connect(activeGroupId, profile.display_name);
      setInCall(true); setNotice('Conectado à call.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Falha ao conectar à call.'); }
  }

  async function toggleScreen() {
    await joinCall();
    if (!callRef.current) return;
    try { setSharing(await callRef.current.toggleScreen()); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Compartilhamento cancelado.'); }
  }

  function leaveCall() {
    callRef.current?.disconnect(); callRef.current = null;
    setInCall(false); setSharing(false); setCamera(false);
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
        <div className="top-actions"><button title="Notificações"><Bell size={19} /></button><button title="Amigos" onClick={() => setDialog('friend')}><Users size={19} /></button><label className="search"><Search size={16} /><input placeholder="Buscar" /></label><button title="Ajuda"><CircleHelp size={19} /></button></div>
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
      <div className="call-card">
        <div className="call-card-head"><span><Volume2 size={17} /> Sala principal</span><small>{inCall ? 'conectado' : 'pronto'}</small></div>
        <div ref={mediaRef} className={`stream-preview media-stage ${sharing ? 'sharing' : ''}`}>{!sharing && !camera && <><img src="/assets/brand/svg/toxity-symbol.svg" alt="" /><strong>{inCall ? 'Você está na call' : 'Pronto para compartilhar?'}</strong><small>{activeGroup ? 'Mostre sua tela para o grupo.' : 'Selecione um grupo.'}</small></>}</div>
        <div className="call-actions"><button disabled={!activeGroup} className="primary" onClick={() => void toggleScreen()}><MonitorUp size={17} />{sharing ? 'Parar' : 'Compartilhar'}</button><button disabled={!activeGroup} onClick={async () => { await joinCall(); if (callRef.current) setCamera(await callRef.current.toggleCamera()); }} title="Câmera"><Video size={18} /></button></div>
      </div>
      <div className="member-heading"><span>MEMBROS — {members.length}</span><button title="Adicionar amigo" onClick={() => setDialog('friend')}><UserPlus size={17} /></button></div>
      <div className="member-list">{members.map(({ role, profile: member }) => <div className="member" key={member.id}><div className="avatar member-avatar">{initials(member.display_name)}<span /></div><div><strong>{member.display_name}</strong><small>@{member.nametag} · {role}</small></div></div>)}</div>
    </aside>

    {notice && <div className="toast"><span>{notice}</span><button onClick={() => setNotice('')}><X size={15} /></button></div>}
    {dialog === 'group' && <GroupDialog onClose={() => setDialog(null)} onCreated={async (id) => { await loadSidebar(); setActiveGroupId(id); setDialog(null); setNotice('Grupo criado.'); }} />}
    {dialog === 'friend' && <FriendDialog profile={profile} friendships={friendships} onClose={() => setDialog(null)} onChanged={loadSidebar} />}
    {dialog === 'profile' && profile && <ProfileDialog profile={profile} onClose={() => setDialog(null)} onSaved={(next) => { setProfile(next); setDialog(null); setNotice('Perfil atualizado.'); }} />}
  </div>;
}

function ChannelGroup({ title, label, active, icon, onClick }: { title: string; label: string; active: boolean; icon: 'text' | 'voice'; onClick?: () => void }) {
  return <section className="channel-group"><header><span>{title}</span></header><button className={active ? 'active' : ''} onClick={onClick}>{icon === 'text' ? <Hash size={18} /> : <Volume2 size={18} />}<span>{label}</span></button></section>;
}

function EmptyGroups({ onCreate }: { onCreate: () => void }) { return <div className="empty-groups"><img src="/assets/brand/svg/toxity-symbol.svg" alt="" /><strong>Crie sua primeira sintonia</strong><p>Um grupo reúne mensagens, pessoas e chamadas.</p><button onClick={onCreate}><Plus size={16} /> Criar grupo</button></div>; }

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) { return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card"><header><h2>{title}</h2><button onClick={onClose}><X /></button></header>{children}</section></div>; }

function GroupDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => Promise<void> }) {
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  return <Modal title="Novo grupo" onClose={onClose}><form className="modal-form" onSubmit={async (event) => { event.preventDefault(); setLoading(true); setError(''); const data = new FormData(event.currentTarget); try { await onCreated(await createGroup(String(data.get('name')), String(data.get('description')))); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao criar.'); setLoading(false); } }}><label>Nome<input name="name" minLength={2} maxLength={60} required autoFocus /></label><label>Descrição<textarea name="description" maxLength={240} /></label>{error && <p className="form-error">{error}</p>}<button className="modal-primary" disabled={loading}>{loading ? 'Criando…' : 'Criar grupo'}</button></form></Modal>;
}

function FriendDialog({ profile, friendships, onClose, onChanged }: { profile: Profile | null; friendships: Friendship[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const incoming = friendships.filter((item) => item.status === 'pending' && item.addressee_id === profile?.id);
  const accepted = friendships.filter((item) => item.status === 'accepted');
  return <Modal title="Pessoas" onClose={onClose}><form className="friend-add" onSubmit={async (event) => { event.preventDefault(); setError(''); setMessage(''); const data = new FormData(event.currentTarget); try { await addFriendByNametag(String(data.get('nametag')).replace(/^@/, '')); setMessage('Pedido enviado.'); await onChanged(); event.currentTarget.reset(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível adicionar.'); } }}><label>Adicionar por nametag<div><span>@</span><input name="nametag" placeholder="nametag" required pattern="[a-zA-Z0-9_]{3,20}" /><button><UserPlus size={16} /> Enviar</button></div></label></form>{error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}<div className="friend-section"><h3>Pedidos recebidos</h3>{incoming.map((item) => <div className="friend-row" key={item.requester_id}><div className="avatar">{initials(item.requester?.display_name)}</div><span><strong>{item.requester?.display_name}</strong><small>@{item.requester?.nametag}</small></span><button onClick={async () => { await acceptFriendRequest(item.requester_id); await onChanged(); }}><Check size={16} /> Aceitar</button></div>)}{!incoming.length && <p>Nenhum pedido pendente.</p>}</div><div className="friend-section"><h3>Amigos</h3>{accepted.map((item) => { const friend = item.requester_id === profile?.id ? item.addressee : item.requester; return <div className="friend-row" key={`${item.requester_id}-${item.addressee_id}`}><div className="avatar">{initials(friend?.display_name)}</div><span><strong>{friend?.display_name}</strong><small>@{friend?.nametag}</small></span></div>; })}{!accepted.length && <p>Sua lista ainda está vazia.</p>}</div></Modal>;
}

function ProfileDialog({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: (profile: Profile) => void }) {
  return <Modal title="Seu perfil" onClose={onClose}><form className="modal-form" onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); onSaved(await updateMyProfile({ display_name: String(data.get('displayName')), bio: String(data.get('bio')), status: String(data.get('status')) as Profile['status'] })); }}><label>Nome<input name="displayName" defaultValue={profile.display_name} minLength={2} maxLength={32} required /></label><label>Nametag<input value={`@${profile.nametag}`} disabled /></label><label>Bio<textarea name="bio" defaultValue={profile.bio} maxLength={280} /></label><label>Status<select name="status" defaultValue={profile.status}><option value="online">Online</option><option value="away">Ausente</option><option value="busy">Ocupado</option><option value="offline">Offline</option></select></label><button className="modal-primary">Salvar perfil</button><button type="button" className="logout-button" onClick={() => void requireSupabase().auth.signOut()}><LogOut size={16} /> Sair da conta</button></form></Modal>;
}

export default App;
