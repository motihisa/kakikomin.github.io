```javascript
/* =========================================================
   KAKIKOMI - script.js
   Front-end application logic
   ========================================================= */

(() => {
  "use strict";

  const STORAGE_KEY = "kakikomi_state_v1";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    currentUser: null,
    posts: [],
    reports: [],
    notifications: [],
    users: [],
    privateBoards: [],
    bots: [],
    settings: {
      siteName: "KAKIKOMI",
      siteDescription: "みんなで自由に書き込める総合掲示板",
      registrationEnabled: true,
      postingEnabled: true,
      maintenanceMode: false
    },
    currentCategory: "all"
  };

  const uid = (prefix = "id") =>
    `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

  const escapeHTML = (value = "") =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const formatDate = (date) => {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return;

      Object.assign(state, saved);

      state.settings = {
        siteName: "KAKIKOMI",
        siteDescription: "みんなで自由に書き込める総合掲示板",
        registrationEnabled: true,
        postingEnabled: true,
        maintenanceMode: false,
        ...(saved.settings || {})
      };

      state.posts ||= [];
      state.reports ||= [];
      state.notifications ||= [];
      state.users ||= [];
      state.privateBoards ||= [];
      state.bots ||= [];
      state.ipBans ||= [];
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function seedData() {
    if (state.posts.length || state.users.length) return;

    state.posts = [
      {
        id: "sample_1",
        userId: "demo_user",
        username: "KAKIKOMI運営",
        category: "general",
        title: "KAKIKOMIへようこそ",
        content:
          "ここでは自由に投稿できます。みんなが気持ちよく使えるように、利用ルールを守ってください。",
        createdAt: new Date().toISOString(),
        likes: 0,
        likedBy: [],
        replies: 0,
        allowReplies: true,
        allowShare: true
      }
    ];

    state.users = [
      {
        id: "demo_user",
        username: "KAKIKOMI運営",
        email: "admin@example.com",
        password: "demo",
        bio: "KAKIKOMI運営アカウント",
        role: "admin",
        status: "active",
        forcePasswordChange: false,
        disablePosting: false,
        disableReplies: false,
        followers: 0,
        following: 0
      }
    ];

    state.reports = [];
    state.notifications = [];
    state.privateBoards = [];
    state.bots = [];
    state.ipBans = [];

    saveState();
  }

  function toast(message, type = "normal") {
    const container = $("#toast-container");
    if (!container) return;

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
    if (!loading) return;

    loading.hidden = !show;
    loading.setAttribute("aria-hidden", String(!show));
  }

  function navigate(hash) {
    if (!hash.startsWith("#")) hash = `#${hash}`;

    if (location.hash !== hash) {
      location.hash = hash;
    } else {
      renderRoute();
    }
  }

  function renderRoute() {
    const raw = location.hash.replace(/^#/, "") || "home";
    const target = document.getElementById(raw);

    $$("main > section").forEach(section => {
      section.hidden = true;
    });

    if (target) {
      target.hidden = false;
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    } else {
      const error = $("#error-page");
      if (error) error.hidden = false;
    }

    updateHeaderState();
  }

  function updateHeaderState() {
    const accountButton = $("#account-button");
    const notificationButton = $("#notification-button");

    if (accountButton) {
      accountButton.textContent = state.currentUser
        ? `アカウント (${state.currentUser.username})`
        : "アカウント";
    }

    if (notificationButton) {
      const unread = state.notifications.filter(n => !n.read).length;

      notificationButton.textContent = unread
        ? `通知 (${unread})`
        : "通知";
    }
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

    return names[category] || category || "その他";
  }

  function canDeletePost(post) {
    return Boolean(
      state.currentUser &&
      (
        post.userId === state.currentUser.id ||
        state.currentUser.role === "admin"
      )
    );
  }

  function renderPosts() {
    const list = $("#post-list");
    if (!list) return;

    const category = state.currentCategory;

    const posts = state.posts.filter(post =>
      category === "all"
        ? true
        : post.category === category
    );

    list.innerHTML = "";

    const sample = $("#sample-post-1");
    if (sample) sample.hidden = true;

    const empty = $("#no-posts");

    if (!posts.length) {
      if (empty) empty.hidden = false;
      return;
    }

    if (empty) empty.hidden = true;

    posts
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt) - new Date(a.createdAt)
      )
      .forEach(post => {
        const card = document.createElement("article");

        card.className = "post-card";
        card.dataset.postId = post.id;

        const liked =
          state.currentUser &&
          (post.likedBy || []).includes(state.currentUser.id);

        card.innerHTML = `
          <div class="post-card-header">
            <div class="post-user">
              <div class="user-avatar">
                ${escapeHTML((post.username || "?").slice(0, 1))}
              </div>

              <div class="user-information">
                <span class="username">
                  ${escapeHTML(post.username || "ユーザー")}
                </span>

                <time class="post-time">
                  ${escapeHTML(formatDate(post.createdAt))}
                </time>
              </div>
            </div>

            <span class="post-category">
              ${escapeHTML(categoryName(post.category))}
            </span>
          </div>

          <div class="post-card-body">
            ${
              post.title
                ? `<h3>${escapeHTML(post.title)}</h3>`
                : ""
            }

            <p class="post-text">
              ${escapeHTML(post.content || "")}
            </p>

            ${
              post.image
                ? `
                  <div class="post-image-wrapper">
                    <img
                      class="post-image"
                      src="${escapeHTML(post.image)}"
                      alt="投稿画像"
                    >
                  </div>
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
                    data-post-id="${escapeHTML(post.id)}"
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
                    class="post-action danger"
                    data-action="delete"
                    data-post-id="${escapeHTML(post.id)}"
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

  function setText(id, value) {
    const el = document.getElementById(id);

    if (el) {
      el.textContent = value ?? "";
    }
  }

  function renderAccount() {
    const guest = $("#guest-account");
    const loggedIn = $("#logged-in-account");

    if (!state.currentUser) {
      if (guest) guest.hidden = false;
      if (loggedIn) loggedIn.hidden = true;
      return;
    }

    if (guest) guest.hidden = true;
    if (loggedIn) loggedIn.hidden = false;

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
        p => p.userId === state.currentUser.id
      ).length
    );

    setText(
      "profile-followers",
      state.currentUser.followers || 0
    );

    setText(
      "profile-following",
      state.currentUser.following || 0
    );

    const username = $("#settings-username");
    const bio = $("#settings-bio");

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

    const force = $("#forced-password-change");

    if (force) {
      force.hidden =
        !state.currentUser.forcePasswordChange;
    }
  }

  function updatePostCount() {
    if (!state.currentUser) return;

    setText(
      "profile-post-count",
      state.posts.filter(
        post =>
          post.userId === state.currentUser.id
      ).length
    );
  }

  function login(
    email,
    password,
    remember = false
  ) {
    const user = state.users.find(
      u =>
        String(u.email).toLowerCase() ===
        String(email).toLowerCase()
    );

    if (!user || user.password !== password) {
      toast(
        "メールアドレスまたはパスワードが違います。",
        "error"
      );
      return false;
    }

    if (user.status === "banned") {
      toast(
        "このアカウントは利用できません。",
        "error"
      );
      return false;
    }

    state.currentUser = {
      ...user
    };

    if (remember) {
      localStorage.setItem(
        "kakikomi_remember",
        "1"
      );
    } else {
      localStorage.removeItem(
        "kakikomi_remember"
      );
    }

    saveState();

    renderAccount();
    updateHeaderState();

    toast(
      `ログインしました。ようこそ、${user.username}さん！`,
      "success"
    );

    navigate("#home");

    return true;
  }

  function logout() {
    state.currentUser = null;

    localStorage.removeItem(
      "kakikomi_remember"
    );

    saveState();

    renderAccount();
    updateHeaderState();

    toast("ログアウトしました。");

    navigate("#home");
  }

  function register(
    username,
    email,
    password,
    passwordConfirm
  ) {
    if (!state.settings.registrationEnabled) {
      toast(
        "現在、新規登録を停止しています。",
        "error"
      );
      return false;
    }

    if (!username || !email || !password) {
      toast(
        "必要な項目を入力してください。",
        "error"
      );
      return false;
    }

    if (password !== passwordConfirm) {
      toast(
        "パスワードが一致しません。",
        "error"
      );
      return false;
    }

    if (password.length < 6) {
      toast(
        "パスワードは6文字以上にしてください。",
        "error"
      );
      return false;
    }

    if (
      state.users.some(
        user =>
          user.email.toLowerCase() ===
          email.toLowerCase()
      )
    ) {
      toast(
        "このメールアドレスはすでに登録されています。",
        "error"
      );
      return false;
    }

    if (
      state.users.some(
        user =>
          user.username.toLowerCase() ===
          username.toLowerCase()
      )
    ) {
      toast(
        "このユーザー名はすでに使われています。",
        "error"
      );
      return false;
    }

    const user = {
      id: uid("user"),
      username,
      email,
      password,
      bio: "",
      role: "user",
      status: "active",
      forcePasswordChange: false,
      disablePosting: false,
      disableReplies: false,
      followers: 0,
      following: 0,
      createdAt: new Date().toISOString()
    };

    state.users.push(user);

    state.notifications.push({
      id: uid("notification"),
      userId: user.id,
      type: "system",
      message:
        "KAKIKOMIへの登録ありがとうございます！",
      createdAt: new Date().toISOString(),
      read: false
    });

    state.currentUser = {
      ...user
    };

    saveState();

    renderAccount();
    updateHeaderState();

    toast(
      "アカウントを作成しました！",
      "success"
    );

    navigate("#home");

    return true;
  }

  function createPost() {
    if (!state.currentUser) {
      toast(
        "投稿するにはログインしてください。",
        "error"
      );
      navigate("#login");
      return false;
    }

    if (!state.settings.postingEnabled) {
      toast(
        "現在、投稿を停止しています。",
        "error"
      );
      return false;
    }

    if (
      state.currentUser.disablePosting
    ) {
      toast(
        "現在、投稿が制限されています。",
        "error"
      );
      return false;
    }

    const title =
      $("#post-title")?.value.trim() || "";

    const content =
      $("#post-content")?.value.trim() || "";

    const category =
      $("#post-category")?.value || "general";

    const allowReplies =
      $("#allow-replies")?.checked ?? true;

    const allowShare =
      $("#allow-share")?.checked ?? true;

    const imageInput =
      $("#post-image");

    let image = "";

    if (
      imageInput &&
      imageInput.files &&
      imageInput.files[0]
    ) {
      const file =
        imageInput.files[0];

      if (
        file.size >
        3 * 1024 * 1024
      ) {
        toast(
          "画像は3MB以下にしてください。",
          "error"
        );
        return false;
      }

      image =
        $("#image-preview")?.dataset.preview ||
        "";
    }

    if (!content) {
      toast(
        "本文を入力してください。",
        "error"
      );
      return false;
    }

    if (content.length > 5000) {
      toast(
        "本文は5000文字以内にしてください。",
        "error"
      );
      return false;
    }

    const post = {
      id: uid("post"),
      userId: state.currentUser.id,
      username: state.currentUser.username,
      category,
      title,
      content,
      image,
      createdAt: new Date().toISOString(),
      likes: 0,
      likedBy: [],
      replies: 0,
      allowReplies,
      allowShare
    };

    state.posts.push(post);

    saveState();

    const form =
      $("#post-form");

    if (form) {
      form.reset();
    }

    const preview =
      $("#image-preview");

    if (preview) {
      preview.hidden = true;
      preview.removeAttribute("src");
      delete preview.dataset.preview;
    }

    updateCharacterCount();
    renderPosts();

    toast(
      "投稿しました！",
      "success"
    );

    navigate("#board");

    return true;
  }

  function toggleLike(postId) {
    if (!state.currentUser) {
      toast(
        "いいねするにはログインしてください。",
        "error"
      );
      navigate("#login");
      return;
    }

    const post =
      state.posts.find(
        p => p.id === postId
      );

    if (!post) return;

    post.likedBy ||= [];

    const index =
      post.likedBy.indexOf(
        state.currentUser.id
      );

    if (index >= 0) {
      post.likedBy.splice(index, 1);
      post.likes =
        Math.max(
          0,
          (post.likes || 0) - 1
        );
    } else {
      post.likedBy.push(
        state.currentUser.id
      );

      post.likes =
        (post.likes || 0) + 1;

      if (
        post.userId !==
        state.currentUser.id
      ) {
        addNotification(
          post.userId,
          "like",
          `${state.currentUser.username}さんがあなたの投稿にいいねしました。`
        );
      }
    }

    saveState();
    renderPosts();
    renderNotifications();
    updateHeaderState();
  }

  function replyToPost(postId) {
    const post =
      state.posts.find(
        p => p.id === postId
      );

    if (!post) return;

    if (post.allowReplies === false) {
      toast(
        "この投稿は返信できません。",
        "error"
      );
      return;
    }

    if (!state.currentUser) {
      toast(
        "返信するにはログインしてください。",
        "error"
      );
      navigate("#login");
      return;
    }

    if (state.currentUser.disableReplies) {
      toast(
        "現在、返信が制限されています。",
        "error"
      );
      return;
    }

    const text =
      prompt("返信内容を入力してください。");

    if (text === null) return;

    const content =
      text.trim();

    if (!content) {
      toast(
        "返信内容を入力してください。",
        "error"
      );
      return;
    }

    post.replies =
      (post.replies || 0) + 1;

    post.replyItems ||= [];

    post.replyItems.push({
      id: uid("reply"),
      userId:
        state.currentUser.id,
      username:
        state.currentUser.username,
      content,
      createdAt:
        new Date().toISOString()
    });

    if (
      post.userId !==
      state.currentUser.id
    ) {
      addNotification(
        post.userId,
        "reply",
        `${state.currentUser.username}さんがあなたの投稿に返信しました。`
      );
    }

    saveState();
    renderPosts();
    renderNotifications();
    updateHeaderState();

    toast(
      "返信しました。",
      "success"
    );
  }

  function openShare(postId) {
    const post =
      state.posts.find(
        p => p.id === postId
      );

    if (!post) return;

    const url =
      `${location.origin}${location.pathname}#post-${encodeURIComponent(post.id)}`;

    const input =
      $("#share-url");

    if (input) {
      input.value = url;
    }

    const dialog =
      $("#share-dialog");

    if (dialog?.showModal) {
      dialog.showModal();
    } else {
      navigate("#share");
    }
  }

  function copyShareUrl() {
    const input =
      $("#share-url");

    if (!input) return;

    const url =
      input.value;

    if (!url) return;

    if (
      navigator.clipboard &&
      navigator.clipboard.writeText
    ) {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          toast(
            "共有URLをコピーしました。",
            "success"
          );
        })
        .catch(() => {
          fallbackCopy(url);
        });
    } else {
      fallbackCopy(url);
    }
  }

  function fallbackCopy(text) {
    const temp =
      document.createElement("textarea");

    temp.value = text;

    document.body.appendChild(temp);

    temp.select();

    try {
      document.execCommand("copy");
      toast(
        "共有URLをコピーしました。",
        "success"
      );
    } catch {
      toast(
        "コピーできませんでした。",
        "error"
      );
    }

    temp.remove();
  }

  function openReport(postId) {
    if (!state.currentUser) {
      toast(
        "通報するにはログインしてください。",
        "error"
      );
      navigate("#login");
      return;
    }

    const idInput =
      $("#modal-report-post-id");

    if (idInput) {
      idInput.value = postId;
    }

    const idInput2 =
      $("#report-post-id");

    if (idInput2) {
      idInput2.value = postId;
    }

    const dialog =
      $("#report-dialog");

    if (dialog?.showModal) {
      dialog.showModal();
    } else {
      navigate("#report");
    }
  }

  function submitReport(
    postId,
    reason,
    detail
  ) {
    if (!state.currentUser) {
      toast(
        "通報するにはログインしてください。",
        "error"
      );
      return false;
    }

    const post =
      state.posts.find(
        p => p.id === postId
      );

    if (!post) {
      toast(
        "対象の投稿が見つかりません。",
        "error"
      );
      return false;
    }

    if (!reason) {
      toast(
        "通報理由を選択してください。",
        "error"
      );
      return false;
    }

    const duplicate =
      state.reports.some(
        report =>
          report.postId === postId &&
          report.userId ===
            state.currentUser.id &&
          report.status !== "resolved"
      );

    if (duplicate) {
      toast(
        "この投稿はすでに通報しています。",
        "error"
      );
      return false;
    }

    state.reports.push({
      id: uid("report"),
      postId,
      userId:
        state.currentUser.id,
      username:
        state.currentUser.username,
      reason,
      detail:
        detail || "",
      status: "pending",
      createdAt:
        new Date().toISOString()
    });

    saveState();

    toast(
      "通報を送信しました。",
      "success"
    );

    return true;
  }

  function deletePost(postId) {
    const post =
      state.posts.find(
        p => p.id === postId
      );

    if (!post) return;

    if (!canDeletePost(post)) {
      toast(
        "この投稿を削除する権限がありません。",
        "error"
      );
      return;
    }

    const confirmed =
      confirm(
        "この投稿を削除しますか？"
      );

    if (!confirmed) return;

    actuallyDeletePost(postId);
  }

  function actuallyDeletePost(postId) {
    const post =
      state.posts.find(
        p => p.id === postId
      );

    if (!post) return;

    if (
      !state.currentUser ||
      (
        post.userId !==
          state.currentUser.id &&
        state.currentUser.role !== "admin"
      )
    ) {
      toast(
        "削除する権限がありません。",
        "error"
      );
      return;
    }

    state.posts =
      state.posts.filter(
        p => p.id !== postId
      );

    saveState();

    renderPosts();
    renderAdmin();
    updatePostCount();

    toast(
      "投稿を削除しました。",
      "success"
    );
  }

  function addNotification(
    userId,
    type,
    message
  ) {
    state.notifications.push({
      id: uid("notification"),
      userId,
      type,
      message,
      createdAt:
        new Date().toISOString(),
      read: false
    });
  }

  function renderNotifications() {
    const list =
      $("#notification-list");

    if (!list) return;

    const userId =
      state.currentUser?.id;

    if (!userId) {
      list.innerHTML =
        "<p>ログインすると通知を確認できます。</p>";
      return;
    }

    const items =
      state.notifications
        .filter(
          n => n.userId === userId
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt) -
            new Date(a.createdAt)
        );

    if (!items.length) {
      list.innerHTML =
        "<p>通知はありません。</p>";
      return;
    }

    list.innerHTML =
      items
        .map(
          item => `
            <div
              class="notification-item ${
                item.read
                  ? "is-read"
                  : "is-unread"
              }"
            >
              <p>
                ${escapeHTML(item.message)}
              </p>

              <time>
                ${escapeHTML(
                  formatDate(
                    item.createdAt
                  )
                )}
              </time>
            </div>
          `
        )
        .join("");
  }

  function markNotificationsRead() {
    if (!state.currentUser) return;

    state.notifications.forEach(
      notification => {
        if (
          notification.userId ===
          state.currentUser.id
        ) {
          notification.read = true;
        }
      }
    );

    saveState();

    renderNotifications();
    updateHeaderState();

    toast(
      "通知を既読にしました。",
      "success"
    );
  }

  function searchPosts(query) {
    const list =
      $("#search-results");

    if (!list) return;

    const q =
      query.trim().toLowerCase();

    if (!q) {
      list.innerHTML =
        "<p>検索キーワードを入力してください。</p>";
      return;
    }

    const results =
      state.posts.filter(post => {
        const text =
          [
            post.title,
            post.content,
            post.username,
            categoryName(
              post.category
            )
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return text.includes(q);
      });

    if (!results.length) {
      list.innerHTML =
        "<p>該当する投稿がありません。</p>";
      return;
    }

    list.innerHTML =
      results
        .map(
          post => `
            <article
              class="search-result"
              data-post-id="${escapeHTML(post.id)}"
            >
              <h3>
                ${escapeHTML(
                  post.title ||
                  "無題の投稿"
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

  function createPrivateBoard() {
    if (!state.currentUser) {
      toast(
        "限定掲示板を作成するにはログインしてください。",
        "error"
      );
      navigate("#login");
      return;
    }

    const name =
      prompt(
        "限定掲示板の名前を入力してください。"
      );

    if (name === null) return;

    const boardName =
      name.trim();

    if (!boardName) {
      toast(
        "掲示板名を入力してください。",
        "error"
      );
      return;
    }

    const code =
      Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase();

    const board = {
      id: uid("private"),
      name: boardName,
      code,
      ownerId:
        state.currentUser.id,
      members: [
        state.currentUser.id
      ],
      createdAt:
        new Date().toISOString()
    };

    state.privateBoards.push(board);

    saveState();
    renderPrivateBoards();
    renderAdmin();

    alert(
      `限定掲示板を作成しました。\n参加コード: ${code}`
    );

    toast(
      "限定掲示板を作成しました。",
      "success"
    );
  }

  function joinPrivateBoard(code) {
    if (!state.currentUser) {
      toast(
        "限定掲示板に参加するにはログインしてください。",
        "error"
      );
      navigate("#login");
      return false;
    }

    const board =
      state.privateBoards.find(
        item =>
          item.code.toUpperCase() ===
          code.toUpperCase()
      );

    if (!board) {
      toast(
        "参加コードが正しくありません。",
        "error"
      );
      return false;
    }

    if (
      !board.members.includes(
        state.currentUser.id
      )
    ) {
      board.members.push(
        state.currentUser.id
      );
    }

    saveState();
    renderPrivateBoards();

    toast(
      "限定掲示板に参加しました。",
      "success"
    );

    return true;
  }

  function renderPrivateBoards() {
    const list =
      $("#private-board-list");

    if (!list) return;

    if (!state.currentUser) {
      list.innerHTML =
        "<p>ログインすると限定掲示板を利用できます。</p>";
      return;
    }

    const boards =
      state.privateBoards.filter(
        board =>
          board.members.includes(
            state.currentUser.id
          )
      );

    if (!boards.length) {
      list.innerHTML =
        "<p>参加している限定掲示板はありません。</p>";
      return;
    }

    list.innerHTML =
      boards
        .map(
          board => `
            <article class="private-board-card">
              <h3>
                ${escapeHTML(
                  board.name
                )}
              </h3>

              <p>
                参加者：
                ${board.members.length}人
              </p>

              <small>
                参加コード：
                ${escapeHTML(
                  board.code
                )}
              </small>
            </article>
          `
        )
        .join("");
  }

  function ensureAdmin() {
    if (
      !state.currentUser ||
      state.currentUser.role !== "admin"
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

  function renderAdmin() {
    if (!state.currentUser) return;

    const isAdmin =
      state.currentUser.role === "admin";

    const adminPage =
      $("#admin-page");

    if (adminPage) {
      adminPage.hidden = !isAdmin;
    }

    if (!isAdmin) return;

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
    renderIpBans();
    renderAdminBots();
    renderAdminPrivateBoards();
    loadSettingsForm();
  }

  function renderAdminPosts() {
    const list =
      $("#admin-post-list");

    if (!list) return;

    if (!state.posts.length) {
      list.innerHTML =
        "<p>投稿はありません。</p>";
      return;
    }

    list.innerHTML =
      state.posts
        .slice()
        .sort(
          (a, b) =>
            new Date(b.createdAt) -
            new Date(a.createdAt)
        )
        .map(
          post => `
            <article class="admin-post-item">

              <div>
                <strong>
                  ${escapeHTML(
                    post.title ||
                    "無題の投稿"
                  )}
                </strong>

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
          `
        )
        .join("");
  }

  function renderAdminReports() {
    const list =
      $("#admin-report-list");

    if (!list) return;

    if (!state.reports.length) {
      list.innerHTML =
        "<p>通報はありません。</p>";
      return;
    }

    list.innerHTML =
      state.reports
        .slice()
        .sort(
          (a, b) =>
            new Date(b.createdAt) -
            new Date(a.createdAt)
        )
        .map(
          report => `
            <article class="admin-report-item">

              <div>
                <strong>
                  ${escapeHTML(
                    report.reason
                  )}
                </strong>

                <p>
                  ${escapeHTML(
                    report.detail || ""
                  )}
                </p>

                <small>
                  通報者：
                  ${escapeHTML(
                    report.username
                  )}
                  <br>
                  投稿日：
                  ${escapeHTML(
                    report.postId
                  )}
                </small>
              </div>

              <div class="report-status-actions">

                <button
                  type="button"
                  class="secondary-button"
                  data-report-id="${escapeHTML(
                    report.id
                  )}"
                  data-report-status="reviewing"
                >
                  確認中
                </button>

                <button
                  type="button"
                  class="secondary-button"
                  data-report-id="${escapeHTML(
                    report.id
                  )}"
                  data-report-status="resolved"
                >
                  解決済み
                </button>

                <button
                  type="button"
                  class="secondary-button"
                  data-report-id="${escapeHTML(
                    report.id
                  )}"
                  data-report-status="rejected"
                >
                  却下
                </button>

              </div>

            </article>
          `
        )
        .join("");
  }

  function renderAdminBots() {
    const list =
      $("#admin-bot-list");

    if (!list) return;

    if (!state.bots.length) {
      list.innerHTML =
        "<p>Botはありません。</p>";
      return;
    }

    list.innerHTML =
      state.bots
        .map(
          bot => `
            <article class="admin-bot-item">
              <strong>
                ${escapeHTML(
                  bot.name
                )}
              </strong>

              <p>
                ${escapeHTML(
                  bot.description || ""
                )}
              </p>

              <small>
                ${escapeHTML(
                  formatDate(
                    bot.createdAt
                  )
                )}
              </small>
            </article>
          `
        )
        .join("");
  }

  function renderAdminPrivateBoards() {
    const list =
      $("#admin-private-board-list");

    if (!list) return;

    if (!state.privateBoards.length) {
      list.innerHTML =
        "<p>限定掲示板はありません。</p>";
      return;
    }

    list.innerHTML =
      state.privateBoards
        .map(
          board => `
            <article class="admin-private-board-item">
              <strong>
                ${escapeHTML(
                  board.name
                )}
              </strong>

              <p>
                所有者：
                ${escapeHTML(
                  board.ownerId
                )}
              </p>

              <p>
                参加者：
                ${board.members.length}人
              </p>

              <small>
                コード：
                ${escapeHTML(
                  board.code
                )}
              </small>
            </article>
          `
        )
        .join("");
  }

  function renderAdminUsers(
    query = ""
  ) {
    const body =
      $("#admin-users-table-body");

    if (!body) return;

    const q =
      query.trim().toLowerCase();

    const users =
      state.users.filter(user =>
        !q ||
        String(user.username)
          .toLowerCase()
          .includes(q) ||
        String(user.email)
          .toLowerCase()
          .includes(q) ||
        String(user.id)
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
                  user.username
                )}
              </td>

              <td>
                ${escapeHTML(
                  user.email
                )}
              </td>

              <td>
                ${escapeHTML(
                  user.role || "user"
                )}
              </td>

              <td>
                ${escapeHTML(
                  user.status || "active"
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

    if (!body) return;

    const bans =
      state.ipBans || [];

    if (!bans.length) {
      body.innerHTML =
        `<tr><td colspan="4">IP BANはありません。</td></tr>`;
      return;
    }

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
                  ban.reason || ""
                )}
              </td>

              <td>
                ${escapeHTML(
                  ban.duration || ""
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

  function loadSettingsForm() {
    if (
      !state.currentUser ||
      state.currentUser.role !== "admin"
    ) {
      return;
    }

    const siteName =
      $("#site-name");

    const siteDescription =
      $("#site-description");

    const registration =
      $("#site-registration-enabled");

    const posting =
      $("#site-posting-enabled");

    const maintenance =
      $("#site-maintenance-mode");

    if (siteName) {
      siteName.value =
        state.settings.siteName || "";
    }

    if (siteDescription) {
      siteDescription.value =
        state.settings.siteDescription || "";
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

  function updateCharacterCount() {
    const textarea =
      $("#post-content");

    const counter =
      $("#post-character-count");

    if (!textarea || !counter) return;

    counter.textContent =
      String(textarea.value.length);
  }

  function setupImagePreview() {
    const input =
      $("#post-image");

    const preview =
      $("#image-preview");

    if (!input || !preview) return;

    input.addEventListener(
      "change",
      () => {
        const file =
          input.files?.[0];

        if (!file) {
          preview.hidden = true;
          preview.removeAttribute("src");
          delete preview.dataset.preview;
          return;
        }

        if (
          !file.type.startsWith(
            "image/"
          )
        ) {
          toast(
            "画像ファイルを選択してください。",
            "error"
          );

          input.value = "";
          preview.hidden = true;
          return;
        }

        if (
          file.size >
          3 * 1024 * 1024
        ) {
          toast(
            "画像は3MB以下にしてください。",
            "error"
          );

          input.value = "";
          preview.hidden = true;
          return;
        }

        const reader =
          new FileReader();

        reader.onload = event => {
          const result =
            event.target.result;

          preview.src =
            result;

          preview.dataset.preview =
            result;

          preview.hidden = false;
        };

        reader.readAsDataURL(file);
      }
    );
  }

  function bindForms() {
    $("#login-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        login(
          $("#login-email")?.value.trim() || "",
          $("#login-password")?.value || "",
          $("#remember-login")?.checked || false
        );
      }
    );

    $("#register-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        const agreed =
          $("#agree-rules")?.checked;

        if (!agreed) {
          toast(
            "利用ルールに同意してください。",
            "error"
          );
          return;
        }

        register(
          $("#register-username")?.value.trim() || "",
          $("#register-email")?.value.trim() || "",
          $("#register-password")?.value || "",
          $("#register-password-confirm")?.value || ""
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

    $("#profile-settings-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        if (!state.currentUser) {
          toast(
            "ログインしてください。",
            "error"
          );
          return;
        }

        const username =
          $("#settings-username")?.value.trim();

        const bio =
          $("#settings-bio")?.value.trim();

        if (!username) {
          toast(
            "ユーザー名を入力してください。",
            "error"
          );
          return;
        }

        const duplicate =
          state.users.some(
            user =>
              user.id !==
                state.currentUser.id &&
              user.username.toLowerCase() ===
                username.toLowerCase()
          );

        if (duplicate) {
          toast(
            "そのユーザー名はすでに使われています。",
            "error"
          );
          return;
        }

        const user =
          state.users.find(
            u =>
              u.id ===
              state.currentUser.id
          );

        if (!user) return;

        user.username =
          username;

        user.bio =
          bio || "";

        state.currentUser = {
          ...user
        };

        state.posts.forEach(
          post => {
            if (
              post.userId ===
              user.id
            ) {
              post.username =
                user.username;
            }
          }
        );

        saveState();

        renderAccount();
        renderPosts();
        updateHeaderState();

        toast(
          "プロフィールを更新しました。",
          "success"
        );
      }
    );

    $("#change-password-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        if (!state.currentUser) {
          toast(
            "ログインしてください。",
            "error"
          );
          return;
        }

        const current =
          $("#current-password")?.value || "";

        const next =
          $("#new-password")?.value || "";

        const confirmPassword =
          $("#new-password-confirm")?.value || "";

        const user =
          state.users.find(
            u =>
              u.id ===
              state.currentUser.id
          );

        if (!user) return;

        if (
          user.password !==
          current
        ) {
          toast(
            "現在のパスワードが違います。",
            "error"
          );
          return;
        }

        if (
          next.length < 6
        ) {
          toast(
            "新しいパスワードは6文字以上にしてください。",
            "error"
          );
          return;
        }

        if (
          next !==
          confirmPassword
        ) {
          toast(
            "新しいパスワードが一致しません。",
            "error"
          );
          return;
        }

        user.password =
          next;

        user.forcePasswordChange =
          false;

        state.currentUser = {
          ...user
        };

        saveState();

        renderAccount();

        event.target.reset();

        toast(
          "パスワードを変更しました。",
          "success"
        );
      }
    );

    $("#report-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        const success =
          submitReport(
            $("#report-post-id")?.value || "",
            $("#report-reason")?.value || "",
            $("#report-detail")?.value.trim() || ""
          );

        if (success) {
          event.target.reset();
          $("#report-dialog")?.close();
          renderAdmin();
        }
      }
    );

    $("#modal-report-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        const success =
          submitReport(
            $("#modal-report-post-id")?.value || "",
            $("#modal-report-reason")?.value || "",
            $("#modal-report-detail")?.value.trim() || ""
          );

        if (success) {
          event.target.reset();
          $("#report-dialog")?.close();
          renderAdmin();
        }
      }
    );

    $("#join-private-board-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        const code =
          $("#private-board-code")?.value.trim() || "";

        if (
          joinPrivateBoard(code)
        ) {
          event.target.reset();
        }
      }
    );

    $("#admin-user-search-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        renderAdminUsers(
          $("#admin-user-search")?.value || ""
        );
      }
    );

    $("#admin-user-settings-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        if (!ensureAdmin()) return;

        const id =
          $("#admin-target-user-id")?.value;

        const user =
          state.users.find(
            u => u.id === id
          );

        if (!user) {
          toast(
            "ユーザーが見つかりません。",
            "error"
          );
          return;
        }

        user.status =
          $("#admin-target-status")?.value ||
          "active";

        user.forcePasswordChange =
          $("#admin-force-password-change")?.checked ||
          false;

        user.disablePosting =
          $("#admin-disable-posting")?.checked ||
          false;

        user.disableReplies =
          $("#admin-disable-replies")?.checked ||
          false;

        if (
          $("#admin-force-logout")?.checked &&
          state.currentUser?.id === user.id
        ) {
          state.currentUser = null;
        }

        saveState();

        renderAdmin();
        renderAccount();
        updateHeaderState();

        toast(
          "ユーザー設定を保存しました。",
          "success"
        );
      }
    );

    $("#ip-ban-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        if (!ensureAdmin()) return;

        const ip =
          $("#ban-ip")?.value.trim();

        const reason =
          $("#ban-reason")?.value.trim();

        const duration =
          $("#ban-duration")?.value.trim();

        if (!ip) {
          toast(
            "IPアドレスを入力してください。",
            "error"
          );
          return;
        }

        state.ipBans ||= [];

        state.ipBans.push({
          id: uid("ipban"),
          ip,
          reason,
          duration,
          createdAt:
            new Date().toISOString()
        });

        saveState();

        renderIpBans();

        event.target.reset();

        toast(
          "IP BANを登録しました。",
          "success"
        );
      }
    );

    $("#admin-site-settings-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        if (!ensureAdmin()) return;

        state.settings.siteName =
          $("#site-name")?.value.trim() ||
          "KAKIKOMI";

        state.settings.siteDescription =
          $("#site-description")?.value.trim() ||
          "";

        state.settings.registrationEnabled =
          $("#site-registration-enabled")?.checked ??
          true;

        state.settings.postingEnabled =
          $("#site-posting-enabled")?.checked ??
          true;

        state.settings.maintenanceMode =
          $("#site-maintenance-mode")?.checked ??
          false;

        saveState();

        updateSiteTexts();

        toast(
          "サイト設定を保存しました。",
          "success"
        );
      }
    );

    $("#create-bot-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        if (!ensureAdmin()) return;

        const name =
          $("#bot-name")?.value.trim();

        const description =
          $("#bot-description")?.value.trim();

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

        $("#create-bot-dialog")?.close();

        toast(
          "Botを作成しました。",
          "success"
        );
      }
    );

    $("#delete-account-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        if (!state.currentUser) return;

        const id =
          state.currentUser.id;

        state.users =
          state.users.filter(
            user => user.id !== id
          );

        state.posts =
          state.posts.filter(
            post =>
              post.userId !== id
          );

        state.notifications =
          state.notifications.filter(
            notification =>
              notification.userId !== id
          );

        state.currentUser =
          null;

        saveState();

        $("#delete-account-dialog")?.close();

        renderAccount();
        renderPosts();
        updateHeaderState();

        toast(
          "アカウントを削除しました。"
        );

        navigate("#home");
      }
    );

    $("#search-form")?.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        searchPosts(
          $("#search-input")?.value || ""
        );
      }
    );

    $("#post-content")?.addEventListener(
      "input",
      updateCharacterCount
    );

    $("#private-board-code")?.addEventListener(
      "input",
      event => {
        event.target.value =
          event.target.value
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 20);
      }
    );
  }

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
            closeButton.dataset.closeModal;

          const dialog =
            document.getElementById(id);

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
            actionButton.dataset.action;

          const postId =
            actionButton.dataset.postId;

          if (action === "like") {
            toggleLike(postId);
          }

          if (action === "reply") {
            replyToPost(postId);
          }

          if (action === "share") {
            openShare(postId);
          }

          if (action === "report") {
            openReport(postId);
          }

          if (action === "delete") {
            deletePost(postId);
          }

          return;
        }

        const adminUser =
          event.target.closest(
            "[data-admin-user]"
          );

        if (adminUser) {
          if (!ensureAdmin()) return;

          const user =
            state.users.find(
              u =>
                u.id ===
                adminUser.dataset.adminUser
            );

          if (!user) return;

          $("#admin-target-user-id").value =
            user.id;

          $("#admin-target-username").value =
            user.username;

          $("#admin-target-status").value =
            user.status || "active";

          $("#admin-force-password-change").checked =
            !!user.forcePasswordChange;

          $("#admin-disable-posting").checked =
            !!user.disablePosting;

          $("#admin-disable-replies").checked =
            !!user.disableReplies;

          $("#admin-force-logout").checked =
            false;

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
          if (!ensureAdmin()) return;

          actuallyDeletePost(
            deleteAdminPost.dataset
              .adminDeletePost
          );

          return;
        }

        const reportStatus =
          event.target.closest(
            "[data-report-status]"
          );

        if (reportStatus) {
          if (!ensureAdmin()) return;

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
          if (!ensureAdmin()) return;

          state.ipBans =
            (state.ipBans || []).filter(
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
          if (!ensureAdmin()) return;

          const dialog =
            $("#create-bot-dialog");

          if (dialog?.showModal) {
            dialog.showModal();
          } else if (dialog) {
            dialog.setAttribute(
              "open",
              ""
            );
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

          return;
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

          const active =
            follow.classList.contains(
              "active"
            );

          toast(
            active
              ? "フォローしました。"
              : "フォローを解除しました。"
          );

          return;
        }

        const result =
          event.target.closest(
            ".search-result"
          );

        if (result) {
          const postId =
            result.dataset.postId;

          const post =
            state.posts.find(
              p => p.id === postId
            );

          if (post) {
            state.currentCategory =
              "all";

            renderPosts();

            navigate("#board");

            setTimeout(() => {
              const target =
                document.querySelector(
                  `[data-post-id="${CSS.escape(
                    postId
                  )}"]`
                );

              if (target) {
                target.scrollIntoView({
                  behavior: "smooth",
                  block: "center"
                });
              }
            }, 100);
          }
        }
      }
    );
  }

  function bindCategoryFilter() {
    const select =
      $("#board-category");

    if (!select) return;

    select.addEventListener(
      "change",
      () => {
        state.currentCategory =
          select.value || "all";

        renderPosts();
      }
    );

    state.currentCategory =
      select.value || "all";
  }

  function autoLogin() {
    if (
      localStorage.getItem(
        "kakikomi_remember"
      ) !== "1"
    ) {
      return;
    }

    if (!state.currentUser) return;

    const user =
      state.users.find(
        u =>
          u.id ===
          state.currentUser.id
      );

    if (
      !user ||
      user.status === "banned"
    ) {
      state.currentUser =
        null;

      saveState();

      return;
    }

    state.currentUser = {
      ...user
    };
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

        if (!link) return;

        const href =
          link.getAttribute("href");

        if (
          !href ||
          href === "#"
        ) {
          return;
        }

        const id =
          href.slice(1);

        if (
          document.getElementById(id)
        ) {
          setTimeout(
            renderRoute,
            0
          );
        }
      }
    );
  }

  function exposeDebugAPI() {
    window.KAKIKOMI = {
      state,

      save: saveState,

      reset() {
        localStorage.removeItem(
          STORAGE_KEY
        );

        localStorage.removeItem(
          "kakikomi_remember"
        );

        location.reload();
      },

      login,
      logout,
      register,
      createPost,
      deletePost,
      renderPosts,
      renderAccount,
      renderAdmin,

      clearData() {
        localStorage.removeItem(
          STORAGE_KEY
        );

        state.currentUser = null;
        state.posts = [];
        state.reports = [];
        state.notifications = [];
        state.users = [];
        state.privateBoards = [];
        state.bots = [];
        state.ipBans = [];

        seedData();

        renderAccount();
        renderPosts();
        renderAdmin();
      }
    };
  }

  function init() {
    showLoading(true);

    loadState();
    seedData();
    autoLogin();

    bindForms();
    bindClicks();
    bindCategoryFilter();
    bindHashNavigation();
    setupImagePreview();

    exposeDebugAPI();

    updateSiteTexts();
    renderAccount();
    renderPosts();
    renderNotifications();
    renderPrivateBoards();
    renderAdmin();
    renderAdminUsers();
    renderAdminPosts();
    renderAdminReports();
    renderAdminBots();
    renderAdminPrivateBoards();
    renderIpBans();
    loadSettingsForm();
    updateCharacterCount();
    updateHeaderState();
    renderRoute();

    showLoading(false);
  }

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
```
