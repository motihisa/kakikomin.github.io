/* =========================================================
   KAKIKOMI - script.js (修正版)
   BUILD 2026-10-02-J  ← このファイルの先頭にこの行が見えたら最新版
   Supabase + Hash Router
   ========================================================= */

(() => {
  "use strict";

  const SUPABASE_URL = "https://wtlmjaqyphmaeqhipqht.supabase.co";
  const SUPABASE_KEY = "sb_publishable_Mk4N_TF_cynZ53R7nmUyjQ_JeXsZ_Cs";

  // ※ブラウザ側の管理者チェックは見た目の制御だけ。
  //   本当の権限チェックは Supabase の RLS ポリシー / RPC（is_admin()）で行っている。

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  console.info("KAKIKOMI script BUILD 2026-10-02-J");

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
      maintenance_mode: false,
      maintenance_title: "メンテナンス中",
      maintenance_message: ""
    },
    preferences: {
      dark_mode: false
    },
    openReplies: new Set(),  // 返信欄を開いている投稿ID
    adminRetry: false,
    adminVerified: false,
    adminSecondFactorVerified: false,
    adminSecondFactorPromise: null,
    emergencyAuthenticated: false,
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
    "admin-logs": "admin-logs",
    "admin-sessions": "admin-sessions",
    "admin-security": "admin-security",
    "admin-diagnostics": "admin-diagnostics",
    "admin-advanced": "admin-advanced",
    "admin-emergency": "admin-emergency"
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
      case "notifications": loadNotifications(); break;
      case "private-boards": loadPrivateBoards(); break;
      case "private-board": loadPrivateBoardDetail(); break;
      case "bot": showPlaceholder("#bot-list", "Botはまだありません。"); break;
      case "admin-site-settings": loadSiteSettings().then(async () => { fillSiteSettingsForm(); await loadAdminAnnouncements(); }); break;
      case "admin-sessions": loadAdminSessions(); break;
      case "admin-security": loadAdminSecurityLogs(); break;
      case "admin-diagnostics": loadAdminDiagnostics(); break;
      case "admin-advanced": loadAdminAdvanced(); break;
      case "admin-emergency": loadAdminEmergency(); break;
      case "admin-private-boards": loadAdminPrivateBoards(); break;
      case "admin-bots": loadAdminBots(); break;
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

  async function loadAdminEmergency() {
    const statusEl = document.getElementById("emergency-auth-status");
    const previewButton = document.getElementById("emergency-preview");
    const executeButton = document.getElementById("emergency-execute");
    if (!statusEl) return;

    state.emergencyAuthenticated = false;
    if (previewButton) previewButton.disabled = true;
    if (executeButton) executeButton.disabled = true;

    try {
      const { data, error } = await supabase.rpc("emergency_protocol_credentials_configured");
      if (error) throw error;
      statusEl.textContent = data
        ? "専用認証情報は設定済みです。パスワードと確認コードを入力して認証してください。"
        : "専用認証情報が未設定です。";
    } catch (error) {
      console.error("emergency protocol status:", error);
      statusEl.textContent = "認証設定を確認できませんでした。";
    }
  }

  async function authenticateEmergencyProtocol() {
    const statusEl = document.getElementById("emergency-auth-status");
    const previewButton = document.getElementById("emergency-preview");
    const executeButton = document.getElementById("emergency-execute");
    const password = document.getElementById("emergency-password")?.value || "";
    const code = document.getElementById("emergency-code")?.value || "";

    state.emergencyAuthenticated = false;
    if (previewButton) previewButton.disabled = true;
    if (executeButton) executeButton.disabled = true;

    if (!password || !code) {
      if (statusEl) statusEl.textContent = "パスワードと確認コードを入力してください。";
      return;
    }

    try {
      const { data, error } = await supabase.rpc("emergency_protocol_verify", {
        p_password: password,
        p_code: code
      });
      if (error) throw error;

      state.emergencyAuthenticated = data === true;
      if (statusEl) {
        statusEl.textContent = state.emergencyAuthenticated
          ? "緊急プロトコル認証済みです。発動前確認を行えます。"
          : "認証に失敗しました。";
      }
      if (previewButton) previewButton.disabled = !state.emergencyAuthenticated;
      if (executeButton) executeButton.disabled = !state.emergencyAuthenticated;
    } catch (error) {
      console.error("emergency protocol auth:", error);
      if (statusEl) statusEl.textContent = "認証に失敗しました。";
    }
  }

  async function previewEmergencyProtocol() {
    const output = document.getElementById("emergency-preview-result");
    if (!output || !state.emergencyAuthenticated) return;

    try {
      const { data, error } = await supabase.rpc("emergency_protocol_preview");
      if (error) throw error;
      output.textContent = JSON.stringify(data, null, 2);
    } catch (error) {
      console.error("emergency protocol preview:", error);
      output.textContent = "発動前確認に失敗しました。";
    }
  }

  async function executeEmergencyProtocol() {
    const output = document.getElementById("emergency-preview-result");
    if (!state.emergencyAuthenticated) return;

    const confirmed = window.confirm(
      "緊急ロックを発動します。新規アクセスと投稿を停止し、公開サイトからSupabase APIへの通常アクセスも遮断します。続行しますか？"
    );
    if (!confirmed) return;

    try {
      const { data, error } = await supabase.rpc("emergency_protocol_lock");
      if (error) throw error;

      state.site.maintenance_mode = true;
      state.site.posting_enabled = false;
      state.emergencyAuthenticated = false;

      if (output) output.textContent = JSON.stringify(data, null, 2);
      const statusEl = document.getElementById("emergency-auth-status");
      if (statusEl) statusEl.textContent = "緊急ロックを発動しました。";
      const previewButton = document.getElementById("emergency-preview");
      const executeButton = document.getElementById("emergency-execute");
      if (previewButton) previewButton.disabled = true;
      if (executeButton) executeButton.disabled = true;

      renderRoute();
    } catch (error) {
      console.error("emergency protocol execute:", error);
      if (output) output.textContent = "緊急ロックの発動に失敗しました。";
    }
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
      state.adminSecondFactorVerified = false;
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

  function toLocalDateTimeValue(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function clearAdminAnnouncementForm() {
    const form = document.getElementById("admin-announcement-form");
    if (form) form.reset();
    const id = document.getElementById("admin-announcement-id");
    if (id) id.value = "";
    const published = document.getElementById("admin-announcement-published");
    if (published) published.checked = true;
  }

  async function loadAdminAnnouncements() {
    if (!(await ensureAdmin())) return;

    const list = document.getElementById("admin-announcement-list");
    if (!list) return;
    list.innerHTML = '<div class="empty-state"><p>読み込み中...</p></div>';

    const { data, error } = await supabase
      .from("site_announcements")
      .select("id,title,message,published,starts_at,ends_at,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("loadAdminAnnouncements:", error);
      list.innerHTML = '<div class="empty-state"><p>お知らせを読み込めませんでした。</p></div>';
      return;
    }

    if (!data?.length) {
      list.innerHTML = '<div class="empty-state"><p>お知らせはありません。</p></div>';
      return;
    }

    list.innerHTML = data.map(item => `
      <article class="account-panel admin-announcement-row">
        <div>
          <strong>${escapeHTML(item.title)}</strong>
          <span class="admin-announcement-status">${item.published ? "公開中" : "非公開"}</span>
        </div>
        <p>${escapeHTML(item.message)}</p>
        <small>表示期間: ${item.starts_at ? escapeHTML(formatDate(item.starts_at)) : "指定なし"} ～ ${item.ends_at ? escapeHTML(formatDate(item.ends_at)) : "指定なし"}</small>
        <div class="form-actions">
          <button type="button" class="secondary-button" data-edit-announcement="${escapeHTML(item.id)}">編集</button>
          <button type="button" class="danger-button" data-delete-announcement="${escapeHTML(item.id)}">削除</button>
        </div>
      </article>
    `).join("");
  }

  async function saveAdminAnnouncement() {
    if (!(await ensureAdmin())) return;

    const id = document.getElementById("admin-announcement-id")?.value || "";
    const title = document.getElementById("admin-announcement-title")?.value.trim() || "";
    const message = document.getElementById("admin-announcement-message")?.value.trim() || "";
    const published = document.getElementById("admin-announcement-published")?.checked ?? true;
    const starts = document.getElementById("admin-announcement-starts")?.value || "";
    const ends = document.getElementById("admin-announcement-ends")?.value || "";

    if (!title || !message) {
      toast("タイトルと本文を入力してください。", "error");
      return;
    }

    const payload = {
      title,
      message,
      published,
      starts_at: starts ? new Date(starts).toISOString() : null,
      ends_at: ends ? new Date(ends).toISOString() : null,
      updated_at: new Date().toISOString()
    };

    if (payload.starts_at && payload.ends_at && new Date(payload.starts_at) >= new Date(payload.ends_at)) {
      toast("終了日時は開始日時より後にしてください。", "error");
      return;
    }

    if (!id) {
      payload.created_by = state.user.id;
    }

    const query = id
      ? supabase.from("site_announcements").update(payload).eq("id", id)
      : supabase.from("site_announcements").insert(payload);

    const { error } = await query;
    if (error) {
      console.error("saveAdminAnnouncement:", error);
      toast("お知らせを保存できませんでした。", "error");
      return;
    }

    clearAdminAnnouncementForm();
    await loadAdminAnnouncements();
    await loadPublicAnnouncements();
    toast("お知らせを保存しました。", "success");
  }

  async function editAdminAnnouncement(id) {
    if (!(await ensureAdmin())) return;
    const { data, error } = await supabase
      .from("site_announcements")
      .select("id,title,message,published,starts_at,ends_at")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      toast("お知らせを読み込めませんでした。", "error");
      return;
    }

    document.getElementById("admin-announcement-id").value = data.id;
    document.getElementById("admin-announcement-title").value = data.title || "";
    document.getElementById("admin-announcement-message").value = data.message || "";
    document.getElementById("admin-announcement-published").checked = data.published !== false;
    document.getElementById("admin-announcement-starts").value = toLocalDateTimeValue(data.starts_at);
    document.getElementById("admin-announcement-ends").value = toLocalDateTimeValue(data.ends_at);
    document.getElementById("admin-announcement-title").focus();
  }

  async function deleteAdminAnnouncement(id) {
    if (!(await ensureAdmin())) return;
    if (!confirm("このお知らせを削除しますか？")) return;

    const { error } = await supabase
      .from("site_announcements")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("deleteAdminAnnouncement:", error);
      toast("お知らせを削除できませんでした。", "error");
      return;
    }

    await loadAdminAnnouncements();
    await loadPublicAnnouncements();
    toast("お知らせを削除しました。", "success");
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
     USER DISPLAY / NOTIFICATIONS
     ========================================================= */

  async function loadUserPreferences() {
    if (!state.user) {
      state.preferences.dark_mode = false;
      applyDarkMode();
      return;
    }

    const { data, error } = await supabase
      .from("user_preferences")
      .select("dark_mode")
      .eq("user_id", state.user.id)
      .maybeSingle();

    if (error) {
      console.warn("user_preferences:", error);
      return;
    }

    state.preferences.dark_mode = data?.dark_mode === true;
    applyDarkMode();
  }

  function applyDarkMode() {
    document.documentElement.dataset.theme = state.preferences.dark_mode ? "dark" : "light";
    const toggle = document.getElementById("user-dark-mode");
    if (toggle) toggle.checked = state.preferences.dark_mode;
  }

  async function saveDarkMode(enabled) {
    if (!state.user) {
      toast("ダークモードを変更するにはログインしてください。", "error");
      return;
    }

    const { error } = await supabase
      .from("user_preferences")
      .upsert({
        user_id: state.user.id,
        dark_mode: Boolean(enabled),
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });

    if (error) {
      console.error("saveDarkMode:", error);
      toast("ダークモード設定を保存できませんでした。", "error");
      return;
    }

    state.preferences.dark_mode = Boolean(enabled);
    applyDarkMode();
  }

  async function loadNotifications() {
    const list = document.getElementById("notification-list");
    if (!list || !state.user) return;

    list.innerHTML = '<div class="empty-state"><p>読み込み中...</p></div>';

    const { data: notifications, error } = await supabase
      .from("site_notifications")
      .select("id,title,message,created_at,created_by")
      .or(`recipient_id.is.null,recipient_id.eq.${state.user.id}`)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("loadNotifications:", error);
      list.innerHTML = '<div class="empty-state"><p>通知を読み込めませんでした。</p></div>';
      return;
    }

    const ids = (notifications || []).map(n => n.id);
    let readIds = new Set();

    if (ids.length) {
      const { data: reads, error: readError } = await supabase
        .from("site_notification_reads")
        .select("notification_id")
        .eq("user_id", state.user.id)
        .in("notification_id", ids);

      if (!readError) readIds = new Set((reads || []).map(r => r.notification_id));
    }

    if (!notifications?.length) {
      list.innerHTML = '<div class="empty-state"><p>通知はありません。</p></div>';
      return;
    }

    list.innerHTML = notifications.map(n => {
      const read = readIds.has(n.id);
      return `
        <article class="notification-item${read ? " is-read" : " is-unread"}" data-notification-id="${escapeHTML(n.id)}">
          <div class="notification-item-header">
            <strong>${escapeHTML(n.title)}</strong>
            <time datetime="${escapeHTML(n.created_at)}">${escapeHTML(formatDate(n.created_at))}</time>
          </div>
          <p>${escapeHTML(n.message)}</p>
          <small>${n.created_by ? "管理者からの通知" : "全体通知"}</small>
        </article>
      `;
    }).join("");
  }

  async function markAllNotificationsRead() {
    if (!state.user) return;

    const { data: notifications, error } = await supabase
      .from("site_notifications")
      .select("id")
      .or(`recipient_id.is.null,recipient_id.eq.${state.user.id}`)
      .limit(100);

    if (error) {
      toast("既読処理に失敗しました。", "error");
      return;
    }

    const rows = (notifications || []).map(n => ({
      notification_id: n.id,
      user_id: state.user.id
    }));

    if (rows.length) {
      const { error: insertError } = await supabase
        .from("site_notification_reads")
        .upsert(rows, { onConflict: "notification_id,user_id" });

      if (insertError) {
        console.error("markAllNotificationsRead:", insertError);
        toast("既読処理に失敗しました。", "error");
        return;
      }
    }

    toast("すべて既読にしました。", "success");
    await loadNotifications();
  }

  async function loadBroadcastNotificationHistory() {
    if (!(await ensureAdmin())) return;

    const list = document.getElementById("admin-notification-history");
    if (!list) return;
    list.innerHTML = '<div class="empty-state"><p>読み込み中...</p></div>';

    const { data, error } = await supabase
      .from("site_notifications")
      .select("id,title,message,created_at,created_by")
      .is("recipient_id", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("loadBroadcastNotificationHistory:", error);
      list.innerHTML = '<div class="empty-state"><p>送信履歴を読み込めませんでした。</p></div>';
      return;
    }

    if (!data?.length) {
      list.innerHTML = '<div class="empty-state"><p>まだ全員向けメッセージはありません。</p></div>';
      return;
    }

    list.innerHTML = data.map(item => `
      <article class="account-panel admin-notification-history-row">
        <div>
          <strong>${escapeHTML(item.title)}</strong>
          <span class="admin-announcement-status">全員に送信</span>
        </div>
        <p>${escapeHTML(item.message)}</p>
        <small>送信日時：${escapeHTML(formatDate(item.created_at))}</small>
      </article>
    `).join("");
  }

  async function clearAdminNotificationForm() {
    document.getElementById("admin-notification-form")?.reset();
  }

  async function sendBroadcastNotification() {
    if (!(await ensureAdmin())) return;

    const title = document.getElementById("admin-notification-title")?.value.trim();
    const message = document.getElementById("admin-notification-message")?.value.trim();

    if (!title || !message) {
      toast("タイトルとメッセージを入力してください。", "error");
      return;
    }

    if (!confirm("このメッセージを全ユーザーに送信します。送信後は取り消せません。続行しますか？")) {
      return;
    }

    const { error } = await supabase
      .from("site_notifications")
      .insert({
        recipient_id: null,
        title,
        message,
        created_by: state.user.id
      });

    if (error) {
      console.error("sendBroadcastNotification:", error);
      toast("全員へのメッセージを送信できませんでした。", "error");
      return;
    }

    await clearAdminNotificationForm();
    await loadBroadcastNotificationHistory();
    toast("全員にメッセージを送信しました。", "success");
  }

  async function loadPublicAnnouncements() {
    const list = document.getElementById("announcement-list");
    if (!list) return;

    const { data, error } = await supabase
      .from("site_announcements")
      .select("id,title,message,created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.warn("loadPublicAnnouncements:", error);
      return;
    }

    if (!data?.length) {
      list.innerHTML = '<div class="announcement-item">お知らせはありません。</div>';
      return;
    }

    list.innerHTML = data.map(a => `
      <article class="announcement-item">
        <div class="announcement-item-header">
          <strong>${escapeHTML(a.title)}</strong>
          <time datetime="${escapeHTML(a.created_at)}">${escapeHTML(formatDate(a.created_at))}</time>
        </div>
        <p>${escapeHTML(a.message)}</p>
      </article>
    `).join("");
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

  function requestAdminSecondFactor() {
    if (state.adminSecondFactorVerified) return Promise.resolve(true);
    if (state.adminSecondFactorPromise) return state.adminSecondFactorPromise;

    state.adminSecondFactorPromise = new Promise(resolve => {
      const overlay = document.createElement("div");
      overlay.id = "admin-second-factor-overlay";
      overlay.style.cssText = "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px;";
      overlay.innerHTML = `
        <form id="admin-second-factor-form" style="width:min(420px,100%);background:#fff;border-radius:16px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
          <h2 style="margin-top:0">管理者追加認証</h2>
          <p>管理画面を開くには、管理者用の追加パスワードが必要です。</p>
          <label for="admin-second-factor-password">追加パスワード</label>
          <input id="admin-second-factor-password" type="password" autocomplete="current-password" required style="width:100%;box-sizing:border-box;margin:10px 0 16px;padding:12px">
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button type="button" id="admin-second-factor-cancel" class="secondary-button">キャンセル</button>
            <button type="submit" class="primary-button">認証</button>
          </div>
          <p id="admin-second-factor-error" style="min-height:1.4em;color:#b42318;margin-bottom:0"></p>
        </form>`;
      document.body.appendChild(overlay);

      const finish = value => {
        overlay.remove();
        state.adminSecondFactorPromise = null;
        resolve(value);
      };

      $("#admin-second-factor-cancel", overlay)?.addEventListener("click", () => finish(false));
      $("#admin-second-factor-form", overlay)?.addEventListener("submit", async event => {
        event.preventDefault();
        const password = $("#admin-second-factor-password", overlay)?.value || "";
        const errorEl = $("#admin-second-factor-error", overlay);
        const button = $("button[type='submit']", overlay);
        if (button) button.disabled = true;

        // RPCの前にブラウザ側の現在セッションを確認する。
        // セッションが切れている場合は「パスワード間違い」と誤表示しない。
        let sessionResult = await supabase.auth.getSession();
        if (!sessionResult.data?.session) {
          sessionResult = await supabase.auth.refreshSession();
        }

        if (!sessionResult.data?.session) {
          if (errorEl) errorEl.textContent = "ログインセッションがありません。もう一度ログインしてください。";
          if (button) button.disabled = false;
          return;
        }

        const { data, error } = await supabase.rpc("verify_admin_second_factor", { p_password: password });
        if (!error && data === true) {
          state.adminSecondFactorVerified = true;
          finish(true);
          return;
        }

        if (error) console.warn("admin second factor:", error);
        if (errorEl) errorEl.textContent = error
          ? "追加認証の確認に失敗しました。セッションを確認してもう一度お試しください。"
          : "追加パスワードが正しくありません。";
        if (button) button.disabled = false;
        $("#admin-second-factor-password", overlay)?.select();
      });

      setTimeout(() => $("#admin-second-factor-password", overlay)?.focus(), 0);
    });

    return state.adminSecondFactorPromise;
  }

  async function ensureAdmin() {
    if (!state.user) {
      toast("管理者権限が必要です。ログインしてください。", "error");
      navigate("#login");
      return false;
    }

    try {
      const { data, error } = await supabase.rpc("is_admin");
      if (!error) {
        state.adminVerified = data === true;
      } else {
        console.warn("is_admin:", error);
      }
    } catch (error) {
      console.warn("admin verification:", error);
    }

    const profileAdmin =
      state.profile?.id === state.user.id &&
      state.profile?.role === "admin" &&
      state.profile?.status === "active";

    if (!(state.adminVerified === true || profileAdmin)) {
      console.warn("ensureAdmin failed: DB is_admin() and profile check both denied");
      toast("管理者権限が必要です。", "error");
      navigate("#home");
      return false;
    }

    if (state.adminVerified !== true && profileAdmin) {
      console.warn("ensureAdmin: using verified profile fallback for UI access");
    }

    const secondFactorOk = await requestAdminSecondFactor();
    if (!secondFactorOk) {
      toast("追加認証が必要です。", "error");
      navigate("#home");
      return false;
    }

    state.adminVerified = state.adminVerified === true;
    updateAuthUI();
    return true;
  }

  async function loadAdminData() {
    if (!(await ensureAdmin())) return;
    const head = table => supabase.from(table).select("id", { count: "exact", head: true });

    const [usersResult, postsResult, reportsResult, ipBansResult, userCount, postCount, pendingReportCount, statsResult] =
      await Promise.all([
        supabase.rpc("admin_list_profiles", { limit_count: ADMIN_LIST_LIMIT }),
        supabase.from("posts").select("id,user_id,category,title,content,created_at").order("created_at",{ascending:false}).limit(ADMIN_LIST_LIMIT),
        supabase.from("reports").select("id,post_id,reporter_id,reason,detail,status,created_at").order("created_at",{ascending:false}).limit(ADMIN_LIST_LIMIT),
        supabase.from("ip_bans").select("id,ip,reason,duration,created_at,expires_at").order("created_at",{ascending:false}).limit(ADMIN_LIST_LIMIT),
        head("profiles"), head("posts"), head("reports").eq("status","pending"),
        supabase.rpc("admin_dashboard_stats")
      ]);

    state.adminCounts = {
      users:userCount.count ?? (usersResult.data||[]).length,
      posts:postCount.count ?? (postsResult.data||[]).length,
      pendingReports:pendingReportCount.count ?? 0,
      stats:statsResult.data || {}
    };
    state.users=usersResult.data||[];
    state.adminPosts=postsResult.data||[];
    state.reports=reportsResult.data||[];
    state.ipBans=ipBansResult.data||[];

    const ips=await fetchContentIps("post",state.adminPosts.map(p=>p.id));
    state.adminPosts.forEach(p=>p.adminIp=ips.get(p.id));
    renderAdmin();
  }

  async function loadAdminLogs() {
    if (!(await ensureAdmin())) return;
    const action=$("#admin-log-action-filter")?.value||null;
    const {data,error}=await supabase.rpc("admin_list_audit_logs",{limit_count:200,action_filter:action});
    if(error){ console.error(error); const body=$("#admin-logs-table-body"); if(body) body.innerHTML="<tr><td colspan=\"6\">ログを読み込めませんでした。</td></tr>"; return; }
    state.auditLogs=data||[]; renderAdminLogs();
  }

  async function loadAdminSessions() {
    if (!(await ensureAdmin())) return;
    const {data,error}=await supabase.rpc("admin_list_sessions",{limit_count:200});
    const body=$("#admin-sessions-table-body");
    if(error){console.error(error);if(body)body.innerHTML="<tr><td colspan=\"6\">セッションを読み込めませんでした。</td></tr>";return;}
    setText("admin-session-count",`${(data||[]).length}件`);
    if(!body)return;
    body.innerHTML=(data||[]).map(s=>`<tr>
      <td>${escapeHTML(s.username||"ユーザー")}</td>
      <td>${escapeHTML(s.email||"-")}</td>
      <td><small>${escapeHTML(s.session_id||"-")}</small></td>
      <td>${escapeHTML(formatDate(s.updated_at))}</td>
      <td>${escapeHTML(formatDate(s.not_after))}</td>
      <td>${escapeHTML(s.ip_address||"-")}</td>
    </tr>`).join("")||"<tr><td colspan=\"6\">有効なセッションはありません。</td></tr>";
  }

  async function loadAdminSecurityLogs() {
    if (!(await ensureAdmin())) return;
    const suspicious=Boolean($("#admin-security-suspicious-only")?.checked);
    const {data,error}=await supabase.rpc("admin_list_security_logs",{limit_count:200,suspicious_only:suspicious});
    const body=$("#admin-security-table-body");
    if(error){console.error(error);if(body)body.innerHTML="<tr><td colspan=\"7\">セキュリティログを読み込めませんでした。</td></tr>";return;}
    if(!body)return;
    body.innerHTML=(data||[]).map(l=>`<tr>
      <td>${escapeHTML(formatDate(l.created_at||l.logged_at))}</td>
      <td>${escapeHTML(l.source||"-")}</td>
      <td>${escapeHTML(l.ip_address||l.execution_ip||"-")}</td>
      <td>${escapeHTML(l.execution_result||"-")}</td>
      <td>${l.is_suspicious?"⚠️":"-"}</td>
      <td>${escapeHTML(l.suspicious_reason||"-")}</td>
      <td>${escapeHTML(l.event_key||"-")}</td>
    </tr>`).join("")||"<tr><td colspan=\"7\">ログはありません。</td></tr>";
  }

  async function loadAdminDiagnostics() {
    if (!(await ensureAdmin())) return;
    const {data,error}=await supabase.rpc("admin_diagnostics");
    const grid=$("#admin-diagnostics-grid"), detail=$("#admin-diagnostics-detail");
    if(error){
      console.error(error);
      if(grid) grid.innerHTML='<div class="admin-diagnostic-status diagnostic-error"><strong>診断を取得できません</strong><span>管理用APIから診断結果を受け取れませんでした。</span></div>';
      if(detail) detail.innerHTML='<p>更新ボタンから再試行してください。解決しない場合はPostgRESTと管理RPCの状態を確認してください。</p>';
      return;
    }
    const rlsOk = Number(data.public_rls_tables) === Number(data.public_tables);
    const preRequestOk = Array.isArray(data.pre_request_config) && data.pre_request_config.some(v => String(v).includes("pgrst.db_pre_request=public.check_ip_ban"));
    const exposedSchemas = String(data.exposed_schemas || "");
    const schemasOk = exposedSchemas.split(",").map(v=>v.trim()).includes("public");
    const items=[
      ["管理者権限API","正常",Boolean(data.is_admin_execute)],
      ["アクセスチェック(authenticated)","正常",Boolean(data.check_ip_ban_authenticated_execute)],
      ["アクセスチェック(anon)","正常",Boolean(data.check_ip_ban_anon_execute)],
      ["RLS","正常",rlsOk],
      ["PostgREST設定","正常",preRequestOk && schemasOk],
      ["監査ログ(24時間)",String(data.audit_logs_24h ?? 0),true],
      ["不審ログ(24時間)",String(data.suspicious_logs_24h ?? 0),Number(data.suspicious_logs_24h || 0)===0]
    ];
    if(grid){
      grid.innerHTML=items.map(([label,value,ok])=>`<div class="admin-stat-card admin-diagnostic-card ${ok?'diagnostic-ok':'diagnostic-warn'}">
        <span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong><small>${ok?'問題なし':'確認が必要'}</small>
      </div>`).join("");
    }
    if(detail){
      detail.innerHTML=`
        <h2>診断結果の見方</h2>
        <p>「正常」は、管理画面から確認できる範囲で必要な設定が確認できている状態です。</p>
        <div class="diagnostic-detail-list">
          <div><strong>RLS</strong><span>${escapeHTML(data.public_rls_tables)} / ${escapeHTML(data.public_tables)} テーブルで有効</span></div>
          <div><strong>PostgREST</strong><span>公開スキーマ: ${escapeHTML(exposedSchemas || '未取得')}</span></div>
          <div><strong>監査ログ</strong><span>過去24時間: ${escapeHTML(String(data.audit_logs_24h ?? 0))}件</span></div>
          <div><strong>不審ログ</strong><span>過去24時間: ${escapeHTML(String(data.suspicious_logs_24h ?? 0))}件</span></div>
        </div>
      `;
    }
  }

  async function loadAdminAdvanced() {
    if (!(await ensureAdmin())) return;
    const [summary, alerts, consistency, history, boards, accessLogs] = await Promise.all([
      supabase.rpc("admin_security_summary"),
      supabase.rpc("admin_list_alerts", { limit_count: 100, only_open: false }),
      supabase.rpc("admin_auth_profile_consistency"),
      supabase.rpc("admin_list_ip_ban_history", { limit_count: 100, search_ip: null }),
      supabase.rpc("admin_list_private_boards", { limit_count: 200 }),
      supabase.rpc("admin_list_private_board_access_logs", { p_board_id: null, limit_count: 200 })
    ]);
    const grid = $("#admin-security-summary-grid");
    if (grid) {
      const s = summary.data || {};
      const items = [
        ["不審ログ24h", s.suspicious_24h ?? 0],
        ["セキュリティイベント24h", s.security_events_24h ?? 0],
        ["監査イベント24h", s.audit_events_24h ?? 0],
        ["ログイン観測24h", s.login_observations_24h ?? 0],
        ["有効IP BAN", s.active_ip_bans ?? 0],
        ["未確認アラート", s.open_alerts ?? 0]
      ];
      grid.innerHTML = items.map(([k,v]) => `<div class="admin-stat-card"><span>${escapeHTML(k)}</span><strong>${escapeHTML(String(v))}</strong></div>`).join("");
    }
    const consistencyList=$("#admin-consistency-list");
    if(consistencyList) consistencyList.innerHTML=(consistency.data||[]).map(x=>`<article class="admin-post-item"><div><strong>${escapeHTML(x.email||x.user_id)}</strong><p>プロフィール: ${x.profile_exists?"あり":"なし"} / role: ${escapeHTML(x.role||"-")} / status: ${escapeHTML(x.status||"-")}</p></div></article>`).join("")||'<div class="empty-state"><p>Authとプロフィールの不整合はありません。</p></div>';
    const alertBody=$("#admin-alert-table-body");
    if(alertBody) alertBody.innerHTML=(alerts.data||[]).map(a=>`<tr><td>${escapeHTML(formatDate(a.created_at))}</td><td>${escapeHTML(a.severity)}</td><td>${escapeHTML(a.alert_type)}</td><td>${escapeHTML(a.message)}</td><td>${a.acknowledged?"確認済み":`<button type="button" class="secondary-button" data-ack-alert="${escapeHTML(a.id)}">確認</button>`}</td></tr>`).join("")||'<tr><td colspan="5">アラートはありません。</td></tr>';
    const histBody=$("#admin-ip-history-table-body");
    if(histBody) histBody.innerHTML=(history.data||[]).map(h=>`<tr><td>${escapeHTML(formatDate(h.created_at))}</td><td>${escapeHTML(h.ip)}</td><td>${escapeHTML(h.action)}</td><td>${escapeHTML(h.reason||"-")}</td></tr>`).join("")||'<tr><td colspan="4">履歴はありません。</td></tr>';
    const boardBody=$("#admin-advanced-board-table-body");
    if(boardBody) boardBody.innerHTML=(boards.data||[]).map(b=>`<tr><td>${escapeHTML(b.name)}</td><td>${escapeHTML(b.status||"active")}</td><td>${escapeHTML(String(b.active_members??0))}</td><td><button type="button" class="secondary-button" data-advanced-board-action="${escapeHTML(b.id)}" data-board-status="${escapeHTML(b.status||"active")}">${b.status==="suspended"?"復旧":"停止"}</button><button type="button" class="secondary-button" data-regenerate-board-invite="${escapeHTML(b.id)}">招待コード再発行</button></td></tr>`).join("")||'<tr><td colspan="4">掲示板はありません。</td></tr>';
    const accessBody=$("#admin-board-access-table-body");
    if(accessBody) accessBody.innerHTML=(accessLogs.data||[]).map(l=>`<tr><td>${escapeHTML(formatDate(l.created_at))}</td><td>${escapeHTML(l.board_id)}</td><td>${escapeHTML(l.username||l.user_id||"-")}</td><td>${escapeHTML(l.ip_address||"-")}</td><td>${l.allowed?"許可":"拒否"}</td><td>${escapeHTML(l.reason||"-")}</td></tr>`).join("")||'<tr><td colspan="6">アクセスログはありません。</td></tr>';
  }

  async function adminAcknowledgeAlert(id) {
    if (!(await ensureAdmin())) return;
    const {error}=await supabase.rpc("admin_ack_alert",{p_id:Number(id)});
    if(error){console.error(error);toast("アラートを確認済みにできませんでした。","error");return;}
    loadAdminAdvanced();
  }

  async function adminGenerateAlerts() {
    if (!(await ensureAdmin())) return;
    const {data,error}=await supabase.rpc("admin_generate_alerts");
    if(error){console.error(error);toast("アラート検知に失敗しました。","error");return;}
    toast(`${data||0}件のアラートを検知しました。`,"success");
    loadAdminAdvanced();
  }

  async function adminSetPrivateBoardStatus(boardId,status) {
    if (!(await ensureAdmin())) return;
    const reason=status==="suspended" ? prompt("停止理由を入力してください。") : null;
    if(status==="suspended" && reason===null)return;
    const {error}=await supabase.rpc("admin_set_private_board_status",{p_board_id:boardId,p_status:status,p_reason:reason});
    if(error){console.error(error);toast("掲示板状態を変更できませんでした。","error");return;}
    toast(status==="suspended"?"掲示板を停止しました。":"掲示板を復旧しました。","success");
    loadAdminAdvanced();
  }

  async function adminRegeneratePrivateBoardInvite(boardId) {
    if (!(await ensureAdmin())) return;
    if(!confirm("この掲示板の招待コードを再発行しますか？旧コードは無効になります。"))return;
    const {data,error}=await supabase.rpc("admin_regenerate_private_board_invite",{p_board_id:boardId});
    if(error){console.error(error);toast("招待コードを再発行できませんでした。","error");return;}
    prompt("新しい招待コードです。必要ならコピーしてください。",data||"");
    loadAdminAdvanced();
  }

  let adminAutoRefreshTimer = null;

  async function refreshAllAdminData() {
    if (!(await ensureAdmin())) return;
    const tasks = [
      loadAdminData(),
      loadAdminSessions(),
      loadAdminSecurityLogs(),
      loadAdminDiagnostics(),
      loadAdminAdvanced(),
      loadAdminLogs()
    ];
    await Promise.allSettled(tasks);
    toast("管理情報を更新しました。", "success");
  }

  function setupAdminAutoRefresh() {
    const checkbox = $("#admin-auto-refresh");
    if (!checkbox) return;
    checkbox.addEventListener("change", () => {
      if (adminAutoRefreshTimer) {
        clearInterval(adminAutoRefreshTimer);
        adminAutoRefreshTimer = null;
      }
      if (checkbox.checked) {
        adminAutoRefreshTimer = setInterval(() => {
          const route = getRoute();
          if (route.startsWith("admin")) refreshAllAdminData();
        }, 30000);
        toast("30秒ごとの自動更新を有効にしました。", "success");
      }
    });
  }

  function renderAdmin() {
    const counts=state.adminCounts||{}, s=counts.stats||{};
    setText("admin-user-count",counts.users??state.users.length);
    setText("admin-active-user-count",s.users_active??"-");
    setText("admin-post-count",counts.posts??state.adminPosts.length);
    setText("admin-reply-count",s.replies??"-");
    setText("admin-report-count",counts.pendingReports??"-");
    setText("admin-ban-count",s.active_ip_bans??state.ipBans.filter(isBanActive).length);
    setText("admin-session-stat",s.active_sessions??"-");
    setText("admin-suspicious-stat",s.suspicious_logs??"-");
    renderAdminUsers(); renderAdminPosts(); renderAdminReports(); renderIPBans();
  }

  function isBanActive(ban){return !ban.expires_at||new Date(ban.expires_at)>new Date();}

  function renderAdminUsers(users=state.users){
    const body=$("#admin-users-table-body"); if(!body)return;
    if(!users.length){body.innerHTML="<tr><td colspan=\"5\">ユーザーが見つかりません。</td></tr>";return;}
    body.innerHTML=users.map(u=>`<tr>
      <td>${escapeHTML(u.username||"ユーザー")}</td><td><small>${escapeHTML(u.id)}</small></td>
      <td>${escapeHTML(u.status||"active")} / ${escapeHTML(u.role||"user")}</td>
      <td>${escapeHTML(formatDate(u.created_at))}</td>
      <td><button type="button" class="secondary-button" data-admin-user="${escapeHTML(u.id)}">編集</button></td>
    </tr>`).join("");
  }

  function renderAdminPosts(){
    const list=$("#admin-post-list"); if(!list)return;
    list.innerHTML=state.adminPosts.length?state.adminPosts.map(p=>`<article class="admin-post-item"><div>
      <h3>${escapeHTML(p.title)}</h3><p>${escapeHTML(p.content)}</p><small>${escapeHTML(formatDate(p.created_at))} ・ IP: ${escapeHTML(p.adminIp||"記録なし")}</small>
    </div><button type="button" class="danger-button" data-admin-delete-post="${escapeHTML(p.id)}">削除</button></article>`).join(""):"<div class=\"empty-state\"><p>投稿はありません。</p></div>";
  }

  function renderAdminReports(){
    const list=$("#admin-report-list"); if(!list)return;
    list.innerHTML=state.reports.length?state.reports.map(r=>`<article class="admin-report-item"><div>
      <strong>${escapeHTML(r.reason||"理由なし")}</strong><p>${escapeHTML(r.detail||"")}</p>
      <small>${escapeHTML(r.status||"pending")} ・ ${escapeHTML(formatDate(r.created_at))} ・ 投稿ID: ${escapeHTML(r.post_id||"")}</small>
    </div><button type="button" class="secondary-button" data-resolve-report="${escapeHTML(r.id)}">${r.status==="pending"?"対応済みにする":"再オープン"}</button></article>`).join(""):"<div class=\"empty-state\"><p>通報はありません。</p></div>";
  }

  function renderIPBans(){
    const body=$("#ip-ban-table-body"); if(!body)return;
    if(!state.ipBans.length){body.innerHTML="<tr><td colspan=\"4\">BANされているIPはありません。</td></tr>";return;}
    body.innerHTML=state.ipBans.map(b=>`<tr><td>${escapeHTML(b.ip)}</td><td>${escapeHTML(b.reason||"")}</td><td>${escapeHTML(b.expires_at?formatDate(b.expires_at):"無期限")}</td><td><button type="button" class="danger-button" data-delete-ip-ban="${escapeHTML(b.id)}">解除</button></td></tr>`).join("");
  }

  async function searchAdminUsers(value){
    if(!(await ensureAdmin()))return;
    const {data,error}=await supabase.rpc("admin_list_user_details",{limit_count:200,search_text:value?.trim()||null});
    if(error){console.error(error);toast("ユーザー検索に失敗しました。","error");return;}
    renderAdminUsers((data||[]).map(u=>({...u,created_at:u.created_at})));
  }

  function openAdminUserDetail(userId){
    const user=state.users.find(x=>x.id===userId)||{};
    $("#admin-target-user-id").value=user.id||userId;
    $("#admin-target-status").value=user.status||"active";
    $("#admin-target-role").value=user.role||"user";
    $("#admin-target-ban-reason").value=user.ban_reason||"";
    $("#admin-disable-posting").checked=Boolean(user.disable_posting);
    $("#admin-disable-replies").checked=Boolean(user.disable_replies);
    $("#admin-force-password-change").checked=Boolean(user.force_password_change);
    setText("admin-target-username",user.username||"ユーザー");
    renderAdminUserIps(user.id||userId);
    navigate("#admin-user-detail");
  }

  async function saveAdminUser(){
    if(!(await ensureAdmin()))return;
    const userId=$("#admin-target-user-id")?.value;
    if(!userId)return;
    const {error}=await supabase.rpc("admin_update_user",{
      target_user:userId,
      p_status:$("#admin-target-status")?.value||null,
      p_role:$("#admin-target-role")?.value||null,
      p_disable_posting:Boolean($("#admin-disable-posting")?.checked),
      p_disable_replies:Boolean($("#admin-disable-replies")?.checked),
      p_force_password_change:Boolean($("#admin-force-password-change")?.checked),
      p_ban_reason:$("#admin-target-ban-reason")?.value.trim()||null
    });
    if(error){console.error(error);toast("ユーザー設定を更新できませんでした。","error");return;}
    toast("ユーザー設定を更新しました。","success"); await loadAdminData(); navigate("#admin-users");
  }

  async function addIPBan(){
    if(!(await ensureAdmin()))return;
    const ip=$("#ban-ip")?.value.trim(), reason=$("#ban-reason")?.value.trim()||"", duration=$("#ban-duration")?.value;
    const {error}=await supabase.rpc("admin_set_ip_ban",{p_ip:ip,p_reason:reason,p_duration:duration});
    if(error){console.error(error);toast("IP制限を追加できませんでした。","error");return;}
    $("#ip-ban-form")?.reset(); toast("IP制限を追加しました。","success"); await loadAdminData();
  }

  async function removeIPBan(id){
    if(!(await ensureAdmin()))return;
    if(!confirm("このIP制限を解除しますか？"))return;
    const {error}=await supabase.rpc("admin_remove_ip_ban",{p_id:id});
    if(error){console.error(error);toast("IP制限を解除できませんでした。","error");return;}
    toast("IP制限を解除しました。","success"); await loadAdminData();
  }

  async function resolveReport(id){
    if(!(await ensureAdmin()))return;
    const report=state.reports.find(r=>r.id===id), next=report?.status==="pending"?"resolved":"pending";
    const {error}=await supabase.rpc("admin_update_report",{p_report_id:id,p_status:next});
    if(error){console.error(error);toast("通報の状態を更新できませんでした。","error");return;}
    toast("通報状態を更新しました。","success"); await loadAdminData();
  }

  async function adminDeletePost(postId){
    if(!(await ensureAdmin()))return;
    if(!confirm("この投稿を管理者権限で削除しますか？"))return;
    const {error}=await supabase.rpc("admin_delete_post",{p_post_id:postId});
    if(error){console.error(error);toast("投稿を削除できませんでした。","error");return;}
    toast("投稿を削除しました。","success"); await loadAdminData();
  }

  async function adminDeleteReply(replyId){
    if(!(await ensureAdmin()))return;
    if(!confirm("この返信を管理者権限で削除しますか？"))return;
    const {error}=await supabase.rpc("admin_delete_reply",{p_reply_id:replyId});
    if(error){console.error(error);toast("返信を削除できませんでした。","error");return;}
    toast("返信を削除しました。","success"); await loadAdminData();
  }

  async function loadAdminPrivateBoards(){
    if(!(await ensureAdmin()))return;
    const {data,error}=await supabase.rpc("admin_list_private_boards",{limit_count:200});
    const body=$("#admin-private-board-table-body");
    if(error){console.error(error);if(body)body.innerHTML="<tr><td colspan=\"5\">掲示板を読み込めませんでした。</td></tr>";return;}
    if(!body)return;
    body.innerHTML=(data||[]).map(b=>`<tr>
      <td>${escapeHTML(b.name||"-")}</td>
      <td>${escapeHTML(b.owner_username||b.owner_id||"-")}</td>
      <td>${escapeHTML(b.visibility||"private")}</td>
      <td>${escapeHTML(String(b.active_members??0))}</td>
      <td><button type="button" class="secondary-button" data-open-admin-private-board="${escapeHTML(b.id)}">詳細</button></td>
    </tr>`).join("")||"<tr><td colspan=\"5\">掲示板はありません。</td></tr>";
  }

  async function loadAdminBots(){
    if(!(await ensureAdmin()))return;
    const {data,error}=await supabase.from("bots").select("id,name,description,created_at").order("created_at",{ascending:false}).limit(200);
    const list=$("#admin-bot-list");
    if(error){console.error(error);if(list)list.innerHTML="<div class=\"empty-state\"><p>Botを読み込めませんでした。</p></div>";return;}
    if(!list)return;
    list.innerHTML=(data||[]).map(b=>`<article class="admin-post-item"><div><h3>${escapeHTML(b.name)}</h3><p>${escapeHTML(b.description||"")}</p><small>${escapeHTML(formatDate(b.created_at))}</small></div><button type="button" class="danger-button" data-delete-admin-bot="${escapeHTML(b.id)}">削除</button></article>`).join("")||"<div class=\"empty-state\"><p>Botはありません。</p></div>";
  }

  async function createAdminBot(){
    if(!(await ensureAdmin()))return;
    const name=$("#bot-name")?.value.trim(),description=$("#bot-description")?.value.trim()||"";
    if(!name){toast("Bot名を入力してください。","error");return;}
    const {error}=await supabase.from("bots").insert({name,description});
    if(error){console.error(error);toast("Botを作成できませんでした。","error");return;}
    $("#create-bot-form")?.reset();closeModal("create-bot-dialog");toast("Botを作成しました。","success");await loadAdminBots();
  }

  async function deleteAdminBot(id){
    if(!(await ensureAdmin()))return;
    if(!confirm("このBotを削除しますか？"))return;
    const {error}=await supabase.from("bots").delete().eq("id",id);
    if(error){console.error(error);toast("Botを削除できませんでした。","error");return;}
    toast("Botを削除しました。","success");await loadAdminBots();
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

    onSubmit("#decoy-admin-login-form", () => {
      // デコイ画面から特権RPCを直接呼び出さない。
      // 管理権限の判定・監査はサーバー側の認証経路でのみ行う。
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
    on("#user-dark-mode", "change", event => saveDarkMode(event.target.checked));
    on("#mark-notifications-read", "click", markAllNotificationsRead);
    onSubmit("#admin-notification-form", sendBroadcastNotification);


    // 管理画面
    setupAdminAutoRefresh();
    onSubmit("#ip-ban-form", addIPBan);
    onSubmit("#admin-user-settings-form", saveAdminUser);
    onSubmit("#admin-user-search-form", () => searchAdminUsers($("#admin-user-search")?.value));
    on("#admin-log-action-filter", "change", loadAdminLogs);
    on("#admin-log-refresh", "click", loadAdminLogs);
    on("#admin-session-refresh", "click", loadAdminSessions);
    on("#admin-security-refresh", "click", loadAdminSecurityLogs);
    on("#admin-refresh-all", "click", refreshAllAdminData);
    on("#admin-security-suspicious-only", "change", loadAdminSecurityLogs);
    on("#admin-advanced-refresh","click",loadAdminAdvanced);
    on("#admin-generate-alerts","click",adminGenerateAlerts);
    onSubmit("#admin-ip-history-search-form",()=>loadAdminAdvanced());

    // まだ中身のない機能
    onSubmit("#join-private-board-form", joinPrivateBoard);
    onSubmit("#private-board-post-form", createPrivateBoardPost);
    onSubmit("#private-board-settings-form", savePrivateBoardSettings);
    onSubmit("#admin-site-settings-form", saveSiteSettings);
    onSubmit("#admin-announcement-form", saveAdminAnnouncement);
    on("#admin-announcement-clear", "click", clearAdminAnnouncementForm);
    onSubmit("#create-bot-form", createAdminBot);

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
      if (closest("[data-admin-user]")) openAdminUserDetail(closest("[data-admin-user]").dataset.adminUser);
      if (closest("[data-admin-delete-post]")) adminDeletePost(closest("[data-admin-delete-post]").dataset.adminDeletePost);
      if (closest("[data-resolve-report]")) resolveReport(closest("[data-resolve-report]").dataset.resolveReport);
      if (closest("[data-delete-ip-ban]")) removeIPBan(closest("[data-delete-ip-ban]").dataset.deleteIpBan);
      if (closest("[data-delete-admin-bot]")) deleteAdminBot(closest("[data-delete-admin-bot]").dataset.deleteAdminBot);
      if (closest("[data-edit-announcement]")) editAdminAnnouncement(closest("[data-edit-announcement]").dataset.editAnnouncement);
      if (closest("[data-delete-announcement]")) deleteAdminAnnouncement(closest("[data-delete-announcement]").dataset.deleteAnnouncement);
      if (closest("[data-open-admin-private-board]")) navigate("#admin-private-boards");
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
      if (closest("#emergency-auth-check")) authenticateEmergencyProtocol();
      if (closest("#emergency-preview")) previewEmergencyProtocol();
      if (closest("#emergency-execute")) executeEmergencyProtocol();
      if (closest("#admin-force-delete")) forceDeleteUser();
      const ackAlert=closest("[data-ack-alert]"); if(ackAlert) adminAcknowledgeAlert(ackAlert.dataset.ackAlert);
      const advBoard=closest("[data-advanced-board-action]"); if(advBoard) adminSetPrivateBoardStatus(advBoard.dataset.advancedBoardAction,advBoard.dataset.boardStatus==="suspended"?"active":"suspended");
      const regenBoard=closest("[data-regenerate-board-invite]"); if(regenBoard) adminRegeneratePrivateBoardInvite(regenBoard.dataset.regenerateBoardInvite);

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
          await loadUserPreferences();

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
          state.preferences.dark_mode = false;
          applyDarkMode();
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
      await loadUserPreferences();
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
