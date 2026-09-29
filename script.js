/* =========================================================
   KAKIKOMI - script.js
   Supabase + Hash Router
   IP BAN対応版
   ========================================================= */

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://wtlmjaqyphmaeqhipqht.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_Mk4N_TF_cynZ53R7nmUyjQ_JeXsZ_Cs";

  const ADMIN_EMAIL =
    "ywcnbkceqon@admin-account";

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
    ipBans: [],
    currentCategory: "all",
    currentSort: "new"
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
     ROUTER
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

    "report": "report",
    "share": "share",

    "account-settings": "account-settings",
    "security-settings": "security-settings",

    "private-boards": "private-boards",
    "rules": "rules",
    "privacy": "privacy",
    "contact": "contact",

    "bot": "bot",

    /* 管理画面 */
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

  function getRoute() {
    const hash =
      location.hash.replace(/^#/, "");

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

    const sections =
      $$(".page-section");

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

    const target =
      document.getElementById(route);

    if (!target) {
      const error = $("#error-page");

      if (error) {
        error.hidden = false;
        error.classList.add("active");
      }

      return;
    }

    if (route.startsWith("admin")) {
      if (!ensureAdmin()) {
        return;
      }
    }

    target.hidden = false;
    target.classList.add("active");

    if (route === "board") {
      loadPosts();
    }

    if (route === "profile") {
      loadProfile();
    }

    if (route === "account") {
      renderAccount();
    }

    if (
      route === "admin" ||
      route === "admin-users" ||
      route === "admin-user-detail" ||
      route === "admin-posts" ||
      route === "admin-reports" ||
      route === "admin-ip-ban" ||
      route === "admin-bots" ||
      route === "admin-private-boards" ||
      route === "admin-site-settings"
    ) {
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

      updateAuthUI();

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
    if (!email || !password) {
      toast(
        "メールアドレスとパスワードを入力してください。",
        "error"
      );
      return;
    }

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
    if (!username || !email || !password) {
      toast(
        "必要な項目を入力してください。",
        "error"
      );
      return;
    }

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
          role: "user",
          status: "active"
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

      navigate("#login");
    } catch (error) {
      console.error(error);

      state.user = null;
      state.profile = null;

      toast(
        "ログアウト処理を完了しました。",
        "success"
      );

      navigate("#login");
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

    setText(
      "profile-username",
      profile.username || ""
    );

    setText(
      "profile-bio",
      profile.bio || ""
    );

    const header =
      $("#profile-header");

    if (header) {
      const avatar =
        header.querySelector(
          ".large-avatar"
        );

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
  }

  function renderAccount() {
    const guest =
      $("#guest-account");

    const loggedIn =
      $("#logged-in-account");

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
      $(
        "#profile-username-input"
      )?.value.trim();

    const bio =
      $(
        "#profile-bio-input"
      )?.value.trim();

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
        updated_at:
          new Date().toISOString()
      })
      .eq(
        "id",
        state.user.id
      );

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
    const list =
      $("#post-list");

    if (!list) return;

    list.innerHTML =
      "<p>読み込み中...</p>";

    let query =
      supabase
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

    state.posts =
      data || [];

    renderPosts();
  }

  function renderPosts() {
    const list =
      $("#post-list");

    if (!list) return;

    if (!state.posts.length) {
      list.innerHTML =
        "<p>投稿はありません。</p>";
      return;
    }

    let posts =
      [...state.posts];

    if (
      state.currentSort ===
      "popular"
    ) {
      posts.sort(
        (a, b) =>
          (b.like_count || 0) -
          (a.like_count || 0)
      );
    }

    list.innerHTML =
      posts.map(post => {
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
                (
                  state.user.id ===
                  post.user_id ||
                  state.profile?.role ===
                    "admin"
                )
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

              ${
                post.allow_replies !== false
                  ? `
                    <button
                      type="button"
                      class="post-action"
                      data-reply-post="${escapeHTML(
                        post.id
                      )}"
                    >
                      返信
                    </button>
                  `
                  : ""
              }

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
      }).join("");
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

    if (!category ||
        !title ||
        !content) {
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
          user_id:
            state.user.id,
          category,
          title,
          content,
          image_url: null,
          allow_replies:
            allowReplies,
          allow_share:
            allowShare
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
        item =>
          item.id === postId
      );

    if (!post) return;

    const isOwner =
      post.user_id ===
      state.user.id;

    const isAdmin =
      state.profile?.role ===
      "admin";

    if (!isOwner && !isAdmin) {
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
      .eq(
        "post_id",
        postId
      )
      .eq(
        "user_id",
        state.user.id
      )
      .maybeSingle();

    if (checkError) {
      console.error(checkError);
      return;
    }

    if (existing) {
      await supabase
        .from("likes")
        .delete()
        .eq(
          "id",
          existing.id
        );
    } else {
      await supabase
        .from("likes")
        .insert({
          post_id: postId,
          user_id:
            state.user.id
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
      prompt(
        "返信内容を入力してください。"
      );

    if (!content?.trim()) {
      return;
    }

    const {
      error
    } = await supabase
      .from("replies")
      .insert({
        post_id: postId,
        user_id:
          state.user.id,
        content:
          content.trim()
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
    const result =
      $("#search-results");

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

    result.innerHTML =
      data.map(post => `
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
      `).join("");
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

    if (!reason?.trim()) {
      return;
    }

    const {
      error
    } = await supabase
      .from("reports")
      .insert({
        reporter_id:
          state.user.id,
        post_id:
          postId,
        reason:
          reason.trim(),
        status:
          "pending"
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
        await navigator.clipboard.writeText(
          url
        );

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
    const isAdmin =
      state.profile?.role ===
      "admin";

    const isAdminEmail =
      state.user?.email ===
      ADMIN_EMAIL;

    if (
      !state.user ||
      (!isAdmin && !isAdminEmail)
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
    if (!ensureAdmin()) {
      return;
    }

    const [
      usersResult,
      postsResult,
      reportsResult,
      ipBansResult
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
        ),

      supabase
        .from("ip_bans")
        .select("*")
        .order(
          "created_at",
          {
            ascending: false
          }
        )
    ]);

    if (usersResult.error) {
      console.error(
        "Users:",
        usersResult.error
      );
    }

    if (postsResult.error) {
      console.error(
        "Posts:",
        postsResult.error
      );
    }

    if (reportsResult.error) {
      console.error(
        "Reports:",
        reportsResult.error
      );
    }

    if (ipBansResult.error) {
      console.error(
        "IP Bans:",
        ipBansResult.error
      );
    }

    state.users =
      usersResult.data || [];

    state.posts =
      postsResult.data || [];

    state.reports =
      reportsResult.data || [];

    state.ipBans =
      ipBansResult.data || [];

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
          report.status ===
          "pending"
      ).length
    );

    const activeBans =
      state.ipBans.filter(
        ban =>
          !ban.expires_at ||
          new Date(
            ban.expires_at
          ) > new Date()
      );

    setText(
      "admin-ban-count",
      activeBans.length
    );

    renderAdminUsers();
    renderAdminPosts();
    renderAdminReports();
    renderIPBans();
  }

  function renderAdminUsers() {
    const body =
      $("#admin-users-table-body");

    if (!body) return;

    body.innerHTML =
      state.users.map(user => `
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
      `).join("");
  }

  function renderAdminPosts() {
    const list =
      $("#admin-post-list");

    if (!list) return;

    list.innerHTML =
      state.posts.map(post => `
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
      `).join("");
  }

  function renderAdminReports() {
    const list =
      $("#admin-report-list");

    if (!list) return;

    list.innerHTML =
      state.reports.map(report => `
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
      `).join("");
  }

  /* =========================================================
     IP BAN
     ========================================================= */

  async function addIPBan() {
    if (!ensureAdmin()) {
      return;
    }

    const ip =
      $("#ban-ip")
        ?.value.trim();

    const reason =
      $("#ban-reason")
        ?.value.trim();

    const duration =
      $("#ban-duration")
        ?.value;

    if (!ip) {
      toast(
        "IPアドレスを入力してください。",
        "error"
      );
      return;
    }

    /*
      temporary = 24時間
      permanent = 無期限
    */

    let expiresAt = null;

    if (
      duration ===
      "temporary"
    ) {
      expiresAt =
        new Date(
          Date.now() +
          24 * 60 * 60 * 1000
        ).toISOString();
    }

    /*
      同じIPが既にある場合は
      古いレコードを削除してから登録
    */

    const {
      error: deleteError
    } = await supabase
      .from("ip_bans")
      .delete()
      .eq("ip", ip);

    if (deleteError) {
      console.error(
        "IP BAN old record:",
        deleteError
      );
    }

    const {
      error
    } = await supabase
      .from("ip_bans")
      .insert({
        ip,
        reason:
          reason ||
          "管理者によるアクセス制限",
        duration:
          duration ||
          "permanent",
        expires_at:
          expiresAt
      });

    if (error) {
      console.error(
        "IP BAN insert:",
        error
      );

      toast(
        "IP BANの登録に失敗しました。",
        "error"
      );

      return;
    }

    toast(
      "IP BANを追加しました。",
      "success"
    );

    $("#ip-ban-form")?.reset();

    await loadAdminData();
  }

  async function loadIPBans() {
    if (!ensureAdmin()) {
      return;
    }

    const {
      data,
      error
    } = await supabase
      .from("ip_bans")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false
        }
      );

    if (error) {
      console.error(
        "IP BAN load:",
        error
      );

      return;
    }

    state.ipBans =
      data || [];

    renderIPBans();
  }

  function renderIPBans() {
    const body =
      $("#ip-ban-table-body");

    if (!body) return;

    if (!state.ipBans.length) {
      body.innerHTML = `
        <tr>
          <td colspan="4">
            BANされているIPはありません。
          </td>
        </tr>
      `;

      return;
    }

    body.innerHTML =
      state.ipBans.map(ban => {
        const expired =
          ban.expires_at &&
          new Date(
            ban.expires_at
          ) <= new Date();

        let period;

        if (!ban.expires_at) {
          period = "無期限";
        } else if (expired) {
          period = "期限切れ";
        } else {
          period =
            `～ ${formatDate(
              ban.expires_at
            )}`;
        }

        return `
          <tr>

            <td>
              ${escapeHTML(
                ban.ip
              )}
            </td>

            <td>
              ${escapeHTML(
                ban.reason ||
                ""
              )}
            </td>

            <td>
              ${escapeHTML(
                period
              )}
            </td>

            <td>
              <button
                type="button"
                class="danger-button"
                data-delete-ip-ban="${escapeHTML(
                  ban.id
                )}"
              >
                解除
              </button>
            </td>

          </tr>
        `;
      }).join("");
  }

  async function removeIPBan(id) {
    if (!ensureAdmin()) {
      return;
    }

    if (
      !confirm(
        "このIP BANを解除しますか？"
      )
    ) {
      return;
    }

    const {
      error
    } = await supabase
      .from("ip_bans")
      .delete()
      .eq(
        "id",
        id
      );

    if (error) {
      console.error(
        "IP BAN delete:",
        error
      );

      toast(
        "IP BANの解除に失敗しました。",
        "error"
      );

      return;
    }

    toast(
      "IP BANを解除しました。",
      "success"
    );

    await loadAdminData();
  }

  /* =========================================================
     ADMIN POST
     ========================================================= */

  async function adminDeletePost(postId) {
    if (!ensureAdmin()) {
      return;
    }

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
      .eq(
        "id",
        postId
      );

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
    if (!ensureAdmin()) {
      return;
    }

    const user =
      state.users.find(
        item =>
          item.id === userId
      );

    if (!user) return;

    const username =
      prompt(
        "ユーザー名",
        user.username || ""
      );

    if (username === null) {
      return;
    }

    const status =
      prompt(
        "状態（active / suspended / banned）",
        user.status ||
          "active"
      );

    if (status === null) {
      return;
    }

    const {
      error
    } = await supabase
      .from("profiles")
      .update({
        username,
        status
      })
      .eq(
        "id",
        userId
      );

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
      $("#current-password")
        ?.value;

    const newPassword =
      $("#new-password")
        ?.value;

    const confirmPassword =
      $("#new-password-confirm")
        ?.value;

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
      newPassword !==
      confirmPassword
    ) {
      toast(
        "新しいパスワードが一致しません。",
        "error"
      );
      return;
    }

    const {
      error: loginError
    } =
      await supabase.auth
        .signInWithPassword({
          email:
            state.user.email,
          password:
            currentPassword
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
    } =
      await supabase.auth
        .updateUser({
          password:
            newPassword
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
    $("#change-password-form")?.reset();
  }

  /* =========================================================
     DELETE ACCOUNT
     ========================================================= */

  async function deleteAccount() {
    if (!state.user) {
      return;
    }

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
        .eq(
          "user_id",
          userId
        );

      await supabase
        .from("replies")
        .delete()
        .eq(
          "user_id",
          userId
        );

      await supabase
        .from("posts")
        .delete()
        .eq(
          "user_id",
          userId
        );

      await supabase
        .from("profiles")
        .delete()
        .eq(
          "id",
          userId
        );

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

    $$(
      '[data-auth="logged-in"]'
    ).forEach(element => {
      element.hidden =
        !loggedIn;
    });

    $$(
      '[data-auth="guest"]'
    ).forEach(element => {
      element.hidden =
        loggedIn;
    });

    renderAccount();
  }

  /* =========================================================
     FORM EVENTS
     ========================================================= */

  function setupForms() {
    $("#login-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          const email =
            $("#login-email")
              ?.value.trim();

          const password =
            $("#login-password")
              ?.value;

          login(
            email,
            password
          );
        }
      );

    $("#register-form")
      ?.addEventListener(
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

          const confirmPassword =
            $("#register-password-confirm")
              ?.value;

          if (
            password !==
            confirmPassword
          ) {
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

    $("#post-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();
          createPost();
        }
      );

    $("#search-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          const keyword =
            $("#search-input")
              ?.value.trim();

          searchPosts(keyword);
        }
      );

    $("#security-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();
          changePassword();
        }
      );

    $("#change-password-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();
          changePassword();
        }
      );

    $("#profile-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();
          updateProfile();
        }
      );

    $("#profile-settings-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();
          updateProfile();
        }
      );

    $("#delete-account-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();
          deleteAccount();
        }
      );

    $("#ip-ban-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();
          addIPBan();
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

        const actionTarget =
          event.target.closest(
            "[data-action]"
          );

        if (actionTarget) {
          const action =
            actionTarget.dataset.action;

          if (
            action ===
            "logout"
          ) {
            logout();
          }

          if (
            action ===
            "login"
          ) {
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
            adminUser.dataset
              .adminUser
          );
        }

        const deleteIPBan =
          event.target.closest(
            "[data-delete-ip-ban]"
          );

        if (deleteIPBan) {
          removeIPBan(
            deleteIPBan.dataset
              .deleteIpBan
          );
        }
      }
    );
  }

  /* =========================================================
     BOARD
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
              .forEach(tab => {
                tab.classList.remove(
                  "active"
                );
              });

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
          session?.user ||
          null;

        if (state.user) {
          await loadProfile();
        } else {
          state.profile = null;
        }

        updateAuthUI();

        if (
          event ===
          "SIGNED_OUT"
        ) {
          navigate("#login");
        }
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
