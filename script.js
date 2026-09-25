/* =========================================================
   KAKIKOMI
   script.js
   Supabase対応・総合掲示板フロントエンド
========================================================= */

"use strict";

/* =========================================================
   0. SUPABASE CONFIG
========================================================= */

/*
  ここを自分のSupabaseプロジェクトに変更。

  Supabase Dashboard
  → Project Settings
  → API

  SUPABASE_URL:
  https://xxxxxxxxxxxx.supabase.co

  SUPABASE_ANON_KEY:
  eyJ...
*/

const SUPABASE_URL =
  window.KAKIKOMI_SUPABASE_URL ||
  "YOUR_SUPABASE_URL";

const SUPABASE_ANON_KEY =
  window.KAKIKOMI_SUPABASE_ANON_KEY ||
  "YOUR_SUPABASE_ANON_KEY";


/* =========================================================
   1. SUPABASE CLIENT
========================================================= */

let supabase = null;

function initSupabase() {

  if (
    typeof window.supabase === "undefined" ||
    !window.supabase.createClient
  ) {
    console.error(
      "Supabase JSが読み込まれていません。"
    );

    return false;
  }

  if (
    SUPABASE_URL === "YOUR_SUPABASE_URL" ||
    SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY"
  ) {
    console.warn(
      "Supabase URL / ANON KEY が設定されていません。"
    );

    return false;
  }

  supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  return true;
}


/* =========================================================
   2. STATE
========================================================= */

const state = {

  initialized: false,

  user: null,

  profile: null,

  session: null,

  posts: [],

  notifications: [],

  users: [],

  reports: [],

  ipBans: [],

  bots: [],

  privateBoards: [],

  currentBoardSort: "new",

  currentCategory: "all",

  currentAdminPostFilter: "all",

  currentProfileId: null,

  loading: false

};


/* =========================================================
   3. DOM HELPER
========================================================= */

const $ = (selector) => {
  return document.querySelector(selector);
};

const $$ = (selector) => {
  return Array.from(
    document.querySelectorAll(selector)
  );
};

function byId(id) {
  return document.getElementById(id);
}


/* =========================================================
   4. BASIC HELPERS
========================================================= */

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

  if (!date) {
    return "";
  }

  const d = new Date(date);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "ja-JP",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }
  ).format(d);
}


function getInitial(name) {

  if (!name) {
    return "?";
  }

  return String(name).trim().charAt(0).toUpperCase();
}


function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}


/* =========================================================
   5. TOAST
========================================================= */

function toast(message, type = "normal") {

  const container =
    byId("toast-container");

  if (!container) {
    alert(message);
    return;
  }

  const element =
    document.createElement("div");

  element.className = "toast";

  if (type === "error") {
    element.style.background = "#d9363e";
  }

  if (type === "success") {
    element.style.background = "#16845b";
  }

  element.textContent = message;

  container.appendChild(element);

  setTimeout(() => {

    element.style.opacity = "0";
    element.style.transform =
      "translateY(8px)";

    setTimeout(() => {
      element.remove();
    }, 200);

  }, 3000);
}


/* =========================================================
   6. LOADING
========================================================= */

function setLoading(visible, text = "読み込み中...") {

  const loading =
    byId("global-loading");

  if (!loading) {
    return;
  }

  const p =
    loading.querySelector("p");

  if (p) {
    p.textContent = text;
  }

  loading.hidden = !visible;

  state.loading = visible;
}


/* =========================================================
   7. ERROR HANDLING
========================================================= */

function handleError(error, userMessage = "エラーが発生しました。") {

  console.error(error);

  toast(
    userMessage,
    "error"
  );
}


/* =========================================================
   8. NAVIGATION
========================================================= */

const PUBLIC_SECTIONS = [
  "home",
  "board",
  "create-post",
  "questions",
  "consultations",
  "search",
  "private-boards",
  "account",
  "login",
  "register",
  "profile",
  "notifications",
  "report",
  "share",
  "account-settings",
  "security-settings",
  "bot",
  "rules",
  "error-page"
];


function navigate(hash) {

  if (!hash) {
    hash = "#home";
  }

  if (!hash.startsWith("#")) {
    hash = "#" + hash;
  }

  history.pushState(
    {},
    "",
    hash
  );

  renderRoute();
}


function getRoute() {

  const hash =
    location.hash.replace("#", "");

  return hash || "home";
}


