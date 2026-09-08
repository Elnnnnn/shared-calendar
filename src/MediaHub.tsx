import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const MEDIA_API = "https://yytyntrgqkddfsliooke.supabase.co/functions/v1/shared-calendar-media-proxy";
const ELAINE_EMAIL = "elainezhang1110@gmail.com";
type GroupKey = "besties" | "friends" | "both";
type Member = { email: string; display_name: string; color: string };
type Photo = { id: string; group_key: GroupKey; uploader_email: string; event_id: number | null; file_name: string; created_at: string };
type Album = { id: number; name: string; group_key: GroupKey; owner_email: string; cover_photo_id: string | null; created_at: string };
type Moment = { id: number; group_key: GroupKey; author_email: string; caption: string; event_id: number | null; created_at: string };
type MomentPhoto = { moment_id: number; photo_id: string; position: number };
type Like = { moment_id: number; user_id: string; user_email: string };
type Comment = { id: number; moment_id: number; author_email: string; body: string; created_at: string };
type EventMood = { id: number; event_id: number; author_user_id: string; author_email: string; body: string; created_at: string };
type CalendarEvent = { id: number; title: string; date: string; owner: string; participants: string[]; audienceGroup?: GroupKey };
type EventPhotoLink = { event_id: number; photo_id: string };

function groupLabel(group: GroupKey) { return group === "besties" ? "闺蜜组" : group === "friends" ? "朋友组" : "两个组"; }
function allowedGroups(email: string): GroupKey[] {
  return email.toLowerCase() === ELAINE_EMAIL ? ["besties", "friends"] : email.toLowerCase() === "test@test.com" ? ["friends"] : ["besties"];
}
function displayName(email: string, members: Member[]) { return members.find((m) => m.email.toLowerCase() === email.toLowerCase())?.display_name || email.split("@")[0]; }

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

