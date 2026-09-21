/* ============================================================================
 *  data.js  ——  简历内容数据源（= 这份简历的「后台」，改内容只动这个文件）
 * ----------------------------------------------------------------------------
 *  ★ 页面是只读的：文字不能点、不能编辑，也没有任何添加/删除按钮。
 *    要改内容，就编辑本文件（或改完从后台系统重新生成 data.js），保存后刷新页面。
 *
 *  ★ contentVersion：改完本文件的文字内容后把它 +1，
 *    这样浏览器里缓存的旧文字会被自动换成新文字，不用手动清缓存。
 *    变更记录：
 *      1 → 以 2026-09-21 导出为准（标题/简介措辞修改）
 *      2 → 页面改为只读
 *
 *  字段说明：
 *    profile  个人信息        experience 工作经历
 *    projects 项目作品        skills     技能标签
 *
 *  media 数组里每一项（图片和影片合并在一起，按数组顺序显示）：
 *    本地影片：{ type:'video', src, title, ep, orientation:'portrait'|'landscape', aspect:'9:16', poster }
 *    图片    ：{ type:'image', src, title }
 *    外部链接：{ type:'video'|'image', src:'https://…', link:'https://…', title, desc }
 *              src 是外链时不会当成本地文件加载，只在卡片上显示入口，点击新窗口打开。
 * ==========================================================================*/

/* ----------------------------------------------------------------------------
 *  CONFIG —— 页面开关
 * --------------------------------------------------------------------------*/
var CONFIG = {
  /* 页面是否可编辑。false = 只读（整页纯展示，文字点了没反应）。 */
  allowTextEdit: false,

  /* 是否显示「✎ 编辑 / ⬇ 导出 / ⬆ 导入 / ↺ 重置」这条顶部工具栏。 */
  editToolbar: false,

  /* 是否显示「＋ 添加…」按钮和行内的「✕ 删除 / 换图 / 换视频」按钮。 */
  editButtons: false,

  /* 内容版本：改了本文件的文字内容就 +1（见文件顶部说明）。 */
  contentVersion: 2,
};

/* ----------------------------------------------------------------------------
 *  ASSETS —— 素材路径登记表
 * ----------------------------------------------------------------------------
 *  下面路径指向「项目作品」文件夹里的成片，和磁盘上的实际文件名一一对应。
 *
 *  ⚠️ 现在的片子都没做 faststart（moov 索引块在文件尾），浏览器要整个下完才能播，
 *     建议压缩时统一加上 -movflags +faststart。复查命令：
 *         node _tools/mp4info.js
 *
 *  缩略图（可选）：把同名 .jpg 放进 assets/thumbs/，没有也能正常播放。
 * --------------------------------------------------------------------------*/
var ASSETS = {
  /* 3D 动画作品（1280×720 横屏） */
  '3d': '项目作品/3D动画/游戏动画.mp4',

  /* AI 漫剧 ——《My TikTok Reality》（720×1280 竖屏） */
  'ttr2': '项目作品/AI漫剧/My TikTok Reality/EP2.mp4',
  'ttr3': '项目作品/AI漫剧/My TikTok Reality/EP3.mp4',

  /* AI 漫剧 ——《十二生肖》（1662×720 横屏） */
  'zodiac36': '项目作品/AI漫剧/十二生肖/第三十六集.mp4',

  /* B 站主页与作品（短视频项目用） */
  'biliHome': 'https://space.bilibili.com/3546372957539119',
  'bili1': 'https://www.bilibili.com/video/BV1uqykY9E9X',
  'bili2': 'https://www.bilibili.com/video/BV1QdtSedEfH',

  /* 缩略图目录（可选，需要自己建） */
  thumbs: 'assets/thumbs/',
};

