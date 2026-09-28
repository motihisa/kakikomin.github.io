/* =========================================================
   KAKIKOMI - script.js
   Supabase + Hash Router
   ========================================================= */

(() => {
  "use strict";

  const SUPABASE_URL = "https://wtlmjaqyphmaeqhipqht.supabase.co";
  const SUPABASE_KEY =
    "sb_publishable_Mk4N_TF_cynZ53R7nmUyjQ_JeXsZ_Cs";

  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  const state = {
    user: null,
    profile: null,
    posts: [],
    reports: [],
    users: [],
    currentCategory: "all",
    currentSort: "new"
  };

  /* =========================================================
     共通
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

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
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

    setTimeout(() => {
      item.remove();
    }, 3500);
  }

  function setLoading(value) {
    const loading = $("#global-loading");

    if (!loading) return;

    loading.hidden = !value;
    loading.setAttribute(
      "aria-hidden",
      value ? "false" : "true"
    );
  }

  function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value ?? "";
    }
  }

  /* =========================================================
     HASH ROUTER
     ========================================================= */

  const ROUTES = {
    "": "home",
    "home": "home",

    "login": "login",
    "Create_account": "Create_account",
    "register": "Create_account",

    "profile": "profile",
    "account": "account",

    "board": "board",
    "create-post": "create-post",

    "questions": "questions",
    "consultations": "consultations",

    "search": "search",
    "notifications": "notifications",

    "account-settings": "account-settings",
    "security-settings": "security-settings",

    "private-boards": "private-boards",
    "rules": "rules",

    "admin": "admin-page",
    "admin-users": "admin-users",
    "admin-posts": "admin-posts",
    "admin-reports": "admin-reports",
    "admin-ip-ban": "admin-ip-ban",
    "admin-bots": "admin-bots",
    "admin-private-boards": "admin-private-boards",
    "admin-site-settings": "admin-site-settings"
  };

  function getRoute() {
    const hash = location.hash.replace(/^#/, "");

    return ROUTES[hash] || null;
  }

  function navigate(route) {
    if (!route.startsWith("#")) {
      route = `#${route}`;
    }

    if (location.hash === route) {
      renderRoute();
    } else {
      location.hash = route;
    }
  }

  function renderRoute() {
    const route = getRoute();

    const sections = $$(".page-section");

    sections.forEach(section => {
      section.hidden = true;
      section.classList.remove("active");
    });

    if (!route) {
      const error = $("#error-page");

      if (error) {
        error.hidden = false;
        error.classList.add("active");
      }

      return;
    }

    const target = document.getElementById(route);

    if (!target) {
      const error = $("#error-page");

      if (error) {
        error.hidden = false;
        error.classList.add("active");
      }

      return;
    }

    target.hidden = false;
    target.classList.add("active");

    if (
      route.startsWith("admin")
    ) {
      if (!ensureAdmin()) {
        return;
      }
    }

    if (route === "board") {
      loadPosts();
    }

    if (route === "profile") {
      loadProfile();
    }

    if (route === "account") {
      renderAccount();
    }

    if (route === "admin-page") {
      loadAdminData();
    }

    if (route === "admin-users") {
      loadAdminData();
    }

    if (route === "admin-posts") {
      loadAdminData();
    }

    if (route === "admin-reports") {
      loadAdminData();
    }

    window.scrollTo({
      top: 0,
      behavior: "instant"
    });
  }

  /* =========================================================
     AUTH
     ========================================================= */

  async function loadCurrentUser() {
    const {
      data,
      error
    } = await supabase.auth.getUser();

    if (error) {
      console.error(error);
      state.user = null;
      state.profile = null;
      return;
    }

    state.user = data.user || null;

    if (!state.user) {
      state.profile = null;
      updateAuthUI();
      return;
    }

    await loadProfile();

    updateAuthUI();
  }

  async function login(email, password) {
    setLoading(true);

    try {
      const {
        data,
        error
      } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw error;
      }

      state.user = data.user;

      await loadProfile();

      toast(
        "ログインしました。",
        "success"
      );

      navigate("#home");
    } catch (error) {
      console.error(error);

      toast(
        error.message ||
          "ログインに失敗しました。",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  async function register(
    username,
    email,
    password
  ) {
    setLoading(true);

    try {
      const {
        data,
        error
      } = await supabase.auth.signUp({
        email,
        password
      });

      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error(
          "アカウントを作成できませんでした。"
        );
      }

      const {
        error: profileError
      } = await supabase
        .from("profiles")
        .upsert({
          id: data.user.id,
          username,
          bio: "",
          role: "user"
        });

      if (profileError) {
        console.error(profileError);

        toast(
          "アカウントは作成されましたが、プロフィール作成に失敗しました。",
          "error"
        );

        return;
      }

      state.user = data.user;

      await loadProfile();

      toast(
        "アカウントを作成しました。",
        "success"
      );

      navigate("#home");
    } catch (error) {
      console.error(error);

      toast(
        error.message ||
          "アカウント作成に失敗しました。",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);

    try {
      const {
        error
      } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      state.user = null;
      state.profile = null;

      toast(
        "ログアウトしました。",
        "success"
      );

      navigate("#home");
    } catch (error) {
      console.error(error);

      toast(
        "ログアウトに失敗しました。",
        "error"
      );
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

    const {
      data,
      error
    } = await supabase
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

    renderProfile();
    renderAccount();

    return data;
  }

  function renderProfile() {
    const profile = state.profile;

    if (!profile) return;

    const header = $("#profile-header");

    if (header) {
      const avatar =
        header.querySelector(".large-avatar");

      if (avatar) {
        avatar.textContent =
          profile.username?.charAt(0) || "?";
      }

      const name =
        header.querySelector("h1, h2");

      if (name) {
        name.textContent =
          profile.username || "ユーザー";
      }
    }

    setText(
      "profile-username",
      profile.username || ""
    );

    setText(
      "profile-bio",
      profile.bio || ""
    );
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

    setText(
      "account-username",
      state.profile?.username ||
        "ユーザー"
    );

    setText(
      "account-user-id",
      `ID: ${state.user.id}`
    );
  }

  async function updateProfile() {
    if (!state.user) {
      toast(
        "ログインしてください。",
        "error"
      );
      return;
    }

    const username =
      $("#profile-username-input")?.value
        .trim();

    const bio =
      $("#profile-bio-input")?.value
        .trim();

    if (!username) {
      toast(
        "ユーザー名を入力してください。",
        "error"
      );
      return;
    }

    const {
      error
    } = await supabase
      .from("profiles")
      .update({
        username,
        bio,
        updated_at: new Date().toISOString()
      })
      .eq("id", state.user.id);

    if (error) {
      console.error(error);

      toast(
        "プロフィールを更新できませんでした。",
        "error"
      );

      return;
    }

    await loadProfile();

    toast(
      "プロフィールを更新しました。",
      "success"
    );
  }

  /* =========================================================
     POSTS
     ========================================================= */

  async function loadPosts() {
    const list = $("#post-list");

    if (!list) return;

    list.innerHTML =
      "<p>読み込み中...</p>";

    let query = supabase
      .from("posts")
      .select(`
        *,
        profiles:user_id (
          id,
          username,
          avatar_url
        )
      `)
      .order(
        "created_at",
        {
          ascending: false
        }
      );

    if (
      state.currentCategory !== "all"
    ) {
      query = query.eq(
        "category",
        state.currentCategory
      );
    }

    const {
      data,
      error
    } = await query;

    if (error) {
      console.error(error);

      list.innerHTML =
        "<p>投稿を読み込めませんでした。</p>";

      return;
    }

    state.posts = data || [];

    renderPosts();
  }

  function renderPosts() {
    const list = $("#post-list");

    if (!list) return;

    if (!state.posts.length) {
      list.innerHTML =
        "<p id=\"no-posts\">投稿はありません。</p>";

      return;
    }

    let posts = [...state.posts];

    if (state.currentSort === "popular") {
      posts.sort(
        (a, b) =>
          (b.like_count || 0) -
          (a.like_count || 0)
      );
    }

    list.innerHTML = posts
      .map(post => {
        const profile =
          post.profiles || {};

        const username =
          profile.username ||
          "ユーザー";

        return `
          <article
            class="post-card"
            data-post-id="${escapeHTML(post.id)}"
          >

            <div class="post-card-header">

              <div class="post-user">

                <div class="avatar">
                  ${escapeHTML(
                    username.charAt(0)
                  )}
                </div>

                <div>
                  <strong>
                    ${escapeHTML(username)}
                  </strong>

                  <small>
                    ${escapeHTML(
                      formatDate(
                        post.created_at
                      )
                    )}
                  </small>
                </div>

              </div>

              ${
                state.user &&
                state.user.id === post.user_id
                  ? `
                    <button
                      type="button"
                      class="post-menu-button"
                      data-delete-post="${escapeHTML(
                        post.id
                      )}"
                    >
                      削除
                    </button>
                  `
                  : ""
              }

            </div>

            <div class="post-card-body">

              <span class="post-category">
                ${escapeHTML(
                  post.category
                )}
              </span>

              <h2>
                ${escapeHTML(
                  post.title
                )}
              </h2>

              <p>
                ${escapeHTML(
                  post.content
                )}
              </p>

            </div>

            <footer class="post-card-footer">

              <button
                type="button"
                class="post-action"
                data-like-post="${escapeHTML(
                  post.id
                )}"
              >
                いいね
                <span class="like-count">
                  ${post.like_count || 0}
                </span>
              </button>

              <button
                type="button"
                class="post-action"
                data-reply-post="${escapeHTML(
                  post.id
                )}"
              >
                返信
              </button>

              ${
                post.allow_share !== false
                  ? `
                    <button
                      type="button"
                      class="post-action"
                      data-share-post="${escapeHTML(
                        post.id
                      )}"
                    >
                      共有
                    </button>
                  `
                  : ""
              }

              <button
                type="button"
                class="post-action"
                data-report-post="${escapeHTML(
                  post.id
                )}"
              >
                通報
              </button>

            </footer>

          </article>
        `;
      })
      .join("");
  }

  async function createPost() {
    if (!state.user) {
      toast(
        "投稿するにはログインしてください。",
        "error"
      );

      navigate("#login");
      return;
    }

    const category =
      $("#post-category")?.value;

    const title =
      $("#post-title")?.value.trim();

    const content =
      $("#post-content")?.value.trim();

    const allowReplies =
      $("#allow-replies")?.checked ??
      true;

    const allowShare =
      $("#allow-share")?.checked ??
      true;

    if (!category || !title || !content) {
      toast(
        "必要な項目を入力してください。",
        "error"
      );

      return;
    }

    setLoading(true);

    try {
      const {
        error
      } = await supabase
        .from("posts")
        .insert({
          user_id: state.user.id,
          category,
          title,
          content,
          image_url: null,
          allow_replies: allowReplies,
          allow_share: allowShare
        });

      if (error) {
        throw error;
      }

      $("#post-form")?.reset();

      toast(
        "投稿しました。",
        "success"
      );

      navigate("#board");
    } catch (error) {
      console.error(error);

      toast(
        error.message ||
          "投稿に失敗しました。",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  async function deletePost(postId) {
    if (!state.user) return;

    const post =
      state.posts.find(
        item => item.id === postId
      );

    if (!post) return;

    if (
      post.user_id !== state.user.id &&
      state.profile?.role !== "admin"
    ) {
      toast(
        "この投稿を削除する権限がありません。",
        "error"
      );

      return;
    }

    if (
      !confirm(
        "この投稿を削除しますか？"
      )
    ) {
      return;
    }

    const {
      error
    } = await supabase
      .from("posts")
      .delete()
      .eq("id", postId);

    if (error) {
      console.error(error);

      toast(
        "投稿を削除できませんでした。",
        "error"
      );

      return;
    }

    toast(
      "投稿を削除しました。",
      "success"
    );

    await loadPosts();
  }

  /* =========================================================
     LIKE
     ========================================================= */

  async function likePost(postId) {
    if (!state.user) {
      toast(
        "いいねするにはログインしてください。",
        "error"
      );

      navigate("#login");
      return;
    }

    const {
      data: existing,
      error: checkError
    } = await supabase
      .from("likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", state.user.id)
      .maybeSingle();

    if (checkError) {
      console.error(checkError);
      return;
    }

    if (existing) {
      await supabase
        .from("likes")
        .delete()
        .eq("id", existing.id);
    } else {
      await supabase
        .from("likes")
        .insert({
          post_id: postId,
          user_id: state.user.id
        });
    }

    await loadPosts();
  }

  /* =========================================================
     REPLY
     ========================================================= */

  async function replyToPost(postId) {
    if (!state.user) {
      toast(
        "返信するにはログインしてください。",
        "error"
      );

      navigate("#login");
      return;
    }

    const content =
      prompt("返信内容を入力してください。");

    if (!content?.trim()) return;

    const {
      error
    } = await supabase
      .from("replies")
      .insert({
        post_id: postId,
        user_id: state.user.id,
        content: content.trim()
      });

    if (error) {
      console.error(error);

      toast(
        "返信できませんでした。",
        "error"
      );

      return;
    }

    toast(
      "返信しました。",
      "success"
    );
  }

  /* =========================================================
     SEARCH
     ========================================================= */

  async function searchPosts(keyword) {
    const result = $("#search-results");

    if (!result) return;

    if (!keyword) {
      result.innerHTML =
        "<p>検索キーワードを入力してください。</p>";
      return;
    }

    result.innerHTML =
      "<p>検索中...</p>";

    const {
      data,
      error
    } = await supabase
      .from("posts")
      .select(`
        *,
        profiles:user_id (
          username
        )
      `)
      .or(
        `title.ilike.%${keyword}%,content.ilike.%${keyword}%`
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      );

    if (error) {
      console.error(error);

      result.innerHTML =
        "<p>検索に失敗しました。</p>";

      return;
    }

    if (!data?.length) {
      result.innerHTML =
        "<p>該当する投稿はありません。</p>";

      return;
    }

    result.innerHTML = data
      .map(post => `
        <article class="search-result-item">

          <span>
            ${escapeHTML(
              post.category
            )}
          </span>

          <h2>
            ${escapeHTML(
              post.title
            )}
          </h2>

          <p>
            ${escapeHTML(
              post.content
            )}
          </p>

          <small>
            ${escapeHTML(
              post.profiles?.username ||
              "ユーザー"
            )}
            ・
            ${escapeHTML(
              formatDate(
                post.created_at
              )
            )}
          </small>

        </article>
      `)
      .join("");
  }

  /* =========================================================
     REPORT
     ========================================================= */

  async function reportPost(postId) {
    if (!state.user) {
      toast(
        "通報するにはログインしてください。",
        "error"
      );

      navigate("#login");
      return;
    }

    const reason =
      prompt(
        "通報理由を入力してください。"
      );

    if (!reason?.trim()) return;

    const {
      error
    } = await supabase
      .from("reports")
      .insert({
        reporter_id: state.user.id,
        post_id: postId,
        reason: reason.trim(),
        status: "pending"
      });

    if (error) {
      console.error(error);

      toast(
        "通報できませんでした。",
        "error"
      );

      return;
    }

    toast(
      "通報を送信しました。",
      "success"
    );
  }

  /* =========================================================
     SHARE
     ========================================================= */

  async function sharePost(postId) {
    const url =
      `${location.origin}${location.pathname}#board`;

    if (
      navigator.clipboard &&
      navigator.clipboard.writeText
    ) {
      try {
        await navigator.clipboard.writeText(url);

        toast(
          "リンクをコピーしました。",
          "success"
        );

        return;
      } catch {
        // fallback
      }
    }

    prompt(
      "このリンクをコピーしてください。",
      url
    );
  }

  /* =========================================================
     ADMIN
     ========================================================= */

  function ensureAdmin() {
    if (
      !state.user ||
      state.profile?.role !== "admin"
    ) {
      toast(
        "管理者権限が必要です。",
        "error"
      );

      navigate("#home");

      return false;
    }

    return true;
  }

  async function loadAdminData() {
    if (!ensureAdmin()) return;

    const [
      usersResult,
      postsResult,
      reportsResult
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .order(
          "created_at",
          {
            ascending: false
          }
        ),

      supabase
        .from("posts")
        .select("*")
        .order(
          "created_at",
          {
            ascending: false
          }
        ),

      supabase
        .from("reports")
        .select("*")
        .order(
          "created_at",
          {
            ascending: false
          }
        )
    ]);

    state.users =
      usersResult.data || [];

    state.posts =
      postsResult.data || [];

    state.reports =
      reportsResult.data || [];

    renderAdmin();
  }

  function renderAdmin() {
    setText(
      "admin-user-count",
      state.users.length
    );

    setText(
      "admin-post-count",
      state.posts.length
    );

    setText(
      "admin-report-count",
      state.reports.filter(
        report =>
          report.status === "pending"
      ).length
    );

    setText(
      "admin-ban-count",
      state.users.filter(
        user =>
          user.status === "banned"
      ).length
    );

    renderAdminUsers();
    renderAdminPosts();
    renderAdminReports();
  }

  function renderAdminUsers() {
    const body =
      $("#admin-users-table-body");

    if (!body) return;

    body.innerHTML =
      state.users
        .map(user => `
          <tr>

            <td>
              ${escapeHTML(
                user.username ||
                "ユーザー"
              )}
            </td>

            <td>
              ${escapeHTML(
                user.id
              )}
            </td>

            <td>
              ${escapeHTML(
                user.status ||
                "active"
              )}
            </td>

            <td>
              ${escapeHTML(
                formatDate(
                  user.created_at
                )
              )}
            </td>

            <td>
              <button
                type="button"
                class="secondary-button"
                data-admin-user="${escapeHTML(
                  user.id
                )}"
              >
                編集
              </button>
            </td>

          </tr>
        `)
        .join("");
  }

  function renderAdminPosts() {
    const list =
      $("#admin-post-list");

    if (!list) return;

    list.innerHTML =
      state.posts
        .map(post => `
          <article class="admin-post-item">

            <div>

              <h3>
                ${escapeHTML(
                  post.title
                )}
              </h3>

              <p>
                ${escapeHTML(
                  post.content
                )}
              </p>

              <small>
                ${escapeHTML(
                  formatDate(
                    post.created_at
                  )
                )}
              </small>

            </div>

            <button
              type="button"
              class="danger-button"
              data-admin-delete-post="${escapeHTML(
                post.id
              )}"
            >
              削除
            </button>

          </article>
        `)
        .join("");
  }

  function renderAdminReports() {
    const list =
      $("#admin-report-list");

    if (!list) return;

    list.innerHTML =
      state.reports
        .map(report => `
          <article class="admin-report-item">

            <div>

              <strong>
                ${escapeHTML(
                  report.reason ||
                  "理由なし"
                )}
              </strong>

              <p>
                ${escapeHTML(
                  report.detail ||
                  ""
                )}
              </p>

              <small>
                ${escapeHTML(
                  report.status ||
                  "pending"
                )}
              </small>

            </div>

          </article>
        `)
        .join("");
  }

  async function adminDeletePost(postId) {
    if (!ensureAdmin()) return;

    if (
      !confirm(
        "この投稿を管理者権限で削除しますか？"
      )
    ) {
      return;
    }

    const {
      error
    } = await supabase
      .from("posts")
      .delete()
      .eq("id", postId);

    if (error) {
      console.error(error);

      toast(
        "投稿を削除できませんでした。",
        "error"
      );

      return;
    }

    toast(
      "投稿を削除しました。",
      "success"
    );

    await loadAdminData();
  }

  async function updateAdminUser(userId) {
    if (!ensureAdmin()) return;

    const user =
      state.users.find(
        item => item.id === userId
      );

    if (!user) return;

    const username =
      prompt(
        "ユーザー名",
        user.username || ""
      );

    if (username === null) return;

    const status =
      prompt(
        "状態（active / suspended / banned）",
        user.status || "active"
      );

    if (status === null) return;

    const {
      error
    } = await supabase
      .from("profiles")
      .update({
        username,
        status
      })
      .eq("id", userId);

    if (error) {
      console.error(error);

      toast(
        "ユーザー設定を更新できませんでした。",
        "error"
      );

      return;
    }

    toast(
      "ユーザー設定を更新しました。",
      "success"
    );

    await loadAdminData();
  }

  /* =========================================================
     PASSWORD
     ========================================================= */

  async function changePassword() {
    if (!state.user) {
      toast(
        "ログインしてください。",
        "error"
      );

      return;
    }

    const currentPassword =
      $("#current-password")?.value;

    const newPassword =
      $("#new-password")?.value;

    const confirmPassword =
      $("#new-password-confirm")?.value;

    if (
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      toast(
        "必要な項目を入力してください。",
        "error"
      );

      return;
    }

    if (
      newPassword !== confirmPassword
    ) {
      toast(
        "新しいパスワードが一致しません。",
        "error"
      );

      return;
    }

    const email =
      state.user.email;

    const {
      error: loginError
    } = await supabase.auth
      .signInWithPassword({
        email,
        password: currentPassword
      });

    if (loginError) {
      toast(
        "現在のパスワードが正しくありません。",
        "error"
      );

      return;
    }

    const {
      error
    } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      console.error(error);

      toast(
        "パスワードを変更できませんでした。",
        "error"
      );

      return;
    }

    toast(
      "パスワードを変更しました。",
      "success"
    );

    $("#security-form")?.reset();
  }

  /* =========================================================
     DELETE ACCOUNT
     ========================================================= */

  async function deleteAccount() {
    if (!state.user) return;

    if (
      !confirm(
        "アカウントを削除しますか？"
      )
    ) {
      return;
    }

    const userId =
      state.user.id;

    setLoading(true);

    try {
      await supabase
        .from("likes")
        .delete()
        .eq("user_id", userId);

      await supabase
        .from("replies")
        .delete()
        .eq("user_id", userId);

      await supabase
        .from("posts")
        .delete()
        .eq("user_id", userId);

      await supabase
        .from("profiles")
        .delete()
        .eq("id", userId);

      await supabase.auth.signOut();

      state.user = null;
      state.profile = null;

      toast(
        "アカウントを削除しました。",
        "success"
      );

      navigate("#home");
    } catch (error) {
      console.error(error);

      toast(
        "アカウント削除に失敗しました。",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     UI
     ========================================================= */

  function updateAuthUI() {
    const loggedIn =
      Boolean(state.user);

    $$("[data-auth=\"logged-in\"]")
      .forEach(element => {
        element.hidden = !loggedIn;
      });

    $$("[data-auth=\"guest\"]")
      .forEach(element => {
        element.hidden = loggedIn;
      });

    renderAccount();
  }

  /* =========================================================
     FORM EVENTS
     ========================================================= */

  function setupForms() {
    $("#login-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        const email =
          $("#login-email")?.value.trim();

        const password =
          $("#login-password")?.value;

        login(email, password);
      }
    );

    $("#register-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        const username =
          $("#register-username")
            ?.value.trim();

        const email =
          $("#register-email")
            ?.value.trim();

        const password =
          $("#register-password")
            ?.value;

        const confirm =
          $("#register-password-confirm")
            ?.value;

        if (password !== confirm) {
          toast(
            "パスワードが一致しません。",
            "error"
          );

          return;
        }

        register(
          username,
          email,
          password
        );
      }
    );

    $("#post-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();
        createPost();
      }
    );

    $("#search-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        const keyword =
          $("#search-input")
            ?.value.trim();

        searchPosts(keyword);
      }
    );

    $("#security-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();
        changePassword();
      }
    );

    $("#profile-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();
        updateProfile();
      }
    );

    $("#delete-account-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();
        deleteAccount();
      }
    );
  }

  /* =========================================================
     CLICK EVENTS
     ========================================================= */

  function setupClicks() {
    document.addEventListener(
      "click",
      event => {
        const target =
          event.target.closest(
            "[data-action]"
          );

        if (target) {
          const action =
            target.dataset.action;

          if (action === "logout") {
            logout();
          }

          if (action === "login") {
            navigate("#login");
          }

          if (
            action ===
            "Create_account"
          ) {
            navigate(
              "#Create_account"
            );
          }
        }

        const like =
          event.target.closest(
            "[data-like-post]"
          );

        if (like) {
          likePost(
            like.dataset.likePost
          );
        }

        const reply =
          event.target.closest(
            "[data-reply-post]"
          );

        if (reply) {
          replyToPost(
            reply.dataset.replyPost
          );
        }

        const share =
          event.target.closest(
            "[data-share-post]"
          );

        if (share) {
          sharePost(
            share.dataset.sharePost
          );
        }

        const report =
          event.target.closest(
            "[data-report-post]"
          );

        if (report) {
          reportPost(
            report.dataset.reportPost
          );
        }

        const deleteButton =
          event.target.closest(
            "[data-delete-post]"
          );

        if (deleteButton) {
          deletePost(
            deleteButton.dataset.deletePost
          );
        }

        const adminDelete =
          event.target.closest(
            "[data-admin-delete-post]"
          );

        if (adminDelete) {
          adminDeletePost(
            adminDelete.dataset
              .adminDeletePost
          );
        }

        const adminUser =
          event.target.closest(
            "[data-admin-user]"
          );

        if (adminUser) {
          updateAdminUser(
            adminUser.dataset.adminUser
          );
        }
      }
    );
  }

  /* =========================================================
     BOARD FILTER
     ========================================================= */

  function setupBoard() {
    $("#board-category")
      ?.addEventListener(
        "change",
        event => {
          state.currentCategory =
            event.target.value;

          loadPosts();
        }
      );

    $$(".board-tab")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            $$(".board-tab")
              .forEach(tab =>
                tab.classList.remove(
                  "active"
                )
              );

            button.classList.add(
              "active"
            );

            state.currentSort =
              button.dataset.sort ||
              "new";

            renderPosts();
          }
        );
      });
  }

  /* =========================================================
     AUTH STATE
     ========================================================= */

  function setupAuthListener() {
    supabase.auth.onAuthStateChange(
      async (
        event,
        session
      ) => {
        state.user =
          session?.user || null;

        if (state.user) {
          await loadProfile();
        } else {
          state.profile = null;
        }

        updateAuthUI();
      }
    );
  }

  /* =========================================================
     INIT
     ========================================================= */

  async function init() {
    setLoading(true);

    try {
      setupForms();
      setupClicks();
      setupBoard();
      setupAuthListener();

      await loadCurrentUser();

      renderRoute();
    } catch (error) {
      console.error(error);
      toast(
        "ページの初期化に失敗しました。",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  window.addEventListener(
    "hashchange",
    renderRoute
  );

  document.addEventListener(
    "DOMContentLoaded",
    init
  );

})();
