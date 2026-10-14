const $ = (selector, root = document) => root.querySelector(selector);

const params = new URLSearchParams(location.search);
const valid = (value, options, fallback) => (options.includes(value) ? value : fallback);
const initialNames = ["阿羽", "小陈", "阿泽", "林同学", "小雨", "叶子", "阿浩", "小莫"];
const scheduleIndices = [
  [
    [4, 2],
    [6, 3],
  ],
  [
    [0, 5],
    [7, 1],
  ],
  [
    [4, 6],
    [2, 7],
  ],
  [
    [3, 1],
    [0, 4],
  ],
  [
    [2, 3],
    [5, 6],
  ],
  [
    [5, 4],
    [1, 0],
  ],
  [
    [7, 0],
    [6, 2],
  ],
  [
    [1, 5],
    [3, 7],
  ],
];
const games = [
  {
    id: "mine",
    title: "周三夜训双打局",
    when: "10月14日 周三 · 19:00",
    time: "19:00–21:00",
    venue: "广东工业大学大学城校区体育馆",
    court: "7 号场",
    organizer: "阿羽",
    count: 4,
    level: "进阶",
    status: "已报名",
  },
  {
    id: "fri",
    title: "周五晚广工进阶局",
    when: "10月9日 周五 · 19:00",
    time: "19:00–21:00",
    venue: "广东工业大学大学城校区体育馆",
    court: "7 号场",
    organizer: "小陈",
    count: 3,
    level: "进阶",
    status: "报名中",
  },
  {
    id: "sat",
    title: "周六下午来一场双打",
    when: "10月10日 周六 · 16:00",
    time: "16:00–18:00",
    venue: "广东工业大学大学城校区体育馆",
    court: "3 号场",
    organizer: "阿泽",
    count: 5,
    level: "新手友好",
    status: "报名中",
  },
];
const draftKey = "yulai-ui-refresh-demo-draft-v1";
const makeDefaultForm = () => ({
  title: "",
  venue: games[1].venue,
  date: "2026-10-09",
  time: "19:00",
  endTime: "21:00",
  deadline: "17:00",
  capacity: "6",
  fee: "",
  contact: "",
  details: "",
  grouping: false,
  scoring: false,
});

function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(draftKey) || "null");
  } catch {
    return null;
  }
}
const savedDraft = readDraft();
const state = {
  page: valid(params.get("page"), ["home", "detail", "form", "tools"], "home"),
  width: Number(valid(params.get("width"), ["320", "375", "430"], "375")),
  color: valid(params.get("color"), ["blue", "green", "orange"], "blue"),
  mode: valid(params.get("mode"), ["light", "dark"], "light"),
  material: valid(params.get("material"), ["solid", "glass"], "glass"),
  text: valid(params.get("text"), ["standard", "large"], "standard"),
  selectedGame: "fri",
  joined: { mine: true },
  searchQuery: "",
  searchCommitted: "",
  searchPending: false,
  moreOpen: false,
  previewOpen: false,
  formErrors: {},
  draftSaved: Boolean(savedDraft),
  form: { ...makeDefaultForm(), ...savedDraft },
  toolMode: "",
  rotationStep: "input",
  roster: [...initialNames],
  score: [18, 16],
  scoreHistory: [],
  toast: "",
};

const copy = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
const chosenGame = () => games.find((item) => item.id === state.selectedGame) || games[1];
const symbol = (name) => {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    tools:
      '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    venue:
      '<path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Z"/><circle cx="12" cy="9" r="2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
};

