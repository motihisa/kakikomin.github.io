/* =========================================================
   KAKIKOMI - script.js
   Supabase版
========================================================= */

"use strict";

/* =========================================================
   SUPABASE
========================================================= */

const SUPABASE_URL =
  "https://wtlmjaqyphmaeqhipqht.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_Mk4N_TF_cynZ53R7nmUyjQ_JeXsZ_Cs";

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

/* =========================================================
   STATE
========================================================= */

const state = {
  currentUser: null,
  currentProfile: null,

  posts: [],
  replies: [],
  likes: [],
  users: [],
  reports: [],
  ipBans: [],
  bots: [],
  privateBoards: [],
  siteSettings: null,

  currentCategory: "すべて",
  currentPostId: null
};

/* =========================================================
   BASIC HELPERS
========================================================= */

function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function escapeHTML(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(date) {
  if (!date) return "";

  const d = new Date(date);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatShortDate(date) {
  if (!date) return "";

  const d = new Date(date);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  return d.toLocaleDateString("ja-JP");
}

function categoryName(category) {
  return category || "その他";
}

function getProfileName(profile) {
  return (
    profile?.username ||
    profile?.name ||
    "ユーザー"
  );
}

function getCurrentUserId() {
  return state.currentUser?.id || null;
}

/* =========================================================
   TOAST
========================================================= */

function toast(message, type = "normal") {
  let container = $("#toast-container");

  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  const item = document.createElement("div");

  item.className =
    "toast" +
    (type === "error" ? " error" : "") +
    (type === "success" ? " success" : "");

  item.textContent = message;

  container.appendChild(item);

  setTimeout(() => {
    item.remove();
  }, 3500);
}

/* =========================================================
   LOADING
========================================================= */

function showLoading(show) {
  const loading = $("#global-loading");

  if (!loading) return;

  if (show) {
    loading.removeAttribute("hidden");
  } else {
    loading.setAttribute("hidden", "");
  }
}

/* =========================================================
   NAVIGATION
========================================================= */

function navigate(hash) {
  if (!hash) {
    hash = "#home";
  }

  if (!hash.startsWith("#")) {
    hash = "#" + hash;
  }

  if (location.hash !== hash) {
    location.hash = hash;
  } else {
    renderRoute();
  }
}

function renderRoute() {
  const hash =
    location.hash.replace("#", "") || "home";

  const sections =
    $$(".page-section");

  sections.forEach(section => {
    section.classList.remove("active");

    if (section.id === hash) {
      section.classList.add("active");
    }
  });

  if (hash === "home" || hash === "board") {
    renderPosts();
  }

  if (hash === "account") {
    renderAccount();
  }

  if (hash === "profile") {
    renderProfile();
  }

  if (hash === "notifications") {
    renderNotifications();
  }

  if (hash === "search") {
    searchPosts($("#search-input")?.value || "");
  }

  if (hash === "admin-page") {
    renderAdmin();
  }

  if (hash === "private-boards") {
    renderPrivateBoards();
  }

  updateHeaderState();
}

/* =========================================================
   HEADER
========================================================= */

function updateHeaderState() {
  const accountButton = $("#account-button");
  const loggedIn = $("#logged-in-account");
  const guest = $("#guest-account");

  if (state.currentUser) {
    accountButton?.classList.add("logged-in");
    loggedIn?.removeAttribute("hidden");
    guest?.setAttribute("hidden", "");

    if (accountButton) {
      accountButton.textContent =
        getProfileName(state.currentProfile);
    }
  } else {
    accountButton?.classList.remove("logged-in");
    loggedIn?.setAttribute("hidden", "");
    guest?.removeAttribute("hidden");

    if (accountButton) {
      accountButton.textContent = "アカウント";
    }
  }
}

/* =========================================================
   AUTH
========================================================= */

async function loadCurrentUser() {
  const {
    data,
    error
  } = await supabaseClient.auth.getUser();

  if (error || !data?.user) {
    state.currentUser = null;
    state.currentProfile = null;
    return;
  }

  state.currentUser = data.user;

  await loadCurrentProfile();
}

async function loadCurrentProfile() {
  if (!state.currentUser) {
    state.currentProfile = null;
    return;
  }

  const {
    data,
    error
  } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", state.currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("profile load error:", error);
    state.currentProfile = null;
    return;
  }

  state.currentProfile = data || null;
}

async function login(email, password) {
  showLoading(true);

  try {
    const {
      data,
      error
    } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error(error);
      toast(
        "メールアドレスまたはパスワードが違います。",
        "error"
      );
      return false;
    }

    state.currentUser = data.user;

    await loadCurrentProfile();

    if (!state.currentProfile) {
      toast(
        "プロフィールが見つかりません。",
        "error"
      );

      await supabaseClient.auth.signOut();

      state.currentUser = null;
      state.currentProfile = null;

      return false;
    }

    toast("ログインしました。", "success");

    updateHeaderState();

    navigate("#home");

    return true;
  } finally {
    showLoading(false);
  }
}

async function register(
  email,
  password,
  username
) {
  showLoading(true);

  try {
    const {
      data,
      error
    } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          username
        }
      }
    });

    if (error) {
      console.error(error);
      toast(
        error.message || "アカウント作成に失敗しました。",
        "error"
      );
      return false;
    }

    if (!data.user) {
      toast(
        "アカウントを作成できませんでした。",
        "error"
      );
      return false;
    }

    const userId = data.user.id;

    const {
      error: profileError
    } = await supabaseClient
      .from("profiles")
      .upsert(
        {
          id: userId,
          username: username,
          bio: "",
          role: "user"
        },
        {
          onConflict: "id"
        }
      );

    if (profileError) {
      console.error(
        "profile creation error:",
        profileError
      );

      toast(
        "アカウントは作成されましたが、プロフィール作成に失敗しました。",
        "error"
      );

      return false;
    }

    state.currentUser = data.user;

    await loadCurrentProfile();

    toast(
      "アカウントを作成しました。",
      "success"
    );

    navigate("#home");

    return true;
  } finally {
    showLoading(false);
  }
}

