(() => {
  "use strict";

  const SUPABASE_URL = "https://wtlmjaqyphmaeqhipqht.supabase.co";
  const SUPABASE_KEY = "sb_publishable_Mk4N_TF_cynZ53R7nmUyjQ_JeXsZ_Cs";
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const CONTACT_CATEGORIES = [
    ["general", "その他・一般のお問い合わせ"],
    ["account", "アカウントについて"],
    ["bug", "不具合・エラー"],
    ["security", "セキュリティについて"],
    ["rules", "利用ルールについて"],
    ["privacy", "プライバシーについて"],
    ["request", "改善要望"],
    ["other", "その他"]
  ];

  const escapeHTML = value => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const formatDate = value => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ja-JP", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  };

  const contactSection = () => document.getElementById("contact");

  function renderContact() {
    const section = contactSection();
    if (!section) return;

    const inner = section.querySelector(".section-inner");
    if (!inner) return;

    inner.innerHTML = `
      <div class="page-header">
        <p class="section-label">CONTACT</p>
        <h1>お問い合わせ</h1>
        <p>KAKIKOMINへのお問い合わせを送信できます。</p>
      </div>

      <form id="contact-inquiry-form" class="settings-form">
        <div class="form-group">
          <label for="contact-category">お問い合わせの種類</label>
          <select id="contact-category" required>
            <option value="">選択してください</option>
            ${CONTACT_CATEGORIES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
          </select>
        </div>

        <div class="form-group">
          <label for="contact-subject">件名</label>
          <input type="text" id="contact-subject" maxlength="120" required>
        </div>

        <div class="form-group">
          <label for="contact-email">メールアドレス（任意）</label>
          <input type="email" id="contact-email" maxlength="320" autocomplete="email">
        </div>

        <div class="form-group">
          <label for="contact-message">お問い合わせ内容</label>
          <textarea id="contact-message" maxlength="5000" required placeholder="お問い合わせ内容を入力してください。"></textarea>
        </div>

        <div class="form-group">
          <label for="contact-reference">参考情報（任意）</label>
          <textarea id="contact-reference" maxlength="2000" placeholder="エラー内容や関連ページなどがあれば入力してください。"></textarea>
        </div>

        <button type="submit" class="primary-button">お問い合わせを送信</button>
      </form>

      <div id="contact-submit-result" class="account-panel" hidden></div>
      <div id="contact-admin-panel"></div>
    `;

    document.getElementById("contact-inquiry-form")?.addEventListener("submit", submitInquiry);
    loadAdminContactPanel();
  }

  async function submitInquiry(event) {
    event.preventDefault();

    const { data: { user } } = await client.auth.getUser();
    const payload = {
      user_id: user?.id ?? null,
      category: document.getElementById("contact-category")?.value,
      subject: document.getElementById("contact-subject")?.value.trim(),
      contact_email: document.getElementById("contact-email")?.value.trim() || null,
      message: document.getElementById("contact-message")?.value.trim(),
      reference_info: document.getElementById("contact-reference")?.value.trim() || null
    };

    if (!payload.category || !payload.subject || !payload.message) {
      showContactResult("入力されていない項目があります。", true);
      return;
    }

    const button = event.submitter;
    if (button) button.disabled = true;

    try {
      const { error } = await client.from("contact_inquiries").insert(payload);
      if (error) throw error;

      event.target.reset();
      showContactResult("お問い合わせを受け付けました。管理者が内容を確認します。", false);
    } catch (error) {
      console.error("contact inquiry:", error);
      showContactResult("お問い合わせを送信できませんでした。時間をおいてもう一度お試しください。", true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function showContactResult(message, isError) {
    const box = document.getElementById("contact-submit-result");
    if (!box) return;
    box.hidden = false;
    box.innerHTML = `<p>${escapeHTML(message)}</p>`;
    box.classList.toggle("settings-danger-zone", Boolean(isError));
  }

  async function loadAdminContactPanel() {
    const panel = document.getElementById("contact-admin-panel");
    if (!panel) return;

    const { data, error } = await client.rpc("is_admin");
    if (error || data !== true) return;

    panel.innerHTML = `
      <hr>
      <div class="page-header">
        <p class="section-label">ADMIN</p>
        <h2>お問い合わせ管理</h2>
        <p>管理者だけが問い合わせ内容を閲覧・対応できます。</p>
      </div>
      <div class="form-actions">
        <button type="button" class="secondary-button" id="contact-admin-refresh">問い合わせを更新</button>
      </div>
      <div id="contact-admin-list" class="admin-list"></div>
    `;

    document.getElementById("contact-admin-refresh")?.addEventListener("click", loadAdminContactList);
    await loadAdminContactList();
  }

  async function loadAdminContactList() {
    const list = document.getElementById("contact-admin-list");
    if (!list) return;

    list.innerHTML = '<div class="empty-state"><p>読み込み中...</p></div>';

    const { data, error } = await client
      .from("contact_inquiries")
      .select("id,user_id,category,subject,contact_email,message,reference_info,status,admin_note,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("contact admin list:", error);
      list.innerHTML = '<div class="empty-state"><p>お問い合わせを読み込めませんでした。</p></div>';
      return;
    }

    if (!data?.length) {
      list.innerHTML = '<div class="empty-state"><p>お問い合わせはありません。</p></div>';
      return;
    }

    list.innerHTML = data.map(item => {
      const category = CONTACT_CATEGORIES.find(([v]) => v === item.category)?.[1] || item.category;
      return `
        <article class="admin-list-item" data-contact-item="${item.id}">
          <div class="admin-list-item-header">
            <strong>#${item.id} ${escapeHTML(item.subject)}</strong>
            <span>${escapeHTML(formatDate(item.created_at))}</span>
          </div>
          <p><strong>種類：</strong>${escapeHTML(category)}</p>
          <p><strong>ユーザーID：</strong>${escapeHTML(item.user_id || "未ログイン")}</p>
          <p><strong>メール：</strong>${escapeHTML(item.contact_email || "未入力")}</p>
          <div class="account-panel">
            <p><strong>内容</strong></p>
            <p>${escapeHTML(item.message).replaceAll("\\n", "<br>")}</p>
          </div>
          ${item.reference_info ? `<p><strong>参考情報：</strong>${escapeHTML(item.reference_info)}</p>` : ""}
          <div class="form-group">
            <label for="contact-status-${item.id}">対応状況</label>
            <select id="contact-status-${item.id}">
              <option value="pending" ${item.status === "pending" ? "selected" : ""}>未対応</option>
              <option value="in_progress" ${item.status === "in_progress" ? "selected" : ""}>対応中</option>
              <option value="resolved" ${item.status === "resolved" ? "selected" : ""}>対応済み</option>
            </select>
          </div>
          <div class="form-group">
            <label for="contact-note-${item.id}">管理者メモ</label>
            <textarea id="contact-note-${item.id}" maxlength="3000">${escapeHTML(item.admin_note || "")}</textarea>
          </div>
          <button type="button" class="primary-button" data-save-contact="${item.id}">対応状況を保存</button>
        </article>
      `;
    }).join("");

    list.querySelectorAll("[data-save-contact]").forEach(button => {
      button.addEventListener("click", () => updateInquiry(button.dataset.saveContact));
    });
  }

  async function updateInquiry(id) {
    const status = document.getElementById(`contact-status-${id}`)?.value;
    const admin_note = document.getElementById(`contact-note-${id}`)?.value.trim() || null;

    const { error } = await client
      .from("contact_inquiries")
      .update({ status, admin_note })
      .eq("id", id);

    if (error) {
      console.error("contact update:", error);
      alert("お問い合わせを更新できませんでした。");
      return;
    }

    await loadAdminContactList();
  }

  function init() {
    renderContact();

    window.addEventListener("hashchange", () => {
      if (location.hash === "#contact") {
        setTimeout(renderContact, 0);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();