function renderControls() {
  const studio = $("#studio");
  studio.dataset.color = state.color;
  studio.dataset.mode = state.mode;
  studio.dataset.material = state.material;
  studio.dataset.text = state.text;
  studio.dataset.width = String(state.width);
  studio.style.setProperty("--phone-width", `${state.width}px`);
  const choices = [
    [
      "page-select",
      "page",
      [
        ["home", "首页"],
        ["detail", "球局详情"],
        ["form", "创建球局"],
        ["tools", "工具箱"],
      ],
    ],
    [
      "width-select",
      "width",
      [
        [320, "320"],
        [375, "375"],
        [430, "430"],
      ],
    ],
    [
      "color-select",
      "color",
      [
        ["blue", "蓝色"],
        ["green", "绿色"],
        ["orange", "橙色"],
      ],
    ],
    [
      "mode-select",
      "mode",
      [
        ["light", "浅色"],
        ["dark", "深色"],
      ],
    ],
    [
      "material-select",
      "material",
      [
        ["solid", "实体"],
        ["glass", "轻玻璃"],
      ],
    ],
    [
      "text-select",
      "text",
      [
        ["standard", "标准"],
        ["large", "大字"],
      ],
    ],
  ];
  for (const [id, key, items] of choices) {
    $(`#${id}`).innerHTML = items
      .map(
        ([value, label]) =>
          `<button type="button" data-set="${key}" data-value="${value}" aria-pressed="${state[key] === value}">${key === "color" ? `<i class="swatch ${value}"></i>` : ""}${label}</button>`,
      )
      .join("");
  }
  const headings = {
    home: ["首页 · 第一眼看到下一场球", "点击搜索、球局卡片或创建按钮，体验找局路径。"],
    detail: ["球局详情 · 像一张清楚的邀请", "点击报名，查看持续反馈和参与球友资料。"],
    form: ["创建球局 · 先填最重要的信息", "试试空名称校验、更多设置和发布前摘要。"],
    tools: ["工具箱 · 随手打开就能用", "进入公平组队、临时计分，体验三阶段赛程与撤销。"],
  };
  $("#comparison-title").textContent = headings[state.page][0];
  $("#page-hint").textContent = headings[state.page][1];
}

function phoneShell(contents, { dock = "" } = {}) {
  const title = { home: "羽来", detail: "球局详情", form: "创建球局", tools: "工具" }[state.page];
  const hasTabs = ["home", "tools"].includes(state.page);
  const tabs = hasTabs
    ? `<nav class="phone-tabs" aria-label="小程序导航">${[
        ["home", "首页", "home"],
        ["tools", "工具", "tools"],
        ["venues", "场馆", "venue"],
        ["profile", "我的", "user"],
      ]
        .map(
          ([page, label, icon]) =>
            `<button type="button" ${["home", "tools"].includes(page) ? `data-nav="${page}"` : `data-action="${page}-tab"`} class="${page === state.page ? "active" : ""}">${symbol(icon)}<span>${label}</span></button>`,
        )
        .join("")}</nav>`
    : "";
  return `<div class="phone${dock ? " has-dock" : ""}"><div class="phone-status"><span>9:41</span><span class="island"></span><span>●●●  ▰</span></div><div class="phone-topbar"><button class="phone-back" type="button" data-nav="home" aria-label="返回">${state.page === "home" || state.page === "tools" ? "" : "‹"}</button><strong>${title}</strong><span class="phone-menu" aria-hidden="true">•••</span></div><div class="phone-screen">${contents}</div>${dock}${tabs}</div>`;
}

function legacyCard(game, status = game.status) {
  return `<div class="legacy-card"><div class="legacy-card-head"><strong>${copy(game.when.split(" · ").at(-1))}</strong><span class="legacy-pill">${copy(status)}</span></div><h3>${copy(game.title)}</h3><p>⌖ ${copy(game.venue)} · ${copy(game.court)}</p><footer>${copy(game.organizer)} 发起　·　${game.count}/6 人　·　${copy(game.level)}</footer></div>`;
}