function renderRoute() {

  const route = getRoute();

  const allSections =
    $$("main section");

  allSections.forEach(section => {

    section.hidden =
      section.id !== route &&
      !(
        route === "category-one-word" &&
        section.id === "board"
      ) &&
      !(
        route === "category-board" &&
        section.id === "board"
      ) &&
      !(
        route === "category-question" &&
        section.id === "questions"
      ) &&
      !(
        route === "category-consultation" &&
        section.id === "consultations"
      ) &&
      !(
        route === "category-wish" &&
        section.id === "board"
      ) &&
      !(
        route === "category-joke" &&
        section.id === "board"
      ) &&
      !(
        route === "category-other" &&
        section.id === "board"
      );
  });

  if (
    route.startsWith("user/")
  ) {

    const id =
      route.substring("user/".length);

    showProfile(id);

    return;
  }

  if (route.startsWith("post/")) {

    const id =
      route.substring("post/".length);

    navigateToPost(id);

    return;
  }

  if (
    route.startsWith("category-")
  ) {

    const categoryMap = {

      "category-one-word": "一言",
      "category-board": "掲示板",
      "category-question": "質問",
      "category-consultation": "相談",
      "category-wish": "願い事",
      "category-joke": "ネタ",
      "category-other": "その他"

    };

    const category =
      categoryMap[route];

    if (category) {

      const select =
        byId("board-category");

      if (select) {
        select.value = category;
      }

      state.currentCategory =
        category;

      loadPosts();

      const board =
        byId("board");

      if (board) {
        board.hidden = false;
      }
    }
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


function navigateToPost(postId) {

  const post =
    state.posts.find(
      item => String(item.id) === String(postId)
    );

  if (!post) {

    toast(
      "投稿が見つかりません。",
      "error"
    );

    return;
  }

  navigate("#board");

  setTimeout(() => {

    const element =
      document.querySelector(
        `[data-post-id="${CSS.escape(String(postId))}"]`
      );

    if (element) {

      element.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      element.style.outline =
        "3px solid rgba(0,0,0,.25)";

      setTimeout(() => {

        element.style.outline = "";

      }, 1500);
    }

  }, 100);
}


/* =========================================================
   9. NAVIGATION EVENTS
========================================================= */

function setupNavigation() {

  document.addEventListener(
    "click",
    event => {

      const link =
        event.target.closest("a[href^='#']");

      if (!link) {
        return;
      }

      const href =
        link.getAttribute("href");

      if (!href || href === "#") {
        return;
      }

      if (
        href.startsWith("#category-") ||
        href.startsWith("#user/") ||
        href.startsWith("#post/")
      ) {
        event.preventDefault();

        navigate(href);
      }
    }
  );


  window.addEventListener(
    "popstate",
    renderRoute
  );


  window.addEventListener(
    "hashchange",
    renderRoute
  );
}


/* =========================================================
   10. AUTH SESSION
========================================================= */

async function loadSession() {

  if (!supabase) {
    return;
  }

  const {
    data,
    error
  } = await supabase.auth.getSession();

  if (error) {
    handleError(
      error,
      "ログイン状態を確認できませんでした。"
    );

    return;
  }

  state.session =
    data.session;

  state.user =
    data.session?.user || null;

  await updateAccountUI();

  if (state.user) {
    await loadCurrentProfile();
  }
}


function setupAuthListener() {

  if (!supabase) {
    return;
  }

  supabase.auth.onAuthStateChange(
    async (_event, session) => {

      state.session =
        session;

      state.user =
        session?.user || null;

      await updateAccountUI();

      if (state.user) {
        await loadCurrentProfile();
      } else {
        state.profile = null;
      }
    }
  );
}


/* =========================================================
   11. ACCOUNT UI
========================================================= */

async function updateAccountUI() {

  const guest =
    byId("guest-account");

  const loggedIn =
    byId("logged-in-account");

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

  const username =
    byId("account-username");

  const userId =
    byId("account-user-id");

  if (username) {

    username.textContent =
      state.profile?.username ||
      state.user.email ||
      "ユーザー";
  }

  if (userId) {

    userId.textContent =
      state.user.id;
  }
}


/* =========================================================
   12. PROFILE
========================================================= */

async function loadCurrentProfile() {

  if (!supabase || !state.user) {
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

    console.error(
      "プロフィール取得エラー:",
      error
    );

    return null;
  }

  state.profile =
    data;

  await updateAccountUI();

  return data;
}


async function showProfile(userId) {

  if (!supabase) {
    return;
  }

  setLoading(
    true,
    "プロフィールを読み込んでいます..."
  );

  try {

    const {
      data: profile,
      error
    } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!profile) {

      toast(
        "ユーザーが見つかりません。",
        "error"
      );

      navigate("#error-page");

      return;
    }

    state.currentProfileId =
      userId;

    const name =
      byId("profile-name");

    const description =
      byId("profile-description");

    const postCount =
      byId("profile-post-count");

    const followers =
      byId("profile-followers");

    const following =
      byId("profile-following");

    if (name) {
      name.textContent =
        profile.username || "名無し";
    }

    if (description) {
      description.textContent =
        profile.bio || "";
    }

    if (postCount) {
      postCount.textContent =
        profile.post_count ?? 0;
    }

    if (followers) {
      followers.textContent =
        profile.followers_count ?? 0;
    }

    if (following) {
      following.textContent =
        profile.following_count ?? 0;
    }

    await loadProfilePosts(userId);

    navigate("#profile");

  } catch (error) {

    handleError(
      error,
      "プロフィールを読み込めませんでした。"
    );

  } finally {

    setLoading(false);
  }
}


async function loadProfilePosts(userId) {

  if (!supabase) {
    return;
  }

  const container =
    byId("profile-posts");

  if (!container) {
    return;
  }

  const {
    data,
    error
  } = await supabase
    .from("posts")
    .select("*")
    .eq("user_id", userId)
    .eq("is_hidden", false)
    .order("created_at", {
      ascending: false
    });

  if (error) {

    console.error(error);

    return;
  }

  renderPostList(
    container,
    data || []
  );
}


/* =========================================================
   13. POSTS
========================================================= */

async function loadPosts() {

  if (!supabase) {
    renderSamplePosts();
    return;
  }

  const container =
    byId("post-list");

  if (!container) {
    return;
  }

  setLoading(
    true,
    "投稿を読み込んでいます..."
  );

  try {

    let query =
      supabase
        .from("posts")
        .select(`
          *,
          profiles:user_id (
            id,
            username,
            bio
          )
        `)
        .eq("is_hidden", false);

    if (
      state.currentCategory !== "all"
    ) {

      query =
        query.eq(
          "category",
          state.currentCategory
        );
    }


    if (
      state.currentBoardSort === "popular"
    ) {

      query =
        query.order(
          "like_count",
          {
            ascending: false
          }
        );

    } else {

      query =
        query.order(
          "created_at",
          {
            ascending: false
          }
        );
    }


    const {
      data,
      error
    } = await query;

    if (error) {
      throw error;
    }

    state.posts =
      data || [];

    renderPostList(
      container,
      state.posts
    );

  } catch (error) {

    handleError(
      error,
      "投稿を読み込めませんでした。"
    );

  } finally {

    setLoading(false);
  }
}


function renderSamplePosts() {

  const container =
    byId("post-list");

  if (!container) {
    return;
  }

  const sample =
    container.querySelector(
      '[data-post-id="sample-post-1"]'
    );

  if (sample) {
    sample.hidden = false;
  }
}


function renderPostList(container, posts) {

  if (!container) {
    return;
  }

  const empty =
    byId("no-posts");

  if (!posts.length) {

    container.innerHTML = "";

    if (empty) {
      empty.hidden = false;
      container.appendChild(empty);
    }

    return;
  }

  if (empty) {
    empty.remove();
  }

  container.innerHTML =
    posts.map(renderPostHTML).join("");
}


function renderPostHTML(post) {

  const profile =
    post.profiles || {};

  const username =
    profile.username ||
    post.username ||
    "名無し";

  const initial =
    getInitial(username);

  const title =
    post.title
      ? `
        <h2 style="
          margin:0 0 8px;
          font-size:18px;
        ">
          ${escapeHTML(post.title)}
        </h2>
      `
      : "";

  const image =
    post.image_url
      ? `
        <div style="margin-top:15px;">
          <img
            src="${escapeHTML(post.image_url)}"
            alt="投稿画像"
            loading="lazy"
            style="
              max-height:420px;
              border-radius:12px;
            "
          >
        </div>
      `
      : "";

  return `
    <article
      class="post-card"
      data-post-id="${escapeHTML(post.id)}"
      data-category="${escapeHTML(post.category || "その他")}"
    >

      <div class="post-card-header">

        <div class="post-user">

          <div class="user-avatar">
            ${escapeHTML(initial)}
          </div>

          <div class="user-information">

            <a
              href="#user/${escapeHTML(post.user_id)}"
              class="username"
            >
              ${escapeHTML(username)}
            </a>

            <time
              class="post-time"
              datetime="${escapeHTML(post.created_at || "")}"
            >
              ${escapeHTML(formatDate(post.created_at))}
            </time>

          </div>

        </div>

        <span class="post-category">
          ${escapeHTML(post.category || "その他")}
        </span>

      </div>

      <div class="post-card-body">

        ${title}

        <p class="post-text">
          ${escapeHTML(post.content || "")}
        </p>

        ${image}

      </div>

      <div class="post-card-footer">

        <button
          type="button"
          class="post-action like-button"
          data-action="like"
          data-post-id="${escapeHTML(post.id)}"
        >
          ♡
          <span class="like-count">
            ${Number(post.like_count || 0)}
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
            ${Number(post.reply_count || 0)}
          </span>
        </button>

        <button
          type="button"
          class="post-action"
          data-action="share"
          data-post-id="${escapeHTML(post.id)}"
        >
          共有
        </button>

        <button
          type="button"
          class="post-action report-button"
          data-action="report"
          data-post-id="${escapeHTML(post.id)}"
        >
          通報
        </button>

      </div>

    </article>
  `;
}


/* =========================================================
   14. POST SORT / FILTER
========================================================= */

function setupBoardControls() {

  $$(".board-tab").forEach(
    button => {

      button.addEventListener(
        "click",
        async () => {

          $$(".board-tab")
            .forEach(
              item =>
                item.classList.remove("active")
            );

          button.classList.add("active");

          state.currentBoardSort =
            button.dataset.sort;

          await loadPosts();
        }
      );
    }
  );


  const category =
    byId("board-category");

  if (category) {

    category.addEventListener(
      "change",
      async () => {

        state.currentCategory =
          category.value;

        await loadPosts();
      }
    );
  }
}


/* =========================================================
   15. CREATE POST
========================================================= */

function setupPostForm() {

  const form =
    byId("post-form");

  if (!form) {
    return;
  }

  const content =
    byId("post-content");

  const counter =
    byId("post-character-count");

  if (content && counter) {

    const updateCounter =
      () => {

        counter.textContent =
          `${content.value.length}文字`;
      };

    content.addEventListener(
      "input",
      updateCounter
    );

    updateCounter();
  }


  const image =
    byId("post-image");

  const preview =
    byId("image-preview");

  if (image && preview) {

    image.addEventListener(
      "change",
      () => {

        preview.innerHTML = "";

        const file =
          image.files?.[0];

        if (!file) {
          return;
        }

        if (
          !file.type.startsWith("image/")
        ) {

          toast(
            "画像ファイルを選択してください。",
            "error"
          );

          image.value = "";

          return;
        }

        const url =
          URL.createObjectURL(file);

        const img =
          document.createElement("img");

        img.src = url;
        img.alt = "画像プレビュー";

        preview.appendChild(img);
      }
    );
  }


  form.addEventListener(
    "submit",
    createPost
  );
}


async function createPost(event) {

  event.preventDefault();

  if (!state.user) {

    toast(
      "投稿するにはログインしてください。",
      "error"
    );

    navigate("#login");

    return;
  }

  if (!supabase) {

    toast(
      "Supabaseが接続されていません。",
      "error"
    );

    return;
  }

  const category =
    byId("post-category")?.value;

  const title =
    byId("post-title")?.value.trim();

  const content =
    byId("post-content")?.value.trim();

  const imageInput =
    byId("post-image");

  const allowReplies =
    byId("allow-replies")?.checked ?? true;

  const allowShare =
    byId("allow-share")?.checked ?? true;

  if (!content) {

    toast(
      "本文を入力してください。",
      "error"
    );

    return;
  }

  if (content.length > 10000) {

    toast(
      "本文が長すぎます。",
      "error"
    );

    return;
  }


  setLoading(
    true,
    "投稿しています..."
  );

  try {

    let imageUrl = null;

    const file =
      imageInput?.files?.[0];

    if (file) {

      if (
        file.size >
        10 * 1024 * 1024
      ) {

        throw new Error(
          "画像は10MB以下にしてください。"
        );
      }

      const extension =
        file.name
          .split(".")
          .pop()
          .toLowerCase();

      const path =
        `${state.user.id}/${crypto.randomUUID()}.${extension}`;

      const {
        error: uploadError
      } = await supabase
        .storage
        .from("post-images")
        .upload(
          path,
          file,
          {
            upsert: false,
            contentType: file.type
          }
        );

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: publicData
      } = supabase
        .storage
        .from("post-images")
        .getPublicUrl(path);

      imageUrl =
        publicData.publicUrl;
    }


    const {
      error
    } = await supabase
      .from("posts")
      .insert({
        user_id: state.user.id,
        category,
        title: title || null,
        content,
        image_url: imageUrl,
        allow_replies: allowReplies,
        allow_share: allowShare,
        is_hidden: false,
        like_count: 0,
        reply_count: 0
      });

    if (error) {
      throw error;
    }

    toast(
      "投稿しました。",
      "success"
    );

    event.target.reset();

    const preview =
      byId("image-preview");

    if (preview) {
      preview.innerHTML = "";
    }

    await loadPosts();

    navigate("#board");

  } catch (error) {

    handleError(
      error,
      error.message ||
      "投稿できませんでした。"
    );

  } finally {

    setLoading(false);
  }
}


