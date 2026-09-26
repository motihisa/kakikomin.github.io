/* =========================================================
   KAKIKOMI - script.js
   Supabase対応版
   ========================================================= */

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://wtlmjaqyphmaeqhipqht.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_Mk4N_TF_cynZ53R7nmUyjQ_JeXsZ_Cs";

  let supabaseClient = null;

  /*
   * Supabase JSがHTML側で読み込まれていなくても、
   * script.js側から自動的に読み込む。
   */
  function loadSupabaseLibrary() {
    return new Promise((resolve, reject) => {
      if (window.supabase) {
        resolve();
        return;
      }

      const existing = document.querySelector(
        'script[src*="supabase-js"]'
      );

      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");

      script.src =
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

      script.async = true;

      script.onload = () => resolve();

      script.onerror = () => {
        reject(
          new Error("Supabaseライブラリを読み込めませんでした。")
        );
      };

      document.head.appendChild(script);
    });
  }

  async function initSupabase() {
    await loadSupabaseLibrary();

    if (!window.supabase) {
      throw new Error("Supabaseが利用できません。");
    }

    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    );

    console.log("Supabase connected");
  }

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
    `${prefix}_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;

  const escapeHTML = (value = "") =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const formatDate = (date) => {
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
  };

  async function saveState() {
    return true;
  }

  async function loadState() {
    state.posts = [];
    state.users = [];
    state.reports ||= [];
    state.notifications ||= [];
    state.privateBoards ||= [];
    state.bots ||= [];

    if (!supabaseClient) {
      console.error("Supabase client is not initialized.");
      return;
    }

    const { data: sessionData, error } =
      await supabaseClient.auth.getSession();

    if (error) {
      console.error("session error:", error);
    }

    const sessionUser =
      sessionData?.session?.user || null;

    if (sessionUser) {
      await loadCurrentUser(sessionUser.id);
    }

    await loadPosts();
  }