function renderCurrent() {
  let body = "";
  if (state.page === "home")
    body = `<div class="legacy ${state.mode === "dark" ? "dark" : ""}"><div class="legacy-head"><small>欢迎回来</small><strong>羽仔，今天打球吗？</strong><span>10月8日 · 星期四</span></div><div class="legacy-hero"><small>YULAI · 羽来</small><strong>约一场，<br>马上开打</strong><span>创建球局，邀请附近球友加入</span><button type="button">＋ 创建球局</button></div><div class="legacy-section"><strong>▎我的球局</strong><a>参加记录 ›</a></div>${legacyCard(games[0])}<div class="legacy-section"><strong>▎找球局</strong><a>查看全部 ›</a></div><div class="legacy-search">⌕　搜索球局、场馆或水平</div><div class="legacy-mini">推荐球局　　2 场</div>${legacyCard(games[1])}</div>`;
  if (state.page === "detail") {
    const game = chosenGame();
    body = `<div class="legacy ${state.mode === "dark" ? "dark" : ""}"><div class="legacy-detail-head"><span class="legacy-pill">${copy(game.level)}</span><button class="legacy-share" type="button">分享</button><h2>${copy(game.title)}</h2><p>◉ ${copy(game.organizer)} 发起</p></div><div class="legacy-panel"><div class="legacy-info-row"><span class="legacy-icon">日</span><div><b>${copy(game.when)}</b><small>结束于 21:00</small></div></div><div class="legacy-info-row"><span class="legacy-icon">⌖</span><div><b>${copy(game.venue)}</b><small>${copy(game.court)} · 查看 ›</small></div></div><div class="legacy-info-row"><span class="legacy-icon">人</span><div><b>${game.count} / 6 人</b><small>仍可报名</small></div></div><div class="legacy-info-row"><span class="legacy-icon">止</span><div><b>报名截止</b><small>10月9日 17:00</small></div></div></div><div class="legacy-section"><strong>参与球友</strong><a>${game.count} 人</a></div><div class="legacy-panel" style="min-height:70px;color:#8793a0;font-size:12px">正式报名后可查看参与球友</div><div class="legacy-section"><strong>活动说明</strong></div><div class="legacy-panel" style="font-size:12px;line-height:2.2">${copy(game.level)} · 可选组队 · 参与者可计分<br>费用：线下沟通<br>联系：报名后可见</div><div class="legacy-action"><span>${game.count} / 6 人已报名</span><button type="button">报名参加</button></div></div>`;
  }
  if (state.page === "form")
    body = `<div class="legacy ${state.mode === "dark" ? "dark" : ""}"><div class="legacy-form-hero"><small>CREATE A GAME · 发起组局</small><strong>约一场，马上开打</strong><span>填写时间、场馆与人数，现场组队按需开启。</span></div><div class="legacy-form-group"><strong>◉ 基本信息　01</strong><div class="legacy-panel"><div class="legacy-field"><span>球局名称（必填）</span><b>周五晚广工进阶局</b></div><div class="legacy-field"><span>场馆</span><b>广东工业大学大学城校区体育馆</b></div><div class="legacy-field"><span>场号或位置</span><b>7 号场</b></div></div></div><div class="legacy-form-group"><strong>◉ 时间安排　02</strong><div class="legacy-panel"><div class="legacy-field"><span>开始时间</span><b>10月9日 19:00</b></div><div class="legacy-field"><span>结束时间</span><b>10月9日 21:00</b></div><div class="legacy-field"><span>报名截止</span><b>10月9日 17:00</b></div></div></div><div class="legacy-form-group"><strong>◉ 参与要求　03</strong><div class="legacy-panel"><div class="legacy-field"><span>人数上限</span><b>6 人</b></div><div class="legacy-field"><span>水平要求</span><b>进阶</b></div><div class="legacy-field"><span>可见范围</span><b>公开</b></div></div></div><div class="legacy-form-group"><strong>◉ 说明与联系　04</strong><div class="legacy-panel"><div class="legacy-field"><span>费用说明</span><b>可不填</b></div><div class="legacy-field"><span>联系方式</span><b>可不填</b></div></div></div><div class="legacy-form-group"><strong>◉ 现场工具　可选</strong><div class="legacy-panel">组队与计分开关</div></div></div>`;
  if (state.page === "tools")
    body = `<div class="legacy ${state.mode === "dark" ? "dark" : ""}"><div class="legacy-tool-hero"><small>YULAI LAB</small><h2>随开随用的球场工具</h2><p>无需创建球局，临时名单、赛程与比分保存在本机7天。</p></div><div class="legacy-section"><strong>快捷工具</strong></div>${[
      ["组", "公平组队", "按人数生成双打赛程"],
      ["分", "临时计分", "记录单打或双打比分"],
      ["¥", "费用均摊", "线下费用计算"],
      ["规", "规则速查", "常见规则查找"],
    ]
      .map(
        ([icon, title, description]) =>
          `<div class="legacy-tool-row"><i>${icon}</i><div><b>${title}</b><small>${description}</small></div></div>`,
      )
      .join(
        "",
      )}<div class="legacy-panel" style="margin-top:20px;font-size:11px;color:#778797">本机临时数据<br>草稿保留7天，不上传云端。</div></div>`;
  $("#current-device").innerHTML = phoneShell(body);
}

function gameCard(game, status, detail = true) {
  return `<article class="game-card new-card" ${detail ? `data-go="detail:${game.id}" role="button" tabindex="0" aria-label="查看${copy(game.title)}"` : ""}><div class="game-card-top"><h4>${copy(game.title)}</h4><span class="pill ${status === "已报名" ? "success" : ""}">${copy(status)}</span></div><span class="when">${copy(game.when)}</span><span class="where">⌖ ${copy(game.venue)} · ${copy(game.court)}</span><div class="game-card-footer"><span class="org">${copy(game.organizer)} 发起 · ${copy(game.level)}</span><b>${game.count + (state.joined[game.id] && game.id !== "mine" ? 1 : 0)}/6 人</b></div></article>`;
}