/* =========================================================
   16. POST ACTIONS
========================================================= */

document.addEventListener(
  "click",
  async event => {

    const button =
      event.target.closest(
        "[data-action]"
      );

    if (!button) {
      return;
    }

    const action =
      button.dataset.action;

    const postId =
      button.dataset.postId;

    if (!postId) {
      return;
    }

    if (action === "like") {
      await likePost(postId, button);
    }

    if (action === "reply") {
      openReply(postId);
    }

    if (action === "report") {
      openReport(postId);
    }

    if (action === "share") {
      await sharePost(postId);
    }
  }
);


/* =========================================================
   17. LIKE
========================================================= */

async function likePost(postId, button) {

  if (!state.user) {

    toast(
      "いいねするにはログインしてください。",
      "error"
    );

    return;
  }

  if (!supabase) {
    return;
  }

  try {

    const {
      data: existing,
      error: checkError
    } = await supabase
      .from("post_likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", state.user.id)
      .maybeSingle();

    if (checkError) {
      throw checkError;
    }


    if (existing) {

      const {
        error
      } = await supabase
        .from("post_likes")
        .delete()
        .eq("id", existing.id);

      if (error) {
        throw error;
      }

      button.classList.remove("liked");

    } else {

      const {
        error
      } = await supabase
        .from("post_likes")
        .insert({
          post_id: postId,
          user_id: state.user.id
        });

      if (error) {
        throw error;
      }

      button.classList.add("liked");
    }

    await updatePostLikeCount(postId);

  } catch (error) {

    handleError(
      error,
      "いいねを更新できませんでした。"
    );
  }
}


async function updatePostLikeCount(postId) {

  if (!supabase) {
    return;
  }

  const {
    count,
    error
  } = await supabase
    .from("post_likes")
    .select(
      "*",
      {
        count: "exact",
        head: true
      }
    )
    .eq("post_id", postId);

  if (error) {
    console.error(error);
    return;
  }

  await supabase
    .from("posts")
    .update({
      like_count: count || 0
    })
    .eq("id", postId);

  const button =
    document.querySelector(
      `[data-action="like"][data-post-id="${CSS.escape(String(postId))}"]`
    );

  if (button) {

    const counter =
      button.querySelector(".like-count");

    if (counter) {
      counter.textContent =
        count || 0;
    }
  }
}


/* =========================================================
   18. REPLY
========================================================= */

function openReply(postId) {

  navigate("#create-post");

  const category =
    byId("post-category");

  const content =
    byId("post-content");

  if (content) {

    content.focus();

    content.value =
      `返信: #${postId}\n\n`;
  }

  if (category) {
    category.value = "掲示板";
  }
}


/* =========================================================
   19. REPORT
========================================================= */

function openReport(postId) {

  const dialog =
    byId("report-dialog");

  const input =
    byId("modal-report-post-id");

  if (input) {
    input.value = postId;
  }

  if (
    dialog &&
    typeof dialog.showModal === "function"
  ) {
    dialog.showModal();
  } else {
    navigate("#report");
  }
}


function setupReportForms() {

  const modalForm =
    byId("modal-report-form");

  if (modalForm) {

    modalForm.addEventListener(
      "submit",
      submitModalReport
    );
  }


  const normalForm =
    byId("report-form");

  if (normalForm) {

    normalForm.addEventListener(
      "submit",
      submitReport
    );
  }
}


async function submitModalReport(event) {

  event.preventDefault();

  const postId =
    byId("modal-report-post-id")?.value;

  const reason =
    byId("modal-report-reason")?.value;

  const detail =
    byId("modal-report-detail")?.value.trim();

  await submitReportData(
    postId,
    reason,
    detail
  );

  closeModal(
    byId("report-dialog")
  );
}


async function submitReport(event) {

  event.preventDefault();

  const postId =
    byId("report-post-id")?.value;

  const reason =
    byId("report-reason")?.value;

  const detail =
    byId("report-detail")?.value.trim();

  await submitReportData(
    postId,
    reason,
    detail
  );
}


async function submitReportData(
  postId,
  reason,
  detail
) {

  if (!state.user) {

    toast(
      "通報にはログインが必要です。",
      "error"
    );

    return;
  }

  if (!supabase) {
    return;
  }

  if (!postId || !reason) {

    toast(
      "通報理由を入力してください。",
      "error"
    );

    return;
  }

  try {

    const {
      error
    } = await supabase
      .from("reports")
      .insert({
        post_id: postId,
        reporter_id: state.user.id,
        reason,
        detail: detail || null,
        status: "pending"
      });

    if (error) {
      throw error;
    }

    toast(
      "通報を送信しました。",
      "success"
    );

  } catch (error) {

    handleError(
      error,
      "通報を送信できませんでした。"
    );
  }
}


/* =========================================================
   20. SHARE
========================================================= */

async function sharePost(postId) {

  const url =
    `${location.origin}${location.pathname}#post/${postId}`;

  const input =
    byId("share-url");

  if (input) {
    input.value = url;
  }

  const nativeShare =
    byId("share");

  if (nativeShare) {
    nativeShare.dataset.postId =
      postId;
  }

  navigate("#share");
}


function setupShare() {

  const copy =
    byId("copy-share-url");

  if (copy) {

    copy.addEventListener(
      "click",
      async () => {

        const input =
          byId("share-url");

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
    );
  }


  document.addEventListener(
    "click",
    async event => {

      const button =
        event.target.closest(
          "[data-share]"
        );

      if (!button) {
        return;
      }

      const url =
        byId("share-url")?.value;

      if (!url) {
        return;
      }

      if (
        button.dataset.share === "native"
      ) {

        if (
          navigator.share
        ) {

          await navigator.share({
            title: "KAKIKOMI",
            text: "KAKIKOMIの投稿",
            url
          });

        } else {

          toast(
            "このブラウザでは共有機能を利用できません。"
          );
        }
      }
    }
  );
}


/* =========================================================
   21. SEARCH
========================================================= */

function setupSearch() {

  const form =
    byId("search-form");

  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    searchPosts
  );
}