async function logout() {
  showLoading(true);

  try {
    const {
      error
    } = await supabaseClient.auth.signOut();

    if (error) {
      console.error(error);
      toast(
        "ログアウトに失敗しました。",
        "error"
      );
      return;
    }

    state.currentUser = null;
    state.currentProfile = null;

    updateHeaderState();

    toast(
      "ログアウトしました。",
      "success"
    );

    navigate("#home");
  } finally {
    showLoading(false);
  }
}

/* =========================================================
   POSTS
========================================================= */

async function loadPosts() {
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
        avatar_url,
        role
      )
    `)
    .order("created_at", {
      ascending: false
    });

  if (error) {
    console.error("posts load error:", error);
    toast(
      "投稿を読み込めませんでした。",
      "error"
    );
    state.posts = [];
    return;
  }

  state.posts = data || [];

  await loadLikeCounts();
  await loadReplyCounts();

  renderPosts();
}

async function loadLikeCounts() {
  if (!state.posts.length) {
    state.likes = [];
    return;
  }

  const ids = state.posts.map(post => post.id);

  const {
    data,
    error
  } = await supabaseClient
    .from("likes")
    .select("id, post_id, user_id, created_at")
    .in("post_id", ids);

  if (error) {
    console.error("likes load error:", error);
    state.likes = [];
    return;
  }

  state.likes = data || [];
}

async function loadReplyCounts() {
  if (!state.posts.length) {
    state.replies = [];
    return;
  }

  const ids = state.posts.map(post => post.id);

  const {
    data,
    error
  } = await supabaseClient
    .from("replies")
    .select(
      "id, post_id, user_id, content, created_at"
    )
    .in("post_id", ids)
    .order("created_at", {
      ascending: true
    });

  if (error) {
    console.error("replies load error:", error);
    state.replies = [];
    return;
  }

  state.replies = data || [];
}

function getLikeCount(postId) {
  return state.likes.filter(
    like => like.post_id === postId
  ).length;
}

function getReplyCount(postId) {
  return state.replies.filter(
    reply => reply.post_id === postId
  ).length;
}

function hasLiked(postId) {
  if (!state.currentUser) return false;

  return state.likes.some(
    like =>
      like.post_id === postId &&
      like.user_id === state.currentUser.id
  );
}

function canDeletePost(post) {
  if (!post || !state.currentUser) {
    return false;
  }

  if (post.user_id === state.currentUser.id) {
    return true;
  }

  return (
    state.currentProfile?.role === "admin"
  );
}

function renderPosts() {
  const list = $("#post-list");
  const noPosts = $("#no-posts");

  if (!list) return;

  let posts = [...state.posts];

  if (
    state.currentCategory &&
    state.currentCategory !== "すべて"
  ) {
    posts = posts.filter(
      post =>
        post.category === state.currentCategory
    );
  }

  if (!posts.length) {
    list.innerHTML = "";

    if (noPosts) {
      noPosts.removeAttribute("hidden");
    }

    updatePostCount();

    return;
  }

  noPosts?.setAttribute("hidden", "");

  list.innerHTML = posts
    .map(post => {
      const profile = post.profiles;

      const username =
        getProfileName(profile);

      const likeCount =
        getLikeCount(post.id);

      const replyCount =
        getReplyCount(post.id);

      const liked =
        hasLiked(post.id);

      const ownPost =
        canDeletePost(post);

      return `
        <article
          class="post-card"
          data-post-id="${escapeHTML(post.id)}"
          data-category="${escapeHTML(
            categoryName(post.category)
          )}"
        >

          <div class="post-card-header">

            <div class="post-user">

              <div class="avatar">
                ${escapeHTML(
                  username
                    .slice(0, 1)
                    .toUpperCase()
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

            <span class="post-category">
              ${escapeHTML(
                categoryName(post.category)
              )}
            </span>

          </div>

          <div class="post-card-body">

            <h3>
              ${escapeHTML(
                post.title || "無題の投稿"
              )}
            </h3>

            <p class="post-text">
              ${escapeHTML(post.content)}
            </p>

            ${
              post.image_url
                ? `
                  <img
                    src="${escapeHTML(
                      post.image_url
                    )}"
                    alt=""
                    class="post-image"
                  >
                `
                : ""
            }

          </div>

          <div class="post-card-footer">

            <button
              type="button"
              class="like-button ${
                liked ? "active" : ""
              }"
              data-action="like"
              data-post-id="${escapeHTML(
                post.id
              )}"
            >
              ♡
              <span class="like-count">
                ${likeCount}
              </span>
            </button>

            ${
              post.allow_replies
                ? `
                  <button
                    type="button"
                    class="reply-button"
                    data-action="reply"
                    data-post-id="${escapeHTML(
                      post.id
                    )}"
                  >
                    返信
                    <span class="reply-count">
                      ${replyCount}
                    </span>
                  </button>
                `
                : ""
            }

            ${
              post.allow_share
                ? `
                  <button
                    type="button"
                    class="share-button"
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

            ${
              state.currentUser
                ? `
                  <button
                    type="button"
                    class="report-button"
                    data-action="report"
                    data-post-id="${escapeHTML(
                      post.id
                    )}"
                  >
                    通報
                  </button>
                `
                : ""
            }

            ${
              ownPost
                ? `
                  <button
                    type="button"
                    class="danger-button"
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

        </article>
      `;
    })
    .join("");

  updatePostCount();
}

function updatePostCount() {
  const board = $("#board");

  if (!board) return;

  const count =
    state.posts.length;

  const element =
    board.querySelector(
      "[data-post-count]"
    );

  if (element) {
    element.textContent =
      String(count);
  }
}

async function createPost() {
  if (!state.currentUser) {
    toast(
      "投稿するにはログインしてください。",
      "error"
    );

    navigate("#login");
    return;
  }

  const category =
    $("#post-category")?.value.trim();

  const title =
    $("#post-title")?.value.trim();

  const content =
    $("#post-content")?.value.trim();

  const allowReplies =
    $("#allow-replies")?.checked ?? true;

  const allowShare =
    $("#allow-share")?.checked ?? true;

  if (!category) {
    toast(
      "カテゴリーを選択してください。",
      "error"
    );
    return;
  }

  if (!title) {
    toast(
      "タイトルを入力してください。",
      "error"
    );
    return;
  }

  if (!content) {
    toast(
      "本文を入力してください。",
      "error"
    );
    return;
  }

  showLoading(true);

  try {
    const {
      error
    } = await supabaseClient
      .from("posts")
      .insert({
        user_id: state.currentUser.id,
        category,
        title,
        content,
        image_url: null,
        allow_replies: allowReplies,
        allow_share: allowShare
      });

    if (error) {
      console.error(error);
      toast(
        "投稿に失敗しました。",
        "error"
      );
      return;
    }

    $("#post-form")?.reset();

    toast(
      "投稿しました。",
      "success"
    );

    await loadPosts();

    navigate("#board");
  } finally {
    showLoading(false);
  }
}

/* =========================================================
   LIKE
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

  const existing =
    state.likes.find(
      like =>
        like.post_id === postId &&
        like.user_id === state.currentUser.id
    );

  if (existing) {
    const {
      error
    } = await supabaseClient
      .from("likes")
      .delete()
      .eq("id", existing.id);

    if (error) {
      console.error(error);
      toast(
        "いいねを解除できませんでした。",
        "error"
      );
      return;
    }
  } else {
    const {
      error
    } = await supabaseClient
      .from("likes")
      .insert({
        post_id: postId,
        user_id: state.currentUser.id
      });

    if (error) {
      console.error(error);

      if (
        error.code === "23505"
      ) {
        await loadLikeCounts();
      } else {
        toast(
          "いいねに失敗しました。",
          "error"
        );
        return;
      }
    }
  }

  await loadLikeCounts();

  renderPosts();
}

/* =========================================================
   REPLY
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
      item => item.id === postId
    );

  if (!post) return;

  if (!post.allow_replies) {
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

  if (content === null) {
    return;
  }

  const text =
    content.trim();

  if (!text) {
    toast(
      "返信内容を入力してください。",
      "error"
    );
    return;
  }

  const {
    error
  } = await supabaseClient
    .from("replies")
    .insert({
      post_id: postId,
      user_id: state.currentUser.id,
      content: text
    });

  if (error) {
    console.error(error);
    toast(
      "返信に失敗しました。",
      "error"
    );
    return;
  }

  await loadReplyCounts();

  toast(
    "返信しました。",
    "success"
  );

  renderPosts();
}

/* =========================================================
   DELETE POST
========================================================= */

async function deletePost(postId) {
  if (!state.currentUser) {
    return;
  }

  const post =
    state.posts.find(
      item => item.id === postId
    );

  if (!post) return;

  if (!canDeletePost(post)) {
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

  if (!ok) return;

  await actuallyDeletePost(postId);
}

async function actuallyDeletePost(postId) {
  showLoading(true);

  try {
    await supabaseClient
      .from("likes")
      .delete()
      .eq("post_id", postId);

    await supabaseClient
      .from("replies")
      .delete()
      .eq("post_id", postId);

    const {
      error
    } = await supabaseClient
      .from("posts")
      .delete()
      .eq("id", postId);

    if (error) {
      console.error(error);
      toast(
        "投稿の削除に失敗しました。",
        "error"
      );
      return;
    }

    toast(
      "投稿を削除しました。",
      "success"
    );

    await loadPosts();
  } finally {
    showLoading(false);
  }
}

/* =========================================================
   SEARCH
========================================================= */

function searchPosts(query) {
  const results =
    $("#search-results");

  if (!results) return;

  const text =
    query.trim().toLowerCase();

  if (!text) {
    results.innerHTML =
      "<p>検索キーワードを入力してください。</p>";
    return;
  }

  const matched =
    state.posts.filter(post => {
      const target = [
        post.title,
        post.content,
        post.category,
        getProfileName(post.profiles)
      ]
        .join(" ")
        .toLowerCase();

      return target.includes(text);
    });

  if (!matched.length) {
    results.innerHTML =
      "<p>該当する投稿はありません。</p>";
    return;
  }

  results.innerHTML =
    matched
      .map(
        post => `
          <article
            class="search-result"
            data-search-post-id="${escapeHTML(
              post.id
            )}"
          >
            <strong>
              ${escapeHTML(
                post.title
              )}
            </strong>

            <p>
              ${escapeHTML(
                post.content
              )}
            </p>

            <small>
              ${escapeHTML(
                getProfileName(
                  post.profiles
                )
              )}
              ・
              ${escapeHTML(
                formatShortDate(
                  post.created_at
                )
              )}
            </small>
          </article>
        `
      )
      .join("");
}

/* =========================================================
   SHARE
========================================================= */

function openShare(postId) {
  const post =
    state.posts.find(
      item => item.id === postId
    );

  if (!post) return;

  state.currentPostId = postId;

  const url =
    `${location.origin}${location.pathname}#post-${postId}`;

  const input = $("#share-url");

  if (input) {
    input.value = url;
  }

  const share =
    $("#share");

  if (share) {
    share.classList.add("active");
  }

  const dialog =
    document.querySelector(
      "#share dialog"
    );

  if (dialog?.showModal) {
    dialog.showModal();
  }
}

