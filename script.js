/* =========================================================
   KAKIKOMI - script.js
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

  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );


  /* =========================================================
     STATE
     ========================================================= */

  const state = {
    user: null,
    profile: null,

    posts: [],
    users: [],
    reports: [],

    currentCategory: "",
    currentSort: "new",

    selectedReportPostId: null
  };


  /* =========================================================
     DOM HELPERS
     ========================================================= */

  const $ = selector =>
    document.querySelector(selector);

  const $$ = selector =>
    [...document.querySelectorAll(selector)];


  function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value ?? "";
    }
  }


  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }


  function formatDate(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleString("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }


  /* =========================================================
     TOAST
     ========================================================= */

  function toast(message, type = "info") {
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


  /* =========================================================
     LOADING
     ========================================================= */

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
     MODAL
     ========================================================= */

  function openModal(id) {
    const modal =
      document.getElementById(id);

    if (!modal) return;

    modal.hidden = false;
    modal.setAttribute(
      "aria-hidden",
      "false"
    );
  }


  function closeModal(id) {
    const modal =
      document.getElementById(id);

    if (!modal) return;

    modal.hidden = true;
    modal.setAttribute(
      "aria-hidden",
      "true"
    );
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

    "forgot-password": "forgot-password",

    "account": "account",
    "profile": "profile",

    "board": "board",
    "create-post": "create-post",

    "questions": "questions",
    "consultations": "consultations",

    "search": "search",

    "my-posts": "my-posts",
    "bookmarks": "bookmarks",
    "notifications": "notifications",

    "report": "report",
    "share": "share",

    "private-boards": "private-boards",

    "account-settings": "account-settings",
    "security-settings": "security-settings",

    "bot": "bot",

    "rules": "rules",
    "privacy": "privacy",
    "contact": "contact",

    /* ★ここが重要 */
    "admin": "admin",

    "admin-users": "admin-users",
    "admin-user-detail": "admin-user-detail",
    "admin-posts": "admin-posts",
    "admin-reports": "admin-reports",
    "admin-ip-ban": "admin-ip-ban",
    "admin-bots": "admin-bots",
    "admin-private-boards": "admin-private-boards",
    "admin-site-settings": "admin-site-settings",

    "error-page": "error-page"
  };


  function getRoute() {
    const hash =
      location.hash.replace(/^#/, "");

    /*
      ROUTESに登録されていなくても、
      HTMLに同じidのページがあれば表示できるようにする。
    */

    if (ROUTES[hash]) {
      return ROUTES[hash];
    }

    if (hash &&
        document.getElementById(hash)) {
      return hash;
    }

    return null;
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


  async function renderRoute() {
    const route = getRoute();

    const sections =
      $$(".page-section");

    sections.forEach(section => {
      section.hidden = true;
      section.classList.remove("active");
    });


    if (!route) {
      const error =
        $("#error-page");

      if (error) {
        error.hidden = false;
        error.classList.add("active");
      }

      return;
    }


    const target =
      document.getElementById(route);


    if (!target) {
      const error =
        $("#error-page");

      if (error) {
        error.hidden = false;
        error.classList.add("active");
      }

      return;
    }


    /*
      管理者ページはすべて管理者チェック。
    */

    if (route.startsWith("admin")) {
      if (!ensureAdmin()) {
        return;
      }
    }


    target.hidden = false;
    target.classList.add("active");


    /* ページごとの処理 */

    if (route === "home") {
      loadPosts();
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


    if (route === "my-posts") {
      loadMyPosts();
    }


    if (route === "bookmarks") {
      loadBookmarks();
    }


    if (route === "report") {
      loadReportPage();
    }


    /*
      ★ admin になった
      admin-page ではない
    */

    if (
      route === "admin" ||
      route.startsWith("admin-")
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


    state.user =
      data.user || null;


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
        data.user;


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
      } =
        await supabase.auth.signUp({
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


      /*
        Supabase AuthのUUIDを
        profiles.idにも使う。
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
        console.error(profileError);

        toast(
          "アカウントは作成されましたが、プロフィール作成に失敗しました。",
          "error"
        );

        return;
      }


      state.user =
        data.user;


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
      } =
        await supabase.auth.signOut();


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


  async function resetPassword(email) {
    setLoading(true);

    try {
      const {
        error
      } =
        await supabase.auth
          .resetPasswordForEmail(
            email,
            {
              redirectTo:
                `${location.origin}${location.pathname}#security-settings`
            }
          );


      if (error) {
        throw error;
      }


      toast(
        "パスワード再設定メールを送信しました。",
        "success"
      );

    } catch (error) {
      console.error(error);

      toast(
        error.message ||
          "メールを送信できませんでした。",
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
    } =
      await supabase
        .from("profiles")
        .select("*")
        .eq("id", state.user.id)
        .maybeSingle();


    if (error) {
      console.error(error);
      state.profile = null;
      return null;
    }


    state.profile = data || null;

    updateProfileUI();

    return state.profile;
  }


  function updateProfileUI() {
    const profile =
      state.profile;


    if (!profile) return;


    setText(
      "account-username",
      profile.username ||
        "ユーザー"
    );


    setText(
      "profile-username",
      profile.username ||
        "ユーザー"
    );


    setText(
      "profile-bio",
      profile.bio || ""
    );


    const avatarText =
      (
        profile.username ||
        "?"
      ).charAt(0).toUpperCase();


    $$(".large-avatar")
      .forEach(element => {
        element.textContent =
          avatarText;
      });


    const usernameInput =
      $("#profile-username-input");

    if (
      usernameInput &&
      document.activeElement !== usernameInput
    ) {
      usernameInput.value =
        profile.username || "";
    }


    const bioInput =
      $("#profile-bio-input");

    if (
      bioInput &&
      document.activeElement !== bioInput
    ) {
      bioInput.value =
        profile.bio || "";
    }
  }


  async function saveProfile() {
    if (!state.user) {
      toast(
        "ログインしてください。",
        "error"
      );

      return;
    }


    const username =
      $("#profile-username-input")
        ?.value.trim();


    const bio =
      $("#profile-bio-input")
        ?.value.trim() || "";


    if (!username) {
      toast(
        "ユーザー名を入力してください。",
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
        await supabase
          .from("profiles")
          .update({
            username,
            bio,
            updated_at:
              new Date().toISOString()
          })
          .eq("id", state.user.id)
          .select()
          .single();


      if (error) {
        throw error;
      }


      state.profile = data;

      updateProfileUI();


      toast(
        "プロフィールを更新しました。",
        "success"
      );

    } catch (error) {
      console.error(error);

      toast(
        "プロフィールを更新できませんでした。",
        "error"
      );

    } finally {
      setLoading(false);
    }
  }


  /* =========================================================
     ACCOUNT UI
     ========================================================= */

  function renderAccount() {
    const guest =
      $("#guest-account");

    const loggedIn =
      $("#logged-in-account");


    if (!guest || !loggedIn) {
      return;
    }


    if (state.user) {
      guest.hidden = true;
      loggedIn.hidden = false;

      updateProfileUI();

    } else {
      guest.hidden = false;
      loggedIn.hidden = true;
    }
  }


  function updateAuthUI() {
    const loggedIn =
      Boolean(state.user);


    $$("[data-auth=\"logged-in\"]")
      .forEach(element => {
        element.hidden =
          !loggedIn;
      });


    $$("[data-auth=\"guest\"]")
      .forEach(element => {
        element.hidden =
          loggedIn;
      });


    renderAccount();
  }


  /* =========================================================
     POSTS
     ========================================================= */

  async function loadPosts() {
    let query =
      supabase
        .from("posts")
        .select("*")
        .order(
          "created_at",
          {
            ascending: false
          }
        );


    if (state.currentCategory) {
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

      toast(
        "投稿を読み込めませんでした。",
        "error"
      );

      return;
    }


    state.posts =
      data || [];


    await attachLikeCounts();

    renderPosts();
  }


  async function attachLikeCounts() {
    if (!state.posts.length) {
      return;
    }


    const postIds =
      state.posts.map(
        post => post.id
      );


    const {
      data,
      error
    } =
      await supabase
        .from("likes")
        .select("post_id")
        .in("post_id", postIds);


    if (error) {
      console.error(error);
      return;
    }


    const counts = {};


    (data || []).forEach(row => {
      counts[row.post_id] =
        (counts[row.post_id] || 0) + 1;
    });


    state.posts =
      state.posts.map(post => ({
        ...post,
        like_count:
          counts[post.id] || 0
      }));
  }


  function renderPosts() {
    const list =
      $("#post-list");

    if (!list) return;


    let posts =
      [...state.posts];


    if (state.currentSort === "old") {
      posts.reverse();
    }


    list.innerHTML =
      posts.map(post => {
        const isMine =
          state.user &&
          post.user_id === state.user.id;


        return `
          <article class="post-card">

            <div class="post-card-header">
              <div>
                <span class="post-category">
                  ${escapeHTML(post.category)}
                </span>

                <h2>
                  ${escapeHTML(post.title)}
                </h2>
              </div>

              <time>
                ${escapeHTML(
                  formatDate(post.created_at)
                )}
              </time>
            </div>

            <div class="post-card-body">
              <p>
                ${escapeHTML(post.content)}
              </p>
            </div>

            <div class="post-card-actions">

              <button
                type="button"
                data-like-post="${escapeHTML(post.id)}"
              >
                ♡ ${post.like_count || 0}
              </button>

              ${
                post.allow_replies !== false
                  ? `
                    <button
                      type="button"
                      data-reply-post="${escapeHTML(post.id)}"
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
                      data-share-post="${escapeHTML(post.id)}"
                    >
                      共有
                    </button>
                  `
                  : ""
              }

              <button
                type="button"
                data-report-post="${escapeHTML(post.id)}"
              >
                通報
              </button>

              ${
                isMine
                  ? `
                    <button
                      type="button"
                      data-delete-post="${escapeHTML(post.id)}"
                      class="danger-button"
                    >
                      削除
                    </button>
                  `
                  : ""
              }

            </div>

          </article>
        `;
      }).join("");


    const empty =
      $("#no-posts");


    if (empty) {
      empty.hidden =
        posts.length !== 0;
    }
  }


  async function createPost(form) {
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

            allow_replies:
              allowReplies,

            allow_share:
              allowShare
          });


      if (error) {
        throw error;
      }


      form.reset();


      toast(
        "投稿しました。",
        "success"
      );


      await loadPosts();

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


    if (
      !confirm(
        "この投稿を削除しますか？"
      )
    ) {
      return;
    }


    setLoading(true);

    try {
      const {
        error
      } =
        await supabase
          .from("posts")
          .delete()
          .eq("id", postId)
          .eq(
            "user_id",
            state.user.id
          );


      if (error) {
        throw error;
      }


      toast(
        "投稿を削除しました。",
        "success"
      );


      await loadPosts();

    } catch (error) {
      console.error(error);

      toast(
        "投稿を削除できませんでした。",
        "error"
      );

    } finally {
      setLoading(false);
    }
  }


  async function likePost(postId) {
    if (!state.user) {
      toast(
        "いいねするにはログインしてください。",
        "error"
      );

      return;
    }


    const {
      data: existing,
      error: findError
    } =
      await supabase
        .from("likes")
        .select("id")
        .eq("post_id", postId)
        .eq(
          "user_id",
          state.user.id
        )
        .maybeSingle();


    if (findError) {
      console.error(findError);
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
      const {
        error
      } =
        await supabase
          .from("likes")
          .insert({
            post_id: postId,
            user_id:
              state.user.id
          });


      if (error) {
        console.error(error);
      }
    }


    await loadPosts();
  }


  async function replyToPost(postId) {
    if (!state.user) {
      toast(
        "返信するにはログインしてください。",
        "error"
      );

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
    } =
      await supabase
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
     SHARE
     ========================================================= */

  async function sharePost(postId) {
    const url =
      `${location.origin}${location.pathname}#board`;


    try {
      await navigator.clipboard.writeText(url);

      toast(
        "投稿ページのURLをコピーしました。",
        "success"
      );

    } catch {
      prompt(
        "URLをコピーしてください。",
        url
      );
    }
  }


  /* =========================================================
     REPORT
     ========================================================= */

  function reportPost(postId) {
    state.selectedReportPostId =
      postId;

    navigate("#report");
  }


  async function loadReportPage() {
    const boardSelect =
      $("#report-board-select");

    const postSelect =
      $("#report-post-select");

    const hiddenPost =
      $("#report-post-id");

    const preview =
      $("#report-post-preview");


    const {
      data,
      error
    } =
      await supabase
        .from("posts")
        .select("*")
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


    const posts =
      data || [];


    /*
      掲示板 = カテゴリーとして扱う
    */

    if (boardSelect) {
      const categories =
        [...new Set(
          posts.map(
            post => post.category
          )
        )];


      boardSelect.innerHTML =
        `<option value="">すべて</option>` +
        categories.map(
          category => `
            <option value="${escapeHTML(category)}">
              ${escapeHTML(category)}
            </option>
          `
        ).join("");
    }


    const selectedId =
      state.selectedReportPostId ||
      hiddenPost?.value ||
      "";


    function updatePostOptions() {
      if (!postSelect) return;


      const category =
        boardSelect?.value || "";


      const filtered =
        category
          ? posts.filter(
              post =>
                post.category ===
                category
            )
          : posts;


      postSelect.innerHTML =
        `<option value="">投稿を選択してください</option>` +
        filtered.map(
          post => `
            <option value="${escapeHTML(post.id)}">
              ${escapeHTML(post.title)}
            </option>
          `
        ).join("");


      if (
        selectedId &&
        filtered.some(
          post =>
            post.id === selectedId
        )
      ) {
        postSelect.value =
          selectedId;
      }


      updateReportPreview();
    }


    function updateReportPreview() {
      const id =
        postSelect?.value || "";


      if (hiddenPost) {
        hiddenPost.value = id;
      }


      state.selectedReportPostId =
        id || null;


      const post =
        posts.find(
          item =>
            item.id === id
        );


      if (!preview) return;


      if (!post) {
        preview.innerHTML =
          "投稿を選択してください。";

        return;
      }


      preview.innerHTML = `
        <strong>
          ${escapeHTML(post.title)}
        </strong>

        <p>
          ${escapeHTML(post.content)}
        </p>
      `;
    }


    boardSelect?.addEventListener(
      "change",
      updatePostOptions
    );


    postSelect?.addEventListener(
      "change",
      updateReportPreview
    );


    updatePostOptions();
  }


  async function submitReport(form) {
    if (!state.user) {
      toast(
        "通報するにはログインしてください。",
        "error"
      );

      navigate("#login");

      return;
    }


    const postId =
      $("#report-post-id")?.value ||
      $("#report-post-select")?.value;


    const reason =
      $("#report-reason")?.value;


    const detail =
      $("#report-detail")?.value.trim() ||
      "";


    if (!postId) {
      toast(
        "通報する投稿を選択してください。",
        "error"
      );

      return;
    }


    if (!reason) {
      toast(
        "通報理由を選択してください。",
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
          .from("reports")
          .insert({
            reporter_id:
              state.user.id,

            post_id: postId,

            reason,

            detail,

            status: "pending"
          });


      if (error) {
        throw error;
      }


      form.reset();


      if ($("#report-post-id")) {
        $("#report-post-id").value = "";
      }


      state.selectedReportPostId =
        null;


      toast(
        "通報を送信しました。",
        "success"
      );


      navigate("#home");

    } catch (error) {
      console.error(error);

      toast(
        error.message ||
          "通報を送信できませんでした。",
        "error"
      );

    } finally {
      setLoading(false);
    }
  }


  /* =========================================================
     MY POSTS
     ========================================================= */

  async function loadMyPosts() {
    if (!state.user) {
      navigate("#login");
      return;
    }


    const {
      data,
      error
    } =
      await supabase
        .from("posts")
        .select("*")
        .eq(
          "user_id",
          state.user.id
        )
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


    const list =
      $("#my-post-list");

    const empty =
      $("#my-posts-empty");


    if (!list) return;


    if (!data?.length) {
      list.innerHTML = "";

      if (empty) {
        empty.hidden = false;
      }

      return;
    }


    if (empty) {
      empty.hidden = true;
    }


    list.innerHTML =
      data.map(post => `
        <article class="post-card">

          <span class="post-category">
            ${escapeHTML(post.category)}
          </span>

          <h2>
            ${escapeHTML(post.title)}
          </h2>

          <p>
            ${escapeHTML(post.content)}
          </p>

          <time>
            ${escapeHTML(
              formatDate(post.created_at)
            )}
          </time>

          <button
            type="button"
            class="danger-button"
            data-delete-post="${escapeHTML(post.id)}"
          >
            削除
          </button>

        </article>
      `).join("");
  }


  /* =========================================================
     BOOKMARKS
     ========================================================= */

  async function loadBookmarks() {
    /*
      現在のDBにはbookmarksテーブルがないため、
      ここでは空状態として表示する。
    */

    const list =
      $("#bookmark-list");

    const empty =
      $("#bookmarks-empty");


    if (list) {
      list.innerHTML = "";
    }


    if (empty) {
      empty.hidden = false;
    }
  }


  /* =========================================================
     SEARCH
     ========================================================= */

  async function searchPosts(keyword) {
    const list =
      $("#search-results") ||
      $("#post-list");


    if (!list) return;


    const text =
      keyword.trim();


    if (!text) {
      await loadPosts();
      return;
    }


    const {
      data,
      error
    } =
      await supabase
        .from("posts")
        .select("*")
        .or(
          `title.ilike.%${text}%,content.ilike.%${text}%`
        )
        .order(
          "created_at",
          {
            ascending: false
          }
        );


    if (error) {
      console.error(error);

      toast(
        "検索に失敗しました。",
        "error"
      );

      return;
    }


    state.posts =
      data || [];


    renderPosts();
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
      newPassword !==
      confirmPassword
    ) {
      toast(
        "新しいパスワードが一致しません。",
        "error"
      );

      return;
    }


    setLoading(true);

    try {
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
        throw new Error(
          "現在のパスワードが正しくありません。"
        );
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
        throw error;
      }


      toast(
        "パスワードを変更しました。",
        "success"
      );


      $("#security-form")
        ?.reset();

    } catch (error) {
      console.error(error);

      toast(
        error.message ||
          "パスワードを変更できませんでした。",
        "error"
      );

    } finally {
      setLoading(false);
    }
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
    if (!ensureAdmin()) {
      return;
    }


    setLoading(true);

    try {
      const [
        usersResult,
        postsResult,
        reportsResult,
        bansResult
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
            ),

          supabase
            .from("ip_bans")
            .select("*")
        ]);


      if (usersResult.error) {
        console.error(
          usersResult.error
        );
      }


      if (postsResult.error) {
        console.error(
          postsResult.error
        );
      }


      if (reportsResult.error) {
        console.error(
          reportsResult.error
        );
      }


      state.users =
        usersResult.data || [];

      state.posts =
        postsResult.data || [];

      state.reports =
        reportsResult.data || [];


      renderAdmin(
        bansResult.data || []
      );

    } finally {
      setLoading(false);
    }
  }


  function renderAdmin(bans = []) {
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
      bans.length
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
              user.role ||
              "user"
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
              data-admin-user="${escapeHTML(user.id)}"
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
            data-admin-delete-post="${escapeHTML(post.id)}"
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
            ステータス：
            ${escapeHTML(
              report.status ||
              "pending"
            )}
          </small>

          ${
            report.status === "pending"
              ? `
                <button
                  type="button"
                  class="secondary-button"
                  data-resolve-report="${escapeHTML(report.id)}"
                >
                  対応済みにする
                </button>
              `
              : ""
          }

        </article>
      `).join("");
  }


  async function adminDeletePost(postId) {
    if (!ensureAdmin()) return;


    if (
      !confirm(
        "管理者権限でこの投稿を削除しますか？"
      )
    ) {
      return;
    }


    setLoading(true);

    try {
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
        throw error;
      }


      toast(
        "投稿を削除しました。",
        "success"
      );


      await loadAdminData();

    } catch (error) {
      console.error(error);

      toast(
        "投稿を削除できませんでした。",
        "error"
      );

    } finally {
      setLoading(false);
    }
  }


  async function resolveReport(reportId) {
    if (!ensureAdmin()) return;


    const {
      error
    } =
      await supabase
        .from("reports")
        .update({
          status: "resolved"
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


  async function openAdminUser(userId) {
    const user =
      state.users.find(
        item =>
          item.id === userId
      );


    if (!user) return;


    const input =
      $("#admin-detail-user-id");


    if (input) {
      input.value =
        user.id;
    }


    setText(
      "admin-detail-username",
      user.username ||
        ""
    );


    setText(
      "admin-detail-role",
      user.role ||
        "user"
    );


    navigate(
      "#admin-user-detail"
    );
  }


  /* =========================================================
     BOARD UI
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
     FORMS
     ========================================================= */

  function setupForms() {

    /* LOGIN */

    $("#login-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          login(
            $("#login-email")?.value.trim(),
            $("#login-password")?.value
          );
        }
      );


    /* REGISTER */

    $("#register-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          const password =
            $("#register-password")?.value;

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
            $("#register-username")
              ?.value.trim(),

            $("#register-email")
              ?.value.trim(),

            password
          );
        }
      );


    /* FORGOT PASSWORD */

    $("#forgot-password-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          resetPassword(
            $("#forgot-password-email")
              ?.value.trim()
          );
        }
      );


    /* CREATE POST */

    $("#post-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          createPost(
            event.currentTarget
          );
        }
      );


    /* PROFILE */

    $("#profile-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          saveProfile();
        }
      );


    /* SECURITY */

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


    /* SEARCH */

    $("#search-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          searchPosts(
            $("#search-input")
              ?.value || ""
          );
        }
      );


    /* REPORT */

    $("#report-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          submitReport(
            event.currentTarget
          );
        }
      );


    /* CREATE BOT */

    $("#create-bot-form")
      ?.addEventListener(
        "submit",
        async event => {
          event.preventDefault();

          await createBot();

          closeModal(
            "create-bot-dialog"
          );
        }
      );
  }


  /* =========================================================
     BOT
     ========================================================= */

  async function createBot() {
    if (!ensureAdmin()) return;


    const name =
      $("#bot-name")?.value.trim();

    const description =
      $("#bot-description")
        ?.value.trim() || "";


    if (!name) {
      toast(
        "Bot名を入力してください。",
        "error"
      );

      return;
    }


    try {
      const {
        error
      } =
        await supabase
          .from("bots")
          .insert({
            name,
            description
          });


      if (error) {
        throw error;
      }


      toast(
        "Botを作成しました。",
        "success"
      );

    } catch (error) {
      console.error(error);

      toast(
        "Botを作成できませんでした。",
        "error"
      );
    }
  }


  /* =========================================================
     CLICK EVENTS
     ========================================================= */

  function setupClicks() {
    document.addEventListener(
      "click",
      event => {

        /* data-action */

        const actionTarget =
          event.target.closest(
            "[data-action]"
          );


        if (actionTarget) {
          const action =
            actionTarget.dataset.action;


          if (action === "logout") {
            logout();
            return;
          }


          if (action === "login") {
            navigate("#login");
            return;
          }


          if (
            action ===
            "Create_account"
          ) {
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
          deletePost(
            deleteButton.dataset.deletePost
          );

          return;
        }


        /* ADMIN DELETE */

        const adminDelete =
          event.target.closest(
            "[data-admin-delete-post]"
          );


        if (adminDelete) {
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
          openAdminUser(
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
          resolveReport(
            resolve.dataset
              .resolveReport
          );

          return;
        }


        /* MODAL CLOSE */

        const close =
          event.target.closest(
            "[data-close-modal]"
          );


        if (close) {
          closeModal(
            close.dataset.closeModal
          );

          return;
        }


        /* CREATE BOT */

        if (
          event.target.closest(
            "#create-bot-button"
          )
        ) {
          openModal(
            "create-bot-dialog"
          );

          return;
        }
      }
    );
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