function ProtectedPhoto({ photo, alt = "共享照片" }: { photo: Photo; alt?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;
    void (async () => {
      const accessToken = await token();
      const response = await fetch(`${MEDIA_API}/photos/${photo.id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok || cancelled) return;
      objectUrl = URL.createObjectURL(await response.blob());
      if (!cancelled) setSrc(objectUrl);
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [photo.id]);
  return src ? <img src={src} alt={alt} loading="lazy" /> : <span className="media-photo-loading">照片载入中…</span>;
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
  useEffect(() => { void load(); }, [event.id]);
  useEffect(() => { setGroup(groups[0]); }, [event.id, event.audienceGroup]);
  async function add(eventInput: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(eventInput.target.files || []);
    if (!files.length) return;
    if (eventPhoto) { setMessage("每个活动只能添加一张照片，请先移除原照片再更换。"); eventInput.target.value = ""; return; }
    setBusy(true); setMessage("");
    try {
      const photo = await uploadPhoto(files[0], group);
      const { error } = await supabase.from("shared_calendar_event_photos").insert({ event_id: event.id, photo_id: photo.id, linked_by_user_id: user.id, linked_by_email: member.email });
      if (error) throw error;
      await load();
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "上传失败"); }
    finally { setBusy(false); eventInput.target.value = ""; }
  }
  async function remove(photo: Photo) {
    setMessage("");
    const { error } = await supabase.from("shared_calendar_event_photos").delete().eq("event_id", event.id).eq("photo_id", photo.id);
    if (error) { setMessage("无法从日历移除照片"); return; }
    await load();
  }
  async function chooseExisting(photo: Photo) {
    setBusy(true); setMessage("");
    const { error } = await supabase.from("shared_calendar_event_photos").insert({ event_id: event.id, photo_id: photo.id, linked_by_user_id: user.id, linked_by_email: member.email });
    if (error) setMessage(error.code === "23505" ? "这个活动已经有照片了" : error.message || "无法选择这张照片");
    else { setLibraryOpen(false); await load(); }
    setBusy(false);
  }
  async function publishMoment() {
    const photo = eventPhoto;
    if (!mood.trim() && !photo) return;
    if (eventMoment) { setMessage("这个活动已经发布过动态了"); return; }
    setPublishing(true); setMessage("");
    const publishGroup = group;
    try {
      if (mood.trim()) {
        const { error: moodError } = await supabase.from("shared_calendar_event_moods").insert({ event_id: event.id, author_user_id: user.id, author_email: member.email, body: mood.trim() });
        if (moodError) throw moodError;
      }
      const { data, error } = await supabase.from("shared_calendar_moments").insert({ group_key: publishGroup, author_user_id: user.id, author_email: member.email, caption: mood.trim(), event_id: event.id }).select().single();
      if (error) throw error;
      if (photo) {
        const { error: linkError } = await supabase.from("shared_calendar_moment_photos").insert({ moment_id: data.id, photo_id: photo.id, position: 0 });
        if (linkError) throw linkError;
      }
      setMood(""); setMessage("已发布到动态"); await load();
    } catch (error) { setMessage((error as { code?: string })?.code === "23505" ? "这个活动已经发布过动态了" : error instanceof Error ? error.message : "发布失败"); }
    finally { setPublishing(false); }
  }
  async function saveMood() {
    const body = mood.trim();
    if (!body) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.from("shared_calendar_event_moods").insert({ event_id: event.id, author_user_id: user.id, author_email: member.email, body });
    if (error) setMessage("心情保存失败");
    else { setMood(""); await load(); }
    setBusy(false);
  }
  async function submitMood() {
    if (shareToMoment && !eventMoment) await publishMoment();
    else await saveMood();
  }
  const eventPhotoId = eventLinks[0]?.photo_id;
  const eventPhoto = photos.find((photo) => photo.id === eventPhotoId);
  const libraryPhotos = photos.filter((photo) => photo.id !== eventPhotoId && photo.group_key === group);
  const selectedGroups = group === "both" ? ["besties", "friends"] : [group];
  function toggleGroup(next: "besties" | "friends") {
    const has = selectedGroups.includes(next);
    if (has && selectedGroups.length === 1) return;
    const nextGroups = has ? selectedGroups.filter((item) => item !== next) : [...selectedGroups, next];
    setGroup(nextGroups.length === 2 ? "both" : nextGroups[0] as GroupKey);
  }
  return <section className="event-media-panel">
    <div className="event-media-heading"><div><h3>活动照片</h3><p>{eventPhoto ? "1 张照片" : "为这次活动留下一张照片"}</p></div>{groups.length === 1 ? <span className="media-group-label">{groupLabel(groups[0])}</span> : <div className="event-group-checks"><label><input type="checkbox" checked={selectedGroups.includes("besties")} onChange={()=>toggleGroup("besties")}/>闺蜜组</label><label><input type="checkbox" checked={selectedGroups.includes("friends")} onChange={()=>toggleGroup("friends")}/>朋友组</label></div>}</div>
    {eventPhoto && <div className="event-cover"><ProtectedPhoto photo={eventPhoto} alt={`${event.title} 封面`}/><button onClick={()=>remove(eventPhoto)} aria-label="从日历移除照片" title="从日历移除，原图仍保留在相册">×</button></div>}
    {!eventPhoto && <div className="event-photo-actions"><label className="media-file-picker">＋ 从设备上传<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={add}/><span>{busy?"正在上传…":"选择照片"}</span></label><button type="button" onClick={()=>setLibraryOpen(true)}>从相册选择</button></div>}
    {libraryOpen && <div className="photo-picker"><div className="photo-picker-head"><b>选择已有照片</b><button onClick={()=>setLibraryOpen(false)}>×</button></div><div className="photo-library-grid">{libraryPhotos.map((photo)=><button key={photo.id} onClick={()=>chooseExisting(photo)} disabled={busy}><ProtectedPhoto photo={photo}/></button>)}</div>{!libraryPhotos.length&&<p>这个组的相册里还没有可选照片</p>}</div>}
    <div className="event-mood-list">{moods.map((entry)=>{const color=members.find((item)=>item.email.toLowerCase()===entry.author_email.toLowerCase())?.color||"stone";return <div key={entry.id}><span className={`moment-avatar ${color}`}>{displayName(entry.author_email,members).slice(0,1)}</span><p><b>{displayName(entry.author_email,members)}</b><span>{entry.body}</span></p></div>})}</div>
    <label className="event-mood-field">写心情<textarea value={mood} onChange={(input)=>setMood(input.target.value)} placeholder="记录这一刻……"/></label>
    {eventMoment
      ? <div className="event-moment-status"><b>已发布到动态</b><span>由 {displayName(eventMoment.author_email, members)} 发布；之后大家写的心情都会同步到这条动态的评论。</span></div>
      : <label className="event-moment-option"><input type="checkbox" checked={shareToMoment} onChange={(input)=>setShareToMoment(input.target.checked)}/><span><b>同时发布到动态</b><small>每个活动只能发布一次；发布后，其他人的心情会自动成为评论。</small></span></label>}
    <div className="event-mood-actions single"><button className="primary" type="button" disabled={busy || publishing || (!mood.trim() && !(shareToMoment && eventPhoto))} onClick={submitMood}>{publishing?"正在发布…":shareToMoment?"发表并发布动态":"发表心情"}</button></div>
    {message&&<p className={message === "已发布到动态" ? "media-success" : "media-error"}>{message}</p>}
  </section>;
}

export function MomentsPage({ user, member, members }: { user: User; member: Member; members: Member[] }) {
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
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const [m, p, mp, l, c, em] = await Promise.all([
      supabase.from("shared_calendar_moments").select("*").order("created_at", { ascending: false }),
      supabase.from("shared_calendar_photos").select("id,group_key,uploader_email,event_id,file_name,created_at").order("created_at", { ascending: false }),
      supabase.from("shared_calendar_moment_photos").select("*"),
      supabase.from("shared_calendar_moment_likes").select("*"),
      supabase.from("shared_calendar_moment_comments").select("*").order("created_at"),
      supabase.from("shared_calendar_event_moods").select("id,event_id,author_user_id,author_email,body,created_at").order("created_at"),
    ]);
    setMoments((m.data || []) as Moment[]); setPhotos((p.data || []) as Photo[]); setLinks((mp.data || []) as MomentPhoto[]); setLikes((l.data || []) as Like[]); setComments((c.data || []) as Comment[]); setEventMoods((em.data || []) as EventMood[]);
  }
  useEffect(() => { void load(); }, []);

  async function publish() {
    if (!caption.trim() && !files.length) return;
    setBusy(true); setMessage("");
    try {
      const uploaded: Photo[] = [];
      for (const file of files.slice(0, 3)) uploaded.push(await uploadPhoto(file, group));
      const { data, error } = await supabase.from("shared_calendar_moments").insert({ group_key: group, author_user_id: user.id, author_email: member.email, caption: caption.trim(), event_id: null }).select().single();
      if (error) throw error;
      if (uploaded.length) {
        const { error: linkError } = await supabase.from("shared_calendar_moment_photos").insert(uploaded.map((photo, position) => ({ moment_id: data.id, photo_id: photo.id, position })));
        if (linkError) throw linkError;
      }
      setCaption(""); setFiles([]); setComposer(false); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "发布失败"); }
    finally { setBusy(false); }
  }
  async function toggleLike(momentId: number) {
    const own = likes.find((like) => like.moment_id === momentId && like.user_id === user.id);
    if (own) await supabase.from("shared_calendar_moment_likes").delete().eq("moment_id", momentId).eq("user_id", user.id);
    else await supabase.from("shared_calendar_moment_likes").insert({ moment_id: momentId, user_id: user.id, user_email: member.email });
    await load();
  }
  async function addComment(momentId: number) {
    const body = commentDrafts[momentId]?.trim(); if (!body) return;
    await supabase.from("shared_calendar_moment_comments").insert({ moment_id: momentId, author_user_id: user.id, author_email: member.email, body });
    setCommentDrafts((value) => ({ ...value, [momentId]: "" })); await load();
  }
  async function deleteMoment(momentId: number) {
    if (!window.confirm("确定删除这条动态吗？照片仍会保留在相册中。")) return;
    const { error } = await supabase.from("shared_calendar_moments").delete().eq("id", momentId);
    if (error) { setMessage("动态删除失败"); return; }
    await load();
  }
  const visible = moments.filter((moment) => moment.group_key === group || moment.group_key === "both");
  return <section className="media-page moments-page">
    <header className="media-page-head"><div><p className="eyebrow">MOMENTS</p><h2>动态</h2></div><div className="media-head-actions"><GroupSelect value={group} onChange={setGroup} email={member.email}/><button className="primary" onClick={() => setComposer(true)}>＋ 发布</button></div></header>
    {composer && <div className="media-composer"><div className="media-composer-head"><h3>发布到 {groupLabel(group)}</h3><button onClick={() => setComposer(false)}>×</button></div><GroupSelect value={group} onChange={setGroup} email={member.email}/><textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="说点什么……"/><label className="media-file-picker">选择照片（最多 3 张）<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 3))}/><span>{files.length ? `已选择 ${files.length} 张` : "从设备上传"}</span></label>{message && <p className="media-error">{message}</p>}<button className="primary media-publish" disabled={busy || (!caption.trim() && !files.length)} onClick={publish}>{busy ? "正在发布…" : "发布动态"}</button></div>}
    <div className="moment-feed">
      {visible.map((moment) => {
        const momentPhotos = links.filter((link) => link.moment_id === moment.id).sort((a,b) => a.position-b.position).map((link) => photos.find((photo) => photo.id === link.photo_id)).filter(Boolean) as Photo[];
        const momentLikes = likes.filter((like) => like.moment_id === moment.id);
        const momentComments = comments.filter((item) => item.moment_id === moment.id);
        const syncedMoods = moment.event_id ? eventMoods.filter((item) => item.event_id === moment.event_id && !(item.author_email.toLowerCase() === moment.author_email.toLowerCase() && item.body === moment.caption)) : [];
        const isAuthor = moment.author_email.toLowerCase() === member.email.toLowerCase();
        const authorColor = members.find((item) => item.email.toLowerCase() === moment.author_email.toLowerCase())?.color || "stone";
        return <article className="moment-post" key={moment.id}>
          <header><span className={`moment-avatar ${authorColor}`}>{displayName(moment.author_email,members).slice(0,1)}</span><div><strong>{displayName(moment.author_email,members)}</strong><small>{new Date(moment.created_at).toLocaleDateString("zh-CN")} · {groupLabel(moment.group_key)}</small></div>{isAuthor&&<button className="moment-delete" onClick={()=>deleteMoment(moment.id)}>删除</button>}</header>
          {moment.caption && <p className="moment-caption">{moment.caption}</p>}
          {!!momentPhotos.length && <div className={`moment-photo-grid count-${Math.min(momentPhotos.length,3)}`}>{momentPhotos.map((photo)=><div className="moment-photo" key={photo.id}><ProtectedPhoto photo={photo}/></div>)}</div>}
          <div className="moment-actions"><button className={`moment-action-button ${momentLikes.some((like)=>like.user_id===user.id)?"liked":""}`} onClick={()=>toggleLike(moment.id)}>♡ {momentLikes.length ? `${momentLikes.length} 人赞` : "赞"}</button><button className="moment-action-button" onClick={()=>document.getElementById(`moment-comment-${moment.id}`)?.focus()}>◯ 评论{momentComments.length + syncedMoods.length ? ` ${momentComments.length + syncedMoods.length}` : ""}</button></div>
          <div className="moment-comments">{syncedMoods.map((entry)=><p key={`mood-${entry.id}`}><b>{displayName(entry.author_email,members)}</b> {entry.body}</p>)}{momentComments.map((comment)=><p key={comment.id}><b>{displayName(comment.author_email,members)}</b> {comment.body}</p>)}<div><input id={`moment-comment-${moment.id}`} value={commentDrafts[moment.id]||""} onChange={(e)=>setCommentDrafts((value)=>({...value,[moment.id]:e.target.value}))} placeholder="写评论……" onKeyDown={(e)=>{if(e.key==="Enter")void addComment(moment.id)}}/><button className="moment-comment-send" disabled={!commentDrafts[moment.id]?.trim()} onClick={()=>addComment(moment.id)}>发送</button></div></div>
        </article>;
      })}
      {!visible.length && <div className="media-empty"><h3>还没有动态</h3><p>在 {groupLabel(group)} 分享第一张照片吧。</p></div>}
    </div>
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
  const [openAlbum, setOpenAlbum] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load() { const [p,a,l]=await Promise.all([supabase.from("shared_calendar_photos").select("id,group_key,uploader_email,event_id,file_name,created_at").order("created_at",{ascending:false}),supabase.from("shared_calendar_albums").select("*").order("created_at",{ascending:false}),supabase.from("shared_calendar_album_photos").select("album_id,photo_id")]); setPhotos((p.data||[]) as Photo[]); setAlbums((a.data||[]) as Album[]); setAlbumLinks((l.data||[]) as {album_id:number;photo_id:string}[]); }
  useEffect(()=>{void load()},[]);
  async function createAlbum(){if(!newAlbum.trim())return;const{error}=await supabase.from("shared_calendar_albums").insert({name:newAlbum.trim(),group_key:group,owner_user_id:user.id,owner_email:member.email});if(error)setMessage("相册创建失败");else{setNewAlbum("");await load();}}
  async function onUpload(event: ChangeEvent<HTMLInputElement>){const files=Array.from(event.target.files||[]);if(!files.length)return;setBusy(true);setMessage("");try{for(const file of files){const photo=await uploadPhoto(file,group);if(selectedAlbum){const{error}=await supabase.from("shared_calendar_album_photos").insert({album_id:Number(selectedAlbum),photo_id:photo.id,added_by_user_id:user.id});if(error)throw error;}}await load();}catch(error){setMessage(error instanceof Error?error.message:"上传失败");}finally{setBusy(false);event.target.value="";}}
  async function removePhoto(photo: Photo){if(!window.confirm("确定永久删除这张照片吗？日历和动态中的引用也会一起移除。"))return;const accessToken=await token();const response=await fetch(`${MEDIA_API}/photos/${photo.id}`,{method:"DELETE",headers:{Authorization:`Bearer ${accessToken}`}});if(!response.ok){const result=await response.json();setMessage(result.error||"删除失败");return;}await load();}
  const groupPhotos=photos.filter((photo)=>photo.group_key===group || photo.group_key==="both");const groupAlbums=albums.filter((album)=>album.group_key===group);
  const openIds=openAlbum===null?null:new Set(albumLinks.filter((link)=>link.album_id===openAlbum).map((link)=>link.photo_id));const shownPhotos=openIds?groupPhotos.filter((photo)=>openIds.has(photo.id)):groupPhotos;const openName=groupAlbums.find((album)=>album.id===openAlbum)?.name;
  return <section className="media-page albums-page"><header className="media-page-head"><div><p className="eyebrow">PHOTOS</p><h2>相册</h2></div><GroupSelect value={group} onChange={(value)=>{setGroup(value);setSelectedAlbum("");setOpenAlbum(null)}} email={member.email}/></header><div className="album-upload-bar"><label className="media-file-picker">上传到 {groupLabel(group)}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={onUpload}/><span>{busy?"正在上传…":"选择照片"}</span></label><label>放入相册（可选）<select value={selectedAlbum} onChange={(e)=>setSelectedAlbum(e.target.value)}><option value="">未整理</option>{groupAlbums.map((album)=><option key={album.id} value={album.id}>{album.name}</option>)}</select></label></div>{message&&<p className="media-error">{message}</p>}<div className="album-create"><input value={newAlbum} onChange={(e)=>setNewAlbum(e.target.value)} placeholder="新相册名称"/><button onClick={createAlbum}>＋ 新建相册</button></div><div className="album-section"><h3>{groupLabel(group)}相册</h3><div className="album-list">{groupAlbums.map((album)=>{const ids=albumLinks.filter((link)=>link.album_id===album.id).map((link)=>link.photo_id);const cover=photos.find((photo)=>photo.id===(album.cover_photo_id||ids[0]));return <button className="album-folder" key={album.id} onClick={()=>setOpenAlbum(album.id)}><span>{cover?<ProtectedPhoto photo={cover}/>:"暂无照片"}</span><b>{album.name}</b><small>{ids.length} 张 · {displayName(album.owner_email,members)}</small></button>})}</div></div><div className="album-section"><h3>{openName?<><button className="album-inline-back" onClick={()=>setOpenAlbum(null)}>‹</button>{openName}</>:"全部照片"}</h3><div className="photo-library-grid">{shownPhotos.map((photo)=><div className="library-photo" key={photo.id}><ProtectedPhoto photo={photo}/>{photo.uploader_email.toLowerCase()===member.email.toLowerCase()&&<button className="library-photo-delete" onClick={()=>removePhoto(photo)} aria-label="删除照片">×</button>}<small>{displayName(photo.uploader_email,members)}</small></div>)}</div>{!shownPhotos.length&&<div className="media-empty"><h3>还没有照片</h3><p>上传时选择组，照片只会出现在这个组的相册里。</p></div>}</div></section>;
}