async function searchPosts(event) {

  event.preventDefault();

  const input =
    byId("search-input");

  const results =
    byId("search-results");

  if (!input || !results) {
    return;
  }

  const keyword =
    input.value.trim();

  if (!keyword) {

    results.innerHTML =
      "<p>検索ワードを入力してください。</p>";

    return;
  }

  if (!supabase) {
    return;
  }

  setLoading(
    true,
    "検索しています..."
  );

  try {

    const {
      data,
      error
    } = await supabase
      .from("posts")
      .select(`
        *,
        profiles:user_id (
          id,
          username
        )
      `)
      .eq("is_hidden", false)
      .or(
        `title.ilike.%${keyword}%,content.ilike.%${keyword}%`
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(50);

    if (error) {
      throw error;
    }

    if (!data?.length) {

      results.innerHTML =
        `
          <div class="empty-state">
            <h2>検索結果なし</h2>
            <p>「${escapeHTML(keyword)}」に一致する投稿はありません。</p>
          </div>
        `;

      return;
    }

    results.innerHTML =
      data.map(renderPostHTML).join("");

  } catch (error) {

    handleError(
      error,
      "検索に失敗しました。"
    );

  } finally {

    setLoading(false);
  }
}


/* =========================================================
   22. LOGIN
========================================================= */

function setupLogin() {

  const form =
    byId("login-form");

  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const email =
        byId("login-email")?.value.trim();

      const password =
        byId("login-password")?.value;

      if (!email || !password) {

        toast(
          "メールアドレスとパスワードを入力してください。",
          "error"
        );

        return;
      }

      if (!supabase) {
        return;
      }

      setLoading(
        true,
        "ログインしています..."
      );

      try {

        const {
          error
        } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          throw error;
        }

        toast(
          "ログインしました。",
          "success"
        );

        navigate("#account");

      } catch (error) {

        handleError(
          error,
          "ログインに失敗しました。"
        );

      } finally {

        setLoading(false);
      }
    }
  );
}


/* =========================================================
   23. REGISTER
========================================================= */

function setupRegister() {

  const form =
    byId("register-form");

  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    registerUser
  );
}


async function registerUser(event) {

  event.preventDefault();

  const username =
    byId("register-username")?.value.trim();

  const email =
    byId("register-email")?.value.trim();

  const password =
    byId("register-password")?.value;

  const confirm =
    byId("register-password-confirm")?.value;

  const agree =
    byId("agree-rules")?.checked;

  if (
    !username ||
    !email ||
    !password ||
    !confirm
  ) {

    toast(
      "すべて入力してください。",
      "error"
    );

    return;
  }

  if (!agree) {

    toast(
      "利用規約への同意が必要です。",
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

  if (password.length < 8) {

    toast(
      "パスワードは8文字以上にしてください。",
      "error"
    );

    return;
  }

  if (!supabase) {
    return;
  }

  setLoading(
    true,
    "アカウントを作成しています..."
  );

  try {

    const {
      data,
      error
    } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username
        }
      }
    });

    if (error) {
      throw error;
    }

    if (data.user) {

      const {
        error: profileError
      } = await supabase
        .from("profiles")
        .upsert({
          id: data.user.id,
          username,
          bio: "",
          status: "active",
          force_password_change: false,
          disable_posting: false,
          disable_replies: false
        });

      if (profileError) {
        console.error(profileError);
      }
    }

    toast(
      "登録しました。メール確認が必要な場合があります。",
      "success"
    );

    navigate("#account");

  } catch (error) {

    handleError(
      error,
      "アカウントを作成できませんでした。"
    );

  } finally {

    setLoading(false);
  }
}


/* =========================================================
   24. LOGOUT
========================================================= */

function setupLogout() {

  const button =
    byId("logout-button");

  if (!button) {
    return;
  }

  button.addEventListener(
    "click",
    async () => {

      if (!supabase) {
        return;
      }

      const {
        error
      } = await supabase.auth.signOut();

      if (error) {

        handleError(
          error,
          "ログアウトに失敗しました。"
        );

        return;
      }

      state.user = null;
      state.session = null;
      state.profile = null;

      toast(
        "ログアウトしました。",
        "success"
      );

      navigate("#home");
    }
  );
}


/* =========================================================
   25. PROFILE SETTINGS
========================================================= */

function setupProfileSettings() {

  const form =
    byId("profile-settings-form");

  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      if (!state.user || !supabase) {
        return;
      }

      const username =
        byId("settings-username")?.value.trim();

      const bio =
        byId("settings-bio")?.value.trim();

      if (!username) {

        toast(
          "ユーザー名を入力してください。",
          "error"
        );

        return;
      }

      setLoading(
        true,
        "設定を保存しています..."
      );

      try {

        const {
          error
        } = await supabase
          .from("profiles")
          .update({
            username,
            bio
          })
          .eq("id", state.user.id);

        if (error) {
          throw error;
        }

        await loadCurrentProfile();

        toast(
          "プロフィールを更新しました。",
          "success"
        );

      } catch (error) {

        handleError(
          error,
          "プロフィールを更新できませんでした。"
        );

      } finally {

        setLoading(false);
      }
    }
  );
}


/* =========================================================
   26. PASSWORD CHANGE
========================================================= */

function setupPasswordChange() {

  const form =
    byId("change-password-form");

  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      if (!supabase || !state.user) {
        return;
      }

      const current =
        byId("current-password")?.value;

      const password =
        byId("new-password")?.value;

      const confirm =
        byId("new-password-confirm")?.value;

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

      setLoading(
        true,
        "パスワードを変更しています..."
      );

      try {

        const email =
          state.user.email;

        const {
          error: loginError
        } = await supabase.auth.signInWithPassword({
          email,
          password: current
        });

        if (loginError) {
          throw new Error(
            "現在のパスワードが正しくありません。"
          );
        }

        const {
          error
        } = await supabase.auth.updateUser({
          password
        });

        if (error) {
          throw error;
        }

        await supabase
          .from("profiles")
          .update({
            force_password_change: false
          })
          .eq("id", state.user.id);

        toast(
          "パスワードを変更しました。",
          "success"
        );

        event.target.reset();

      } catch (error) {

        handleError(
          error,
          error.message ||
          "パスワードを変更できませんでした。"
        );

      } finally {

        setLoading(false);
      }
    }
  );
}


/* =========================================================
   27. DELETE ACCOUNT
========================================================= */

function setupDeleteAccount() {

  const form =
    byId("delete-account-form");

  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      if (!state.user) {
        return;
      }

      const confirmed =
        confirm(
          "本当にアカウントを削除しますか？"
        );

      if (!confirmed) {
        return;
      }

      /*
        auth.users の削除は通常クライアントから直接できない。

        本番ではSupabase Edge Function等で
        管理者権限を使って削除する。
      */

      toast(
        "アカウント削除は管理用Edge Functionの接続が必要です。",
        "error"
      );
    }
  );


  const button =
    byId("delete-account-button");

  if (button) {

    button.addEventListener(
      "click",
      () => {

        const dialog =
          byId("delete-account-dialog");

        if (
          dialog &&
          typeof dialog.showModal === "function"
        ) {
          dialog.showModal();
        }
      }
    );
  }
}


/* =========================================================
   28. NOTIFICATIONS
========================================================= */

async function loadNotifications() {

  if (
    !supabase ||
    !state.user
  ) {
    return;
  }

  const {
    data,
    error
  } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", state.user.id)
    .order(
      "created_at",
      {
        ascending: false
      }
    )
    .limit(100);

  if (error) {

    console.error(error);

    return;
  }

  state.notifications =
    data || [];

  renderNotifications();
}


function renderNotifications() {

  const list =
    byId("notification-list");

  if (!list) {
    return;
  }

  if (!state.notifications.length) {

    list.innerHTML =
      `
        <div class="empty-state">
          <h2>通知はありません</h2>
          <p>新しい通知があるとここに表示されます。</p>
        </div>
      `;

    return;
  }

  list.innerHTML =
    state.notifications
      .map(notification => {

        return `
          <article
            class="notification-item"
            data-notification-id="${escapeHTML(notification.id)}"
          >
            <strong>
              ${escapeHTML(
                notification.title ||
                "通知"
              )}
            </strong>

            <p>
              ${escapeHTML(
                notification.message || ""
              )}
            </p>

            <time>
              ${escapeHTML(
                formatDate(
                  notification.created_at
                )
              )}
            </time>
          </article>
        `;

      })
      .join("");
}


