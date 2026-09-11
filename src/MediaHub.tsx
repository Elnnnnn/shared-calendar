/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const MEDIA_API = "https://yytyntrgqkddfsliooke.supabase.co/functions/v1/shared-calendar-media-proxy";
const ELAINE_EMAIL = "elainezhang1110@gmail.com";
type GroupKey = "besties" | "friends" | "both";
type Member = { email: string; display_name: string; color: string };
type Photo = { id: string; group_key: GroupKey; uploader_email: string; event_id: number | null; file_name: string; created_at: string };
type Album = { id: number; name: string; group_key: GroupKey; owner_email: string; cover_photo_id: string | null; created_at: string };
type Moment = { id: number; group_key: GroupKey; author_email: string; caption: string; event_id: number | null; source_event_mood_id: number | null; source_event_photo_id: string | null; created_at: string };
type MomentPhoto = { moment_id: number; photo_id: string; position: number };
type Like = { moment_id: number; user_id: string; user_email: string; created_at?: string; read_at?: string | null };
type Comment = { id: number; moment_id: number; author_user_id: string; author_email: string; body: string; created_at: string; reply_to_comment_id: number | null; reply_to_event_mood_id: number | null; reply_to_user_id: string | null; reply_to_email: string | null; reply_read_at: string | null };
type EventMood = { id: number; event_id: number; author_user_id: string; author_email: string; body: string; created_at: string };
type ReplyTarget = { momentId: number; kind: "comment" | "mood"; id: number; email: string };
type MomentStats = { moment_id: number; like_count: number; comment_count: number; liked_by_me: boolean };
type MomentNotification = { key: string; momentId: number; actorEmail: string; kind: "like" | "reply"; createdAt: string; unread: boolean };
type CalendarEvent = { id: number; title: string; date: string; owner: string; participants: string[]; audienceGroup?: GroupKey };
type EventPhotoLink = { event_id: number; photo_id: string };

function groupLabel(group: GroupKey) { return group === "besties" ? "闺蜜组" : group === "friends" ? "朋友组" : "两个组"; }
function allowedGroups(email: string): GroupKey[] {
  return email.toLowerCase() === ELAINE_EMAIL ? ["besties", "friends"] : email.toLowerCase() === "test@test.com" ? ["friends"] : ["besties"];
}
function displayName(email: string, members: Member[]) { return members.find((m) => m.email.toLowerCase() === email.toLowerCase())?.display_name || email.split("@")[0]; }
function fileKey(file: File) { return `${file.name}:${file.size}:${file.lastModified}`; }

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

async function uploadPhoto(file: File, group: GroupKey, eventId?: number | null) {
  const accessToken = await token();
  const query = new URLSearchParams({ group });
  if (eventId) query.set("event_id", String(eventId));
  const response = await fetch(`${MEDIA_API}/photos?${query}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": file.type,
      "X-File-Name": encodeURIComponent(file.name),
      "X-File-Size": String(file.size),
    },
    body: file,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "上传失败");
  return result as Photo;
}

const photoUrlCache = new Map<string, string>();
const photoRequestCache = new Map<string, Promise<string>>();

async function loadPhotoUrl(photoId: string) {
  const cached = photoUrlCache.get(photoId);
  if (cached) return cached;
  const pending = photoRequestCache.get(photoId);
  if (pending) return pending;
  const request = (async () => {
    const accessToken = await token();
    const response = await fetch(`${MEDIA_API}/photos/${photoId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error("照片载入失败");
    const objectUrl = URL.createObjectURL(await response.blob());
    photoUrlCache.set(photoId, objectUrl);
    return objectUrl;
  })().finally(() => photoRequestCache.delete(photoId));
  photoRequestCache.set(photoId, request);
  return request;
}

function ProtectedPhoto({ photo, alt = "共享照片" }: { photo: Photo; alt?: string }) {
  const [src, setSrc] = useState(() => photoUrlCache.get(photo.id) || "");
  const placeholderRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let cancelled = false;
    const cached = photoUrlCache.get(photo.id);
    if (cached) { setSrc(cached); return; }
    const load = () => { void loadPhotoUrl(photo.id).then((url) => { if (!cancelled) setSrc(url); }).catch(() => undefined); };
    const target = placeholderRef.current;
    if (!target || !("IntersectionObserver" in window)) load();
    else {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        load();
      }, { rootMargin: "240px" });
      observer.observe(target);
      return () => { cancelled = true; observer.disconnect(); };
    }
    return () => { cancelled = true; };
  }, [photo.id]);
  return src ? <img src={src} alt={alt} loading="lazy" decoding="async" /> : <span ref={placeholderRef} className="media-photo-loading">照片载入中…</span>;
}

function GroupSelect({ value, onChange, email, options }: { value: GroupKey; onChange: (group: GroupKey) => void; email: string; options?: GroupKey[] }) {
  const groups = options || allowedGroups(email);
  const [open, setOpen] = useState(false);
  if (groups.length === 1) return <span className="media-group-label">{groupLabel(groups[0])}</span>;
  return <div className="themed-dropdown"><button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{groupLabel(value)}<span>⌄</span></button>{open && <div className="themed-dropdown-menu">{groups.map((group) => <button type="button" className={value === group ? "selected" : ""} key={group} onClick={() => { onChange(group); setOpen(false); }}>{groupLabel(group)}</button>)}</div>}</div>;
}

