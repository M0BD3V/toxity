import { requireSupabase } from "./supabase";

export type Profile = {
  id: string;
  display_name: string;
  nametag: string;
  bio: string;
  avatar_url: string | null;
  status: string;
};
export type Group = {
  id: string;
  name: string;
  description: string;
  avatar_url: string | null;
  owner_id: string;
};
export type ChannelAccessMode = "public" | "read_only" | "locked" | "private";
export type GroupChannel = {
  id: string;
  group_id: string;
  name: string;
  type: "text" | "voice";
  position: number;
  created_by: string;
  access_mode: ChannelAccessMode;
};
type AttachmentFields = {
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  attachment_url?: string;
};
export type ChatMessage = AttachmentFields & {
  id: string;
  group_id: string;
  author_id: string;
  body: string;
  created_at: string;
  profiles?: Pick<Profile, "display_name" | "nametag" | "avatar_url">;
};
export type DirectMessage = AttachmentFields & {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  profiles?: Pick<Profile, "display_name" | "nametag" | "avatar_url">;
};
export type CallPresence = {
  group_id: string;
  channel_id: string | null;
  user_id: string;
  sharing: boolean;
  joined_at: string;
  updated_at: string;
  profiles?: Profile;
};
export type Friendship = {
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "blocked";
  created_at: string;
  requester?: Profile;
  addressee?: Profile;
};
export type UserPresence = {
  user_id: string;
  state: "online" | "background" | "away" | "offline";
  focused: boolean;
  idle_seconds: number;
  updated_at: string;
};