function setupNotifications() {

  const button =
    byId("notification-button");

  if (button) {

    button.addEventListener(
      "click",
      async () => {

        await loadNotifications();

        navigate("#notifications");
      }
    );
  }


  const mark =
    byId("mark-notifications-read");

  if (mark) {

    mark.addEventListener(
      "click",
      markNotificationsRead
    );
  }
}


async function markNotificationsRead() {

  if (
    !supabase ||
    !state.user
  ) {
    return;
  }

  const {
    error
  } = await supabase
    .from("notifications")
    .update({
      is_read: true
    })
    .eq("user_id", state.user.id)
    .eq("is_read", false);

  if (error) {

    handleError(
      error,
      "通知を更新できませんでした。"
    );

    return;
  }

  await loadNotifications();

  toast(
    "通知を既読にしました。",
    "success"
  );
}


/* =========================================================
   29. PRIVATE BOARDS
========================================================= */

function setupPrivateBoards() {

  const create =
    byId("create-private-board-button");

  if (create) {

    create.addEventListener(
      "click",
      () => {

        toast(
          "プライベート掲示板作成フォームを開きます。"
        );
      }
    );
  }


  const form =
    byId("join-private-board-form");

  if (form) {

    form.addEventListener(
      "submit",
      joinPrivateBoard
    );
  }
}


async function joinPrivateBoard(event) {

  event.preventDefault();

  if (!state.user || !supabase) {

    toast(
      "ログインしてください。",
      "error"
    );

    return;
  }

  const code =
    byId("private-board-code")
      ?.value
      .trim();

  if (!code) {

    toast(
      "参加コードを入力してください。",
      "error"
    );

    return;
  }

  try {

    const {
      data: board,
      error
    } = await supabase
      .from("private_boards")
      .select("id")
      .eq("join_code", code)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!board) {

      toast(
        "掲示板が見つかりません。",
        "error"
      );

      return;
    }

    const {
      error: memberError
    } = await supabase
      .from("private_board_members")
      .insert({
        board_id: board.id,
        user_id: state.user.id
      });

    if (memberError) {
      throw memberError;
    }

    toast(
      "掲示板に参加しました。",
      "success"
    );

    await loadPrivateBoards();

  } catch (error) {

    handleError(
      error,
      "掲示板に参加できませんでした。"
    );
  }
}


async function loadPrivateBoards() {

  if (!supabase || !state.user) {
    return;
  }

  const {
    data,
    error
  } = await supabase
    .from("private_board_members")
    .select(`
      board_id,
      private_boards (
        id,
        name,
        description
      )
    `)
    .eq(
      "user_id",
      state.user.id
    );

  if (error) {
    console.error(error);
    return;
  }

  state.privateBoards =
    data || [];

  renderPrivateBoards();
}


function renderPrivateBoards() {

  const list =
    byId("private-board-list");

  if (!list) {
    return;
  }

  list.innerHTML =
    state.privateBoards
      .map(item => {

        const board =
          item.private_boards;

        if (!board) {
          return "";
        }

        return `
          <article class="board-card">
            <h2>
              ${escapeHTML(board.name)}
            </h2>

            <p>
              ${escapeHTML(
                board.description || ""
              )}
            </p>

            <button
              class="primary-button"
              type="button"
              data-private-board-id="${escapeHTML(board.id)}"
            >
              開く
            </button>
          </article>
        `;

      })
      .join("");
}


/* =========================================================
   30. ADMIN AUTH CHECK
========================================================= */

async function isAdmin() {

  if (
    !supabase ||
    !state.user
  ) {
    return false;
  }

  const {
    data,
    error
  } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", state.user.id)
    .maybeSingle();

  if (error) {

    console.error(error);

    return false;
  }

  return data?.is_admin === true;
}


/* =========================================================
   31. ADMIN LOAD
========================================================= */

async function loadAdminPage() {

  if (!state.user) {

    toast(
      "管理ページにはログインが必要です。",
      "error"
    );

    return;
  }

  const admin =
    await isAdmin();

  if (!admin) {

    toast(
      "管理者権限がありません。",
      "error"
    );

    navigate("#error-page");

    return;
  }

  await Promise.all([
    loadAdminStats(),
    loadAdminUsers(),
    loadAdminPosts(),
    loadAdminReports(),
    loadIPBans(),
    loadAdminBots(),
    loadAdminPrivateBoards(),
    loadAdminSiteSettings()
  ]);
}


/* =========================================================
   32. ADMIN STATS
========================================================= */

async function loadAdminStats() {

  if (!supabase) {
    return;
  }

  const countRows =
    async table => {

      const {
        count,
        error
      } = await supabase
        .from(table)
        .select(
          "*",
          {
            count: "exact",
            head: true
          }
        );

      if (error) {
        console.error(error);
        return 0;
      }

      return count || 0;
    };

  const [
    users,
    posts,
    reports,
    bans
  ] = await Promise.all([
    countRows("profiles"),
    countRows("posts"),
    countRows("reports"),
    countRows("ip_bans")
  ]);

  const userCount =
    byId("admin-user-count");

  const postCount =
    byId("admin-post-count");

  const reportCount =
    byId("admin-report-count");

  const banCount =
    byId("admin-ban-count");

  if (userCount) {
    userCount.textContent = users;
  }

  if (postCount) {
    postCount.textContent = posts;
  }

  if (reportCount) {
    reportCount.textContent = reports;
  }

  if (banCount) {
    banCount.textContent = bans;
  }
}


/* =========================================================
   33. ADMIN USERS
========================================================= */

function setupAdminUserSearch() {

  const form =
    byId("admin-user-search-form");

  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      await loadAdminUsers(
        byId("admin-user-search")
          ?.value
          .trim()
      );
    }
  );
}


async function loadAdminUsers(keyword = "") {

  if (!supabase) {
    return;
  }

  let query =
    supabase
      .from("profiles")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(100);

  if (keyword) {

    query =
      query.ilike(
        "username",
        `%${keyword}%`
      );
  }

  const {
    data,
    error
  } = await query;

  if (error) {

    handleError(
      error,
      "ユーザー一覧を取得できませんでした。"
    );

    return;
  }

  state.users =
    data || [];

  renderAdminUsers();
}


function renderAdminUsers() {

  const body =
    byId("admin-users-table-body");

  if (!body) {
    return;
  }

  body.innerHTML =
    state.users
      .map(user => {

        const status =
          user.status || "active";

        return `
          <tr>

            <td>
              ${escapeHTML(
                user.username || "名無し"
              )}
            </td>

            <td>
              <code>
                ${escapeHTML(user.id)}
              </code>
            </td>

            <td>
              ${escapeHTML(status)}
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
                data-admin-user-id="${escapeHTML(user.id)}"
              >
                編集
              </button>
            </td>

          </tr>
        `;

      })
      .join("");
}


document.addEventListener(
  "click",
  event => {

    const button =
      event.target.closest(
        "[data-admin-user-id]"
      );

    if (!button) {
      return;
    }

    loadAdminUserDetail(
      button.dataset.adminUserId
    );
  }
);


/* =========================================================
   34. ADMIN USER DETAIL
========================================================= */

async function loadAdminUserDetail(userId) {

  if (!supabase) {
    return;
  }

  const user =
    state.users.find(
      item => String(item.id) === String(userId)
    );

  if (!user) {
    return;
  }

  byId("admin-target-user-id").value =
    user.id;

  byId("admin-target-username").value =
    user.username || "";

  byId("admin-target-status").value =
    user.status || "active";

  byId("admin-force-password-change").checked =
    Boolean(user.force_password_change);

  byId("admin-disable-posting").checked =
    Boolean(user.disable_posting);

  byId("admin-disable-replies").checked =
    Boolean(user.disable_replies);

  const section =
    byId("admin-user-detail");

  if (section) {

    section.scrollIntoView({
      behavior: "smooth"
    });
  }
}


