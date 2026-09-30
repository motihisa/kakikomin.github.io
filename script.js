/* =========================================================
   KAKIKOMI - script.js (修正版)
   Supabase + Hash Router
   ========================================================= */

(() => {
  "use strict";

  const SUPABASE_URL = "https://wtlmjaqyphmaeqhipqht.supabase.co";
  const SUPABASE_KEY = "sb_publishable_Mk4N_TF_cynZ53R7nmUyjQ_JeXsZ_Cs";

  // ※ブラウザ側の管理者チェックは見た目の制御だけ。
  //   本当の権限チェックはSupabaseのRLSポリシーでやること。
  const ADMIN_EMAIL = "ywcnbkceqon@admin-account";

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
    site: {
      site_name: "KAKIKOMI",
      site_description: "みんなで自由に書き込める総合掲示板",
      registration_enabled: true,
      posting_enabled: true,
      maintenance_mode: false
    },
    openReplies: new Set()   // 返信欄を開いている投稿ID
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
    return Boolean(
      state.user &&
      (state.profile?.role === "admin" || state.user.email === ADMIN_EMAIL)
    );
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
        return;
      }
      state.ipBanned = data === true;
      if (state.ipBanned) {
        toast("このネットワークからの書き込みは制限されています。閲覧のみ可能です。", "error");
      }
    } catch (error) {
      console.warn(error);
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
    "admin-site-settings": "admin-site-settings"
  };

  // ログインが必要なページ
  const AUTH_ROUTES = new Set([
    "create-post", "my-posts", "bookmarks", "notifications", "profile",
    "account-settings", "security-settings"
  ]);

  function getRoute() {
    const hash = location.hash.replace(/^#/, "");
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
      case "private-boards": showPlaceholder("#private-board-list", "参加中の掲示板はありません。"); break;
      case "bot": showPlaceholder("#bot-list", "Botはまだありません。"); break;
      case "admin-site-settings": loadSiteSettings().then(fillSiteSettingsForm); break;
      default:
        if (route.startsWith("admin")) loadAdminData();
    }
  }

  function renderRoute() {
    const route = getRoute();

    closeAllModals();

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

    if (route.startsWith("admin") && !ensureAdmin()) {
      return;
    }

    target.hidden = false;
    target.classList.add("active");

    runRouteLoader(route);

    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function refreshRoute() {
    const route = getRoute();
    if (route) runRouteLoader(route);
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
    } else {
      state.profile = null;
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
    if (!state.user) {
      state.profile = null;
      return null;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", state.user.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      state.profile = null;
      return null;
    }

    state.profile = data;
    return data;
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

    const { data } = await fetchPosts(q => q.eq("user_id", state.user.id));
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
        return { data: (data || []).map(normalizePost), error: null };
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

  async function loadPosts() {
    const list = $("#post-list");
    if (!list) return;

    list.innerHTML = `<div class="empty-state"><p>読み込み中...</p></div>`;

    const { data, error } = await fetchPosts(q =>
      state.currentCategory ? q.eq("category", state.currentCategory) : q
    );

    if (error) {
      list.innerHTML = `<div class="empty-state"><p>投稿を読み込めませんでした。</p></div>`;
      return;
    }

    state.posts = data;
    renderPosts();
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
      return;
    }

    if (noPosts) noPosts.hidden = true;
    list.innerHTML = posts.map(postCardHTML).join("");
    restoreOpenReplies(list);
  }

  async function loadMyPosts() {
    if (!state.user) return;
    const { data, error } = await fetchPosts(q => q.eq("user_id", state.user.id));
    if (error) {
      showPlaceholder("#my-post-list", "投稿を読み込めませんでした。");
      return;
    }
    renderPostList("#my-post-list", data, "まだ投稿がありません。");
  }

  async function loadCategoryPosts(category, selector) {
    const { data, error } = await fetchPosts(q => q.eq("category", category));
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
        ${canDelete ? `
          <button type="button" class="post-menu-button" style="margin-top:8px;"
            data-delete-reply="${escapeHTML(reply.id)}"
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
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("replies with profiles failed, retrying:", error);
      ({ data, error } = await supabase
        .from("replies")
        .select("*")
        .eq("post_id", postId)
        .order("created_at", { ascending: true }));
    }

    if (error) {
      console.error(error);
      panels.forEach(panel => {
        panel.innerHTML = `<p style="margin:0;color:var(--danger);">返信を読み込めませんでした。</p>`;
      });
      return;
    }

    const replies = data || [];

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

  async function deleteReply(replyId, postId) {
    if (!state.user) return;
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
  }

  async function loadSiteSettings() {
    const { data, error } = await supabase
      .from("site_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.warn("site_settings:", error);
      return;
    }

    if (data) {
      state.site = { ...state.site, ...data };
      applySiteSettings();
    }

    if (state.site.maintenance_mode && !isAdminUser()) {
      toast("現在メンテナンス中です。閲覧のみ可能です。", "info");
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
  }

  async function saveSiteSettings() {
    if (!ensureAdmin()) return;

    const payload = {
      id: 1,
      site_name: $("#site-name")?.value.trim() || "KAKIKOMI",
      site_description: $("#site-description")?.value.trim() || "",
      registration_enabled: $("#site-registration-enabled")?.checked ?? true,
      posting_enabled: $("#site-posting-enabled")?.checked ?? true,
      maintenance_mode: $("#site-maintenance-mode")?.checked ?? false,
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
      q.or(`title.ilike.%${keyword}%,content.ilike.%${keyword}%`)
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
      toast(writeErrorMessage(error, "通報できませんでした。"), "error");
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

  function ensureAdmin() {
    if (!isAdminUser()) {
      toast("管理者権限が必要です。", "error");
      navigate("#home");
      return false;
    }
    return true;
  }

  async function loadAdminData() {
    if (!ensureAdmin()) return;

    const [usersResult, postsResult, reportsResult, ipBansResult] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("posts").select("*").order("created_at", { ascending: false }),
      supabase.from("reports").select("*").order("created_at", { ascending: false }),
      supabase.from("ip_bans").select("*").order("created_at", { ascending: false })
    ]);

    if (usersResult.error) console.error("Users:", usersResult.error);
    if (postsResult.error) console.error("Posts:", postsResult.error);
    if (reportsResult.error) console.error("Reports:", reportsResult.error);
    if (ipBansResult.error) console.error("IP Bans:", ipBansResult.error);

    state.users = usersResult.data || [];
    state.adminPosts = postsResult.data || [];
    state.reports = reportsResult.data || [];
    state.ipBans = ipBansResult.data || [];

    renderAdmin();
  }

  function renderAdmin() {
    setText("admin-user-count", state.users.length);
    setText("admin-post-count", state.adminPosts.length);
    setText(
      "admin-report-count",
      state.reports.filter(r => r.status === "pending").length
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
          <small>${escapeHTML(formatDate(post.created_at))}</small>
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
    if (!ensureAdmin()) return;

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
    if (!ensureAdmin()) return;
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
    if (idInput) idInput.value = user.id;
    if (status) status.value = user.status || "active";
    setText("admin-target-username", user.username || "ユーザー");

    navigate("#admin-user-detail");
  }

  async function saveAdminUser() {
    if (!ensureAdmin()) return;

    const userId = $("#admin-target-user-id")?.value;
    const status = $("#admin-target-status")?.value;
    if (!userId || !status) return;

    const { error } = await supabase
      .from("profiles")
      .update({ status })
      .eq("id", userId);

    if (error) {
      console.error(error);
      toast("ユーザー設定を更新できませんでした。", "error");
      return;
    }

    toast("ユーザー設定を更新しました。", "success");
    await loadAdminData();
  }

  function searchAdminUsers(keyword) {
    const word = (keyword || "").trim().toLowerCase();
    const users = word
      ? state.users.filter(u => (u.username || "").toLowerCase().includes(word))
      : state.users;
    renderAdminUsers(users);
  }

  /* =========================================================
     IP BAN
     BANの強制はDB側（is_ip_banned() と各テーブルの書き込みポリシー）で行う。
     BAN中のIPからは、投稿・返信・いいね・通報ができない（閲覧はできる）。
     ========================================================= */

  async function addIPBan() {
    if (!ensureAdmin()) return;

    const ip = $("#ban-ip")?.value.trim();
    const reason = $("#ban-reason")?.value.trim();
    const duration = $("#ban-duration")?.value || "permanent";

    if (!ip) {
      toast("IPアドレスを入力してください。", "error");
      return;
    }

    // 1 / 7 / 30 → その日数後に期限切れ、permanent → 無期限(null)
    let expiresAt = null;
    if (duration !== "permanent" && Number(duration) > 0) {
      expiresAt = new Date(Date.now() + Number(duration) * 24 * 60 * 60 * 1000).toISOString();
    }

    // 同じIPが既にある場合は古いレコードを消してから登録
    const { error: deleteError } = await supabase.from("ip_bans").delete().eq("ip", ip);
    if (deleteError) console.error("IP BAN old record:", deleteError);

    const { error } = await supabase.from("ip_bans").insert({
      ip,
      reason: reason || "管理者によるアクセス制限",
      duration,
      expires_at: expiresAt
    });

    if (error) {
      console.error("IP BAN insert:", error);
      toast("IP BANの登録に失敗しました。", "error");
      return;
    }

    toast("IP BANを追加しました。", "success");
    $("#ip-ban-form")?.reset();

    await loadAdminData();
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
    if (!ensureAdmin()) return;
    if (!confirm("このIP BANを解除しますか？")) return;

    const { error } = await supabase.from("ip_bans").delete().eq("id", id);

    if (error) {
      console.error("IP BAN delete:", error);
      toast("IP BANの解除に失敗しました。", "error");
      return;
    }

    toast("IP BANを解除しました。", "success");
    await loadAdminData();
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

    // まだ中身のない機能
    onSubmit("#join-private-board-form", () => comingSoon("限定掲示板への参加"));
    onSubmit("#admin-site-settings-form", saveSiteSettings);
    onSubmit("#create-bot-form", () => comingSoon("Botの作成"));

    // 返信フォーム（投稿カードの中にあとから作られるので、documentで受ける）
    document.addEventListener("submit", event => {
      const form = event.target.closest?.("form[data-reply-form]");
      if (!form) return;
      event.preventDefault();
      submitReply(form.dataset.replyForm, form);
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
      if (closest("#create-private-board-button")) comingSoon("限定掲示板の作成");
      if (closest("#mark-notifications-read")) comingSoon("既読機能");
      if (closest("#admin-force-logout")) comingSoon("強制ログアウト");

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
        deleteReply(deleteReplyButton.dataset.deleteReply, deleteReplyButton.dataset.replyPostId);
      }

      const share = closest("[data-share-post]");
      if (share) sharePost();

      const report = closest("[data-report-post]");
      if (report) openReportModal(report.dataset.reportPost);

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
      state.user = session?.user || null;

      setTimeout(async () => {
        if (state.user) {
          await loadProfile();
        } else {
          state.profile = null;
        }

        updateAuthUI();

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
      checkIpBan();

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