async function copyShareUrl() {
  const input = $("#share-url");

  if (!input) return;

  try {
    await navigator.clipboard.writeText(
      input.value
    );

    toast(
      "共有URLをコピーしました。",
      "success"
    );
  } catch {
    input.select();
    fallbackCopy(input.value);
  }
}

function fallbackCopy(text) {
  const area =
    document.createElement("textarea");

  area.value = text;

  document.body.appendChild(area);

  area.select();

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

  area.remove();
}

/* =========================================================
   REPORT
========================================================= */

function openReport(postId) {
  if (!state.currentUser) {
    toast(
      "通報するにはログインしてください。",
      "error"
    );
    navigate("#login");
    return;
  }

  state.currentPostId = postId;

  const hidden =
    $("#report-post-id");

  if (hidden) {
    hidden.value = postId;
  }

  const modalPostId =
    $("#modal-report-post-id");

  if (modalPostId) {
    modalPostId.value = postId;
  }

  const dialog =
    $("#report-dialog");

  if (dialog?.showModal) {
    dialog.showModal();
  } else {
    dialog?.setAttribute(
      "open",
      ""
    );
  }
}

async function submitReport() {
  if (!state.currentUser) {
    toast(
      "ログインしてください。",
      "error"
    );
    return;
  }

  const postId =
    $("#report-post-id")?.value ||
    $("#modal-report-post-id")?.value ||
    state.currentPostId;

  const reason =
    $("#report-reason")?.value ||
    $("#modal-report-reason")?.value;

  const detail =
    $("#report-detail")?.value || "";

  if (!postId) {
    toast(
      "通報対象が見つかりません。",
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

  const {
    error
  } = await supabaseClient
    .from("reports")
    .insert({
      post_id: postId,
      reporter_id: state.currentUser.id,
      reason,
      detail,
      status: "pending"
    });

  if (error) {
    console.error(error);
    toast(
      "通報に失敗しました。",
      "error"
    );
    return;
  }

  $("#report-form")?.reset();

  $("#report-dialog")?.close();

  toast(
    "通報を送信しました。",
    "success"
  );
}

/* =========================================================
   PROFILE
========================================================= */

function renderProfile() {
  const profile =
    state.currentProfile;

  if (!profile) {
    $("#profile-name") &&
      ($("#profile-name").textContent =
        "ゲスト");

    return;
  }

  $("#profile-name") &&
    ($("#profile-name").textContent =
      getProfileName(profile));

  $("#profile-description") &&
    ($("#profile-description").textContent =
      profile.bio || "");

  const userPosts =
    state.posts.filter(
      post =>
        post.user_id ===
        state.currentUser?.id
    );

  $("#profile-post-count") &&
    ($("#profile-post-count").textContent =
      String(userPosts.length));
}

function renderAccount() {
  if (!state.currentUser) {
    $("#account-username") &&
      ($("#account-username").textContent =
        "ゲスト");

    $("#account-user-id") &&
      ($("#account-user-id").textContent =
        "");

    return;
  }

  const profile =
    state.currentProfile;

  $("#account-username") &&
    ($("#account-username").textContent =
      getProfileName(profile));

  $("#account-user-id") &&
    ($("#account-user-id").textContent =
      state.currentUser.id);

  $("#settings-username") &&
    ($("#settings-username").value =
      profile?.username || "");

  $("#settings-bio") &&
    ($("#settings-bio").value =
      profile?.bio || "");

  const role =
    profile?.role || "user";

  const adminLink =
    document.querySelector(
      '[data-navigate="#admin-page"]'
    );

  if (adminLink) {
    adminLink.style.display =
      role === "admin"
        ? ""
        : "none";
  }
}

/* =========================================================
   PROFILE SETTINGS
========================================================= */

async function updateProfile() {
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

  const {
    error
  } = await supabaseClient
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
    console.error(error);
    toast(
      "プロフィールの更新に失敗しました。",
      "error"
    );
    return;
  }

  await loadCurrentProfile();

  renderAccount();
  renderProfile();
  renderPosts();
  updateHeaderState();

  toast(
    "プロフィールを更新しました。",
    "success"
  );
}

/* =========================================================
   PASSWORD
========================================================= */

async function changePassword() {
  if (!state.currentUser) {
    toast(
      "ログインしてください。",
      "error"
    );
    return;
  }

  const current =
    $("#current-password")?.value;

  const password =
    $("#new-password")?.value;

  const confirm =
    $("#new-password-confirm")?.value;

  if (!current || !password || !confirm) {
    toast(
      "すべて入力してください。",
      "error"
    );
    return;
  }

  if (password !== confirm) {
    toast(
      "新しいパスワードが一致しません。",
      "error"
    );
    return;
  }

  if (password.length < 8) {
    toast(
      "パスワードは8文字以上にしてください。",
      "error"
    );
    return;
  }

  /*
    Supabase Authでは、現在のパスワード確認を
    updateUserだけでは行わないため、
    一度signInWithPasswordで確認する。
  */

  const {
    error: verifyError
  } = await supabaseClient.auth
    .signInWithPassword({
      email: state.currentUser.email,
      password: current
    });

  if (verifyError) {
    toast(
      "現在のパスワードが違います。",
      "error"
    );
    return;
  }

  const {
    error
  } = await supabaseClient.auth
    .updateUser({
      password
    });

  if (error) {
    console.error(error);
    toast(
      "パスワードの変更に失敗しました。",
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
   NOTIFICATIONS
========================================================= */

async function loadNotifications() {
  /*
    現在のDBにはnotificationsテーブルが
    必須ではないため、存在しない場合は
    空表示にする。
  */

  const list =
    $("#notification-list");

  if (!list) return;

  list.innerHTML =
    "<p>通知はありません。</p>";
}

function renderNotifications() {
  loadNotifications();
}

function markNotificationsRead() {
  toast(
    "通知を確認済みにしました。",
    "success"
  );
}

/* =========================================================
   ADMIN
========================================================= */

function ensureAdmin(showMessage = true) {
  if (
    !state.currentUser ||
    state.currentProfile?.role !== "admin"
  ) {
    if (showMessage) {
      toast(
        "管理者権限が必要です。",
        "error"
      );
    }

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
    reportsResult,
    bansResult,
    botsResult,
    boardsResult,
    settingsResult
  ] = await Promise.all([
    supabaseClient
      .from("profiles")
      .select("*")
      .order("created_at", {
        ascending: false
      }),

    supabaseClient
      .from("reports")
      .select("*")
      .order("created_at", {
        ascending: false
      }),

    supabaseClient
      .from("ip_bans")
      .select("*")
      .order("created_at", {
        ascending: false
      }),

    supabaseClient
      .from("bots")
      .select("*")
      .order("created_at", {
        ascending: false
      }),

    supabaseClient
      .from("private_boards")
      .select("*")
      .order("created_at", {
        ascending: false
      }),

    supabaseClient
      .from("site_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle()
  ]);

  state.users =
    usersResult.data || [];

  state.reports =
    reportsResult.data || [];

  state.ipBans =
    bansResult.data || [];

  state.bots =
    botsResult.data || [];

  state.privateBoards =
    boardsResult.data || [];

  state.siteSettings =
    settingsResult.data || null;

  if (usersResult.error) {
    console.error(
      "admin users error:",
      usersResult.error
    );
  }

  if (reportsResult.error) {
    console.error(
      "admin reports error:",
      reportsResult.error
    );
  }

  if (bansResult.error) {
    console.error(
      "admin bans error:",
      bansResult.error
    );
  }

  if (botsResult.error) {
    console.error(
      "admin bots error:",
      botsResult.error
    );
  }

  if (boardsResult.error) {
    console.error(
      "admin boards error:",
      boardsResult.error
    );
  }
}

async function renderAdmin() {
  if (!ensureAdmin()) {
    return;
  }

  showLoading(true);

  try {
    await loadAdminData();

    renderAdminUsers();
    renderAdminPosts();
    renderAdminReports();
    renderAdminBots();
    renderAdminPrivateBoards();
    renderIpBans();
    renderAdminSiteSettings();

    updateAdminCounts();
  } finally {
    showLoading(false);
  }
}

function updateAdminCounts() {
  $("#admin-user-count") &&
    ($("#admin-user-count").textContent =
      String(state.users.length));

  $("#admin-post-count") &&
    ($("#admin-post-count").textContent =
      String(state.posts.length));

  $("#admin-report-count") &&
    ($("#admin-report-count").textContent =
      String(state.reports.length));

  $("#admin-ban-count") &&
    ($("#admin-ban-count").textContent =
      String(state.ipBans.length));
}

function renderAdminUsers() {
  const tbody =
    $("#admin-users-table-body");

  if (!tbody) return;

  if (!state.users.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          ユーザーはいません。
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML =
    state.users
      .map(user => `
        <tr>
          <td>
            ${escapeHTML(
              user.username || "ユーザー"
            )}
          </td>

          <td>
            ${escapeHTML(
              user.id
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
            ${escapeHTML(
              formatShortDate(
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

  if (!state.posts.length) {
    list.innerHTML =
      "<p>投稿はありません。</p>";
    return;
  }

  list.innerHTML =
    state.posts
      .map(post => `
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
                getProfileName(
                  post.profiles
                )
              )}
              ・
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

  if (!state.reports.length) {
    list.innerHTML =
      "<p>通報はありません。</p>";
    return;
  }

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
                report.detail || ""
              )}
            </p>

            <small>
              投稿ID：
              ${escapeHTML(
                report.post_id || ""
              )}
              <br>
              状態：
              ${escapeHTML(
                report.status || "pending"
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
      `)
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
      .map(bot => `
        <article class="admin-bot-item">

          <strong>
            ${escapeHTML(
              bot.name || "Bot"
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
                bot.created_at
              )
            )}
          </small>

        </article>
      `)
      .join("");
}

function renderAdminPrivateBoards() {
  const list =
    $("#admin-private-board-list");

  const tbody =
    $("#admin-private-board-table-body");

  const target =
    list || tbody;

  if (!target) return;

  if (!state.privateBoards.length) {
    target.innerHTML =
      "<p>非公開掲示板はありません。</p>";
    return;
  }

  if (tbody) {
    tbody.innerHTML =
      state.privateBoards
        .map(board => `
          <tr>
            <td>
              ${escapeHTML(
                board.name || ""
              )}
            </td>

            <td>
              ${escapeHTML(
                board.code || ""
              )}
            </td>

            <td>
              ${escapeHTML(
                board.owner_id || ""
              )}
            </td>

            <td>
              ${escapeHTML(
                formatShortDate(
                  board.created_at
                )
              )}
            </td>
          </tr>
        `)
        .join("");

    return;
  }

  target.innerHTML =
    state.privateBoards
      .map(board => `
        <article>
          <strong>
            ${escapeHTML(
              board.name || ""
            )}
          </strong>

          <p>
            コード：
            ${escapeHTML(
              board.code || ""
            )}
          </p>
        </article>
      `)
      .join("");
}

function renderIpBans() {
  const tbody =
    $("#ip-ban-table-body");

  if (!tbody) return;

  if (!state.ipBans.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          IP BANはありません。
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML =
    state.ipBans
      .map(ban => `
        <tr>

          <td>
            ${escapeHTML(
              ban.ip_address ||
              ban.ip ||
              ""
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
            ${escapeHTML(
              formatDate(
                ban.created_at
              )
            )}
          </td>

          <td>
            <button
              type="button"
              class="danger-button"
              data-remove-ip-ban="${escapeHTML(
                ban.id
              )}"
            >
              解除
            </button>
          </td>

        </tr>
      `)
      .join("");
}

function renderAdminSiteSettings() {
  const settings =
    state.siteSettings;

  if (!settings) return;

  $("#site-name") &&
    ($("#site-name").value =
      settings.site_name || "");

  $("#site-description") &&
    ($("#site-description").value =
      settings.site_description || "");

  if (
    $("#site-maintenance-mode")
  ) {
    $("#site-maintenance-mode").checked =
      !!settings.maintenance_mode;
  }

  if (
    $("#site-posting-enabled")
  ) {
    $("#site-posting-enabled").checked =
      settings.posting_enabled !== false;
  }

  if (
    $("#site-registration-enabled")
  ) {
    $("#site-registration-enabled").checked =
      settings.registration_enabled !== false;
  }
}

/* =========================================================
   ADMIN USER UPDATE
========================================================= */

async function updateAdminUser() {
  if (!ensureAdmin()) return;

  const userId =
    $("#admin-target-user-id")?.value;

  if (!userId) {
    toast(
      "ユーザーが選択されていません。",
      "error"
    );
    return;
  }

  const username =
    $("#admin-target-username")?.value.trim();

  const status =
    $("#admin-target-status")?.value ||
    "active";

  const forcePasswordChange =
    $("#admin-force-password-change")
      ?.checked || false;

  const disablePosting =
    $("#admin-disable-posting")
      ?.checked || false;

  const disableReplies =
    $("#admin-disable-replies")
      ?.checked || false;

  const {
    error
  } = await supabaseClient
    .from("profiles")
    .update({
      username,
      status,
      force_password_change:
        forcePasswordChange,
      disable_posting:
        disablePosting,
      disable_replies:
        disableReplies,
      updated_at:
        new Date().toISOString()
    })
    .eq("id", userId);

  if (error) {
    console.error(error);
    toast(
      "ユーザー情報の更新に失敗しました。",
      "error"
    );
    return;
  }

  toast(
    "ユーザー情報を更新しました。",
    "success"
  );

  await renderAdmin();
}

/* =========================================================
   ADMIN IP BAN
========================================================= */

async function createIpBan() {
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

  const {
    error
  } = await supabaseClient
    .from("ip_bans")
    .insert({
      ip_address: ip,
      reason,
      duration,
      created_by:
        state.currentUser.id
    });

  if (error) {
    console.error(error);
    toast(
      "IP BANの登録に失敗しました。",
      "error"
    );
    return;
  }

  $("#ip-ban-form")?.reset();

  toast(
    "IP BANを登録しました。",
    "success"
  );

  await renderAdmin();
}

async function removeIpBan(id) {
  if (!ensureAdmin()) return;

  const {
    error
  } = await supabaseClient
    .from("ip_bans")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(error);
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

  await renderAdmin();
}

/* =========================================================
   ADMIN BOT
========================================================= */

async function createBot() {
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

  const {
    error
  } = await supabaseClient
    .from("bots")
    .insert({
      name,
      description,
      created_by:
        state.currentUser.id
    });

  if (error) {
    console.error(error);
    toast(
      "Botの作成に失敗しました。",
      "error"
    );
    return;
  }

  $("#create-bot-form")?.reset();

  $("#create-bot-dialog")?.close();

  toast(
    "Botを作成しました。",
    "success"
  );

  await renderAdmin();
}

/* =========================================================
   ADMIN SITE SETTINGS
========================================================= */

async function saveSiteSettings() {
  if (!ensureAdmin()) return;

  const siteName =
    $("#site-name")?.value.trim();

  const siteDescription =
    $("#site-description")?.value.trim();

  const maintenanceMode =
    $("#site-maintenance-mode")
      ?.checked || false;

  const postingEnabled =
    $("#site-posting-enabled")
      ?.checked !== false;

  const registrationEnabled =
    $("#site-registration-enabled")
      ?.checked !== false;

  const {
    error
  } = await supabaseClient
    .from("site_settings")
    .upsert({
      id: 1,
      site_name: siteName,
      site_description:
        siteDescription,
      maintenance_mode:
        maintenanceMode,
      posting_enabled:
        postingEnabled,
      registration_enabled:
        registrationEnabled,
      updated_at:
        new Date().toISOString()
    });

  if (error) {
    console.error(error);
    toast(
      "サイト設定の保存に失敗しました。",
      "error"
    );
    return;
  }

  toast(
    "サイト設定を保存しました。",
    "success"
  );

  await loadSiteSettings();
}

/* =========================================================
   PRIVATE BOARD
========================================================= */

async function loadPrivateBoards() {
  const {
    data,
    error
  } = await supabaseClient
    .from("private_boards")
    .select("*")
    .order("created_at", {
      ascending: false
    });

  if (error) {
    console.error(error);
    state.privateBoards = [];
    return;
  }

  state.privateBoards =
    data || [];
}

function renderPrivateBoards() {
  const list =
    $("#private-board-list");

  if (!list) return;

  if (!state.privateBoards.length) {
    list.innerHTML =
      "<p>非公開掲示板はありません。</p>";
    return;
  }

  list.innerHTML =
    state.privateBoards
      .map(board => `
        <article class="private-board-item">

          <h3>
            ${escapeHTML(
              board.name || "非公開掲示板"
            )}
          </h3>

          <p>
            作成日：
            ${escapeHTML(
              formatDate(
                board.created_at
              )
            )}
          </p>

        </article>
      `)
      .join("");
}

async function createPrivateBoard() {
  if (!state.currentUser) {
    toast(
      "ログインしてください。",
      "error"
    );
    navigate("#login");
    return;
  }

  const name =
    window.prompt(
      "非公開掲示板の名前を入力してください。"
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
      .slice(2, 10)
      .toUpperCase();

  const {
    error
  } = await supabaseClient
    .from("private_boards")
    .insert({
      name: boardName,
      code,
      owner_id:
        state.currentUser.id
    });

  if (error) {
    console.error(error);
    toast(
      "非公開掲示板の作成に失敗しました。",
      "error"
    );
    return;
  }

  await loadPrivateBoards();

  renderPrivateBoards();

  toast(
    `掲示板を作成しました。コード：${code}`,
    "success"
  );
}

async function joinPrivateBoard() {
  const code =
    $("#private-board-code")
      ?.value
      .trim()
      .toUpperCase();

  if (!code) {
    toast(
      "コードを入力してください。",
      "error"
    );
    return;
  }

  const {
    data,
    error
  } = await supabaseClient
    .from("private_boards")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error || !data) {
    toast(
      "掲示板が見つかりません。",
      "error"
    );
    return;
  }

  toast(
    `${data.name} が見つかりました。`,
    "success"
  );
}

/* =========================================================
   SITE SETTINGS LOAD
========================================================= */

async function loadSiteSettings() {
  const {
    data,
    error
  } = await supabaseClient
    .from("site_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error(
      "site settings error:",
      error
    );
    return;
  }

  state.siteSettings = data || null;

  if (!data) return;

  if ($("#site-logo")) {
    $("#site-logo").textContent =
      data.site_name ||
      "KAKIKOMI";
  }

  if ($("#site-name-display")) {
    $("#site-name-display").textContent =
      data.site_name ||
      "KAKIKOMI";
  }
}

/* =========================================================
   DELETE ACCOUNT
========================================================= */

async function deleteAccount() {
  if (!state.currentUser) {
    return;
  }

  const ok =
    window.confirm(
      "本当にアカウントを削除しますか？"
    );

  if (!ok) return;

  const userId =
    state.currentUser.id;

  /*
    ブラウザからSupabase Authの
    auth.users自体を削除することはできない。
    そのため、公開プロフィールと投稿データを
    削除してからログアウトする。
  */

  await supabaseClient
    .from("likes")
    .delete()
    .eq(
      "user_id",
      userId
    );

  await supabaseClient
    .from("replies")
    .delete()
    .eq(
      "user_id",
      userId
    );

  await supabaseClient
    .from("posts")
    .delete()
    .eq(
      "user_id",
      userId
    );

  await supabaseClient
    .from("profiles")
    .delete()
    .eq(
      "id",
      userId
    );

  await logout();
}

/* =========================================================
   FORMS
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
            ?.value;

        if (!email || !password) {
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

        const username =
          $("#register-username")
            ?.value
            .trim();

        const password =
          $("#register-password")
            ?.value;

        const confirm =
          $("#register-password-confirm")
            ?.value;

        if (
          !email ||
          !username ||
          !password ||
          !confirm
        ) {
          toast(
            "すべて入力してください。",
            "error"
          );
          return;
        }

        if (password !== confirm) {
          toast(
            "パスワードが一致しません。",
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

  $("#profile-settings-form")
    ?.addEventListener(
      "submit",
      async event => {
        event.preventDefault();
        await updateProfile();
      }
    );

  $("#change-password-form")
    ?.addEventListener(
      "submit",
      async event => {
        event.preventDefault();
        await changePassword();
      }
    );

  $("#report-form")
    ?.addEventListener(
      "submit",
      async event => {
        event.preventDefault();
        await submitReport();
      }
    );

  $("#modal-report-form")
    ?.addEventListener(
      "submit",
      async event => {
        event.preventDefault();
        await submitReport();
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

  $("#admin-user-settings-form")
    ?.addEventListener(
      "submit",
      async event => {
        event.preventDefault();
        await updateAdminUser();
      }
    );

  $("#ip-ban-form")
    ?.addEventListener(
      "submit",
      async event => {
        event.preventDefault();
        await createIpBan();
      }
    );

  $("#create-bot-form")
    ?.addEventListener(
      "submit",
      async event => {
        event.preventDefault();
        await createBot();
      }
    );

  $("#admin-site-settings-form")
    ?.addEventListener(
      "submit",
      async event => {
        event.preventDefault();
        await saveSiteSettings();
      }
    );

  $("#join-private-board-form")
    ?.addEventListener(
      "submit",
      async event => {
        event.preventDefault();
        await joinPrivateBoard();
      }
    );

  $("#delete-account-form")
    ?.addEventListener(
      "submit",
      async event => {
        event.preventDefault();
        await deleteAccount();
      }
    );
}

/* =========================================================
   CLICKS
========================================================= */

function bindClicks() {
  document.addEventListener(
    "click",
    async event => {

      /* -----------------------------------------
         Navigation
      ----------------------------------------- */

      const navigation =
        event.target.closest(
          "[data-navigate]"
        );

      if (navigation) {
        const target =
          navigation.dataset.navigate;

        navigate(target);

        return;
      }

      /* -----------------------------------------
         Logout
      ----------------------------------------- */

      if (
        event.target.closest(
          "#logout-button"
        )
      ) {
        await logout();
        return;
      }

      /* -----------------------------------------
         Notification
      ----------------------------------------- */

      if (
        event.target.closest(
          "#notification-button"
        )
      ) {
        navigate("#notifications");
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

      /* -----------------------------------------
         Post actions
      ----------------------------------------- */

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
          await toggleLike(postId);
          return;
        }

        if (action === "reply") {
          await replyToPost(postId);
          return;
        }

        if (action === "share") {
          openShare(postId);
          return;
        }

        if (action === "report") {
          openReport(postId);
          return;
        }

        if (action === "delete") {
          await deletePost(postId);
          return;
        }
      }

      /* -----------------------------------------
         Admin user
      ----------------------------------------- */

      const adminUser =
        event.target.closest(
          "[data-admin-user]"
        );

      if (adminUser) {
        if (!ensureAdmin()) return;

        const user =
          state.users.find(
            item =>
              item.id ===
              adminUser.dataset.adminUser
          );

        if (!user) return;

        $("#admin-target-user-id") &&
          ($("#admin-target-user-id").value =
            user.id);

        $("#admin-target-username") &&
          ($("#admin-target-username").value =
            user.username || "");

        $("#admin-target-status") &&
          ($("#admin-target-status").value =
            user.status || "active");

        $("#admin-force-password-change") &&
          ($("#admin-force-password-change").checked =
            !!user.force_password_change);

        $("#admin-disable-posting") &&
          ($("#admin-disable-posting").checked =
            !!user.disable_posting);

        $("#admin-disable-replies") &&
          ($("#admin-disable-replies").checked =
            !!user.disable_replies);

        navigate(
          "#admin-user-detail"
        );

        return;
      }

      /* -----------------------------------------
         Admin delete post
      ----------------------------------------- */

      const adminDeletePost =
        event.target.closest(
          "[data-admin-delete-post]"
        );

      if (adminDeletePost) {
        if (!ensureAdmin()) return;

        await actuallyDeletePost(
          adminDeletePost.dataset
            .adminDeletePost
        );

        await renderAdmin();

        return;
      }

      /* -----------------------------------------
         Report status
      ----------------------------------------- */

      const reportStatus =
        event.target.closest(
          "[data-report-status]"
        );

      if (reportStatus) {
        if (!ensureAdmin()) return;

        const id =
          reportStatus.dataset.reportId;

        const status =
          reportStatus.dataset.reportStatus;

        const {
          error
        } = await supabaseClient
          .from("reports")
          .update({
            status
          })
          .eq("id", id);

        if (error) {
          console.error(error);
          toast(
            "通報状態の更新に失敗しました。",
            "error"
          );
          return;
        }

        toast(
          "通報状態を更新しました。",
          "success"
        );

        await renderAdmin();

        return;
      }

      /* -----------------------------------------
         Remove IP BAN
      ----------------------------------------- */

      const removeBan =
        event.target.closest(
          "[data-remove-ip-ban]"
        );

      if (removeBan) {
        await removeIpBan(
          removeBan.dataset
            .removeIpBan
        );

        return;
      }

      /* -----------------------------------------
         Create bot
      ----------------------------------------- */

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
        } else {
          dialog?.setAttribute(
            "open",
            ""
          );
        }

        return;
      }

      /* -----------------------------------------
         Copy share URL
      ----------------------------------------- */

      if (
        event.target.closest(
          "#copy-share-url"
        )
      ) {
        await copyShareUrl();
        return;
      }

      /* -----------------------------------------
         Create private board
      ----------------------------------------- */

      if (
        event.target.closest(
          "#create-private-board-button"
        )
      ) {
        await createPrivateBoard();
        return;
      }

      /* -----------------------------------------
         Close modal
      ----------------------------------------- */

      const close =
        event.target.closest(
          "[data-close-modal]"
        );

      if (close) {
        const id =
          close.dataset.closeModal;

        const dialog =
          document.getElementById(id);

        if (dialog?.close) {
          dialog.close();
        } else {
          dialog?.removeAttribute(
            "open"
          );
        }

        return;
      }

      /* -----------------------------------------
         Category
      ----------------------------------------- */

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

      /* -----------------------------------------
         Search result
      ----------------------------------------- */

      const result =
        event.target.closest(
          "[data-search-post-id]"
        );

      if (result) {
        const id =
          result.dataset.searchPostId;

        const post =
          state.posts.find(
            item => item.id === id
          );

        if (post) {
          state.currentCategory =
            "すべて";

          navigate("#board");

          setTimeout(() => {
            const element =
              document.querySelector(
                `[data-post-id="${CSS.escape(id)}"]`
              );

            element?.scrollIntoView({
              behavior: "smooth",
              block: "center"
            });
          }, 100);
        }

        return;
      }

      /* -----------------------------------------
         Account
      ----------------------------------------- */

      if (
        event.target.closest(
          "#account-button"
        )
      ) {
        if (state.currentUser) {
          navigate("#account");
        } else {
          navigate("#login");
        }

        return;
      }

      /* -----------------------------------------
         Follow
      ----------------------------------------- */

      if (
        event.target.closest(
          "#follow-button"
        )
      ) {
        if (!state.currentUser) {
          toast(
            "ログインしてください。",
            "error"
          );
          navigate("#login");
          return;
        }

        const button =
          $("#follow-button");

        button?.classList.toggle(
          "active"
        );

        toast(
          button?.classList.contains(
            "active"
          )
            ? "フォローしました。"
            : "フォローを解除しました。",
          "success"
        );

        return;
      }
    }
  );
}

/* =========================================================
   CATEGORY FILTER
========================================================= */

function bindCategoryFilter() {
  const filter =
    $("#board-category-filter");

  if (!filter) return;

  filter.addEventListener(
    "change",
    () => {
      state.currentCategory =
        filter.value || "すべて";

      renderPosts();
    }
  );
}

/* =========================================================
   CHARACTER COUNT
========================================================= */

function updateCharacterCount() {
  const textarea =
    $("#post-content");

  const counter =
    $("#post-character-count");

  if (!textarea || !counter) {
    return;
  }

  counter.textContent =
    String(textarea.value.length);
}

/* =========================================================
   IMAGE PREVIEW
========================================================= */

function setupImagePreview() {
  const input =
    $("#post-image");

  const preview =
    $("#image-preview");

  if (!input || !preview) {
    return;
  }

  input.addEventListener(
    "change",
    () => {
      const file =
        input.files?.[0];

      if (!file) {
        preview.setAttribute(
          "hidden",
          ""
        );

        preview.removeAttribute(
          "src"
        );

        return;
      }

      const url =
        URL.createObjectURL(file);

      preview.src = url;

      preview.removeAttribute(
        "hidden"
      );
    }
  );
}

/* =========================================================
   HASH NAVIGATION
========================================================= */

function bindHashNavigation() {
  window.addEventListener(
    "hashchange",
    renderRoute
  );
}

/* =========================================================
   SUPABASE AUTH STATE
========================================================= */

function bindAuthState() {
  supabaseClient.auth.onAuthStateChange(
    async (event, session) => {

      if (session?.user) {
        state.currentUser =
          session.user;

        setTimeout(
          async () => {
            await loadCurrentProfile();
            updateHeaderState();
            renderAccount();
          },
          0
        );

      } else {
        state.currentUser = null;
        state.currentProfile = null;

        updateHeaderState();
      }
    }
  );
}

/* =========================================================
   ADMIN SEARCH
========================================================= */

function bindAdminSearch() {
  $("#admin-user-search-form")
    ?.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        const query =
          $("#admin-user-search")
            ?.value
            .trim()
            .toLowerCase();

        const tbody =
          $("#admin-users-table-body");

        if (!tbody) return;

        if (!query) {
          renderAdminUsers();
          return;
        }

        const users =
          state.users.filter(
            user => {
              const target = [
                user.username,
                user.id,
                user.role,
                user.status
              ]
                .join(" ")
                .toLowerCase();

              return target.includes(
                query
              );
            }
          );

        if (!users.length) {
          tbody.innerHTML = `
            <tr>
              <td colspan="6">
                ユーザーが見つかりません。
              </td>
            </tr>
          `;

          return;
        }

        tbody.innerHTML =
          users
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
                    formatShortDate(
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
    );
}

/* =========================================================
   INIT
========================================================= */

async function init() {
  console.log(
    "KAKIKOMI / Supabase initialized"
  );

  showLoading(true);

  try {
    bindForms();
    bindClicks();
    bindCategoryFilter();
    bindHashNavigation();
    bindAuthState();
    bindAdminSearch();
    setupImagePreview();

    $("#post-content")
      ?.addEventListener(
        "input",
        updateCharacterCount
      );

    await loadCurrentUser();

    await loadPosts();

    await loadPrivateBoards();

    await loadSiteSettings();

    updateHeaderState();

    renderAccount();

    renderProfile();

    renderRoute();

  } catch (error) {
    console.error(
      "KAKIKOMI init error:",
      error
    );

    toast(
      "ページの読み込み中にエラーが発生しました。",
      "error"
    );
  } finally {
    showLoading(false);
  }
}

/* =========================================================
   START
========================================================= */

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    init
  );
} else {
  init();
}