function setupAdminUserSettings() {

  const form =
    byId("admin-user-settings-form");

  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const id =
        byId("admin-target-user-id")?.value;

      if (!id || !supabase) {
        return;
      }

      const payload = {

        username:
          byId("admin-target-username")?.value.trim(),

        status:
          byId("admin-target-status")?.value,

        force_password_change:
          byId("admin-force-password-change")?.checked,

        disable_posting:
          byId("admin-disable-posting")?.checked,

        disable_replies:
          byId("admin-disable-replies")?.checked

      };

      try {

        const {
          error
        } = await supabase
          .from("profiles")
          .update(payload)
          .eq("id", id);

        if (error) {
          throw error;
        }

        toast(
          "ユーザー設定を保存しました。",
          "success"
        );

        await loadAdminUsers();

      } catch (error) {

        handleError(
          error,
          "ユーザー設定を保存できませんでした。"
        );
      }
    }
  );


  const forceLogout =
    byId("admin-force-logout");

  if (forceLogout) {

    forceLogout.addEventListener(
      "click",
      async () => {

        const id =
          byId("admin-target-user-id")?.value;

        if (!id) {
          return;
        }

        /*
          Supabase Authユーザーを管理者側から
          強制ログアウトする場合は
          Edge Function + service_role が必要。
        */

        toast(
          "強制ログアウトはEdge Function接続が必要です。",
          "error"
        );
      }
    );
  }
}


/* =========================================================
   35. ADMIN POSTS
========================================================= */

function setupAdminPostFilters() {

  $$(
    "[data-admin-post-filter]"
  ).forEach(button => {

    button.addEventListener(
      "click",
      async () => {

        state.currentAdminPostFilter =
          button.dataset.adminPostFilter;

        await loadAdminPosts();
      }
    );
  });
}


async function loadAdminPosts() {

  if (!supabase) {
    return;
  }

  let query =
    supabase
      .from("posts")
      .select(`
        *,
        profiles:user_id (
          username
        )
      `)
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(100);

  if (
    state.currentAdminPostFilter ===
    "hidden"
  ) {

    query =
      query.eq(
        "is_hidden",
        true
      );

  } else if (
    state.currentAdminPostFilter ===
    "reported"
  ) {

    const {
      data: reports
    } = await supabase
      .from("reports")
      .select("post_id");

    const ids =
      [
        ...new Set(
          (reports || [])
            .map(item => item.post_id)
        )
      ];

    if (!ids.length) {

      renderAdminPosts([]);

      return;
    }

    query =
      query.in(
        "id",
        ids
      );
  }

  const {
    data,
    error
  } = await query;

  if (error) {

    handleError(
      error,
      "管理投稿を取得できませんでした。"
    );

    return;
  }

  renderAdminPosts(
    data || []
  );
}


function renderAdminPosts(posts) {

  const list =
    byId("admin-post-list");

  if (!list) {
    return;
  }

  if (!posts.length) {

    list.innerHTML =
      `
        <div class="empty-state">
          <h2>投稿なし</h2>
          <p>該当する投稿はありません。</p>
        </div>
      `;

    return;
  }

  list.innerHTML =
    posts.map(post => {

      return `
        <article
          class="post-card"
          data-admin-post-id="${escapeHTML(post.id)}"
        >

          <div class="post-card-header">

            <strong>
              ${escapeHTML(
                post.profiles?.username ||
                "名無し"
              )}
            </strong>

            <span>
              ${escapeHTML(
                post.category || ""
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
              ${escapeHTML(post.content || "")}
            </p>

          </div>

          <div class="post-card-footer">

            <button
              type="button"
              data-admin-hide-post="${escapeHTML(post.id)}"
            >
              ${
                post.is_hidden
                  ? "表示する"
                  : "非表示にする"
              }
            </button>

            <button
              type="button"
              class="danger-button"
              data-admin-delete-post="${escapeHTML(post.id)}"
            >
              削除
            </button>

          </div>

        </article>
      `;

    }).join("");
}


document.addEventListener(
  "click",
  async event => {

    const hide =
      event.target.closest(
        "[data-admin-hide-post]"
      );

    if (hide) {

      await togglePostHidden(
        hide.dataset.adminHidePost
      );

      return;
    }

    const deleteButton =
      event.target.closest(
        "[data-admin-delete-post]"
      );

    if (deleteButton) {

      await adminDeletePost(
        deleteButton.dataset.adminDeletePost
      );
    }
  }
);


async function togglePostHidden(postId) {

  if (!supabase) {
    return;
  }

  const {
    data: post,
    error: fetchError
  } = await supabase
    .from("posts")
    .select("is_hidden")
    .eq("id", postId)
    .single();

  if (fetchError) {

    handleError(
      fetchError,
      "投稿を取得できませんでした。"
    );

    return;
  }

  const {
    error
  } = await supabase
    .from("posts")
    .update({
      is_hidden:
        !post.is_hidden
    })
    .eq("id", postId);

  if (error) {

    handleError(
      error,
      "投稿状態を変更できませんでした。"
    );

    return;
  }

  await loadAdminPosts();
  await loadPosts();

  toast(
    "投稿の表示状態を変更しました。",
    "success"
  );
}


async function adminDeletePost(postId) {

  if (!supabase) {
    return;
  }

  if (
    !confirm(
      "この投稿を完全に削除しますか？"
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

    handleError(
      error,
      "投稿を削除できませんでした。"
    );

    return;
  }

  toast(
    "投稿を削除しました。",
    "success"
  );

  await loadAdminPosts();
  await loadPosts();
}


/* =========================================================
   36. ADMIN REPORTS
========================================================= */

async function loadAdminReports() {

  if (!supabase) {
    return;
  }

  const {
    data,
    error
  } = await supabase
    .from("reports")
    .select(`
      *,
      posts (
        id,
        title,
        content
      ),
      profiles:reporter_id (
        username
      )
    `)
    .order(
      "created_at",
      {
        ascending: false
      }
    )
    .limit(100);

  if (error) {

    handleError(
      error,
      "通報一覧を取得できませんでした。"
    );

    return;
  }

  state.reports =
    data || [];

  renderAdminReports();
}


function renderAdminReports() {

  const list =
    byId("admin-report-list");

  if (!list) {
    return;
  }

  if (!state.reports.length) {

    list.innerHTML =
      `
        <div class="empty-state">
          <h2>通報なし</h2>
          <p>現在、通報はありません。</p>
        </div>
      `;

    return;
  }

  list.innerHTML =
    state.reports
      .map(report => {

        return `
          <article class="post-card">

            <div class="post-card-header">

              <strong>
                通報
              </strong>

              <span>
                ${escapeHTML(
                  report.status || "pending"
                )}
              </span>

            </div>

            <div class="post-card-body">

              <p>
                <strong>理由：</strong>
                ${escapeHTML(
                  report.reason || ""
                )}
              </p>

              <p>
                ${escapeHTML(
                  report.detail || ""
                )}
              </p>

              <p>
                通報者：
                ${escapeHTML(
                  report.profiles?.username ||
                  "不明"
                )}
              </p>

            </div>

            <div class="post-card-footer">

              <button
                type="button"
                data-report-resolve="${escapeHTML(report.id)}"
              >
                解決済みにする
              </button>

              <button
                type="button"
                data-report-dismiss="${escapeHTML(report.id)}"
              >
                却下
              </button>

            </div>

          </article>
        `;

      })
      .join("");
}


document.addEventListener(
  "click",
  async event => {

    const resolve =
      event.target.closest(
        "[data-report-resolve]"
      );

    if (resolve) {

      await updateReportStatus(
        resolve.dataset.reportResolve,
        "resolved"
      );

      return;
    }

    const dismiss =
      event.target.closest(
        "[data-report-dismiss]"
      );

    if (dismiss) {

      await updateReportStatus(
        dismiss.dataset.reportDismiss,
        "dismissed"
      );
    }
  }
);


async function updateReportStatus(
  reportId,
  status
) {

  if (!supabase) {
    return;
  }

  const {
    error
  } = await supabase
    .from("reports")
    .update({
      status
    })
    .eq("id", reportId);

  if (error) {

    handleError(
      error,
      "通報状態を更新できませんでした。"
    );

    return;
  }

  toast(
    "通報状態を更新しました。",
    "success"
  );

  await loadAdminReports();
}


/* =========================================================
   37. IP BAN
========================================================= */

function setupIPBan() {

  const form =
    byId("ip-ban-form");

  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const ip =
        byId("ban-ip")?.value.trim();

      const reason =
        byId("ban-reason")?.value.trim();

      const duration =
        byId("ban-duration")?.value;

      if (!ip) {

        toast(
          "IPアドレスを入力してください。",
          "error"
        );

        return;
      }

      if (!supabase) {
        return;
      }

      const {
        error
      } = await supabase
        .from("ip_bans")
        .insert({
          ip_address: ip,
          reason: reason || null,
          duration,
          is_active: true,
          created_by: state.user?.id || null
        });

      if (error) {

        handleError(
          error,
          "IP制限を追加できませんでした。"
        );

        return;
      }

      form.reset();

      toast(
        "IPアクセス制限を追加しました。",
        "success"
      );

      await loadIPBans();
    }
  );
}


