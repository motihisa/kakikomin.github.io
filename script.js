/* =========================================================
   KAKIKOMI - script.js
   Supabase対応版
   ========================================================= */

(() => {
  "use strict";

  /* =========================================================
     Supabase
     ========================================================= */

  const SUPABASE_URL =
    "https://wtlmjaqyphmaeqhipqht.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_Mk4N_TF_cynZ53R7nmUyjQ_JeXsZ_Cs";

  let supabaseClient = null;
  let supabaseReady = false;

  /*
   * HTML側にSupabaseのscriptタグがなくても、
   * script.jsだけでSupabase JSを読み込む。
   */
  function loadSupabaseLibrary() {
    return new Promise((resolve, reject) => {
      if (
        window.supabase &&
        typeof window.supabase.createClient === "function"
      ) {
        resolve();
        return;
      }

      const existing = document.querySelector(
        'script[src*="supabase-js"]'
      );

      if (existing) {
        existing.addEventListener("load", resolve, { once: true });

        existing.addEventListener(
          "error",
          () => {
            reject(
              new Error("Supabase JSの読み込みに失敗しました。")
            );
          },
          { once: true }
        );

        return;
      }

      const script = document.createElement("script");

      script.src =
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

      script.async = true;

      script.onload = () => resolve();

      script.onerror = () => {
        reject(
          new Error("Supabase JSの読み込みに失敗しました。")
        );
      };

      document.head.appendChild(script);
    });
  }

  async function initSupabase() {
    if (supabaseReady && supabaseClient) {
      return true;
    }

    await loadSupabaseLibrary();

    if (
      !window.supabase ||
      typeof window.supabase.createClient !== "function"
    ) {
      throw new Error("Supabase JSが利用できません。");
    }

    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    );

    supabaseReady = true;

    console.log("Supabase connected");

    return true;
  }

  /* =========================================================
     Utility
     ========================================================= */

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  const state = {
    currentUser: null,

    posts: [],

    reports: [],

    notifications: [],

    users: [],

    privateBoards: [],

    bots: [],

    ipBans: [],

    settings: {
      siteName: "KAKIKOMI",

      siteDescription:
        "みんなで自由に書き込める総合掲示板",

      registrationEnabled: true,

      postingEnabled: true,

      maintenanceMode: false
    },

    currentCategory: "all"
  };

  const uid = (prefix = "id") =>
    `${prefix}_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;

  function escapeHTML(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(date) {
    const d = new Date(date);

    if (Number.isNaN(d.getTime())) {
      return "";
    }

    return d.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value;
    }
  }

  function toast(message, type = "normal") {
    const container = $("#toast-container");

    if (!container) {
      console.log(message);
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

  function showLoading(show) {
    const loading = $("#global-loading");

    if (!loading) {
      return;
    }

    loading.hidden = !show;

    loading.setAttribute(
      "aria-hidden",
      String(!show)
    );
  }

  /* =========================================================
     State
     ========================================================= */

  async function saveState() {
    /*
     * 投稿・いいね・返信などはSupabaseへ直接保存するため、
     * localStorageには保存しない。
     */
    return true;
  }

  async function loadState() {
    state.posts = [];

    state.users = [];

    state.reports ||= [];

    state.notifications ||= [];

    state.privateBoards ||= [];

    state.bots ||= [];

    state.ipBans ||= [];

    if (!supabaseClient) {
      return;
    }

    const {
      data: sessionData,
      error: sessionError
    } = await supabaseClient.auth.getSession();

    if (sessionError) {
      console.error(
        "session error:",
        sessionError
      );
    }

    const sessionUser =
      sessionData?.session?.user || null;

    if (sessionUser) {
      await loadCurrentUser(sessionUser.id);
    }

    await loadPosts();
  }

  /* =========================================================
     User
     ========================================================= */

  async function loadCurrentUser(userId) {
    if (!supabaseClient || !userId) {
      return null;
    }

    const {
      data,
      error
    } = await supabaseClient
      .from("profiles")
      .select(
        "id, username, bio, avatar_url, created_at, updated_at"
      )
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error(
        "profiles load error:",
        error
      );

      return null;
    }

    if (!data) {
      state.currentUser = null;

      return null;
    }

    state.currentUser = {
      ...data,

      role: "user",

      status: "active",

      forcePasswordChange: false,

      disablePosting: false,

      disableReplies: false,

      followers: 0,

      following: 0
    };

    state.users = [state.currentUser];

    return state.currentUser;
  }

  /* =========================================================
     Posts
     ========================================================= */

  async function loadPosts() {
    if (!supabaseClient) {
      return;
    }

    const {
      data,
      error
    } = await supabaseClient
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
      console.error(
        "posts load error:",
        error
      );

      toast(
        "投稿の読み込みに失敗しました。",
        "error"
      );

      return;
    }

    const postIds =
      (data || []).map(
        post => post.id
      );

    let likes = [];

    if (postIds.length) {
      const result =
        await supabaseClient
          .from("likes")
          .select(
            "post_id, user_id"
          )
          .in(
            "post_id",
            postIds
          );

      if (!result.error) {
        likes =
          result.data || [];
      }
    }

    const likeMap =
      new Map();

    for (const like of likes) {
      if (
        !likeMap.has(
          like.post_id
        )
      ) {
        likeMap.set(
          like.post_id,
          []
        );
      }

      likeMap
        .get(like.post_id)
        .push(like.user_id);
    }

    let replies = [];

    if (postIds.length) {
      const result =
        await supabaseClient
          .from("replies")
          .select("post_id")
          .in(
            "post_id",
            postIds
          );

      if (!result.error) {
        replies =
          result.data || [];
      }
    }

    const replyMap =
      new Map();

    for (const reply of replies) {
      replyMap.set(
        reply.post_id,
        (replyMap.get(
          reply.post_id
        ) || 0) + 1
      );
    }

    state.posts =
      (data || []).map(
        post => {
          const likedBy =
            likeMap.get(
              post.id
            ) || [];

          return {
            id: post.id,

            userId: post.user_id,

            username:
              post.profiles?.username ||
              "ユーザー",

            category:
              post.category,

            title:
              post.title,

            content:
              post.content,

            imageUrl:
              post.image_url,

            createdAt:
              post.created_at,

            updatedAt:
              post.updated_at,

            likes:
              likedBy.length,

            likedBy,

            replies:
              replyMap.get(
                post.id
              ) || 0,

            allowReplies:
              post.allow_replies,

            allowShare:
              post.allow_share
          };
        }
      );

    renderPosts();
  }

  function seedData() {
    /*
     * ダミー投稿は作らない。
     * 投稿はSupabaseから取得する。
     */
  }

  function categoryName(category) {
    const names = {
      general: "雑談",
      school: "学校",
      game: "ゲーム",
      hobby: "趣味",
      question: "質問",
      consultation: "相談",
      other: "その他"
    };

    return (
      names[category] ||
      category ||
      "その他"
    );
  }

  function canDeletePost(post) {
    return Boolean(
      state.currentUser &&
      (
        post.userId ===
          state.currentUser.id ||
        state.currentUser.role ===
          "admin"
      )
    );
  }

  /* =========================================================
     Render posts
     ========================================================= */

  function renderPosts() {
    const list =
      $("#post-list");

    if (!list) {
      return;
    }

    const category =
      state.currentCategory;

    const posts =
      state.posts.filter(
        post =>
          category === "all"
            ? true
            : post.category ===
              category
      );

    list.innerHTML = "";

    const sample =
      $("#sample-post-1");

    if (sample) {
      sample.hidden = true;
    }

    const empty =
      $("#no-posts");

    if (!posts.length) {
      if (empty) {
        empty.hidden = false;
      }

      return;
    }

    if (empty) {
      empty.hidden = true;
    }

    posts.forEach(post => {
      const card =
        document.createElement(
          "article"
        );

      card.className =
        "post-card";

      card.dataset.postId =
        post.id;

      const liked =
        state.currentUser &&
        (
          post.likedBy || []
        ).includes(
          state.currentUser.id
        );

      card.innerHTML = `
        <div class="post-card-header">

          <div class="post-user">

            <div class="user-avatar">
              ${escapeHTML(
                (
                  post.username ||
                  "?"
                ).slice(0, 1)
              )}
            </div>

            <div class="user-information">

              <span class="username">
                ${escapeHTML(
                  post.username ||
                  "ユーザー"
                )}
              </span>

              <time class="post-time">
                ${escapeHTML(
                  formatDate(
                    post.createdAt
                  )
                )}
              </time>

            </div>

          </div>

          <span class="post-category">
            ${escapeHTML(
              categoryName(
                post.category
              )
            )}
          </span>

        </div>

        <div class="post-card-body">

          ${
            post.title
              ? `<h3>${escapeHTML(
                  post.title
                )}</h3>`
              : ""
          }

          <p class="post-text">
            ${escapeHTML(
              post.content || ""
            )}
          </p>

          ${
            post.imageUrl
              ? `
                <img
                  class="post-image"
                  src="${escapeHTML(
                    post.imageUrl
                  )}"
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
            data-post-id="${escapeHTML(
              post.id
            )}"
          >
            ${
              liked
                ? "いいね済み"
                : "いいね"
            }

            <span class="like-count">
              ${post.likes || 0}
            </span>

          </button>

          ${
            post.allowReplies !== false
              ? `
                <button
                  type="button"
                  class="post-action"
                  data-action="reply"
                  data-post-id="${escapeHTML(
                    post.id
                  )}"
                >
                  返信

                  <span class="reply-count">
                    ${post.replies || 0}
                  </span>

                </button>
              `
              : ""
          }

          ${
            post.allowShare !== false
              ? `
                <button
                  type="button"
                  class="post-action"
                  data-action="share"
                  data-post-id="${escapeHTML(
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
            data-action="report"
            data-post-id="${escapeHTML(
              post.id
            )}"
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
                  data-post-id="${escapeHTML(
                    post.id
                  )}"
                >
                  削除
                </button>
              `
              : ""
          }

        </div>
      `;

      list.appendChild(card);
    });
  }

  /* =========================================================
     Navigation
     ========================================================= */

  function navigate(hash) {
    if (!hash.startsWith("#")) {
      hash = `#${hash}`;
    }

    if (
      location.hash !== hash
    ) {
      location.hash = hash;
    } else {
      renderRoute();
    }
  }

  function renderRoute() {
    const raw =
      location.hash.replace(
        /^#/,
        ""
      ) || "home";

    const target =
      document.getElementById(
        raw
      );

    $$("main > section")
      .forEach(section => {
        section.hidden = true;
      });

    if (target) {
      target.hidden = false;

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    } else {
      const error =
        $("#error-page");

      if (error) {
        error.hidden = false;
      }
    }

    updateHeaderState();
  }

  function bindHashNavigation() {
    window.addEventListener(
      "hashchange",
      renderRoute
    );

    document.addEventListener(
      "click",
      event => {
        const link =
          event.target.closest(
            'a[href^="#"]'
          );

        if (!link) {
          return;
        }

        const href =
          link.getAttribute(
            "href"
          );

        if (
          !href ||
          href === "#"
        ) {
          return;
        }

        const id =
          href.slice(1);

        if (
          document.getElementById(
            id
          )
        ) {
          setTimeout(
            renderRoute,
            0
          );
        }
      }
    );
  }

  /* =========================================================
     Header / account
     ========================================================= */

  function updateHeaderState() {
    const accountButton =
      $("#account-button");

    const notificationButton =
      $("#notification-button");

    if (accountButton) {
      accountButton.textContent =
        state.currentUser
          ? `アカウント (${state.currentUser.username})`
          : "アカウント";
    }

    if (notificationButton) {
      const unread =
        state.notifications.filter(
          n => !n.read
        ).length;

      notificationButton.textContent =
        unread
          ? `通知 (${unread})`
          : "通知";
    }
  }

  function renderAccount() {
    const username =
      $("#profile-username");

    const bio =
      $("#profile-bio");

    const avatar =
      $("#profile-avatar");

    if (!state.currentUser) {
      if (username) {
        username.textContent =
          "未ログイン";
      }

      if (bio) {
        bio.textContent = "";
      }

      return;
    }

    if (username) {
      username.textContent =
        state.currentUser.username;
    }

    if (bio) {
      bio.textContent =
        state.currentUser.bio ||
        "";
    }

    if (avatar) {
      if (
        state.currentUser.avatar_url
      ) {
        avatar.src =
          state.currentUser.avatar_url;
      } else {
        avatar.removeAttribute(
          "src"
        );
      }
    }

    const count =
      $("#profile-post-count");

    if (count) {
      count.textContent =
        String(
          state.posts.filter(
            post =>
              post.userId ===
              state.currentUser.id
          ).length
        );
    }
  }

  /* =========================================================
     Auth
     ========================================================= */

  async function login(email, password) {
    if (!supabaseClient) {
      toast(
        "Supabaseに接続できていません。",
        "error"
      );
      return false;
    }

    const {
      data,
      error
    } =
      await supabaseClient.auth
        .signInWithPassword({
          email,
          password
        });

    if (error) {
      console.error(
        "login error:",
        error
      );

      toast(
        error.message ||
          "ログインに失敗しました。",
        "error"
      );

      return false;
    }

    if (data?.user) {
      await loadCurrentUser(
        data.user.id
      );

      await loadPosts();

      renderAccount();

      updateHeaderState();

      navigate("#home");

      toast(
        "ログインしました。",
        "success"
      );

      return true;
    }

    return false;
  }

  async function register(
    email,
    password,
    username
  ) {
    if (!supabaseClient) {
      toast(
        "Supabaseに接続できていません。",
        "error"
      );
      return false;
    }

    const {
      data,
      error
    } =
      await supabaseClient.auth
        .signUp({
          email,
          password
        });

    if (error) {
      console.error(
        "register error:",
        error
      );

      toast(
        error.message ||
          "登録に失敗しました。",
        "error"
      );

      return false;
    }

    const user =
      data?.user;

    if (!user) {
      toast(
        "ユーザー登録が完了しませんでした。",
        "error"
      );

      return false;
    }

    const {
      error: profileError
    } =
      await supabaseClient
        .from("profiles")
        .insert({
          id: user.id,

          username:
            username ||
            email.split("@")[0],

          bio: ""
        });

    if (profileError) {
      console.error(
        "profile insert error:",
        profileError
      );

      toast(
        "アカウントは作成されましたが、プロフィール作成に失敗しました。",
        "error"
      );

      return false;
    }

    await loadCurrentUser(
      user.id
    );

    toast(
      "アカウントを作成しました。",
      "success"
    );

    return true;
  }

  async function logout() {
    if (supabaseClient) {
      const {
        error
      } =
        await supabaseClient.auth
          .signOut();

      if (error) {
        console.error(
          "logout error:",
          error
        );
      }
    }

    state.currentUser =
      null;

    state.posts = [];

    renderAccount();

    renderPosts();

    updateHeaderState();

    navigate("#home");

    toast(
      "ログアウトしました。"
    );
  }

  /* =========================================================
     Create post
     ========================================================= */

  async function createPost() {
    if (!state.currentUser) {
      toast(
        "投稿するにはログインしてください。",
        "error"
      );

      navigate("#login");

      return false;
    }

    if (
      state.currentUser.disablePosting
    ) {
      toast(
        "現在、投稿できません。",
        "error"
      );

      return false;
    }

    const category =
      $("#post-category")?.value ||
      "general";

    const title =
      $("#post-title")?.value.trim() ||
      "";

    const content =
      $("#post-content")?.value.trim() ||
      "";

    const allowReplies =
      $("#allow-replies")?.checked ??
      true;

    const allowShare =
      $("#allow-share")?.checked ??
      true;

    if (!content) {
      toast(
        "本文を入力してください。",
        "error"
      );

      return false;
    }

    if (!supabaseClient) {
      toast(
        "Supabaseに接続できていません。",
        "error"
      );

      return false;
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

          image_url:
            null,

          allow_replies:
            allowReplies,

          allow_share:
            allowShare
        });

    if (error) {
      console.error(
        "post insert error:",
        error
      );

      toast(
        error.message ||
          "投稿に失敗しました。",
        "error"
      );

      return false;
    }

    const form =
      $("#post-form");

    if (form) {
      form.reset();
    }

    updateCharacterCount();

    await loadPosts();

    navigate("#board");

    toast(
      "投稿しました。",
      "success"
    );

    return true;
  }

  /* =========================================================
     Likes
     ========================================================= */

  async function toggleLike(postId) {
    if (!state.currentUser) {
      toast(
        "いいねするにはログインしてください。",
        "error"
      );

      navigate("#login");

      return;
    }

    if (!supabaseClient) {
      toast(
        "Supabaseに接続できていません。",
        "error"
      );

      return;
    }

    const post =
      state.posts.find(
        p => p.id === postId
      );

    if (!post) {
      return;
    }

    const userId =
      state.currentUser.id;

    const alreadyLiked =
      (
        post.likedBy || []
      ).includes(userId);

    if (alreadyLiked) {
      const {
        error
      } =
        await supabaseClient
          .from("likes")
          .delete()
          .eq(
            "post_id",
            postId
          )
          .eq(
            "user_id",
            userId
          );

      if (error) {
        console.error(
          "like delete error:",
          error
        );

        toast(
          "いいねを解除できませんでした。",
          "error"
        );

        return;
      }
    } else {
      const {
        error
      } =
        await supabaseClient
          .from("likes")
          .insert({
            post_id:
              postId,

            user_id:
              userId
          });

      if (error) {
        console.error(
          "like insert error:",
          error
        );

        toast(
          "いいねできませんでした。",
          "error"
        );

        return;
      }
    }

    await loadPosts();
  }

  /* =========================================================
     Replies
     ========================================================= */

  async function replyToPost(postId) {
    if (!state.currentUser) {
      toast(
        "返信するにはログインしてください。",
        "error"
      );

      navigate("#login");

      return;
    }

    const post =
      state.posts.find(
        p => p.id === postId
      );

    if (!post) {
      return;
    }

    if (
      post.allowReplies === false
    ) {
      toast(
        "この投稿は返信できません。",
        "error"
      );

      return;
    }

    const content =
      window.prompt(
        "返信内容を入力してください。"
      );

    if (
      content === null
    ) {
      return;
    }

    const trimmed =
      content.trim();

    if (!trimmed) {
      toast(
        "返信内容を入力してください。",
        "error"
      );

      return;
    }

    if (!supabaseClient) {
      toast(
        "Supabaseに接続できていません。",
        "error"
      );

      return;
    }

    const {
      error
    } =
      await supabaseClient
        .from("replies")
        .insert({
          post_id:
            postId,

          user_id:
            state.currentUser.id,

          content:
            trimmed
        });

    if (error) {
      console.error(
        "reply insert error:",
        error
      );

      toast(
        "返信に失敗しました。",
        "error"
      );

      return;
    }

    await loadPosts();

    toast(
      "返信しました。",
      "success"
    );
  }

  /* =========================================================
     Delete post
     ========================================================= */

  async function deletePost(postId) {
    const post =
      state.posts.find(
        p => p.id === postId
      );

    if (!post) {
      return;
    }

    if (
      !canDeletePost(post)
    ) {
      toast(
        "この投稿を削除する権限がありません。",
        "error"
      );

      return;
    }

    const ok =
      window.confirm(
        "この投稿を削除しますか？"
      );

    if (!ok) {
      return;
    }

    await actuallyDeletePost(
      postId
    );
  }

  async function actuallyDeletePost(
    postId
  ) {
    if (!supabaseClient) {
      return;
    }

    /*
     * RLSの設定によっては、
     * 先にlikes/repliesを削除する必要がある。
     */

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
      console.error(
        "post delete error:",
        error
      );

      toast(
        "投稿を削除できませんでした。",
        "error"
      );

      return;
    }

    await loadPosts();

    toast(
      "投稿を削除しました。",
      "success"
    );
  }

  /* =========================================================
     Share
     ========================================================= */

  function openShare(postId) {
    const post =
      state.posts.find(
        p => p.id === postId
      );

    if (!post) {
      return;
    }

    const url =
      `${location.origin}${location.pathname}#post-${postId}`;

    const shareUrl =
      $("#share-url");

    if (shareUrl) {
      shareUrl.value = url;
    }

    const dialog =
      $("#share-dialog");

    if (
      dialog &&
      typeof dialog.showModal ===
        "function"
    ) {
      dialog.showModal();
    } else if (shareUrl) {
      shareUrl.select();

      document.execCommand(
        "copy"
      );

      toast(
        "共有URLをコピーしました。",
        "success"
      );
    }
  }

  async function copyShareUrl() {
    const input =
      $("#share-url");

    if (!input) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        input.value
      );

      toast(
        "URLをコピーしました。",
        "success"
      );
    } catch {
      input.select();

      document.execCommand(
        "copy"
      );

      toast(
        "URLをコピーしました。",
        "success"
      );
    }
  }

  /* =========================================================
     Report
     ========================================================= */

  function openReport(postId) {
    const post =
      state.posts.find(
        p => p.id === postId
      );

    if (!post) {
      return;
    }

    const target =
      $("#report-post-id");

    if (target) {
      target.value =
        postId;
    }

    const dialog =
      $("#report-dialog");

    if (
      dialog &&
      typeof dialog.showModal ===
        "function"
    ) {
      dialog.showModal();
    } else {
      const reason =
        window.prompt(
          "通報理由を入力してください。"
        );

      if (reason) {
        state.reports.push({
          id: uid("report"),

          postId,

          reason,

          status: "pending",

          createdAt:
            new Date().toISOString()
        });

        toast(
          "通報を受け付けました。",
          "success"
        );
      }
    }
  }

  /* =========================================================
     Search
     ========================================================= */

  function searchPosts(query) {
    const results =
      $("#search-results");

    if (!results) {
      return;
    }

    const q =
      query.trim().toLowerCase();

    if (!q) {
      results.innerHTML =
        "<p>検索キーワードを入力してください。</p>";

      return;
    }

    const matched =
      state.posts.filter(
        post =>
          String(
            post.title || ""
          )
            .toLowerCase()
            .includes(q) ||
          String(
            post.content || ""
          )
            .toLowerCase()
            .includes(q) ||
          String(
            post.username || ""
          )
            .toLowerCase()
            .includes(q)
      );

    if (!matched.length) {
      results.innerHTML =
        "<p>検索結果がありません。</p>";

      return;
    }

    results.innerHTML =
      matched
        .map(
          post => `
            <article class="search-result">
              <h3>
                ${escapeHTML(
                  post.title ||
                    "無題"
                )}
              </h3>

              <p>
                ${escapeHTML(
                  post.content
                )}
              </p>

              <small>
                ${escapeHTML(
                  post.username
                )}
                ・
                ${escapeHTML(
                  formatDate(
                    post.createdAt
                  )
                )}
              </small>
            </article>
          `
        )
        .join("");
  }

  /* =========================================================
     Character count
     ========================================================= */

  function updateCharacterCount() {
    const textarea =
      $("#post-content");

    if (!textarea) {
      return;
    }

    const count =
      $("#post-character-count");

    if (!count) {
      return;
    }

    count.textContent =
      String(
        textarea.value.length
      );
  }

  /* =========================================================
     Forms
     ========================================================= */

  function bindForms() {
    $("#login-form")
      ?.addEventListener(
        "submit",
        async event => {
          event.preventDefault();

          const email =
            $("#login-email")
              ?.value
              .trim();

          const password =
            $("#login-password")
              ?.value || "";

          if (
            !email ||
            !password
          ) {
            toast(
              "メールアドレスとパスワードを入力してください。",
              "error"
            );

            return;
          }

          await login(
            email,
            password
          );
        }
      );

    $("#register-form")
      ?.addEventListener(
        "submit",
        async event => {
          event.preventDefault();

          const email =
            $("#register-email")
              ?.value
              .trim();

          const password =
            $("#register-password")
              ?.value || "";

          const username =
            $("#register-username")
              ?.value
              .trim();

          if (
            !email ||
            !password ||
            !username
          ) {
            toast(
              "必要な項目を入力してください。",
              "error"
            );

            return;
          }

          await register(
            email,
            password,
            username
          );
        }
      );

    $("#post-form")
      ?.addEventListener(
        "submit",
        async event => {
          event.preventDefault();

          await createPost();
        }
      );

    $("#post-content")
      ?.addEventListener(
        "input",
        updateCharacterCount
      );

    $("#profile-form")
      ?.addEventListener(
        "submit",
        async event => {
          event.preventDefault();

          await updateProfile();
        }
      );

    $("#password-form")
      ?.addEventListener(
        "submit",
        async event => {
          event.preventDefault();

          await updatePassword();
        }
      );

    $("#report-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          const postId =
            $("#report-post-id")
              ?.value;

          const reason =
            $("#report-reason")
              ?.value
              .trim();

          if (!postId || !reason) {
            toast(
              "通報理由を入力してください。",
              "error"
            );

            return;
          }

          state.reports.push({
            id: uid("report"),

            postId,

            reason,

            status: "pending",

            createdAt:
              new Date().toISOString()
          });

          $("#report-dialog")
            ?.close();

          event.target.reset();

          toast(
            "通報を受け付けました。",
            "success"
          );
        }
      );

    $("#site-settings-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          if (!ensureAdmin()) {
            return;
          }

          state.settings.siteName =
            $("#site-name")
              ?.value
              .trim() ||
            "KAKIKOMI";

          state.settings.siteDescription =
            $("#site-description")
              ?.value
              .trim() ||
            "";

          state.settings.registrationEnabled =
            $("#site-registration-enabled")
              ?.checked ??
            true;

          state.settings.postingEnabled =
            $("#site-posting-enabled")
              ?.checked ??
            true;

          state.settings.maintenanceMode =
            $("#site-maintenance-mode")
              ?.checked ??
            false;

          saveState();

          updateSiteTexts();

          toast(
            "サイト設定を保存しました。",
            "success"
          );
        }
      );

    $("#create-bot-form")
      ?.addEventListener(
        "submit",
        event => {
          event.preventDefault();

          if (!ensureAdmin()) {
            return;
          }

          const name =
            $("#bot-name")
              ?.value
              .trim();

          const description =
            $("#bot-description")
              ?.value
              .trim();

          if (!name) {
            toast(
              "Bot名を入力してください。",
              "error"
            );

            return;
          }

          state.bots.push({
            id: uid("bot"),

            name,

            description,

            createdAt:
              new Date().toISOString()
          });

          saveState();

          renderAdmin();

          event.target.reset();

          $("#create-bot-dialog")
            ?.close();

          toast(
            "Botを作成しました。",
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

          if (!supabaseClient) {
            toast(
              "Supabaseに接続できていません。",
              "error"
            );

            return;
          }

          const id =
            state.currentUser.id;

          await supabaseClient
            .from("likes")
            .delete()
            .eq(
              "user_id",
              id
            );

          await supabaseClient
            .from("replies")
            .delete()
            .eq(
              "user_id",
              id
            );

          await supabaseClient
            .from("posts")
            .delete()
            .eq(
              "user_id",
              id
            );

          await supabaseClient
            .from("profiles")
            .delete()
            .eq(
              "id",
              id
            );

          await supabaseClient.auth.signOut();

          state.currentUser =
            null;

          state.posts = [];

          $("#delete-account-dialog")
            ?.close();

          renderAccount();

          renderPosts();

          updateHeaderState();

          toast(
            "アカウントを削除しました。"
          );

          navigate("#home");
        }
      );

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
  }

  /* =========================================================
     Profile
     ========================================================= */

  async function updateProfile() {
    if (!state.currentUser) {
      toast(
        "ログインしてください。",
        "error"
      );

      return;
    }

    if (!supabaseClient) {
      toast(
        "Supabaseに接続できていません。",
        "error"
      );

      return;
    }

    const username =
      $("#profile-edit-username")
        ?.value
        .trim();

    const bio =
      $("#profile-edit-bio")
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
      console.error(
        "profile update error:",
        error
      );

      toast(
        "プロフィールを更新できませんでした。",
        "error"
      );

      return;
    }

    await loadCurrentUser(
      state.currentUser.id
    );

    renderAccount();

    updateHeaderState();

    toast(
      "プロフィールを更新しました。",
      "success"
    );
  }

  async function updatePassword() {
    if (!state.currentUser) {
      toast(
        "ログインしてください。",
        "error"
      );

      return;
    }

    if (!supabaseClient) {
      toast(
        "Supabaseに接続できていません。",
        "error"
      );

      return;
    }

    const current =
      $("#current-password")
        ?.value || "";

    const next =
      $("#new-password")
        ?.value || "";

    const confirm =
      $("#confirm-password")
        ?.value || "";

    if (!next) {
      toast(
        "新しいパスワードを入力してください。",
        "error"
      );

      return;
    }

    if (
      next !== confirm
    ) {
      toast(
        "新しいパスワードが一致しません。",
        "error"
      );

      return;
    }

    /*
     * Supabase Authでは、
     * updateUser({password})で現在のセッションの
     * パスワードを変更する。
     */
    const {
      error
    } =
      await supabaseClient.auth
        .updateUser({
          password: next
        });

    if (error) {
      console.error(
        "password update error:",
        error
      );

      toast(
        error.message ||
          "パスワードを変更できませんでした。",
        "error"
      );

      return;
    }

    $("#password-form")
      ?.reset();

    toast(
      "パスワードを変更しました。",
      "success"
    );
  }

  /* =========================================================
     Notifications
     ========================================================= */

  function renderNotifications() {
    const list =
      $("#notification-list");

    if (!list) {
      return;
    }

    if (
      !state.notifications.length
    ) {
      list.innerHTML =
        "<p>通知はありません。</p>";

      return;
    }

    list.innerHTML =
      state.notifications
        .map(
          notification => `
            <article
              class="notification-item ${
                notification.read
                  ? ""
                  : "unread"
              }"
            >
              <p>
                ${escapeHTML(
                  notification.message ||
                    ""
                )}
              </p>

              <time>
                ${escapeHTML(
                  formatDate(
                    notification.createdAt
                  )
                )}
              </time>
            </article>
          `
        )
        .join("");
  }

  function markNotificationsRead() {
    state.notifications =
      state.notifications.map(
        notification => ({
          ...notification,
          read: true
        })
      );

    renderNotifications();

    updateHeaderState();
  }

  /* =========================================================
     Private boards
     ========================================================= */

  function renderPrivateBoards() {
    const list =
      $("#private-board-list");

    if (!list) {
      return;
    }

    if (
      !state.privateBoards.length
    ) {
      list.innerHTML =
        "<p>非公開掲示板はありません。</p>";

      return;
    }

    list.innerHTML =
      state.privateBoards
        .map(
          board => `
            <article class="private-board">
              <h3>
                ${escapeHTML(
                  board.name
                )}
              </h3>

              <p>
                ${escapeHTML(
                  board.description ||
                    ""
                )}
              </p>
            </article>
          `
        )
        .join("");
  }

  function createPrivateBoard() {
    if (!state.currentUser) {
      toast(
        "ログインしてください。",
        "error"
      );

      return;
    }

    const name =
      window.prompt(
        "掲示板名を入力してください。"
      );

    if (!name) {
      return;
    }

    const description =
      window.prompt(
        "説明を入力してください。"
      ) || "";

    state.privateBoards.push({
      id: uid("board"),

      name,

      description,

      createdAt:
        new Date().toISOString(),

      userId:
        state.currentUser.id
    });

    renderPrivateBoards();

    toast(
      "非公開掲示板を作成しました。",
      "success"
    );
  }

  /* =========================================================
     Admin
     ========================================================= */

  function ensureAdmin() {
    if (
      !state.currentUser ||
      state.currentUser.role !==
        "admin"
    ) {
      toast(
        "管理者権限が必要です。",
        "error"
      );

      return false;
    }

    return true;
  }

  function renderAdmin() {
    const reportBody =
      $("#admin-report-table-body");

    if (reportBody) {
      reportBody.innerHTML =
        state.reports
          .map(
            report => `
              <tr>

                <td>
                  ${escapeHTML(
                    report.postId
                  )}
                </td>

                <td>
                  ${escapeHTML(
                    report.reason ||
                      ""
                  )}
                </td>

                <td>
                  ${escapeHTML(
                    report.status ||
                      "pending"
                  )}
                </td>

                <td>

                  <button
                    type="button"
                    class="secondary-button"
                    data-report-id="${escapeHTML(
                      report.id
                    )}"
                    data-report-status="resolved"
                  >
                    解決
                  </button>

                  <button
                    type="button"
                    class="secondary-button"
                    data-report-id="${escapeHTML(
                      report.id
                    )}"
                    data-report-status="dismissed"
                  >
                    却下
                  </button>

                </td>

              </tr>
            `
          )
          .join("");
    }

    const postBody =
      $("#admin-post-table-body");

    if (postBody) {
      postBody.innerHTML =
        state.posts
          .map(
            post => `
              <tr>

                <td>
                  ${escapeHTML(
                    post.title ||
                      "無題"
                  )}
                </td>

                <td>
                  ${escapeHTML(
                    post.username
                  )}
                </td>

                <td>
                  ${escapeHTML(
                    categoryName(
                      post.category
                    )
                  )}
                </td>

                <td>
                  ${escapeHTML(
                    formatDate(
                      post.createdAt
                    )
                  )}
                </td>

                <td>

                  <button
                    type="button"
                    class="secondary-button"
                    data-admin-delete-post="${escapeHTML(
                      post.id
                    )}"
                  >
                    削除
                  </button>

                </td>

              </tr>
            `
          )
          .join("");
    }

    renderAdminUsers();
    renderIpBans();
  }

  function renderAdminUsers(
    query = ""
  ) {
    const body =
      $("#admin-users-table-body");

    if (!body) {
      return;
    }

    const q =
      query
        .trim()
        .toLowerCase();

    const users =
      state.users.filter(
        user =>
          !q ||
          String(
            user.username || ""
          )
            .toLowerCase()
            .includes(q) ||
          String(
            user.email || ""
          )
            .toLowerCase()
            .includes(q) ||
          String(
            user.id || ""
          )
            .toLowerCase()
            .includes(q)
      );

    body.innerHTML =
      users
        .map(
          user => `
            <tr>

              <td>
                ${escapeHTML(
                  user.username ||
                    ""
                )}
              </td>

              <td>
                ${escapeHTML(
                  user.email ||
                    ""
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

                <button
                  type="button"
                  class="secondary-button"
                  data-admin-user="${escapeHTML(
                    user.id
                  )}"
                >
                  管理
                </button>

              </td>

            </tr>
          `
        )
        .join("");
  }

  function renderIpBans() {
    const body =
      $("#ip-ban-table-body");

    if (!body) {
      return;
    }

    const bans =
      state.ipBans || [];

    body.innerHTML =
      bans
        .map(
          ban => `
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
                  ban.duration ||
                    ""
                )}
              </td>

              <td>

                <button
                  type="button"
                  class="secondary-button"
                  data-remove-ip-ban="${escapeHTML(
                    ban.id
                  )}"
                >
                  解除
                </button>

              </td>

            </tr>
          `
        )
        .join("");
  }

  /* =========================================================
     Settings
     ========================================================= */

  function loadSettingsForm() {
    const siteName =
      $("#site-name");

    const description =
      $("#site-description");

    const registration =
      $("#site-registration-enabled");

    const posting =
      $("#site-posting-enabled");

    const maintenance =
      $("#site-maintenance-mode");

    if (siteName) {
      siteName.value =
        state.settings.siteName;
    }

    if (description) {
      description.value =
        state.settings.siteDescription;
    }

    if (registration) {
      registration.checked =
        state.settings.registrationEnabled;
    }

    if (posting) {
      posting.checked =
        state.settings.postingEnabled;
    }

    if (maintenance) {
      maintenance.checked =
        state.settings.maintenanceMode;
    }
  }

  function updateSiteTexts() {
    document.title =
      state.settings.siteName ||
      "KAKIKOMI";

    setText(
      "site-logo",
      state.settings.siteName ||
        "KAKIKOMI"
    );

    const description =
      document.querySelector(
        'meta[name="description"]'
      );

    if (description) {
      description.content =
        `${state.settings.siteName} - ${state.settings.siteDescription}`;
    }
  }

  /* =========================================================
     Click handlers
     ========================================================= */

  function bindClicks() {
    document.addEventListener(
      "click",
      event => {
        const closeButton =
          event.target.closest(
            "[data-close-modal]"
          );

        if (closeButton) {
          const id =
            closeButton.dataset
              .closeModal;

          const dialog =
            document.getElementById(
              id
            );

          if (dialog?.open) {
            dialog.close();
          } else {
            dialog?.removeAttribute(
              "open"
            );
          }

          return;
        }

        const actionButton =
          event.target.closest(
            "[data-action]"
          );

        if (actionButton) {
          const action =
            actionButton.dataset
              .action;

          const postId =
            actionButton.dataset
              .postId;

          if (
            action === "like"
          ) {
            toggleLike(postId);
          }

          if (
            action === "reply"
          ) {
            replyToPost(postId);
          }

          if (
            action === "share"
          ) {
            openShare(postId);
          }

          if (
            action === "report"
          ) {
            openReport(postId);
          }

          if (
            action === "delete"
          ) {
            deletePost(postId);
          }

          return;
        }

        const adminUser =
          event.target.closest(
            "[data-admin-user]"
          );

        if (adminUser) {
          if (!ensureAdmin()) {
            return;
          }

          const user =
            state.users.find(
              u =>
                u.id ===
                adminUser.dataset
                  .adminUser
            );

          if (!user) {
            return;
          }

          const id =
            $("#admin-target-user-id");

          const username =
            $("#admin-target-username");

          const status =
            $("#admin-target-status");

          const forcePassword =
            $("#admin-force-password-change");

          const disablePosting =
            $("#admin-disable-posting");

          const disableReplies =
            $("#admin-disable-replies");

          const forceLogout =
            $("#admin-force-logout");

          if (id) {
            id.value =
              user.id;
          }

          if (username) {
            username.value =
              user.username || "";
          }

          if (status) {
            status.value =
              user.status ||
              "active";
          }

          if (forcePassword) {
            forcePassword.checked =
              !!user.forcePasswordChange;
          }

          if (disablePosting) {
            disablePosting.checked =
              !!user.disablePosting;
          }

          if (disableReplies) {
            disableReplies.checked =
              !!user.disableReplies;
          }

          if (forceLogout) {
            forceLogout.checked =
              false;
          }

          navigate(
            "#admin-user-detail"
          );

          return;
        }

        const deleteAdminPost =
          event.target.closest(
            "[data-admin-delete-post]"
          );

        if (deleteAdminPost) {
          if (!ensureAdmin()) {
            return;
          }

          actuallyDeletePost(
            deleteAdminPost
              .dataset
              .adminDeletePost
          );

          return;
        }

        const reportStatus =
          event.target.closest(
            "[data-report-status]"
          );

        if (reportStatus) {
          if (!ensureAdmin()) {
            return;
          }

          const report =
            state.reports.find(
              r =>
                r.id ===
                reportStatus.dataset
                  .reportId
            );

          if (report) {
            report.status =
              reportStatus.dataset
                .reportStatus;

            saveState();

            renderAdmin();

            toast(
              "通報の状態を更新しました。",
              "success"
            );
          }

          return;
        }

        const removeBan =
          event.target.closest(
            "[data-remove-ip-ban]"
          );

        if (removeBan) {
          if (!ensureAdmin()) {
            return;
          }

          state.ipBans =
            (
              state.ipBans || []
            ).filter(
              ban =>
                ban.id !==
                removeBan.dataset
                  .removeIpBan
            );

          saveState();

          renderIpBans();

          toast(
            "IP BANを解除しました。",
            "success"
          );

          return;
        }

        if (
          event.target.closest(
            "#logout-button"
          )
        ) {
          logout();

          return;
        }

        if (
          event.target.closest(
            "#notification-button"
          )
        ) {
          navigate(
            "#notifications"
          );

          return;
        }

        if (
          event.target.closest(
            "#mark-notifications-read"
          )
        ) {
          markNotificationsRead();

          return;
        }

        if (
          event.target.closest(
            "#copy-share-url"
          )
        ) {
          copyShareUrl();

          return;
        }

        if (
          event.target.closest(
            "#create-private-board-button"
          )
        ) {
          createPrivateBoard();

          return;
        }

        if (
          event.target.closest(
            "#create-bot-button"
          )
        ) {
          if (!ensureAdmin()) {
            return;
          }

          const dialog =
            $("#create-bot-dialog");

          if (
            dialog &&
            typeof dialog.showModal ===
              "function"
          ) {
            dialog.showModal();
          }

          return;
        }

        const category =
          event.target.closest(
            "[data-category]"
          );

        if (category) {
          state.currentCategory =
            category.dataset.category;

          renderPosts();
        }

        const follow =
          event.target.closest(
            "#follow-button"
          );

        if (follow) {
          if (!state.currentUser) {
            toast(
              "ログインしてください。",
              "error"
            );

            navigate("#login");

            return;
          }

          follow.classList.toggle(
            "active"
          );

          toast(
            follow.classList.contains(
              "active"
            )
              ? "フォローしました。"
              : "フォローを解除しました。"
          );
        }
      }
    );
  }

  /* =========================================================
     Category
     ========================================================= */

  function bindCategoryFilter() {
    const select =
      $("#board-category");

    if (!select) {
      return;
    }

    select.addEventListener(
      "change",
      () => {
        state.currentCategory =
          select.value ||
          "all";

        renderPosts();
      }
    );

    state.currentCategory =
      select.value ||
      "all";
  }

  /* =========================================================
     Auto login
     ========================================================= */

  async function autoLogin() {
    if (!supabaseClient) {
      return;
    }

    try {
      const {
        data
      } =
        await supabaseClient.auth
          .getSession();

      const user =
        data?.session?.user;

      if (user) {
        await loadCurrentUser(
          user.id
        );
      }
    } catch (error) {
      console.error(
        "autoLogin error:",
        error
      );
    }
  }

  /* =========================================================
     Debug API
     ========================================================= */

  function exposeDebugAPI() {
    window.KAKIKOMI = {
      state,

      save: saveState,

      async reset() {
        if (supabaseClient) {
          await supabaseClient.auth
            .signOut();
        }

        location.reload();
      },

      login,

      logout,

      createPost,

      renderPosts,

      reloadPosts:
        loadPosts
    };
  }

  /* =========================================================
     Init
     ========================================================= */

  async function init() {
    showLoading(true);

    /*
     * 先にHTML側のUIを初期化。
     *
     * Supabaseの読み込みに失敗しても、
     * プレビュー画面そのものは止めない。
     */

    bindForms();

    bindClicks();

    bindCategoryFilter();

    bindHashNavigation();

    updateSiteTexts();

    renderAccount();

    renderPosts();

    renderNotifications();

    renderPrivateBoards();

    renderAdmin();

    renderAdminUsers();

    renderIpBans();

    loadSettingsForm();

    updateCharacterCount();

    updateHeaderState();

    renderRoute();

    try {
      await initSupabase();

      await loadState();

      /*
       * Supabase Authの状態変化を監視。
       *
       * callback内で直接awaitし続けないようにする。
       */
      supabaseClient.auth.onAuthStateChange(
        (event, session) => {
          setTimeout(
            async () => {
              try {
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

                updateHeaderState();

                renderPosts();
              } catch (error) {
                console.error(
                  "auth state error:",
                  error
                );
              }
            },
            0
          );
        }
      );

      exposeDebugAPI();

    } catch (error) {
      console.error(
        "Supabase initialization error:",
        error
      );

      /*
       * ここでreturnしない。
       * Supabaseが一時的に使えなくても、
       * HTMLのプレビュー画面は表示する。
       */
      toast(
        "プレビューは表示できますが、Supabaseに接続できませんでした。",
        "error"
      );

      exposeDebugAPI();
    }

    showLoading(false);
  }

  /* =========================================================
     Start
     ========================================================= */

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {
        once: true
      }
    );
  } else {
    init();
  }

})();