function resultMarkup() {
  if (state.searchPending)
    return `<div class="search-summary"><strong>正在搜索</strong><span>仅展示新关键词的结果</span></div><div class="search-empty">正在查找匹配的球局…</div>`;
  const query = state.searchCommitted.trim().toLowerCase();
  const found = games
    .slice(1)
    .filter((game) => `${game.title} ${game.venue} ${game.level}`.toLowerCase().includes(query));
  const label = query ? "搜索结果" : "推荐球局";
  if (!found.length)
    return `<div class="search-summary"><strong>${label}</strong><span>0 场</span></div><div class="search-empty"><div><b>没有找到匹配的球局</b>试试场馆名、日期或水平要求</div></div>`;
  return `<div class="search-summary"><strong>${label}</strong><span>已展示 ${found.length} 场</span></div><div class="horizontal-list">${found.map((game) => gameCard(game, state.joined[game.id] ? "已报名" : game.status)).join("")}</div>${found.length > 1 ? `<div class="page-dots" aria-hidden="true"><i></i><i></i></div>` : ""}`;
}

function homePage() {
  return `<div class="new-page"><div class="welcome-row"><div><span class="quiet-label">10月8日 · 星期四</span><h2>羽仔，今天打球吗？</h2></div><button class="tiny-icon-button" data-action="notify" aria-label="查看消息">${symbol("bell")}<i class="alert-point"></i></button></div><div class="home-hero"><div><small>YULAI · 一起上场</small><h3>下一场好球，<br>由你发起。</h3><button type="button" data-nav="form">创建球局　↗</button></div><span class="bird" aria-label="羽来羽仔形象"></span></div><div class="new-section"><h3>我的球局</h3><button type="button" data-action="history">参加记录　›</button></div>${gameCard(games[0], "已报名")}<div class="new-section"><h3>找球局</h3><button type="button" data-action="all-games">查看全部　›</button></div><label class="search-field"><span aria-hidden="true">⌕</span><input id="home-search" type="search" maxlength="50" placeholder="搜索球局、场馆或水平" value="${copy(state.searchQuery)}" aria-label="搜索球局" /><button type="button" data-action="clear-search" aria-label="清空搜索">×</button></label><div id="home-results">${resultMarkup()}</div></div>`;
}

function detailPage() {
  const game = chosenGame();
  const joined = Boolean(state.joined[game.id]);
  const count = game.count + (joined && game.id !== "mine" ? 1 : 0);
  const roster =
    game.id === "mine"
      ? ["阿羽", "小陈", "阿泽", "羽仔"]
      : joined
        ? ["小陈", "阿泽", "林同学", "羽仔"]
        : [];
  return `<div class="new-page"><div class="detail-eyebrow"><span class="pill">${copy(game.level)} · 公开球局</span><button class="share-button" type="button" data-action="share" aria-label="分享球局">↗　分享</button></div><h2 class="detail-title">${copy(game.title)}</h2><div class="organizer-line"><span class="mini-avatar">${copy(game.organizer[0])}</span>${copy(game.organizer)} 发起 <span>·</span> 今天仍可报名</div>${joined ? `<div class="detail-notice" role="status">✓ 你已报名成功，球局已加入“我的球局”</div>` : ""}<div class="date-highlight"><small>开打时间</small><strong>${copy(game.when)}</strong><span>${copy(game.time)} · 约 2 小时</span></div><div class="capacity-row"><strong>${count}/6 人已报名</strong><span>剩余 ${6 - count} 个名额</span></div><div class="progress" aria-label="已报名${count}人，总名额6人"><i style="width:${(count / 6) * 100}%"></i></div><div class="fact-list new-card"><div class="fact-row"><span class="fact-symbol">⌖</span><div><b>${copy(game.venue)}</b><span>${copy(game.court)} · 查看场馆与到场信息</span></div></div><div class="fact-row"><span class="fact-symbol">◷</span><div><b>报名截止：10月9日 17:00</b><span>开始前可查看球局是否有变更</span></div></div><div class="fact-row"><span class="fact-symbol">¥</span><div><b>费用线下沟通</b><span>联系方式在报名后可见</span></div></div></div><div class="new-section"><h3>参与球友</h3><span class="quiet-label">${count} 人</span></div><div class="soft-card">${joined ? `<div class="roster-members">${roster.map((name, index) => `<div class="roster-member"><span class="mini-avatar">${copy(name[0])}</span>${copy(name)}<small>${index === 0 ? "发起人" : "已报名"}</small></div>`).join("")}</div>` : `<div class="joined-preview"><span class="avatar-stack"><i>陈</i><i>泽</i><i>林</i></span>正式报名后可查看参与球友</div>`}</div><div class="new-section"><h3>球局说明</h3></div><div class="soft-card" style="padding:14px;color:var(--muted);font-size:12px;line-height:1.65">友好交流，欢迎同水平球友参加。现场组队和计分按需使用。</div></div>`;
}

