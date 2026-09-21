/* ============================================================================
 *  app.js  ——  渲染 / 编辑 / 图片视频上传 / 本地保存
 * ----------------------------------------------------------------------------
 *  无需任何构建工具与依赖，双击 index.html 即可打开。
 *
 *  数据流向：
 *     data.js (默认内容)
 *        +  localStorage['resume-data-v1'] (你在页面上的修改)
 *        = 页面最终显示内容
 *
 *   想彻底改回默认：点顶部「↺ 重置」，或删掉浏览器里本站的本地存储。
 *   超大图片/视频建议放 assets/ 目录，然后用「填链接」引用。
 * ==========================================================================*/
(function () {
  'use strict';

  /* ========================== 常量与状态 ========================== */
  const LS_KEY = 'resume-data-v1';          // 内容（文字 + 图片/小视频）
  const LS_MEDIA = 'resume-media-v1';       // 大视频：仅本次会话可播放（见 README）
  const MAX_DATAURL_MB = 3.5;               // 单文件内联上限（超过则只作临时预览）

  const DEFAULTS = (typeof RESUME_DATA !== 'undefined')
    ? JSON.parse(JSON.stringify(RESUME_DATA))
    : { profile: {}, experience: [], projects: [], skills: [], site: {} };

  /* 页面开关（在 data.js 的 CONFIG 里改） */
  const CFG = (typeof CONFIG !== 'undefined' && CONFIG) ? CONFIG : {};
  const SHOW_TOOLBAR = CFG.editToolbar !== false;    // 顶部「编辑/导出/导入/重置」
  const SHOW_EDIT_BTNS = CFG.editButtons !== false;  // 「＋ 添加」「✕ 删除」「换图/换视频」
  const ALLOW_TEXT_EDIT = CFG.allowTextEdit !== false;
  const CONTENT_VERSION = Number(CFG.contentVersion) || 1;

  let state = loadState();
  let editing = false;
  /** 仅本次会话有效的视频 objectURL：{ 'projects.0.videos.1': 'blob:...' } */
  let sessionMedia = {};
  let saveTimer = null;

  /* ========================== 工具函数 ========================== */
  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* 兼容没有 requestAnimationFrame 的环境（老浏览器 / 内嵌 WebView / jsdom）：
     补一个基于 setTimeout 的实现，避免整个渲染流程因为缺一个动画 API 而中断。 */
  const raf = (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
    ? window.requestAnimationFrame.bind(window)
    : function (cb) { return setTimeout(() => cb(Date.now()), 16); };

  function isPlainObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }
  /** 用默认值兜底：保证老数据缺字段时页面不崩 */
  function deepMerge(base, saved) {
    if (Array.isArray(base)) {
      return Array.isArray(saved) ? saved.map((it, i) =>
        (i < base.length ? deepMerge(base[i], it) : it)) : base;
    }
    if (isPlainObject(base)) {
      const out = {};
      Object.keys(base).forEach(k => {
        out[k] = (saved && k in saved) ? deepMerge(base[k], saved[k]) : base[k];
      });
      // 保留用户自行新增的字段
      if (isPlainObject(saved)) {
        Object.keys(saved).forEach(k => { if (!(k in out)) out[k] = saved[k]; });
      }
      return out;
    }
    return (saved === undefined || saved === null) ? base : saved;
  }

  function loadState() {
    let merged, saved = null, raw = null, stale = false;
    try {
      raw = localStorage.getItem(LS_KEY);
      saved = raw ? JSON.parse(raw) : null;
      // 内容版本变了（data.js 里的文字更新过）：忽略本地存档，直接用最新内容。
      // 这样「以新导出的 JSON 为基础」时，老用户不用手动点「重置」。
      if (saved && (Number(saved.__version) || 0) !== CONTENT_VERSION) {
        stale = true;
        saved = null;
        try { localStorage.removeItem(LS_KEY); } catch (e) {}
      }
      merged = saved ? deepMerge(DEFAULTS, saved) : deepMerge(DEFAULTS, null);
    } catch (e) {
      console.warn('[简历] 读取本地内容失败，已回退默认内容：', e);
      merged = deepMerge(DEFAULTS, null);
    }
    migrate(merged);
    merged.__version = CONTENT_VERSION;
    if (stale) {
      // 稍后 toast（此时 toast 依赖的 DOM 可能还没就绪，交给 init 里处理）
      setTimeout(() => { try { toast('内容已更新为最新版本'); } catch (e) {} }, 400);
    }
    return merged;
  }

  /**
   * 结构迁移：早期版本把作品媒体拆成 gallery（成片）/ images / videos 三块，
   * 现在合并成一个 media 数组。这里把老数据搬过来，避免用户丢失已填的内容。
   */
  function migrate(st) {
    // 注意：不能把 DEFAULTS 里的对象直接塞进 state ——
    // 那样用户在页面上改媒体标题时会把 DEFAULTS 一起改掉，点「重置」就回不去了。
    const clone = v => JSON.parse(JSON.stringify(v));
    (st.projects || []).forEach((pj, i) => {
      const def = (DEFAULTS.projects || [])[i];
      const defMedia = (def && Array.isArray(def.media)) ? def.media : [];

      if (!Array.isArray(pj.media) || pj.media.length === 0) {
        const built = [];
        (Array.isArray(pj.gallery) ? pj.gallery : []).forEach(g => {
          built.push(Object.assign({ type: 'video' }, g));
        });
        (Array.isArray(pj.images) ? pj.images : []).forEach(m => {
          built.push(Object.assign({ type: 'image', title: m.title || m.caption || '' }, m));
        });
        (Array.isArray(pj.videos) ? pj.videos : []).forEach(m => {
          built.push(Object.assign({ type: 'video', title: m.title || m.caption || '' }, m));
        });
        pj.media = built.length ? built : clone(defMedia);
      }

      // 统一补齐字段，避免渲染时出现 undefined
      (pj.media || []).forEach(m => {
        if (!m.type) m.type = 'video';
        if (m.title == null) m.title = m.caption || '';
      });
      delete pj.gallery; delete pj.images; delete pj.videos;
    });
  }
  function saveNow() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      toast('⚠️ 保存失败：本地空间不足。请把大图片/视频放进 assets/ 目录改用「填链接」引用。');
      console.warn(e);
      return false;
    }
  }
  function save() {                       // 输入时防抖保存
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 450);
  }

  function toast(msg, ms) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    raf(() => el.classList.add('show'));
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { el.hidden = true; }, 320);
    }, ms || 2600);
  }

  /** 按 "a.b.0.c" 路径读写 state */
  function getPath(path) {
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), state);
  }
  function setPath(path, val) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => (o == null ? o[k] : o[k]), state);
    if (target) target[last] = val;
  }

  const esc = s => String(s == null ? '' : s);

  /* ========================== 通用 DOM 构造 ========================== */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function btn(label, cls, title) {
    const b = el('button', cls || 'btn btn-mini', label);
    b.type = 'button';
    if (title) b.title = title;
    return b;
  }
  /** 可编辑文本节点：仅在允许改字时才挂 data-edit 标记（只读模式下 DOM 保持干净） */
  function editText(tag, cls, path, value, opts) {
    const n = el(tag, cls, esc(value));
    if (path && ALLOW_TEXT_EDIT) {
      n.dataset.edit = path;
      if (!opts || opts.rich !== true) n.dataset.plain = '1';
    }
    return n;
  }
  function makeEditable(node) {
    if (!node || node.dataset.boundEdit) return;
    node.dataset.boundEdit = '1';
    node.addEventListener('blur', () => {
      const path = node.dataset.edit;
      if (!path) return;
      let next;
      if (node.dataset.plain === '1') {
        next = node.textContent.replace(/\s+/g, ' ').trim();
        node.textContent = next;            // 把清理后的文本写回 DOM，避免残留多余空白
      } else {
        next = node.innerHTML;
      }
      if (getPath(path) !== next) { setPath(path, next); save(); }
    });
    // 回车不换行（单行字段），避免撑破布局
    node.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); node.blur(); }
    });
    node.addEventListener('paste', e => {   // 粘贴为纯文本，防止带进外部样式
      e.preventDefault();
      const t = (e.clipboardData || window.clipboardData).getData('text');
      document.execCommand('insertText', false, t);
    });
  }

  /* ========================== 渲染：首屏数据卡片 ========================== */
  function renderStats() {
    const box = $('#heroStats');
    box.textContent = '';
    (state.profile.stats || []).forEach((s, i) => {
      const card = el('div', 'stat');
      const num = el('div', 'stat-num');
      num.appendChild(editText('span', null, `profile.stats.${i}.value`, s.value));
      if (s.unit) num.appendChild(editText('small', null, `profile.stats.${i}.unit`, s.unit));
      card.appendChild(num);
      const lbl = editText('div', 'stat-label', `profile.stats.${i}.label`, s.label);
      card.appendChild(lbl);
      if (SHOW_EDIT_BTNS && editing) {
        const tools = el('div', 'row-tools');
        tools.style.marginTop = '6px';
        const del = btn('✕', 'btn btn-mini btn-danger', '删除这张卡片');
        del.onclick = () => { state.profile.stats.splice(i, 1); renderStats(); applyEditing(); save(); };
        tools.appendChild(del);
        card.appendChild(tools);
      }
      box.appendChild(card);
    });
  }

  /* ========================== 渲染：个人信息 ========================== */
  function renderInfo() {
    const list = $('#infoList');
    list.textContent = '';
    (state.profile.fields || []).forEach((f, i) => {
      const li = el('li');
      li.appendChild(editText('span', 'info-key', `profile.fields.${i}.label`, f.label));
      const valCls = 'info-val' + (/^[\d@.+()\-\s]+$/.test(esc(f.value)) ? ' mono' : '');
      li.appendChild(editText('span', valCls, `profile.fields.${i}.value`, f.value));
      if (SHOW_EDIT_BTNS) {
        const tools = el('span', 'row-tools info-del');
        const del = btn('✕', 'btn btn-mini btn-danger', '删除这一项');
        del.onclick = () => { state.profile.fields.splice(i, 1); renderInfo(); applyEditing(); save(); };
        tools.appendChild(del);
        li.appendChild(tools);
      }
      list.appendChild(li);
    });
    if (SHOW_EDIT_BTNS) {
      let add = $('#addInfoField');
      if (!add) {
        add = btn('＋ 添加一项', 'btn btn-mini add-row');
        add.id = 'addInfoField';
        add.onclick = () => {
          state.profile.fields.push({ label: '新项目', value: '待填写' });
          renderInfo(); applyEditing(); save();
        };
        list.parentElement.appendChild(add);
      }
    }
  }

  function renderEducation() {
    const box = $('#eduList');
    box.textContent = '';
    (state.profile.education || []).forEach((e, i) => {
      const item = el('div', 'edu-item');
      const top = el('div', 'edu-top');
      top.appendChild(editText('span', 'edu-period', `profile.education.${i}.period`, e.period));
      top.appendChild(editText('span', 'edu-school', `profile.education.${i}.school`, e.school));
      item.appendChild(top);
      item.appendChild(editText('div', 'edu-major', `profile.education.${i}.major`, e.major));
      item.appendChild(editText('div', 'edu-detail', `profile.education.${i}.detail`, e.detail));
      if (SHOW_EDIT_BTNS && editing) {
        const tools = el('div', 'row-tools');
        const del = btn('✕ 删除这段教育经历', 'btn btn-mini btn-danger');
        del.onclick = () => { state.profile.education.splice(i, 1); renderEducation(); applyEditing(); save(); };
        tools.appendChild(del);
        item.appendChild(tools);
      }
      box.appendChild(item);
    });
  }

  /* ========================== 渲染：工作经历 ========================== */
  function renderExperience() {
    const box = $('#timeline');
    box.textContent = '';
    (state.experience || []).forEach((job, i) => {
      const item = el('div', 'tl-item');
      const card = el('div', 'tl-card');

      const top = el('div', 'tl-top');
      top.appendChild(editText('span', 'tl-period', `experience.${i}.period`, job.period));
      top.appendChild(editText('span', 'tl-company', `experience.${i}.company`, job.company));
      top.appendChild(editText('span', 'tl-role', `experience.${i}.role`, job.role));
      card.appendChild(top);

      const tags = el('div', 'tl-tags');
      (job.tags || []).forEach((t, ti) => {
        tags.appendChild(editText('span', 'tag', `experience.${i}.tags.${ti}`, t));
      });
      if (job.tags && SHOW_EDIT_BTNS) {
        const addT = btn('＋', 'btn btn-mini row-tools', '添加一个标签');
        addT.onclick = () => { job.tags.push('新标签'); renderExperience(); applyEditing(); save(); };
        tags.appendChild(addT);
      }
      card.appendChild(tags);

      const ul = el('ul', 'tl-desc');
      (job.desc || []).forEach((d, di) => {
        const li = el('li');
        li.appendChild(editText('span', null, `experience.${i}.desc.${di}`, d));
        if (SHOW_EDIT_BTNS) {
          const del = btn('✕', 'btn btn-mini btn-danger row-tools');
          del.style.marginLeft = '8px';
          del.onclick = () => { job.desc.splice(di, 1); renderExperience(); applyEditing(); save(); };
          li.appendChild(del);
        }
        ul.appendChild(li);
      });
      card.appendChild(ul);

      if (SHOW_EDIT_BTNS && editing) {
        const tools = el('div', 'row-tools');
        tools.style.marginTop = '10px';
        const addD = btn('＋ 添加描述', 'btn btn-mini');
        addD.onclick = () => { job.desc = job.desc || []; job.desc.push('新的工作描述'); renderExperience(); applyEditing(); save(); };
        const delJob = btn('✕ 删除这段经历', 'btn btn-mini btn-danger');
        delJob.onclick = () => {
          state.experience.splice(i, 1); renderExperience(); applyEditing(); save();
        };
        tools.appendChild(addD); tools.appendChild(delJob);
        card.appendChild(tools);
      }

      item.appendChild(card);
      box.appendChild(item);
    });

    if (SHOW_EDIT_BTNS) {
      let add = $('#addExperience');
      if (!add) {
        add = btn('＋ 添加工作经历', 'btn btn-outline add-row');
        add.id = 'addExperience';
        add.style.marginTop = '14px';
        add.onclick = () => {
          state.experience.push({
            period: '2026.01 — 2026.12', company: '公司名称', role: '职位名称',
            tags: [], desc: ['工作描述'], media: []
          });
          renderExperience(); applyEditing(); save();
        };
        box.parentElement.appendChild(add);
      }
    }
  }

  /* ========================== 渲染：技能标签 ========================== */
  function renderSkills() {
    const box = $('#skillGroups');
    const cloud = $('#skillCloud');
    box.textContent = '';
    cloud.textContent = '';

    state.skills.forEach((g, i) => {
      const card = el('div', 'skill-card');
      const head = el('div', 'skill-head');
      head.appendChild(editText('span', 'skill-icon', `skills.${i}.icon`, g.icon));
      head.appendChild(editText('span', 'skill-group-name', `skills.${i}.group`, g.group));
      if (SHOW_EDIT_BTNS) {
        const addItem = btn('＋', 'btn btn-mini row-tools', '添加技能');
        addItem.style.marginLeft = 'auto';
        addItem.onclick = () => {
          g.items = g.items || [];
          g.items.push({ name: '新技能', level: 70 });
          renderSkills(); applyEditing(); save();
        };
        head.appendChild(addItem);
      }
      card.appendChild(head);

      const rows = el('div', 'skill-rows');
      (g.items || []).forEach((sk, si) => {
        const row = el('div', 'skill-row');
        const meta = el('div', 'skill-meta');
        meta.appendChild(editText('span', 'skill-name', `skills.${i}.items.${si}.name`, sk.name));
        const right = el('span');
        right.appendChild(editText('span', 'skill-pct', `skills.${i}.items.${si}.level`, sk.level));
        if (SHOW_EDIT_BTNS) {
          const del = btn('✕', 'btn btn-mini btn-danger row-tools');
          del.style.marginLeft = '8px';
          del.onclick = () => { g.items.splice(si, 1); renderSkills(); applyEditing(); save(); };
          right.appendChild(del);
        }
        meta.appendChild(right);
        row.appendChild(meta);

        const bar = el('div', 'bar');
        const fill = el('i');
        bar.appendChild(fill);
        row.appendChild(bar);
        rows.appendChild(row);
        // 进度条动画：先落位 0，再在下一帧设为目标值，触发 CSS transition。
        fill.style.width = '0';
        const target = Math.max(0, Math.min(100, Number(sk.level) || 0)) + '%';
        raf(() => { fill.style.width = target; });
      });
      card.appendChild(rows);

      if (SHOW_EDIT_BTNS && editing) {
        const tools = el('div', 'row-tools');
        tools.style.marginTop = '10px';
        const delG = btn('✕ 删除这组技能', 'btn btn-mini btn-danger');
        delG.onclick = () => { state.skills.splice(i, 1); renderSkills(); applyEditing(); save(); };
        tools.appendChild(delG);
        card.appendChild(tools);
      }
      box.appendChild(card);

      // 汇总标签云
      (g.items || []).forEach(sk => cloud.appendChild(el('span', 'tag', esc(sk.name))));
    });

    if (SHOW_EDIT_BTNS) {
      let addG = $('#addSkillGroup');
      if (!addG) {
        addG = btn('＋ 添加技能分组', 'btn btn-outline add-row');
        addG.id = 'addSkillGroup';
        addG.style.marginTop = '14px';
        addG.onclick = () => {
          state.skills.push({ group: '新分组', icon: '★', items: [{ name: '新技能', level: 70 }] });
          renderSkills(); applyEditing(); save();
        };
        box.parentElement.appendChild(addG);
      }
    }
  }

  /* ========================== 渲染：项目作品 + 媒体区 ========================== */
  function renderProjects() {
    const box = $('#projectList');
    box.textContent = '';
    (state.projects || []).forEach((pj, pi) => {
      const wrap = el('article', 'project');

      /* ---- 正文 ---- */
      const body = el('div', 'project-body');
      const top = el('div', 'pj-top');
      top.appendChild(editText('h3', 'pj-title', `projects.${pi}.title`, pj.title));
      top.appendChild(editText('span', 'pj-sub', `projects.${pi}.subtitle`, pj.subtitle));
      top.appendChild(editText('span', 'pj-period', `projects.${pi}.period`, pj.period));
      body.appendChild(top);
      body.appendChild(editText('p', 'pj-desc', `projects.${pi}.desc`, pj.desc));

      const hl = el('ul', 'pj-highlights');
      (pj.highlights || []).forEach((h, hi) => {
        const li = el('li');
        li.appendChild(editText('span', null, `projects.${pi}.highlights.${hi}`, h));
        if (SHOW_EDIT_BTNS) {
          const del = btn('✕', 'btn btn-mini btn-danger row-tools');
          del.style.marginLeft = '8px';
          del.onclick = () => { pj.highlights.splice(hi, 1); renderProjects(); applyEditing(); save(); };
          li.appendChild(del);
        }
        hl.appendChild(li);
      });
      body.appendChild(hl);

      const tags = el('div', 'pj-tags');
      (pj.tags || []).forEach((t, ti) => {
        tags.appendChild(editText('span', 'tag', `projects.${pi}.tags.${ti}`, t));
      });
      body.appendChild(tags);

      /* ---- 作品媒体区（图片 + 影片合并） ---- */
      body.appendChild(mediaBlock(pj, `projects.${pi}.media`));

      if (SHOW_EDIT_BTNS && editing) {
        const tools = el('div', 'row-tools');
        tools.style.marginTop = '12px';
        const delPj = btn('✕ 删除这个项目', 'btn btn-mini btn-danger');
        delPj.onclick = () => {
          if (!confirm('确定删除项目「' + esc(pj.title) + '」？')) return;
          state.projects.splice(pi, 1); renderProjects(); applyEditing(); save();
        };
        tools.appendChild(delPj);
        body.appendChild(tools);
      }

      wrap.appendChild(body);
      box.appendChild(wrap);
    });

    if (SHOW_EDIT_BTNS) {
      let add = $('#addProject');
      if (!add) {
        add = btn('＋ 添加项目作品', 'btn btn-outline add-row');
        add.id = 'addProject';
        add.style.marginTop = '14px';
        add.onclick = () => {
          state.projects.push({
            title: '新项目', subtitle: '', period: '', desc: '项目简介',
            highlights: [], tags: [], media: []
          });
          renderProjects(); applyEditing(); save();
        };
        box.parentElement.appendChild(add);
      }
    }
  }

  /* ========================================================================
   *  作品媒体区（合并后的统一区块）
   *  - 图片和影片在同一个网格里，按数组顺序排列
   *  - 影片：按原始比例显示（不裁切、不拉伸）+ 平铺水印 + 防下载
   *  - 图片：普通展示，可点击放大
   * ======================================================================*/

  /** 一个 {{text}} 的平铺水印图层 */
  function watermarkLayer(wm, cls) {
    const text = esc(wm.text || '水印');
    const rep = `{{${text}}}`;
    const rows = Math.max(1, Math.min(12, parseInt(wm.rows, 10) || 5));
    const cols = Math.max(1, Math.min(8, parseInt(wm.cols, 10) || 3));
    const layer = el('div', 'wm-layer' + (cls ? ' ' + cls : ''));
    layer.setAttribute('aria-hidden', 'true');
    let line = '';
    for (let c = 0; c < cols; c++) line += rep;
    let body = '';
    for (let r = 0; r < rows; r++) body += line + '\n';
    layer.textContent = body;
    if (wm.drift === false) layer.classList.add('wm-static');
    if (wm.opacity != null) layer.style.opacity = String(wm.opacity);
    return layer;
  }

  /** 生成水印覆盖层（全屏平铺 + 可选右下角固定小水印） */
  function makeWatermark() {
    const wm = (state.site && state.site.watermark) || {};
    const box = el('div', 'wm-overlay');
    box.setAttribute('aria-hidden', 'true');
    if (!wm.enabled || !wm.text) return box;      // 关掉水印时返回空壳，保持结构一致
    box.appendChild(watermarkLayer(wm));
    if (wm.corner) {
      const c = el('div', 'wm-corner', esc(wm.cornerText || wm.text));
      c.setAttribute('aria-hidden', 'true');
      box.appendChild(c);
    }
    return box;
  }

  /** 把「禁右键 / 禁拖拽」绑到整块媒体上（遮罩上也会命中） */
  function applyVideoProtection(box) {
    const opt = (state.site && state.site.protectVideo) || {};
    if (opt.blockContextMenu !== false) {
      box.addEventListener('contextmenu', e => {
        e.preventDefault();
        toast('画面已加注水印，请勿右键保存／转载');
      });
    }
    if (opt.blockDrag !== false) {
      box.addEventListener('dragstart', e => e.preventDefault());
    }
  }

  /** 影片卡片的配置：controlsList 决定播放器上显示哪些按钮 */
  function videoControlsAttrs(v) {
    const opt = (state.site && state.site.protectVideo) || {};
    const list = [];
    if (opt.noDownloadButton !== false) list.push('nodownload');
    if (opt.noPip !== false) list.push('noplaybackrate');      // 顺带隐去倍速，减少搬运便利
    list.push('noremoteplayback');                             // 禁止投屏到其他设备
    v.setAttribute('controlsList', list.join(' '));
    if (opt.noPip !== false) v.disablePictureInPicture = true;
    v.setAttribute('preload', 'metadata');
    v.setAttribute('playsinline', '');
    v.setAttribute('controls', '');
  }

  /** '16:9' -> '16 / 9'，给 CSS 的 aspect-ratio 用 */
  function aspectCss(aspect, orientation) {
    const fallback = orientation === 'landscape' ? '16 / 9' : '9 / 16';
    if (!aspect) return fallback;
    const m = String(aspect).match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
    if (!m) return fallback;
    return m[1] + ' / ' + m[2];
  }

  /** 判断一项是不是「外部链接」（不本地加载，只做入口） */
  function isExternal(item) {
    const link = item.link || item.src || '';
    if (/^https?:\/\//i.test(String(link).trim())) return true;
    return item.external === true;
  }

  /** 外链卡片：B 站等平台的作品入口 */
  function externalCard(item, path, index, arr, isVideo, link) {
    const box = el('a', 'media-card media-link');
    box.href = link;
    box.target = '_blank';
    box.rel = 'noopener noreferrer';
    box.style.setProperty('--ar', item.aspect ? aspectCss(item.aspect, item.orientation) : '16 / 9');
    box.classList.add('is-landscape');          // 外链卡片统一按横排宽度显示

    const frame = el('div', 'media-frame');
    const deck = el('div', 'link-card');
    deck.appendChild(el('span', 'link-icon', isVideo ? '▶' : '❐'));
    const badge = el('span', 'link-badge');
    badge.textContent = 'B 站';
    deck.appendChild(badge);
    if (item.desc) deck.appendChild(el('span', 'link-desc', esc(item.desc)));
    frame.appendChild(deck);
    if (item.poster) {
      const img = el('img');
      img.src = item.poster;
      img.alt = esc(item.title) || '外部链接';
      img.loading = 'lazy';
      img.onerror = () => img.remove();          // 缩略图缺失就露出上面的图标层
      frame.appendChild(img);
    }
    box.appendChild(frame);

    const cap = el('figcaption', 'media-cap');
    const left = el('span', 'media-cap-main');
    left.appendChild(editText('span', 'media-cap-title', `${path}.${index}.title`, item.title || ''));
    if (item.ep) left.appendChild(editText('span', 'media-cap-ep', `${path}.${index}.ep`, item.ep));
    left.appendChild(el('span', 'media-cap-open', '↗ 新窗口打开'));
    cap.appendChild(left);
    if (SHOW_EDIT_BTNS && editing) cap.appendChild(mediaTools(item, path, index, arr, isVideo));
    box.appendChild(cap);
    return box;
  }

  /** 媒体条目：影片 / 图片 / 外链 */
  function mediaCard(item, path, index, arr) {
    const isVideo = (item.type || 'video') === 'video';
    const key = `${path}.${index}`;

    // 外链（如 B 站主页、B 站视频）单独一条路径，避免被当成本地文件去加载
    if (isExternal(item)) {
      const link = String(item.link || '').trim() || String(item.src || '').trim();
      return externalCard(item, path, index, arr, isVideo, link);
    }

    // 本地文件：src 为空时回退到本会话的临时地址（大文件上传用）
    const src = (item.src && String(item.src).trim()) || sessionMedia[key] || '';
    return localCard(item, path, index, arr, isVideo, src);
  }

  /** 本地影片 / 图片卡片 */
  function localCard(item, path, index, arr, isVideo, src) {
    const box = el('figure', 'media-card');
    const frame = el('div', 'media-frame');

    if (!src) {
      // 还没有文件：显示占位槽
      box.classList.add('is-video');
      box.style.setProperty('--ar', isVideo ? aspectCss(item.aspect, item.orientation) : '16 / 10');
      if (isVideo && item.orientation === 'landscape') box.classList.add('is-landscape');
      const ph = el('div', 'media-slot');
      ph.appendChild(el('span', 'slot-icon', isVideo ? '▶' : '🖼'));
      ph.appendChild(el('span', 'slot-title', esc(item.title || (isVideo ? '待添加影片' : '待添加图片'))));
      if (item.ep) ph.appendChild(el('span', 'slot-ep', esc(item.ep)));
      frame.appendChild(ph);
      box.appendChild(frame);
      box.appendChild(mediaCaption(item, path, index, arr, isVideo));
      return box;
    }

    if (isVideo) {
      box.classList.add('is-video');
      box.style.setProperty('--ar', aspectCss(item.aspect, item.orientation));
      if (item.orientation === 'landscape') box.classList.add('is-landscape');

      const v = el('video');
      v.src = src;
      if (item.poster) {
        v.poster = item.poster;
        v.addEventListener('error', () => { v.removeAttribute('poster'); }, { once: true });
      }
      videoControlsAttrs(v);
      // 读到真实画面尺寸后按真实比例修正容器 ——
      // 即使 data.js 里写的 aspect 不准，画面也不会被裁切/拉伸。
      v.addEventListener('loadedmetadata', () => {
        const w = v.videoWidth, h = v.videoHeight;
        if (w > 0 && h > 0) {
          box.style.setProperty('--ar', w + ' / ' + h);
          box.classList.toggle('is-landscape', w >= h);
        }
      });
      frame.appendChild(v);
      frame.appendChild(makeWatermark());
      applyVideoProtection(box);
      // 透明遮罩由 CSS 的 .media-card.is-video .media-frame::after 提供，
      // 只覆盖画面、给底部播放控件留出高度
    } else {
      const img = el('img');
      img.src = src;
      img.alt = esc(item.title) || '项目图片';
      img.loading = 'lazy';
      img.decoding = 'async';
      if (item.aspect) box.style.setProperty('--ar', aspectCss(item.aspect));
      img.onload = () => {
        if (!item.aspect && img.naturalWidth && img.naturalHeight) {
          box.style.setProperty('--ar', img.naturalWidth + ' / ' + img.naturalHeight);
        }
      };
      img.onerror = () => {
        img.remove();
        const ph = el('div', 'media-slot');
        ph.appendChild(el('span', 'slot-icon', '🖼'));
        ph.appendChild(el('span', 'slot-title', '图片打不开'));
        ph.appendChild(el('span', 'slot-hint', esc(src)));
        frame.appendChild(ph);
      };
      frame.appendChild(img);
    }

    box.appendChild(frame);
    box.appendChild(mediaCaption(item, path, index, arr, isVideo));
    return box;
  }

  /** 编辑模式下的「换文件 / 删除」按钮组 */
  function mediaTools(item, path, index, arr, isVideo) {
    const tools = el('span', 'row-tools');
    const up = btn(isVideo ? '换视频' : '换图', 'btn btn-mini');
    up.onclick = () => pickFile(isVideo ? 'video' : 'image', files => {
      addMediaFiles(isVideo ? 'video' : 'image', files, src => {
        arr[index].src = src;
        delete arr[index].link;                 // 换成本地文件后就不再是外链
        renderProjects(); applyEditing(); save();
      }, m => toast(m, 4200));
    });
    const del = btn('✕', 'btn btn-mini btn-danger', '移除这一项');
    del.onclick = () => {
      const key = `${path}.${index}`;
      if (sessionMedia[key]) { try { URL.revokeObjectURL(sessionMedia[key]); } catch (e) {} delete sessionMedia[key]; }
      arr.splice(index, 1); renderProjects(); applyEditing(); save();
    };
    tools.appendChild(up); tools.appendChild(del);
    return tools;
  }

  /** 媒体条目的标题 / 说明 + 编辑模式下的操作按钮 */
  function mediaCaption(item, path, index, arr, isVideo) {
    const cap = el('figcaption', 'media-cap');
    const left = el('span', 'media-cap-main');
    left.appendChild(editText('span', 'media-cap-title', `${path}.${index}.title`, item.title || ''));
    if (item.ep) left.appendChild(editText('span', 'media-cap-ep', `${path}.${index}.ep`, item.ep));
    cap.appendChild(left);
    if (SHOW_EDIT_BTNS && editing) cap.appendChild(mediaTools(item, path, index, arr, isVideo));
    return cap;
  }

  /** 媒体区块的统计：外链 / 本地影片 / 本地图片 */
  function mediaStats(arr) {
    let ext = 0, videos = 0, images = 0;
    arr.forEach(x => {
      if (isExternal(x)) { ext++; return; }
      if ((x.type || 'video') === 'video') videos++; else images++;
    });
    return { ext, videos, images, total: arr.length };
  }

  /**
   * 项目里的「作品媒体」整块：图片 + 影片 + 外链合并在一起
   * @param {object} pj    所属项目
   * @param {string} path  media 数组在 state 中的路径
   */
  function mediaBlock(pj, path) {
    const arr = pj.media = pj.media || [];
    const wm = (state.site && state.site.watermark) || {};
    const block = el('div', 'media-block');
    block.dataset.noPrint = '';

    const st = mediaStats(arr);
    const filled = arr.filter(x => x.src && String(x.src).trim()).length;

    /* ---- 标题行 ---- */
    const head = el('div', 'media-head');
    let label = '▸ 作品';
    if (arr.length) {
      const parts = [];
      if (st.videos) parts.push(`影片 ${st.videos}`);
      if (st.images) parts.push(`图片 ${st.images}`);
      if (st.ext) parts.push(`外链 ${st.ext}`);
      label += `（${parts.join(' · ')}）`;
      if (filled < arr.length) label += ` · ${filled}/${arr.length} 已就位`;
    }
    head.appendChild(el('span', 'media-label', label));
    // 只要有本地影片就显示水印说明（外链不加水印）
    if (st.videos && wm.enabled && wm.text) {
      head.appendChild(el('span', 'wm-badge', '🔒 本地影片已加注水印 · 禁止下载'));
    }

    if (SHOW_EDIT_BTNS) {
      const addV = btn('＋ 影片', 'btn btn-mini');
      addV.onclick = () => {
        arr.push({ type: 'video', src: '', title: '新影片', ep: '', orientation: 'portrait', aspect: '9:16', poster: '' });
        renderProjects(); applyEditing(); save();
      };
      const addI = btn('＋ 图片', 'btn btn-mini');
      addI.onclick = () => {
        arr.push({ type: 'image', src: '', title: '新图片', caption: '' });
        renderProjects(); applyEditing(); save();
      };
      head.appendChild(addV); head.appendChild(addI);
    }
    block.appendChild(head);

    /* ---- 网格 ---- */
    const grid = el('div', 'media-grid');
    if (!arr.length) {
      grid.appendChild(el('div', 'media-empty',
        SHOW_EDIT_BTNS
          ? '这个项目还没有图片或影片。点「＋ 影片 / ＋ 图片」，或把文件拖到下面的虚线框里。'
          : '这个项目还没有图片或影片。'));
    }
    arr.forEach((m, i) => {
      // 数据兜底：老数据可能只有 type/caption，没有 title
      if (m.title == null) m.title = m.caption || '';
      grid.appendChild(mediaCard(m, path, i, arr));
    });
    block.appendChild(grid);

    /* ---- 拖拽热区 + 填链接（只在显示编辑按钮时才出现） ---- */
    if (SHOW_EDIT_BTNS) {
      const dz = el('div', 'dropzone');
      dz.innerHTML = '把<b>图片</b>或<b>影片</b>拖到这里，或 <b>点击选择文件</b>';
      const intake = files => {
        const imgs = files.filter(f => f.type.startsWith('image/'));
        const vids = files.filter(f => f.type.startsWith('video/'));
        if (!imgs.length && !vids.length) return toast('这里只接收图片或影片文件');
        const push = (type, src) => arr.push(type === 'video'
          ? { type: 'video', src, title: '', ep: '', orientation: 'portrait', aspect: '9:16', poster: '' }
          : { type: 'image', src, title: '', caption: '' });
        const warn = m => toast(m, 4200);
        // 先处理图片，再处理影片，保证顺序稳定
        let pending = imgs.length + vids.length;
        const done = () => { if (--pending <= 0) { renderProjects(); applyEditing(); save(); } };
        imgs.forEach(f => addMediaFiles('image', [f], s => { push('image', s); done(); }, warn));
        vids.forEach(f => addMediaFiles('video', [f], s => { push('video', s); done(); }, warn));
      };
      dz.onclick = () => pickFile('mixed', files => intake(files));
      ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => {
        e.preventDefault(); dz.classList.add('over');
      }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => {
        e.preventDefault(); dz.classList.remove('over');
      }));
      dz.addEventListener('drop', e => {
        intake(Array.from(e.dataTransfer.files || []));
      });
      block.appendChild(dz);

      /* ---- 直接填链接 ---- */
      const row = el('div', 'url-row');
      const input = el('input');
      input.type = 'text';
      input.placeholder = '或粘贴地址，如 项目作品/…/xxx.mp4 、 assets/photo1.jpg';
      const ok = btn('填入', 'btn btn-mini');
      const submit = asVideo => {
        const v = input.value.trim();
        if (!v) return;
        arr.push(asVideo
          ? { type: 'video', src: v, title: '', ep: '', orientation: 'landscape', aspect: '16:9', poster: '' }
          : { type: 'image', src: v, title: '', caption: '' });
        input.value = '';
        renderProjects(); applyEditing(); save();
        toast('已添加，请确认链接可访问');
      };
      ok.onclick = () => submit(false);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') ok.click(); });
      row.appendChild(input); row.appendChild(ok);

      const asVid = btn('按影片加', 'btn btn-mini', '把上面的地址当作影片添加');
      asVid.onclick = () => submit(true);
      row.appendChild(asVid);
      block.appendChild(row);
    }

    return block;
  }

  /* ========================== 文件读取 ========================== */
  /** kind: 'image' | 'video' | 'mixed' */
  function pickFile(kind, cb) {
    const input = el('input');
    input.type = 'file';
    input.accept = kind === 'image' ? 'image/*' : (kind === 'video' ? 'video/*' : 'image/*,video/*');
    input.multiple = true;
    input.onchange = () => { cb(Array.from(input.files || [])); };
    input.click();
  }

  /**
   * 把文件读成可用 src。
   * - 小文件（图片 / 小视频）→ dataURI，能存进 localStorage 长期保留
   * - 大视频 → objectURL，仅本次打开有效（导出 JSON 也只存 dataURI 部分）
   */
  function addMediaFiles(kind, files, onDone, onWarn) {
    files.forEach(file => {
      const mb = file.size / 1048576;
      if (mb <= MAX_DATAURL_MB) {
        const r = new FileReader();
        r.onload = () => onDone(r.result);
        r.onerror = () => onWarn && onWarn('读取文件失败：' + file.name);
        r.readAsDataURL(file);
      } else if (kind === 'video') {
        const url = URL.createObjectURL(file);
        const k = 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        sessionMedia[k] = url;
        onWarn && onWarn(`「${file.name}」有 ${mb.toFixed(1)}MB，太大无法长期保存，本次会话可播放。建议压缩后放进 assets/ 目录再用「填入」引用。`);
        onDone(url);
      } else {
        onWarn && onWarn(`「${file.name}」超过 ${MAX_DATAURL_MB}MB，请先压缩图片。`);
      }
    });
  }

  /* ========================== 静态文本绑定 ========================== */
  function renderBinds() {
    $$('[data-bind]').forEach(n => { n.textContent = esc(getPath(n.dataset.bind)); });
  }

  /* ========================== 编辑能力（只读 / 可改字） ==========================
     页面默认是只读的：不挂 contenteditable、没有任何按钮、也没有输入框。
     内容一律来自 data.js（= 这份简历的「后台」）。
     需要临时改字时，把 data.js 里 CONFIG.allowTextEdit 改成 true 即可。 */
  function applyEditing() {
    const on = ALLOW_TEXT_EDIT && (editing || !SHOW_TOOLBAR);
    document.body.classList.toggle('editing', on);

    // [data-edit] 由渲染函数生成；[data-bind] 是首屏/页脚里的静态文案。
    // 只在允许改字时才打开 contenteditable，否则明确关掉。
    const targets = new Set([...$$('[data-edit]'), ...$$('[data-bind]')]);
    targets.forEach(n => {
      if (!ALLOW_TEXT_EDIT) {
        n.contentEditable = 'false';
        n.removeAttribute('contenteditable');
        return;
      }
      if (!n.dataset.edit) n.dataset.edit = n.dataset.bind;   // 让修改能写回 state
      if (!n.dataset.edit) return;
      if (n.dataset.plain === undefined) n.dataset.plain = '1';
      n.contentEditable = on ? 'true' : 'false';
      if (on && !n.dataset.editBound) { makeEditable(n); n.dataset.editBound = '1'; }
      if (!on && document.activeElement === n) n.blur();
    });

    // 顶部工具栏：按 data.js 的 CONFIG.editToolbar 开关显示
    const bar = $('.topbar');
    if (bar) bar.hidden = !SHOW_TOOLBAR;
    const hint = $('#editHint');
    if (hint) hint.hidden = true;   // 只读模式下不再提示"编辑模式已开启"
  }

  function setEditing(on) {
    editing = on;
    applyEditing();
    if (on) toast('编辑模式：点击任意文字直接修改');
  }

  /* ========================== 导入 / 导出 / 重置 ========================== */
  function exportJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'resume-data-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('已导出 JSON，可放回项目里当 data.js 的内容');
  }

  function importJSON(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const obj = JSON.parse(r.result);
        const next = deepMerge(DEFAULTS, obj.data && typeof obj.data === 'object' ? obj.data : obj);
        state = next;
        sessionMedia = {};
        renderAll(); applyEditing(); saveNow();
        toast('导入成功');
      } catch (e) {
        toast('导入失败：不是合法的 JSON 文件');
        console.warn(e);
      }
    };
    r.readAsText(file);
  }

  function resetAll() {
    if (!confirm('确定放弃所有本地修改，恢复 data.js 的默认内容吗？此操作不可撤销。')) return;
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    state = deepMerge(DEFAULTS, null);
    sessionMedia = {};
    renderAll(); applyEditing();
    toast('已恢复默认内容');
  }

  /* ========================== 星点背景 ========================== */
  function initStars() {
    const cv = $('#stars');
    if (!cv) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = cv.getContext('2d');
    let w, h, stars = [], dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      w = cv.width = Math.floor(innerWidth * dpr);
      h = cv.height = Math.floor(innerHeight * dpr);
      cv.style.width = innerWidth + 'px';
      cv.style.height = innerHeight + 'px';
      const count = Math.min(120, Math.round(innerWidth / 14));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: (Math.random() * 1.5 + .4) * dpr,
        a: Math.random() * .6 + .15,
        vy: (Math.random() * .22 + .05) * dpr,
        vx: (Math.random() - .5) * .12 * dpr,
        hue: Math.random() < .25 ? 190 : 215,
      }));
    }
    function frame() {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${s.hue}, 90%, 72%, ${s.a})`;
        ctx.fill();
        if (!reduce) {
          s.y -= s.vy; s.x += s.vx;
          if (s.y < -4) { s.y = h + 4; s.x = Math.random() * w; }
          if (s.x < -4) s.x = w + 4; else if (s.x > w + 4) s.x = -4;
        }
      }
      raf(frame);
    }
    resize();
    addEventListener('resize', resize);
    if (!reduce) frame();
    else frame();  // 静态星点也画一帧
  }

  /* ========================== 导航高亮 ========================== */
  function initNav() {
    const links = $$('.nav-link');
    const secs = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
    if (!secs.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id));
      });
    }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });
    secs.forEach(s => io.observe(s));
  }

  /* ========================== 初始化 ========================== */
  function renderAll() {
    renderBinds();
    renderStats();
    renderInfo();
    renderEducation();
    renderExperience();
    renderProjects();
    renderSkills();
  }

  function init() {
    renderAll();
    applyEditing();
    initStars();
    initNav();

    // 顶部工具栏被隐藏时，这些元素可能不存在，逐个判空
    const on = (sel, fn) => { const n = $(sel); if (n) n.onclick = fn; };
    on('#btnEdit', () => setEditing(!editing));
    on('#btnEditOff', () => setEditing(false));
    on('#btnExport', exportJSON);
    on('#btnReset', resetAll);
    on('#btnImport', () => $('#importFile').click());
    const imp = $('#importFile');
    if (imp) imp.onchange = e => {
      const f = e.target.files && e.target.files[0];
      if (f) importJSON(f);
      e.target.value = '';
    };

    // 键盘：Ctrl/Cmd+S 保存提示
    addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); saveNow(); toast('已保存到本机浏览器');
      }
    });

    // 关闭页面前兜底保存
    addEventListener('beforeunload', () => { if (saveTimer) { clearTimeout(saveTimer); saveNow(); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
