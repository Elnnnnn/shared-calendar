import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const MEDIA_API = "https://yytyntrgqkddfsliooke.supabase.co/functions/v1/shared-calendar-media-proxy";
const ELAINE_EMAIL = "elainezhang1110@gmail.com";
type GroupKey = "besties" | "friends";
type Member = { email: string; display_name: string; color: string };
type Photo = { id: string; group_key: GroupKey; uploader_email: string; event_id: number | null; file_name: string; created_at: string };
type Album = { id: number; name: string; group_key: GroupKey; owner_email: string; cover_photo_id: string | null; created_at: string };
type Moment = { id: number; group_key: GroupKey; author_email: string; caption: string; event_id: number | null; created_at: string };
type MomentPhoto = { moment_id: number; photo_id: string; position: number };
type Like = { moment_id: number; user_id: string; user_email: string };
type Comment = { id: number; moment_id: number; author_email: string; body: string; created_at: string };
type CalendarEvent = { id: number; title: string; date: string; owner: string };

function groupLabel(group: GroupKey) { return group === "besties" ? "闺蜜组" : "朋友组"; }
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

function GroupSelect({ value, onChange, email }: { value: GroupKey; onChange: (group: GroupKey) => void; email: string }) {
  const groups = allowedGroups(email);
  const [open, setOpen] = useState(false);
  if (groups.length === 1) return <span className="media-group-label">{groupLabel(groups[0])}</span>;
  return <div className="themed-dropdown"><button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{groupLabel(value)}<span>⌄</span></button>{open && <div className="themed-dropdown-menu">{groups.map((group) => <button type="button" className={value === group ? "selected" : ""} key={group} onClick={() => { onChange(group); setOpen(false); }}>{groupLabel(group)}</button>)}</div>}</div>;
}

