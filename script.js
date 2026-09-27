/* =========================================================
   KAKIKOMI - script.js
   Supabase版
   ========================================================= */

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://wtlmjaqyphmaeqhipqht.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_Mk4N_TF_cynZ53R7nmUyjQ_JeXsZ_Cs";

  const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  const escapeHTML = (value = "") =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const formatDate = value => {
    const d = new Date(value);

    if (Number.isNaN(d.getTime())) {
      return "";
    }

    return d.toLocaleString("ja-JP");
  };

  const setText = (id, value) => {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value ?? "";
    }
  };

  const state = {
    currentUser: null,
    posts: [],
    replies: {},
    reports: [],
    users: [],
    currentCategory: "all",
    sharePostId: null,

    settings: {
      siteName: "KAKIKOMI",
      siteDescription:
        "みんなで自由に書き込める総合掲示板"
    }
  };


  /* =========================================================
     通知
     ========================================================= */

  function toast(message, type = "normal") {
    const container = $("#toast-container");

    if (!container) {
      return;
    }

    const item = document.createElement("div");

    item.className = `toast toast-${type}`;
    item.textContent = message;

    container.appendChild(item);

    setTimeout(() => {
      item.remove();
    }, 3200);
  }


  /* =========================================================
     カテゴリー
     ========================================================= */

  function categoryName(category) {
    const names = {
      general: "一言",
      one_word: "一言",
      board: "掲示板",
      school: "学校",
      game: "ゲーム",
      hobby: "趣味",
      question: "質問",
      consultation: "相談",
      wish: "願い事",
      joke: "ネタ",
      other: "その他"
    };

    return names[category] || category || "その他";
  }


  /* =========================================================
     現在のユーザー
     ========================================================= */

  async function loadCurrentUser(userId) {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select(`
        id,
        username,
        bio,
        avatar_url,
        role,
        created_at,
        updated_at
      `)
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("profiles error:", error);
      return null;
    }

    if (!data) {
      state.currentUser = null;
      return null;
    }

    state.currentUser = {
      ...data,
      role: data.role || "user"
    };

    return state.currentUser;
  }


  /* =========================================================
     ユーザー一覧
     ========================================================= */

  async function loadUsers() {
    if (state.currentUser?.role !== "admin") {
      return;
    }

    const { data, error } = await supabaseClient
      .from("profiles")
      .select(`
        id,
        username,
        bio,
        avatar_url,
        role,
        created_at
      `)
      .order("created_at", {
        ascending: false
      });

    if (!error) {
      state.users = data || [];
    }
  }


  /* =========================================================
     投稿読み込み
     ========================================================= */

  async function loadPosts() {
    const { data, error } = await supabaseClient
      .from("posts")
      .select(`
        id,
        user_id,
        category,
        title,
        content,
        image_url,
        allow_replies,
        allow_share,
        created_at,
        updated_at,
        profiles:user_id (
          id,
          username,
          bio,
          avatar_url
        )
      `)
      .order("created_at", {
        ascending: false
      });

    if (error) {
      console.error("posts error:", error);
      toast(
        "投稿の読み込みに失敗しました。",
        "error"
      );
      return;
    }

    const posts = data || [];
    const ids = posts.map(post => post.id);

    let likes = [];
    let replies = [];

    if (ids.length) {
      const likesResult = await supabaseClient
        .from("likes")
        .select("post_id,user_id")
        .in("post_id", ids);

      if (!likesResult.error) {
        likes = likesResult.data || [];
      }

      const repliesResult = await supabaseClient
        .from("replies")
        .select(`
          id,
          post_id,
          user_id,
          content,
          created_at,
          profiles:user_id (
            username
          )
        `)
        .in("post_id", ids)
        .order("created_at", {
          ascending: true
        });

      if (!repliesResult.error) {
        replies = repliesResult.data || [];
      }
    }

    const likeMap = {};

    likes.forEach(like => {
      if (!likeMap[like.post_id]) {
        likeMap[like.post_id] = [];
      }

      likeMap[like.post_id].push(like.user_id);
    });

    state.replies = {};

    replies.forEach(reply => {
      if (!state.replies[reply.post_id]) {
        state.replies[reply.post_id] = [];
      }

      state.replies[reply.post_id].push(reply);
    });

    state.posts = posts.map(post => {
      const likedBy = likeMap[post.id] || [];
      const postReplies =
        state.replies[post.id] || [];

      return {
        ...post,

        username:
          post.profiles?.username || "ユーザー",

        likedBy,

        likes: likedBy.length,

        replyCount:
          postReplies.length
      };
    });
  }


  /* =========================================================
     投稿削除権限
     ========================================================= */

  function canDeletePost(post) {
    if (!state.currentUser) {
      return false;
    }

    return (
      post.user_id === state.currentUser.id ||
      state.currentUser.role === "admin"
    );
  }


  /* =========================================================
     投稿表示
     ========================================================= */

  function renderPostList(element, posts) {
    if (!element) {
      return;
    }

    if (!posts.length) {
      element.innerHTML = `
        <p class="no-results">
          投稿はありません。
        </p>
      `;

      return;
    }

    element.innerHTML = posts.map(post => {
      const liked =
        !!state.currentUser &&
        post.likedBy.includes(
          state.currentUser.id
        );

      const replies =
        state.replies[post.id] || [];

      return `
        <article
          class="post-card"
          data-post-id="${escapeHTML(post.id)}"
        >

          <div class="post-card-header">

            <div class="post-user">

              <div class="user-avatar">
                ${escapeHTML(
                  (post.username || "?").slice(0, 1)
                )}
              </div>

              <div class="user-information">

                <span class="username">
                  ${escapeHTML(post.username)}
                </span>

                <time class="post-time">
                  ${escapeHTML(
                    formatDate(post.created_at)
                  )}
                </time>

              </div>

            </div>

            <span class="post-category">
              ${escapeHTML(
                categoryName(post.category)
              )}
            </span>

          </div>


          <div class="post-card-body">

            ${
              post.title
                ? `<h3>${escapeHTML(post.title)}</h3>`
                : ""
            }

            <p class="post-text">
              ${escapeHTML(post.content)}
            </p>

            ${
              post.image_url
                ? `
                  <img
                    src="${escapeHTML(post.image_url)}"
                    alt="投稿画像"
                  >
                `
                : ""
            }

          </div>


          <div class="post-card-footer">

            <button
              type="button"
              class="post-action"
              data-action="like"
              data-post-id="${escapeHTML(post.id)}"
            >
              ${liked ? "いいね済み" : "いいね"}
              <span class="like-count">
                ${post.likes}
              </span>
            </button>


            <button
              type="button"
              class="post-action"
              data-action="reply"
              data-post-id="${escapeHTML(post.id)}"
            >
              返信
              <span class="reply-count">
                ${post.replyCount}
              </span>
            </button>


            ${
              post.allow_share !== false
                ? `
                  <button
                    type="button"
                    class="post-action"
                    data-action="share"
                    data-post-id="${escapeHTML(post.id)}"
                  >
                    共有
                  </button>
                `
                : ""
            }


            <button
              type="button"
              class="post-action"
              data-action="report"
              data-post-id="${escapeHTML(post.id)}"
            >
              通報
            </button>


            ${
              canDeletePost(post)
                ? `
                  <button
                    type="button"
                    class="post-action"
                    data-action="delete"
                    data-post-id="${escapeHTML(post.id)}"
                  >
                    削除
                  </button>
                `
                : ""
            }

          </div>


          <div class="post-replies">

            ${
              replies.length
                ? replies.map(reply => `
                    <div class="reply-item">

                      <strong>
                        ${escapeHTML(
                          reply.profiles?.username ||
                          "ユーザー"
                        )}
                      </strong>

                      <span>
                        ${escapeHTML(
                          formatDate(reply.created_at)
                        )}
                      </span>

                      <p>
                        ${escapeHTML(reply.content)}
                      </p>

                    </div>
                  `).join("")
                : ""
            }

          </div>

        </article>
      `;
    }).join("");
  }


  /* =========================================================
     投稿表示
     ========================================================= */

  function renderPosts() {
    const posts =
      state.posts.filter(post => {
        return (
          state.currentCategory === "all" ||
          post.category === state.currentCategory
        );
      });

    renderPostList(
      $("#post-list"),
      posts
    );

    renderPostList(
      $("#question-list"),
      state.posts.filter(
        post => post.category === "質問"
      )
    );

    renderPostList(
      $("#consultation-list"),
      state.posts.filter(
        post => post.category === "相談"
      )
    );

    const noPosts = $("#no-posts");

    if (noPosts) {
      noPosts.hidden = posts.length > 0;
    }

    renderAccount();
  }


  /* =========================================================
     アカウント表示
     ========================================================= */

  function renderAccount() {
    const guest =
      $("#guest-account");

    const loggedIn =
      $("#logged-in-account");

    if (guest) {
      guest.hidden = !!state.currentUser;
    }

    if (loggedIn) {
      loggedIn.hidden =
        !state.currentUser;
    }

    if (!state.currentUser) {
      return;
    }

    setText(
      "account-username",
      state.currentUser.username
    );

    setText(
      "account-user-id",
      state.currentUser.id
    );

    setText(
      "profile-name",
      state.currentUser.username
    );

    setText(
      "profile-description",
      state.currentUser.bio ||
        "プロフィールはまだありません。"
    );

    setText(
      "profile-post-count",
      state.posts.filter(
        post =>
          post.user_id ===
          state.currentUser.id
      ).length
    );

    const username =
      $("#settings-username");

    const bio =
      $("#settings-bio");

    if (
      username &&
      document.activeElement !== username
    ) {
      username.value =
        state.currentUser.username || "";
    }

    if (
      bio &&
      document.activeElement !== bio
    ) {
      bio.value =
        state.currentUser.bio || "";
    }
  }


  function updateHeader() {
    const accountButton =
      $("#account-button");

    if (!accountButton) {
      return;
    }

    accountButton.textContent =
      state.currentUser
        ? `アカウント (${state.currentUser.username})`
        : "アカウント";
  }


  /* =========================================================
     ページ移動
     ========================================================= */

  function showSection(id) {
    $$("main > section").forEach(
      section => {
        section.hidden = true;
      }
    );

    const target =
      document.getElementById(id);

    if (target) {
      target.hidden = false;

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });

      return;
    }

    const error =
      $("#error-page");

    if (error) {
      error.hidden = false;
    }
  }


  function route() {
    let hash =
      location.hash.replace(/^#/, "") ||
      "home";


    /* カテゴリー */

    if (hash.startsWith("category-")) {

      const categories = {
        "category-one-word": "一言",
        "category-board": "掲示板",
        "category-question": "質問",
        "category-consultation": "相談",
        "category-wish": "願い事",
        "category-joke": "ネタ",
        "category-other": "その他"
      };

      state.currentCategory =
        categories[hash] || "all";

      const select =
        $("#board-category");

      if (select) {
        select.value =
          state.currentCategory;
      }

      renderPosts();

      showSection("board");

      return;
    }


    /* 投稿共有URL */

    if (hash.startsWith("post-")) {

      const postId =
        decodeURIComponent(
          hash.slice(5)
        );

      state.currentCategory = "all";

      const select =
        $("#board-category");

      if (select) {
        select.value = "all";
      }

      showSection("board");

      renderPosts();

      setTimeout(() => {

        const post =
          document.querySelector(
            `[data-post-id="${CSS.escape(postId)}"]`
          );

        if (post) {
          post.scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
        }

      }, 100);

      return;
    }


    /* Admin */

    if (hash === "admin-page") {

      if (
        !state.currentUser ||
        state.currentUser.role !== "admin"
      ) {
        toast(
          "Admin権限が必要です。",
          "error"
        );

        location.hash = "#login";
        return;
      }

      renderAdmin();
    }


    showSection(hash);
  }


  /* =========================================================
     ログイン
     ========================================================= */

  async function login(email, password) {

    email =
      email.trim().toLowerCase();

    const {
      data,
      error
    } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });


    if (error || !data?.user) {

      console.error(error);

      if (
        error?.message ===
        "Email not confirmed"
      ) {

        toast(
          "メールアドレスの確認がまだです。",
          "error"
        );

      } else if (
        error?.message ===
        "Invalid login credentials"
      ) {

        toast(
          "メールアドレスまたはパスワードが違います。",
          "error"
        );

      } else {

        toast(
          error?.message ||
            "ログインに失敗しました。",
          "error"
        );
      }

      return false;
    }


    await loadCurrentUser(
      data.user.id
    );


    if (!state.currentUser) {

      toast(
        "プロフィールが見つかりません。",
        "error"
      );

      return false;
    }


    await loadPosts();


    renderAccount();
    updateHeader();
    renderPosts();


    if (
      state.currentUser.role === "admin" &&
      email === "loqaqjfxecre@admin.page"
    ) {

      toast(
        "Adminとしてログインしました。",
        "success"
      );

      location.hash =
        "#admin-page";

    } else {

      toast(
        "ログインしました。",
        "success"
      );

      location.hash =
        "#home";
    }

    return true;
  }


  /* =========================================================
     アカウント作成
     ========================================================= */

  async function register(
    username,
    email,
    password
  ) {

    email =
      email.trim().toLowerCase();


    const {
      data,
      error
    } =
      await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            username
          }
        }
      });


    if (
      error ||
      !data?.user
    ) {

      toast(
        error?.message ||
          "アカウント作成に失敗しました。",
        "error"
      );

      return false;
    }


    const {
      error: profileError
    } =
      await supabaseClient
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
        "プロフィール作成に失敗しました。",
        "error"
      );

      return false;
    }


    if (data.session) {

      await loadCurrentUser(
        data.user.id
      );

      await loadPosts();

      renderAccount();
      updateHeader();
      renderPosts();

      toast(
        "アカウントを作成しました。",
        "success"
      );

      location.hash = "#home";

    } else {

      toast(
        "登録しました。メール確認が必要な場合は、メールを確認してください。",
        "success"
      );

      location.hash = "#login";
    }

    return true;
  }


  /* =========================================================
     ログアウト
     ========================================================= */

  async function logout() {

    await supabaseClient.auth.signOut();

    state.currentUser = null;

    renderAccount();
    updateHeader();
    renderPosts();

    location.hash = "#home";

    toast(
      "ログアウトしました。"
    );
  }


  /* =========================================================
     投稿作成
     ========================================================= */

  async function createPost(form) {

    if (!state.currentUser) {

      toast(
        "投稿するにはログインしてください。",
        "error"
      );

      location.hash = "#login";

      return;
    }


    const category =
      $("#post-category")?.value ||
      "その他";

    const title =
      $("#post-title")?.value.trim() ||
      "";

    const content =
      $("#post-content")?.value.trim() ||
      "";


    if (!content) {

      toast(
        "本文を入力してください。",
        "error"
      );

      return;
    }


    const {
      error
    } =
      await supabaseClient
        .from("posts")
        .insert({
          user_id:
            state.currentUser.id,

          category,

          title,

          content,

          image_url: null,

          allow_replies:
            $("#allow-replies")
              ?.checked !== false,

          allow_share:
            $("#allow-share")
              ?.checked !== false
        });


    if (error) {

      console.error(error);

      toast(
        "投稿に失敗しました。",
        "error"
      );

      return;
    }


    form.reset();

    await loadPosts();

    renderPosts();

    toast(
      "投稿しました。",
      "success"
    );

    location.hash = "#board";
  }


  /* =========================================================
     いいね
     ========================================================= */

  async function toggleLike(postId) {

    if (!state.currentUser) {

      toast(
        "いいねするにはログインしてください。",
        "error"
      );

      location.hash = "#login";

      return;
    }


    const post =
      state.posts.find(
        p => p.id === postId
      );

    if (!post) {
      return;
    }


    const liked =
      post.likedBy.includes(
        state.currentUser.id
      );


    let result;


    if (liked) {

      result =
        await supabaseClient
          .from("likes")
          .delete()
          .eq("post_id", postId)
          .eq(
            "user_id",
            state.currentUser.id
          );

    } else {

      result =
        await supabaseClient
          .from("likes")
          .insert({
            post_id: postId,
            user_id:
              state.currentUser.id
          });
    }


    if (result.error) {

      console.error(result.error);

      toast(
        liked
          ? "いいねの解除に失敗しました。"
          : "いいねに失敗しました。",
        "error"
      );

      return;
    }


    await loadPosts();

    renderPosts();
  }


  /* =========================================================
     返信
     ========================================================= */

  async function replyToPost(postId) {

    if (!state.currentUser) {

      toast(
        "返信するにはログインしてください。",
        "error"
      );

      location.hash = "#login";

      return;
    }


    const post =
      state.posts.find(
        p => p.id === postId
      );

    if (!post) {
      return;
    }


    if (!post.allow_replies) {

      toast(
        "この投稿は返信を受け付けていません。",
        "error"
      );

      return;
    }


    const content =
      window.prompt(
        "返信内容を入力してください。"
      );


    if (!content?.trim()) {
      return;
    }


    const {
      error
    } =
      await supabaseClient
        .from("replies")
        .insert({
          post_id: postId,

          user_id:
            state.currentUser.id,

          content:
            content.trim()
        });


    if (error) {

      console.error(error);

      toast(
        "返信に失敗しました。",
        "error"
      );

      return;
    }


    await loadPosts();

    renderPosts();

    toast(
      "返信しました。",
      "success"
    );
  }


  /* =========================================================
     共有URL
     ========================================================= */

  function getShareUrl(postId) {

    return (
      `${location.origin}` +
      `${location.pathname}` +
      `#post-${encodeURIComponent(postId)}`
    );
  }


  function openShare(postId) {

    state.sharePostId =
      postId;

    const input =
      $("#share-url");

    if (input) {
      input.value =
        getShareUrl(postId);
    }

    location.hash =
      "#share";
  }


  async function copyShareUrl() {

    const input =
      $("#share-url");

    let url =
      input?.value || "";


    if (
      !url &&
      state.sharePostId
    ) {
      url =
        getShareUrl(
          state.sharePostId
        );
    }


    if (!url) {

      toast(
        "共有URLがありません。",
        "error"
      );

      return;
    }


    try {

      await navigator.clipboard.writeText(
        url
      );

    } catch {

      input?.select();

      document.execCommand(
        "copy"
      );
    }


    toast(
      "URLをコピーしました。",
      "success"
    );
  }


  /* =========================================================
     通報
     ========================================================= */

  function openReport(postId) {

    if (!state.currentUser) {

      toast(
        "通報するにはログインしてください。",
        "error"
      );

      location.hash = "#login";

      return;
    }


    const input =
      $("#report-post-id");

    const modalInput =
      $("#modal-report-post-id");


    if (input) {
      input.value =
        postId;
    }

    if (modalInput) {
      modalInput.value =
        postId;
    }


    location.hash =
      "#report";
  }


  async function submitReport(
    postId,
    reason,
    detail
  ) {

    if (!state.currentUser) {

      toast(
        "通報するにはログインしてください。",
        "error"
      );

      return;
    }


    const {
      error
    } =
      await supabaseClient
        .from("reports")
        .insert({
          post_id: postId,

          reporter_id:
            state.currentUser.id,

          reason,

          detail:
            detail || null,

          status:
            "pending"
        });


    if (error) {

      console.error(error);

      toast(
        "通報の保存に失敗しました。",
        "error"
      );

      return;
    }


    toast(
      "通報しました。",
      "success"
    );

    location.hash =
      "#board";
  }


  /* =========================================================
     投稿削除
     ========================================================= */

  async function deletePost(postId) {

    const post =
      state.posts.find(
        p => p.id === postId
      );

    if (
      !post ||
      !canDeletePost(post)
    ) {
      return;
    }


    if (
      !confirm(
        "この投稿を削除しますか？"
      )
    ) {
      return;
    }


    await supabaseClient
      .from("likes")
      .delete()
      .eq(
        "post_id",
        postId
      );


    await supabaseClient
      .from("replies")
      .delete()
      .eq(
        "post_id",
        postId
      );


    const {
      error
    } =
      await supabaseClient
        .from("posts")
        .delete()
        .eq(
          "id",
          postId
        );


    if (error) {

      console.error(error);

      toast(
        "削除に失敗しました。",
        "error"
      );

      return;
    }


    await loadPosts();

    renderPosts();

    toast(
      "投稿を削除しました。",
      "success"
    );
  }


  /* =========================================================
     プロフィール
     ========================================================= */

  async function saveProfile() {

    if (!state.currentUser) {
      return;
    }


    const username =
      $("#settings-username")
        ?.value.trim();

    const bio =
      $("#settings-bio")
        ?.value.trim() || "";


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
      await supabaseClient
        .from("profiles")
        .update({
          username,
          bio,
          updated_at:
            new Date().toISOString()
        })
        .eq(
          "id",
          state.currentUser.id
        );


    if (error) {

      toast(
        "プロフィール更新に失敗しました。",
        "error"
      );

      return;
    }


    await loadCurrentUser(
      state.currentUser.id
    );

    renderAccount();
    updateHeader();

    toast(
      "プロフィールを保存しました。",
      "success"
    );
  }


  /* =========================================================
     パスワード変更
     ========================================================= */

  async function changePassword() {

    const password =
      $("#new-password")?.value ||
      "";

    const confirmPassword =
      $("#new-password-confirm")?.value ||
      "";


    if (
      !password ||
      password !== confirmPassword
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
      await supabaseClient.auth.updateUser({
        password
      });


    if (error) {

      toast(
        error.message,
        "error"
      );

      return;
    }


    $("#change-password-form")?.reset();

    toast(
      "パスワードを変更しました。",
      "success"
    );
  }


  /* =========================================================
     Admin
     ========================================================= */

  function ensureAdmin() {

    if (
      state.currentUser?.role !==
      "admin"
    ) {

      toast(
        "Admin権限が必要です。",
        "error"
      );

      location.hash =
        "#home";

      return false;
    }

    return true;
  }


  async function renderAdmin() {

    if (!ensureAdmin()) {
      return;
    }


    await loadUsers();


    const {
      data
    } =
      await supabaseClient
        .from("reports")
        .select(`
          id,
          post_id,
          reporter_id,
          reason,
          detail,
          status,
          created_at
        `)
        .order(
          "created_at",
          {
            ascending: false
          }
        );


    state.reports =
      data || [];


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
        r => r.status === "pending"
      ).length
    );

    setText(
      "admin-ban-count",
      0
    );


    renderAdminUsers();
    renderAdminPosts();
    renderAdminReports();
  }


  function renderAdminUsers(query = "") {

    const body =
      $("#admin-users-table-body");

    if (!body) {
      return;
    }


    const q =
      query.trim().toLowerCase();


    const users =
      state.users.filter(user => {

        return (
          !q ||
          user.username
            .toLowerCase()
            .includes(q) ||
          user.id
            .toLowerCase()
            .includes(q)
        );

      });


    body.innerHTML =
      users.map(user => `
        <tr>

          <td>
            ${escapeHTML(user.username)}
          </td>

          <td>
            ${escapeHTML(user.id)}
          </td>

          <td>
            ${escapeHTML(
              user.role || "user"
            )}
          </td>

          <td>
            ${escapeHTML(
              formatDate(user.created_at)
            )}
          </td>

          <td>

            <button
              type="button"
              class="secondary-button"
              data-admin-user="${escapeHTML(user.id)}"
            >
              管理
            </button>

          </td>

        </tr>
      `).join("");
  }


  function renderAdminPosts() {

    const box =
      $("#admin-post-list");

    if (!box) {
      return;
    }


    box.innerHTML =
      state.posts.map(post => `
        <article
          class="admin-post-item"
        >

          <strong>
            ${escapeHTML(
              post.title || "無題"
            )}
          </strong>

          <p>
            ${escapeHTML(
              post.content
            )}
          </p>

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

    const box =
      $("#admin-report-list");

    if (!box) {
      return;
    }


    box.innerHTML =
      state.reports.map(report => `
        <article
          class="report-item"
        >

          <h3>
            ${escapeHTML(
              report.reason
            )}
          </h3>

          <p>
            ${escapeHTML(
              report.detail ||
              "詳細なし"
            )}
          </p>

          <p>
            投稿ID:
            ${escapeHTML(
              report.post_id
            )}
          </p>

          <p>
            状態:
            ${escapeHTML(
              report.status
            )}
          </p>

          <button
            type="button"
            data-report-status="resolved"
            data-report-id="${escapeHTML(report.id)}"
          >
            解決済み
          </button>

          <button
            type="button"
            data-report-status="rejected"
            data-report-id="${escapeHTML(report.id)}"
          >
            却下
          </button>

        </article>
      `).join("");
  }


  /* =========================================================
     フォーム
     ========================================================= */

  function bindForms() {

    $("#login-form")
      ?.addEventListener(
        "submit",
        event => {

          event.preventDefault();

          login(
            $("#login-email")?.value ||
              "",

            $("#login-password")?.value ||
              ""
          );

        }
      );


    $("#register-form")
      ?.addEventListener(
        "submit",
        event => {

          event.preventDefault();


          const password =
            $("#register-password")
              ?.value || "";

          const confirmPassword =
            $("#register-password-confirm")
              ?.value || "";


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


          if (
            !$("#agree-rules")
              ?.checked
          ) {

            toast(
              "利用規約に同意してください。",
              "error"
            );

            return;
          }


          register(
            $("#register-username")
              ?.value.trim() || "",

            $("#register-email")
              ?.value || "",

            password
          );

        }
      );


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


    $("#report-form")
      ?.addEventListener(
        "submit",
        async event => {

          event.preventDefault();

          await submitReport(
            $("#report-post-id")
              ?.value || "",

            $("#report-reason")
              ?.value || "",

            $("#report-detail")
              ?.value.trim() || ""
          );

          event.currentTarget.reset();
        }
      );


    $("#modal-report-form")
      ?.addEventListener(
        "submit",
        async event => {

          event.preventDefault();

          await submitReport(
            $("#modal-report-post-id")
              ?.value || "",

            $("#modal-report-reason")
              ?.value || "",

            $("#modal-report-detail")
              ?.value.trim() || ""
          );

          $("#report-dialog")?.close();

          event.currentTarget.reset();
        }
      );


    $("#profile-settings-form")
      ?.addEventListener(
        "submit",
        event => {

          event.preventDefault();

          saveProfile();
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


    $("#search-form")
      ?.addEventListener(
        "submit",
        event => {

          event.preventDefault();

          const query =
            $("#search-input")
              ?.value
              .trim()
              .toLowerCase() || "";


          const results =
            state.posts.filter(post => {

              const target =
                `${post.title} ${post.content} ${post.username}`
                  .toLowerCase();

              return target.includes(query);
            });


          renderPostList(
            $("#search-results"),
            results
          );

          location.hash =
            "#search";
        }
      );


    $("#admin-user-search-form")
      ?.addEventListener(
        "submit",
        event => {

          event.preventDefault();

          if (
            ensureAdmin()
          ) {

            renderAdminUsers(
              $("#admin-user-search")
                ?.value || ""
            );
          }
        }
      );


    $("#admin-user-settings-form")
      ?.addEventListener(
        "submit",
        async event => {

          event.preventDefault();

          if (!ensureAdmin()) {
            return;
          }


          const id =
            $("#admin-target-user-id")
              ?.value;


          const username =
            $("#admin-target-username")
              ?.value.trim();


          const {
            error
          } =
            await supabaseClient
              .from("profiles")
              .update({
                username
              })
              .eq("id", id);


          if (error) {

            toast(
              "設定保存に失敗しました。",
              "error"
            );

            return;
          }


          await renderAdmin();

          toast(
            "設定を保存しました。",
            "success"
          );
        }
      );


    $("#admin-site-settings-form")
      ?.addEventListener(
        "submit",
        event => {

          event.preventDefault();

          if (!ensureAdmin()) {
            return;
          }


          state.settings.siteName =
            $("#site-name")
              ?.value.trim() ||
            "KAKIKOMI";


          document.title =
            state.settings.siteName;


          toast(
            "設定を保存しました。",
            "success"
          );
        }
      );


    $("#delete-account-form")
      ?.addEventListener(
        "submit",
        async event => {

          event.preventDefault();

          if (!state.currentUser) {
            return;
          }


          if (
            !confirm(
              "アカウントを削除しますか？"
            )
          ) {
            return;
          }


          await supabaseClient
            .from("posts")
            .delete()
            .eq(
              "user_id",
              state.currentUser.id
            );


          await supabaseClient.auth.signOut();

          state.currentUser =
            null;

          location.hash =
            "#home";

          location.reload();
        }
      );
  }


  /* =========================================================
     クリック
     ========================================================= */

  function bindClicks() {

    document.addEventListener(
      "click",
      async event => {

        const action =
          event.target.closest(
            "[data-action]"
          );


        if (action) {

          const postId =
            action.dataset.postId;

          const type =
            action.dataset.action;


          if (type === "like") {
            await toggleLike(postId);
          }

          if (type === "reply") {
            await replyToPost(postId);
          }

          if (type === "share") {
            openShare(postId);
          }

          if (type === "report") {
            openReport(postId);
          }

          if (type === "delete") {
            await deletePost(postId);
          }

          return;
        }


        /* カテゴリー */

        const category =
          event.target.closest(
            "[data-category]"
          );


        if (category) {

          event.preventDefault();

          state.currentCategory =
            category.dataset.category;


          const select =
            $("#board-category");

          if (select) {
            select.value =
              state.currentCategory;
          }


          renderPosts();

          location.hash =
            "#board";

          return;
        }


        /* ログアウト */

        if (
          event.target.closest(
            "#logout-button"
          )
        ) {

          await logout();

          return;
        }


        /* 共有 */

        if (
          event.target.closest(
            "#copy-share-url"
          ) ||
          event.target.closest(
            '[data-share="copy"]'
          )
        ) {

          await copyShareUrl();

          return;
        }


        if (
          event.target.closest(
            '[data-share="native"]'
          )
        ) {

          const url =
            $("#share-url")
              ?.value || "";


          if (
            navigator.share
          ) {

            navigator.share({
              title: "KAKIKOMI",
              url
            }).catch(() => {});

          } else {

            await copyShareUrl();
          }

          return;
        }


        /* Adminユーザー */

        const adminUser =
          event.target.closest(
            "[data-admin-user]"
          );


        if (
          adminUser &&
          ensureAdmin()
        ) {

          const user =
            state.users.find(
              item =>
                item.id ===
                adminUser.dataset.adminUser
            );


          if (!user) {
            return;
          }


          $("#admin-target-user-id")
            .value = user.id;

          $("#admin-target-username")
            .value = user.username;


          location.hash =
            "#admin-user-detail";

          return;
        }


        /* Admin投稿削除 */

        const adminDelete =
          event.target.closest(
            "[data-admin-delete-post]"
          );


        if (
          adminDelete &&
          ensureAdmin()
        ) {

          await deletePost(
            adminDelete.dataset.adminDeletePost
          );

          await renderAdmin();

          return;
        }


        /* 通報ステータス */

        const reportButton =
          event.target.closest(
            "[data-report-status]"
          );


        if (
          reportButton &&
          ensureAdmin()
        ) {

          await supabaseClient
            .from("reports")
            .update({
              status:
                reportButton
                  .dataset
                  .reportStatus,

              updated_at:
                new Date().toISOString()
            })
            .eq(
              "id",
              reportButton
                .dataset
                .reportId
            );


          await renderAdmin();

          return;
        }

      }
    );
  }


  /* =========================================================
     ナビゲーション
     ========================================================= */

  function bindNavigation() {

    window.addEventListener(
      "hashchange",
      route
    );


    const select =
      $("#board-category");


    if (select) {

      select.addEventListener(
        "change",
        () => {

          state.currentCategory =
            select.value || "all";

          renderPosts();
        }
      );
    }
  }


  /* =========================================================
     Supabase Auth
     ========================================================= */

  function bindAuthListener() {

    supabaseClient.auth.onAuthStateChange(
      (event, session) => {

        setTimeout(
          async () => {

            if (
              event ===
              "SIGNED_OUT"
            ) {

              state.currentUser =
                null;

            } else if (
              session?.user
            ) {

              await loadCurrentUser(
                session.user.id
              );
            }


            await loadPosts();

            renderAccount();
            updateHeader();
            renderPosts();

          },
          0
        );
      }
    );
  }


  /* =========================================================
     起動
     ========================================================= */

  async function init() {

    /*
      ここが再読み込み対策。
      Supabaseに保存されているセッションを取得する。
    */

    const {
      data
    } =
      await supabaseClient.auth
        .getSession();


    if (
      data.session?.user
    ) {

      await loadCurrentUser(
        data.session.user.id
      );
    }


    await loadPosts();


    bindForms();
    bindClicks();
    bindNavigation();
    bindAuthListener();


    if (
      state.currentUser?.role ===
      "admin"
    ) {

      await renderAdmin();
    }


    renderAccount();
    updateHeader();
    renderPosts();
    route();
  }


  /* =========================================================
     デバッグ用
     ========================================================= */

  window.KAKIKOMI = {
    state,
    login,
    logout,
    createPost,
    renderPosts,
    renderAdmin
  };


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );

  } else {

    init();
  }

})();
