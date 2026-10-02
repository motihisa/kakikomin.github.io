/* KAKIKOMI site-features.js
   Add-only UI for:
   - user dark mode
   - site announcements
   - user notifications
   - admin broadcast notifications
   No passwords or secret keys are stored here.
*/
(() => {
  "use strict";

  const SUPABASE_URL = "https://wtlmjaqyphmaeqhipqht.supabase.co";
  const SUPABASE_KEY = "sb_publishable_Mk4N_TF_cynZ53R7nmUyjQ_JeXsZ_Cs";
  const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
  if (!db) return;

  const esc = (v = "") => String(v)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const date = v => {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ja-JP", {
      year:"numeric", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit"
    });
  };

  const toast = (message, type = "info") => {
    if (typeof window.toast === "function") return window.toast(message, type);
    const box = document.getElementById("toast-container");
    if (!box) return alert(message);
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = message;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  };

  function addStyles() {
    if (document.getElementById("site-features-style")) return;
    const style = document.createElement("style");
    style.id = "site-features-style";
    style.textContent = `
      html[data-theme="dark"] {
        color-scheme: dark;
        --sf-bg: #111827;
        --sf-panel: #1f2937;
        --sf-text: #f3f4f6;
        --sf-muted: #9ca3af;
        --sf-border: #374151;
      }
      html[data-theme="dark"] body { background: var(--sf-bg); color: var(--sf-text); }
      html[data-theme="dark"] .site-header,
      html[data-theme="dark"] .site-footer,
      html[data-theme="dark"] .account-panel,
      html[data-theme="dark"] .settings-form,
      html[data-theme="dark"] .modal-panel,
      html[data-theme="dark"] .post-card,
      html[data-theme="dark"] .announcement-item,
      html[data-theme="dark"] .notification-card,
      html[data-theme="dark"] .sf-card {
        background: var(--sf-panel);
        color: var(--sf-text);
        border-color: var(--sf-border);
      }
      html[data-theme="dark"] input,
      html[data-theme="dark"] textarea,
      html[data-theme="dark"] select {
        background: #111827;
        color: #f3f4f6;
        border-color: #4b5563;
      }
      .sf-card { margin-top: 24px; padding: 20px; border: 1px solid #ddd; border-radius: 14px; }
      .sf-card h2 { margin-top: 0; }
      .sf-form-grid { display: grid; gap: 14px; }
      .sf-actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; }
      .sf-list { display:grid; gap:10px; margin-top:16px; }
      .sf-item { padding:14px; border:1px solid #ddd; border-radius:10px; }
      .sf-item-title { font-weight:700; margin-bottom:5px; }
      .sf-item-meta { font-size:.85rem; opacity:.7; margin-top:8px; }
      .sf-danger { border:1px solid #c44; background:transparent; padding:6px 10px; border-radius:8px; cursor:pointer; }
      .sf-toggle { display:flex; align-items:center; gap:10px; margin:8px 0; }
      .sf-toggle input { width:20px; height:20px; }
      #sf-dark-toggle { position:fixed; right:18px; bottom:18px; z-index:9998; border:0; border-radius:999px; padding:10px 14px; cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,.18); }
      .notification-card { padding:16px; border:1px solid #ddd; border-radius:12px; margin-bottom:12px; }
      .notification-card.unread { border-width:2px; }
    `;
    document.head.appendChild(style);
  }

  async function getUser() {
    const { data } = await db.auth.getUser();
    return data?.user || null;
  }

  async function isAdmin() {
    const { data, error } = await db.rpc("is_admin");
    return !error && data === true;
  }

  async function loadDarkMode(user) {
    let enabled = localStorage.getItem("kakikomi-dark-mode") === "true";
    if (user) {
      const { data } = await db.from("user_preferences")
        .select("dark_mode").eq("user_id", user.id).maybeSingle();
      if (data) enabled = data.dark_mode === true;
    }
    applyDarkMode(enabled);
  }

  function applyDarkMode(enabled) {
    document.documentElement.dataset.theme = enabled ? "dark" : "light";
    localStorage.setItem("kakikomi-dark-mode", enabled ? "true" : "false");
    const btn = document.getElementById("sf-dark-toggle");
    if (btn) {
      btn.textContent = enabled ? "☀️ ライトモード" : "🌙 ダークモード";
      btn.setAttribute("aria-pressed", enabled ? "true" : "false");
    }
  }

  async function setDarkMode(enabled) {
    applyDarkMode(enabled);
    const user = await getUser();
    if (!user) return;
    const { error } = await db.from("user_preferences").upsert({
      user_id: user.id, dark_mode: enabled, updated_at: new Date().toISOString()
    });
    if (error) console.warn("dark mode preference:", error);
  }

  function addDarkModeControl() {
    if (document.getElementById("sf-dark-toggle")) return;
    const btn = document.createElement("button");
    btn.id = "sf-dark-toggle";
    btn.type = "button";
    btn.addEventListener("click", () => {
      const enabled = document.documentElement.dataset.theme === "dark";
      setDarkMode(!enabled);
    });
    document.body.appendChild(btn);
    applyDarkMode(localStorage.getItem("kakikomi-dark-mode") === "true");
  }

  async function loadAnnouncements() {
    const list = document.getElementById("announcement-list");
    if (!list) return;
    const { data, error } = await db.from("site_announcements")
      .select("id,title,message,created_at,starts_at,ends_at")
      .order("created_at", { ascending:false }).limit(10);
    if (error) {
      console.warn("site_announcements:", error);
      return;
    }
    list.innerHTML = data?.length
      ? data.map(x => `<article class="announcement-item">
          <strong>${esc(x.title)}</strong>
          <p>${esc(x.message).replaceAll("\\n","<br>")}</p>
          <small>${esc(date(x.created_at))}</small>
        </article>`).join("")
      : '<div class="announcement-item">お知らせはありません。</div>';
  }

  async function loadNotifications() {
    const list = document.getElementById("notification-list");
    if (!list) return;
    const user = await getUser();
    if (!user) {
      list.innerHTML = '<div class="empty-state"><p>通知を見るにはログインしてください。</p></div>';
      return;
    }
    const { data, error } = await db.from("site_notifications")
      .select("id,title,message,created_at,recipient_id")
      .order("created_at", { ascending:false }).limit(100);
    if (error) {
      console.warn("site_notifications:", error);
      list.innerHTML = '<div class="empty-state"><p>通知を読み込めませんでした。</p></div>';
      return;
    }
    list.innerHTML = data?.length
      ? data.map(x => `<article class="notification-card">
          <div class="sf-item-title">${esc(x.title)}</div>
          <div>${esc(x.message).replaceAll("\\n","<br>")}</div>
          <div class="sf-item-meta">${esc(date(x.created_at))}${x.recipient_id ? "" : " ・ 全員への通知"}</div>
        </article>`).join("")
      : '<div class="empty-state"><p>通知はありません。</p></div>';
  }

  function ensureAdminUI() {
    const section = document.getElementById("admin-site-settings");
    if (!section || document.getElementById("sf-admin-features")) return;

    const card = document.createElement("div");
    card.id = "sf-admin-features";
    card.className = "sf-card";
    card.innerHTML = `
      <h2>追加のサイト表示・通知設定</h2>

      <div class="sf-form-grid">
        <div>
          <label for="sf-ann-title">お知らせタイトル</label>
          <input id="sf-ann-title" type="text" maxlength="100" style="width:100%">
        </div>
        <div>
          <label for="sf-ann-message">お知らせ本文</label>
          <textarea id="sf-ann-message" maxlength="2000" rows="4" style="width:100%"></textarea>
        </div>
        <label class="sf-toggle">
          <input id="sf-ann-published" type="checkbox" checked>
          <span>お知らせを公開する</span>
        </label>
        <div class="sf-actions">
          <button id="sf-ann-save" type="button" class="primary-button">お知らせを追加</button>
          <button id="sf-ann-refresh" type="button" class="secondary-button">一覧を更新</button>
        </div>
        <div id="sf-ann-list" class="sf-list"></div>

        <hr>

        <div>
          <label for="sf-notify-title">全員への通知タイトル</label>
          <input id="sf-notify-title" type="text" maxlength="100" style="width:100%">
        </div>
        <div>
          <label for="sf-notify-message">全員への通知本文</label>
          <textarea id="sf-notify-message" maxlength="2000" rows="5" style="width:100%"></textarea>
        </div>
        <div class="sf-actions">
          <button id="sf-notify-send" type="button" class="primary-button">全員に通知を送る</button>
        </div>
      </div>
    `;
    section.querySelector(".section-inner")?.appendChild(card);

    document.getElementById("sf-ann-save").addEventListener("click", saveAnnouncement);
    document.getElementById("sf-ann-refresh").addEventListener("click", loadAdminAnnouncements);
    document.getElementById("sf-notify-send").addEventListener("click", sendBroadcastNotification);
    loadAdminAnnouncements();
  }

  async function loadAdminAnnouncements() {
    const list = document.getElementById("sf-ann-list");
    if (!list) return;
    if (!(await isAdmin())) return;
    const { data, error } = await db.from("site_announcements")
      .select("id,title,message,published,created_at")
      .order("created_at", { ascending:false }).limit(50);
    if (error) {
      list.innerHTML = '<div>お知らせ一覧を読み込めませんでした。</div>';
      return;
    }
    list.innerHTML = data?.length ? data.map(x => `
      <div class="sf-item">
        <div class="sf-item-title">${esc(x.title)}</div>
        <div>${esc(x.message)}</div>
        <div class="sf-item-meta">${x.published ? "公開中" : "非公開"} ・ ${esc(date(x.created_at))}</div>
        <div class="sf-actions">
          <button type="button" class="sf-danger" data-sf-delete-ann="${x.id}">削除</button>
        </div>
      </div>`).join("") : "<div>お知らせはありません。</div>";
    list.querySelectorAll("[data-sf-delete-ann]").forEach(btn => {
      btn.addEventListener("click", () => deleteAnnouncement(btn.dataset.sfDeleteAnn));
    });
  }

  async function saveAnnouncement() {
    if (!(await isAdmin())) return toast("管理者権限が必要です。", "error");
    const title = document.getElementById("sf-ann-title")?.value.trim();
    const message = document.getElementById("sf-ann-message")?.value.trim();
    const published = document.getElementById("sf-ann-published")?.checked === true;
    if (!title || !message) return toast("タイトルと本文を入力してください。", "error");

    const user = await getUser();
    const { error } = await db.from("site_announcements").insert({
      title, message, published, created_by: user?.id || null
    });
    if (error) {
      console.error(error);
      return toast("お知らせを追加できませんでした。", "error");
    }
    document.getElementById("sf-ann-title").value = "";
    document.getElementById("sf-ann-message").value = "";
    await loadAdminAnnouncements();
    await loadAnnouncements();
    toast("お知らせを追加しました。", "success");
  }

  async function deleteAnnouncement(id) {
    if (!(await isAdmin())) return toast("管理者権限が必要です。", "error");
    if (!confirm("このお知らせを削除しますか？")) return;
    const { error } = await db.from("site_announcements").delete().eq("id", id);
    if (error) return toast("お知らせを削除できませんでした。", "error");
    await loadAdminAnnouncements();
    await loadAnnouncements();
    toast("お知らせを削除しました。", "success");
  }

  async function sendBroadcastNotification() {
    if (!(await isAdmin())) return toast("管理者権限が必要です。", "error");
    const title = document.getElementById("sf-notify-title")?.value.trim();
    const message = document.getElementById("sf-notify-message")?.value.trim();
    if (!title || !message) return toast("タイトルと本文を入力してください。", "error");
    if (!confirm("この通知を全員に送信しますか？")) return;

    const user = await getUser();
    const { error } = await db.from("site_notifications").insert({
      recipient_id: null,
      title,
      message,
      created_by: user?.id || null
    });
    if (error) {
      console.error(error);
      return toast("全員への通知を送信できませんでした。", "error");
    }
    document.getElementById("sf-notify-title").value = "";
    document.getElementById("sf-notify-message").value = "";
    toast("全員に通知を送信しました。", "success");
  }

  function enhanceNotificationsRoute() {
    if (location.hash.replace(/^#/, "") !== "notifications") return;
    loadNotifications();
  }

  async function init() {
    addStyles();
    addDarkModeControl();
    const user = await getUser();
    await loadDarkMode(user);
    await loadAnnouncements();
    enhanceNotificationsRoute();

    const originalHashChange = window.__sfHashHandler;
    if (!originalHashChange) {
      window.__sfHashHandler = true;
      window.addEventListener("hashchange", () => {
        setTimeout(() => {
          enhanceNotificationsRoute();
          if (location.hash === "#admin-site-settings") setTimeout(ensureAdminUI, 50);
          if (location.hash === "#home" || location.hash === "") loadAnnouncements();
        }, 50);
      });
    }

    if (location.hash === "#admin-site-settings") setTimeout(ensureAdminUI, 50);

    db.auth.onAuthStateChange((_event, session) => {
      setTimeout(async () => {
        await loadDarkMode(session?.user || null);
        if (location.hash === "#notifications") loadNotifications();
        if (location.hash === "#admin-site-settings") setTimeout(ensureAdminUI, 50);
      }, 0);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once:true });
  } else {
    init();
  }
})();