function formField(label, field, type = "text", extra = "") {
  const value = state.form[field];
  return `<div class="form-row"><label for="form-${field}">${label}</label><input class="form-control" id="form-${field}" name="${field}" type="${type}" value="${copy(value)}" ${extra} />${state.formErrors[field] ? `<span class="field-error" role="alert">${copy(state.formErrors[field])}</span>` : ""}</div>`;
}

function formPage() {
  const form = state.form;
  return `<div class="new-page"><div class="form-banner"><small>YULAI · 发起组局</small><h2>约一场，马上开打。</h2></div><div class="form-intro"><p>先填最重要的四件事，其他信息随时补充。</p><span class="form-status" role="status">${state.draftSaved ? "✓ 草稿已存本机" : "未保存修改"}</span></div><h3 class="form-group-title">球局信息</h3><div class="form-panel new-card">${formField("球局名称 · 必填", "title", "text", 'maxlength="60" placeholder="如：周五晚广工进阶局"')}<div class="form-row"><label for="form-venue">场馆 · 必填</label><select id="form-venue" class="form-control" name="venue"><option value="${copy(games[1].venue)}" ${form.venue === games[1].venue ? "selected" : ""}>${copy(games[1].venue)}</option><option value="大学城其他球馆" ${form.venue === "大学城其他球馆" ? "selected" : ""}>大学城其他球馆（示例）</option></select></div><div class="form-row"><label>开打时间 · 必填</label><div class="form-inline"><input class="form-control" name="date" type="date" value="${copy(form.date)}" aria-label="日期" /><input class="form-control" name="time" type="time" value="${copy(form.time)}" aria-label="开始时间" /></div></div><div class="form-row"><label for="form-capacity">人数上限 · 必填</label><div class="number-field"><input id="form-capacity" name="capacity" type="number" min="4" max="40" value="${copy(form.capacity)}" aria-label="人数上限" /><span>人</span></div>${state.formErrors.capacity ? `<span class="field-error" role="alert">${copy(state.formErrors.capacity)}</span>` : ""}</div></div><button class="form-expander" type="button" data-action="toggle-more" aria-expanded="${state.moreOpen}"><span>更多设置 <span class="quiet-label">· 可选</span></span><span>${state.moreOpen ? "收起 ↑" : "展开 ↓"}</span></button>${state.moreOpen ? `<div class="form-panel new-card" style="margin-top:10px">${formField("结束时间", "endTime", "time")}${formField("报名截止时间", "deadline", "time")}${formField('费用说明 <span class="optional">· 可不填</span>', "fee", "text", 'placeholder="线下沟通"')}${formField('联系方式 <span class="optional">· 可不填</span>', "contact", "text", 'placeholder="报名后可见"')}${formField('详细说明 <span class="optional">· 可不填</span>', "details", "text", 'placeholder="活动规则、用球等"')}<div class="form-row"><label><input type="checkbox" name="grouping" ${form.grouping ? "checked" : ""} /> 启用现场组队</label><label><input type="checkbox" name="scoring" ${form.scoring ? "checked" : ""} /> 启用现场计分</label></div></div>` : ""}<div class="quiet-label" style="margin:13px 0 0">公开球局 · 组织者计入人数 · 现场功能可选</div><button class="draft-clear" type="button" data-action="clear-draft">清空本机演示草稿</button></div>`;
}

function formDock() {
  return `<div class="detail-dock"><div><small>下一步</small><b>确认球局信息</b></div><button class="primary-cta" type="button" data-action="preview-form">发布前预览　›</button></div>`;
}

function toolsPage() {
  if (state.toolMode === "rotation") return rotationTool();
  if (state.toolMode === "scoring") return scoringTool();
  if (state.toolMode === "expense" || state.toolMode === "rules") return simpleTool();
  return `<div class="new-page"><div class="tools-heading"><span class="quiet-label">YULAI LAB</span><h2>球场工具</h2><p>开打前、打球时，顺手就能用。</p></div><div class="continue-card"><div><span class="quiet-label">继续上次 · 示例草稿</span><strong>8 人公平组队</strong><span>名单已准备好，待生成赛程</span></div><button data-tool="rotation" type="button">继续　›</button></div><div class="new-section"><h3>全部工具</h3><span class="quiet-label">4 项</span></div><div class="tool-grid"><button class="tool-tile" data-tool="rotation" type="button"><span class="tool-symbol">⇄</span><strong>公平组队</strong><small>人人上场，公平编排</small></button><button class="tool-tile" data-tool="scoring" type="button"><span class="tool-symbol">21</span><strong>临时计分</strong><small>单打双打都能记</small></button><button class="tool-tile" data-tool="expense" type="button"><span class="tool-symbol">¥</span><strong>费用均摊</strong><small>线下费用算清楚</small></button><button class="tool-tile" data-tool="rules" type="button"><span class="tool-symbol">?</span><strong>规则速查</strong><small>常见规则随时看</small></button></div><div class="data-help">临时名单、赛程与比分仅在本机保存 7 天。<button data-action="clear-tools" type="button">清空全部临时数据</button></div></div>`;
}

