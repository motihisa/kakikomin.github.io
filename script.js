/* =========================================================
   KAKIKOMI - script.js
   Supabase + Hash Router
   ========================================================= */

(() => {
  "use strict";

  /* =========================================================
     SUPABASE
     ========================================================= */

  const SUPABASE_URL =
    "https://wtlmjaqyphmaeqhipqht.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_Mk4N_TF_cynZ53R7nmUyjQ_JeXsZ_Cs";

  const ADMIN_EMAIL =
    "ywcnbkceqon@admin.account";

  const supabase =
    window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );

  /* =========================================================
     DOM
     ========================================================= */

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  /* =========================================================
     STATE
     ========================================================= */

  const state = {
    user: null,
    profile: null,
    posts: [],
    reports: [],
    users: [],
    likes: [],
    currentCategory: "all",
    currentSort: "new",
    currentReportPostId: null
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

  function setText(id, value) {
    const element =
      document.getElementById(id);

    if (element) {
      element.textContent =
        value ?? "";
    }
  }

  function toast(
    message,
    type = "info"
  ) {
    const container =
      $("#toast-container");

    if (!container) {
      alert(message);
      return;
    }

    const item =
      document.createElement("div");

    item.className =
      `toast toast-${type}`;

    item.textContent = message;

    container.appendChild(item);

    setTimeout(() => {
      item.remove();
    }, 3500);
  }

  function setLoading(value) {
    const loading =
      $("#global-loading");

    if (!loading) return;

    loading.hidden = !value;

    loading.setAttribute(
      "aria-hidden",
      value ? "false" : "true"
    );
  }

  /* =========================================================
     ROUTES
     ========================================================= */

  const ROUTES = {
    "": "home",
    "home": "home",

    "login": "login",

    "Create_account":
      "Create_account",

    "register":
      "Create_account",

    "forgot-password":
      "forgot-password",

    "account":
      "account",

    "profile":
      "profile",

    "board":
      "board",

    "create-post":
      "create-post",

    "questions":
      "questions",

    "consultations":
      "consultations",

    "search":
      "search",

    "my-posts":
      "my-posts",

    "bookmarks":
      "bookmarks",

    "notifications":
      "notifications",

    "report":
      "report",

    "share":
      "share",

    "private-boards":
      "private-boards",

    "account-settings":
      "account-settings",

    "security-settings":
      "security-settings",

    "bot":
      "bot",

    "rules":
      "rules",

    "privacy":
      "privacy",

    "contact":
      "contact",

    /* ADMIN */
    "admin":
      "admin",

    "admin-users":
      "admin-users",

    "admin-user-detail":
      "admin-user-detail",

    "admin-posts":
      "admin-posts",

    "admin-reports":
      "admin-reports",

    "admin-ip-ban":
      "admin-ip-ban",

    "admin-bots":
      "admin-bots",

    "admin-private-boards":
      "admin-private-boards",

    "admin-site-settings":
      "admin-site-settings",

    "error-page":
      "error-page"
  };

  function getRoute() {
    const hash =
      location.hash.replace(
        /^#/,
        ""
      );

    if (ROUTES[hash]) {
      return ROUTES[hash];
    }

    /*
      HTMLに直接存在するIDなら
      そのままルートとして使用する
    */
    if (
      hash &&
      document.getElementById(hash)
    ) {
      return hash;
    }

    return null;
  }

  function navigate(route) {
    if (!route.startsWith("#")) {
      route = `#${route}`;
    }

    if (
      location.hash === route
    ) {
      renderRoute();
    } else {
      location.hash = route;
    }
  }

  /* =========================================================
     AUTH
     ========================================================= */

  function isAdmin() {
    if (!state.user) {
      return false;
    }

    /*
      基本はprofiles.roleを使用。
      さらに指定された管理者メールも
      管理者として認識する。
    */

    if (
      state.profile?.role ===
      "admin"
    ) {
      return true;
    }

    if (
      state.user.email ===
      ADMIN_EMAIL
    ) {
      return true;
    }

    return false;
  }

  function ensureLogin() {
    if (state.user) {
      return true;
    }

    toast(
      "ログインしてください。",
      "error"
    );

    navigate("#login");

    return false;
  }

  function ensureAdmin() {
    if (!state.user) {
      toast(
        "管理者ページを開くにはログインしてください。",
        "error"
      );

      navigate("#login");

      return false;
    }

    if (!isAdmin()) {
      toast(
        "管理者権限が必要です。",
        "error"
      );

      navigate("#home");

      return false;
    }

    return true;
  }

  async function loadCurrentUser() {
    try {
      const {
        data,
        error
      } =
        await supabase.auth.getUser();

      if (error) {
        console.error(
          "getUser:",
          error
        );

        state.user = null;
        state.profile = null;

        updateAuthUI();

        return;
      }

      state.user =
        data?.user || null;

      if (!state.user) {
        state.profile = null;
        updateAuthUI();
        return;
      }

      await loadProfile();

      updateAuthUI();

    } catch (error) {
      console.error(error);

      state.user = null;
      state.profile = null;

      updateAuthUI();
    }
  }

  async function login(
    email,
    password
  ) {
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
      } =
        await supabase.auth
          .signInWithPassword({
            email,
            password
          });

      if (error) {
        throw error;
      }

      state.user =
        data?.user || null;

      if (!state.user) {
        throw new Error(
          "ログイン情報を取得できませんでした。"
        );
      }

      await loadProfile();

      updateAuthUI();

      toast(
        "ログインしました。",
        "success"
      );

      navigate("#home");

    } catch (error) {
      console.error(
        "login:",
        error
      );

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
    if (
      !username ||
      !email ||
      !password
    ) {
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
      } =
        await supabase.auth
          .signUp({
            email,
            password
          });

      if (error) {
        throw error;
      }

      if (!data?.user) {
        throw new Error(
          "アカウントを作成できませんでした。"
        );
      }

      /*
        Supabase AuthのUUIDと
        profiles.idを同じにする
      */

      const {
        error: profileError
      } =
        await supabase
          .from("profiles")
          .upsert(
            {
              id: data.user.id,
              username,
              bio: "",
              role: "user"
            },
            {
              onConflict: "id"
            }
          );

      if (profileError) {
        console.error(
          "profile:",
          profileError
        );

        toast(
          "アカウントは作成されましたが、プロフィール作成に失敗しました。",
          "error"
        );

        return;
      }

      state.user =
        data.user;

      await loadProfile();

      updateAuthUI();

      toast(
        "アカウントを作成しました。",
        "success"
      );

      navigate("#home");

    } catch (error) {
      console.error(
        "register:",
        error
      );

      toast(
        error.message ||
          "アカウント作成に失敗しました。",
        "error"
      );

    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     LOGOUT
     ========================================================= */

  async function logout() {
    setLoading(true);

    try {
      /*
        Supabaseからログアウト
      */
      const {
        error
      } =
        await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      /*
        ローカル状態も必ず消す
      */
      state.user = null;
      state.profile = null;
      state.posts = [];
      state.reports = [];
      state.users = [];
      state.likes = [];
      state.currentReportPostId =
        null;

      updateAuthUI();

      toast(
        "ログアウトしました。",
        "success"
      );

      /*
        ログイン画面へ
      */
      navigate("#login");

    } catch (error) {
      console.error(
        "logout:",
        error
      );

      /*
        Supabase側でセッションが
        既に消えている場合でも
        ローカル状態を消す
      */

      state.user = null;
      state.profile = null;

      updateAuthUI();

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

    try {
      const {
        data,
        error
      } =
        await supabase
          .from("profiles")
          .select("*")
          .eq(
            "id",
            state.user.id
          )
          .maybeSingle();

      if (error) {
        console.error(
          "profile:",
          error
        );

        state.profile = null;

        return null;
      }

      /*
        指定管理者メールなら
        profileがまだrole=adminでなくても
        管理者として扱う
      */

      if (
        data &&
        state.user.email ===
          ADMIN_EMAIL &&
        data.role !== "admin"
      ) {
        data.role = "admin";
      }

      state.profile = data;

      renderProfile();
      renderAccount();

      return data;

    } catch (error) {
      console.error(error);

      state.profile = null;

      return null;
    }
  }

  function renderProfile() {
    const profile =
      state.profile;

    if (!profile) {
      return;
    }

    const header =
      $("#profile-header");

    if (header) {
      const avatar =
        header.querySelector(
          ".large-avatar"
        );

      if (avatar) {
        avatar.textContent =
          profile.username
            ?.charAt(0) ||
          "?";
      }

      const name =
        header.querySelector(
          "h1, h2"
        );

      if (name) {
        name.textContent =
          profile.username ||
          "ユーザー";
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
    const guest =
      $("#guest-account");

    const loggedIn =
      $("#logged-in-account");

    if (!state.user) {
      if (guest) {
        guest.hidden = false;
      }

      if (loggedIn) {
        loggedIn.hidden = true;
      }

      return;
    }

    if (guest) {
      guest.hidden = true;
    }

    if (loggedIn) {
      loggedIn.hidden = false;
    }

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
    if (!ensureLogin()) {
      return;
    }

    const username =
      $("#profile-username-input")
        ?.value
        .trim();

    const bio =
      $("#profile-bio-input")
        ?.value
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
    } =
      await supabase
        .from("profiles")
        .update({
          username,
          bio,
          updated_at:
            new Date()
              .toISOString()
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

    if (!list) {
      return;
    }

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
      state.currentCategory !==
      "all"
    ) {
      query =
        query.eq(
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

    /*
      いいね数を取得
    */

    for (
      const post of state.posts
    ) {
      const {
        count
      } =
        await supabase
          .from("likes")
          .select(
            "id",
            {
              count: "exact",
              head: true
            }
          )
          .eq(
            "post_id",
            post.id
          );

      post.like_count =
        count || 0;
    }

    renderPosts();
  }

  function renderPosts() {
    const list =
      $("#post-list");

    if (!list) {
      return;
    }

    if (!state.posts.length) {
      list.innerHTML =
        "<p id=\"no-posts\">投稿はありません。</p>";

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
      posts
        .map(post => {
          const profile =
            post.profiles ||
            {};

          const username =
            profile.username ||
            "ユーザー";

          return `
            <article
              class="post-card"
              data-post-id="${escapeHTML(
                post.id
              )}"
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
                      ${escapeHTML(
                        username
                      )}
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
                  state.user.id ===
                    post.user_id
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
                  post.allow_replies !==
                  false
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
                  post.allow_share !==
                  false
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
    if (!ensureLogin()) {
      return;
    }

    const category =
      $("#post-category")
        ?.value;

    const title =
      $("#post-title")
        ?.value
        .trim();

    const content =
      $("#post-content")
        ?.value
        .trim();

    const allowReplies =
      $("#allow-replies")
        ?.checked ??
      true;

    const allowShare =
      $("#allow-share")
        ?.checked ??
      true;

    if (
      !category ||
      !title ||
      !content
    ) {
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
      } =
        await supabase
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

      $("#post-form")
        ?.reset();

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

  async function deletePost(
    postId
  ) {
    if (!state.user) {
      return;
    }

    const post =
      state.posts.find(
        item =>
          item.id === postId
      );

    if (
      !post
    ) {
      return;
    }

    if (
      post.user_id !==
        state.user.id &&
      !isAdmin()
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
    } =
      await supabase
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

    await loadPosts();
  }

  /* =========================================================
     LIKE
     ========================================================= */

  async function likePost(
    postId
  ) {
    if (!ensureLogin()) {
      return;
    }

    const {
      data: existing,
      error: checkError
    } =
      await supabase
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
      console.error(
        checkError
      );

      toast(
        "いいねを確認できませんでした。",
        "error"
      );

      return;
    }

    if (existing) {
      const {
        error
      } =
        await supabase
          .from("likes")
          .delete()
          .eq(
            "id",
            existing.id
          );

      if (error) {
        console.error(error);
      }

    } else {
      const {
        error
      } =
        await supabase
          .from("likes")
          .insert({
            post_id:
              postId,
            user_id:
              state.user.id
          });

      if (error) {
        console.error(error);
      }
    }

    await loadPosts();
  }

  /* =========================================================
     REPLY
     ========================================================= */

  async function replyToPost(
    postId
  ) {
    if (!ensureLogin()) {
      return;
    }

    const post =
      state.posts.find(
        item =>
          item.id === postId
      );

    if (
      post &&
      post.allow_replies ===
        false
    ) {
      toast(
        "この投稿では返信できません。",
        "error"
      );

      return;
    }

    const content =
      prompt(
        "返信内容を入力してください。"
      );

    if (
      !content ||
      !content.trim()
    ) {
      return;
    }

    const {
      error
    } =
      await supabase
        .from("replies")
        .insert({
          post_id:
            postId,
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

  async function searchPosts(
    keyword
  ) {
    const result =
      $("#search-results");

    if (!result) {
      return;
    }

    keyword =
      String(keyword || "")
        .trim();

    if (!keyword) {
      result.innerHTML =
        "<p>検索キーワードを入力してください。</p>";

      return;
    }

    result.innerHTML =
      "<p>検索中...</p>";

    /*
      ilikeに特殊文字が入っても
      できるだけ安全に扱う
    */

    const safeKeyword =
      keyword
        .replaceAll("%", "")
        .replaceAll(",", " ");

    const {
      data,
      error
    } =
      await supabase
        .from("posts")
        .select(`
          *,
          profiles:user_id (
            username
          )
        `)
        .or(
          `title.ilike.%${safeKeyword}%,content.ilike.%${safeKeyword}%`
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
      data
        .map(post => `
          <article
            class="search-result-item"
          >

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
                post.profiles
                  ?.username ||
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

  async function openReportPage(
    postId
  ) {
    if (!ensureLogin()) {
      return;
    }

    state.currentReportPostId =
      postId || null;

    navigate("#report");

    setTimeout(
      () => {
        loadReportPosts();

        if (postId) {
          setTimeout(
            () => {
              const select =
                $("#report-post-select");

              if (select) {
                select.value =
                  postId;

                updateReportPreview();
              }
            },
            100
          );
        }
      },
      50
    );
  }

  async function loadReportPosts() {
    const select =
      $("#report-post-select");

    if (!select) {
      return;
    }

    const {
      data,
      error
    } =
      await supabase
        .from("posts")
        .select(`
          id,
          title,
          content,
          category,
          created_at
        `)
        .order(
          "created_at",
          {
            ascending: false
          }
        );

    if (error) {
      console.error(error);

      return;
    }

    state.posts =
      data || [];

    select.innerHTML =
      `<option value="">
        投稿を選択してください
      </option>`;

    state.posts.forEach(
      post => {
        const option =
          document.createElement(
            "option"
          );

        option.value =
          post.id;

        option.textContent =
          `[${post.category}] ${post.title}`;

        select.appendChild(
          option
        );
      }
    );

    if (
      state.currentReportPostId
    ) {
      select.value =
        state.currentReportPostId;

      updateReportPreview();
    }
  }

  function updateReportPreview() {
    const select =
      $("#report-post-select");

    const preview =
      $("#report-post-preview");

    if (
      !select ||
      !preview
    ) {
      return;
    }

    const post =
      state.posts.find(
        item =>
          item.id ===
          select.value
      );

    if (!post) {
      preview.innerHTML =
        "<p>投稿を選択してください。</p>";

      return;
    }

    preview.innerHTML = `
      <article>
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
      </article>
    `;
  }

  async function submitReport() {
    if (!ensureLogin()) {
      return;
    }

    const postId =
      $("#report-post-select")
        ?.value;

    const reason =
      $("#report-reason")
        ?.value
        .trim();

    const detail =
      $("#report-detail")
        ?.value
        .trim();

    if (
      !postId ||
      !reason
    ) {
      toast(
        "投稿と通報理由を選択してください。",
        "error"
      );

      return;
    }

    const {
      error
    } =
      await supabase
        .from("reports")
        .insert({
          reporter_id:
            state.user.id,
          post_id:
            postId,
          reason,
          detail:
            detail || null,
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

    $("#report-form")
      ?.reset();

    const preview =
      $("#report-post-preview");

    if (preview) {
      preview.innerHTML = "";
    }

    toast(
      "通報を送信しました。",
      "success"
    );

    state.currentReportPostId =
      null;
  }

  async function reportPost(
    postId
  ) {
    await openReportPage(
      postId
    );
  }

  /* =========================================================
     SHARE
     ========================================================= */

  async function sharePost(
    postId
  ) {
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

      } catch (error) {
        console.error(error);
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

  async function loadAdminData() {
    if (!ensureAdmin()) {
      return;
    }

    setLoading(true);

    try {
      const [
        usersResult,
        postsResult,
        reportsResult
      ] =
        await Promise.all([
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

      if (
        usersResult.error
      ) {
        console.error(
          "users:",
          usersResult.error
        );
      }

      if (
        postsResult.error
      ) {
        console.error(
          "posts:",
          postsResult.error
        );
      }

      if (
        reportsResult.error
      ) {
        console.error(
          "reports:",
          reportsResult.error
        );
      }

      state.users =
        usersResult.data ||
        [];

      state.posts =
        postsResult.data ||
        [];

      state.reports =
        reportsResult.data ||
        [];

      renderAdmin();

    } finally {
      setLoading(false);
    }
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

    setText(
      "admin-ban-count",
      state.users.filter(
        user =>
          user.status ===
          "banned"
      ).length
    );

    renderAdminUsers();
    renderAdminPosts();
    renderAdminReports();
  }

  function renderAdminUsers() {
    const body =
      $("#admin-users-table-body");

    if (!body) {
      return;
    }

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
                user.role ||
                "user"
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

    if (!list) {
      return;
    }

    list.innerHTML =
      state.posts
        .map(post => `
          <article
            class="admin-post-item"
          >

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

    if (!list) {
      return;
    }

    list.innerHTML =
      state.reports
        .map(report => `
          <article
            class="admin-report-item"
          >

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
                状態：
                ${escapeHTML(
                  report.status ||
                  "pending"
                )}
              </small>

              <br>

              <small>
                ${escapeHTML(
                  formatDate(
                    report.created_at
                  )
                )}
              </small>

            </div>

            ${
              report.status ===
              "pending"
                ? `
                  <button
                    type="button"
                    class="secondary-button"
                    data-resolve-report="${escapeHTML(
                      report.id
                    )}"
                  >
                    対応済みにする
                  </button>
                `
                : ""
            }

          </article>
        `)
        .join("");
  }

  async function adminDeletePost(
    postId
  ) {
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
    } =
      await supabase
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

  async function updateAdminUser(
    userId
  ) {
    if (!ensureAdmin()) {
      return;
    }

    const user =
      state.users.find(
        item =>
          item.id === userId
      );

    if (!user) {
      return;
    }

    const username =
      prompt(
        "ユーザー名",
        user.username ||
          ""
      );

    if (
      username === null
    ) {
      return;
    }

    const status =
      prompt(
        "状態（active / suspended / banned）",
        user.status ||
          "active"
      );

    if (
      status === null
    ) {
      return;
    }

    const {
      error
    } =
      await supabase
        .from("profiles")
        .update({
          username:
            username.trim(),
          status:
            status.trim()
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

  async function resolveReport(
    reportId
  ) {
    if (!ensureAdmin()) {
      return;
    }

    const {
      error
    } =
      await supabase
        .from("reports")
        .update({
          status:
            "resolved"
        })
        .eq(
          "id",
          reportId
        );

    if (error) {
      console.error(error);

      toast(
        "通報を更新できませんでした。",
        "error"
      );

      return;
    }

    toast(
      "通報を対応済みにしました。",
      "success"
    );

    await loadAdminData();
  }

  /* =========================================================
     PASSWORD
     ========================================================= */

  async function changePassword() {
    if (!ensureLogin()) {
      return;
    }

    const newPassword =
      $("#new-password")
        ?.value;

    const confirmPassword =
      $("#new-password-confirm")
        ?.value;

    if (
      !newPassword ||
      !confirmPassword
    ) {
      toast(
        "新しいパスワードを入力してください。",
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

    $("#security-form")
      ?.reset();

    toast(
      "パスワードを変更しました。",
      "success"
    );
  }

  /* =========================================================
     DELETE ACCOUNT
     ========================================================= */

  async function deleteAccount() {
    if (!ensureLogin()) {
      return;
    }

    if (
      !confirm(
        "本当にアカウントを削除しますか？"
      )
    ) {
      return;
    }

    const userId =
      state.user.id;

    setLoading(true);

    try {
      /*
        自分の投稿を削除
      */

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

      /*
        Authセッションを終了
      */

      await supabase.auth.signOut();

      state.user = null;
      state.profile = null;
      state.posts = [];
      state.reports = [];
      state.users = [];

      updateAuthUI();

      toast(
        "アカウントを削除しました。",
        "success"
      );

      navigate("#home");

    } catch (error) {
      console.error(error);

      toast(
        "アカウント削除中にエラーが発生しました。",
        "error"
      );

    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     AUTH UI
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

    /*
      管理者メニュー
    */

    $$(
      '[data-admin-only]'
    ).forEach(element => {
      element.hidden =
        !isAdmin();
    });

    renderAccount();
  }

  /* =========================================================
     FORMS
     ========================================================= */

  function setupForms() {

    /* LOGIN */

    $("#login-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          const email =
            $("#login-email")
              ?.value
              .trim();

          const password =
            $("#login-password")
              ?.value;

          login(
            email,
            password
          );
        }
      );

    /* REGISTER */

    $("#register-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          const username =
            $("#register-username")
              ?.value
              .trim();

          const email =
            $("#register-email")
              ?.value
              .trim();

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

    /* POST */

    $("#post-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          createPost();
        }
      );

    /* SEARCH */

    $("#search-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          const keyword =
            $("#search-input")
              ?.value
              .trim();

          searchPosts(
            keyword
          );
        }
      );

    /* PROFILE */

    $("#profile-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          updateProfile();
        }
      );

    /* PASSWORD */

    $("#security-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          changePassword();
        }
      );

    /* DELETE ACCOUNT */

    $("#delete-account-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          deleteAccount();
        }
      );

    /* REPORT */

    $("#report-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          submitReport();
        }
      );

    $("#report-post-select")
      ?.addEventListener(
        "change",
        updateReportPreview
      );
  }

  /* =========================================================
     CLICK EVENTS
     ========================================================= */

  function setupClicks() {
    document.addEventListener(
      "click",
      event => {

        /* ACTION */

        const action =
          event.target.closest(
            "[data-action]"
          );

        if (action) {
          const name =
            action.dataset.action;

          if (
            name ===
            "logout"
          ) {
            event.preventDefault();

            logout();

            return;
          }

          if (
            name ===
            "login"
          ) {
            event.preventDefault();

            navigate(
              "#login"
            );

            return;
          }

          if (
            name ===
            "Create_account"
          ) {
            event.preventDefault();

            navigate(
              "#Create_account"
            );

            return;
          }
        }

        /* LIKE */

        const like =
          event.target.closest(
            "[data-like-post]"
          );

        if (like) {
          event.preventDefault();

          likePost(
            like.dataset.likePost
          );

          return;
        }

        /* REPLY */

        const reply =
          event.target.closest(
            "[data-reply-post]"
          );

        if (reply) {
          event.preventDefault();

          replyToPost(
            reply.dataset.replyPost
          );

          return;
        }

        /* SHARE */

        const share =
          event.target.closest(
            "[data-share-post]"
          );

        if (share) {
          event.preventDefault();

          sharePost(
            share.dataset.sharePost
          );

          return;
        }

        /* REPORT */

        const report =
          event.target.closest(
            "[data-report-post]"
          );

        if (report) {
          event.preventDefault();

          reportPost(
            report.dataset.reportPost
          );

          return;
        }

        /* DELETE */

        const deleteButton =
          event.target.closest(
            "[data-delete-post]"
          );

        if (deleteButton) {
          event.preventDefault();

          deletePost(
            deleteButton.dataset
              .deletePost
          );

          return;
        }

        /* ADMIN DELETE */

        const adminDelete =
          event.target.closest(
            "[data-admin-delete-post]"
          );

        if (adminDelete) {
          event.preventDefault();

          adminDeletePost(
            adminDelete.dataset
              .adminDeletePost
          );

          return;
        }

        /* ADMIN USER */

        const adminUser =
          event.target.closest(
            "[data-admin-user]"
          );

        if (adminUser) {
          event.preventDefault();

          updateAdminUser(
            adminUser.dataset
              .adminUser
          );

          return;
        }

        /* RESOLVE REPORT */

        const resolve =
          event.target.closest(
            "[data-resolve-report]"
          );

        if (resolve) {
          event.preventDefault();

          resolveReport(
            resolve.dataset
              .resolveReport
          );

          return;
        }

        /* NAVIGATION */

        const routeLink =
          event.target.closest(
            "[data-route]"
          );

        if (routeLink) {
          event.preventDefault();

          navigate(
            routeLink.dataset.route
          );

          return;
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
            event.target.value ||
            "all";

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
     ROUTER
     ========================================================= */

  async function renderRoute() {
    const route =
      getRoute();

    const sections =
      $$(".page-section");

    sections.forEach(
      section => {
        section.hidden = true;
        section.classList.remove(
          "active"
        );
      }
    );

    if (!route) {
      const error =
        $("#error-page");

      if (error) {
        error.hidden = false;

        error.classList.add(
          "active"
        );
      }

      return;
    }

    const target =
      document.getElementById(
        route
      );

    if (!target) {
      const error =
        $("#error-page");

      if (error) {
        error.hidden = false;

        error.classList.add(
          "active"
        );
      }

      return;
    }

    /*
      管理者ページ
    */

    if (
      route === "admin" ||
      route.startsWith(
        "admin-"
      )
    ) {
      if (!ensureAdmin()) {
        return;
      }
    }

    target.hidden = false;

    target.classList.add(
      "active"
    );

    /* PAGE LOAD */

    if (
      route === "board"
    ) {
      loadPosts();
    }

    if (
      route === "profile"
    ) {
      await loadProfile();
    }

    if (
      route === "account"
    ) {
      renderAccount();
    }

    if (
      route === "report"
    ) {
      loadReportPosts();
    }

    /*
      ★ここが以前の問題
      admin-pageではなくadmin
    */

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
      await loadAdminData();
    }

    window.scrollTo({
      top: 0,
      behavior: "instant"
    });
  }

  /* =========================================================
     AUTH STATE LISTENER
     ========================================================= */

  function setupAuthListener() {
    supabase.auth.onAuthStateChange(
      async (
        event,
        session
      ) => {

        console.log(
          "Auth event:",
          event
        );

        /*
          SIGNED_OUT
        */

        if (
          event ===
          "SIGNED_OUT"
        ) {
          state.user = null;
          state.profile = null;
          state.posts = [];
          state.reports = [];
          state.users = [];

          updateAuthUI();

          return;
        }

        /*
          ログイン・セッション復元
        */

        state.user =
          session?.user ||
          null;

        if (state.user) {
          await loadProfile();
        } else {
          state.profile =
            null;
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

      await renderRoute();

    } catch (error) {
      console.error(
        "INIT:",
        error
      );

      toast(
        "ページの初期化に失敗しました。",
        "error"
      );

    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     HASH CHANGE
     ========================================================= */

  window.addEventListener(
    "hashchange",
    () => {
      renderRoute();
    }
  );

  /* =========================================================
     START
     ========================================================= */

  document.addEventListener(
    "DOMContentLoaded",
    init
  );

})();
