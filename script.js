(() => {
  'use strict';

  const KEY = 'kakikomi_local_v3';
  const SESSION_KEY = 'kakikomi_session_v3';
  const ADMIN_EMAIL = 'admin@kakikomi.local';
  const ADMIN_PASSWORD = 'KAKIKOMI-admin-2026';

  const now = () => new Date().toISOString();
  const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c]));
  const formatDate = iso =>
    new Intl.DateTimeFormat('ja-JP', {
      dateStyle:'medium',
      timeStyle:'short'
    }).format(new Date(iso));

  const save = () =>
    localStorage.setItem(KEY, JSON.stringify(db));

  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || null;
    } catch {
      return null;
    }
  };

  const seed = () => ({
    site: {
      name: 'KAKIKOMI',
      description: 'みんなで自由に書き込める総合掲示板',
      registrationEnabled: true,
      postingEnabled: true,
      maintenanceMode: false
    },

    users: [{
      id: 'user_admin',
      username: 'KAKIKOMI管理者',
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'owner',
      status: 'active',
      bio: 'KAKIKOMI管理者です。',
      forcePasswordChange: false,
      disablePosting: false,
      disableReplies: false,
      createdAt: now(),
      lastLoginAt: null,
      notificationsReadAt: null
    }],

    posts: [
      {
        id:'post_welcome',
        userId:'user_admin',
        category:'一言',
        title:'KAKIKOMIへようこそ！',
        content:'ここに自由に書き込めます。まずはルールを確認して、楽しく利用してください。',
        allowReplies:true,
        allowShare:true,
        likes:0,
        createdAt:now(),
        deleted:false
      },
      {
        id:'post_question',
        userId:'user_admin',
        category:'質問',
        title:'テスト投稿',
        content:'これはローカル版のサンプル投稿です。ログインして自分の投稿も作ってみてください。',
        allowReplies:true,
        allowShare:true,
        likes:2,
        createdAt:new Date(Date.now()-3600000).toISOString(),
        deleted:false
      }
    ],

    reports: [],
    notifications: [],
    bans: [],
    bots: [{
      id:'bot_system',
      name:'KAKIKOMI Bot',
      description:'システムBot',
      status:'active',
      createdAt:now()
    }],
    privateBoards: [],
    follows: [],
    bookmarks: []
  });

  let db = load() || seed();

  save();

  let sessionId =
    localStorage.getItem(SESSION_KEY) || null;

  function currentUser() {
    return db.users.find(
      u => u.id === sessionId && u.status !== 'deleted'
    ) || null;
  }

  function isAdmin() {
    const u = currentUser();
    return !!u && ['admin','owner'].includes(u.role);
  }

  function requireLogin() {
    if (!currentUser()) {
      location.hash = '#login';
      toast('ログインしてください');
      return false;
    }

    return true;
  }

  function requireAdmin() {
    if (!isAdmin()) {
      location.hash = '#home';
      toast('管理者のみ利用できます');
      return false;
    }

    return true;
  }

  function toast(message, type='info') {
    const box =
      $('#toast-container') ||
      $('#toastContainer');

    if (!box) return;

    const item = document.createElement('div');

    item.className = `toast toast-${type}`;
    item.textContent = message;

    box.appendChild(item);

    setTimeout(() => item.remove(), 3200);
  }

  function setLoading(on) {
    const el = $('#global-loading');

    if (el) {
      el.hidden = !on;
    }
  }

  function ensureRuntimeUI() {
    let toastBox = $('#toast-container');

    if (!toastBox) {
      toastBox = document.createElement('div');
      toastBox.id = 'toast-container';
      toastBox.className = 'toast-container';

      document.body.appendChild(toastBox);
    }

    let loading = $('#global-loading');

    if (!loading) {
      loading = document.createElement('div');

      loading.id = 'global-loading';
      loading.className = 'global-loading';
      loading.hidden = true;

      loading.innerHTML = `
        <div class="loading-card">
          <div class="spinner"></div>
          <span>処理中…</span>
        </div>
      `;

      document.body.appendChild(loading);
    }
  }

  function route() {
    const raw =
      location.hash.replace(/^#/, '') || 'home';

    const valid =
      new Set(
        $$('.page-section').map(x => x.id)
      );

    let target = raw;

    if (
      raw.startsWith('admin') &&
      !isAdmin()
    ) {
      target = 'home';
    }

    if (!valid.has(target)) {
      target = 'error-page';
    }

    $$('.page-section').forEach(
      s => s.hidden = s.id !== target
    );

    if (target === 'admin-page') {
      renderAdmin();
    }

    if (target === 'board') {
      renderPosts();
    }

    if (target === 'questions') {
      renderCategoryList(
        '質問',
        '#question-list'
      );
    }

    if (target === 'consultations') {
      renderCategoryList(
        '相談',
        '#consultation-list'
      );
    }

    if (target === 'search') {
      renderSearchResults(
        $('#search-input')?.value || ''
      );
    }

    if (target === 'account') {
      renderAccount();
    }

    if (target === 'profile') {
      renderProfile(currentUser()?.id);
    }

    if (target === 'notifications') {
      renderNotifications();
    }

    if (target === 'private-boards') {
      renderPrivateBoards();
    }

    if (target === 'bot') {
      renderBots();
    }

    updateHeader();
  }

  function updateHeader() {
    const user = currentUser();

    const accountBtn =
      $('#account-button');

    if (accountBtn) {
      accountBtn.textContent =
        user
          ? `@${user.username}`
          : 'アカウント';
    }

    const notifBtn =
      $('#notification-button');

    if (notifBtn) {
      notifBtn.textContent =
        `通知${
          unreadCount()
            ? ` (${unreadCount()})`
            : ''
        }`;
    }

    const admin =
      $('#admin-page');

    if (admin) {
      admin.hidden =
        !isAdmin() &&
        admin.hidden !== false
          ? true
          : admin.hidden;
    }

    const botMgmt =
      $('#bot-management');

    if (botMgmt) {
      botMgmt.hidden = !isAdmin();
    }

    injectAdminLink();
  }

  function injectAdminLink() {
    const nav =
      $('.account-navigation');

    if (!nav) return;

    let a =
      nav.querySelector(
        '[data-admin-link]'
      );

    if (isAdmin()) {
      if (!a) {
        a = document.createElement('a');

        a.href = '#admin-page';
        a.dataset.adminLink = '1';
        a.textContent = '管理者ページ';

        nav.appendChild(a);
      }
    } else if (a) {
      a.remove();
    }
  }

  function renderAccount() {
    const u = currentUser();

    const guest =
      $('#guest-account');

    const logged =
      $('#logged-in-account');

    if (guest) {
      guest.hidden = !!u;
    }

    if (logged) {
      logged.hidden = !u;
    }

    if (u) {
      if ($('#account-username')) {
        $('#account-username').textContent =
          u.username;
      }

      if ($('#account-user-id')) {
        $('#account-user-id').textContent =
          `ID: ${u.id}`;
      }
    }
  }

  function renderProfile(userId) {
    const u =
      db.users.find(x => x.id === userId) ||
      currentUser();

    if (!u) return;

    const name =
      $('#profile-name');

    const desc =
      $('#profile-description');

    if (name) {
      name.textContent = u.username;
    }

    if (desc) {
      desc.textContent =
        u.bio ||
        'プロフィール文はまだありません。';
    }

    if ($('#profile-post-count')) {
      $('#profile-post-count').textContent =
        db.posts.filter(
          p =>
            p.userId === u.id &&
            !p.deleted
        ).length;
    }

    if ($('#profile-followers')) {
      $('#profile-followers').textContent =
        db.follows.filter(
          f => f.to === u.id
        ).length;
    }

    if ($('#profile-following')) {
      $('#profile-following').textContent =
        db.follows.filter(
          f => f.from === u.id
        ).length;
    }

    const list =
      $('#profile-posts');

    if (list) {
      list.innerHTML =
        db.posts
          .filter(
            p =>
              p.userId === u.id &&
              !p.deleted
          )
          .map(postCard)
          .join('') ||
        '<p class="empty-state">投稿はありません。</p>';

      bindPostActions(list);
    }
  }

  function renderPosts() {
    const list =
      $('#post-list');

    if (!list) return;

    const cat =
      $('#board-category')?.value || '';

    let posts =
      db.posts
        .filter(
          p =>
            !p.deleted &&
            (!cat || p.category === cat)
        )
        .sort(
          (a,b) =>
            new Date(b.createdAt) -
            new Date(a.createdAt)
        );

    list.innerHTML =
      posts.map(postCard).join('');

    const empty =
      $('#no-posts');

    if (empty) {
      empty.hidden =
        posts.length !== 0;
    }

    bindPostActions(list);
  }

  function postCard(p) {
    const u =
      db.users.find(
        x => x.id === p.userId
      ) || {
        username:'削除されたユーザー',
        id:'-'
      };

    const me =
      currentUser();

    const canDelete =
      me &&
      (
        me.id === p.userId ||
        isAdmin()
      );

    const liked =
      !!me &&
      db.bookmarks.some(
        x =>
          x.type === 'like' &&
          x.userId === me.id &&
          x.targetId === p.id
      );

    return `
      <article
        class="post-card"
        data-post-id="${esc(p.id)}"
      >

        <div class="post-card-header">
          <div>
            <strong class="post-author">
              ${esc(u.username)}
            </strong>

            <span class="post-meta">
              ${esc(p.category)}
              ・
              ${esc(formatDate(p.createdAt))}
            </span>
          </div>
        </div>

        <div class="post-card-body">
          <h3>
            ${esc(p.title || '無題')}
          </h3>

          <p>
            ${esc(p.content)
              .replace(/\n/g,'<br>')}
          </p>
        </div>

        <div class="post-card-footer">

          <span>
            ♡ ${p.likes || 0}
          </span>

          <div class="post-actions">

            <button
              type="button"
              data-action="like"
              data-post-id="${esc(p.id)}"
            >
              ${liked ? 'いいね済み' : 'いいね'}
            </button>

            ${
              p.allowReplies
                ? `
                  <button
                    type="button"
                    data-action="reply"
                    data-post-id="${esc(p.id)}"
                  >
                    返信
                  </button>
                `
                : ''
            }

            ${
              p.allowShare
                ? `
                  <button
                    type="button"
                    data-action="share"
                    data-post-id="${esc(p.id)}"
                  >
                    共有
                  </button>
                `
                : ''
            }

            <button
              type="button"
              data-action="report"
              data-post-id="${esc(p.id)}"
            >
              通報
            </button>

            ${
              canDelete
                ? `
                  <button
                    type="button"
                    class="danger-text"
                    data-action="delete"
                    data-post-id="${esc(p.id)}"
                  >
                    削除
                  </button>
                `
                : ''
            }

          </div>
        </div>

      </article>
    `;
  }

  function bindPostActions(root=document) {
    $$('[data-action]',root)
      .forEach(btn => {

        btn.onclick = () => {

          const id =
            btn.dataset.postId;

          const action =
            btn.dataset.action;

          if (action === 'like') {
            toggleLike(id);
          }

          if (action === 'report') {
            openReport(id);
          }

          if (action === 'share') {
            openShare(id);
          }

          if (action === 'delete') {
            deletePost(id);
          }

          if (action === 'reply') {
            toast(
              '返信機能は次のSupabase版でコメント保存に対応します。'
            );
          }
        };
      });
  }

  function toggleLike(id) {
    if (!requireLogin()) return;

    const p =
      db.posts.find(
        x => x.id === id
      );

    if (!p) return;

    const me =
      currentUser();

    const idx =
      db.bookmarks.findIndex(
        x =>
          x.type === 'like' &&
          x.userId === me.id &&
          x.targetId === id
      );

    if (idx >= 0) {

      db.bookmarks.splice(idx,1);

      p.likes =
        Math.max(
          0,
          (p.likes || 0) - 1
        );

    } else {

      db.bookmarks.push({
        type:'like',
        userId:me.id,
        targetId:id
      });

      p.likes =
        (p.likes || 0) + 1;
    }

    save();

    renderPosts();

    toast(
      idx >= 0
        ? 'いいねを取り消しました'
        : 'いいねしました'
    );
  }

  function createPost(e) {
    e.preventDefault();

    if (!requireLogin()) return;

    const me =
      currentUser();

    if (me.disablePosting) {
      toast(
        '現在、投稿が制限されています',
        'error'
      );

      return;
    }

    if (!db.site.postingEnabled) {
      toast(
        '現在、投稿は停止されています',
        'error'
      );

      return;
    }

    const f =
      e.currentTarget;

    const content =
      $('#post-content')
        ?.value
        .trim();

    const title =
      $('#post-title')
        ?.value
        .trim();

    const cat =
      $('#post-category')
        ?.value ||
      '一言';

    if (!content) {
      toast(
        '本文を入力してください',
        'error'
      );

      return;
    }

    const p = {
      id:uid('post'),
      userId:me.id,
      category:cat,
      title:title || '無題',
      content,
      allowReplies:
        $('#allow-replies')
          ?.checked !== false,
      allowShare:
        $('#allow-share')
          ?.checked !== false,
      likes:0,
      createdAt:now(),
      deleted:false
    };

    db.posts.unshift(p);

    save();

    f.reset();

    if ($('#post-character-count')) {
      $('#post-character-count').textContent =
        '0 / 2000';
    }

    toast(
      '投稿しました',
      'success'
    );

    location.hash = '#board';

    renderPosts();
  }

  function openReport(id) {
    if (!requireLogin()) return;

    const d =
      $('#report-dialog');

    const hidden =
      $('#modal-report-post-id');

    if (hidden) {
      hidden.value = id;
    }

    if (d?.showModal) {
      d.showModal();
    } else {

      location.hash = '#report';

      if ($('#report-post-id')) {
        $('#report-post-id').value = id;
      }
    }
  }

  function submitReport(e) {
    e.preventDefault();

    if (!requireLogin()) return;

    const f =
      e.currentTarget;

    const isModal =
      f.id === 'modal-report-form';

    const id =
      (
        isModal
          ? $('#modal-report-post-id')
          : $('#report-post-id')
      )?.value;

    const reason =
      (
        isModal
          ? $('#modal-report-reason')
          : $('#report-reason')
      )?.value;

    const detail =
      (
        isModal
          ? $('#modal-report-detail')
          : $('#report-detail')
      )?.value || '';

    if (!id || !reason) {
      toast(
        '通報理由を選択してください',
        'error'
      );

      return;
    }

    if (
      db.reports.some(
        r =>
          r.postId === id &&
          r.reporterId === currentUser().id &&
          r.status !== 'closed'
      )
    ) {
      toast(
        'この投稿はすでに通報しています',
        'error'
      );

      return;
    }

    db.reports.push({
      id:uid('report'),
      postId:id,
      reporterId:currentUser().id,
      reason,
      detail,
      status:'open',
      createdAt:now()
    });

    db.notifications.push({
      id:uid('noti'),
      userId:'user_admin',
      type:'report',
      message:'新しい通報が届きました。',
      createdAt:now(),
      read:false
    });

    save();

    if ($('#report-dialog')?.open) {
      $('#report-dialog').close();
    }

    f.reset();

    toast(
      '通報を送信しました',
      'success'
    );
  }

  function deletePost(id) {
    if (!requireLogin()) return;

    const p =
      db.posts.find(
        x => x.id === id
      );

    if (!p) return;

    const me =
      currentUser();

    if (
      me.id !== p.userId &&
      !isAdmin()
    ) {
      toast(
        '削除できません',
        'error'
      );

      return;
    }

    if (
      !confirm(
        'この投稿を削除しますか？'
      )
    ) {
      return;
    }

    p.deleted = true;

    save();

    renderPosts();

    toast(
      '投稿を削除しました',
      'success'
    );
  }

  function openShare(id) {
    const url =
      `${location.origin}${location.pathname}#board?post=${encodeURIComponent(id)}`;

    const input =
      $('#share-url');

    if (input) {
      input.value = url;
    }

    location.hash = '#share';

    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(url)
        .catch(() => {});
    }
  }

  async function copyShare() {
    const v =
      $('#share-url')?.value;

    if (!v) return;

    try {
      await navigator.clipboard.writeText(v);

      toast(
        'URLをコピーしました',
        'success'
      );

    } catch {
      toast(
        'URLを選択してコピーしてください'
      );
    }
  }

  function renderCategoryList(
    category,
    selector
  ) {
    const el = $(selector);

    if (!el) return;

    const posts =
      db.posts
        .filter(
          p =>
            !p.deleted &&
            p.category === category
        )
        .sort(
          (a,b) =>
            new Date(b.createdAt) -
            new Date(a.createdAt)
        );

    el.innerHTML =
      posts.map(postCard).join('') ||
      '<p class="empty-state">投稿はありません。</p>';

    bindPostActions(el);
  }

  function renderSearchResults(q) {
    const el =
      $('#search-results');

    if (!el) return;

    q =
      (q || '')
        .trim()
        .toLowerCase();

    if (!q) {
      el.innerHTML =
        '<p class="empty-state">検索キーワードを入力してください。</p>';

      return;
    }

    const ps =
      db.posts.filter(
        p =>
          !p.deleted &&
          `${p.title} ${p.content} ${p.category}`
            .toLowerCase()
            .includes(q)
      );

    el.innerHTML =
      ps.map(postCard).join('') ||
      '<p class="empty-state">該当する投稿がありません。</p>';

    bindPostActions(el);
  }

  function renderNotifications() {
    const el =
      $('#notification-list');

    if (!el) return;

    const u =
      currentUser();

    if (!u) {
      el.innerHTML =
        '<p class="empty-state">ログインしてください。</p>';

      return;
    }

    const ns =
      db.notifications
        .filter(
          n => n.userId === u.id
        )
        .sort(
          (a,b) =>
            new Date(b.createdAt) -
            new Date(a.createdAt)
        );

    el.innerHTML =
      ns.map(
        n => `
          <article
            class="notification-item ${
              n.read ? '' : 'unread'
            }"
          >
            <strong>
              ${esc(n.message)}
            </strong>

            <time>
              ${esc(formatDate(n.createdAt))}
            </time>
          </article>
        `
      ).join('') ||
      '<p class="empty-state">通知はありません。</p>';
  }

  function unreadCount() {
    const u =
      currentUser();

    return u
      ? db.notifications.filter(
          n =>
            n.userId === u.id &&
            !n.read
        ).length
      : 0;
  }

  function markNotifications() {
    const u =
      currentUser();

    if (!u) return;

    db.notifications
      .filter(
        n => n.userId === u.id
      )
      .forEach(
        n => n.read = true
      );

    save();

    renderNotifications();

    updateHeader();

    toast(
      '通知を既読にしました'
    );
  }

  function renderPrivateBoards() {
    const el =
      $('#private-board-list');

    if (!el) return;

    el.innerHTML =
      db.privateBoards
        .map(
          b => `
            <article
              class="private-board-card"
            >
              <h3>
                ${esc(b.name)}
              </h3>

              <p>
                ${esc(b.description || '')}
              </p>

              <span>
                参加コード:
                ${esc(b.code)}
              </span>
            </article>
          `
        )
        .join('') ||
      '<p class="empty-state">非公開掲示板はまだありません。</p>';
  }

  function createPrivateBoard(e) {
    e.preventDefault();

    if (!requireLogin()) return;

    const name =
      prompt('掲示板名');

    if (!name) return;

    const b = {
      id:uid('pb'),
      name,
      description:'',
      code:
        Math.random()
          .toString(36)
          .slice(2,8)
          .toUpperCase(),
      ownerId:currentUser().id,
      createdAt:now()
    };

    db.privateBoards.push(b);

    save();

    renderPrivateBoards();

    toast(
      `掲示板を作成しました。コード: ${b.code}`,
      'success'
    );
  }

  function joinPrivateBoard(e) {
    e.preventDefault();

    const code =
      $('#private-board-code')
        ?.value
        .trim()
        .toUpperCase();

    const b =
      db.privateBoards.find(
        x => x.code === code
      );

    if (!b) {
      toast(
        '掲示板コードが見つかりません',
        'error'
      );

      return;
    }

    toast(
      `${b.name}に参加しました`,
      'success'
    );
  }

  function login(e) {
    e.preventDefault();

    const email =
      $('#login-email')
        .value
        .trim()
        .toLowerCase();

    const pw =
      $('#login-password')
        .value;

    if (!email || !pw) return;

    const u =
      db.users.find(
        x =>
          x.email.toLowerCase() === email &&
          x.password === pw &&
          x.status !== 'deleted'
      );

    if (!u) {
      toast(
        'メールアドレスまたはパスワードが違います',
        'error'
      );

      return;
    }

    if (
      u.status === 'banned' ||
      u.status === 'suspended'
    ) {
      toast(
        'このアカウントは現在利用できません',
        'error'
      );

      return;
    }

    sessionId = u.id;

    localStorage.setItem(
      SESSION_KEY,
      sessionId
    );

    u.lastLoginAt = now();

    save();

    toast(
      'ログインしました',
      'success'
    );

    location.hash =
      u.forcePasswordChange
        ? '#security-settings'
        : '#home';

    renderAccount();
    updateHeader();
  }

  function register(e) {
    e.preventDefault();

    if (!db.site.registrationEnabled) {
      toast(
        '現在、新規登録を停止しています',
        'error'
      );

      return;
    }

    const username =
      $('#register-username')
        .value
        .trim();

    const email =
      $('#register-email')
        .value
        .trim()
        .toLowerCase();

    const pw =
      $('#register-password')
        .value;

    const confirmPw =
      $('#register-password-confirm')
        .value;

    if (
      !username ||
      !email ||
      pw.length < 6 ||
      pw !== confirmPw
    ) {
      toast(
        '入力内容を確認してください（パスワードは6文字以上）',
        'error'
      );

      return;
    }

    if (
      db.users.some(
        u =>
          u.email.toLowerCase() === email
      )
    ) {
      toast(
        'そのメールアドレスは登録済みです',
        'error'
      );

      return;
    }

    const u = {
      id:uid('user'),
      username,
      email,
      password:pw,
      role:'user',
      status:'active',
      bio:'',
      forcePasswordChange:false,
      disablePosting:false,
      disableReplies:false,
      createdAt:now(),
      lastLoginAt:null,
      notificationsReadAt:null
    };

    db.users.push(u);

    save();

    sessionId = u.id;

    localStorage.setItem(
      SESSION_KEY,
      sessionId
    );

    toast(
      'アカウントを作成しました',
      'success'
    );

    location.hash = '#home';

    updateHeader();
  }

  function logout() {
    sessionId = null;

    localStorage.removeItem(
      SESSION_KEY
    );

    toast(
      'ログアウトしました',
      'success'
    );

    location.hash = '#home';

    updateHeader();

    renderAccount();
  }

  function updateProfile(e) {
    e.preventDefault();

    if (!requireLogin()) return;

    const u =
      currentUser();

    u.username =
      $('#settings-username')
        .value
        .trim() ||
      u.username;

    u.bio =
      $('#settings-bio')
        .value
        .trim();

    save();

    toast(
      'プロフィールを更新しました',
      'success'
    );

    renderAccount();

    renderProfile(u.id);
  }

  function changePassword(e) {
    e.preventDefault();

    if (!requireLogin()) return;

    const u =
      currentUser();

    const cur =
      $('#current-password')
        .value;

    const nw =
      $('#new-password')
        .value;

    const cf =
      $('#new-password-confirm')
        .value;

    if (
      u.password !== cur ||
      nw.length < 6 ||
      nw !== cf
    ) {
      toast(
        'パスワードを確認してください',
        'error'
      );

      return;
    }

    u.password = nw;

    u.forcePasswordChange = false;

    save();

    e.currentTarget.reset();

    toast(
      'パスワードを変更しました',
      'success'
    );
  }

  function deleteAccount() {
    if (!requireLogin()) return;

    const u =
      currentUser();

    if (
      !confirm(
        'アカウントを削除しますか？'
      )
    ) {
      return;
    }

    u.status = 'deleted';

    u.username =
      '削除されたユーザー';

    u.email =
      `deleted_${u.id}@local.invalid`;

    sessionId = null;

    localStorage.removeItem(
      SESSION_KEY
    );

    save();

    toast(
      'アカウントを削除しました'
    );

    location.hash = '#home';

    updateHeader();
  }

  function renderAdmin() {
    if (!requireAdmin()) return;

    if ($('#admin-user-count')) {
      $('#admin-user-count').textContent =
        db.users.filter(
          u => u.status !== 'deleted'
        ).length;
    }

    if ($('#admin-post-count')) {
      $('#admin-post-count').textContent =
        db.posts.filter(
          p => !p.deleted
        ).length;
    }

    if ($('#admin-report-count')) {
      $('#admin-report-count').textContent =
        db.reports.filter(
          r => r.status === 'open'
        ).length;
    }

    if ($('#admin-ban-count')) {
      $('#admin-ban-count').textContent =
        db.bans.filter(
          b =>
            !b.expiresAt ||
            new Date(b.expiresAt) >
              new Date()
        ).length;
    }

    renderAdminUsers();
    renderAdminPosts();
    renderAdminReports();
    renderAdminBans();
    renderAdminBots();
    renderAdminBoards();
    renderAdminSettings();
  }

  function renderAdminUsers(q='') {
    const el =
      $('#admin-users-table-body');

    if (!el) return;

    const s =
      (q || '').toLowerCase();

    const us =
      db.users.filter(
        u =>
          u.status !== 'deleted' &&
          (
            !s ||
            `${u.username} ${u.email} ${u.id}`
              .toLowerCase()
              .includes(s)
          )
      );

    el.innerHTML =
      us.map(
        u => `
          <tr>

            <td>
              ${esc(u.username)}
            </td>

            <td>
              ${esc(u.id)}
            </td>

            <td>
              ${esc(u.email)}
            </td>

            <td>
              ${esc(u.role)}
            </td>

            <td>
              ${esc(u.status)}
            </td>

            <td>
              <button
                type="button"
                data-admin-user="${esc(u.id)}"
              >
                設定
              </button>
            </td>

          </tr>
        `
      ).join('') ||
      `
        <tr>
          <td colspan="6">
            ユーザーが見つかりません。
          </td>
        </tr>
      `;

    $$('[data-admin-user]',el)
      .forEach(
        b =>
          b.onclick = () =>
            openAdminUser(
              b.dataset.adminUser
            )
      );
  }

  function openAdminUser(id) {
    const u =
      db.users.find(
        x => x.id === id
      );

    if (!u) return;

    $('#admin-target-user-id').value =
      u.id;

    $('#admin-target-username').value =
      u.username;

    $('#admin-target-status').value =
      u.status;

    $('#admin-force-password-change').checked =
      !!u.forcePasswordChange;

    $('#admin-disable-posting').checked =
      !!u.disablePosting;

    $('#admin-disable-replies').checked =
      !!u.disableReplies;

    const detail =
      $('#admin-user-detail');

    if (detail) {
      detail.hidden = false;
    }
  }

  function saveAdminUser(e) {
    e.preventDefault();

    if (!requireAdmin()) return;

    const id =
      $('#admin-target-user-id')
        .value;

    const u =
      db.users.find(
        x => x.id === id
      );

    if (!u) return;

    u.username =
      $('#admin-target-username')
        .value
        .trim() ||
      u.username;

    u.status =
      $('#admin-target-status')
        .value;

    u.forcePasswordChange =
      $('#admin-force-password-change')
        .checked;

    u.disablePosting =
      $('#admin-disable-posting')
        .checked;

    u.disableReplies =
      $('#admin-disable-replies')
        .checked;

    save();

    renderAdmin();

    toast(
      'ユーザー設定を保存しました',
      'success'
    );
  }

  function renderAdminPosts() {
    const el =
      $('#admin-post-list');

    if (!el) return;

    el.innerHTML =
      db.posts
        .filter(
          p => !p.deleted
        )
        .map(
          p => `
            <div class="admin-list-item">

              <div>
                <strong>
                  ${esc(p.title)}
                </strong>

                <small>
                  ${esc(
                    formatDate(p.createdAt)
                  )}
                </small>
              </div>

              <button
                type="button"
                data-admin-delete-post="${esc(p.id)}"
                class="danger-button"
              >
                削除
              </button>

            </div>
          `
        )
        .join('') ||
      '<p>投稿はありません。</p>';

    $$(
      '[data-admin-delete-post]',
      el
    ).forEach(
      b =>
        b.onclick = () =>
          deletePost(
            b.dataset.adminDeletePost
          )
    );
  }

  function renderAdminReports() {
    const el =
      $('#admin-report-list');

    if (!el) return;

    el.innerHTML =
      db.reports
        .map(
          r => {

            const p =
              db.posts.find(
                x => x.id === r.postId
              );

            const u =
              db.users.find(
                x => x.id === r.reporterId
              );

            return `
              <div
                class="admin-list-item"
              >

                <div>

                  <strong>
                    ${esc(r.reason)}
                  </strong>

                  <p>
                    ${esc(
                      r.detail ||
                      '詳細なし'
                    )}
                  </p>

                  <small>
                    投稿:
                    ${esc(
                      p?.title ||
                      '削除済み'
                    )}
                    /
                    通報者:
                    ${esc(
                      u?.username ||
                      '-'
                    )}
                    /
                    ${esc(
                      formatDate(
                        r.createdAt
                      )
                    )}
                  </small>

                </div>

                <select
                  data-report-status="${esc(r.id)}"
                >

                  <option
                    value="open"
                    ${
                      r.status === 'open'
                        ? 'selected'
                        : ''
                    }
                  >
                    未対応
                  </option>

                  <option
                    value="reviewing"
                    ${
                      r.status === 'reviewing'
                        ? 'selected'
                        : ''
                    }
                  >
                    確認中
                  </option>

                  <option
                    value="closed"
                    ${
                      r.status === 'closed'
                        ? 'selected'
                        : ''
                    }
                  >
                    対応済み
                  </option>

                </select>

              </div>
            `;
          }
        )
        .join('') ||
      '<p>通報はありません。</p>';

    $$(
      '[data-report-status]',
      el
    ).forEach(
      s =>
        s.onchange = () => {

          const r =
            db.reports.find(
              x =>
                x.id ===
                s.dataset.reportStatus
            );

          if (r) {
            r.status = s.value;

            save();

            renderAdmin();
          }
        }
    );
  }

  function renderAdminBans() {
    const el =
      $('#ip-ban-table-body');

    if (!el) return;

    el.innerHTML =
      db.bans
        .map(
          b => `
            <tr>

              <td>
                ${esc(b.ip)}
              </td>

              <td>
                ${esc(b.reason)}
              </td>

              <td>
                ${
                  b.expiresAt
                    ? esc(
                        formatDate(
                          b.expiresAt
                        )
                      )
                    : '無期限'
                }
              </td>

              <td>

                <button
                  type="button"
                  data-unban="${esc(b.id)}"
                >
                  解除
                </button>

              </td>

            </tr>
          `
        )
        .join('') ||
      `
        <tr>
          <td colspan="4">
            BANはありません。
          </td>
        </tr>
      `;

    $$('[data-unban]',el)
      .forEach(
        b =>
          b.onclick = () => {

            db.bans =
              db.bans.filter(
                x =>
                  x.id !==
                  b.dataset.unban
              );

            save();

            renderAdmin();

            toast(
              'IP BANを解除しました',
              'success'
            );
          }
      );
  }

  function addBan(e) {
    e.preventDefault();

    if (!requireAdmin()) return;

    const ip =
      $('#ban-ip')
        .value
        .trim();

    const reason =
      $('#ban-reason')
        .value
        .trim() ||
      '管理者による制限';

    const duration =
      $('#ban-duration')
        .value;

    if (!ip) {
      toast(
        'IPアドレスを入力してください',
        'error'
      );

      return;
    }

    let expiresAt = null;

    if (
      duration &&
      duration !== 'permanent'
    ) {
      expiresAt =
        new Date(
          Date.now() +
          Number(duration) *
          3600000
        ).toISOString();
    }

    db.bans.push({
      id:uid('ban'),
      ip,
      reason,
      expiresAt,
      createdAt:now()
    });

    save();

    e.currentTarget.reset();

    renderAdmin();

    toast(
      'IP BANを追加しました',
      'success'
    );
  }

  function renderAdminBots() {
    const el =
      $('#admin-bot-list');

    if (!el) return;

    el.innerHTML =
      db.bots
        .map(
          b => `
            <div
              class="admin-list-item"
            >

              <div>

                <strong>
                  ${esc(b.name)}
                </strong>

                <p>
                  ${esc(b.description)}
                </p>

              </div>

              <span>
                ${
                  b.status === 'active'
                    ? '稼働中'
                    : '停止中'
                }
              </span>

            </div>
          `
        )
        .join('');
  }

  function createBot(e) {
    e.preventDefault();

    if (!requireAdmin()) return;

    const name =
      $('#bot-name')
        .value
        .trim();

    const description =
      $('#bot-description')
        .value
        .trim();

    if (!name) return;

    db.bots.push({
      id:uid('bot'),
      name,
      description,
      status:'active',
      createdAt:now()
    });

    save();

    $('#create-bot-dialog')
      ?.close();

    e.currentTarget.reset();

    renderAdmin();

    toast(
      'Botを作成しました',
      'success'
    );
  }

  function renderAdminBoards() {
    const el =
      $('#admin-private-board-table-body');

    if (!el) return;

    el.innerHTML =
      db.privateBoards
        .map(
          b => `
            <tr>

              <td>
                ${esc(b.name)}
              </td>

              <td>
                ${esc(b.code)}
              </td>

              <td>
                ${esc(
                  formatDate(
                    b.createdAt
                  )
                )}
              </td>

            </tr>
          `
        )
        .join('') ||
      `
        <tr>
          <td colspan="3">
            掲示板はありません。
          </td>
        </tr>
      `;
  }

  function renderAdminSettings() {
    if (!isAdmin()) return;

    if ($('#site-name')) {
      $('#site-name').value =
        db.site.name;
    }

    if ($('#site-description')) {
      $('#site-description').value =
        db.site.description;
    }

    if ($('#site-registration-enabled')) {
      $('#site-registration-enabled').checked =
        db.site.registrationEnabled;
    }

    if ($('#site-posting-enabled')) {
      $('#site-posting-enabled').checked =
        db.site.postingEnabled;
    }

    if ($('#site-maintenance-mode')) {
      $('#site-maintenance-mode').checked =
        db.site.maintenanceMode;
    }
  }

  function saveSiteSettings(e) {
    e.preventDefault();

    if (!requireAdmin()) return;

    db.site.name =
      $('#site-name')
        .value
        .trim() ||
      'KAKIKOMI';

    db.site.description =
      $('#site-description')
        .value
        .trim();

    db.site.registrationEnabled =
      $('#site-registration-enabled')
        .checked;

    db.site.postingEnabled =
      $('#site-posting-enabled')
        .checked;

    db.site.maintenanceMode =
      $('#site-maintenance-mode')
        .checked;

    save();

    applySiteSettings();

    toast(
      'サイト設定を保存しました',
      'success'
    );
  }

  function applySiteSettings() {
    document.title =
      db.site.name;

    if ($('#site-logo')) {
      $('#site-logo').textContent =
        db.site.name;
    }

    const desc =
      document.querySelector(
        'meta[name="description"]'
      );

    if (desc) {
      desc.content =
        `${db.site.name} - ${db.site.description}`;
    }

    const footer =
      document.querySelector(
        '.footer-brand p'
      );

    if (footer) {
      footer.textContent =
        db.site.description;
    }

    if (
      db.site.maintenanceMode &&
      !isAdmin()
    ) {
      document.body.classList.add(
        'maintenance-mode'
      );
    } else {
      document.body.classList.remove(
        'maintenance-mode'
      );
    }
  }

  function resetDemo() {
    if (
      !confirm(
        'ローカル版のデータを初期状態に戻します。よろしいですか？'
      )
    ) {
      return;
    }

    localStorage.removeItem(KEY);
    localStorage.removeItem(SESSION_KEY);

    location.reload();
  }

  function fillSettings() {
    const u =
      currentUser();

    if (!u) return;

    if ($('#settings-username')) {
      $('#settings-username').value =
        u.username;
    }

    if ($('#settings-bio')) {
      $('#settings-bio').value =
        u.bio || '';
    }
  }

  function wire() {
    ensureRuntimeUI();

    $('#login-form')
      ?.addEventListener(
        'submit',
        login
      );

    $('#register-form')
      ?.addEventListener(
        'submit',
        register
      );

    $('#post-form')
      ?.addEventListener(
        'submit',
        createPost
      );

    $('#modal-report-form')
      ?.addEventListener(
        'submit',
        submitReport
      );

    $('#report-form')
      ?.addEventListener(
        'submit',
        submitReport
      );

    $('#profile-settings-form')
      ?.addEventListener(
        'submit',
        updateProfile
      );

    $('#change-password-form')
      ?.addEventListener(
        'submit',
        changePassword
      );

    $('#logout-button')
      ?.addEventListener(
        'click',
        logout
      );

    $('#delete-account-button')
      ?.addEventListener(
        'click',
        deleteAccount
      );

    $('#mark-notifications-read')
      ?.addEventListener(
        'click',
        markNotifications
      );

    $('#copy-share-url')
      ?.addEventListener(
        'click',
        copyShare
      );

    $('#create-private-board-button')
      ?.addEventListener(
        'click',
        createPrivateBoard
      );

    $('#join-private-board-form')
      ?.addEventListener(
        'submit',
        joinPrivateBoard
      );

    $('#admin-user-search-form')
      ?.addEventListener(
        'submit',
        e => {

          e.preventDefault();

          renderAdminUsers(
            $('#admin-user-search')
              .value
          );
        }
      );

    $('#admin-user-settings-form')
      ?.addEventListener(
        'submit',
        saveAdminUser
      );

    $('#ip-ban-form')
      ?.addEventListener(
        'submit',
        addBan
      );

    $('#admin-site-settings-form')
      ?.addEventListener(
        'submit',
        saveSiteSettings
      );

    $('#create-bot-form')
      ?.addEventListener(
        'submit',
        createBot
      );

    $('#create-bot-button')
      ?.addEventListener(
        'click',
        () =>
          $('#create-bot-dialog')
            ?.showModal()
      );

    $$('[data-close-modal]')
      .forEach(
        b =>
          b.addEventListener(
            'click',
            () =>
              document
                .getElementById(
                  b.dataset.closeModal
                )
                ?.close()
          )
      );

    $$('[data-share="copy"]')
      .forEach(
        b =>
          b.addEventListener(
            'click',
            copyShare
          )
      );

    $$('[data-share="native"]')
      .forEach(
        b =>
          b.addEventListener(
            'click',
            async () => {

              const v =
                $('#share-url')
                  ?.value;

              if (
                navigator.share &&
                v
              ) {
                try {
                  await navigator.share({
                    title:'KAKIKOMI',
                    url:v
                  });
                } catch {}
              } else {
                copyShare();
              }
            }
          )
      );

    $('#search-form')
      ?.addEventListener(
        'submit',
        e => {

          e.preventDefault();

          renderSearchResults(
            $('#search-input').value
          );
        }
      );

    $('#board-category-filter')
      ?.addEventListener(
        'change',
        renderPosts
      );

    $('#post-content')
      ?.addEventListener(
        'input',
        e => {

          const n =
            $('#post-character-count');

          if (n) {
            n.textContent =
              `${e.target.value.length} / 2000`;
          }
        }
      );

    window.addEventListener(
      'hashchange',
      route
    );

    window.addEventListener(
      'storage',
      () => {

        const fresh = load();

        if (fresh) {
          db = fresh;
          route();
        }
      }
    );

    $$(
      'a[href="#admin-page"],a[href^="#admin-"]'
    ).forEach(
      a =>
        a.addEventListener(
          'click',
          e => {

            if (!isAdmin()) {

              e.preventDefault();

              toast(
                '管理者のみ利用できます',
                'error'
              );

              location.hash = '#home';
            }
          }
        )
    );
  }

  document.addEventListener(
    'DOMContentLoaded',
    () => {

      wire();

      applySiteSettings();

      renderAccount();

      fillSettings();

      updateHeader();

      route();

      console.info(
        '[KAKIKOMI local] admin:',
        ADMIN_EMAIL,
        'password:',
        ADMIN_PASSWORD
      );
    }
  );

})();