/* 这里用 var：让 RESUME_DATA 成为真正的全局变量，被 app.js 读到。 */
var RESUME_DATA = {
  /* ===================== 站点信息 ===================== */
  site: {
    title: '尹子豪 · 个人主页',
    subtitle: 'AI 制作师',
    footer: '© 尹子豪 · 个人网页简历',
    accent: '#3b82f6',      // 主色（深蓝）
    accent2: '#22d3ee',     // 点缀色（青蓝）

    /* ---------- 视频水印 ---------- */
    watermark: {
      enabled: true,
      text: '尹子豪 · 作品',   // 水印文字
      opacity: 0.3,           // 透明度 0~1
      rows: 5,                // 平铺行数
      cols: 3,                // 平铺列数
      drift: true,            // 是否缓慢漂移（更难被裁剪掉，防录屏盗用）
      corner: false,          // 是否额外在右下角加一个固定小水印
      cornerText: '',         // 留空则用上面的 text
    },

    /* ---------- 视频防下载 ----------
       注意：这只增加普通用户的下载难度（禁右键、隐藏下载按钮、防拖拽）。
       视频要播放就必然传到浏览器，懂技术的人仍可通过开发者工具获取。 */
    protectVideo: {
      blockContextMenu: true,   // 禁止在视频上右键
      blockDrag: true,          // 禁止把视频拖出去
      noDownloadButton: true,   // 隐藏播放器自带的下载按钮
      noPip: true,              // 禁用画中画按钮
      shield: true,             // 视频上盖一层透明遮罩，挡住「右键/长按保存」
    },
  },

  /* ===================== 一、个人信息 ===================== */
  profile: {
    name: '尹子豪',
    jobTitle: 'AI 制作师 · 剪辑师 · 账号运营 · 3D 动画师',
    tagline: '6 年计算机与视觉内容经验 · 从 3D 动画到 AI 漫剧全流程制作',
    bio: '性格稳重、待人真诚，工作认真负责并追求完美。热爱二次元 ACGN 文化、喜爱涉猎新知识、主动学习，具备良好的前瞻性与大局观，以及持续的内驱力。对常规「互联网+」行业有一定敏感度与认识度。',
    /* 基本信息：label / value 成对，可自由增删 */
    fields: [
      { label: '求职意向', value: 'AI 制作师' },
      { label: '现居城市', value: '陕西 · 西安' },
      { label: '年龄', value: '26 岁' },
      { label: '电话', value: '18009285602' },
      { label: '邮箱', value: '1789499308@qq.com' },
    ],
    /* 亮点数据卡片 */
    stats: [
      { value: '6', unit: '年', label: '行业经验' },
      { value: '5', unit: '段', label: '工作经历' },
      { value: '14', unit: '+', label: '专业技能' },
      { value: '∞', unit: '', label: '学习热情' },
    ],
    /* 教育背景 */
    education: [
      {
        period: '2019.03 — 2021.07',
        school: '北京师范大学',
        major: '计算机信息与技术（专科）',
        detail: '专业课程：计算机操作系统、计算机组成原理、数字电子技术、计算机动画、电路基础等。',
      },
    ],
  },

  /* ===================== 二、工作经历 =====================
     已按时间「从近到远」排序（按结束时间倒序）。
     ⚠️「陕西易澜星河」与「陕西火炬商贸」时间重叠（都到 2025.02）。
        这里按「结束时间相同 → 起始更早的排前面」排，需要调整直接改顺序。 */
  experience: [
    {
      period: '2026.04 — 2026.07',
      company: '西安宇航安梦传媒有限公司',
      role: 'AI 制作组 · 组长',
      tags: ['AI 漫剧', '团队管理', '分镜'],
      desc: [
        '负责公司 AI 漫剧组的整体管理与排期推进；',
        '与导演确定剧本、分镜，并把控美术风格统一；',
        '根据剧本分镜完成制作；确定并验收最终成品效果。',
      ],
      media: [],
    },
    {
      period: '2023.08 — 2025.02',
      company: '陕西易澜星河商贸有限公司',
      role: '电商账号运营（联合创始人 / 合伙人）',
      tags: ['视频制作', '直播运营', '电商管理'],
      desc: [
        '电商自媒体账号的整体运营，包含视频文案、拍摄、剪辑和发布；',
        '电商直播账号的后台把控；',
        '电商账号的商品管理、美工等。',
      ],
      media: [],
    },
    {
      period: '2024.01 — 2025.02',
      company: '陕西火炬商贸有限公司',
      role: '新媒体 账号运营',
      tags: ['视频制作', '直播运营', '电商管理'],
      desc: [
        '负责公司媒体账号的整体运营，包含视频文案、拍摄、剪辑和发布；',
        '负责媒体账号的直播设备调试；',
        '负责直播时的后台把控等工作。',
      ],
      media: [],
    },
    {
      period: '2020.10 — 2023.08',
      company: '西安旭扬机电科技有限公司',
      role: '店员 / 店长',
      tags: ['库存管理', '电脑组装维修', '财务开票'],
      desc: [
        '负责店内货物的管理，包括并不限于出库、入库及销售；',
        '负责电脑组装、维修；',
        '负责财务汇报、收取及发票开具；其他店内事务等。',
      ],
      media: [],
    },
    {
      period: '2019.05 — 2020.05',
      company: '陕西纷腾互动网络科技有限公司',
      role: '3D 动画师',
      tags: ['3D 动画', '骨骼绑定', '场景模型'],
      desc: [
        '负责 3D 人物模型的骨骼搭建及动画制作等；',
        '协助模型组进行场景模型的搭建与修改；',
        '协助程序部门完善项目；领导交办的其他工作等。',
      ],
      media: [],
    },
  ],

  /* ===================== 三、项目作品 ===================== */
  projects: [
    {
      title: 'AI 漫剧全流程制作',
      subtitle: '组长 / 主制作',
      period: '2026.04 — 2026.07',
      desc: '主导 AI 漫剧从剧本到成片的全流程：与导演对齐剧本与分镜，拆分镜头、统一美术风格，使用 AI 工具批量生成画面并完成后期合成与成品验收。',
      highlights: ['剧本 / 分镜脚本设计', 'AI 画面生成与一致性控制', '团队分工与进度把控'],
      tags: ['AI 漫剧', '分镜设计', '团队管理', '成品验收'],
      media: [
        { type: 'video', src: ASSETS.ttr2,     title: 'My TikTok Reality', ep: 'EP2',      orientation: 'portrait',  aspect: '9:16',    poster: ASSETS.thumbs + 'my-tiktok-reality-ep2.jpg' },
        { type: 'video', src: ASSETS.ttr3,     title: 'My TikTok Reality', ep: 'EP3',      orientation: 'portrait',  aspect: '9:16',    poster: ASSETS.thumbs + 'my-tiktok-reality-ep3.jpg' },
        { type: 'video', src: ASSETS.zodiac36, title: '十二生肖',           ep: '第 36 集', orientation: 'landscape', aspect: '277:120', poster: ASSETS.thumbs + 'zodiac-ep36.jpg' },
      ],
    },
    {
      title: '短视频账号内容制作',
      subtitle: '新媒体运营 / 拍摄剪辑',
      period: '2024.01 — 2025.02',
      desc: '负责公司媒体账号内容从选题到发布的全流程：撰写视频文案、完成拍摄与剪辑、发布并复盘数据，同时承担直播设备调试与现场后台把控。',
      highlights: ['选题与文案撰写', '拍摄 + 剪辑 + 发布', '直播设备调试与后台把控'],
      tags: ['短视频', 'Premiere', '剪辑', '直播运营'],
      /* B 站主页 + 两支作品。这些都是外链，不占本地体积，点击卡片在新窗口打开。 */
      media: [
        { type: 'image', src: ASSETS.biliHome, link: ASSETS.biliHome,
          title: 'B 站主页 · 全部作品', desc: 'space.bilibili.com/3546372957539119',
          poster: ASSETS.thumbs + 'bilibili-home.jpg' },
        { type: 'video', src: ASSETS.bili1, link: ASSETS.bili1,
          title: 'B 站作品 · BV1uqykY9E9X', ep: '作品 1', desc: '点击在 B 站观看' },
        { type: 'video', src: ASSETS.bili2, link: ASSETS.bili2,
          title: 'B 站作品 · BV1QdtSedEfH', ep: '作品 2', desc: '点击在 B 站观看' },
      ],
    },
    {
      title: '3D 人物模型与动画制作',
      subtitle: '3D 动画师',
      period: '2019.05 — 2020.05',
      desc: '负责 3D 人物模型的骨骼搭建与动画制作，协助模型组完成场景模型的搭建与修改，并配合程序部门完善项目内容。',
      highlights: ['人物骨骼搭建与绑定', '角色动画制作', '场景模型搭建与修改'],
      tags: ['3DMAX', 'ZBrush', 'U3D', '骨骼绑定'],
      media: [
        { type: 'video', src: ASSETS['3d'], title: '3D 游戏动画', ep: '', orientation: 'landscape', aspect: '16:9', poster: ASSETS.thumbs + '3d-animation-reel.jpg' },
      ],
    },
  ],

  /* ===================== 四、技能标签 ===================== */
  skills: [
    {
      group: 'AI 创作工具',
      icon: '✦',
      items: [
        { name: 'Gemini', level: 90 },
        { name: 'ComfyUI', level: 85 },
        { name: 'ChatGPT', level: 90 },
        { name: 'NanoBanana', level: 80 },
        { name: 'Codex', level: 75 },
      ],
    },
    {
      group: '3D 与视觉',
      icon: '◈',
      items: [
        { name: '3DMAX', level: 85 },
        { name: 'ZBrush', level: 60 },
        { name: 'U3D', level: 70 },
      ],
    },
    {
      group: '后期与剪辑',
      icon: '▶',
      items: [
        { name: 'Premiere (PR)', level: 85 },
        { name: 'After Effects (PE)', level: 75 },
        { name: 'Photoshop (PS)', level: 85 },
        { name: '剪映', level: 90 },
      ],
    },
    {
      group: '计算机与运维',
      icon: '⌘',
      items: [
        { name: '计算机组装搭配', level: 95 },
        { name: '计算机维修', level: 90 },
        { name: '计算机系统', level: 85 },
      ],
    },
  ],
};