export async function getMyProfile() {
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sessão não encontrada.");
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function updateMyProfile(
  values: Partial<
    Pick<Profile, "display_name" | "bio" | "status" | "avatar_url">
  >,
) {
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sessão não encontrada.");
  const { data, error } = await client
    .from("profiles")
    .update(values)
    .eq("id", auth.user.id)
    .select()
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function addFriendByNametag(namertag: string) {
  const { data, error } = await requireSupabase().rpc("send_friend_request", {
    target_nametag: namertag.toLowerCase(),
  });
  if (error) throw error;
  return data;
}

export async function listFriendships() {
  const { data, error } = await requireSupabase()
    .from("friendships")
    .select(
      "*, requester:profiles!friendships_requester_id_fkey(*), addressee:profiles!friendships_addressee_id_fkey(*)",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Friendship[];
}

export async function acceptFriendRequest(requesterId: string) {
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sessão não encontrada.");
  const { error } = await client
    .from("friendships")
    .update({ status: "accepted" })
    .eq("requester_id", requesterId)
    .eq("addressee_id", auth.user.id);
  if (error) throw error;
}

export async function createGroup(name: string, description = "") {
  const { data, error } = await requireSupabase().rpc(
    "create_group_with_owner",
    { group_name: name, group_description: description },
  );
  if (error) throw error;
  return data as string;
}

export async function addFriendToGroup(groupId: string, userId: string) {
  const { data, error } = await requireSupabase().rpc("add_friend_to_group", {
    target_group_id: groupId,
    target_user_id: userId,
  });
  if (error) throw error;
  return data as string;
}

export function subscribeToSocial(refresh: () => void) {
  const client = requireSupabase();
  const channel = client
    .channel("toxity:social")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "friendships" },
      refresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "group_members" },
      refresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "group_channels" },
      refresh,
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

export function subscribeToGroupChannels(groupId: string, refresh: () => void) {
  const client = requireSupabase();
  const channel = client
    .channel(`toxity:channels:${groupId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "group_channels",
        filter: `group_id=eq.${groupId}`,
      },
      refresh,
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

export async function listPresence() {
  const cutoff = new Date(Date.now() - 45_000).toISOString();
  const { data, error } = await requireSupabase()
    .from("user_presence")
    .select("*");
  if (error) throw error;
  return (data as UserPresence[]).map((item) =>
    item.updated_at < cutoff ? { ...item, state: "offline" as const } : item,
  );
}

export async function setUserPresence(
  state: UserPresence["state"],
  focused: boolean,
  idleSeconds: number,
) {
  const client = requireSupabase();
  const { data } = await client.auth.getUser();
  if (!data.user) return;
  const { error } = await client.from("user_presence").upsert({
    user_id: data.user.id,
    state,
    focused,
    idle_seconds: idleSeconds,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export function subscribeToPresence(refresh: () => void) {
  const client = requireSupabase();
  const channel = client
    .channel("toxity:presence")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_presence" },
      refresh,
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

export async function configureChannel(
  channelId: string,
  mode: ChannelAccessMode,
  allowedUsers: string[],
) {
  const { error } = await requireSupabase().rpc("configure_channel", {
    target_channel_id: channelId,
    target_mode: mode,
    allowed_users: allowedUsers,
  });
  if (error) throw error;
}

export async function setGroupRole(
  groupId: string,
  userId: string,
  role: "admin" | "member",
) {
  const { error } = await requireSupabase().rpc("set_group_role", {
    target_group_id: groupId,
    target_user_id: userId,
    target_role: role,
  });
  if (error) throw error;
}

export async function banGroupMember(groupId: string, userId: string) {
  const { error } = await requireSupabase().rpc("ban_group_member", {
    target_group_id: groupId,
    target_user_id: userId,
  });
  if (error) throw error;
}

export async function listGroups() {
  const { data, error } = await requireSupabase()
    .from("groups")
    .select("*, group_members!inner(user_id)")
    .order("created_at");
  if (error) throw error;
  return data as Group[];
}

export async function listMessages(channelId: string) {
  const { data, error } = await requireSupabase()
    .from("messages")
    .select("*, profiles(display_name,nametag,avatar_url)")
    .eq("channel_id", channelId)
    .order("created_at")
    .limit(100);
  if (error) throw error;
  return addSignedAttachmentUrls(data as ChatMessage[]);
}

export async function listGroupMembers(groupId: string) {
  const { data, error } = await requireSupabase()
    .from("group_members")
    .select("role, profiles(*)")
    .eq("group_id", groupId)
    .order("joined_at");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    role: row.role as string,
    profile: row.profiles as unknown as Profile,
  }));
}

export async function listGroupChannels(groupId: string) {
  const { data, error } = await requireSupabase()
    .from("group_channels")
    .select("*")
    .eq("group_id", groupId)
    .order("position");
  if (error) throw error;
  return data as GroupChannel[];
}

export async function createGroupChannel(
  groupId: string,
  name: string,
  type: "text" | "voice",
  mode: ChannelAccessMode = "public",
) {
  const { data, error } = await requireSupabase().rpc("create_group_channel", {
    target_group_id: groupId,
    channel_name: name,
    channel_type: type,
  });
  if (error) throw error;
  if (mode !== "public") await configureChannel(data as string, mode, []);
  return data as string;
}

export async function deleteGroup(groupId: string) {
  const { error } = await requireSupabase().rpc("delete_owned_group", {
    target_group_id: groupId,
  });
  if (error) throw error;
}

export async function renameGroup(groupId: string, name: string) {
  const { error } = await requireSupabase().rpc("rename_owned_group", {
    target_group_id: groupId,
    next_name: name.trim(),
  });
  if (error) throw error;
}

export async function leaveGroup(groupId: string) {
  const { error } = await requireSupabase().rpc("leave_group", {
    target_group_id: groupId,
  });
  if (error) throw error;
}

export async function listDirectMessages(friendId: string) {
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sessão não encontrada.");
  const { data, error } = await client
    .from("direct_messages")
    .select(
      "*, profiles!direct_messages_sender_id_fkey(display_name,nametag,avatar_url)",
    )
    .or(
      `and(sender_id.eq.${auth.user.id},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${auth.user.id})`,
    )
    .order("created_at")
    .limit(100);
  if (error) throw error;
  return addSignedAttachmentUrls(data as DirectMessage[]);
}

export async function sendDirectMessage(
  friendId: string,
  body: string,
  attachment?: UploadedAttachment,
) {
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sessão não encontrada.");
  const { error } = await client.from("direct_messages").insert({
    sender_id: auth.user.id,
    recipient_id: friendId,
    body,
    ...attachment,
  });
  if (error) throw error;
}

export async function listCallPresence(groupId: string, channelId?: string) {
  const cutoff = new Date(Date.now() - 35_000).toISOString();
  let query = requireSupabase()
    .from("call_presence")
    .select("*, profiles(*)")
    .eq("group_id", groupId)
    .gte("updated_at", cutoff)
    .order("joined_at");
  if (channelId) query = query.eq("channel_id", channelId);
  const { data, error } = await query;
  if (error) throw error;
  return data as CallPresence[];
}

export async function setCallPresence(
  groupId: string,
  channelId: string,
  sharing: boolean,
) {
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sessão não encontrada.");
  const { error } = await client.from("call_presence").upsert({
    group_id: groupId,
    channel_id: channelId,
    user_id: auth.user.id,
    sharing,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function clearCallPresence(groupId: string) {
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return;
  await client
    .from("call_presence")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", auth.user.id);
}

export function subscribeToDirectMessages(refresh: () => void) {
  const client = requireSupabase();
  const channel = client
    .channel("toxity:direct-messages")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "direct_messages" },
      refresh,
    )
    .subscribe();
  const fallback = window.setInterval(refresh, 1500);
  return () => {
    window.clearInterval(fallback);
    void client.removeChannel(channel);
  };
}

export function subscribeToCallPresence(groupId: string, refresh: () => void) {
  const client = requireSupabase();
  const channel = client
    .channel(`toxity:call:${groupId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "call_presence",
        filter: `group_id=eq.${groupId}`,
      },
      refresh,
    )
    .subscribe();
  const fallback = window.setInterval(refresh, 3000);
  return () => {
    window.clearInterval(fallback);
    void client.removeChannel(channel);
  };
}

export type UploadedAttachment = {
  attachment_path: string;
  attachment_name: string;
  attachment_mime: string;
  attachment_size: number;
};

export async function uploadAttachment(file: File) {
  if (file.size > 25 * 1024 * 1024)
    throw new Error("O arquivo deve ter no máximo 25 MB.");
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sessão não encontrada.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${auth.user.id}/${crypto.randomUUID()}/${safeName}`;
  const { error } = await client.storage
    .from("message-attachments")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
    });
  if (error) throw error;
  return {
    attachment_path: path,
    attachment_name: file.name,
    attachment_mime: file.type || "application/octet-stream",
    attachment_size: file.size,
  } as UploadedAttachment;
}

async function addSignedAttachmentUrls<T extends AttachmentFields>(
  messages: T[],
) {
  const paths = messages
    .map((message) => message.attachment_path)
    .filter((path): path is string => Boolean(path));
  if (!paths.length) return messages;
  const { data } = await requireSupabase()
    .storage.from("message-attachments")
    .createSignedUrls(paths, 3600);
  const urls = new Map((data ?? []).map((item) => [item.path, item.signedUrl]));
  return messages.map((message) => ({
    ...message,
    attachment_url: message.attachment_path
      ? urls.get(message.attachment_path)
      : undefined,
  }));
}

export async function sendMessage(
  groupId: string,
  channelId: string,
  body: string,
  attachment?: UploadedAttachment,
) {
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sessão não encontrada.");
  const { error } = await client.from("messages").insert({
    group_id: groupId,
    channel_id: channelId,
    author_id: auth.user.id,
    body,
    ...attachment,
  });
  if (error) throw error;
}

export function subscribeToMessages(channelId: string, refresh: () => void) {
  const client = requireSupabase();
  const channel = client
    .channel(`messages:${channelId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "messages",
        filter: `channel_id=eq.${channelId}`,
      },
      refresh,
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") refresh();
    });
  const fallback = window.setInterval(refresh, 1500);
  return () => {
    window.clearInterval(fallback);
    void client.removeChannel(channel);
  };
}

export async function uploadAvatar(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Escolha uma imagem.");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("A foto deve ter no máximo 5 MB.");
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sessão não encontrada.");
  const extension = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${auth.user.id}/avatar-${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  return client.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}