async function loadIPBans() {

  if (!supabase) {
    return;
  }

  const {
    data,
    error
  } = await supabase
    .from("ip_bans")
    .select("*")
    .eq("is_active", true)
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

  state.ipBans =
    data || [];

  renderIPBans();
}


function renderIPBans() {

  const body =
    byId("ip-ban-table-body");

  if (!body) {
    return;
  }

  body.innerHTML =
    state.ipBans
      .map(ban => {

        return `
          <tr>

            <td>
              ${escapeHTML(
                ban.ip_address
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
                data-remove-ip-ban="${escapeHTML(ban.id)}"
              >
                解除
              </button>

            </td>

          </tr>
        `;

      })
      .join("");
}


document.addEventListener(
  "click",
  async event => {

    const button =
      event.target.closest(
        "[data-remove-ip-ban]"
      );

    if (!button) {
      return;
    }

    if (!supabase) {
      return;
    }

    const {
      error
    } = await supabase
      .from("ip_bans")
      .update({
        is_active: false
      })
      .eq(
        "id",
        button.dataset.removeIpBan
      );

    if (error) {

      handleError(
        error,
        "IP制限を解除できませんでした。"
      );

      return;
    }

    await loadIPBans();

    toast(
      "IP制限を解除しました。",
      "success"
    );
  }
);


/* =========================================================
   38. BOT
========================================================= */

function setupBotManagement() {

  const create =
    byId("create-bot-button");

  const adminCreate =
    byId("admin-create-bot");

  if (create) {
    create.addEventListener(
      "click",
      openCreateBot
    );
  }

  if (adminCreate) {
    adminCreate.addEventListener(
      "click",
      openCreateBot
    );
  }


  const form =
    byId("create-bot-form");

  if (form) {

    form.addEventListener(
      "submit",
      createBot
    );
  }
}


function openCreateBot() {

  const dialog =
    byId("create-bot-dialog");

  if (
    dialog &&
    typeof dialog.showModal === "function"
  ) {
    dialog.showModal();
  }
}


async function createBot(event) {

  event.preventDefault();

  if (!state.user || !supabase) {
    return;
  }

  const name =
    byId("bot-name")?.value.trim();

  const description =
    byId("bot-description")?.value.trim();

  if (!name) {

    toast(
      "Bot名を入力してください。",
      "error"
    );

    return;
  }

  const {
    error
  } = await supabase
    .from("bots")
    .insert({
      name,
      description: description || null,
      owner_id: state.user.id,
      is_active: true
    });

  if (error) {

    handleError(
      error,
      "Botを作成できませんでした。"
    );

    return;
  }

  toast(
    "Botを作成しました。",
    "success"
  );

  closeModal(
    byId("create-bot-dialog")
  );

  event.target.reset();

  await loadBots();
}


async function loadBots() {

  if (!supabase) {
    return;
  }

  const {
    data,
    error
  } = await supabase
    .from("bots")
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

  state.bots =
    data || [];

  renderBots();
}


function renderBots() {

  const list =
    byId("bot-list");

  const adminList =
    byId("admin-bot-list");

  const html =
    state.bots
      .map(bot => {

        return `
          <article class="bot-card">

            <div class="bot-avatar">
              🤖
            </div>

            <div class="bot-information">

              <h2>
                ${escapeHTML(bot.name)}
              </h2>

              <p>
                ${escapeHTML(
                  bot.description || ""
                )}
              </p>

            </div>

            <span class="bot-status">
              ${
                bot.is_active
                  ? "稼働中"
                  : "停止中"
              }
            </span>

          </article>
        `;

      })
      .join("");

  if (list) {
    list.innerHTML = html;
  }

  if (adminList) {
    adminList.innerHTML = html;
  }
}


/* =========================================================
   39. ADMIN PRIVATE BOARDS
========================================================= */

async function loadAdminPrivateBoards() {

  if (!supabase) {
    return;
  }

  const {
    data,
    error
  } = await supabase
    .from("private_boards")
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

  const body =
    byId("admin-private-board-table-body");

  if (!body) {
    return;
  }

  body.innerHTML =
    (data || [])
      .map(board => {

        return `
          <tr>

            <td>
              ${escapeHTML(board.name)}
            </td>

            <td>
              ${escapeHTML(
                board.description || ""
              )}
            </td>

            <td>
              ${escapeHTML(
                board.join_code || ""
              )}
            </td>

            <td>

              <button
                type="button"
                data-admin-delete-board="${escapeHTML(board.id)}"
              >
                削除
              </button>

            </td>

          </tr>
        `;

      })
      .join("");
}


document.addEventListener(
  "click",
  async event => {

    const button =
      event.target.closest(
        "[data-admin-delete-board]"
      );

    if (!button) {
      return;
    }

    if (
      !confirm(
        "この掲示板を削除しますか？"
      )
    ) {
      return;
    }

    const {
      error
    } = await supabase
      .from("private_boards")
      .delete()
      .eq(
        "id",
        button.dataset.adminDeleteBoard
      );

    if (error) {

      handleError(
        error,
        "掲示板を削除できませんでした。"
      );

      return;
    }

    await loadAdminPrivateBoards();

    toast(
      "掲示板を削除しました。",
      "success"
    );
  }
);


/* =========================================================
   40. SITE SETTINGS
========================================================= */

async function loadAdminSiteSettings() {

  if (!supabase) {
    return;
  }

  const {
    data,
    error
  } = await supabase
    .from("site_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {

    console.error(error);

    return;
  }

  if (!data) {
    return;
  }

  const name =
    byId("site-name");

  const description =
    byId("site-description");

  const registration =
    byId("site-registration-enabled");

  const posting =
    byId("site-posting-enabled");

  const maintenance =
    byId("site-maintenance-mode");

  if (name) {
    name.value =
      data.site_name || "";
  }

  if (description) {
    description.value =
      data.site_description || "";
  }

  if (registration) {
    registration.checked =
      Boolean(data.registration_enabled);
  }

  if (posting) {
    posting.checked =
      Boolean(data.posting_enabled);
  }

  if (maintenance) {
    maintenance.checked =
      Boolean(data.maintenance_mode);
  }
}


function setupAdminSiteSettings() {

  const form =
    byId("admin-site-settings-form");

  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      if (!supabase) {
        return;
      }

      const payload = {

        id: 1,

        site_name:
          byId("site-name")?.value.trim(),

        site_description:
          byId("site-description")?.value.trim(),

        registration_enabled:
          byId("site-registration-enabled")?.checked,

        posting_enabled:
          byId("site-posting-enabled")?.checked,

        maintenance_mode:
          byId("site-maintenance-mode")?.checked,

        updated_at:
          new Date().toISOString()

      };

      const {
        error
      } = await supabase
        .from("site_settings")
        .upsert(
          payload,
          {
            onConflict: "id"
          }
        );

      if (error) {

        handleError(
          error,
          "サイト設定を保存できませんでした。"
        );

        return;
      }

      toast(
        "サイト設定を保存しました。",
        "success"
      );
    }
  );
}


/* =========================================================
   41. MODALS
========================================================= */