export function EventMediaPanel({ event, user, member, members }: { event: CalendarEvent; user: User; member: Member; members: Member[] }) {
  const groups: GroupKey[] = event.audienceGroup === "besties"
    ? ["besties"]
    : event.audienceGroup === "friends"
      ? ["friends"]
      : member.email.toLowerCase() === ELAINE_EMAIL
        ? ["besties", "friends", "both"]
        : allowedGroups(member.email);
  const [group, setGroup] = useState<GroupKey>(groups[0]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [eventLinks, setEventLinks] = useState<EventPhotoLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mood, setMood] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [moods, setMoods] = useState<EventMood[]>([]);
  const [eventMoment, setEventMoment] = useState<Moment | null>(null);
  const [shareToMoment, setShareToMoment] = useState(false);
  const [pendingPhotoId, setPendingPhotoId] = useState<string | null | undefined>(undefined);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  async function load() {
    const [photoResult, linkResult, moodResult, momentResult] = await Promise.all([
      supabase.from("shared_calendar_photos").select("id,group_key,uploader_email,event_id,file_name,created_at").order("created_at", { ascending: false }),
      supabase.from("shared_calendar_event_photos").select("event_id,photo_id").eq("event_id", event.id),
      supabase.from("shared_calendar_event_moods").select("id,event_id,author_user_id,author_email,body,created_at").eq("event_id", event.id).order("created_at"),
      supabase.from("shared_calendar_moments").select("*").eq("event_id", event.id).maybeSingle(),
    ]);
    if (photoResult.error || linkResult.error || moodResult.error || momentResult.error) setMessage("活动内容读取失败");
    else {
      const existingMoment = momentResult.data as Moment | null;
      setPhotos((photoResult.data || []) as Photo[]);
      setEventLinks((linkResult.data || []) as EventPhotoLink[]);
      setMoods((moodResult.data || []) as EventMood[]);
      setEventMoment(existingMoment);
      if (existingMoment) setShareToMoment(false);
    }
  }
  useEffect(() => { setPendingPhotoId(undefined); setMood(""); setShareToMoment(false); void load(); }, [event.id]);
  useEffect(() => { setGroup(groups[0]); }, [event.id, event.audienceGroup]);
  async function add(eventInput: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(eventInput.target.files || []);
    if (!files.length) return;
    if (eventPhoto) { setMessage("每个活动只能添加一张照片，请先移除原照片再更换。"); eventInput.target.value = ""; return; }
    setUploadingPhoto(true); setMessage("");
    try {
      const photo = await uploadPhoto(files[0], group);
      setPhotos((current) => [photo, ...current.filter((item) => item.id !== photo.id)]);
      setPendingPhotoId(photo.id);
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "上传失败"); }
    finally { setUploadingPhoto(false); eventInput.target.value = ""; }
  }
  function remove() {
    setMessage("");
    setPendingPhotoId(null);
  }
  async function chooseExisting(photo: Photo) {
    setMessage("");
    setPendingPhotoId(photo.id);
    setLibraryOpen(false);
  }
  async function deleteMood(entry: EventMood) {
    setMessage("");
    const { error } = await supabase.from("shared_calendar_event_moods").delete().eq("id", entry.id).eq("author_user_id", user.id);
    if (error) { setMessage("评论删除失败"); return; }
    setMoods((current) => current.filter((item) => item.id !== entry.id));
    setEventMoment((current) => current?.source_event_mood_id === entry.id ? { ...current, caption: "", source_event_mood_id: null } : current);
  }
  const savedPhotoId = eventLinks[0]?.photo_id;
  const selectedPhotoId = pendingPhotoId === undefined ? savedPhotoId : pendingPhotoId;
  const eventPhoto = photos.find((photo) => photo.id === selectedPhotoId);
  const libraryPhotos = photos.filter((photo) => photo.id !== selectedPhotoId && photo.group_key === group);
  const hasDraft = pendingPhotoId !== undefined || Boolean(mood.trim()) || shareToMoment;
  async function saveActivityMedia() {
    if (!hasDraft) { setMessage("已保存"); return; }
    setBusy(true); setPublishing(shareToMoment); setMessage("");
    try {
      if (pendingPhotoId !== undefined) {
        if (savedPhotoId) {
          const { error } = await supabase.from("shared_calendar_event_photos").delete().eq("event_id", event.id).eq("photo_id", savedPhotoId);
          if (error) throw error;
        }
        if (pendingPhotoId) {
          const { error } = await supabase.from("shared_calendar_event_photos").insert({ event_id: event.id, photo_id: pendingPhotoId, linked_by_user_id: user.id, linked_by_email: member.email });
          if (error) throw error;
        }
      }
      if (mood.trim()) {
        const { data: savedMood, error } = await supabase.from("shared_calendar_event_moods").insert({ event_id: event.id, author_user_id: user.id, author_email: member.email, body: mood.trim() }).select("id").single();
        if (error) throw error;
        if (shareToMoment && !eventMoment) {
          const momentGroup: GroupKey = allowedGroups(member.email).includes("besties") ? "besties" : group;
          const { data, error: momentError } = await supabase.from("shared_calendar_moments").insert({ group_key: momentGroup, author_user_id: user.id, author_email: member.email, caption: mood.trim(), event_id: event.id, source_event_mood_id: savedMood.id, source_event_photo_id: selectedPhotoId || null }).select().single();
          if (momentError) throw momentError;
          if (selectedPhotoId) {
            const { error: linkError } = await supabase.from("shared_calendar_moment_photos").insert({ moment_id: data.id, photo_id: selectedPhotoId, position: 0 });
            if (linkError) throw linkError;
          }
        }
      } else if (shareToMoment && !eventMoment) {
        const momentGroup: GroupKey = allowedGroups(member.email).includes("besties") ? "besties" : group;
        const { data, error } = await supabase.from("shared_calendar_moments").insert({ group_key: momentGroup, author_user_id: user.id, author_email: member.email, caption: "", event_id: event.id, source_event_mood_id: null, source_event_photo_id: selectedPhotoId || null }).select().single();
        if (error) throw error;
        if (selectedPhotoId) {
          const { error: linkError } = await supabase.from("shared_calendar_moment_photos").insert({ moment_id: data.id, photo_id: selectedPhotoId, position: 0 });
          if (linkError) throw linkError;
        }
      }
      setPendingPhotoId(undefined); setMood(""); setShareToMoment(false); setMessage(shareToMoment ? "已保存并发布到动态" : "已保存"); await load();
    } catch (error) { setMessage((error as { code?: string })?.code === "23505" ? "这个活动已经发布过动态了" : error instanceof Error ? error.message : "保存失败"); }
    finally { setBusy(false); setPublishing(false); }
  }
  const selectedGroups = group === "both" ? ["besties", "friends"] : [group];
  function toggleGroup(next: "besties" | "friends") {
    const has = selectedGroups.includes(next);
    if (has && selectedGroups.length === 1) return;
    const nextGroups = has ? selectedGroups.filter((item) => item !== next) : [...selectedGroups, next];
    setGroup(nextGroups.length === 2 ? "both" : nextGroups[0] as GroupKey);
  }
  return <section className="event-media-panel">
    <div className="event-media-heading"><div><h3>活动照片</h3><p>{eventPhoto ? "1 张照片" : "为这次活动留下一张照片"}</p></div>{groups.length === 1 ? <span className="media-group-label">{groupLabel(groups[0])}</span> : <div className="event-group-picker"><button type="button" aria-expanded={groupMenuOpen} onClick={()=>setGroupMenuOpen((open)=>!open)}>分组 <small>{selectedGroups.length} 个</small><span>⌄</span></button>{groupMenuOpen&&<div className="event-group-menu"><label><input type="checkbox" checked={selectedGroups.includes("besties")} onChange={()=>toggleGroup("besties")}/><span>闺蜜组</span></label><label><input type="checkbox" checked={selectedGroups.includes("friends")} onChange={()=>toggleGroup("friends")}/><span>朋友组</span></label></div>}</div>}</div>
    {eventPhoto && <div className="event-cover"><ProtectedPhoto photo={eventPhoto} alt={`${event.title} 封面`}/><button onClick={remove} aria-label="移除活动照片" title="保存后从活动移除，原图仍保留在相册">×</button></div>}
    {!eventPhoto && <div className="event-photo-actions"><label className="media-file-picker">＋ 从设备上传<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={add}/><span>{uploadingPhoto?"正在上传…":"选择照片"}</span></label><button type="button" className="event-library-picker" onClick={()=>setLibraryOpen(true)}><span>＋ 从相册上传</span><b>选择照片</b></button></div>}
    {libraryOpen && <div className="photo-picker"><div className="photo-picker-head"><b>选择已有照片</b><button onClick={()=>setLibraryOpen(false)}>×</button></div><div className="photo-library-grid">{libraryPhotos.map((photo)=><button key={photo.id} onClick={()=>chooseExisting(photo)} disabled={busy}><ProtectedPhoto photo={photo}/></button>)}</div>{!libraryPhotos.length&&<p>这个组的相册里还没有可选照片</p>}</div>}
    <div className="event-mood-list">{moods.map((entry)=>{const color=members.find((item)=>item.email.toLowerCase()===entry.author_email.toLowerCase())?.color||"stone";const canDelete=entry.author_user_id===user.id;return <div key={entry.id}><span className={`moment-avatar ${color}`}>{displayName(entry.author_email,members).slice(0,1)}</span><p><b>{displayName(entry.author_email,members)}</b><span>{entry.body}</span>{canDelete&&<button type="button" className="event-mood-delete" onClick={()=>deleteMood(entry)}>删除</button>}</p></div>})}</div>
    <label className="event-mood-field">写心情<textarea value={mood} onChange={(input)=>setMood(input.target.value)} placeholder="记录这一刻……"/></label>
    {eventMoment
      ? <p className="event-moment-compact">已发布动态 · 新心情会同步为评论</p>
      : <div className="event-moment-row"><label className="event-moment-option"><input type="checkbox" checked={shareToMoment} onChange={(input)=>setShareToMoment(input.target.checked)}/><b>发布到动态</b></label><small>可选</small></div>}
    <div className="event-mood-actions single"><button className="primary" type="button" disabled={busy || uploadingPhoto} onClick={saveActivityMedia}>{busy?(publishing?"正在保存并发布…":"正在保存…"):shareToMoment?"保存并发布":"保存"}</button></div>
    {message&&<p className={message.startsWith("已保存") ? "media-success" : "media-error"}>{message}</p>}
  </section>;
}

