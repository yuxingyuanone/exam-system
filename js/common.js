/* ============================================================
   全站共享脚本：本地数据仓库 / 通用 UI 工具
   说明：当前为前端演示版本，数据持久化在 localStorage；
   接入后端后，仅需把 Store 中的方法替换为 API 请求。
   ============================================================ */
/* ============================================================
   登录门禁：未登录一律先到 users.html 登录或注册后使用。
   同一用户登录后登录态保存在 localStorage，关页再进自动维持登录；
   点「退出」清除登录态回到 users.html，并预填充该账号登录信息。
   （users.html / register.html / forgot.html 自带独立脚本，不加载本文件）
   ============================================================ */
(function authGate() {
    try {
        if (localStorage.getItem('aigame_user')) return; // 已有登录态，放行
        var here = location.pathname.split('/').pop() || 'index.html';
        if (here === 'users.html' || here === 'register.html' || here === 'forgot.html') return;
        location.replace('users.html'); // 未登录：跳转登录页
    } catch (e) { /* localStorage 不可用时放行，避免白屏 */ }
})();

(function () {
    'use strict';

    // 登录账号（邮箱）：所有用户保存内容均按邮箱隔离分键存储
    const CURRENT_USER=localStorage.getItem('aigame_user') || 'guest'
    const ukey = k => `${k}_${CURRENT_USER}`;
    const LS = {
        EXTRA: ukey('aigame_questions_extra'),   // 本用户新导入 / 新生成的题
        PATCH: ukey('aigame_question_patches'),  // 本用户信誉分等字段的变更
        HISTORY: ukey('aigame_history'),         // 本用户历史习题
        ARCHIVE: ukey('aigame_archives'),        // 本用户试卷导出存档
        PAPER: ukey('aigame_current_paper'),     // 本用户当前待作答 / 待打印试卷
        DELETED: ukey('aigame_deleted_ids')      // 本用户被信誉分净化删除的题
    };

    /* v4 数据隔离迁移：清除所有旧版全局共享的试卷 / 习题数据（账号资料保留）。
       全库只执行一次：扫描所有 localStorage 键，删除试卷相关的旧键，
       之后所有数据一律按登录邮箱分键保存，各账号互不可见。 */
    (function migrateV4() {
        if (localStorage.getItem('aigame_data_isolated_v4')) return;
        const exact = ['aigame_demo_seeded', 'aigame_demo_seeded_v2', 'aigame_demo_seeded_v3'];
        const prefixes = [
            'aigame_questions_extra', 'aigame_question_patches', 'aigame_deleted_ids',
            'aigame_archives', 'aigame_current_paper', 'aigame_templates_extra',
            'aigame_exam_draft', 'aigame_history', 'aigame_answer_draft', 'aigame_answer_answers'
        ];
        Object.keys(localStorage).forEach(k => {
            if (exact.includes(k)) { localStorage.removeItem(k); return; }
            if (prefixes.some(p => k === p || k.indexOf(p + '_') === 0)) localStorage.removeItem(k);
        });
        localStorage.setItem('aigame_data_isolated_v4', '1');
    })();

    /* ---------------- 基础工具 ---------------- */
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
    function today(d = new Date()) {
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
    }
    function nowText() {
        const d = new Date();
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    
    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    /* ---------------- Toast ---------------- */
    function toast(msg, type = '') {
        let wrap = $('.toast-wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'toast-wrap';
            document.body.appendChild(wrap);
        }
        const el = document.createElement('div');
        el.className = 'toast ' + type;
        el.textContent = msg;
        wrap.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2200);
        setTimeout(() => el.remove(), 2600);
    }

    /* ---------------- 弹窗 ---------------- */
    function openModal(id) { const m = $('#' + id); if (m) m.classList.add('show'); }
    function closeModal(id) {
        if (id) { const m = $('#' + id); if (m) m.classList.remove('show'); }
        else $$('.modal-mask.show').forEach(m => m.classList.remove('show'));
    }
    document.addEventListener('click', e => {
        if (e.target.classList && e.target.classList.contains('modal-mask')) e.target.classList.remove('show');
        const btn = e.target.closest('[data-close-modal]');
        if (btn) closeModal(btn.getAttribute('data-close-modal'));
    });

    /* ---------------- 数据仓库 ---------------- */
    const read = (k, def) => {
        try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; }
    };
    const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

    const Store = {
        CURRENT_USER,

        /* 试题 */
        questions(includeDeleted = false) {
            const extra = read(LS.EXTRA, []);
            const patches = read(LS.PATCH, {});
            const deleted = read(LS.DELETED, []);
            return [...SEED.QUESTIONS, ...extra]
                .filter(q => includeDeleted || !deleted.includes(q.id))
                .map(q => ({ ...q, ...(patches[q.id] || {}) }));
        },
        getQuestion(id) { return this.questions(true).find(q => q.id === id); },
        addQuestions(list) {
            const extra = read(LS.EXTRA, []);
            // 生成 / 导入的题归属当前登录邮箱，组卷时仅该账号可见
            const stamped = list.map(q => ({ ...q, owner: q.owner || CURRENT_USER }));
            write(LS.EXTRA, [...extra, ...stamped]);
        },
        nextSeq(subject) {
            const max = this.questions(true).filter(q => q.subject === subject)
                .reduce((m, q) => Math.max(m, parseInt(q.seq, 10) || 0), 0);
            return String(max + 1).padStart(4, '0');
        },
        makeId(subject, isReal, type, difficulty, seq) {
            return `${subject}-${seq || this.nextSeq(subject)}-${isReal}-${type}-${difficulty}`;
        },
        /**
         * 批量预分配板块内序号（迭代器）。
         * 批量出题/导入时所有题目在落库前同时构造，逐个调 nextSeq 会读到同一最大值，
         * 导致同批题目共用序号（同题型时完整 ID 甚至完全重复）。
         * 用法：const seqs = Store.allocSeqs('DISC', n); seqs.next().value
         */
        allocSeqs(subject, n) {
            let max = this.questions(true).filter(q => q.subject === subject)
                .reduce((m, q) => Math.max(m, parseInt(q.seq, 10) || 0), 0);
            let left = Math.max(0, n | 0);
            return {
                next() {
                    if (left <= 0) return { done: true, value: undefined };
                    left--;
                    max++;
                    return { done: false, value: String(max).padStart(4, '0') };
                },
                [Symbol.iterator]() { return this; }
            };
        },
        /**
         * 信誉分变更（核心质控规则）
         * 1. 题目本体信誉分 ≥10 后只扣分、不再加分
         * 2. ≤-10 系统自动永久删除
         */
        changeReputation(id, delta) {
            const q = this.getQuestion(id);
            if (!q) return null;
            let cur = q.reputation || 0;
            if (delta > 0 && cur >= 10) { return cur; }    // ≥10 后只扣分、不再加分：分值保持不变
            cur = cur + delta;
            const patches = read(LS.PATCH, {});
            patches[id] = { ...(patches[id] || {}), reputation: cur };
            write(LS.PATCH, patches);
            if (cur <= -10) {
                const del = read(LS.DELETED, []);
                if (!del.includes(id)) { del.push(id); write(LS.DELETED, del); }
            }
            return cur;
        },
        changeStepScore(id, step, delta) {
            const q = this.getQuestion(id);
            const key = 'steps' + step;
            const cur = ((q[key] && q[key].score) || 0) + delta;
            const patches = read(LS.PATCH, {});
            patches[id] = { ...(patches[id] || {}), [key]: { ...q[key], score: cur } };
            write(LS.PATCH, patches);
            return cur;
        },
        deletedIds() { return read(LS.DELETED, []); },

        /* 历史习题：{ DISC: [entry], CALC: [...], PHYS: [...] } */
        history() { return read(LS.HISTORY, { DISC: [], CALC: [], PHYS: [] }); },
        historyList(subject) {
            const h = this.history();
            return subject ? (h[subject] || []) : Object.values(h).flat();
        },
        /** 作答完成 / 打印存档批量加入 —— 动态追加到对应学科 ID 数组 */
        addHistory(entries) {
            const h = this.history();
            entries.forEach(e => {
                if (!h[e.subject]) h[e.subject] = [];
                if (!h[e.subject].some(x => x.id === e.id)) {
                    h[e.subject].push({
                        source: 'online', correct: null, userAnswer: '', paperName: '',
                        feedbacks: {}, ...e, doneAt: e.doneAt || nowText()
                    });
                }
            });
            write(LS.HISTORY, h);
        },
        updateEntry(subject, id, patch) {
            const h = this.history();
            const arr = h[subject] || [];
            const i = arr.findIndex(x => x.id === id);
            if (i >= 0) { arr[i] = { ...arr[i], ...patch }; write(LS.HISTORY, h); }
        },
        getEntry(subject, id) {
            return (this.history()[subject] || []).find(x => x.id === id);
        },
        hasFeedback(subject, id, kind) {
            const e = this.getEntry(subject, id);
            return !!(e && e.feedbacks && e.feedbacks[kind]);
        },
        /** 防恶意刷分：同一用户同一题目同一类反馈仅生效一次 */
        addFeedback(subject, id, kind, payload) {
            if (this.hasFeedback(subject, id, kind)) return false;
            const e = this.getEntry(subject, id);
            if (!e) return false;
            e.feedbacks = e.feedbacks || {};
            e.feedbacks[kind] = { ...payload, at: nowText() };
            this.updateEntry(subject, id, { feedbacks: e.feedbacks });
            return true;
        },

        /* 试卷导出存档 */
        archives() { return read(LS.ARCHIVE, []); },
        addArchive(paper) {
            const list = this.archives();
            const rec = {
                id: 'arc-' + Date.now(),
                name: paper.name, subject: paper.subject,
                exportedAt: nowText(),
                questionIds: paper.questions.map(q => q.id),
                addedToHistory: false
            };
            list.unshift(rec);
            write(LS.ARCHIVE, list);
            return rec;
        },
        markArchiveAdded(id) {
            const list = this.archives();
            const r = list.find(x => x.id === id);
            if (r) { r.addedToHistory = true; write(LS.ARCHIVE, list); }
        },
        /** 试卷命名：学科名_YYYYMMDD；同天多套自动递增序号，并和历史/存档/当前卷/草稿全量查重，保证永不重名 */
        nextPaperName(subjectName) {
            const base = `${subjectName}_${today()}`;
            const taken = new Set();
            this.archives().forEach(a => { if (a && a.name) taken.add(a.name); });
            this.historyList().forEach(h => { if (h && h.paperName) taken.add(h.paperName); });
            const cur = this.currentPaper();
            if (cur && cur.name) taken.add(cur.name);
            try {
                const drafts = JSON.parse(localStorage.getItem('aigame_exam_drafts_' + CURRENT_USER)) || {};
                Object.values(drafts).forEach(d => { if (d && d.paperName) taken.add(d.paperName); });
            } catch (e) { /* 草稿读取失败时忽略 */ }
            if (!taken.has(base)) return base;
            let n = 2;
            while (taken.has(`${base}_${n}`)) n++;
            return `${base}_${n}`;
        },

        /* 当前待作答 / 待打印的试卷 */
        currentPaper() { return read(LS.PAPER, null); },
        setCurrentPaper(p) { write(LS.PAPER, p); },
        clearCurrentPaper() { localStorage.removeItem(LS.PAPER); }
    };

    /* ---------------- 渲染辅助 ---------------- */
    function diffStars(level) {
        return `<span class="diff">${'★'.repeat(level)}<span class="off">${'★'.repeat(5 - level)}</span></span>`;
    }
    function typeBadge(t) {
        const cls = { 0: 'badge-blue', 1: 'badge-purple', 2: 'badge-orange' };
        return `<span class="badge ${cls[t]}">${SEED.TYPE_MAP[t]}</span>`;
    }
    function sourceBadge(isReal) {
        return isReal
            ? '<span class="badge badge-green">真题原题(1)</span>'
            : '<span class="badge badge-gray">AI仿造/生成(0)</span>';
    }
    function scoreHtml(v) {
        const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero';
        const sign = v > 0 ? '+' : '';
        return `<span class="score ${cls}">${sign}${v}</span>`;
    }
    function subjectName(code) {
        const s = SEED.SUBJECTS.find(x => x.code === code);
        return s ? s.name : code;
    }

    /* ---------------- 导航高亮 ---------------- */
    function markNav() {
        const page = document.body.getAttribute('data-page');
        if (page) $$('.nav a').forEach(a => {
            if (a.getAttribute('data-nav') === page) a.classList.add('active');
        });
    }

    document.addEventListener('DOMContentLoaded', markNav);

    window.UI = {
        $, $$, esc, toast, openModal, closeModal,
        today, nowText, delay,
        diffStars, typeBadge, sourceBadge, scoreHtml, subjectName
    };
    window.Store = Store;

    /* ---------------- 头部用户名显示当前账号（有昵称优先显示昵称） ---------------- */
    document.addEventListener('DOMContentLoaded', () => {
        const nameEl = document.querySelector('.user-box .uname');
        if (nameEl) nameEl.textContent = localStorage.getItem('aigame_nickname_' + CURRENT_USER) || CURRENT_USER;
    });

    /* ---------------- 版头「未完成试卷」：统一收纳为一个入口，点击展开列表 ---------------- */
    document.addEventListener('DOMContentLoaded', () => {
        let list = [];
        try {
            const drafts = JSON.parse(localStorage.getItem('aigame_exam_drafts_' + CURRENT_USER)) || {};
            list = Object.values(drafts).sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
        } catch (e) { /* 草稿数据异常时按空处理 */ }
        const nav = document.querySelector('.topbar .nav');
        if (!list.length || !nav) return;

        // 入口与左侧导航同形态，命名为「未完成试卷」
        const btn = document.createElement('a');
        btn.className = 'draft-nav-link';
        btn.href = 'javascript:void(0)';
        btn.title = '查看未完成试卷列表';
        btn.textContent = '📋 未完成试卷';
        nav.appendChild(btn);

        // 悬浮面板挂到 body，避免被版头 overflow 裁剪
        const panel = document.createElement('div');
        panel.className = 'draft-panel';
        panel.innerHTML = `<div class="dp-title">未完成试卷 · 共 ${list.length} 份（点击继续作答）</div>` + list.map(d => {
            const answered = d.answeredCount != null ? d.answeredCount : Object.keys(d.answers || {}).length;
            const total = d.totalCount || (d.paper && d.paper.questions && d.paper.questions.length) || '—';
            const id = d.id || d.paperName;
            return `<a class="dp-item" href="exam.html?draft=${encodeURIComponent(id)}">
                <span class="dp-name">📝 ${esc(d.paperName)}</span>
                <span class="dp-meta">已答 ${answered}/${total}</span>
            </a>`;
        }).join('');
        document.body.appendChild(panel);

        let open = false;
        const place = () => {
            const r = btn.getBoundingClientRect();
            panel.style.top = (r.bottom + 8) + 'px';
            let left = r.right - panel.offsetWidth;
            if (left < 8) left = 8;
            if (left + panel.offsetWidth > window.innerWidth - 8) left = window.innerWidth - panel.offsetWidth - 8;
            panel.style.left = left + 'px';
        };
        const close = () => { open = false; panel.classList.remove('show'); };
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            open = !open;
            if (open) { panel.classList.add('show'); place(); } else { close(); }
        });
        document.addEventListener('click', e => { if (open && !panel.contains(e.target)) close(); });
        window.addEventListener('resize', close);
        window.addEventListener('scroll', close, true);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    });

    /* ---------------- 退出登录：记住账号用于预填充，清除登录态后进入登录页 ---------------- */
    document.addEventListener('click', e => {
        const link = e.target.closest && e.target.closest('.logout');
        if (!link) return;
        e.preventDefault();
        const acc = localStorage.getItem('aigame_user');
        if (acc) localStorage.setItem('aigame_last_login', acc);
        localStorage.removeItem('aigame_user');
        location.href = link.getAttribute('href') || 'users.html';
    });
})();
