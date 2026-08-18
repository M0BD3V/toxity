import { requireSupabase } from './supabase';

export type Profile = { id: string; display_name: string; nametag: string; bio: string; avatar_url: string | null; status: string };
export type Group = { id: string; name: string; description: string; avatar_url: string | null; owner_id: string };
export type ChatMessage = { id: string; group_id: string; author_id: string; body: string; created_at: string; profiles?: Pick<Profile, 'display_name' | 'nametag' | 'avatar_url'> };
export type DirectMessage = { id: string; sender_id: string; recipient_id: string; body: string; created_at: string; profiles?: Pick<Profile, 'display_name' | 'nametag' | 'avatar_url'> };
export type CallPresence = { group_id: string; user_id: string; sharing: boolean; joined_at: string; updated_at: string; profiles?: Profile };
export type Friendship = { requester_id: string; addressee_id: string; status: 'pending' | 'accepted' | 'blocked'; created_at: string; requester?: Profile; addressee?: Profile };

export async function getMyProfile() {
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error('Sessão não encontrada.');
  const { data, error } = await client.from('profiles').select('*').eq('id', auth.user.id).single();
  if (error) throw error;
  return data as Profile;
}

export async function updateMyProfile(values: Partial<Pick<Profile, 'display_name' | 'bio' | 'status' | 'avatar_url'>>) {
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error('Sessão não encontrada.');
  const { data, error } = await client.from('profiles').update(values).eq('id', auth.user.id).select().single();
  if (error) throw error;
  return data as Profile;
}

export async function addFriendByNametag(namertag: string) {
  const { data, error } = await requireSupabase().rpc('send_friend_request', { target_nametag: namertag.toLowerCase() });
  if (error) throw error;
  return data;
}

export async function listFriendships() {
  const { data, error } = await requireSupabase().from('friendships').select('*, requester:profiles!friendships_requester_id_fkey(*), addressee:profiles!friendships_addressee_id_fkey(*)').order('created_at', { ascending: false });
  if (error) throw error;
  return data as Friendship[];
}

export async function acceptFriendRequest(requesterId: string) {
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error('Sessão não encontrada.');
  const { error } = await client.from('friendships').update({ status: 'accepted' }).eq('requester_id', requesterId).eq('addressee_id', auth.user.id);
  if (error) throw error;
}

export async function createGroup(name: string, description = '') {
  const { data, error } = await requireSupabase().rpc('create_group_with_owner', { group_name: name, group_description: description });
  if (error) throw error;
  return data as string;
}

export async function addFriendToGroup(groupId: string, userId: string) {
  const { data, error } = await requireSupabase().rpc('add_friend_to_group', {
    target_group_id: groupId,
    target_user_id: userId,
  });
  if (error) throw error;
  return data as string;
}

export function subscribeToSocial(refresh: () => void) {
  const client = requireSupabase();
  const channel = client.channel('toxity:social')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, refresh)
    .subscribe();
  return () => { void client.removeChannel(channel); };
}

export async function listGroups() {
  const { data, error } = await requireSupabase().from('groups').select('*, group_members!inner(user_id)').order('created_at');
  if (error) throw error;
  return data as Group[];
}

export async function listMessages(groupId: string) {
  const { data, error } = await requireSupabase().from('messages').select('*, profiles(display_name,nametag,avatar_url)').eq('group_id', groupId).order('created_at').limit(100);
  if (error) throw error;
  return data as ChatMessage[];
}

export async function listGroupMembers(groupId: string) {
  const { data, error } = await requireSupabase().from('group_members').select('role, profiles(*)').eq('group_id', groupId).order('joined_at');
  if (error) throw error;
  return (data ?? []).map((row) => ({ role: row.role as string, profile: row.profiles as unknown as Profile }));
}

export async function deleteGroup(groupId: string) {
  const { error } = await requireSupabase().rpc('delete_owned_group', { target_group_id: groupId });
  if (error) throw error;
}

export async function listDirectMessages(friendId: string) {
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error('Sessão não encontrada.');
  const { data, error } = await client.from('direct_messages').select('*, profiles!direct_messages_sender_id_fkey(display_name,nametag,avatar_url)').or(`and(sender_id.eq.${auth.user.id},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${auth.user.id})`).order('created_at').limit(100);
  if (error) throw error;
  return data as DirectMessage[];
}

export async function sendDirectMessage(friendId: string, body: string) {
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error('Sessão não encontrada.');
  const { error } = await client.from('direct_messages').insert({ sender_id: auth.user.id, recipient_id: friendId, body });
  if (error) throw error;
}

export async function listCallPresence(groupId: string) {
  const cutoff = new Date(Date.now() - 35_000).toISOString();
  const { data, error } = await requireSupabase().from('call_presence').select('*, profiles(*)').eq('group_id', groupId).gte('updated_at', cutoff).order('joined_at');
  if (error) throw error;
  return data as CallPresence[];
}

export async function setCallPresence(groupId: string, sharing: boolean) {
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error('Sessão não encontrada.');
  const { error } = await client.from('call_presence').upsert({ group_id: groupId, user_id: auth.user.id, sharing, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function clearCallPresence(groupId: string) {
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return;
  await client.from('call_presence').delete().eq('group_id', groupId).eq('user_id', auth.user.id);
}

export function subscribeToDirectMessages(refresh: () => void) {
  const client = requireSupabase();
  const channel = client.channel('toxity:direct-messages').on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, refresh).subscribe();
  const fallback = window.setInterval(refresh, 1500);
  return () => { window.clearInterval(fallback); void client.removeChannel(channel); };
}

export function subscribeToCallPresence(groupId: string, refresh: () => void) {
  const client = requireSupabase();
  const channel = client.channel(`toxity:call:${groupId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'call_presence', filter: `group_id=eq.${groupId}` }, refresh).subscribe();
  const fallback = window.setInterval(refresh, 3000);
  return () => { window.clearInterval(fallback); void client.removeChannel(channel); };
}

export async function sendMessage(groupId: string, body: string) {
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error('Sessão não encontrada.');
  const { error } = await client.from('messages').insert({ group_id: groupId, author_id: auth.user.id, body });
  if (error) throw error;
}

export function subscribeToMessages(groupId: string, refresh: () => void) {
  const client = requireSupabase();
  const channel = client.channel(`group:${groupId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` }, refresh).subscribe((status) => {
    if (status === 'SUBSCRIBED') refresh();
  });
  const fallback = window.setInterval(refresh, 1500);
  return () => { window.clearInterval(fallback); void client.removeChannel(channel); };
}
