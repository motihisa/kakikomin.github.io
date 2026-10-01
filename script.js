/* =========================================================
   KAKIKOMI - script.js (修正版)
   BUILD 2026-10-02-I  ← このファイルの先頭にこの行が見えたら最新版
   Supabase + Hash Router
   ========================================================= */

(() => {
  "use strict";

  const SUPABASE_URL = "https://wtlmjaqyphmaeqhipqht.supabase.co";
  const SUPABASE_KEY = "sb_publishable_Mk4N_TF_cynZ53R7nmUyjQ_JeXsZ_Cs";

  // ※ブラウザ側の管理者チェックは見た目の制御だけ。
  //   本当の権限チェックは Supabase の RLS ポリシー / RPC（is_admin()）で行っている。

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  console.info("KAKIKOMI script BUILD 2026-10-01-E");

  /* ---------------------------------------------------------
     掲示板カテゴリ（★ここを実際のカテゴリに書き換えてね）
     id は posts.category に保存される値。
     ------------------------------------------------------- */
  const CATEGORIES = [
    { id: "general",      name: "雑談", icon: "💬", description: "なんでも気軽に" },
    { id: "question",     name: "質問", icon: "❓", description: "わからないことを聞く" },
    { id: "consultation", name: "相談", icon: "🤝", description: "悩みごとの相談" },
    { id: "news",         name: "ニュース", icon: "📰", description: "話題・情報共有" }
  ];
  const POSTS_PAGE_SIZE = 30;      // 掲示板：1回に読み込む件数
  const LIST_LIMIT = 100;          // マイ投稿・質問・相談・検索などの最大件数
  const REPLIES_LIMIT = 200;       // 1投稿あたりの返信の最大件数
  const ADMIN_LIST_LIMIT = 200;    // 管理画面の一覧の最大件数
  const QUESTION_CATEGORY = "question";
  const CONSULTATION_CATEGORY = "consultation";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    user: null,
    profile: null,
    posts: [],
    adminPosts: [],
    reports: [],
    users: [],
    ipBans: [],
    currentCategory: "",   // "" = すべて（HTMLの「すべて」の value と揃えた）
    currentSort: "new",
    ipBanned: false,
    accessBlocked: false,
    accountBlocked: false,
    site: {
      site_name: "KAKIKOMI",
      site_description: "みんなで自由に書き込める総合掲示板",
      registration_enabled: true,
      posting_enabled: true,
      maintenance_mode: false
    },
    openReplies: new Set(),  // 返信欄を開いている投稿ID
    adminRetry: false,
    adminVerified: false,
    forcedLogoutRunning: false,
    postsHasMore: false,
    adminCounts: null,
    auditLogs: []
  };

  /* =========================================================
     COMMON
     ========================================================= */

  function escapeHTML(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("ja-JP", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  }

  function toast(message, type = "info") {
    const container = $("#toast-container");
    if (!container) {
      alert(message);
      return;
    }
    const item = document.createElement("div");
    item.className = `toast toast-${type}`;
    item.textContent = message;
    container.appendChild(item);
    setTimeout(() => item.remove(), 3500);
  }

  function setLoading(value) {
    const loading = $("#global-loading");
    if (!loading) return;
    loading.hidden = !value;
    loading.setAttribute("aria-hidden", value ? "false" : "true");
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value ?? "";
  }

  function categoryName(id) {
    return CATEGORIES.find(c => c.id === id)?.name || id || "";
  }

  function isSafeUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  function isAdminUser() {
    // サーバー側の権限は必ずRLS/RPCで保護する。
    // ただし、is_admin() の一時的なセッション判定失敗で
    // 正しい管理者を一般ユーザー扱いしないよう、取得済みの自分の
    // プロフィールもUI表示のフォールバックとして確認する。
    const profileAdmin =
      state.profile?.role === "admin" &&
      state.profile?.status === "active";
    return Boolean(state.user && (state.adminVerified === true || profileAdmin));
  }

  function comingSoon(name = "この機能") {
    toast(`${name}はまだ準備中です。`, "info");
  }

  // 書き込み系のエラー文言。RLSで弾かれたとき(42501)に分かりやすく出す。
  function writeErrorMessage(error, fallback) {
    if (state.ipBanned) {
      return "このネットワークからの書き込みは制限されています。";
    }
    if (!isAdminUser()) {
      if (state.site.maintenance_mode) return "現在メンテナンス中のため、書き込みできません。";
      if (state.site.posting_enabled === false) return "現在、投稿は停止されています。";
    }
    if (error?.code === "PT429" || error?.message === "rate_limited") {
      return "短時間に送信しすぎです。しばらく待ってからもう一度お試しください。";
    }
    if (error?.code === "23505") {
      return "すでに実行済みです。";
    }
    if (error?.code === "42501") {
      return "書き込みが制限されています。アカウントの状態を確認してください。";
    }
    return error?.message || fallback;
  }

  // このリクエスト元IPがBAN中か（サーバー側の is_ip_banned() を呼ぶ）
  async function checkIpBan() {
    try {
      const { data, error } = await supabase.rpc("is_ip_banned");
      if (error) {
        console.warn("is_ip_banned:", error);
        return false;
      }
      state.ipBanned = data === true;
      if (state.ipBanned) {
        state.accessBlocked = true;
        const title = document.getElementById("access-blocked-title");
        const message = document.getElementById("access-blocked-message");
        if (title) title.textContent = "アクセスが制限されています";
        if (message) message.textContent = "このネットワークからはサイトを利用できません。";
      }
      return state.ipBanned;
    } catch (error) {
      console.warn(error);
      return false;
    }
  }

  /* =========================================================
     MODAL
     ========================================================= */

  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.hidden = false;
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.hidden = true;
  }

  function closeAllModals() {
    $$(".modal").forEach(modal => { modal.hidden = true; });
  }

  /* =========================================================
     CATEGORIES (select / home cards)
     ========================================================= */

  function populateCategories() {
    const options = CATEGORIES.map(c =>
      `<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`
    ).join("");

    ["#post-category", "#board-category-filter", "#report-board-select"].forEach(selector => {
      const select = $(selector);
      if (!select) return;
      // 先頭の「すべて」「選択してください」を残して、既存のカテゴリ分は入れ直す
      $$("option[data-category-option]", select).forEach(o => o.remove());
      select.insertAdjacentHTML(
        "beforeend",
        options.replaceAll("<option ", "<option data-category-option ")
      );
    });

    const popular = $("#popular-categories");
    if (popular) {
      popular.innerHTML = CATEGORIES.map(c => `
        <a href="#board" class="category-card" data-category="${escapeHTML(c.id)}">
          <div class="category-icon">${escapeHTML(c.icon || "")}</div>
          <div class="category-name">${escapeHTML(c.name)}</div>
          <div class="category-description">${escapeHTML(c.description || "")}</div>
        </a>
      `).join("");
    }

    const announcements = $("#announcement-list");
    if (announcements && !announcements.children.length) {
      announcements.innerHTML = `<div class="announcement-item">お知らせはありません。</div>`;
    }
  }

  /* =========================================================
     ROUTER
     ========================================================= */

  const ROUTES = {
    "": "home",
    "home": "home",

    "login": "login",
    "admin-login": "admin-login",
    "Create_account": "Create_account",
    "create-account": "Create_account",
    "register": "Create_account",
    "forgot-password": "forgot-password",

    "profile": "profile",
    "account": "account",
    "my-posts": "my-posts",
    "bookmarks": "bookmarks",

    "board": "board",
    "create-post": "create-post",
    "questions": "questions",
    "consultations": "consultations",
    "search": "search",
    "notifications": "notifications",

    "report": "report",
    "share": "share",

    "account-settings": "account-settings",
    "security-settings": "security-settings",

    "private-boards": "private-boards",
    "private-board": "private-board",
    "rules": "rules",
    "privacy": "privacy",
    "contact": "contact",
    "bot": "bot",

    "admin": "admin",
    "admin-users": "admin-users",
    "admin-user-detail": "admin-user-detail",
    "admin-posts": "admin-posts",
    "admin-reports": "admin-reports",
    "admin-ip-ban": "admin-ip-ban",
    "admin-bots": "admin-bots",
    "admin-private-boards": "admin-private-boards",
    "admin-site-settings": "admin-site-settings",
    "admin-logs": "admin-logs"
  };

  // ログインが必要なページ
  const AUTH_ROUTES = new Set([
    "create-post", "my-posts", "bookmarks", "notifications", "profile",
    "account-settings", "security-settings", "private-boards", "private-board"
  ]);

  function getRoute() {
    const hash = location.hash.replace(/^#/, "");
    if (hash.startsWith("private-board-")) return "private-board";
    return ROUTES[hash] || null;
  }

  function navigate(route) {
    if (!route.startsWith("#")) route = `#${route}`;
    if (location.hash === route) {
      renderRoute();
    } else {
      location.hash = route;
    }
  }

  function showError() {
    const error = $("#error-page");
    if (error) {
      error.hidden = false;
      error.classList.add("active");
    }
  }

  // ページごとのデータ読み込み（スクロールはしない）
  function runRouteLoader(route) {
    switch (route) {
      case "board": loadPosts(); break;
      case "profile": renderProfilePage(); break;
      case "account": renderAccount(); break;
      case "account-settings": fillSettingsForm(); break;
      case "my-posts": loadMyPosts(); break;
      case "questions": loadCategoryPosts(QUESTION_CATEGORY, "#question-list"); break;
      case "consultations": loadCategoryPosts(CONSULTATION_CATEGORY, "#consultation-list"); break;
      case "bookmarks": showPlaceholder("#bookmark-list", "ブックマーク機能は準備中です。"); break;
      case "notifications": showPlaceholder("#notification-list", "通知はありません。"); break;
      case "private-boards": loadPrivateBoards(); break;
      case "private-board": loadPrivateBoardDetail(); break;
      case "bot": showPlaceholder("#bot-list", "Botはまだありません。"); break;
      case "admin-site-settings": loadSiteSettings().then(fillSiteSettingsForm); break;
      case "admin-logs": loadAdminLogs(); break;
      default:
        if (route.startsWith("admin")) loadAdminData();
    }
  }

  function renderRoute() {
    const route = getRoute();

    closeAllModals();

    if (state.accessBlocked || state.accountBlocked) {
      $(".page-section").forEach(section => {
        section.hidden = true;
        section.classList.remove("active");
      });

      const id = state.accountBlocked ? "account-blocked" : "access-blocked";
      const blocked = document.getElementById(id);
      if (blocked) {
        blocked.hidden = false;
        blocked.classList.add("active");
      }
      return;
    }

    if (state.site.maintenance_mode) {
      const maintenance = document.getElementById("maintenance");
      if (maintenance) {
        maintenance.hidden = false;
        maintenance.classList.add("active");
      }
      return;
    }

    $$(".page-section").forEach(section => {
      section.hidden = true;
      section.classList.remove("active");
    });

    if (!route) {
      showError();
      return;
    }

    const target = document.getElementById(route);
    if (!target) {
      showError();
      return;
    }

    if (AUTH_ROUTES.has(route) && !state.user) {
      toast("ログインしてください。", "error");
      navigate("#login");
      return;
    }

    if (route.startsWith("admin")) {
      ensureAdmin().then(allowed => {
        if (allowed) {
          const currentRoute = getRoute();
          if (currentRoute === route) {
            target.hidden = false;
            target.classList.add("active");
            runRouteLoader(route);
            window.scrollTo({ top: 0, behavior: "instant" });
          }
        }
      });
      return;
    }

    target.hidden = false;
    target.classList.add("active");

    runRouteLoader(route);

    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function refreshRoute() {
    const route = getRoute();
    if (!route) return;

    if (route === "board") {
      loadPosts(true);
      return;
    }

    runRouteLoader(route);
  }

  function showPlaceholder(selector, message) {
    const el = $(selector);
    if (el) el.innerHTML = `<div class="empty-state"><p>${escapeHTML(message)}</p></div>`;
  }

  /* =========================================================
     AUTH
     ========================================================= */

  async function loadCurrentUser() {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error(error);
      state.user = null;
      state.profile = null;
      updateAuthUI();
      return;
    }

    state.user = data.session?.user || null;

    if (state.user) {
      await loadProfile();

      if (state.profile?.status === "banned") {
        state.accessBlocked = false;
        state.accountBlocked = true;
        const message = document.getElementById("account-blocked-message");
        if (message) message.textContent = state.profile?.ban_reason || "このアカウントではサイトを利用できません。";
      }
    } else {
      state.profile = null;
      state.adminVerified = false;
    }

    updateAuthUI();
  }

  async function login(email, password) {
    if (!email || !password) {
      toast("メールアドレスとパスワードを入力してください。", "error");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      state.user = data.user;
      await loadProfile();
      updateAuthUI();
      recordLoginIp(true);

      toast("ログインしました。", "success");
      navigate("#home");
    } catch (error) {
      console.error(error);
      toast(error.message || "ログインに失敗しました。", "error");
    } finally {
      setLoading(false);
    }
  }

  async function register(username, email, password) {
    if (state.site.registration_enabled === false) {
      toast("現在、新規登録を受け付けていません。", "error");
      return;
    }

    if (!username || !email || !password) {
      toast("必要な項目を入力してください。", "error");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } }
      });
      if (error) throw error;
      if (!data.user) throw new Error("アカウントを作成できませんでした。");

      // メール確認がONだとここではセッションがない。
      // その場合のプロフィール作成はDBトリガー（auth.users → profiles）に任せる。
      if (!data.session) {
        toast("確認メールを送信しました。メール内のリンクを開いてからログインしてください。", "success");
        navigate("#login");
        return;
      }

      // role / status はクライアントから送らない（自分で admin にできてしまうため）。
      // DB側のデフォルト値（role='user', status='active'）に任せる。
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({ id: data.user.id, username, bio: "" });

      if (profileError) {
        console.error(profileError);
        toast("アカウントは作成されましたが、プロフィール作成に失敗しました。", "error");
        return;
      }

      state.user = data.user;
      await loadProfile();
      updateAuthUI();

      toast("アカウントを作成しました。", "success");
      navigate("#home");
    } catch (error) {
      console.error(error);
      toast(error.message || "アカウント作成に失敗しました。", "error");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      toast("ログアウトしました。", "success");
    } catch (error) {
      console.error(error);
      toast("ログアウト処理を完了しました。", "success");
    } finally {
      state.user = null;
      state.profile = null;
      updateAuthUI();
      setLoading(false);
      navigate("#login");
    }
  }

  async function sendPasswordReset(email) {
    if (!email) {
      toast("メールアドレスを入力してください。", "error");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}${location.pathname}#security-settings`
      });
      if (error) throw error;

      toast("リセット用のメールを送信しました。", "success");
      $("#forgot-password-form")?.reset();
    } catch (error) {
      console.error(error);
      toast(error.message || "メールを送信できませんでした。", "error");
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     PROFILE
     ========================================================= */

  async function loadProfile() {
    const userAtStart = state.user;

    if (!userAtStart) {
      state.profile = null;
      state.adminVerified = false;
      return null;
    }

    // 自分自身のアカウント状態は専用RPCから取得する。
    // profilesテーブルの直接SELECTやSETOF profilesの戻り値に依存しない。
    let data = null;
    let profileError = null;

    try {
      const result = await supabase.rpc("get_my_account_state");
      data = result.data;
      profileError = result.error;
    } catch (error) {
      profileError = error;
    }

    // 認証状態が取得途中で切り替わった場合、古いリクエストの結果で
    // 新しいログイン状態を上書きしない。
    if (state.user?.id !== userAtStart.id) {
      return null;
    }

    // 管理者判定はプロフィール取得とは独立してDB側でも確認する。
    try {
      const { data: adminData, error: adminError } = await supabase.rpc("is_admin");
      if (!adminError && state.user?.id === userAtStart.id) {
        state.adminVerified = adminData === true;
      } else if (state.user?.id === userAtStart.id) {
        console.warn("is_admin:", adminError);
        state.adminVerified = false;
      }
    } catch (error) {
      if (state.user?.id === userAtStart.id) {
        console.warn("is_admin:", error);
        state.adminVerified = false;
      }
    }

    if (profileError) {
      if (isForcedLogoutError(profileError)) {
        await handleForcedLogout();
        return null;
      }
      console.error("get_my_account_state:", profileError);
      state.profile = null;
      return null;
    }

    if (!data || !data.id) {
      console.error("get_my_account_state: empty account state");
      state.profile = null;
      return null;
    }

    state.profile = data;

    if (data.force_logout_at && (await isTokenOlderThan(data.force_logout_at))) {
      await handleForcedLogout();
      return null;
    }

    return data;
  }

  /* ---------- IPアドレスの記録・表示 ---------- */

  // ログイン中のユーザーの今のIPを、サーバーが履歴に記録する（IPはサーバーがヘッダーから読む）
  async function recordLoginIp(force = false) {
    if (!state.user) return;

    const key = `kakikomi-ip-logged:${state.user.id}`;
    if (!force) {
      try {
        if (sessionStorage.getItem(key)) return;
      } catch { /* sessionStorage が使えない場合は毎回記録する */ }
    }

    const { error } = await supabase.rpc("record_login_ip");
    if (error) {
      console.warn("record_login_ip:", error);
      return;
    }

    try {
      sessionStorage.setItem(key, "1");
    } catch { /* ignore */ }
  }

  // 管理者だけ：投稿・返信のIP（target_id → ip_address）
  async function fetchContentIps(kind, ids) {
    const map = new Map();
    if (!isAdminUser() || !ids.length) return map;

    const { data, error } = await supabase
      .from("content_ips")
      .select("target_id, ip_address")
      .eq("kind", kind)
      .in("target_id", ids);

    if (error) {
      console.warn("content_ips:", error);
      return map;
    }

    (data || []).forEach(row => map.set(row.target_id, row.ip_address));
    return map;
  }

  function adminIpLine(ip) {
    if (!isAdminUser()) return "";
    return `<small style="display:block;margin-top:8px;color:var(--text-muted);">IP: ${escapeHTML(ip || "記録なし")}</small>`;
  }

  // 管理者のユーザー詳細に、ログインIP履歴と投稿時のIPを表示する
  async function renderAdminUserIps(userId) {
    const form = $("#admin-user-settings-form");
    if (!form) return;

    let box = $("#admin-user-ips");
    if (!box) {
      box = document.createElement("div");
      box.id = "admin-user-ips";
      box.className = "account-panel";
      box.style.margin = "16px 0";
      form.parentNode.insertBefore(box, form);
    }

    box.innerHTML = `
      <h2 style="margin:0 0 8px;font-size:1rem;">IPアドレス</h2>
      <p style="margin:0;color:var(--text-secondary);">読み込み中...</p>
    `;

    const [loginResult, contentResult] = await Promise.all([
      supabase.from("user_ips").select("*").eq("user_id", userId)
        .order("last_seen", { ascending: false }).limit(50),
      supabase.from("content_ips").select("kind, ip_address, created_at").eq("user_id", userId)
        .order("created_at", { ascending: false }).limit(30)
    ]);

    if (loginResult.error || contentResult.error) {
      console.warn(loginResult.error || contentResult.error);
      box.innerHTML = `
        <h2 style="margin:0 0 8px;font-size:1rem;">IPアドレス</h2>
        <p style="margin:0;color:var(--danger);">IPアドレスを読み込めませんでした。</p>
      `;
      return;
    }

    const logins = loginResult.data || [];
    const contents = contentResult.data || [];

    const row = (left, right) => `
      <div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid var(--border);font-size:.86rem;">
        <span style="overflow-wrap:anywhere;">${left}</span>
        <span style="color:var(--text-muted);white-space:nowrap;">${right}</span>
      </div>`;

    box.innerHTML = `
      <h2 style="margin:0 0 8px;font-size:1rem;">IPアドレス</h2>

      <h3 style="margin:12px 0 4px;font-size:.88rem;">ログイン履歴</h3>
      ${logins.length
        ? logins.map(r => row(
            escapeHTML(r.ip_address),
            `最終 ${escapeHTML(formatDate(r.last_seen))} ・ ${r.seen_count}回`
          )).join("")
        : `<p style="margin:0;color:var(--text-secondary);font-size:.86rem;">記録はまだありません。</p>`}

      <h3 style="margin:16px 0 4px;font-size:.88rem;">投稿・返信したときのIP</h3>
      ${contents.length
        ? contents.map(r => row(
            escapeHTML(r.ip_address || "記録なし"),
            `${r.kind === "post" ? "投稿" : "返信"} ・ ${escapeHTML(formatDate(r.created_at))}`
          )).join("")
        : `<p style="margin:0;color:var(--text-secondary);font-size:.86rem;">記録はまだありません。</p>`}
    `;
  }

  /* ---------- 強制ログアウト ---------- */

  function isForcedLogoutError(error) {
    return error?.code === "FORCED_LOGOUT";
  }

  function decodeJwtPayload(token) {
    try {
      const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(
        atob(base64).split("").map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
      );
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  async function isTokenOlderThan(isoTime) {
    const { data } = await supabase.auth.getSession();
    const payload = data?.session ? decodeJwtPayload(data.session.access_token) : null;
    if (!payload?.iat) return false;
    return payload.iat * 1000 < new Date(isoTime).getTime();
  }

  async function handleForcedLogout() {
    if (state.forcedLogoutRunning) return;
    state.forcedLogoutRunning = true;

    try {
      // サーバー側でセッションは削除済みなので、この端末の保存分だけ消す
      await supabase.auth.signOut({ scope: "local" });
    } catch (error) {
      console.warn(error);
    }

    state.user = null;
    state.profile = null;
    updateAuthUI();

    toast("管理者によってログアウトされました。もう一度ログインしてください。", "error");
    navigate("#login");

    state.forcedLogoutRunning = false;
  }

  // 1分ごと、またはタブに戻ってきたときに、強制ログアウトされていないか確認する
  function startSessionWatch() {
    const check = () => {
      if (state.user) loadProfile();
    };

    setInterval(check, 60 * 1000);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) check();
    });
  }

  // 管理画面：選んだユーザーを強制ログアウトする
  async function forceDeleteUser() {
    if (!(await ensureAdmin())) return;

    const userId = $("#admin-target-user-id")?.value;
    const name = $("#admin-target-username")?.textContent || "このユーザー";

    if (!userId) {
      toast("ユーザーが選ばれていません。", "error");
      return;
    }

    if (userId === state.user?.id) {
      toast("自分自身のアカウントはここから削除できません。", "error");
      return;
    }

    if (!confirm(`${name} を完全に削除しますか？\nこの操作は元に戻せません。`)) return;

    const { error } = await supabase.rpc("admin_force_delete_user", { target_user: userId });

    if (error) {
      console.error(error);
      toast("アカウントを削除できませんでした。", "error");
      return;
    }

    toast(`${name} のアカウントを削除しました。`, "success");
    navigate("#admin-users");
    loadAdminData();
  }

  async function forceLogoutUser() {
    if (!(await ensureAdmin())) return;

    const userId = $("#admin-target-user-id")?.value;
    const name = $("#admin-target-username")?.textContent || "このユーザー";

    if (!userId) {
      toast("ユーザーが選ばれていません。", "error");
      return;
    }

    if (!confirm(`${name} を強制ログアウトしますか？\nすべての端末でログアウトされます。`)) {
      return;
    }

    const { error } = await supabase.rpc("admin_force_logout", { target_user: userId });

    if (error) {
      console.error(error);
      toast("強制ログアウトできませんでした。", "error");
      return;
    }

    toast(`${name} を強制ログアウトしました。`, "success");
  }

  function renderAccount() {
    const guest = $("#guest-account");
    const loggedIn = $("#logged-in-account");

    if (!state.user) {
      if (guest) guest.hidden = false;
      if (loggedIn) loggedIn.hidden = true;
      return;
    }

    if (guest) guest.hidden = true;
    if (loggedIn) loggedIn.hidden = false;

    const username = state.profile?.username || "ユーザー";

    setText("account-username", username);
    setText("account-user-id", `ID: ${state.user.id}`);

    const avatar = $("#logged-in-account .large-avatar");
    if (avatar) avatar.textContent = username.charAt(0) || "?";
  }

  async function renderProfilePage() {
    const profile = state.profile;
    if (!state.user || !profile) return;

    const username = profile.username || "ユーザー";

    setText("profile-name", username);
    setText("profile-description", profile.bio || "");

    const avatar = $("#profile-header .large-avatar");
    if (avatar) avatar.textContent = username.charAt(0) || "?";

    // 自分のプロフィールなのでフォローボタンは出さない（フォロー機能は未実装）
    const follow = $("#follow-button");
    if (follow) follow.hidden = true;

    const { data } = await fetchPosts(q => q.eq("user_id", state.user.id).limit(LIST_LIMIT));
    setText("profile-post-count", data.length);
    renderPostList("#profile-posts", data);
  }

  function fillSettingsForm() {
    const username = $("#profile-username-input");
    const bio = $("#profile-bio-input");
    if (username) username.value = state.profile?.username || "";
    if (bio) bio.value = state.profile?.bio || "";
  }

  async function updateProfile() {
    if (!state.user) {
      toast("ログインしてください。", "error");
      return;
    }

    const username = $("#profile-username-input")?.value.trim();
    const bio = $("#profile-bio-input")?.value.trim() || "";

    if (!username) {
      toast("ユーザー名を入力してください。", "error");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ username, bio })
      .eq("id", state.user.id);

    if (error) {
      console.error(error);
      toast("プロフィールを更新できませんでした。", "error");
      return;
    }

    await loadProfile();
    updateAuthUI();

    toast("プロフィールを更新しました。", "success");
  }

  /* =========================================================
     POSTS
     ========================================================= */

  const POST_SELECT_BASE = `*, profiles:user_id (id, username, avatar_url)`;
  const POST_SELECT_WITH_LIKES = `${POST_SELECT_BASE}, likes(count)`;
  const POST_SELECT_WITH_COUNTS = `${POST_SELECT_BASE}, likes(count), replies(count)`;

  function normalizePost(post) {
    const counted = post.likes?.[0]?.count;
    const replies = post.replies?.[0]?.count;
    return {
      ...post,
      likeCount: counted ?? post.like_count ?? 0,
      replyCount: replies ?? 0
    };
  }

  // likes(count) の結合が使えない環境（外部キー無し等）でも動くようにフォールバックする
  async function fetchPosts(applyFilters) {
    let lastError = null;

    for (const select of [POST_SELECT_WITH_COUNTS, POST_SELECT_WITH_LIKES, POST_SELECT_BASE]) {
      let query = supabase
        .from("posts")
        .select(select)
        .order("created_at", { ascending: false });

      if (applyFilters) query = applyFilters(query);

      const { data, error } = await query;

      if (!error) {
        const posts = (data || []).map(normalizePost);

        if (isAdminUser()) {
          const ips = await fetchContentIps("post", posts.map(post => post.id));
          posts.forEach(post => { post.adminIp = ips.get(post.id); });
        }

        return { data: posts, error: null };
      }

      if (isForcedLogoutError(error)) {
        await handleForcedLogout();
        return { data: [], error };
      }

      lastError = error;
      console.warn("posts fetch failed, retrying:", error);
    }

    console.error(lastError);
    return { data: [], error: lastError };
  }

  function postCardHTML(post) {
    const profile = post.profiles || {};
    const username = profile.username || "ユーザー";
    const canDelete =
      state.user && (state.user.id === post.user_id || isAdminUser());

    const image = post.image_url && isSafeUrl(post.image_url)
      ? `<img src="${escapeHTML(post.image_url)}" alt="" loading="lazy" style="margin-top:12px;border-radius:8px;">`
      : "";

    return `
      <article class="post-card" data-post-id="${escapeHTML(post.id)}">
        <div class="post-card-header">
          <div class="post-user">
            <div class="avatar">${escapeHTML(username.charAt(0))}</div>
            <div>
              <strong>${escapeHTML(username)}</strong>
              <small>${escapeHTML(formatDate(post.created_at))}</small>
            </div>
          </div>
          ${canDelete ? `
            <button type="button" class="post-menu-button"
              data-delete-post="${escapeHTML(post.id)}">削除</button>` : ""}
        </div>

        <div class="post-card-body">
          <span class="post-category">${escapeHTML(categoryName(post.category))}</span>
          <h2>${escapeHTML(post.title)}</h2>
          <p>${escapeHTML(post.content)}</p>
          ${image}
          ${adminIpLine(post.adminIp)}
        </div>

        <footer class="post-card-footer">
          <button type="button" class="post-action" data-like-post="${escapeHTML(post.id)}">
            いいね <span class="like-count">${post.likeCount || 0}</span>
          </button>
          ${post.allow_replies !== false || post.replyCount > 0 ? `
            <button type="button" class="post-action" aria-expanded="false"
              data-toggle-replies="${escapeHTML(post.id)}">
              返信 <span class="reply-count">${post.replyCount || 0}</span>
            </button>` : ""}
          ${post.allow_share !== false ? `
            <button type="button" class="post-action"
              data-share-post="${escapeHTML(post.id)}">共有</button>` : ""}
          <button type="button" class="post-action"
            data-report-post="${escapeHTML(post.id)}">通報</button>
        </footer>

        <div class="post-replies" hidden
          data-replies-panel="${escapeHTML(post.id)}"
          data-allow-replies="${post.allow_replies !== false}"
          style="display:grid;gap:12px;padding:14px 18px 18px;border-top:1px solid var(--border);"></div>
      </article>
    `;
  }

  function renderPostList(selector, posts, emptyMessage = "投稿はありません。") {
    const list = $(selector);
    if (!list) return;

    if (!posts.length) {
      list.innerHTML = `<div class="empty-state"><p>${escapeHTML(emptyMessage)}</p></div>`;
      return;
    }

    list.innerHTML = posts.map(postCardHTML).join("");
    restoreOpenReplies(list);
  }

  async function loadPosts(keepLoaded = false) {
    const list = $("#post-list");
    if (!list) return;

    // keepLoaded: 「もっと見る」で読み込んだ分を保ったまま更新する（いいね・削除のあと用）
    const size = keepLoaded
      ? Math.max(state.posts.length, POSTS_PAGE_SIZE)
      : POSTS_PAGE_SIZE;

    if (!keepLoaded) {
      list.innerHTML = `<div class="empty-state"><p>読み込み中...</p></div>`;
    }

    const { data, error } = await fetchPosts(q => {
      if (state.currentCategory) q = q.eq("category", state.currentCategory);
      return q.range(0, size - 1);
    });

    if (error) {
      list.innerHTML = `<div class="empty-state"><p>投稿を読み込めませんでした。</p></div>`;
      return;
    }

    state.posts = data;
    state.postsHasMore = data.length === size;
    renderPosts();
  }

  async function loadMorePosts() {
    const offset = state.posts.length;

    const { data, error } = await fetchPosts(q => {
      if (state.currentCategory) q = q.eq("category", state.currentCategory);
      return q.range(offset, offset + POSTS_PAGE_SIZE - 1);
    });

    if (error) {
      toast("投稿を読み込めませんでした。", "error");
      return;
    }

    const known = new Set(state.posts.map(post => String(post.id)));
    state.posts = [...state.posts, ...data.filter(post => !known.has(String(post.id)))];
    state.postsHasMore = data.length === POSTS_PAGE_SIZE;
    renderPosts();
  }

  // 「もっと見る」ボタン（HTMLを変えずに、一覧のすぐ下に作る）
  function updateLoadMoreButton() {
    const list = $("#post-list");
    if (!list) return;

    let button = $("#load-more-posts");

    if (!state.postsHasMore) {
      button?.remove();
      return;
    }

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.id = "load-more-posts";
      button.className = "secondary-button";
      button.textContent = "もっと見る";
      button.style.margin = "16px auto 0";
      button.style.display = "flex";
      list.insertAdjacentElement("afterend", button);
    }
  }

  function renderPosts() {
    const noPosts = $("#no-posts");
    const list = $("#post-list");
    if (!list) return;

    const posts = [...state.posts];

    if (state.currentSort === "popular") {
      posts.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
    }

    if (!posts.length) {
      list.innerHTML = "";
      if (noPosts) noPosts.hidden = false;
      updateLoadMoreButton();
      return;
    }

    if (noPosts) noPosts.hidden = true;
    list.innerHTML = posts.map(postCardHTML).join("");
    restoreOpenReplies(list);
    updateLoadMoreButton();
  }

  async function loadMyPosts() {
    if (!state.user) return;
    const { data, error } = await fetchPosts(q => q.eq("user_id", state.user.id).limit(LIST_LIMIT));
    if (error) {
      showPlaceholder("#my-post-list", "投稿を読み込めませんでした。");
      return;
    }
    renderPostList("#my-post-list", data, "まだ投稿がありません。");
  }

  async function loadCategoryPosts(category, selector) {
    const { data, error } = await fetchPosts(q => q.eq("category", category).limit(LIST_LIMIT));
    if (error) {
      showPlaceholder(selector, "投稿を読み込めませんでした。");
      return;
    }
    renderPostList(selector, data, "まだ投稿がありません。");
  }

  async function createPost() {
    if (!state.user) {
      toast("投稿するにはログインしてください。", "error");
      navigate("#login");
      return;
    }

    const category = $("#post-category")?.value;
    const title = $("#post-title")?.value.trim();
    const content = $("#post-content")?.value.trim();
    const imageUrl = $("#post-image")?.value.trim();
    const allowReplies = $("#allow-replies")?.checked ?? true;
    const allowShare = $("#allow-share")?.checked ?? true;

    if (!category || !title || !content) {
      toast("必要な項目を入力してください。", "error");
      return;
    }

    if (imageUrl && !isSafeUrl(imageUrl)) {
      toast("画像URLは http(s):// から始まるURLを入力してください。", "error");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.from("posts").insert({
        user_id: state.user.id,
        category,
        title,
        content,
        image_url: imageUrl || null,
        allow_replies: allowReplies,
        allow_share: allowShare
      });

      if (error) throw error;

      $("#post-form")?.reset();
      updateCharacterCount();
      updateImagePreview();

      toast("投稿しました。", "success");
      navigate("#board");
    } catch (error) {
      console.error(error);
      toast(writeErrorMessage(error, "投稿に失敗しました。"), "error");
    } finally {
      setLoading(false);
    }
  }

  function openDeletePostModal(postId) {
    if (!state.user) return;
    const input = $("#delete-post-id");
    if (!input) {
      // モーダルが無い場合の保険
      if (confirm("この投稿を削除しますか？")) deletePost(postId);
      return;
    }
    input.value = postId;
    openModal("delete-post-dialog");
  }

  async function deletePost(postId) {
    if (!state.user || !postId) return;

    // 権限の本チェックはRLS。ここは無駄なリクエストを避けるための簡易チェック。
    const post = [...state.posts, ...state.adminPosts].find(item => String(item.id) === String(postId));
    if (post && post.user_id !== state.user.id && !isAdminUser()) {
      toast("この投稿を削除する権限がありません。", "error");
      return;
    }

    const { error } = await supabase.from("posts").delete().eq("id", postId);

    if (error) {
      console.error(error);
      toast("投稿を削除できませんでした。", "error");
      return;
    }

    toast("投稿を削除しました。", "success");
    refreshRoute();
  }

  /* =========================================================
     LIKE / REPLY / SHARE
     ========================================================= */

  async function likePost(postId) {
    if (!state.user) {
      toast("いいねするにはログインしてください。", "error");
      navigate("#login");
      return;
    }

    const { data: existing, error: checkError } = await supabase
      .from("likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", state.user.id)
      .maybeSingle();

    if (checkError) {
      console.error(checkError);
      toast("いいねできませんでした。", "error");
      return;
    }

    const result = existing
      ? await supabase.from("likes").delete().eq("id", existing.id)
      : await supabase.from("likes").insert({ post_id: postId, user_id: state.user.id });

    if (result.error) {
      console.error(result.error);
      toast(writeErrorMessage(result.error, "いいねできませんでした。"), "error");
      return;
    }

    refreshRoute();
  }

  /* ---------- 返信の表示・投稿・削除 ---------- */

  function replyItemHTML(reply) {
    const name = reply.profiles?.username || "ユーザー";
    const canDelete =
      state.user && (state.user.id === reply.user_id || isAdminUser());

    return `
      <div style="padding:10px 12px;background:var(--surface-soft);border-radius:8px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
          <strong style="font-size:.86rem;">${escapeHTML(name)}</strong>
          <small style="color:var(--text-muted);">${escapeHTML(formatDate(reply.created_at))}</small>
        </div>
        <p style="margin:4px 0 0;white-space:pre-wrap;">${escapeHTML(reply.content)}</p>
        ${adminIpLine(reply.adminIp)}
        ${canDelete ? `
          <button type="button" class="post-menu-button" style="margin-top:8px;"
            data-delete-reply="${escapeHTML(reply.id)}"
            data-reply-user-id="${escapeHTML(reply.user_id)}"
            data-reply-post-id="${escapeHTML(reply.post_id)}">削除</button>` : ""}
      </div>
    `;
  }

  function replyFormHTML(postId, allowReplies) {
    if (!allowReplies) {
      return `<p style="margin:0;color:var(--text-secondary);font-size:.86rem;">この投稿は返信できません。</p>`;
    }

    if (!state.user) {
      return `<p style="margin:0;font-size:.86rem;">
        <a href="#login" style="color:var(--primary);font-weight:700;">ログイン</a>すると返信できます。</p>`;
    }

    const inputId = `reply-input-${escapeHTML(postId)}`;

    return `
      <form data-reply-form="${escapeHTML(postId)}" style="display:grid;gap:8px;">
        <label class="visually-hidden" for="${inputId}">返信を書く</label>
        <textarea id="${inputId}" maxlength="2000" required
          placeholder="返信を書く" style="min-height:80px;"></textarea>
        <button type="submit" class="primary-button" style="justify-self:start;">返信する</button>
      </form>
    `;
  }

  async function loadReplies(postId) {
    const panels = $$(`[data-replies-panel="${CSS.escape(String(postId))}"]`);
    if (!panels.length) return;

    panels.forEach(panel => {
      panel.innerHTML = `<p style="margin:0;color:var(--text-secondary);">読み込み中...</p>`;
    });

    // 名前つきで取得。結合が使えない場合は名前なしで取得し直す。
    let { data, error } = await supabase
      .from("replies")
      .select("*, profiles:user_id (id, username)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .limit(REPLIES_LIMIT);

    if (error) {
      console.warn("replies with profiles failed, retrying:", error);
      ({ data, error } = await supabase
        .from("replies")
        .select("*")
        .eq("post_id", postId)
        .order("created_at", { ascending: true })
        .limit(REPLIES_LIMIT));
    }

    if (error) {
      console.error(error);
      panels.forEach(panel => {
        panel.innerHTML = `<p style="margin:0;color:var(--danger);">返信を読み込めませんでした。</p>`;
      });
      return;
    }

    const replies = data || [];

    if (isAdminUser() && replies.length) {
      const ips = await fetchContentIps("reply", replies.map(reply => reply.id));
      replies.forEach(reply => { reply.adminIp = ips.get(reply.id); });
    }

    panels.forEach(panel => {
      const allowReplies = panel.dataset.allowReplies !== "false";
      panel.innerHTML = `
        ${replies.length
          ? replies.map(replyItemHTML).join("")
          : `<p style="margin:0;color:var(--text-secondary);font-size:.86rem;">まだ返信はありません。</p>`}
        ${replyFormHTML(postId, allowReplies)}
      `;
    });

    // ボタンの件数も最新に
    $$(`[data-toggle-replies="${CSS.escape(String(postId))}"] .reply-count`).forEach(el => {
      el.textContent = replies.length;
    });
  }

  async function toggleReplies(postId, button) {
    const panel = button.closest(".post-card")?.querySelector("[data-replies-panel]");
    if (!panel) return;

    if (panel.hidden) {
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
      state.openReplies.add(String(postId));
      await loadReplies(postId);
    } else {
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
      state.openReplies.delete(String(postId));
    }
  }

  // 一覧を描き直したあとも、開いていた返信欄を開き直す
  function restoreOpenReplies(root) {
    if (!root || !state.openReplies.size) return;

    state.openReplies.forEach(postId => {
      const panel = root.querySelector(`[data-replies-panel="${CSS.escape(postId)}"]`);
      if (!panel) return;

      panel.hidden = false;
      root.querySelector(`[data-toggle-replies="${CSS.escape(postId)}"]`)
        ?.setAttribute("aria-expanded", "true");
      loadReplies(postId);
    });
  }

  async function submitReply(postId, form) {
    if (!state.user) {
      toast("返信するにはログインしてください。", "error");
      navigate("#login");
      return;
    }

    const textarea = form.querySelector("textarea");
    const button = form.querySelector("button[type=submit]");
    const content = textarea?.value.trim();
    if (!content) return;

    if (button) button.disabled = true;

    const { error } = await supabase.from("replies").insert({
      post_id: postId,
      user_id: state.user.id,
      content
    });

    if (button) button.disabled = false;

    if (error) {
      console.error(error);
      toast(writeErrorMessage(error, "返信できませんでした。"), "error");
      return;
    }

    toast("返信しました。", "success");
    await loadReplies(postId);
  }

  async function deleteReply(replyId, postId, ownerId) {
    if (!state.user) return;

    // 本当の権限チェックはRLS（本人か管理者のみ）。ここは無駄なリクエストを避けるための確認。
    if (ownerId && ownerId !== state.user.id && !isAdminUser()) {
      toast("この返信を削除する権限がありません。", "error");
      return;
    }

    if (!confirm("この返信を削除しますか？")) return;

    const { error } = await supabase.from("replies").delete().eq("id", replyId);

    if (error) {
      console.error(error);
      toast("返信を削除できませんでした。", "error");
      return;
    }

    toast("返信を削除しました。", "success");
    await loadReplies(postId);
  }

  /* ---------- サイト設定 ---------- */

  function applySiteSettings() {
    const site = state.site;
    const name = site.site_name || "KAKIKOMI";

    document.title = name;

    const logo = $("#site-logo");
    if (logo) logo.textContent = name;

    const footerBrand = $(".footer-brand");
    if (footerBrand) footerBrand.textContent = name;

    const meta = $('meta[name="description"]');
    if (meta && site.site_description) meta.setAttribute("content", site.site_description);

    const maintenanceTitle = document.getElementById("maintenance-title");
    if (maintenanceTitle) {
      maintenanceTitle.textContent = site.maintenance_title || "メンテナンス中";
    }

    const maintenanceMessage = document.getElementById("maintenance-message");
    if (maintenanceMessage) {
      const message = site.maintenance_message || "";
      maintenanceMessage.textContent = message;
      maintenanceMessage.hidden = !message;
    }
  }

  async function loadSiteSettings() {
    const { data, error } = await supabase.rpc("get_public_site_settings");

    if (error) {
      console.warn("get_public_site_settings:", error);
      return;
    }

    if (data) {
      state.site = { ...state.site, ...data };
      applySiteSettings();
    }
  }

  function fillSiteSettingsForm() {
    const site = state.site;
    const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };

    set("site-name", el => { el.value = site.site_name || ""; });
    set("site-description", el => { el.value = site.site_description || ""; });
    set("site-registration-enabled", el => { el.checked = site.registration_enabled !== false; });
    set("site-posting-enabled", el => { el.checked = site.posting_enabled !== false; });
    set("site-maintenance-mode", el => { el.checked = Boolean(site.maintenance_mode); });
    set("maintenance-title-input", el => { el.value = site.maintenance_title || "メンテナンス中"; });
    set("maintenance-message-input", el => { el.value = site.maintenance_message || ""; });
  }

  async function saveSiteSettings() {
    if (!(await ensureAdmin())) return;

    const payload = {
      id: 1,
      site_name: $("#site-name")?.value.trim() || "KAKIKOMI",
      site_description: $("#site-description")?.value.trim() || "",
      registration_enabled: $("#site-registration-enabled")?.checked ?? true,
      posting_enabled: $("#site-posting-enabled")?.checked ?? true,
      maintenance_mode: $("#site-maintenance-mode")?.checked ?? false,
      maintenance_title: $("#maintenance-title-input")?.value.trim() || "メンテナンス中",
      maintenance_message: $("#maintenance-message-input")?.value.trim() || "",
      updated_at: new Date().toISOString()
    };

    if (
      payload.maintenance_mode &&
      !state.site.maintenance_mode &&
      !confirm("メンテナンスモードをONにすると、管理者以外は書き込みできなくなります。よろしいですか？")
    ) {
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("site_settings")
        .upsert(payload)
        .select()
        .maybeSingle();

      if (error) throw error;

      state.site = { ...state.site, ...(data || payload) };
      applySiteSettings();

      toast("サイト設定を保存しました。", "success");
    } catch (error) {
      console.error(error);
      toast("サイト設定を保存できませんでした。", "error");
    } finally {
      setLoading(false);
    }
  }

  async function sharePost() {
    const url = `${location.origin}${location.pathname}#board`;

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        toast("リンクをコピーしました。", "success");
        return;
      } catch {
        // fallback
      }
    }

    prompt("このリンクをコピーしてください。", url);
  }

  /* =========================================================
     SEARCH
     ========================================================= */

  async function searchPosts(rawKeyword) {
    const result = $("#search-results");
    if (!result) return;

    // .or() のフィルタ文字列を壊す文字（, ( ) % * \）を空白に置き換える
    const keyword = (rawKeyword || "").replace(/[%,()*\\]/g, " ").trim();

    if (!keyword) {
      result.innerHTML = `<div class="empty-state"><p>検索キーワードを入力してください。</p></div>`;
      return;
    }

    result.innerHTML = `<div class="empty-state"><p>検索中...</p></div>`;

    const { data, error } = await fetchPosts(q =>
      q.or(`title.ilike.%${keyword}%,content.ilike.%${keyword}%`).limit(LIST_LIMIT)
    );

    if (error) {
      result.innerHTML = `<div class="empty-state"><p>検索に失敗しました。</p></div>`;
      return;
    }

    if (!data.length) {
      result.innerHTML = `<div class="empty-state"><p>該当する投稿はありません。</p></div>`;
      return;
    }

    result.innerHTML = data.map(post => `
      <article class="search-result-item">
        <span>${escapeHTML(categoryName(post.category))}</span>
        <h2>${escapeHTML(post.title)}</h2>
        <p>${escapeHTML(post.content)}</p>
        <small>
          ${escapeHTML(post.profiles?.username || "ユーザー")}
          ・ ${escapeHTML(formatDate(post.created_at))}
        </small>
      </article>
    `).join("");
  }

  /* =========================================================
     REPORT
     ========================================================= */

  function openReportModal(postId) {
    if (!state.user) {
      toast("通報するにはログインしてください。", "error");
      navigate("#login");
      return;
    }
    $("#modal-report-form")?.reset();
    const input = $("#modal-report-post-id");
    if (input) input.value = postId;
    openModal("report-dialog");
  }

  async function submitReport(postId, reason, detail) {
    if (!state.user) {
      toast("通報するにはログインしてください。", "error");
      navigate("#login");
      return false;
    }

    if (!postId || !reason) {
      toast("通報する投稿と理由を選んでください。", "error");
      return false;
    }

    const base = {
      reporter_id: state.user.id,
      post_id: postId,
      reason,
      status: "pending"
    };

    let { error } = await supabase.from("reports").insert({ ...base, detail: detail || "" });

    // reports に detail 列が無い場合は詳細なしで再試行
    if (error && (error.code === "PGRST204" || /detail/i.test(error.message || ""))) {
      ({ error } = await supabase.from("reports").insert(base));
    }

    if (error) {
      console.error(error);
      toast(
        error.code === "23505"
          ? "すでにこの投稿を通報しています。"
          : writeErrorMessage(error, "通報できませんでした。"),
        "error"
      );
      return false;
    }

    toast("通報を送信しました。", "success");
    return true;
  }

  // 通報ページ：掲示板を選ぶと、その掲示板の投稿が選べる
  async function onReportBoardChange() {
    const category = $("#report-board-select")?.value;
    const select = $("#report-post-select");
    if (!select) return;

    select.innerHTML = `<option value="">投稿を選択してください</option>`;
    $("#report-post-preview")?.setAttribute("hidden", "");
    const idInput = $("#report-post-id");
    if (idInput) idInput.value = "";

    if (!category) return;

    const { data } = await fetchPosts(q => q.eq("category", category).limit(50));
    select.insertAdjacentHTML("beforeend", data.map(post =>
      `<option value="${escapeHTML(post.id)}">${escapeHTML(post.title)}</option>`
    ).join(""));

    state.reportCandidates = data;
  }

  function onReportPostChange() {
    const id = $("#report-post-select")?.value;
    const post = (state.reportCandidates || []).find(p => String(p.id) === String(id));
    const idInput = $("#report-post-id");
    if (idInput) idInput.value = id || "";

    const preview = $("#report-post-preview");
    if (!preview) return;

    if (post) {
      setText("report-post-preview-text", `${post.title}\n${post.content}`);
      preview.hidden = false;
    } else {
      preview.hidden = true;
    }
  }

  /* =========================================================
     ADMIN
     ========================================================= */

  async function ensureAdmin() {
    if (!state.user) {
      toast("管理者権限が必要です。ログインしてください。", "error");
      navigate("#login");
      return false;
    }

    // 管理画面へ入る瞬間にDBで再確認する。
    try {
      const { data, error } = await supabase.rpc("is_admin");
      if (!error) {
        state.adminVerified = data === true;
      }
    } catch (error) {
      console.warn("admin verification:", error);
    }

    // 管理者判定はDBの is_admin() の結果だけを信頼する。
    // profiles.role/status をフロント側の権限判定には使わない。
    if (state.adminVerified === true) {
      updateAuthUI();
      return true;
    }

    // 判定がまだ無い場合はプロフィール情報ではなくDBへ再確認する。
    try {
      const { data, error } = await supabase.rpc("is_admin");
      if (!error) {
        state.adminVerified = data === true;
      } else {
        console.warn("is_admin:", error);
      }
    } catch (error) {
      console.warn("is_admin:", error);
    }

    if (state.adminVerified !== true) {
      console.warn("ensureAdmin failed: DB is_admin() returned false or errored");
      toast("管理者権限が必要です。", "error");
      navigate("#home");
      return false;
    }

    updateAuthUI();
    return true;
  }

  async function loadAdminData() {
    if (!(await ensureAdmin())) return;

    const head = table => supabase.from(table).select("id", { count: "exact", head: true });

    const [
      usersResult, postsResult, reportsResult, ipBansResult,
      userCount, postCount, pendingReportCount
    ] = await Promise.all([
      // 全列を返す RPC（管理者のみ実行可）
      supabase.rpc("admin_list_profiles", { limit_count: ADMIN_LIST_LIMIT }),
      supabase.from("posts")
        .select("id, user_id, category, title, content, created_at")
        .order("created_at", { ascending: false }).limit(ADMIN_LIST_LIMIT),
      supabase.from("reports")
        .select("id, post_id, reporter_id, reason, detail, status, created_at")
        .order("created_at", { ascending: false }).limit(ADMIN_LIST_LIMIT),
      supabase.from("ip_bans")
        .select("id, ip, reason, duration, created_at, expires_at")
        .order("created_at", { ascending: false }).limit(ADMIN_LIST_LIMIT),
      head("profiles"),
      head("posts"),
      head("reports").eq("status", "pending")
    ]);

    state.adminCounts = {
      users: userCount.count ?? (usersResult.data || []).length,
      posts: postCount.count ?? (postsResult.data || []).length,
      pendingReports: pendingReportCount.count ?? 0
    };

    if (usersResult.error) console.error("Users:", usersResult.error);
    if (postsResult.error) console.error("Posts:", postsResult.error);
    if (reportsResult.error) console.error("Reports:", reportsResult.error);
    if (ipBansResult.error) console.error("IP Bans:", ipBansResult.error);

    state.users = usersResult.data || [];
    state.adminPosts = postsResult.data || [];

    {
      const ips = await fetchContentIps("post", state.adminPosts.map(post => post.id));
      state.adminPosts.forEach(post => { post.adminIp = ips.get(post.id); });
    }
    state.reports = reportsResult.data || [];
    state.ipBans = ipBansResult.data || [];

    renderAdmin();
  }

  async function loadAdminLogs() {
    if (!(await ensureAdmin())) return;

    const action = $("#admin-log-action-filter")?.value || null;
    const { data, error } = await supabase.rpc("admin_list_audit_logs", {
      limit_count: 200,
      action_filter: action
    });

    if (error) {
      console.error("Audit logs:", error);
      const body = $("#admin-logs-table-body");
      if (body) body.innerHTML = `<tr><td colspan="6">ログを読み込めませんでした。</td></tr>`;
      return;
    }

    state.auditLogs = data || [];
    renderAdminLogs();
  }

  function auditActionName(log) {
    if (log.action === "LOGIN_IP") return "ログインIP";
    if (log.action === "INSERT") return "作成";
    if (log.action === "UPDATE") return "変更";
    if (log.action === "DELETE") return "削除";
    return log.action || "記録";
  }

  function auditTargetName(log) {
    const names = {
      profiles: "アカウント",
      posts: "投稿",
      replies: "返信",
      likes: "いいね",
      reports: "通報",
      ip_bans: "IP制限",
      bots: "Bot",
      private_boards: "掲示板",
      site_settings: "サイト設定",
      content_ips: "投稿/返信IP",
      user_ips: "ログインIP"
    };
    return names[log.table_name] || log.table_name || "-";
  }

  function renderAdminLogs() {
    const body = $("#admin-logs-table-body");
    if (!body) return;

    if (!state.auditLogs.length) {
      body.innerHTML = `<tr><td colspan="6">ログはありません。</td></tr>`;
      return;
    }

    body.innerHTML = state.auditLogs.map(log => {
      const detail = log.details && typeof log.details === "object"
        ? Object.entries(log.details)
            .filter(([key, value]) => value !== null && value !== undefined && value !== "")
            .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
            .join(" / ")
        : "";

      return `
        <tr>
          <td>${escapeHTML(formatDate(log.created_at))}</td>
          <td>${escapeHTML(auditActionName(log))}</td>
          <td>${escapeHTML(auditTargetName(log))}<br><small>${escapeHTML(log.record_id || "-")}</small></td>
          <td>${escapeHTML(log.target_user_id || log.actor_user_id || "-")}</td>
          <td>${escapeHTML(log.ip_address || "-")}</td>
          <td>${escapeHTML(detail || "-")}</td>
        </tr>
      `;
    }).join("");
  }

  function renderAdmin() {
    const counts = state.adminCounts || {};
    setText("admin-user-count", counts.users ?? state.users.length);
    setText("admin-post-count", counts.posts ?? state.adminPosts.length);
    setText(
      "admin-report-count",
      counts.pendingReports ?? state.reports.filter(r => r.status === "pending").length
    );
    setText("admin-ban-count", state.ipBans.filter(isBanActive).length);

    renderAdminUsers();
    renderAdminPosts();
    renderAdminReports();
    renderIPBans();
  }

  function isBanActive(ban) {
    return !ban.expires_at || new Date(ban.expires_at) > new Date();
  }

  function renderAdminUsers(users = state.users) {
    const body = $("#admin-users-table-body");
    if (!body) return;

    if (!users.length) {
      body.innerHTML = `<tr><td colspan="5">ユーザーが見つかりません。</td></tr>`;
      return;
    }

    body.innerHTML = users.map(user => `
      <tr>
        <td>${escapeHTML(user.username || "ユーザー")}</td>
        <td>${escapeHTML(user.id)}</td>
        <td>${escapeHTML(user.status || "active")}</td>
        <td>${escapeHTML(formatDate(user.created_at))}</td>
        <td>
          <button type="button" class="secondary-button"
            data-admin-user="${escapeHTML(user.id)}">編集</button>
        </td>
      </tr>
    `).join("");
  }

  function renderAdminPosts() {
    const list = $("#admin-post-list");
    if (!list) return;

    if (!state.adminPosts.length) {
      list.innerHTML = `<div class="empty-state"><p>投稿はありません。</p></div>`;
      return;
    }

    list.innerHTML = state.adminPosts.map(post => `
      <article class="admin-post-item">
        <div>
          <h3>${escapeHTML(post.title)}</h3>
          <p>${escapeHTML(post.content)}</p>
          <small>${escapeHTML(formatDate(post.created_at))}
            ・ IP: ${escapeHTML(post.adminIp || "記録なし")}</small>
        </div>
        <button type="button" class="danger-button"
          data-admin-delete-post="${escapeHTML(post.id)}">削除</button>
      </article>
    `).join("");
  }

  function renderAdminReports() {
    const list = $("#admin-report-list");
    if (!list) return;

    if (!state.reports.length) {
      list.innerHTML = `<div class="empty-state"><p>通報はありません。</p></div>`;
      return;
    }

    list.innerHTML = state.reports.map(report => `
      <article class="admin-report-item">
        <div>
          <strong>${escapeHTML(report.reason || "理由なし")}</strong>
          <p>${escapeHTML(report.detail || "")}</p>
          <small>
            ${escapeHTML(report.status || "pending")}
            ・ ${escapeHTML(formatDate(report.created_at))}
            ・ 投稿ID: ${escapeHTML(report.post_id ?? "")}
          </small>
        </div>
        ${report.status === "pending" ? `
          <button type="button" class="secondary-button"
            data-resolve-report="${escapeHTML(report.id)}">対応済みにする</button>` : ""}
      </article>
    `).join("");
  }

  async function resolveReport(id) {
    if (!(await ensureAdmin())) return;

    const { error } = await supabase
      .from("reports")
      .update({ status: "resolved" })
      .eq("id", id);

    if (error) {
      console.error(error);
      toast("通報の状態を更新できませんでした。", "error");
      return;
    }

    toast("対応済みにしました。", "success");
    await loadAdminData();
  }

  async function adminDeletePost(postId) {
    if (!(await ensureAdmin())) return;
    if (!confirm("この投稿を管理者権限で削除しますか？")) return;

    const { error } = await supabase.from("posts").delete().eq("id", postId);

    if (error) {
      console.error(error);
      toast("投稿を削除できませんでした。", "error");
      return;
    }

    toast("投稿を削除しました。", "success");
    await loadAdminData();
  }

  function openAdminUserDetail(userId) {
    const user = state.users.find(item => item.id === userId);
    if (!user) return;

    const idInput = $("#admin-target-user-id");
    const status = $("#admin-target-status");
    const disablePosting = $("#admin-disable-posting");
    const disableReplies = $("#admin-disable-replies");
    const forcePasswordChange = $("#admin-force-password-change");

    if (idInput) idInput.value = user.id;
    if (status) {
      status.value = user.status || "active";
      status.disabled = true;
    }
    if (disablePosting) disablePosting.checked = Boolean(user.disable_posting);
    if (disableReplies) disableReplies.checked = Boolean(user.disable_replies);
    if (forcePasswordChange) forcePasswordChange.checked = Boolean(user.force_password_change);
    setText("admin-target-username", user.username || "ユーザー");

    renderAdminUserIps(user.id);

    navigate("#admin-user-detail");
  }

  async function saveAdminUser() {
    if (!(await ensureAdmin())) return;

    const userId = $("#admin-target-user-id")?.value;
    if (!userId) {
      toast("ユーザーが選択されていません。", "error");
      return;
    }

    const disablePosting = Boolean($("#admin-disable-posting")?.checked);
    const disableReplies = Boolean($("#admin-disable-replies")?.checked);
    const forcePasswordChange = Boolean($("#admin-force-password-change")?.checked);

    const { error } = await supabase.rpc("admin_update_user_restrictions", {
      target_user: userId,
      p_disable_posting: disablePosting,
      p_disable_replies: disableReplies,
      p_force_password_change: forcePasswordChange
    });

    if (error) {
      console.error("admin_update_user_restrictions:", error);
      toast("ユーザー設定を更新できませんでした。", "error");
      return;
    }

    toast("ユーザー設定を更新しました。", "success");
    await loadAdminData();
    navigate("#admin-users");
  }


  async function addIPBan() {
    if (!(await ensureAdmin())) return;
    toast("IP BANの追加・変更はSupabase管理者のみ実行できます。", "error");
  }

  function renderIPBans() {
    const body = $("#ip-ban-table-body");
    if (!body) return;

    if (!state.ipBans.length) {
      body.innerHTML = `
        <tr><td colspan="4">BANされているIPはありません。</td></tr>
      `;
      return;
    }

    body.innerHTML = state.ipBans.map(ban => {
      let period;
      if (!ban.expires_at) {
        period = "無期限";
      } else if (!isBanActive(ban)) {
        period = "期限切れ";
      } else {
        period = `～ ${formatDate(ban.expires_at)}`;
      }

      return `
        <tr>
          <td>${escapeHTML(ban.ip)}</td>
          <td>${escapeHTML(ban.reason || "")}</td>
          <td>${escapeHTML(period)}</td>
          <td>
            <button type="button" class="danger-button"
              data-delete-ip-ban="${escapeHTML(ban.id)}">解除</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function removeIPBan(id) {
    if (!(await ensureAdmin())) return;
    toast("IP BANの解除はSupabase管理者のみ実行できます。", "error");
  }

  async function loadPrivateBoards() {
    if (!state.user || state.profile?.status !== "active") return;
    const { data, error } = await supabase.from("private_boards").select("id,name,description,owner_id,member_count,created_at").order("created_at",{ascending:false});
    const list=$("#private-board-list"); if(!list)return;
    if(error){list.innerHTML='<div class="empty-state"><p>限定掲示板を読み込めませんでした。</p></div>';return;}
    list.innerHTML=(data||[]).map(b=>'<article class="home-card"><h2>'+escapeHTML(b.name)+'</h2><p>'+escapeHTML(b.description||"")+'</p><small>メンバー '+Number(b.member_count||0)+'人</small><button type="button" class="primary-button" data-open-private-board="'+escapeHTML(b.id)+'">開く</button></article>').join("")||'<div class="empty-state"><p>参加中の掲示板はありません。</p></div>';
  }

  async function joinPrivateBoard(event) {
    event.preventDefault();
    if(!state.user||state.profile?.status!=="active"){toast("ログインしてください。","error");return;}
    const code=$("#private-board-code")?.value.trim(); if(!code)return;
    const {data,error}=await supabase.schema("private_board").rpc("join",{p_code:code});
    if(error){console.error(error);toast("招待コードが正しくないか、参加できません。","error");return;}
    event.target.reset(); toast("掲示板に参加しました。","success"); location.hash="#private-board-"+data;
  }

  async function createPrivateBoard() {
    if(!state.user||state.profile?.status!=="active"){toast("ログインしてください。","error");return;}
    const name=prompt("掲示板名を入力してください。"); if(!name?.trim())return;
    const description=prompt("掲示板の説明を入力してください。")||"";
    const {data,error}=await supabase.schema("private_board").rpc("create_board",{p_name:name.trim(),p_description:description.trim()});
    if(error){console.error("private board create error:",error);toast(error.message||"掲示板を作成できませんでした。","error");return;}
    toast("限定掲示板を作成しました。","success"); location.hash="#private-board-"+data;
  }

  function getPrivateBoardIdFromHash() {
    const hash=location.hash.replace(/^#private-board-/,""); return hash!==location.hash?hash:null;
  }

  async function loadPrivateBoardDetail() {
    const boardId=getPrivateBoardIdFromHash();
    if(!boardId||!state.user||state.profile?.status!=="active"){navigate("#private-boards");return;}
    const {data:board,error}=await supabase.from("private_boards").select("id,name,description,owner_id,member_count").eq("id",boardId).maybeSingle();
    if(error||!board){toast("掲示板が見つからないか、アクセス権がありません。","error");navigate("#private-boards");return;}
    const {data:member}=await supabase.from("private_board_members").select("member_role,status,can_post,can_reply").eq("board_id",boardId).eq("user_id",state.user.id).maybeSingle();
    if(!member||member.status!=="active"){toast("この掲示板へのアクセス権がありません。","error");navigate("#private-boards");return;}
    setText("private-board-title",board.name); setText("private-board-description",board.description||""); setText("private-board-member-count","メンバー "+Number(board.member_count||0)+"人");
    const owner=board.owner_id===state.user.id||state.profile?.role==="admin";
    $("#private-board-owner-tools").hidden=!owner; $("#private-board-post-form-wrap").hidden=!member.can_post||Boolean(state.profile.disable_posting);
    if(owner){$("#private-board-name-input").value=board.name;$("#private-board-description-input").value=board.description||"";const {data:code,error:codeError}=await supabase.schema("private_board").rpc("get_invite_code",{p_board_id:boardId}); if(codeError){console.error(codeError);}if(code)$("#private-board-invite-code").value=code;loadPrivateBoardMembers(boardId);}
    loadPrivateBoardPosts(boardId,member.can_reply&&!state.profile.disable_replies);
  }

  async function loadPrivateBoardPosts(boardId,canReply) {
    const {data,error}=await supabase.from("private_board_posts").select("id,title,content,user_id,allow_replies,created_at,profiles:user_id(username)").eq("board_id",boardId).order("created_at",{ascending:false});
    const list=$("#private-board-post-list");if(!list)return;if(error){list.innerHTML='<div class="empty-state"><p>投稿を読み込めませんでした。</p></div>';return;}
    list.innerHTML=(data||[]).map(p=>'<article class="home-card"><h2>'+escapeHTML(p.title)+'</h2><p>'+escapeHTML(p.content)+'</p><small>'+escapeHTML(p.profiles?.username||"ユーザー")+' ・ '+escapeHTML(formatDate(p.created_at))+'</small><div data-private-replies="'+escapeHTML(p.id)+'"></div>'+(canReply&&p.allow_replies?'<form class="settings-form" data-private-reply-form="'+escapeHTML(p.id)+'"><textarea maxlength="3000" required placeholder="返信"></textarea><button type="submit" class="secondary-button">返信</button></form>':"")+'</article>').join("")||'<div class="empty-state"><p>投稿はありません。</p></div>';
    for(const p of (data||[])){
      const box=document.querySelector('[data-private-replies="'+CSS.escape(p.id)+'"]');
      if(!box)continue;
      const {data:replies}=await supabase.from("private_board_replies").select("content,created_at,profiles:user_id(username)").eq("post_id",p.id).order("created_at",{ascending:true});
      box.innerHTML=(replies||[]).map(x=>'<div class="account-panel"><strong>'+escapeHTML(x.profiles?.username||"ユーザー")+'</strong><p>'+escapeHTML(x.content)+'</p></div>').join("");
    }
  }

  async function submitPrivateBoardReply(postId, form) {
    const boardId=getPrivateBoardIdFromHash(); const content=form.querySelector("textarea")?.value.trim();
    if(!boardId||!content)return;
    const {error}=await supabase.from("private_board_replies").insert({post_id:postId,user_id:state.user.id,content});
    if(error){console.error(error);toast("返信できませんでした。","error");return;}
    form.reset();toast("返信しました。","success");loadPrivateBoardDetail();
  }

  async function createPrivateBoardPost(event) {
    event.preventDefault(); const boardId=getPrivateBoardIdFromHash();if(!boardId)return;
    const title=$("#private-board-post-title")?.value.trim(),content=$("#private-board-post-content")?.value.trim();if(!title||!content)return;
    const {error}=await supabase.from("private_board_posts").insert({board_id:boardId,user_id:state.user.id,title,content});
    if(error){console.error(error);toast("投稿できませんでした。","error");return;} event.target.reset();toast("投稿しました。","success");loadPrivateBoardDetail();
  }

  async function loadPrivateBoardMembers(boardId) {
    const {data,error}=await supabase.from("private_board_members").select("user_id,member_role,status,can_post,can_reply,profiles:user_id(username)").eq("board_id",boardId).order("joined_at",{ascending:true});
    const list=$("#private-board-member-list");if(!list)return;if(error){list.innerHTML="<p>メンバーを読み込めませんでした。</p>";return;}
    list.innerHTML=(data||[]).map(m=>'<div class="account-panel" data-member-id="'+escapeHTML(m.user_id)+'"><strong>'+escapeHTML(m.profiles?.username||"ユーザー")+'</strong><p>'+escapeHTML(m.member_role)+" / "+escapeHTML(m.status)+'</p>'+(m.member_role!=="owner" ? '<label><input type="checkbox" data-member-post '+(m.can_post?"checked":"")+'> 投稿を許可</label><label><input type="checkbox" data-member-reply '+(m.can_reply?"checked":"")+'> 返信を許可</label><button type="button" class="secondary-button" data-save-member="'+escapeHTML(m.user_id)+'">保存</button><button type="button" class="danger-button" data-block-member="'+escapeHTML(m.user_id)+'">'+(m.status==="blocked"?"制限解除":"メンバーを制限")+'</button><button type="button" class="danger-button" data-remove-member="'+escapeHTML(m.user_id)+'">メンバーから削除</button>' : '')+'</div>').join("");
  }

  async function savePrivateBoardMember(userId) {
    const boardId=getPrivateBoardIdFromHash(); const row=document.querySelector('[data-member-id="'+CSS.escape(userId)+'"]'); if(!boardId||!row)return;
    const {error}=await supabase.schema("private_board").rpc("manage_member",{p_board_id:boardId,p_user_id:userId,p_status:"active",p_can_post:Boolean(row.querySelector("[data-member-post]")?.checked),p_can_reply:Boolean(row.querySelector("[data-member-reply]")?.checked)});
    if(error){console.error(error);toast("メンバー設定を変更できませんでした。","error");return;} toast("メンバー設定を保存しました。","success");loadPrivateBoardMembers(boardId);
  }

  async function togglePrivateBoardMemberBlock(userId) {
    const boardId=getPrivateBoardIdFromHash(); const row=document.querySelector('[data-member-id="'+CSS.escape(userId)+'"]'); if(!boardId||!row)return;
    const blocked=row.querySelector("p")?.textContent.includes("blocked");
    const {error}=await supabase.schema("private_board").rpc("manage_member",{p_board_id:boardId,p_user_id:userId,p_status:blocked?"active":"blocked",p_can_post:Boolean(row.querySelector("[data-member-post]")?.checked),p_can_reply:Boolean(row.querySelector("[data-member-reply]")?.checked)});
    if(error){console.error(error);toast("メンバーの制限を変更できませんでした。","error");return;} toast(blocked?"メンバーの制限を解除しました。":"メンバーを制限しました。","success");loadPrivateBoardMembers(boardId);
  }

  async function removePrivateBoardMember(userId) {
    const boardId=getPrivateBoardIdFromHash();if(!boardId)return;
    if(!confirm("このメンバーを掲示板から削除しますか？"))return;
    const {error}=await supabase.schema("private_board").rpc("remove_member",{p_board_id:boardId,p_user_id:userId});
    if(error){console.error(error);toast("メンバーを削除できませんでした。","error");return;} toast("メンバーを削除しました。","success");loadPrivateBoardMembers(boardId);loadPrivateBoardDetail();
  }

  async function savePrivateBoardSettings(event) {
    event.preventDefault();const boardId=getPrivateBoardIdFromHash();if(!boardId)return;
    const {error}=await supabase.from("private_boards").update({name:$("#private-board-name-input").value.trim(),description:$("#private-board-description-input").value.trim()}).eq("id",boardId);
    if(error){console.error(error);toast("設定を保存できませんでした。","error");return;}toast("設定を保存しました。","success");loadPrivateBoardDetail();
  }

  async function copyPrivateBoardCode() {
    const code=$("#private-board-invite-code")?.value;if(!code)return;
    try{await navigator.clipboard.writeText(code);toast("招待コードをコピーしました。","success");}catch{toast("コピーできませんでした。","error");}
  }

  /* =========================================================
     PASSWORD / DELETE ACCOUNT
     ========================================================= */

  async function changePassword() {
    if (!state.user) {
      toast("ログインしてください。", "error");
      return;
    }

    const currentPassword = $("#current-password")?.value;
    const newPassword = $("#new-password")?.value;
    const confirmPassword = $("#new-password-confirm")?.value;

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast("必要な項目を入力してください。", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast("新しいパスワードが一致しません。", "error");
      return;
    }

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: state.user.email,
      password: currentPassword
    });

    if (loginError) {
      toast("現在のパスワードが正しくありません。", "error");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      console.error(error);
      toast("パスワードを変更できませんでした。", "error");
      return;
    }

    toast("パスワードを変更しました。", "success");
    $("#change-password-form")?.reset();
  }

  async function deleteAccount() {
    if (!state.user) return;

    const password = $("#delete-account-password")?.value;
    if (!password) {
      toast("パスワードを入力してください。", "error");
      return;
    }

    setLoading(true);

    try {
      // パスワードを再確認
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: state.user.email,
        password
      });
      if (authError) {
        toast("パスワードが正しくありません。", "error");
        return;
      }

      const userId = state.user.id;

      // ※テーブルのデータを消すだけ。auth.users のユーザー本体はクライアントからは消せない。
      await supabase.from("likes").delete().eq("user_id", userId);
      await supabase.from("replies").delete().eq("user_id", userId);
      await supabase.from("posts").delete().eq("user_id", userId);
      await supabase.from("profiles").delete().eq("id", userId);

      await supabase.auth.signOut();

      state.user = null;
      state.profile = null;
      updateAuthUI();

      $("#delete-account-form")?.reset();
      closeModal("delete-account-dialog");

      toast("アカウントを削除しました。", "success");
      navigate("#home");
    } catch (error) {
      console.error(error);
      toast("アカウント削除に失敗しました。", "error");
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     UI
     ========================================================= */

  function updateAuthUI() {
    const loggedIn = Boolean(state.user);

    $$('[data-auth="logged-in"]').forEach(el => { el.hidden = !loggedIn; });
    $$('[data-auth="guest"]').forEach(el => { el.hidden = loggedIn; });

    // 管理者にだけメニューに「管理」を出す（見た目だけ。権限はRLSで守る）
    const nav = $("#main-navigation");
    let link = $("#admin-nav-link");
    if (isAdminUser()) {
      if (!link && nav) {
        link = document.createElement("a");
        link.id = "admin-nav-link";
        link.href = "#admin";
        link.textContent = "管理";
        nav.appendChild(link);
      }
    } else if (link) {
      link.remove();
    }

    renderAccount();
  }

  function updateCharacterCount() {
    const textarea = $("#post-content");
    if (!textarea) return;
    setText("post-character-count", `${textarea.value.length} / ${textarea.maxLength}`);
  }

  function updateImagePreview() {
    const preview = $("#image-preview");
    const url = $("#post-image")?.value.trim();
    if (!preview) return;

    if (url && isSafeUrl(url)) {
      preview.innerHTML = `<img src="${escapeHTML(url)}" alt="画像プレビュー">`;
      preview.hidden = false;
    } else {
      preview.innerHTML = "";
      preview.hidden = true;
    }
  }

  /* =========================================================
     FORM EVENTS
     ========================================================= */

  function on(selector, eventName, handler) {
    $(selector)?.addEventListener(eventName, handler);
  }

  function onSubmit(selector, handler) {
    on(selector, "submit", event => {
      event.preventDefault();
      handler(event);
    });
  }

  function setupForms() {
    onSubmit("#login-form", () => {
      login($("#login-email")?.value.trim(), $("#login-password")?.value);
    });

    onSubmit("#decoy-admin-login-form", async () => {
      const { error } = await supabase.rpc("record_decoy_admin_attempt");
      if (error) console.error("decoy admin attempt:", error);
      toast("ログインできませんでした。", "error");
      location.hash = "#login";
    });

    onSubmit("#register-form", () => {
      const username = $("#register-username")?.value.trim();
      const email = $("#register-email")?.value.trim();
      const password = $("#register-password")?.value;
      const confirmPassword = $("#register-password-confirm")?.value;

      if (password !== confirmPassword) {
        toast("パスワードが一致しません。", "error");
        return;
      }

      register(username, email, password);
    });

    onSubmit("#forgot-password-form", () => {
      sendPasswordReset($("#forgot-password-email")?.value.trim());
    });

    onSubmit("#post-form", createPost);
    onSubmit("#search-form", () => searchPosts($("#search-input")?.value));

    onSubmit("#change-password-form", changePassword);
    onSubmit("#profile-settings-form", updateProfile);
    onSubmit("#delete-account-form", deleteAccount);

    // 通報（ページ版・モーダル版）
    onSubmit("#report-form", async () => {
      const ok = await submitReport(
        $("#report-post-id")?.value,
        $("#report-reason")?.value,
        $("#report-detail")?.value.trim()
      );
      if (ok) {
        $("#report-form")?.reset();
        $("#report-post-preview")?.setAttribute("hidden", "");
      }
    });

    onSubmit("#modal-report-form", async () => {
      const ok = await submitReport(
        $("#modal-report-post-id")?.value,
        $("#modal-report-reason")?.value,
        $("#modal-report-detail")?.value.trim()
      );
      if (ok) closeModal("report-dialog");
    });

    onSubmit("#delete-post-form", async () => {
      const id = $("#delete-post-id")?.value;
      closeModal("delete-post-dialog");
      await deletePost(id);
    });

    on("#report-board-select", "change", onReportBoardChange);
    on("#report-post-select", "change", onReportPostChange);

    // 管理画面
    onSubmit("#ip-ban-form", addIPBan);
    onSubmit("#admin-user-settings-form", saveAdminUser);
    onSubmit("#admin-user-search-form", () => searchAdminUsers($("#admin-user-search")?.value));
    on("#admin-log-action-filter", "change", loadAdminLogs);
    on("#admin-log-refresh", "click", loadAdminLogs);

    // まだ中身のない機能
    onSubmit("#join-private-board-form", joinPrivateBoard);
    onSubmit("#private-board-post-form", createPrivateBoardPost);
    onSubmit("#private-board-settings-form", savePrivateBoardSettings);
    onSubmit("#admin-site-settings-form", saveSiteSettings);
    onSubmit("#create-bot-form", () => comingSoon("Botの作成"));

    // 返信フォーム（投稿カードの中にあとから作られるので、documentで受ける）
    document.addEventListener("submit", event => {
      const form = event.target.closest?.("form[data-reply-form]");
      if (form) {
        event.preventDefault();
        submitReply(form.dataset.replyForm, form);
        return;
      }
      const privateForm = event.target.closest?.("form[data-private-reply-form]");
      if (privateForm) {
        event.preventDefault();
        submitPrivateBoardReply(privateForm.dataset.privateReplyForm, privateForm);
      }
    });

    // 入力補助
    on("#post-content", "input", updateCharacterCount);
    on("#post-image", "input", updateImagePreview);
  }

  /* =========================================================
     CLICK EVENTS
     ========================================================= */

  function setupClicks() {
    document.addEventListener("click", event => {
      const target = event.target;
      const closest = selector => target.closest(selector);

      // モーダルを閉じる（×ボタン・キャンセル・背景）
      const closer = closest("[data-close-modal]");
      if (closer) {
        closeModal(closer.dataset.closeModal);
        return;
      }

      const actionTarget = closest("[data-action]");
      if (actionTarget) {
        const action = actionTarget.dataset.action;
        if (action === "logout") logout();
        if (action === "login") navigate("#login");
        if (action === "Create_account") navigate("#Create_account");
      }

      if (closest("#logout-button") && !actionTarget) logout();
      if (closest("#delete-account-button")) openModal("delete-account-dialog");
      if (closest("#create-bot-button") || closest("#admin-create-bot")) openModal("create-bot-dialog");
      if (closest("#create-private-board-button")) createPrivateBoard();
      if (closest("#private-board-back")) navigate("#private-boards");
      if (closest("#private-board-copy-code")) copyPrivateBoardCode();
      const saveMember=closest("[data-save-member]");
      if(saveMember) savePrivateBoardMember(saveMember.dataset.saveMember);
      const blockMember=closest("[data-block-member]");
      if(blockMember) togglePrivateBoardMemberBlock(blockMember.dataset.blockMember);
      const removeMember=closest("[data-remove-member]");
      if(removeMember) removePrivateBoardMember(removeMember.dataset.removeMember);
      const openPrivate = closest("[data-open-private-board]");
      if (openPrivate) location.hash = `#private-board-${openPrivate.dataset.openPrivateBoard}`;
      if (closest("#mark-notifications-read")) comingSoon("既読機能");
      if (closest("#admin-force-logout")) forceLogoutUser();
      if (closest("#admin-force-delete")) forceDeleteUser();

      if (closest("#copy-share-url") || closest('[data-share="copy"]')) sharePost();
      if (closest('[data-share="native"]')) {
        if (navigator.share) {
          navigator.share({ url: `${location.origin}${location.pathname}#board` }).catch(() => {});
        } else {
          sharePost();
        }
      }

      // ホームのカテゴリカード → 掲示板をそのカテゴリで開く
      const categoryCard = closest("[data-category]");
      if (categoryCard) {
        state.currentCategory = categoryCard.dataset.category;
        const filter = $("#board-category-filter");
        if (filter) filter.value = state.currentCategory;
      }

      const like = closest("[data-like-post]");
      if (like) likePost(like.dataset.likePost);

      const toggle = closest("[data-toggle-replies]");
      if (toggle) toggleReplies(toggle.dataset.toggleReplies, toggle);

      const deleteReplyButton = closest("[data-delete-reply]");
      if (deleteReplyButton) {
        deleteReply(
          deleteReplyButton.dataset.deleteReply,
          deleteReplyButton.dataset.replyPostId,
          deleteReplyButton.dataset.replyUserId
        );
      }

      const share = closest("[data-share-post]");
      if (share) sharePost();

      const report = closest("[data-report-post]");
      if (report) openReportModal(report.dataset.reportPost);

      if (closest("#load-more-posts")) loadMorePosts();

      const deleteButton = closest("[data-delete-post]");
      if (deleteButton) openDeletePostModal(deleteButton.dataset.deletePost);

      const adminDelete = closest("[data-admin-delete-post]");
      if (adminDelete) adminDeletePost(adminDelete.dataset.adminDeletePost);

      const adminUser = closest("[data-admin-user]");
      if (adminUser) openAdminUserDetail(adminUser.dataset.adminUser);

      const resolve = closest("[data-resolve-report]");
      if (resolve) resolveReport(resolve.dataset.resolveReport);

      const deleteIPBan = closest("[data-delete-ip-ban]");
      if (deleteIPBan) removeIPBan(deleteIPBan.dataset.deleteIpBan);
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeAllModals();
    });
  }

  /* =========================================================
     BOARD
     ========================================================= */

  function setupBoard() {
    on("#board-category-filter", "change", event => {
      state.currentCategory = event.target.value;
      loadPosts();
    });

    // 並び替えタブ（HTMLにタブを追加したときのために残してある）
    $$(".board-tab").forEach(button => {
      button.addEventListener("click", () => {
        $$(".board-tab").forEach(tab => tab.classList.remove("active"));
        button.classList.add("active");
        state.currentSort = button.dataset.sort || "new";
        renderPosts();
      });
    });
  }

  /* =========================================================
     AUTH STATE
     ========================================================= */

  function setupAuthListener() {
    // コールバック内で直接 await supabase を呼ぶとハングすることがあるので、
    // setTimeout で外に逃がしている。
    supabase.auth.onAuthStateChange((event, session) => {
      const eventUserId = session?.user?.id || null;
      state.user = session?.user || null;

      setTimeout(async () => {
        if ((state.user?.id || null) !== eventUserId) return;

        if (state.user) {
          await loadProfile();

          if ((state.user?.id || null) !== eventUserId) return;

          if (state.profile?.status === "banned") {
            state.accessBlocked = false;
            state.accountBlocked = true;
            const message = document.getElementById("account-blocked-message");
            if (message) message.textContent = state.profile?.ban_reason || "このアカウントではサイトを利用できません。";
          }
        } else {
          state.profile = null;
          state.adminVerified = false;
          state.accessBlocked = false;
        }

        if ((state.user?.id || null) === eventUserId) {
          updateAuthUI();
        }

        if (event === "SIGNED_OUT" && location.hash !== "#login") {
          navigate("#login");
        }
      }, 0);
    });
  }

  /* =========================================================
     INIT
     ========================================================= */

  async function init() {
    setLoading(true);

    try {
      populateCategories();
      setupForms();
      setupClicks();
      setupBoard();
      setupAuthListener();
      updateCharacterCount();

      await loadCurrentUser();
      await loadSiteSettings();
      await checkIpBan();
      startSessionWatch();
      recordLoginIp();

      renderRoute();
    } catch (error) {
      console.error(error);
      toast("ページの初期化に失敗しました。", "error");
    } finally {
      setLoading(false);
    }
  }

  window.addEventListener("hashchange", renderRoute);
  document.addEventListener("DOMContentLoaded", init);
})();
