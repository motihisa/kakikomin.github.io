(() => {
  "use strict";
  const SUPABASE_URL = "https://wtlmjaqyphmaeqhipqht.supabase.co";
  const SUPABASE_KEY = "sb_publishable_Mk4N_TF_cynZ53R7nmUyjQ_JeXsZ_Cs";
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const CATS = [["general","その他・一般のお問い合わせ"],["account","アカウントについて"],["bug","不具合・エラー"],["security","セキュリティについて"],["rules","利用ルールについて"],["privacy","プライバシーについて"],["request","改善要望"],["other","その他"]];
  const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const date=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?"":d.toLocaleString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});};
  const cat=v=>CATS.find(([x])=>x===v)?.[1]||v;
  function renderContact(){
    const s=document.getElementById("contact"),i=s?.querySelector(".section-inner"); if(!i)return;
    i.innerHTML='<div class="page-header"><p class="section-label">CONTACT</p><h1>お問い合わせ</h1><p>KAKIKOMINへのお問い合わせを送信できます。</p></div><form id="contact-inquiry-form" class="settings-form"><div class="form-group"><label for="contact-category">お問い合わせの種類</label><select id="contact-category" required><option value="">選択してください</option>'+CATS.map(([v,l])=>'<option value="'+v+'">'+l+'</option>').join("")+'</select></div><div class="form-group"><label for="contact-subject">件名</label><input id="contact-subject" maxlength="120" required></div><div class="form-group"><label for="contact-email">メールアドレス（任意）</label><input type="email" id="contact-email" maxlength="320"></div><div class="form-group"><label for="contact-message">お問い合わせ内容</label><textarea id="contact-message" maxlength="5000" required></textarea></div><div class="form-group"><label for="contact-reference">参考情報（任意）</label><textarea id="contact-reference" maxlength="2000"></textarea></div><button type="submit" class="primary-button">お問い合わせを送信</button></form><div id="contact-submit-result" class="account-panel" hidden></div><div id="contact-admin-panel"></div>';
    document.getElementById("contact-inquiry-form")?.addEventListener("submit",submitInquiry); loadAdminContactPanel();
  }
  async function submitInquiry(e){
    e.preventDefault(); const {data:{user}}=await client.auth.getUser();
    if(!user){show("お問い合わせにはログインが必要です。",true);return;}
    const p={user_id:user.id,category:document.getElementById("contact-category")?.value,subject:document.getElementById("contact-subject")?.value.trim(),contact_email:document.getElementById("contact-email")?.value.trim()||null,message:document.getElementById("contact-message")?.value.trim(),reference_info:document.getElementById("contact-reference")?.value.trim()||null};
    if(!p.category||!p.subject||!p.message){show("入力されていない項目があります。",true);return;}
    const b=e.submitter;if(b)b.disabled=true; try{const {error}=await client.from("contact_inquiries").insert(p);if(error)throw error;e.target.reset();show("お問い合わせを受け付けました。",false);}catch(x){console.error(x);show("お問い合わせを送信できませんでした。",true);}finally{if(b)b.disabled=false;}
  }
  function show(m,err){const b=document.getElementById("contact-submit-result");if(!b)return;b.hidden=false;b.innerHTML="<p>"+esc(m)+"</p>";b.classList.toggle("settings-danger-zone",!!err);}
  async function isAdmin(){const {data,error}=await client.rpc("is_admin");return !error&&data===true;}
  async function loadAdminContactPanel(){const p=document.getElementById("contact-admin-panel");if(!p||!(await isAdmin()))return;p.innerHTML='<hr><div class="page-header"><p class="section-label">ADMIN</p><h2>お問い合わせ管理</h2></div><a href="#admin-contact" class="primary-button">問い合わせ管理を開く</a>';}
  async function loadAdminContactList(){
    const l=document.getElementById("admin-contact-list");if(!l)return;l.innerHTML='<div class="empty-state"><p>読み込み中...</p></div>';if(!(await isAdmin())){l.innerHTML='<div class="empty-state"><p>管理者権限が必要です。</p></div>';return;}
    const {data,error}=await client.from("contact_inquiries").select("id,user_id,category,subject,contact_email,message,reference_info,status,admin_note,created_at,updated_at").neq("status","resolved").order("created_at",{ascending:false}).limit(200);
    if(error){console.error(error);l.innerHTML='<div class="empty-state"><p>お問い合わせを読み込めませんでした。</p></div>';return;}
    if(!data?.length){l.innerHTML='<div class="empty-state"><p>未対応のお問い合わせはありません。</p></div>';return;}
    l.innerHTML=data.map(x=>'<article class="admin-list-item"><div class="admin-list-item-header"><strong>#'+x.id+' '+esc(x.subject)+'</strong><span>'+esc(date(x.created_at))+'</span></div><p><strong>種類：</strong>'+esc(cat(x.category))+'</p><p><strong>送信者：</strong>'+esc(x.user_id)+'</p><p><strong>メール：</strong>'+esc(x.contact_email||"未入力")+'</p><div class="account-panel"><p><strong>内容</strong></p><p>'+esc(x.message).replaceAll("\\n","<br>")+'</p></div><div class="form-group"><label>対応状況</label><select id="contact-status-'+x.id+'"><option value="pending" '+(x.status==="pending"?"selected":"")+'>未対応</option><option value="in_progress" '+(x.status==="in_progress"?"selected":"")+'>対応中</option><option value="resolved" '+(x.status==="resolved"?"selected":"")+'>対応済み</option></select></div><div class="form-group"><label>管理者メモ</label><textarea id="contact-note-'+x.id+'" maxlength="3000">'+esc(x.admin_note||"")+'</textarea></div><button type="button" class="primary-button" data-save="'+x.id+'">保存</button></article>').join("");
    l.querySelectorAll("[data-save]").forEach(b=>b.addEventListener("click",()=>updateInquiry(b.dataset.save)));
  }
  async function updateInquiry(id){const status=document.getElementById("contact-status-"+id)?.value,admin_note=document.getElementById("contact-note-"+id)?.value.trim()||null;const {error}=await client.from("contact_inquiries").update({status,admin_note}).eq("id",id);if(error){alert("お問い合わせを更新できませんでした。");return;}await loadAdminContactList();}
  async function initAdmin(){if(location.hash==="#admin-contact")await loadAdminContactList();}
  function init(){renderContact();window.addEventListener("hashchange",()=>{if(location.hash==="#contact")setTimeout(renderContact,0);if(location.hash==="#admin-contact")setTimeout(initAdmin,0);});if(location.hash==="#admin-contact")setTimeout(initAdmin,0);}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();