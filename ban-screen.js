/* =========================================================
   KAKIKOMIN - ban-screen.js
   BAN / IP BAN / メンテナンス専用ゲート
   GitHub Pages deploy trigger: 20261005-2
   script.js / supabase.js より前に読み込む。
   ========================================================= */

(function () {
  "use strict";

  const SUPABASE_URL = "https://wtlmjaqyphmaeqhipqht.supabase.co";
  const SUPABASE_KEY = "sb_publishable_Mk4N_TF_cynZ53R7nmUyjQ_JeXsZ_Cs";
  const STORAGE_KEY = "sb-wtlmjaqyphmaeqhipqht-auth-token";
  const GATE_ID = "kakikomi-gate";
  const REFRESH_MS = 60 * 1000;
  const MAINTENANCE_OPEN_HASHES = ["#login", "#forgot-password"];
  const originalFetch = window.fetch.bind(window);

  let gate = null;

  function readSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.access_token) return parsed;
      return (parsed && parsed.currentSession) || null;
    } catch (error) {
      return null;
    }
  }

  async function callRpc(name, token) {
    const headers = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;

    try {
      const response = await originalFetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
        method: "POST",
        headers: headers,
        body: "{}"
      });

      let body = null;
      try { body = await response.json(); } catch (error) { body = null; }
      return { ok: response.ok, status: response.status, body: body };
    } catch (error) {
      return null;
    }
  }

  function handleErrorBody(body) {
    if (!body || typeof body !== "object") return;

    if (body.code === "IP_BANNED") {
      setGate({ kind: "ip", reason: body.details || "", until: body.hint || "" });
    } else if (body.code === "EMERGENCY_LOCKED") {
      setGate({ kind: "maintenance", message: body.message || "" });
    }
  }

  window.fetch = async function () {
    const response = await originalFetch.apply(window, arguments);

    try {
      if (response.status === 403 || response.status === 503) {
        const input = arguments[0];
        const url = typeof input === "string" ? input : (input && input.url) || "";

        if (url.indexOf(SUPABASE_URL + "/rest/v1/") === 0) {
          response.clone().json().then(handleErrorBody).catch(function () {});
        }
      }
    } catch (error) {}

    return response;
  };

  async function refresh() {
    const session = readSession();
    const token = session ? session.access_token : null;

    // IP BANはログイン状態に関係なく最優先で判定する。
    const ipResult = await callRpc("is_ip_banned", null);
    if (ipResult && ipResult.ok && ipResult.body === true) {
      setGate({ kind: "ip", reason: "このIPアドレスは利用停止中です。" });
      return;
    }

    const result = await callRpc(token ? "get_my_account_state" : "get_public_site_settings", token);
    if (!result) return;

    if (!result.ok) {
      handleErrorBody(result.body);
      return;
    }

    if (token && result.body) {
      if (result.body.status === "banned") {
        setGate({ kind: "banned", reason: result.body.ban_reason || "" });
        return;
      }
      if (result.body.status === "suspended") {
        setGate({ kind: "suspended", reason: result.body.ban_reason || "" });
        return;
      }
    }

    setGate(null);
  }

  function setGate(next) {
    const before = JSON.stringify(gate);
    const after = JSON.stringify(next);
    gate = next;
    if (before !== after) render();
  }

  const COPY = {
    ip: {
      label: "ACCESS RESTRICTED",
      title: "アクセスが制限されています",
      body: "このネットワーク（IPアドレス）からのアクセスは、管理者により制限されています。",
      note: "心当たりがない場合は、管理者にお問い合わせください。"
    },
    banned: {
      label: "ACCOUNT BANNED",
      title: "アカウントがBANされています",
      body: "このアカウントは、利用ルールに違反した可能性があるため、利用できなくなっています。",
      note: "内容に心当たりがない場合は、管理者にお問い合わせください。"
    },
    suspended: {
      label: "ACCOUNT SUSPENDED",
      title: "アカウントは一時停止中です",
      body: "管理者が停止を解除するまで、サイトを利用できません。",
      note: "内容に心当たりがない場合は、管理者にお問い合わせください。"
    },
    maintenance: {
      label: "MAINTENANCE",
      title: "メンテナンス中です",
      body: "現在メンテナンス中です。しばらくしてからもう一度お試しください。",
      note: ""
    }
  };

  function el(tag, style, text) {
    const node = document.createElement(tag);
    if (style) node.style.cssText = style;
    if (text) node.textContent = text;
    return node;
  }

  function button(label, kind, onClick) {
    const node = document.createElement(kind === "link" ? "a" : "button");
    if (kind !== "link") node.type = "button";
    node.className = "secondary-button";
    node.textContent = label;
    node.style.cssText =
      "min-height:40px;padding:0 16px;display:inline-flex;align-items:center;justify-content:center;" +
      "border:1px solid #cfd4dc;border-radius:8px;background:#fff;color:inherit;font:inherit;font-weight:700;" +
      "cursor:pointer;text-decoration:none;";
    if (onClick) node.addEventListener("click", onClick);
    return node;
  }

  async function logout() {
    const session = readSession();

    try {
      if (session && session.access_token) {
        await originalFetch(SUPABASE_URL + "/auth/v1/logout?scope=global", {
          method: "POST",
          headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + session.access_token }
        });
      }
    } catch (error) {}

    try { localStorage.removeItem(STORAGE_KEY); } catch (error) {}

    location.hash = "#login";
    location.reload();
  }

  function buildGate(g) {
    const copy = COPY[g.kind];
    const isMaintenance = g.kind === "maintenance";
    const accent = isMaintenance ? "#2563eb" : "#c62828";

    const overlay = el(
      "div",
      "position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px;overflow:auto;" +
      "background:var(--bg,#f6f7f9);color:var(--text,#1f2937);font-family:inherit;line-height:1.6;"
    );
    overlay.id = GATE_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", GATE_ID + "-title");

    const card = el(
      "div",
      "width:min(100%,480px);padding:32px 28px;background:var(--surface,#fff);" +
      "border:1px solid var(--border,#e4e7ec);border-radius:12px;box-shadow:0 6px 20px rgba(16,24,40,.07);"
    );

    card.appendChild(el("p", "margin:0 0 6px;color:" + accent + ";font-size:.72rem;font-weight:800;letter-spacing:.12em;", copy.label));

    const title = el("h1", "margin:0 0 12px;font-size:1.5rem;line-height:1.3;", copy.title);
    title.id = GATE_ID + "-title";
    card.appendChild(title);

    card.appendChild(el(
      "p",
      "margin:0;color:var(--text-secondary,#667085);overflow-wrap:anywhere;",
      isMaintenance && g.message ? g.message : copy.body
    ));

    if (!isMaintenance && g.reason) {
      const box = el("div", "margin-top:16px;padding:12px 14px;background:var(--surface-soft,#f1f3f6);border-radius:8px;");
      box.appendChild(el("p", "margin:0 0 4px;font-size:.78rem;font-weight:700;color:var(--text-secondary,#667085);", "理由"));
      box.appendChild(el("p", "margin:0;white-space:pre-wrap;overflow-wrap:anywhere;", g.reason));
      card.appendChild(box);
    }

    if (g.kind === "ip" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(g.until || "")) {
      card.appendChild(el("p", "margin:12px 0 0;font-size:.9rem;", "解除予定: " + g.until + "（日本時間）"));
    }

    if (copy.note) {
      card.appendChild(el("p", "margin:16px 0 0;font-size:.84rem;color:var(--text-muted,#98a2b3);", copy.note));
    }

    const actions = el("div", "display:flex;flex-wrap:wrap;gap:8px;margin-top:24px;");

    if (g.kind === "banned" || g.kind === "suspended") {
      actions.appendChild(button("ログアウト", "button", logout));
    } else {
      actions.appendChild(button("再読み込み", "button", function () { location.reload(); }));
      if (isMaintenance) {
        const link = button("管理者の方はこちら", "link");
        link.href = "#login";
        actions.appendChild(link);
      }
    }

    card.appendChild(actions);
    overlay.appendChild(card);
    return overlay;
  }

  function setInert(on) {
    Array.prototype.forEach.call(document.body.children, function (child) {
      if (child.id === GATE_ID || child.id === "toast-container" || child.tagName === "SCRIPT") return;
      if (on) child.setAttribute("inert", "");
      else child.removeAttribute("inert");
    });
  }

  function render() {
    const active = gate;
    const hidden =
      active &&
      active.kind === "maintenance" &&
      MAINTENANCE_OPEN_HASHES.indexOf(location.hash) !== -1;

    let node = document.getElementById(GATE_ID);

    if (!active || hidden || !document.body) {
      if (node) node.remove();
      if (document.body) setInert(false);
      document.documentElement.style.overflow = "";
      return;
    }

    const key = JSON.stringify(active);
    if (node && node.getAttribute("data-key") === key) return;
    if (node) node.remove();

    node = buildGate(active);
    node.setAttribute("data-key", key);
    document.body.appendChild(node);

    setInert(true);
    document.documentElement.style.overflow = "hidden";

    const firstButton = node.querySelector("button, a");
    if (firstButton) firstButton.focus();
  }

  function start() {
    refresh();

    window.addEventListener("hashchange", function () {
      render();
      refresh();
    });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) refresh();
    });

    window.addEventListener("storage", function (event) {
      if (event.key === STORAGE_KEY) refresh();
    });

    setInterval(refresh, REFRESH_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();