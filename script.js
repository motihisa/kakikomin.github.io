    }
    if(detail){
      detail.innerHTML=`
        <h2>診断結果の見方</h2>
        <p>「正常」は、管理画面から確認できる範囲で必要な設定が確認できている状態です。</p>
        <div class="diagnostic-detail-list">
          <div><strong>RLS</strong><span>${escapeHTML(data.public_rls_tables)} / ${escapeHTML(data.public_tables)} テーブルで有効</span></div>
          <div><strong>PostgREST</strong><span>公開スキーマ: ${escapeHTML(exposedSchemas || '未取得')}</span></div>
          <div><strong>監査ログ</strong><span>過去24時間: ${escapeHTML(String(data.audit_logs_24h ?? 0))}件</span></div>
          <div><strong>不審ログ</strong><span>過去24時間: ${escapeHTML(String(data.suspicious_logs_24h ?? 0))}件</span></div>
        </div>
      `;
    }
  }

  async function loadAdminAdvanced() {
    if (!(await ensureAdmin())) return;
    const [summary, alerts, consistency, history, boards, accessLogs] = await Promise.all([
      supabase.rpc("admin_security_summary"),
      supabase.rpc("admin_list_alerts", { limit_count: 100, only_open: false }),
      supabase.rpc("admin_auth_profile_consistency"),
      supabase.rpc("admin_list_ip_ban_history", { limit_count: 100, search_ip: null }),
      supabase.rpc("admin_list_private_boards", { limit_count: 200 }),
      supabase.rpc("admin_list_private_board_access_logs", { p_board_id: null, limit_count: 200 })
    ]);
    const grid = $("#admin-security-summary-grid");
    if (grid) {
      const s = summary.data || {};
      const items = [
        ["不審ログ24h", s.suspicious_24h ?? 0],
        ["セキュリティイベント24h", s.security_events_24h ?? 0],
        ["監査イベント24h", s.audit_events_24h ?? 0],
        ["ログイン観測24h", s.login_observations_24h ?? 0],
        ["有効IP BAN", s.active_ip_bans ?? 0],
        ["未確認アラート", s.open_alerts ?? 0]
      ];
      grid.innerHTML = items.map(([k,v]) => `<div class="admin-stat-card"><span>${escapeHTML(k)}</span><strong>${escapeHTML(String(v))}</strong></div>`).join("");
    }
    const consistencyList=$("#admin-consistency-list");
    if(consistencyList) consistencyList.innerHTML=(consistency.data||[]).map(x=>`<article class="admin-post-item"><div><strong>${escapeHTML(x.email||x.user_id)}</strong><p>プロフィール: ${x.profile_exists?"あり":"なし"} / role: ${escapeHTML(x.role||"-")} / status: ${escapeHTML(x.status||"-")}</p></div></article>`).join("")||'<div class="empty-state"><p>Authとプロフィールの不整合はありません。</p></div>';
    const alertBody=$("#admin-alert-table-body");
    if(alertBody) alertBody.innerHTML=(alerts.data||[]).map(a=>`<tr><td>${escapeHTML(formatDate(a.created_at))}</td><td>${escapeHTML(a.severity)}</td><td>${escapeHTML(a.alert_type)}</td><td>${escapeHTML(a.message)}</td><td>${a.acknowledged?"確認済み":`<button type="button" class="secondary-button" data-ack-alert="${escapeHTML(a.id)}">確認</button>`}</td></tr>`).join("")||'<tr><td colspan="5">アラートはありません。</td></tr>';
    const histBody=$("#admin-ip-history-table-body");
    if(histBody) histBody.innerHTML=(history.data||[]).map(h=>`<tr><td>${escapeHTML(formatDate(h.created_at))}</td><td>${escapeHTML(h.ip)}</td><td>${escapeHTML(h.action)}</td><td>${escapeHTML(h.reason||"-")}</td></tr>`).join("")||'<tr><td colspan="4">履歴はありません。</td></tr>';
    const boardBody=$("#admin-advanced-board-table-body");
    if(boardBody) boardBody.innerHTML=(boards.data||[]).map(b=>`<tr><td>${escapeHTML(b.name)}</td><td>${escapeHTML(b.status||"active")}</td><td>${escapeHTML(String(b.active_members??0))}</td><td><button type="button" class="secondary-button" data-advanced-board-action="${escapeHTML(b.id)}" data-board-status="${escapeHTML(b.status||"active")}">${b.status==="suspended"?"復旧":"停止"}</button><button type="button" class="secondary-button" data-regenerate-board-invite="${escapeHTML(b.id)}">招待コード再発行</button></td></tr>`).join("")||'<tr><td colspan="4">掲示板はありません。</td></tr>';
    const accessBody=$("#admin-board-access-table-body");
    if(accessBody) accessBody.innerHTML=(accessLogs.data||[]).map(l=>`<tr><td>${escapeHTML(formatDate(l.created_at))}</td><td>${escapeHTML(l.board_id)}</td><td>${escapeHTML(l.username||l.user_id||"-")}</td><td>${escapeHTML(l.ip_address||"-")}</td><td>${l.allowed?"許可":"拒否"}</td><td>${escapeHTML(l.reason||"-")}</td></tr>`).join("")||'<tr><td colspan="6">アクセスログはありません。</td></tr>';
  }

  async function adminAcknowledgeAlert(id) {
    if (!(await ensureAdmin())) return;
    const {error}=await supabase.rpc("admin_ack_alert",{p_id:Number(id)});
    if(error){console.error(error);toast("アラートを確認済みにできませんでした。","error");return;}
    loadAdminAdvanced();
  }

  async function adminGenerateAlerts() {
    if (!(await ensureAdmin())) return;
    const {data,error}=await supabase.rpc("admin_generate_alerts");
    if(error){console.error(error);toast("アラート検知に失敗しました。","error");return;}
    toast(`${data||0}件のアラートを検知しました。`,"success");
    loadAdminAdvanced();
  }

  async function adminSetPrivateBoardStatus(boardId,status) {
    if (!(await ensureAdmin())) return;
    const reason=status==="suspended" ? prompt("停止理由を入力してください。") : null;
    if(status==="suspended" && reason===null)return;
    const {error}=await supabase.rpc("admin_set_private_board_status",{p_board_id:boardId,p_status:status,p_reason:reason});
    if(error){console.error(error);toast("掲示板状態を変更できませんでした。","error");return;}
    toast(status==="suspended"?"掲示板を停止しました。":"掲示板を復旧しました。","success");
    loadAdminAdvanced();
  }

  async function adminRegeneratePrivateBoardInvite(boardId) {
    if (!(await ensureAdmin())) return;
    if(!confirm("この掲示板の招待コードを再発行しますか？旧コードは無効になります。"))return;
    const {data,error}=await supabase.rpc("admin_regenerate_private_board_invite",{p_board_id:boardId});
    if(error){console.error(error);toast("招待コードを再発行できませんでした。","error");return;}
    prompt("新しい招待コードです。必要ならコピーしてください。",data||"");
    loadAdminAdvanced();
  }

  let adminAutoRefreshTimer = null;

  async function refreshAllAdminData() {
    if (!(await ensureAdmin())) return;
    const tasks = [
      loadAdminData(),
      loadAdminSessions(),
      loadAdminSecurityLogs(),
      loadAdminDiagnostics(),
      loadAdminAdvanced(),
      loadAdminLogs()
    ];
    await Promise.allSettled(tasks);
    toast("管理情報を更新しました。", "success");
  }

  function setupAdminAutoRefresh() {
    const checkbox = $("#admin-auto-refresh");
    if (!checkbox) return;
    checkbox.addEventListener("change", () => {
      if (adminAutoRefreshTimer) {
        clearInterval(adminAutoRefreshTimer);
        adminAutoRefreshTimer = null;
      }
      if (checkbox.checked) {
        adminAutoRefreshTimer = setInterval(() => {
          const route = getRoute();
          if (route.startsWith("admin")) refreshAllAdminData();
        }, 30000);
        toast("30秒ごとの自動更新を有効にしました。", "success");
      }
    });
  }

  function renderAdmin() {
    const counts=state.adminCounts||{}, s=counts.stats||{};
    setText("admin-user-count",counts.users??state.users.length);
    setText("admin-active-user-count",s.users_active??"-");
    setText("admin-post-count",counts.posts??state.adminPosts.length);
    setText("admin-reply-count",s.replies??"-");
    setText("admin-report-count",counts.pendingReports??"-");
    setText("admin-ban-count",s.active_ip_bans??state.ipBans.filter(isBanActive).length);
    setText("admin-session-stat",s.active_sessions??"-");
    setText("admin-suspicious-stat",s.suspicious_logs??"-");
    renderAdminUsers(); renderAdminPosts(); renderAdminReports(); renderIPBans();
  }

  function isBanActive(ban){return !ban.expires_at||new Date(ban.expires_at)>new Date();}

  function renderAdminUsers(users=state.users){
    const body=$("#admin-users-table-body"); if(!body)return;
    if(!users.length){body.innerHTML="<tr><td colspan=\"8\">ユーザーが見つかりません。</td></tr>";return;}
    body.innerHTML=users.map(u=>`<tr>
      <td><strong>${escapeHTML(u.username||"ユーザー")}</strong><br><small>${escapeHTML(u.id)}</small></td>
      <td>${escapeHTML(u.email||"-")}</td>
      <td>${escapeHTML(u.role||"user")}</td>
      <td>${escapeHTML(u.status||"active")}</td>
      <td>${escapeHTML(String(u.session_count??0))}</td>
      <td>${escapeHTML(String(u.ip_count??0))}</td>
      <td>${escapeHTML(formatDate(u.created_at))}</td>
      <td><button type="button" class="secondary-button" data-admin-user="${escapeHTML(u.id)}">詳細</button></td>
    </tr>`).join("");
  }
  function renderAdminPosts(){
    const list=$("#admin-post-list"); if(!list)return;
    list.innerHTML=state.adminPosts.length?state.adminPosts.map(p=>`<article class="admin-post-item"><div>
      <h3>${escapeHTML(p.title)}</h3><p>${escapeHTML(p.content)}</p><small>${escapeHTML(formatDate(p.created_at))} ・ IP: ${escapeHTML(p.adminIp||"記録なし")}</small>
    </div><button type="button" class="danger-button" data-admin-delete-post="${escapeHTML(p.id)}">削除</button></article>`).join(""):"<div class=\"empty-state\"><p>投稿はありません。</p></div>";
  }

  function renderAdminReports(){
    const list=$("#admin-report-list"); if(!list)return;
    list.innerHTML=state.reports.length?state.reports.map(r=>`<article class="admin-report-item"><div>
      <strong>${escapeHTML(r.reason||"理由なし")}</strong><p>${escapeHTML(r.detail||"")}</p>
      <small>${escapeHTML(r.status||"pending")} ・ ${escapeHTML(formatDate(r.created_at))} ・ 投稿ID: ${escapeHTML(r.post_id||"")}</small>
    </div><button type="button" class="secondary-button" data-resolve-report="${escapeHTML(r.id)}">${r.status==="pending"?"対応済みにする":"再オープン"}</button></article>`).join(""):"<div class=\"empty-state\"><p>通報はありません。</p></div>";
  }

  function renderIPBans(){
    const body=$("#ip-ban-table-body"); if(!body)return;
    if(!state.ipBans.length){body.innerHTML="<tr><td colspan=\"4\">BANされているIPはありません。</td></tr>";return;}
    body.innerHTML=state.ipBans.map(b=>`<tr><td>${escapeHTML(b.ip)}</td><td>${escapeHTML(b.reason||"")}</td><td>${escapeHTML(b.expires_at?formatDate(b.expires_at):"無期限")}</td><td><button type="button" class="danger-button" data-delete-ip-ban="${escapeHTML(b.id)}">解除</button></td></tr>`).join("");
  }

  async function searchAdminUsers(value){
    if(!(await ensureAdmin()))return;
    const {data,error}=await supabase.rpc("admin_list_user_details",{limit_count:200,search_text:value?.trim()||null});
    if(error){console.error(error);toast("ユーザー検索に失敗しました。","error");return;}
    state.users = data || [];
    renderAdminUsers(state.users);
  }

  async function openAdminUserDetail(userId){
    if(!(await ensureAdmin())) return;
    const user = state.users.find(x => String(x.id) === String(userId)) || { id: userId };
    $("#admin-target-user-id").value = user.id;
    $("#admin-target-status").value = user.status || "active";
    $("#admin-target-role").value = user.role || "user";
    $("#admin-target-ban-reason").value = user.ban_reason || "";
    $("#admin-disable-posting").checked = Boolean(user.disable_posting);
    $("#admin-disable-replies").checked = Boolean(user.disable_replies);
    $("#admin-force-password-change").checked = Boolean(user.force_password_change);
    setText("admin-target-username", user.username || "ユーザー");
    setText("admin-target-email", user.email || "メールアドレスを確認中...");
    setText("admin-target-id", user.id ? "ID: " + user.id : "");
    const avatar = $("#admin-target-avatar");
    if (avatar) avatar.textContent = (user.username || "ユーザー").charAt(0) || "?";
    navigate("#admin-user-detail");
  }

  async function loadAdminUserDetail(){
    if(!(await ensureAdmin())) return;
    const userId = $("#admin-target-user-id")?.value;
    if(!userId){ navigate("#admin-users"); return; }

    const [detailResult, postsResult, repliesResult, reportsSentResult, userPostsForReports, auditResult, sessionsResult] = await Promise.all([
      supabase.rpc("admin_list_user_details", { limit_count: 200, search_text: null }),
      supabase.from("posts").select("id,title,content,category,created_at,updated_at").eq("user_id", userId).order("created_at",{ascending:false}).limit(50),
      supabase.from("replies").select("id,post_id,content,created_at").eq("user_id", userId).order("created_at",{ascending:false}).limit(50),
      supabase.from("reports").select("id,post_id,reason,detail,status,created_at").eq("reporter_id", userId).order("created_at",{ascending:false}).limit(50),
      supabase.from("posts").select("id").eq("user_id", userId).limit(200),
      supabase.rpc("admin_list_audit_logs", { limit_count: 200, action_filter: null }),
      supabase.rpc("admin_list_sessions", { limit_count: 200 })
    ]);

    const user = (detailResult.data || []).find(u => String(u.id) === String(userId));
    if(!user){
      toast("ユーザー情報を取得できませんでした。","error");
      navigate("#admin-users");
      return;
    }

    state.users = state.users.filter(u => String(u.id) !== String(userId));
    state.users.push(user);

    $("#admin-target-status").value = user.status || "active";
    $("#admin-target-role").value = user.role || "user";
    $("#admin-target-ban-reason").value = user.ban_reason || "";
    $("#admin-disable-posting").checked = Boolean(user.disable_posting);
    $("#admin-disable-replies").checked = Boolean(user.disable_replies);
    $("#admin-force-password-change").checked = Boolean(user.force_password_change);

    setText("admin-target-username", user.username || "ユーザー");
    setText("admin-target-email", user.email || "メールアドレス未取得");
    setText("admin-target-id", "ID: " + user.id);
    const avatar = $("#admin-target-avatar");
    if(avatar) avatar.textContent = (user.username || "ユーザー").charAt(0) || "?";

    const badges = $("#admin-target-badges");
    if(badges){