function rotationTool() {
  let content = "";
  if (state.rotationStep === "input")
    content = `<div class="steps"><span class="current">1 录入名单</span><i></i><span>2 预览赛程</span><i></i><span>3 确定使用</span></div><div class="new-section"><h3>参与球友</h3><span class="quiet-label">8 人示例</span></div><div class="soft-card" style="padding:0 14px">${state.roster.map((name, index) => `<label class="participant-row"><span>${index + 1}</span><input type="text" data-roster="${index}" value="${copy(name)}" maxlength="16" aria-label="第${index + 1}位球友姓名" /></label>`).join("")}</div><p class="score-tip">演示名单可改名；生成后展示来自现有编排算法的 8 场示例对阵。</p><button type="button" class="primary-cta" style="width:100%;margin-top:13px" data-action="generate-schedule">预览 8 场赛程</button>`;
  if (state.rotationStep === "preview")
    content = `<div class="steps"><span>1 录入名单</span><i></i><span class="current">2 预览赛程</span><i></i><span>3 确定使用</span></div><div class="design-banner">示例赛程由仓库现有公平编排算法生成；每人上场 4 次、共 8 场。</div><div class="soft-card" style="padding:0 13px">${scheduleIndices.map(([a, b], index) => `<div class="preview-match"><b>${copy(state.roster[a[0]])}<br>${copy(state.roster[a[1]])}</b><span>第 ${index + 1} 场 · VS</span><b>${copy(state.roster[b[0]])}<br>${copy(state.roster[b[1]])}</b></div>`).join("")}</div><div class="action-pair"><button type="button" class="secondary-cta" data-action="edit-roster">修改名单</button><button type="button" class="primary-cta" data-action="confirm-schedule">确定使用</button></div>`;
  if (state.rotationStep === "confirmed")
    content = `<div class="steps"><span>1 录入名单</span><i></i><span>2 预览赛程</span><i></i><span class="current">3 确定使用</span></div><div class="design-banner">✓ 这批 8 场赛程已确认，可按顺序开打。</div><div class="soft-card" style="padding:0 13px">${scheduleIndices
      .slice(0, 3)
      .map(
        ([a, b], index) =>
          `<div class="preview-match"><b>${copy(state.roster[a[0]])}<br>${copy(state.roster[a[1]])}</b><span>第 ${index + 1} 场 · VS</span><b>${copy(state.roster[b[0]])}<br>${copy(state.roster[b[1]])}</b></div>`,
      )
      .join(
        "",
      )}</div><button type="button" class="secondary-cta" style="width:100%;margin-top:14px" data-action="view-full-schedule">查看完整赛程</button>`;
  return `<div class="new-page"><button class="quiet-link" data-tool="" type="button">‹ 返回工具箱</button><div class="tools-heading"><span class="quiet-label">FAIR ROTATION</span><h2>公平组队</h2><p>八人演示 · 一次生成完整赛程</p></div>${content}</div>`;
}

function scoringTool() {
  return `<div class="new-page"><button class="quiet-link" data-tool="" type="button">‹ 返回工具箱</button><div class="tools-heading"><span class="quiet-label">SCOREBOARD</span><h2>临时计分</h2><p>单打双打都能用 · 本机演示</p></div><div class="score-panel new-card"><div class="score-line"><strong>阿羽</strong><button type="button" data-score="0:-1" aria-label="阿羽减一分">−</button><output>${state.score[0]}</output><button type="button" data-score="0:1" aria-label="阿羽加一分">＋</button></div><div class="score-line"><strong>小陈</strong><button type="button" data-score="1:-1" aria-label="小陈减一分">−</button><output>${state.score[1]}</output><button type="button" data-score="1:1" aria-label="小陈加一分">＋</button></div></div><p class="score-tip">每次更改立即显示，误触可以撤销上一步。</p><button type="button" class="secondary-cta" style="width:100%" data-action="undo-score" ${state.scoreHistory.length === 0 ? "disabled" : ""}>↶ 撤销上一步</button></div>`;
}