function setupModals() {

  $$(
    "[data-close-modal]"
  ).forEach(button => {

    button.addEventListener(
      "click",
      () => {

        const id =
          button.dataset.closeModal;

        closeModal(
          byId(id)
        );
      }
    );
  });


  $$("dialog").forEach(dialog => {

    dialog.addEventListener(
      "click",
      event => {

        if (
          event.target === dialog
        ) {
          dialog.close();
        }
      }
    );
  });
}


function closeModal(dialog) {

  if (
    dialog &&
    typeof dialog.close === "function"
  ) {
    dialog.close();
  }
}


/* =========================================================
   42. DELETE POST MODAL
========================================================= */

function setupDeletePost() {

  const form =
    byId("delete-post-form");

  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      if (!state.user || !supabase) {
        return;
      }

      const postId =
        byId("delete-post-id")?.value;

      if (!postId) {
        return;
      }

      const {
        error
      } = await supabase
        .from("posts")
        .delete()
        .eq("id", postId)
        .eq("user_id", state.user.id);

      if (error) {

        handleError(
          error,
          "投稿を削除できませんでした。"
        );

        return;
      }

      toast(
        "投稿を削除しました。",
        "success"
      );

      closeModal(
        byId("delete-post-dialog")
      );

      await loadPosts();
    }
  );
}


/* =========================================================
   43. CATEGORY CARDS
========================================================= */

function setupCategoryCards() {

  $$(".category-card")
    .forEach(card => {

      card.addEventListener(
        "click",
        event => {

          event.preventDefault();

          const category =
            card.dataset.category;

          if (!category) {
            return;
          }

          state.currentCategory =
            category;

          const select =
            byId("board-category");

          if (select) {
            select.value =
              category;
          }

          navigate("#board");

          loadPosts();
        }
      );
    });
}


/* =========================================================
   44. ACCOUNT BUTTON
========================================================= */

function setupAccountButton() {

  const button =
    byId("account-button");

  if (!button) {
    return;
  }

  button.addEventListener(
    "click",
    event => {

      if (
        button.getAttribute("href") ===
        "#account"
      ) {
        return;
      }

      event.preventDefault();

      navigate("#account");
    }
  );
}


/* =========================================================
   45. FORCED PASSWORD CHANGE
========================================================= */

async function checkForcedPasswordChange() {

  if (
    !state.user ||
    !state.profile
  ) {
    return;
  }

  if (
    state.profile.force_password_change
  ) {

    toast(
      "管理者によってパスワード変更が必要に設定されています。",
      "error"
    );

    navigate("#security-settings");
  }
}


/* =========================================================
   46. POSTING PERMISSION
========================================================= */

async function checkPostingPermission() {

  if (!state.user || !state.profile) {
    return true;
  }

  if (
    state.profile.status === "banned" ||
    state.profile.status === "suspended"
  ) {

    toast(
      "現在、このアカウントでは投稿できません。",
      "error"
    );

    return false;
  }

  if (
    state.profile.disable_posting
  ) {

    toast(
      "現在、投稿が禁止されています。",
      "error"
    );

    return false;
  }

  return true;
}


/* =========================================================
   47. CREATE POST PERMISSION PATCH
========================================================= */

async function guardCreatePost(event) {

  const allowed =
    await checkPostingPermission();

  if (!allowed) {
    event.preventDefault();
    return false;
  }

  return true;
}


/* =========================================================
   48. ACCOUNT DATA
========================================================= */

async function loadAccountData() {

  if (!state.user) {
    return;
  }

  await loadCurrentProfile();

  const username =
    byId("settings-username");

  const bio =
    byId("settings-bio");

  if (username) {
    username.value =
      state.profile?.username || "";
  }

  if (bio) {
    bio.value =
      state.profile?.bio || "";
  }
}


/* =========================================================
   49. SITE HEADER / LOGO
========================================================= */

function setupLogo() {

  const logo =
    byId("site-logo");

  if (!logo) {
    return;
  }

  logo.addEventListener(
    "click",
    event => {

      event.preventDefault();

      navigate("#home");
    }
  );
}


/* =========================================================
   50. MAINTENANCE CHECK
========================================================= */

async function checkMaintenanceMode() {

  if (!supabase) {
    return;
  }

  const {
    data,
    error
  } = await supabase
    .from("site_settings")
    .select(
      "maintenance_mode"
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    return;
  }

  if (
    data?.maintenance_mode &&
    !(await isAdmin())
  ) {

    navigate("#error-page");

    const errorPage =
      byId("error-page");

    if (errorPage) {

      const title =
        errorPage.querySelector("h1");

      const text =
        errorPage.querySelector("p");

      if (title) {
        title.textContent =
          "メンテナンス中";
      }

      if (text) {
        text.textContent =
          "現在KAKIKOMIはメンテナンス中です。";
      }
    }
  }
}


/* =========================================================
   51. GLOBAL CLICK HANDLER
========================================================= */

function setupGlobalButtons() {

  document.addEventListener(
    "click",
    async event => {

      const target =
        event.target.closest(
          "[data-open-profile]"
        );

      if (target) {

        const id =
          target.dataset.openProfile;

        if (id) {
          navigate(
            `#user/${id}`
          );
        }
      }
    }
  );
}


/* =========================================================
   52. REALTIME
========================================================= */

function setupRealtime() {

  if (!supabase) {
    return;
  }

  supabase
    .channel("kakikomi-posts")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "posts"
      },
      async () => {

        await loadPosts();

      }
    )
    .subscribe();


  if (state.user) {

    supabase
      .channel(
        `kakikomi-notifications-${state.user.id}`
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter:
            `user_id=eq.${state.user.id}`
        },
        async payload => {

          state.notifications.unshift(
            payload.new
          );

          renderNotifications();

          toast(
            payload.new.title ||
            "新しい通知があります。",
            "success"
          );
        }
      )
      .subscribe();
  }
}


/* =========================================================
   53. SUPABASE HEALTH CHECK
========================================================= */

async function checkSupabase() {

  if (!supabase) {
    return false;
  }

  try {

    const {
      error
    } = await supabase
      .from("profiles")
      .select("id")
      .limit(1);

    if (error) {

      console.error(
        "Supabase health check:",
        error
      );

      return false;
    }

    return true;

  } catch {

    return false;
  }
}


/* =========================================================
   54. INITIALIZE
========================================================= */

async function init() {

  if (state.initialized) {
    return;
  }

  state.initialized = true;

  setupNavigation();
  setupBoardControls();
  setupPostForm();
  setupLogin();
  setupRegister();
  setupLogout();
  setupProfileSettings();
  setupPasswordChange();
  setupDeleteAccount();
  setupNotifications();
  setupPrivateBoards();
  setupAdminUserSearch();
  setupAdminUserSettings();
  setupAdminPostFilters();
  setupIPBan();
  setupBotManagement();
  setupAdminSiteSettings();
  setupModals();
  setupDeletePost();
  setupCategoryCards();
  setupShare();
  setupSearch();
  setupAccountButton();
  setupLogo();
  setupGlobalButtons();
  setupReportForms();

  const connected =
    initSupabase();

  if (!connected) {

    console.warn(
      "KAKIKOMI: Supabase未接続モード"
    );

    renderRoute();

    return;
  }

  await loadSession();

  await checkMaintenanceMode();

  if (state.user) {

    await Promise.all([
      loadNotifications(),
      loadPrivateBoards(),
      loadBots(),
      loadAccountData()
    ]);

    await checkForcedPasswordChange();
  }

  await loadPosts();

  setupRealtime();

  if (
    location.hash === "#admin-page"
  ) {
    await loadAdminPage();
  }

  renderRoute();
}


/* =========================================================
   55. ADMIN ROUTE
========================================================= */

window.addEventListener(
  "hashchange",
  async () => {

    if (
      getRoute() === "admin-page"
    ) {

      await loadAdminPage();
    }
  }
);


/* =========================================================
   56. DOM READY
========================================================= */

if (
  document.readyState === "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    init
  );

} else {

  init();
}


/* =========================================================
   57. GLOBAL API
========================================================= */

window.KAKIKOMI = {

  state,

  navigate,

  loadPosts,

  loadNotifications,

  loadPrivateBoards,

  loadBots,

  loadAdminPage,

  toast,

  openReport,

  sharePost

};