export function MomentsPage({ user, member, members }: { user: User; member: Member; members: Member[] }) {
  const PAGE_SIZE = 10;
  const groups = allowedGroups(member.email);
  const [group, setGroup] = useState<GroupKey>(groups[0]);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [links, setLinks] = useState<MomentPhoto[]>([]);
  const [likes, setLikes] = useState<Like[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [eventMoods, setEventMoods] = useState<EventMood[]>([]);
  const [composer, setComposer] = useState(false);
  const [caption, setCaption] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadFailures, setUploadFailures] = useState<string[]>([]);
  const uploadedDraftPhotos = useRef(new Map<string, Photo>());
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [sendingCommentIds, setSendingCommentIds] = useState<number[]>([]);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [expandedComments, setExpandedComments] = useState<number[]>([]);
  const [expandedLikes, setExpandedLikes] = useState<number[]>([]);
  const [menuMomentId, setMenuMomentId] = useState<number | null>(null);
  const [editingMomentId, setEditingMomentId] = useState<number | null>(null);
  const [editingCaption, setEditingCaption] = useState("");
  const [stats, setStats] = useState<Record<number, MomentStats>>({});
  const [loadedCommentMoments, setLoadedCommentMoments] = useState<number[]>([]);
  const [loadedLikeMoments, setLoadedLikeMoments] = useState<number[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [newMomentCount, setNewMomentCount] = useState(0);
  const latestMomentCreatedAt = useRef<string | null>(null);
  const loadRequestId = useRef(0);
  const [notifications, setNotifications] = useState<MomentNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ photos: Photo[]; index: number } | null>(null);
  const previewTouchStart = useRef<number | null>(null);

  async function loadPage(offset = 0, replace = false) {
    const requestId = ++loadRequestId.current;
    if (offset) setLoadingMore(true);
    const { data: momentRows, error } = await supabase.from("shared_calendar_moments").select("id,group_key,author_email,caption,event_id,source_event_mood_id,source_event_photo_id,created_at").in("group_key",[group,"both"]).order("created_at", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
    if (requestId !== loadRequestId.current) return;
    if (error) { setMessage("动态读取失败，请重试"); setLoadingMore(false); return; }
    const pageMoments = (momentRows || []) as Moment[];
    const ids = pageMoments.map((item) => item.id);
    setMoments((current)=>replace?pageMoments:[...current,...pageMoments]);
    setHasMore(pageMoments.length===PAGE_SIZE);
    setLoadingMore(false);
    if(replace){
      setLinks([]); setPhotos([]); setComments([]); setEventMoods([]); setStats({});
      latestMomentCreatedAt.current=pageMoments[0]?.created_at||null;
      setNewMomentCount(0);
    }
    if (!ids.length) return;
    const eventIds = pageMoments.map((item)=>item.event_id).filter((id):id is number=>id!==null);
    const [linkResult, previewResult, statsResult, moodResult] = await Promise.all([
      supabase.from("shared_calendar_moment_photos").select("moment_id,photo_id,position").in("moment_id", ids),
      supabase.rpc("get_shared_calendar_moment_comment_preview", { p_moment_ids: ids, p_limit: 3 }),
      supabase.rpc("get_shared_calendar_moment_stats", { p_moment_ids: ids }),
      eventIds.length ? supabase.from("shared_calendar_event_moods").select("id,event_id,author_user_id,author_email,body,created_at").in("event_id", eventIds).order("created_at") : Promise.resolve({data:[],error:null}),
    ]);
    const pageLinks = (linkResult.data || []) as MomentPhoto[];
    const photoIds = [...new Set(pageLinks.map((item)=>item.photo_id))];
    const photoResult = photoIds.length ? await supabase.from("shared_calendar_photos").select("id,group_key,uploader_email,event_id,file_name,created_at").in("id",photoIds) : {data:[],error:null};
    if (requestId !== loadRequestId.current) return;
    const pageComments = (previewResult.data || []) as Comment[];
    setLinks((current)=>replace?pageLinks:[...current,...pageLinks]);
    setPhotos((current)=>{const merged=replace?[]:[...current];(photoResult.data||[]).forEach((photo)=>{if(!merged.some((item)=>item.id===photo.id))merged.push(photo as Photo)});return merged});
    setComments((current)=>replace?pageComments:[...current,...pageComments]);
    setEventMoods((current)=>{const merged=replace?[]:[...current];((moodResult.data||[]) as EventMood[]).forEach((mood)=>{if(!merged.some((item)=>item.id===mood.id))merged.push(mood)});return merged});
    setStats((current)=>Object.fromEntries([...Object.entries(replace?{}:current),...((statsResult.data||[]) as MomentStats[]).map((item)=>[item.moment_id,item])]));
  }
  async function loadNotifications() {
    const {data:ownMoments}=await supabase.from("shared_calendar_moments").select("id").eq("author_user_id",user.id).order("created_at",{ascending:false}).limit(100);
    const ownIds = (ownMoments||[]).map((item)=>item.id);
    const [replyResult, likeResult] = await Promise.all([
      supabase.from("shared_calendar_moment_comments").select("id,moment_id,author_email,created_at,reply_read_at").eq("reply_to_user_id",user.id).order("created_at",{ascending:false}).limit(20),
      ownIds.length?supabase.from("shared_calendar_moment_likes").select("moment_id,user_id,user_email,created_at,read_at").in("moment_id",ownIds).neq("user_id",user.id).order("created_at",{ascending:false}).limit(20):Promise.resolve({data:[],error:null}),
    ]);
    const replyItems=(replyResult.data||[]).map((item)=>({key:`reply-${item.id}`,momentId:item.moment_id,actorEmail:item.author_email,kind:"reply" as const,createdAt:item.created_at,unread:!item.reply_read_at}));
    const likeItems=(likeResult.data||[]).map((item)=>({key:`like-${item.moment_id}-${item.user_id}`,momentId:item.moment_id,actorEmail:item.user_email,kind:"like" as const,createdAt:item.created_at,unread:!item.read_at}));
    setNotifications([...replyItems,...likeItems].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30));
  }
  useEffect(() => { setHasMore(true); setLikes([]); setLoadedCommentMoments([]); setLoadedLikeMoments([]); setExpandedComments([]); setExpandedLikes([]); void loadPage(0,true); }, [group]);
  useEffect(()=>{if(moments.length)void loadNotifications()},[moments.length]);
  useEffect(()=>{const timer=window.setInterval(()=>{const since=latestMomentCreatedAt.current;if(!since)return;void supabase.from("shared_calendar_moments").select("id",{count:"exact",head:true}).in("group_key",[group,"both"]).gt("created_at",since).then(({count})=>setNewMomentCount(count||0))},30000);return()=>window.clearInterval(timer)},[group]);
  useEffect(() => {
    if (!preview) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPreview(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [preview]);
  const composerPreviews = useMemo(()=>files.map((file)=>({file,url:URL.createObjectURL(file)})),[files]);
  useEffect(()=>()=>composerPreviews.forEach((item)=>URL.revokeObjectURL(item.url)),[composerPreviews]);

  async function publish() {
    if (!caption.trim() && !files.length) return;
    setBusy(true); setMessage("");
    try {
      setUploadFailures([]);
      const results = await Promise.all(files.slice(0,3).map(async(file)=>{const key=fileKey(file);const cached=uploadedDraftPhotos.current.get(key);if(cached)return {file,photo:cached};try{const photo=await uploadPhoto(file,group);uploadedDraftPhotos.current.set(key,photo);return {file,photo}}catch{return {file,photo:null}}}));
      const failed=results.filter((item)=>!item.photo).map((item)=>fileKey(item.file));
      if(failed.length){setUploadFailures(failed);setMessage(`${failed.length} 张照片上传失败，可单独重试`);return}
      const uploaded=results.map((item)=>item.photo) as Photo[];
      const { data, error } = await supabase.from("shared_calendar_moments").insert({ group_key: group, author_user_id: user.id, author_email: member.email, caption: caption.trim(), event_id: null }).select().single();
      if (error) throw error;
      if (uploaded.length) {
        const { error: linkError } = await supabase.from("shared_calendar_moment_photos").insert(uploaded.map((photo, position) => ({ moment_id: data.id, photo_id: photo.id, position })));
        if (linkError) throw linkError;
      }
      const newLinks = uploaded.map((photo, position) => ({ moment_id: data.id, photo_id: photo.id, position }));
      setMoments((current) => [data as Moment, ...current]); setPhotos((current) => [...uploaded, ...current]); setLinks((current) => [...current, ...newLinks]);
      setCaption(""); setFiles([]); setComposer(false); uploadedDraftPhotos.current.clear(); setUploadFailures([]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "发布失败"); }
    finally { setBusy(false); }
  }
  async function toggleLike(momentId: number) {
    const liked = stats[momentId]?.liked_by_me || likes.some((like)=>like.moment_id===momentId&&like.user_id===user.id);
    const previous=stats[momentId];
    setStats((current)=>({...current,[momentId]:{...(previous||{moment_id:momentId,like_count:0,comment_count:0,liked_by_me:false}),liked_by_me:!liked,like_count:Math.max(0,(previous?.like_count||0)+(liked?-1:1))}}));
    if (liked) {
      const own = likes.find((like) => like.moment_id === momentId && like.user_id === user.id);
      setLikes((current) => current.filter((like) => !(like.moment_id===momentId&&like.user_id===user.id)));
      const { error } = await supabase.from("shared_calendar_moment_likes").delete().eq("moment_id", momentId).eq("user_id", user.id);
      if (error) {setStats((current)=>({...current,[momentId]:previous}));if(own)setLikes((current)=>[...current,own]);setMessage("点赞失败，请重试")}
    } else {
      const next = { moment_id: momentId, user_id: user.id, user_email: member.email };
      setLikes((current) => [...current, next]);
      const { error } = await supabase.from("shared_calendar_moment_likes").insert(next);
      if (error) {setStats((current)=>({...current,[momentId]:previous}));setLikes((current) => current.filter((like) => !(like.moment_id === momentId && like.user_id === user.id)));setMessage("点赞失败，请重试")}
    }
  }
  async function addComment(momentId: number) {
    const body = commentDrafts[momentId]?.trim(); if (!body || sendingCommentIds.includes(momentId)) return;
    setSendingCommentIds((current)=>[...current,momentId]);
    const reply = replyTarget?.momentId === momentId ? replyTarget : null;
    const { data, error } = await supabase.from("shared_calendar_moment_comments").insert({ moment_id: momentId, author_user_id: user.id, author_email: member.email, body, reply_to_comment_id: reply?.kind === "comment" ? reply.id : null, reply_to_event_mood_id: reply?.kind === "mood" ? reply.id : null }).select("id,moment_id,author_user_id,author_email,body,created_at,reply_to_comment_id,reply_to_event_mood_id,reply_to_user_id,reply_to_email,reply_read_at").single();
    if (error) { setMessage("评论发送失败，内容已保留，请重试"); setSendingCommentIds((current)=>current.filter((id)=>id!==momentId)); return; }
    setComments((current) => [...current, data as Comment]);
    setStats((current)=>({...current,[momentId]:{...(current[momentId]||{moment_id:momentId,like_count:0,comment_count:0,liked_by_me:false}),comment_count:(current[momentId]?.comment_count||0)+1}}));
    setCommentDrafts((value) => ({ ...value, [momentId]: "" })); setReplyTarget(null); setSendingCommentIds((current)=>current.filter((id)=>id!==momentId));
  }
  async function deleteComment(comment: Comment) {
    const { error } = await supabase.from("shared_calendar_moment_comments").delete().eq("id", comment.id).eq("author_user_id", user.id);
    if (error) { setMessage("评论删除失败"); return; }
    setComments((current) => current.filter((item) => item.id !== comment.id).map((item) => item.reply_to_comment_id === comment.id ? { ...item, reply_to_comment_id: null, reply_to_user_id: null, reply_to_email: null } : item));
    setStats((current)=>({...current,[comment.moment_id]:{...current[comment.moment_id],comment_count:Math.max(0,(current[comment.moment_id]?.comment_count||1)-1)}}));
  }
  async function deleteSyncedMood(entry: EventMood) {
    const { error } = await supabase.from("shared_calendar_event_moods").delete().eq("id", entry.id).eq("author_user_id", user.id);
    if (error) { setMessage("评论删除失败"); return; }
    setEventMoods((current) => current.filter((item) => item.id !== entry.id));
    setComments((current) => current.map((item) => item.reply_to_event_mood_id === entry.id ? { ...item, reply_to_event_mood_id: null, reply_to_user_id: null, reply_to_email: null } : item));
    setMoments((current) => current.map((item) => item.source_event_mood_id === entry.id ? { ...item, caption: "", source_event_mood_id: null } : item));
  }
  async function deleteMoment(momentId: number) {
    const target = moments.find((item) => item.id === momentId);
    if (!target?.event_id && !window.confirm("确定删除这条动态吗？照片仍会保留在相册中。")) return;
    const { error } = await supabase.from("shared_calendar_moments").delete().eq("id", momentId);
    if (error) { setMessage("动态删除失败"); return; }
    setMoments((current) => current.filter((item) => item.id !== momentId));
    setLinks((current) => current.filter((item) => item.moment_id !== momentId));
    setLikes((current) => current.filter((item) => item.moment_id !== momentId));
    setComments((current) => current.filter((item) => item.moment_id !== momentId));
  }
  async function saveMomentCaption(momentId: number) {
    const { data, error } = await supabase.from("shared_calendar_moments").update({ caption: editingCaption.trim() }).eq("id", momentId).eq("author_email", member.email).select("id,caption").single();
    if (error) { setMessage("动态修改失败"); return; }
    setMoments((current) => current.map((item) => item.id === momentId ? { ...item, caption: data.caption } : item)); setEditingMomentId(null);
  }
  async function loadAllComments(momentId:number){
    if(loadedCommentMoments.includes(momentId))return;
    const {data,error}=await supabase.from("shared_calendar_moment_comments").select("id,moment_id,author_user_id,author_email,body,created_at,reply_to_comment_id,reply_to_event_mood_id,reply_to_user_id,reply_to_email,reply_read_at").eq("moment_id",momentId).order("created_at");
    if(error)return;setComments((current)=>[...current.filter((item)=>item.moment_id!==momentId),...(data||[]) as Comment[]]);setLoadedCommentMoments((current)=>[...current,momentId]);
  }
  async function loadLikeNames(momentId:number){
    if(loadedLikeMoments.includes(momentId))return;
    const {data,error}=await supabase.from("shared_calendar_moment_likes").select("moment_id,user_id,user_email,created_at,read_at").eq("moment_id",momentId).order("created_at");
    if(error)return;setLikes((current)=>[...current.filter((item)=>item.moment_id!==momentId),...(data||[]) as Like[]]);setLoadedLikeMoments((current)=>[...current,momentId]);
  }
  const photoById = useMemo(() => new Map(photos.map((photo) => [photo.id, photo])), [photos]);
  const linksByMoment = useMemo(() => { const map = new Map<number, MomentPhoto[]>(); links.forEach((link) => map.set(link.moment_id, [...(map.get(link.moment_id) || []), link])); return map; }, [links]);
  const likesByMoment = useMemo(() => { const map = new Map<number, Like[]>(); likes.forEach((like) => map.set(like.moment_id, [...(map.get(like.moment_id) || []), like])); return map; }, [likes]);
  const commentsByMoment = useMemo(() => { const map = new Map<number, Comment[]>(); comments.forEach((comment) => map.set(comment.moment_id, [...(map.get(comment.moment_id) || []), comment])); return map; }, [comments]);
  const moodsByEvent = useMemo(() => { const map = new Map<number, EventMood[]>(); eventMoods.forEach((mood) => map.set(mood.event_id, [...(map.get(mood.event_id) || []), mood])); return map; }, [eventMoods]);
  const visible = useMemo(() => moments.filter((moment) => moment.group_key === group || moment.group_key === "both"), [moments, group]);
  return <section className="media-page moments-page">
    <header className="media-page-head"><div><p className="eyebrow">MOMENTS</p><h2>动态</h2></div><div className="media-head-actions"><button className="moment-notification-button" onClick={()=>{setNotificationsOpen((open)=>!open);void supabase.rpc("mark_shared_calendar_moment_notifications_read");setNotifications((current)=>current.map((item)=>({...item,unread:false})))}}>通知{notifications.some((item)=>item.unread)&&<i/>}</button><GroupSelect value={group} onChange={setGroup} email={member.email}/><button className="primary" onClick={() => setComposer(true)}>＋ 发布</button></div></header>
    {notificationsOpen&&<div className="moment-notifications">{notifications.map((item)=><button key={item.key} onClick={()=>{document.getElementById(`moment-${item.momentId}`)?.scrollIntoView({behavior:"smooth",block:"center"});setNotificationsOpen(false)}}><span className={item.unread?"unread":""}/><b>{displayName(item.actorEmail,members)}</b>{item.kind==="like"?"赞了你的动态":"回复了你"}</button>)}{!notifications.length&&<p>暂时没有通知</p>}</div>}
    {!!newMomentCount&&<button className="moment-new-posts" onClick={()=>void loadPage(0,true)}>有 {newMomentCount} 条新动态，点击查看</button>}
    {composer && <div className="media-composer"><div className="media-composer-head"><h3>发布到 {groupLabel(group)}</h3><button onClick={() => setComposer(false)}>×</button></div><GroupSelect value={group} onChange={setGroup} email={member.email}/><textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="说点什么……"/><div className="moment-draft-photos">{composerPreviews.map(({file,url},index)=><div className={uploadFailures.includes(fileKey(file))?"failed":""} key={fileKey(file)}><img src={url}/><button onClick={()=>setFiles((current)=>current.filter((_,i)=>i!==index))}>×</button><span>{uploadFailures.includes(fileKey(file))?"上传失败":""}</span>{index>0&&<button className="move previous" onClick={()=>setFiles((current)=>{const next=[...current];[next[index-1],next[index]]=[next[index],next[index-1]];return next})}>‹</button>}{index<files.length-1&&<button className="move next" onClick={()=>setFiles((current)=>{const next=[...current];[next[index],next[index+1]]=[next[index+1],next[index]];return next})}>›</button>}</div>)}</div><label className="media-file-picker">选择照片（最多 3 张）<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={(e) => {setFiles(Array.from(e.target.files || []).slice(0, 3));setUploadFailures([]);uploadedDraftPhotos.current.clear()}}/><span>{files.length ? `已选择 ${files.length} 张` : "从设备上传"}</span></label>{message && <p className="media-error">{message}</p>}<button className="primary media-publish" disabled={busy || (!caption.trim() && !files.length)} onClick={publish}>{busy ? "正在发布…" : uploadFailures.length?"重试失败照片":"发布动态"}</button></div>}
    <div className="moment-feed">
      {visible.map((moment) => {
        const momentPhotos = (linksByMoment.get(moment.id) || []).sort((a,b) => a.position-b.position).map((link) => photoById.get(link.photo_id)).filter(Boolean) as Photo[];
        const momentLikes = likesByMoment.get(moment.id) || [];
        const momentComments = commentsByMoment.get(moment.id) || [];
        const syncedMoods = moment.event_id ? (moodsByEvent.get(moment.event_id) || []).filter((item) => item.id !== moment.source_event_mood_id) : [];
        const entries = [...syncedMoods.map((item)=>({kind:"mood" as const,item,date:item.created_at})), ...momentComments.map((item)=>({kind:"comment" as const,item,date:item.created_at}))].sort((a,b)=>a.date.localeCompare(b.date));
        const shownEntries = expandedComments.includes(moment.id) ? entries : entries.slice(-3);
        const momentStats=stats[moment.id]||{moment_id:moment.id,like_count:momentLikes.length,comment_count:entries.length,liked_by_me:momentLikes.some((like)=>like.user_id===user.id)};
        const isAuthor = moment.author_email.toLowerCase() === member.email.toLowerCase();
        const authorColor = members.find((item) => item.email.toLowerCase() === moment.author_email.toLowerCase())?.color || "stone";
        return <article className="moment-post" id={`moment-${moment.id}`} key={moment.id}>
          <header><span className={`moment-avatar ${authorColor}`}>{displayName(moment.author_email,members).slice(0,1)}</span><div><strong>{displayName(moment.author_email,members)}</strong><small>{new Date(moment.created_at).toLocaleDateString("zh-CN")} · {groupLabel(moment.group_key)}</small></div>{isAuthor&&<div className="moment-menu"><button onClick={()=>setMenuMomentId(menuMomentId===moment.id?null:moment.id)}>•••</button>{menuMomentId===moment.id&&<div><button onClick={()=>{setEditingMomentId(moment.id);setEditingCaption(moment.caption);setMenuMomentId(null)}}>编辑文字</button><button onClick={()=>void deleteMoment(moment.id)}>删除动态</button></div>}</div>}</header>
          {editingMomentId===moment.id?<div className="moment-edit"><textarea value={editingCaption} onChange={(e)=>setEditingCaption(e.target.value)}/><button onClick={()=>{if(editingCaption!==moment.caption&&!window.confirm("修改还没有保存，确定离开吗？"))return;setEditingMomentId(null)}}>取消</button><button className="primary" onClick={()=>void saveMomentCaption(moment.id)}>保存</button></div>:moment.caption&&<p className="moment-caption">{moment.caption}</p>}
          {moment.event_id&&<small className="moment-source-label">来自活动照片</small>}
          {!!momentPhotos.length && <div className={`moment-photo-grid count-${Math.min(momentPhotos.length,3)}`}>{momentPhotos.map((photo,index)=><button type="button" className="moment-photo" key={photo.id} aria-label="放大查看照片" onClick={()=>setPreview({photos:momentPhotos,index})}><ProtectedPhoto photo={photo}/></button>)}</div>}
          <div className="moment-actions"><button className={`moment-action-button ${momentStats.liked_by_me?"liked":""}`} onClick={()=>void toggleLike(moment.id)}>♡ {momentStats.liked_by_me?"已赞":"赞"}</button>{momentStats.like_count>0&&<button className="moment-like-count" onClick={()=>{if(!expandedLikes.includes(moment.id))void loadLikeNames(moment.id);setExpandedLikes((current)=>current.includes(moment.id)?current.filter((id)=>id!==moment.id):[...current,moment.id])}}>{momentStats.like_count} 人赞</button>}<button className="moment-action-button" onClick={()=>document.getElementById(`moment-comment-${moment.id}`)?.focus()}>◯ 评论{momentStats.comment_count ? ` ${momentStats.comment_count}` : ""}</button></div>
          {expandedLikes.includes(moment.id)&&<p className="moment-like-names">♡ {momentLikes.map((like)=>displayName(like.user_email,members)).join("、")}</p>}
          <div className="moment-comments">{momentStats.comment_count>3&&<button className="moment-comments-toggle" onClick={()=>{if(!expandedComments.includes(moment.id))void loadAllComments(moment.id);setExpandedComments((current)=>current.includes(moment.id)?current.filter((id)=>id!==moment.id):[...current,moment.id])}}>{expandedComments.includes(moment.id)?"收起评论":`展开全部 ${momentStats.comment_count} 条评论`}</button>}{shownEntries.map(({kind,item})=><p key={`${kind}-${item.id}`}><span><b>{displayName(item.author_email,members)}</b>{kind==="comment"&&item.reply_to_email&&<> 回复 <b>@{displayName(item.reply_to_email,members)}</b></>}：{item.body}</span><span className="moment-comment-tools"><button onClick={()=>{setReplyTarget({momentId:moment.id,kind,id:item.id,email:item.author_email});document.getElementById(`moment-comment-${moment.id}`)?.focus()}}>回复</button>{item.author_user_id===user.id&&<button onClick={()=>kind==="comment"?void deleteComment(item):void deleteSyncedMood(item)}>删除</button>}</span></p>)}{replyTarget?.momentId===moment.id&&<div className="moment-replying">回复 @{displayName(replyTarget.email,members)}<button onClick={()=>setReplyTarget(null)}>×</button></div>}<div><input id={`moment-comment-${moment.id}`} value={commentDrafts[moment.id]||""} onChange={(e)=>setCommentDrafts((value)=>({...value,[moment.id]:e.target.value}))} placeholder={replyTarget?.momentId===moment.id?`回复 @${displayName(replyTarget.email,members)}……`:"写评论……"} onKeyDown={(e)=>{if(e.key==="Enter")void addComment(moment.id)}}/><button className="moment-comment-send" disabled={!commentDrafts[moment.id]?.trim()} onClick={()=>void addComment(moment.id)}>发送</button></div></div>
        </article>;
      })}
      {!visible.length && <div className="media-empty"><h3>还没有动态</h3><p>在 {groupLabel(group)} 分享第一张照片吧。</p></div>}
      {hasMore&&<button className="moment-load-more" disabled={loadingMore} onClick={()=>void loadPage(moments.length)}>{loadingMore?"正在加载…":"加载更多"}</button>}
    </div>
    {preview && <div className="moment-photo-preview" role="dialog" aria-modal="true" aria-label="照片预览" onMouseDown={(event)=>{if(event.target===event.currentTarget)setPreview(null)}} onTouchStart={(event)=>{previewTouchStart.current=event.touches[0]?.clientX??null}} onTouchEnd={(event)=>{if(previewTouchStart.current===null)return;const delta=(event.changedTouches[0]?.clientX??previewTouchStart.current)-previewTouchStart.current;if(Math.abs(delta)>40)setPreview((current)=>current?{...current,index:Math.max(0,Math.min(current.photos.length-1,current.index+(delta<0?1:-1)))}:null);previewTouchStart.current=null}}><button type="button" className="moment-photo-preview-close" aria-label="关闭照片预览" onClick={()=>setPreview(null)}>×</button>{preview.photos.length>1&&<button className="moment-preview-nav previous" disabled={preview.index===0} onClick={()=>setPreview({...preview,index:preview.index-1})}>‹</button>}<ProtectedPhoto photo={preview.photos[preview.index]} alt="动态照片预览"/>{preview.photos.length>1&&<><span className="moment-preview-count">{preview.index+1} / {preview.photos.length}</span><button className="moment-preview-nav next" disabled={preview.index===preview.photos.length-1} onClick={()=>setPreview({...preview,index:preview.index+1})}>›</button></>}</div>}
  </section>;
}

export function AlbumsPage({ user, member, members }: { user: User; member: Member; members: Member[] }) {
  const groups = allowedGroups(member.email);
  const [group, setGroup] = useState<GroupKey>(groups[0]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [albumLinks, setAlbumLinks] = useState<{album_id:number;photo_id:string}[]>([]);
  const [newAlbum, setNewAlbum] = useState("");
  const [selectedAlbum, setSelectedAlbum] = useState("");
  const [albumView, setAlbumView] = useState<"all" | "unorganized" | number>("all");
  const [selecting, setSelecting] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [targetAlbumIds, setTargetAlbumIds] = useState<number[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [albumNameDraft, setAlbumNameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load() { const [p,a,l]=await Promise.all([supabase.from("shared_calendar_photos").select("id,group_key,uploader_email,event_id,file_name,created_at").order("created_at",{ascending:false}),supabase.from("shared_calendar_albums").select("*").order("created_at",{ascending:false}),supabase.from("shared_calendar_album_photos").select("album_id,photo_id")]); setPhotos((p.data||[]) as Photo[]); setAlbums((a.data||[]) as Album[]); setAlbumLinks((l.data||[]) as {album_id:number;photo_id:string}[]); }
  useEffect(()=>{void load()},[]);
  async function createAlbum(){if(!newAlbum.trim())return;const{error}=await supabase.from("shared_calendar_albums").insert({name:newAlbum.trim(),group_key:group,owner_user_id:user.id,owner_email:member.email});if(error)setMessage("相册创建失败");else{setNewAlbum("");await load();}}
  async function onUpload(event: ChangeEvent<HTMLInputElement>){const files=Array.from(event.target.files||[]);if(!files.length)return;setBusy(true);setMessage("");try{for(const file of files){const photo=await uploadPhoto(file,group);if(selectedAlbum){const{error}=await supabase.from("shared_calendar_album_photos").insert({album_id:Number(selectedAlbum),photo_id:photo.id,added_by_user_id:user.id});if(error)throw error;}}await load();}catch(error){setMessage(error instanceof Error?error.message:"上传失败");}finally{setBusy(false);event.target.value="";}}
  async function removePhoto(photo: Photo){if(!window.confirm("确定永久删除这张照片吗？日历和动态中的引用也会一起移除。"))return;const accessToken=await token();const response=await fetch(`${MEDIA_API}/photos/${photo.id}`,{method:"DELETE",headers:{Authorization:`Bearer ${accessToken}`}});if(!response.ok){const result=await response.json();setMessage(result.error||"删除失败");return;}await load();}
  function resetSelection(){setSelecting(false);setSelectedPhotoIds([]);setOrganizerOpen(false);setTargetAlbumIds([]);}
  function changeView(next: "all" | "unorganized" | number){setAlbumView(next);setRenaming(false);resetSelection();}
  function togglePhoto(photoId:string){setSelectedPhotoIds((current)=>current.includes(photoId)?current.filter((id)=>id!==photoId):[...current,photoId]);}
  function openOrganizer(){if(!selectedPhotoIds.length)return;setTargetAlbumIds([]);setOrganizerOpen(true);}
  async function addToAlbums(){if(!selectedPhotoIds.length||!targetAlbumIds.length)return;setBusy(true);setMessage("");const existing=new Set(albumLinks.map((link)=>`${link.album_id}:${link.photo_id}`));const rows=targetAlbumIds.flatMap((albumId)=>selectedPhotoIds.filter((photoId)=>!existing.has(`${albumId}:${photoId}`)).map((photoId)=>({album_id:albumId,photo_id:photoId,added_by_user_id:user.id})));if(rows.length){const{error}=await supabase.from("shared_calendar_album_photos").insert(rows);if(error){setMessage("照片整理失败");setBusy(false);return;}}setBusy(false);resetSelection();await load();}
  async function removeFromCurrentAlbum(){if(typeof albumView!=="number"||!selectedPhotoIds.length)return;setBusy(true);const{error}=await supabase.from("shared_calendar_album_photos").delete().eq("album_id",albumView).in("photo_id",selectedPhotoIds);if(error)setMessage("无法从当前相册移除所选照片");else{resetSelection();await load();}setBusy(false);}
  async function renameAlbum(){if(typeof albumView!=="number"||!albumNameDraft.trim())return;const{error}=await supabase.from("shared_calendar_albums").update({name:albumNameDraft.trim()}).eq("id",albumView).eq("owner_user_id",user.id);if(error)setMessage("相册重命名失败");else{setRenaming(false);await load();}}
  async function setAlbumCover(){if(typeof albumView!=="number"||selectedPhotoIds.length!==1)return;const{error}=await supabase.from("shared_calendar_albums").update({cover_photo_id:selectedPhotoIds[0]}).eq("id",albumView).eq("owner_user_id",user.id);if(error)setMessage("封面设置失败");else{resetSelection();await load();}}
  async function deleteAlbum(){if(typeof albumView!=="number")return;const current=albums.find((album)=>album.id===albumView);if(!current||!window.confirm(`删除相册“${current.name}”？照片会回到未整理，不会被永久删除。`))return;const{error}=await supabase.from("shared_calendar_albums").delete().eq("id",albumView).eq("owner_user_id",user.id);if(error)setMessage("相册删除失败");else{changeView("all");await load();}}
  const groupPhotos=photos.filter((photo)=>photo.group_key===group||photo.group_key==="both");
  const groupAlbums=albums.filter((album)=>album.group_key===group);
  const linkedPhotoIds=new Set(albumLinks.filter((link)=>groupAlbums.some((album)=>album.id===link.album_id)).map((link)=>link.photo_id));
  const unorganizedPhotos=groupPhotos.filter((photo)=>!linkedPhotoIds.has(photo.id));
  const currentAlbum=typeof albumView==="number"?groupAlbums.find((album)=>album.id===albumView):undefined;
  const currentIds=typeof albumView==="number"?new Set(albumLinks.filter((link)=>link.album_id===albumView).map((link)=>link.photo_id)):null;
  const shownPhotos=albumView==="unorganized"?unorganizedPhotos:currentIds?groupPhotos.filter((photo)=>currentIds.has(photo.id)):groupPhotos;
  const canManageCurrent=Boolean(currentAlbum&&currentAlbum.owner_email.toLowerCase()===member.email.toLowerCase());
  const viewTitle=albumView==="all"?"全部照片":albumView==="unorganized"?"未整理":currentAlbum?.name||"相册";
  return <section className="media-page albums-page">
    <header className="media-page-head"><div><p className="eyebrow">PHOTOS</p><h2>相册</h2></div><GroupSelect value={group} onChange={(value)=>{setGroup(value);setSelectedAlbum("");changeView("all")}} email={member.email}/></header>
    <div className="album-upload-bar"><label className="media-file-picker">上传到 {groupLabel(group)}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={onUpload}/><span>{busy?"正在上传…":"选择照片"}</span></label><label>放入相册（可选）<select value={selectedAlbum} onChange={(e)=>setSelectedAlbum(e.target.value)}><option value="">未整理</option>{groupAlbums.map((album)=><option key={album.id} value={album.id}>{album.name}</option>)}</select></label></div>
    {message&&<p className="media-error">{message}</p>}
    <div className="album-create"><input value={newAlbum} onChange={(e)=>setNewAlbum(e.target.value)} placeholder="新相册名称"/><button onClick={createAlbum}>＋ 新建相册</button></div>
    <div className="album-section"><h3>系统相册</h3><div className="album-system-list"><button className={albumView==="unorganized"?"active":""} onClick={()=>changeView("unorganized")}><b>未整理</b><small>{unorganizedPhotos.length} 张</small></button><button className={albumView==="all"?"active":""} onClick={()=>changeView("all")}><b>全部照片</b><small>{groupPhotos.length} 张</small></button></div></div>
    <div className="album-section"><h3>{groupLabel(group)}相册</h3><div className="album-list">{groupAlbums.map((album)=>{const ids=albumLinks.filter((link)=>link.album_id===album.id).map((link)=>link.photo_id);const cover=photos.find((photo)=>photo.id===(album.cover_photo_id||ids[0]));return <button className={`album-folder ${albumView===album.id?"active":""}`} key={album.id} onClick={()=>changeView(album.id)}><span>{cover?<ProtectedPhoto photo={cover}/>:"暂无照片"}</span><b>{album.name}</b><small>{ids.length} 张 · {displayName(album.owner_email,members)}</small></button>})}</div></div>
    <div className="album-section album-photo-section"><div className="album-section-head"><h3>{typeof albumView==="number"&&<button className="album-inline-back" onClick={()=>changeView("all")}>‹</button>}{viewTitle}</h3><div>{selecting?<><span>{selectedPhotoIds.length} 张已选</span><button onClick={resetSelection}>取消</button></>:<button onClick={()=>setSelecting(true)} disabled={!shownPhotos.length}>选择</button>}</div></div>
      {currentAlbum&&canManageCurrent&&<div className="album-manage-bar">{renaming?<><input value={albumNameDraft} onChange={(event)=>setAlbumNameDraft(event.target.value)} autoFocus/><button onClick={renameAlbum}>保存名称</button><button onClick={()=>setRenaming(false)}>取消</button></>:<><button onClick={()=>{setAlbumNameDraft(currentAlbum.name);setRenaming(true)}}>重命名</button><button disabled={!selecting||selectedPhotoIds.length!==1} onClick={setAlbumCover}>设为封面</button><button className="album-danger" onClick={deleteAlbum}>删除相册</button></>}</div>}
      {selecting&&selectedPhotoIds.length>0&&<div className="album-batch-bar"><button className="primary" onClick={openOrganizer}>放入相册</button>{typeof albumView==="number"&&<button onClick={removeFromCurrentAlbum}>从当前相册移除</button>}</div>}
      <div className={`photo-library-grid ${selecting?"selecting":""}`}>{shownPhotos.map((photo)=><div className={`library-photo ${selectedPhotoIds.includes(photo.id)?"selected":""}`} key={photo.id}>{selecting?<button type="button" className="library-photo-select" aria-label={selectedPhotoIds.includes(photo.id)?"取消选择照片":"选择照片"} onClick={()=>togglePhoto(photo.id)}><ProtectedPhoto photo={photo}/><i>{selectedPhotoIds.includes(photo.id)?"✓":""}</i></button>:<ProtectedPhoto photo={photo}/>} {!selecting&&photo.uploader_email.toLowerCase()===member.email.toLowerCase()&&<button className="library-photo-delete" onClick={()=>removePhoto(photo)} aria-label="删除照片">×</button>}<small>{displayName(photo.uploader_email,members)}</small></div>)}</div>
      {!shownPhotos.length&&<div className="media-empty"><h3>{albumView==="unorganized"?"没有未整理照片":"还没有照片"}</h3><p>{albumView==="unorganized"?"动态、日历和未指定相册上传的照片会出现在这里。":"上传照片，或从未整理中把照片放入这个相册。"}</p></div>}
    </div>
    {organizerOpen&&<div className="album-organizer-overlay" onMouseDown={(event)=>{if(event.target===event.currentTarget)setOrganizerOpen(false)}}><section className="album-organizer" role="dialog" aria-modal="true" aria-label="放入相册"><header><div><p className="eyebrow">ORGANIZE</p><h3>放入相册</h3></div><button onClick={()=>setOrganizerOpen(false)}>×</button></header><p>已选择 {selectedPhotoIds.length} 张照片，可同时放入多个相册。</p><div className="album-organizer-list">{groupAlbums.map((album)=><label key={album.id}><input type="checkbox" checked={targetAlbumIds.includes(album.id)} onChange={()=>setTargetAlbumIds((current)=>current.includes(album.id)?current.filter((id)=>id!==album.id):[...current,album.id])}/><span>{album.name}</span></label>)}</div>{!groupAlbums.length&&<p>请先新建一个相册。</p>}<button className="primary" disabled={busy||!targetAlbumIds.length} onClick={addToAlbums}>{busy?"正在整理…":"确认放入"}</button></section></div>}
  </section>;
}