function simpleTool() {
  const expense = state.toolMode === "expense";
  return `<div class="new-page"><button class="quiet-link" data-tool="" type="button">‹ 返回工具箱</button><div class="tools-heading"><span class="quiet-label">YULAI LAB</span><h2>${expense ? "费用均摊" : "规则速查"}</h2><p>${expense ? "让线下费用更清楚" : "常见规则，随时确认"}</p></div><div class="soft-card" style="padding:17px;font-size:13px;line-height:1.75;color:var(--muted)">${expense ? "演示入口：参与者、费用和代付人会在正式工具中继续使用现有计算逻辑。这里展示统一后的工具入口样式。" : "演示入口：正式工具中的计分、换边、发球等分类会沿用现有规则内容。这里展示统一后的工具入口样式。"}</div></div>`;
}

function previewOverlay() {
  const f = state.form;
  return `<div class="preview-mask" role="dialog" aria-modal="true" aria-label="发布前预览"><div class="preview-sheet"><div style="display:flex;align-items:center;justify-content:space-between"><span class="quiet-label">发布前确认 · 演示</span><button type="button" class="tiny-icon-button" data-action="close-preview" aria-label="关闭预览">×</button></div><h3>球局信息确认</h3><p><b>${copy(f.title.trim())}</b></p><p>${copy(f.date)}　${copy(f.time)}–${copy(f.endTime)}</p><p>${copy(f.venue)}</p><p>人数上限 ${copy(f.capacity)} 人 · 公开球局</p><small>这是设计原型，确认后只显示演示反馈。</small><button type="button" class="primary-cta" data-action="fake-publish">确认演示发布</button></div></div>`;
}

function renderProposed({ preserveScroll = false } = {}) {
  const device = $("#proposed-device");
  const oldScroll = preserveScroll ? ($(".phone-screen", device)?.scrollTop ?? 0) : 0;
  const body = { home: homePage, detail: detailPage, form: formPage, tools: toolsPage }[
    state.page
  ]();
  let dock = "";
  if (state.page === "detail") {
    const game = chosenGame();
    const joined = state.joined[game.id];
    dock = `<div class="detail-dock"><div><small>${joined ? "报名状态" : "当前还有空位"}</small><b>${joined ? "已加入球局" : `剩余 ${6 - game.count} 个名额`}</b></div><button class="primary-cta" type="button" data-action="join" ${joined ? "disabled" : ""}>${joined ? "已报名 ✓" : "报名参加"}</button></div>`;
  }
  if (state.page === "form") dock = formDock();
  device.innerHTML =
    phoneShell(body, { dock }) +
    (state.previewOpen ? previewOverlay() : "") +
    (state.toast ? `<div class="preview-toast" role="status">${copy(state.toast)}</div>` : "");
  $(".phone-screen", device).scrollTop = oldScroll;
}

function render({ preserveScroll = false } = {}) {
  renderControls();
  renderCurrent();
  renderProposed({ preserveScroll });
}

let toastTimer;
function notify(message) {
  state.toast = message;
  renderProposed({ preserveScroll: true });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = "";
    $(".preview-toast")?.remove();
  }, 3000);
}

function navigate(page) {
  state.page = page;
  state.toolMode = "";
  state.previewOpen = false;
  state.toast = "";
  render();
}

function saveDraft() {
  state.draftSaved = true;
  try {
    localStorage.setItem(draftKey, JSON.stringify(state.form));
  } catch {
    state.draftSaved = false;
  }
}

function verifyForm() {
  const errors = {};
  if (!state.form.title.trim()) errors.title = "请填写球局名称，方便球友辨认";
  if (state.form.title.trim().length > 60) errors.title = "球局名称最多 60 字";
  const n = Number(state.form.capacity);
  if (!Number.isInteger(n) || n < 4 || n > 40) errors.capacity = "人数上限应为 4–40 人";
  state.formErrors = errors;
  return Object.keys(errors).length === 0;
}

