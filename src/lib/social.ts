import { requireSupabase } from './supabase';

export type Profile = { id: string; display_name: string; nametag: string; bio: string; avatar_url: string | null; status: string };
export type Group = { id: string; name: string; description: string; avatar_url: string | null; owner_id: string };
export type ChatMessage = { id: string; group_id: string; author_id: string; body: string; created_at: string; profiles?: Pick<Profile, 'display_name' | 'nametag' | 'avatar_url'> };
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

export async function sendMessage(groupId: string, body: string) {
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error('Sessão não encontrada.');
  const { error } = await client.from('messages').insert({ group_id: groupId, author_id: auth.user.id, body });
  if (error) throw error;
}

export function subscribeToMessages(groupId: string, refresh: () => void) {
  const client = requireSupabase();
  const channel = client.channel(`group:${groupId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` }, refresh).subscribe();
  return () => { void client.removeChannel(channel); };
}