export function EventMediaPanel({ event, user, member, members }: { event: CalendarEvent; user: User; member: Member; members: Member[] }) {
  const groups = allowedGroups(member.email);
  const [group, setGroup] = useState<GroupKey>(groups[0]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    const { data, error } = await supabase.from("shared_calendar_photos").select("id,group_key,uploader_email,event_id,file_name,created_at").eq("event_id", event.id).order("created_at");
    if (error) setMessage("活动照片读取失败");
    else setPhotos((data || []) as Photo[]);
  }
  useEffect(() => { void load(); }, [event.id]);
  async function add(eventInput: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(eventInput.target.files || []);
    if (!files.length) return;
    if (visible.length) { setMessage("每个活动只能添加一张照片，请先删除原照片再更换。"); eventInput.target.value = ""; return; }
    setBusy(true); setMessage("");
    try { for (const file of files) await uploadPhoto(file, group, event.id); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "上传失败"); }
    finally { setBusy(false); eventInput.target.value = ""; }
  }
  async function remove(photo: Photo) {
    const accessToken = await token();
    const response = await fetch(`${MEDIA_API}/photos/${photo.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) { const result = await response.json(); setMessage(result.error || "删除失败"); return; }
    await load();
  }
  const visible = photos.filter((photo) => photo.group_key === group);
  return <section className="event-media-panel"><div className="event-media-heading"><div><h3>活动照片</h3><p>{visible.length ? "1 张照片" : "为这次活动留下一张照片"}</p></div><GroupSelect value={group} onChange={setGroup} email={member.email}/></div>{visible[0] && <div className="event-cover"><ProtectedPhoto photo={visible[0]} alt={`${event.title} 封面`}/>{visible[0].uploader_email.toLowerCase()===member.email.toLowerCase()&&<button onClick={()=>remove(visible[0])} aria-label="删除活动照片">×</button>}</div>}{!visible.length&&<label className="media-file-picker">＋ 添加照片<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={add}/><span>{busy?"正在上传…":"从设备选择"}</span></label>}{message&&<p className="media-error">{message}</p>}</section>;
}

export function MomentsPage({ user, member, members, events, onOpenEvent }: { user: User; member: Member; members: Member[]; events: CalendarEvent[]; onOpenEvent: (event: CalendarEvent) => void }) {
  const groups = allowedGroups(member.email);
  const [group, setGroup] = useState<GroupKey>(groups[0]);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [links, setLinks] = useState<MomentPhoto[]>([]);
  const [likes, setLikes] = useState<Like[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [composer, setComposer] = useState(false);
  const [caption, setCaption] = useState("");
  const [eventId, setEventId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const [m, p, mp, l, c] = await Promise.all([
      supabase.from("shared_calendar_moments").select("*").order("created_at", { ascending: false }),
      supabase.from("shared_calendar_photos").select("id,group_key,uploader_email,event_id,file_name,created_at").order("created_at", { ascending: false }),
      supabase.from("shared_calendar_moment_photos").select("*"),
      supabase.from("shared_calendar_moment_likes").select("*"),
      supabase.from("shared_calendar_moment_comments").select("*").order("created_at"),
    ]);
    setMoments((m.data || []) as Moment[]); setPhotos((p.data || []) as Photo[]); setLinks((mp.data || []) as MomentPhoto[]); setLikes((l.data || []) as Like[]); setComments((c.data || []) as Comment[]);
  }
  useEffect(() => { void load(); }, []);

  async function publish() {
    if (!caption.trim() && !files.length) return;
    setBusy(true); setMessage("");
    try {
      const uploaded: Photo[] = [];
      for (const file of files.slice(0, 9)) uploaded.push(await uploadPhoto(file, group));
      const { data, error } = await supabase.from("shared_calendar_moments").insert({ group_key: group, author_user_id: user.id, author_email: member.email, caption: caption.trim(), event_id: eventId ? Number(eventId) : null }).select().single();
      if (error) throw error;
      if (uploaded.length) {
        const { error: linkError } = await supabase.from("shared_calendar_moment_photos").insert(uploaded.map((photo, position) => ({ moment_id: data.id, photo_id: photo.id, position })));
        if (linkError) throw linkError;
      }
      setCaption(""); setFiles([]); setEventId(""); setComposer(false); await load();
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
  const visible = moments.filter((moment) => moment.group_key === group);
  return <section className="media-page moments-page">
    <header className="media-page-head"><div><p className="eyebrow">MOMENTS</p><h2>动态</h2></div><div className="media-head-actions"><GroupSelect value={group} onChange={setGroup} email={member.email}/><button className="primary" onClick={() => setComposer(true)}>＋ 发布</button></div></header>
    {composer && <div className="media-composer"><div className="media-composer-head"><h3>发布到 {groupLabel(group)}</h3><button onClick={() => setComposer(false)}>×</button></div><GroupSelect value={group} onChange={setGroup} email={member.email}/><textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="说点什么……"/><label className="media-file-picker">选择照片（最多 9 张）<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 9))}/><span>{files.length ? `已选择 ${files.length} 张` : "从设备上传"}</span></label><label>关联日历活动（可选）<select value={eventId} onChange={(e) => setEventId(e.target.value)}><option value="">不关联</option>{events.filter((event) => event.id > 0).map((event) => <option key={event.id} value={event.id}>{event.title} · {event.date}</option>)}</select></label>{message && <p className="media-error">{message}</p>}<button className="primary media-publish" disabled={busy || (!caption.trim() && !files.length)} onClick={publish}>{busy ? "正在发布…" : "发布动态"}</button></div>}
    <div className="moment-feed">{visible.map((moment) => { const momentPhotos = links.filter((link) => link.moment_id === moment.id).sort((a,b) => a.position-b.position).map((link) => photos.find((photo) => photo.id === link.photo_id)).filter(Boolean) as Photo[]; const momentLikes=likes.filter((like)=>like.moment_id===moment.id); const event=events.find((item)=>item.id===moment.event_id); return <article className="moment-post" key={moment.id}><header><span className={`moment-avatar ${members.find((m)=>m.email===moment.author_email)?.color || "stone"}`}>{displayName(moment.author_email,members).slice(0,1)}</span><div><strong>{displayName(moment.author_email,members)}</strong><small>{new Date(moment.created_at).toLocaleDateString("zh-CN")} · {groupLabel(moment.group_key)}</small></div></header>{event && <button className="moment-event-link" onClick={()=>onOpenEvent(event)}>日历 · {event.title} →</button>}{moment.caption && <p className="moment-caption">{moment.caption}</p>} {!!momentPhotos.length && <div className={`moment-photo-grid count-${Math.min(momentPhotos.length,4)}`}>{momentPhotos.map((photo)=><div className="moment-photo" key={photo.id}><ProtectedPhoto photo={photo}/></div>)}</div>}<div className="moment-actions"><button className={momentLikes.some((like)=>like.user_id===user.id)?"liked":""} onClick={()=>toggleLike(moment.id)}>♡ {momentLikes.length || "赞"}</button><span>评论 {comments.filter((item)=>item.moment_id===moment.id).length}</span></div><div className="moment-comments">{comments.filter((item)=>item.moment_id===moment.id).map((comment)=><p key={comment.id}><b>{displayName(comment.author_email,members)}</b> {comment.body}</p>)}<div><input value={commentDrafts[moment.id]||""} onChange={(e)=>setCommentDrafts((value)=>({...value,[moment.id]:e.target.value}))} placeholder="写评论……" onKeyDown={(e)=>{if(e.key==="Enter")void addComment(moment.id)}}/><button onClick={()=>addComment(moment.id)}>发送</button></div></div></article>; })}{!visible.length && <div className="media-empty"><h3>还没有动态</h3><p>在 {groupLabel(group)} 分享第一张照片吧。</p></div>}</div>
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
  async function removePhoto(photo: Photo){const accessToken=await token();const response=await fetch(`${MEDIA_API}/photos/${photo.id}`,{method:"DELETE",headers:{Authorization:`Bearer ${accessToken}`}});if(!response.ok){const result=await response.json();setMessage(result.error||"删除失败");return;}await load();}
  const groupPhotos=photos.filter((photo)=>photo.group_key===group);const groupAlbums=albums.filter((album)=>album.group_key===group);
  const openIds=openAlbum===null?null:new Set(albumLinks.filter((link)=>link.album_id===openAlbum).map((link)=>link.photo_id));const shownPhotos=openIds?groupPhotos.filter((photo)=>openIds.has(photo.id)):groupPhotos;const openName=groupAlbums.find((album)=>album.id===openAlbum)?.name;
  return <section className="media-page albums-page"><header className="media-page-head"><div><p className="eyebrow">PHOTOS</p><h2>相册</h2></div><GroupSelect value={group} onChange={(value)=>{setGroup(value);setSelectedAlbum("");setOpenAlbum(null)}} email={member.email}/></header><div className="album-upload-bar"><label className="media-file-picker">上传到 {groupLabel(group)}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={onUpload}/><span>{busy?"正在上传…":"选择照片"}</span></label><label>放入相册（可选）<select value={selectedAlbum} onChange={(e)=>setSelectedAlbum(e.target.value)}><option value="">未整理</option>{groupAlbums.map((album)=><option key={album.id} value={album.id}>{album.name}</option>)}</select></label></div>{message&&<p className="media-error">{message}</p>}<div className="album-create"><input value={newAlbum} onChange={(e)=>setNewAlbum(e.target.value)} placeholder="新相册名称"/><button onClick={createAlbum}>＋ 新建相册</button></div><div className="album-section"><h3>{groupLabel(group)}相册</h3><div className="album-list">{groupAlbums.map((album)=>{const ids=albumLinks.filter((link)=>link.album_id===album.id).map((link)=>link.photo_id);const cover=photos.find((photo)=>photo.id===(album.cover_photo_id||ids[0]));return <button className="album-folder" key={album.id} onClick={()=>setOpenAlbum(album.id)}><span>{cover?<ProtectedPhoto photo={cover}/>:"暂无照片"}</span><b>{album.name}</b><small>{ids.length} 张 · {displayName(album.owner_email,members)}</small></button>})}</div></div><div className="album-section"><h3>{openName?<><button className="album-inline-back" onClick={()=>setOpenAlbum(null)}>‹</button>{openName}</>:"全部照片"}</h3><div className="photo-library-grid">{shownPhotos.map((photo)=><div className="library-photo" key={photo.id}><ProtectedPhoto photo={photo}/>{photo.uploader_email.toLowerCase()===member.email.toLowerCase()&&<button className="library-photo-delete" onClick={()=>removePhoto(photo)} aria-label="删除照片">×</button>}<small>{displayName(photo.uploader_email,members)}</small></div>)}</div>{!shownPhotos.length&&<div className="media-empty"><h3>还没有照片</h3><p>上传时选择组，照片只会出现在这个组的相册里。</p></div>}</div></section>;
}