document.addEventListener("click", (event) => {
  const target = event.target.closest(
    "[data-set], [data-nav], [data-go], [data-action], [data-tool], [data-score]",
  );
  if (!target) return;
  if (target.dataset.set) {
    const key = target.dataset.set;
    state[key] = key === "width" ? Number(target.dataset.value) : target.dataset.value;
    render({ preserveScroll: true });
    return;
  }
  if (target.dataset.nav) {
    navigate(target.dataset.nav);
    return;
  }
  if (target.dataset.go) {
    state.selectedGame = target.dataset.go.split(":")[1];
    navigate("detail");
    return;
  }
  if (target.dataset.tool !== undefined) {
    state.toolMode = target.dataset.tool;
    renderProposed();
    return;
  }
  if (target.dataset.score) {
    const [index, change] = target.dataset.score.split(":").map(Number);
    state.scoreHistory.push([...state.score]);
    state.score[index] = Math.max(0, state.score[index] + change);
    renderProposed({ preserveScroll: true });
    return;
  }
  const action = target.dataset.action;
  if (action === "clear-search") {
    state.searchQuery = "";
    state.searchCommitted = "";
    state.searchPending = false;
    clearTimeout(searchTimer);
    renderProposed({ preserveScroll: true });
  }
  if (action === "join") {
    state.joined[chosenGame().id] = true;
    renderProposed({ preserveScroll: true });
  }
  if (action === "share") notify("原型演示：正式小程序继续使用微信分享");
  if (action === "notify") notify("示例：这里会展示消息通知");
  if (action === "history") notify("示例：参加记录入口保持原有业务路径");
  if (action === "all-games") notify("示例：完整球局列表沿用现有搜索入口");
  if (action === "venues-tab") notify("原型仅演示四个核心页面；场馆页仍使用现有小程序页面");
  if (action === "profile-tab") notify("原型仅演示四个核心页面；个人中心仍使用现有小程序页面");
  if (action === "toggle-more") {
    state.moreOpen = !state.moreOpen;
    renderProposed({ preserveScroll: true });
  }
  if (action === "preview-form") {
    if (!verifyForm()) {
      renderProposed({ preserveScroll: true });
      $(".field-error")?.scrollIntoView({ block: "nearest" });
    } else {
      state.previewOpen = true;
      renderProposed({ preserveScroll: true });
    }
  }
  if (action === "close-preview") {
    state.previewOpen = false;
    renderProposed({ preserveScroll: true });
  }
  if (action === "fake-publish") {
    state.previewOpen = false;
    notify("设计原型：确认成功，未创建真实球局");
  }
  if (action === "clear-draft") {
    if (!window.confirm("清空此浏览器中的演示草稿并恢复默认表单？")) return;
    state.form = makeDefaultForm();
    state.formErrors = {};
    state.draftSaved = false;
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    renderProposed({ preserveScroll: true });
  }
  if (action === "clear-tools") notify("设计原型：未删除真实工具数据");
  if (action === "generate-schedule") {
    if (
      state.roster.some((name) => !name.trim()) ||
      new Set(state.roster.map((name) => name.trim())).size !== 8
    )
      notify("请填写 8 位不同球友的姓名");
    else {
      state.rotationStep = "preview";
      renderProposed();
    }
  }
  if (action === "edit-roster") {
    state.rotationStep = "input";
    renderProposed();
  }
  if (action === "confirm-schedule") {
    state.rotationStep = "confirmed";
    renderProposed();
  }
  if (action === "view-full-schedule") {
    state.rotationStep = "preview";
    renderProposed();
  }
  if (action === "undo-score" && state.scoreHistory.length) {
    state.score = state.scoreHistory.pop();
    renderProposed({ preserveScroll: true });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.matches("[data-go]")) event.target.click();
});

let searchTimer;
document.addEventListener("input", (event) => {
  if (event.target.id === "home-search") {
    state.searchQuery = event.target.value.slice(0, 50);
    state.searchPending = true;
    $("#home-results").innerHTML = resultMarkup();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchCommitted = state.searchQuery;
      state.searchPending = false;
      $("#home-results").innerHTML = resultMarkup();
    }, 300);
  }
  if (event.target.dataset.roster !== undefined)
    state.roster[Number(event.target.dataset.roster)] = event.target.value;
  if (
    event.target.name &&
    event.target.closest("#proposed-device") &&
    event.target.matches("input:not([data-roster])")
  ) {
    const name = event.target.name;
    if (name in state.form) {
      state.form[name] =
        event.target.type === "checkbox" ? event.target.checked : event.target.value;
      delete state.formErrors[name];
      saveDraft();
      $(".form-status").textContent = state.draftSaved ? "✓ 草稿已存本机" : "草稿保存失败";
    }
  }
});
document.addEventListener("change", (event) => {
  if (event.target.name === "venue") {
    state.form.venue = event.target.value;
    saveDraft();
    $(".form-status").textContent = state.draftSaved ? "✓ 草稿已存本机" : "草稿保存失败";
  }
});

render();
