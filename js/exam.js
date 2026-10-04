/* ============================================================
   在线作答页
   1. PDF.js 负责把后端 .pdf 绘制到网页（paper.pdfUrl 存在时启用）；
      当前演示版使用内置 A4 版式渲染，交互控件叠加方式与真实 PDF 一致。
   2. 全局手写草稿画布（答题区域自动穿透）/ 卷面锁定 + 独立草稿页
   3. 计时（手动暂停 / 退出自动暂停）、作答实时同步、交卷后 AI 批改自动归档
   ============================================================ */
(function () {
    'use strict';
    const { $, $$, esc, toast, openModal, closeModal, subjectName, delay } = UI;

    // 本用户全部未完成试卷草稿：{ 试卷名: { paperName, subject, elapsed, answers, savedAt, paper } }
    // 按登录账号（邮箱）分键，不同用户的中途保存互不可见；同一用户可同时保存多套试卷
    const DRAFTS_KEY = 'aigame_exam_drafts_' + Store.CURRENT_USER;
    const LEGACY_DRAFT_KEY = 'aigame_exam_draft_' + Store.CURRENT_USER;
    const CARDW_KEY = 'aigame_exam_cardw_' + Store.CURRENT_USER;
    const SECTION_NAMES = { 0: '一、单项选择题', 1: '二、填空题', 2: '三、主观大题（写出主要解答过程）' };
    const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

    const layout = $('#exam-layout');
    const stage = $('#exam-stage');
    const splitter = $('#exam-splitter');
    const answerCard = $('#answer-card');
    const scaler = $('#page-scaler');
    const fitBox = $('#page-fit');

    /* ---------------- 草稿读写（按用户隔离，支持多套试卷） ---------------- */
    function readDrafts() {
        try { return JSON.parse(localStorage.getItem(DRAFTS_KEY)) || {}; }
        catch { return {}; }
    }
    function writeDrafts(map) { localStorage.setItem(DRAFTS_KEY, JSON.stringify(map)); }
    // 旧版单卷草稿一次性迁移进多卷草稿表
    (function migrateLegacyDraft() {
        const raw = localStorage.getItem(LEGACY_DRAFT_KEY);
        if (!raw) return;
        try {
            const d = JSON.parse(raw);
            if (d && d.paperName) {
                const map = readDrafts();
                if (!map[d.paperName]) {
                    map[d.paperName] = {
                        paperName: d.paperName, subject: '', elapsed: d.elapsed || 0,
                        answers: d.answers || {}, savedAt: '', legacy: true
                    };
                    writeDrafts(map);
                }
            }
        } catch (e) { /* 忽略损坏草稿 */ }
        localStorage.removeItem(LEGACY_DRAFT_KEY);
    })();

    // 从首页「继续作答」进入：exam.html?draft=<草稿id（试卷uid）>，优先恢复该卷快照
    const resumeName = new URLSearchParams(location.search).get('draft');

    let paper = null;
    if (resumeName) {
        const d = readDrafts()[resumeName];
        if (d && d.paper) paper = d.paper;
        if (!paper) {
            const cur = Store.currentPaper();
            if (cur && (cur.uid === resumeName || (!cur.uid && cur.name === resumeName))) paper = cur;
        }
    }
    if (!paper) paper = Store.currentPaper();
    if (!paper) {
        // 直接打开页面时的演示试卷
        const qs = Store.questions().filter(q => q.subject === 'CALC');
        paper = {
            uid: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            name: Store.nextPaperName('微积分'), subject: 'CALC', mode: 'online',
            questions: [qs.find(q => q.id.startsWith('CALC-0003-')), qs.find(q => q.id.startsWith('CALC-0009-')),
                qs.find(q => q.id.startsWith('CALC-0014-')), qs.find(q => q.id.startsWith('CALC-0025-')),
                qs.find(q => q.id.startsWith('CALC-0021-'))].filter(Boolean)
        };
    }
    if (resumeName) Store.setCurrentPaper(paper); // 保证后续流程读到的就是恢复的这套卷

    // 草稿存储键：优先试卷 uid（同日多套同名卷互不覆盖），兜底用试卷名
    const draftId = () => paper.uid || 'name:' + paper.name;

    /* ---------------- 状态 ---------------- */
    const answers = {};
    const graded = {};                 // qid -> 'correct' | 'wrong' | 'grading'
    let submitted = false;
    let elapsed = 0;
    let timerId = null;
    let running = false;
    let zoom = 1;
    let userZoomed = false;          // 用户是否手动缩放过（手动后窗口 resize 不自动覆盖）
    let pen = { tool: 'pen', color: '#1f2733' };
    let draftMode = 'global';
    let draftHasInk = false;

    /* ---------------- 分页并渲染 A4 页面 ---------------- */
    function buildBlocks() {
        const blocks = [];
        [0, 1, 2].forEach(t => {
            const list = paper.questions.map((q, i) => ({ q, i })).filter(x => x.q.type === t);
            if (!list.length) return;
            blocks.push({ kind: 'header', weight: .25, text: SECTION_NAMES[t] });
            list.forEach(x => blocks.push({
                kind: 'q', weight: x.q.type === 2 ? 2.55 : x.q.type === 1 ? 1.15 : 1.0,
                q: paper.questions[x.i], index: paper.questions.indexOf(x.q)
            }));
        });
        return blocks;
    }

    function paginate(blocks) {
        const pages = [[]];
        let used = 1.35; // 首页有卷头
        const cap = 3.05;
        blocks.forEach(b => {
            if (b.kind === 'header') {
                if (used + b.weight > cap || pages[pages.length - 1].some(x => x.kind === 'q')) { pages.push([]); used = 0; }
                pages[pages.length - 1].push(b); used += b.weight;
                return;
            }
            if (used + b.weight > cap) { pages.push([]); used = 0; }
            pages[pages.length - 1].push(b); used += b.weight;
        });
        return pages;
    }

    function questionHtml(q, idx) {
        const no = CN_NUM[idx] || (idx + 1);
        const src = q.isReal ? '<span class="badge badge-green">真题(1)</span>'
            : (q.imitated ? '<span class="badge badge-gray">AI仿造(0)</span>' : '<span class="badge badge-blue">AI题(0)</span>');
        const diff = ['', '1级', '2级', '3级', '4级', '5级'][q.difficulty];
        let zone = '';
        if (q.type === 0) {
            zone = `<div class="ans-zone opts">${q.options.map(op =>
                `<div class="opt" data-qid="${q.id}" data-v="${op[0]}">${esc(op)}</div>`).join('')}</div>`;
        } else if (q.type === 1) {
            zone = `<div class="ans-zone"><input class="ans-blank" data-qid="${q.id}" type="text" placeholder="请输入填空答案"></div>`;
        } else {
            zone = `<div class="ans-zone"><textarea class="ans-big" data-qid="${q.id}" placeholder="请在此输入解答过程，作答数据将实时同步至服务器…"></textarea></div>`;
        }
        return `<div class="q" id="q-${q.id}" data-qid="${q.id}">
            <div class="q-meta">
                <span class="badge badge-purple">${SEED.TYPE_MAP[q.type]}</span>${src}
                <span class="badge badge-orange">难度 ${diff}</span>
                <span class="qid">题目ID：${q.id}</span>
            </div>
            <div class="q-stem">${no}、${esc(q.stem)}</div>
            ${zone}
        </div>`;
    }

    function renderPaper() {
        $('#paper-name-title').textContent = paper.name;
        $('#paper-sub-title').textContent = `${subjectName(paper.subject)} · 共 ${paper.questions.length} 题 · 网页交互作答模式`;
        document.title = paper.name + ' · 在线作答';

        const pages = paginate(buildBlocks());
        scaler.innerHTML = pages.map((blocks, pi) => `
            <section class="pdf-page" data-page="${pi + 1}">
                ${pi === 0 ? `
                <div class="paper-head">
                    <h1>${esc(paper.name)}</h1>
                    <div class="meta">${subjectName(paper.subject)} · 线上无纸化练习卷 · PDF.js 网页渲染 · 本卷共 ${paper.questions.length} 题</div>
                    <div class="paper-info-line">
                        <span>姓名：<span class="uline">lilei</span></span>
                        <span>学号：<span class="uline">20260001</span></span>
                        <span>得分：<span class="uline" style="min-width:60px;">&nbsp;</span></span>
                    </div>
                    <div class="paper-notice">
                        作答说明：① 除答题区域外，可在页面任意位置使用画笔进行草稿演算；② 选择题点击选项完成勾选，填空与主观题在输入框内作答；
                        ③ 作答数据实时上传服务器，交卷后由 AI 自动批改；④ 计时退出自动暂停，也可手动暂停。
                    </div>
                </div>` : ''}
                ${blocks.map(b => b.kind === 'header'
                    ? `<div class="q-type-title">${b.text}</div>`
                    : questionHtml(b.q, b.index)).join('')}
                <div class="page-foot">${esc(paper.name)} · 第 ${pi + 1} 页 / 共 ${pages.length} 页 · 题目ID可在历史习题中检索反馈</div>
                <canvas class="ink"></canvas>
            </section>`).join('');
        $('#total-page').textContent = pages.length;

        setupInkCanvases();
        renderAnswerCard();
        observePages();
    }

    /* ---------------- 手写画布（每页一个 canvas 覆盖层） ---------------- */
    function setupInkCanvases() {
        const dpr = window.devicePixelRatio || 1;
        $$('.pdf-page').forEach(page => {
            const canvas = $('.ink', page);
            canvas.width = 794 * dpr;
            canvas.height = 1123 * dpr;
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            let drawing = false, last = null;
            const pos = e => {
                const r = canvas.getBoundingClientRect();
                return { x: (e.clientX - r.left) * 794 / r.width, y: (e.clientY - r.top) * 1123 / r.height };
            };
            canvas.addEventListener('pointerdown', e => {
                if (submitted) return;
                drawing = true;
                last = pos(e);
                canvas.setPointerCapture(e.pointerId);
            });
            canvas.addEventListener('pointermove', e => {
                if (!drawing) return;
                const p = pos(e);
                ctx.globalCompositeOperation = pen.tool === 'eraser' ? 'destination-out' : 'source-over';
                ctx.strokeStyle = pen.color;
                ctx.lineWidth = pen.tool === 'eraser' ? 20 : 2.4;
                ctx.beginPath();
                ctx.moveTo(last.x, last.y);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
                last = p;
            });
            const stop = () => { drawing = false; last = null; };
            canvas.addEventListener('pointerup', stop);
            canvas.addEventListener('pointercancel', stop);
        });
    }

    function currentPageEl() {
        // pdf-page 的 offsetTop 是未缩放布局值，需乘当前 zoom 换算到舞台滚动坐标系
        const top = (stage.scrollTop + 120) / zoom;
        const pages = $$('.pdf-page');
        let cur = pages[0];
        for (const p of pages) { if (p.offsetTop <= top) cur = p; else break; }
        return cur;
    }
    function observePages() {
        // 页面很高时单页在矮视口内难以达到高交叉比，直接以舞台滚动位置判定当前页
        const updatePage = () => { $('#cur-page').textContent = currentPageEl().dataset.page; };
        stage.addEventListener('scroll', updatePage, { passive: true });
        updatePage();
        const io = new IntersectionObserver(entries => {
            entries.forEach(en => {
                if (en.isIntersecting && en.intersectionRatio > 0.5) {
                    $('#cur-page').textContent = en.target.dataset.page;
                }
            });
        }, { root: stage, rootMargin: '-30% 0px -50% 0px', threshold: [0.6] });
        $$('.pdf-page').forEach(p => io.observe(p));
    }
    function gotoPage(n) {
        const pages = $$('.pdf-page');
        n = Math.max(1, Math.min(pages.length, n));
        pages[n - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /* ---------------- 分栏滑块拖拽 + 试卷宽度自适应 ---------------- */
    function applyZoom(z) {
        zoom = z;
        // transform 视觉缩放；外层占位盒同步缩放后的宽高，保证滚动条 / 页码定位准确
        scaler.style.transform = `scale(${z})`;
        fitBox.style.width = `${794 * z}px`;
        fitBox.style.height = `${scaler.offsetHeight * z}px`;
    }

    function fitWidth() {
        const cs = getComputedStyle(stage);
        const avail = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        applyZoom(Math.max(0.45, Math.min(1, +(avail / 794).toFixed(3))));
    }

    function initLayout() {
        // 恢复上次的答题卡宽度
        const saved = parseInt(localStorage.getItem(CARDW_KEY), 10);
        if (saved >= 132 && saved <= 400) layout.style.setProperty('--card-w', saved + 'px');

        // 拖拽中间滑块：右移缩小答题卡、左移拉宽答题卡
        let drag = null;
        splitter.addEventListener('pointerdown', e => {
            drag = { x: e.clientX, w: answerCard.getBoundingClientRect().width };
            splitter.classList.add('dragging');
            splitter.setPointerCapture(e.pointerId);
            document.body.style.cursor = 'col-resize';
        });
        splitter.addEventListener('pointermove', e => {
            if (!drag) return;
            const w = Math.max(132, Math.min(400, Math.round(drag.w + drag.x - e.clientX)));
            layout.style.setProperty('--card-w', w + 'px');
        });
        const endDrag = () => {
            if (!drag) return;
            drag = null;
            splitter.classList.remove('dragging');
            document.body.style.cursor = '';
            localStorage.setItem(CARDW_KEY, Math.round(answerCard.getBoundingClientRect().width));
            if (!userZoomed) fitWidth();
        };
        splitter.addEventListener('pointerup', endDrag);
        splitter.addEventListener('pointercancel', endDrag);

        let rzTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(rzTimer);
            rzTimer = setTimeout(() => { if (!userZoomed) fitWidth(); }, 120);
        });
    }

    /* ---------------- 答题卡 ---------------- */
    function renderAnswerCard() {
        $('#ac-grid').innerHTML = paper.questions.map((q, i) =>
            `<button class="ac-btn" data-qid="${q.id}" title="${q.id}">${i + 1}</button>`).join('');
    }
    function refreshCard() {
        $$('.ac-btn').forEach(btn => {
            const qid = btn.dataset.qid;
            btn.classList.remove('answered', 'grading', 'right', 'wrong');
            if (graded[qid]) btn.classList.add(graded[qid] === 'correct' ? 'right' : graded[qid] === 'wrong' ? 'wrong' : 'grading');
            else if (answers[qid] && String(answers[qid]).trim()) btn.classList.add('answered');
        });
    }

    /* ---------------- 作答采集 + 实时同步 ---------------- */
    function isAnswered(qid) { return answers[qid] != null && String(answers[qid]).trim() !== ''; }

    function bindAnswer() {
        // 选择题勾选
        document.addEventListener('click', e => {
            const opt = e.target.closest('.opt');
            if (!opt || submitted) return;
            const qid = opt.dataset.qid;
            $$(`.opt[data-qid="${qid}"]`).forEach(o => o.classList.remove('sel'));
            opt.classList.add('sel');
            answers[qid] = opt.dataset.v;
            saveDraft(); refreshCard();
            flashSync();
        });
        // 填空 / 大题输入
        document.addEventListener('input', e => {
            if (!e.target.matches('.ans-blank, .ans-big') || submitted) return;
            answers[e.target.dataset.qid] = e.target.value;
            saveDraft(); refreshCard();
            flashSync();
        });
        // 答题卡跳转
        document.addEventListener('click', e => {
            const b = e.target.closest('.ac-btn');
            if (b) {
                const el = document.getElementById('q-' + b.dataset.qid);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }

    let syncTimer = null;
    function flashSync() {
        $('#sync-text').textContent = '正在上传服务器…';
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
            $('#sync-text').textContent = '已同步 ' + new Date().toLocaleTimeString();
        }, 500);
    }
    setInterval(() => { if (!submitted && running) { saveDraft(); flashSync(); } }, 5000);

    function saveDraft() {
        const map = readDrafts();
        const id = draftId();
        map[id] = {
            id,
            uid: paper.uid || '',
            paperName: paper.name,
            subject: paper.subject || '',
            mode: paper.mode || 'online',
            elapsed,
            answers: { ...answers },
            answeredCount: Object.keys(answers).filter(k => answers[k] !== '').length,
            totalCount: paper.questions.length,
            savedAt: new Date().toISOString(),
            paper // 整卷快照：恢复时不依赖“当前试卷”，支持同时挂起多套卷
        };
        writeDrafts(map);
    }
    function clearDraft() {
        const map = readDrafts();
        if (map[draftId()]) {
            delete map[draftId()];
            writeDrafts(map);
        }
    }
    function restoreDraft() {
        try {
            const map = readDrafts();
            const d = map[draftId()] || (!paper.uid ? map[paper.name] : null);
            if (!d) return false;
            elapsed = d.elapsed || 0;
            Object.assign(answers, d.answers || {});
            Object.entries(answers).forEach(([qid, v]) => {
                const opt = $(`.opt[data-qid="${qid}"][data-v="${v}"]`);
                if (opt) opt.classList.add('sel');
                const inp = $(`.ans-blank[data-qid="${qid}"], .ans-big[data-qid="${qid}"]`);
                if (inp) inp.value = v;
            });
            refreshCard();
            return true; // 只要存在该卷的保存记录，就进入「继续作答」流程
        } catch { return false; }
    }

    /* ---------------- 计时 / 暂停 ---------------- */
    function fmt(sec) {
        const m = Math.floor(sec / 60), s = sec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    function startTimer() {
        running = true;
        $('#start-cover').classList.add('hidden');
        $('#pause-cover').classList.add('hidden');
        clearInterval(timerId);
        timerId = setInterval(() => {
            elapsed++;
            $('#timer-text').textContent = fmt(elapsed);
        }, 1000);
    }
    function pauseTimer(auto) {
        if (!running || submitted) return;
        running = false;
        clearInterval(timerId);
        $('#pause-timer').textContent = fmt(elapsed);
        $('#timer-pill').classList.add('paused');
        $('#timer-tip').textContent = '已暂停';
        $('#pause-cover').classList.remove('hidden');
        if (auto) toast('检测到已离开试卷页面，计时自动暂停', 'warn');
    }
    function resumeTimer() {
        $('#pause-cover').classList.add('hidden');
        $('#timer-pill').classList.remove('paused');
        $('#timer-tip').textContent = '点击暂停';
        startTimer();
    }

    /* ---------------- 交卷 + AI 批改 ---------------- */
    function gradeObjective(q) {
        const ua = (answers[q.id] || '').toString().trim();
        if (q.type === 0) return ua === q.answer ? 'correct' : (ua ? 'wrong' : 'wrong');
        if (q.type === 1) {
            if (!ua) return 'wrong';
            const norm = s => s.replace(/\s/g, '');
            const tokens = q.answer.split(/[（）()\/]/).map(t => t.trim()).filter(Boolean).map(norm);
            const hit = tokens.some(t => norm(ua) === t) ||
                (tokens[0].length >= 4 && norm(ua).includes(tokens[0]));
            return hit ? 'correct' : 'wrong';
        }
        return 'grading'; // 主观题异步 AI 批改
    }

    function showInlineGrading(q) {
        const box = document.getElementById('q-' + q.id);
        if (!box) return;
        const old = $('.grade-info', box);
        if (old) old.remove();
        const g = graded[q.id];
        const ua = answers[q.id] || '';
        let html = '';
        if (g === 'grading') {
            html = `<div class="grade-info wrong"><span class="spinner dark"></span> 主观题已提交，AI 正在批改，请稍后在「历史习题」查看结果…</div>`;
        } else if (g === 'correct') {
            html = `<div class="grade-info right">✓ <b>回答正确</b>　你的答案：${esc(ua) || '（见解答过程）'}
                <div class="steps-a">📘 解题步骤 A：${esc(q.stepsA.text)}</div>
                <span class="steps-b-note">※ 校验端解题步骤 B 仅后台存储，用于模型偏差统计，不在前端展示</span></div>`;
        } else {
            html = `<div class="grade-info wrong">✗ <b>回答错误</b>　你的答案：${esc(ua) || '未作答'}　|　正确答案：<b>${esc(q.answer)}</b>
                <div class="steps-a">📘 解题步骤 A：${esc(q.stepsA.text)}</div>
                <span class="steps-b-note">※ 如认为题干 / 标准答案或解题步骤有误，可交卷后到「历史习题」提交错误反馈</span></div>`;
        }
        box.insertAdjacentHTML('beforeend', html);
        box.classList.remove('g-correct', 'g-wrong', 'g-grading');
        if (g === 'correct') box.classList.add('g-correct');
        if (g === 'wrong') box.classList.add('g-wrong');
        if (g === 'grading') box.classList.add('g-grading');
        // 锁定选项
        $$('.opt', box).forEach(o => o.classList.add('locked'));
        if (g === 'correct') { const op = $(`.opt[data-v="${q.answer}"]`, box); if (op) op.classList.add('correct'); }
        if (g === 'wrong' && q.type === 0) {
            const op = $(`.opt[data-v="${q.answer}"]`, box); if (op) op.classList.add('correct');
            const mine = $(`.opt.sel[data-qid="${q.id}"]`, box); if (mine) mine.classList.add('wrong');
        }
    }

    function resultBody() {
        const n = id => paper.questions.filter(q => graded[q.id] === id).length;
        const items = paper.questions.map((q, i) => {
            const g = graded[q.id];
            const badge = g === 'correct' ? '<span class="badge badge-green">正确</span>'
                : g === 'wrong' ? '<span class="badge badge-red">错误</span>'
                    : '<span class="badge badge-orange">AI 批改中…</span>';
            return `<div class="rq-item">
                <div class="rq-top">${badge}<b>第 ${i + 1} 题</b><span class="mono small muted">${q.id}</span></div>
                <div class="rq-stem">${esc(q.stem)}</div>
                <div class="rq-ans">你的答案：${esc(answers[q.id] || '未作答')}　|　标准答案：<b>${esc(q.answer)}</b></div>
                <details><summary>查看解题步骤 A</summary>
                    <div style="margin-top:6px;">${esc(q.stepsA.text)}<br>
                    <span class="muted small">（解题步骤 B 仅后台存储，用于双模型偏差统计）</span></div>
                </details>
            </div>`;
        }).join('');
        return `<div class="result-summary">
            <div class="rs"><div class="n" style="color:var(--success)">${n('correct')}</div><div class="l">答对</div></div>
            <div class="rs"><div class="n" style="color:var(--danger)">${n('wrong')}</div><div class="l">答错 / 未答</div></div>
            <div class="rs"><div class="n" style="color:var(--warning)">${n('grading')}</div><div class="l">主观题批改中</div></div>
            <div class="rs"><div class="n">${fmt(elapsed)}</div><div class="l">作答用时</div></div>
        </div>
        <div class="alert" style="background:var(--primary-light);border-radius:10px;padding:12px 16px;font-size:13px;margin-bottom:16px;">
            📥 本卷全部题目已自动归档至「我的历史习题」；线上作答题目本体信誉分 <b>+1</b>（信誉分 ≥10 后只扣不增）。
            如发现题干、标准答案或解题步骤错误，可在历史习题中发起反馈，进入双 Agent 复核扣分流程。
        </div>${items}`;
    }

    async function submitPaper() {
        submitted = true;
        clearInterval(timerId);
        running = false;
        // 客观题即时批改，主观题进入异步 AI 判分
        paper.questions.forEach(q => { graded[q.id] = gradeObjective(q); });
        paper.questions.forEach(showInlineGrading);
        refreshCard();

        // 自动归档历史习题
        Store.addHistory(paper.questions.map(q => ({
            subject: q.subject, id: q.id, source: 'online',
            correct: graded[q.id] === 'correct' ? true : graded[q.id] === 'wrong' ? false : 'grading',
            userAnswer: answers[q.id] || '', paperName: paper.name
        })));
        // 无错题反馈：题目本体信誉分 +1
        paper.questions.forEach(q => Store.changeReputation(q.id, 1));

        clearDraft();
        $('#result-body').innerHTML = resultBody();
        openModal('result-modal');

        // 模拟主观题 AI 批改轮询
        const bigs = paper.questions.filter(q => graded[q.id] === 'grading');
        for (const q of bigs) {
            await delay(1800 + Math.random() * 1200);
            const ua = (answers[q.id] || '').trim();
            graded[q.id] = ua ? 'correct' : 'wrong';
            Store.updateEntry(q.subject, q.id, {
                correct: graded[q.id] === 'correct',
                aiComment: ua ? 'AI 评阅：解答思路与采分点基本完整，得分约 85%。' : '未作答，判定为错误。'
            });
            showInlineGrading(q);
            refreshCard();
            if ($('#result-modal').classList.contains('show')) $('#result-body').innerHTML = resultBody();
        }
    }

    /* ---------------- 独立草稿页 ---------------- */
    const draftCanvas = $('#draftCanvas');
    const dctx = draftCanvas.getContext('2d');
    dctx.lineCap = 'round'; dctx.lineJoin = 'round';
    let dDraw = false, dLast = null, dPen = 'pen';
    function dPos(e) {
        const r = draftCanvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) * 900 / r.width, y: (e.clientY - r.top) * 1200 / r.height };
    }
    draftCanvas.addEventListener('pointerdown', e => { dDraw = true; dLast = dPos(e); draftCanvas.setPointerCapture(e.pointerId); });
    draftCanvas.addEventListener('pointermove', e => {
        if (!dDraw) return;
        const p = dPos(e);
        dctx.globalCompositeOperation = dPen === 'eraser' ? 'destination-out' : 'source-over';
        dctx.strokeStyle = '#1f2733';
        dctx.lineWidth = dPen === 'eraser' ? 22 : 2.6;
        dctx.beginPath(); dctx.moveTo(dLast.x, dLast.y); dctx.lineTo(p.x, p.y); dctx.stroke();
        dLast = p;
        if (!draftHasInk) { draftHasInk = true; $('#draft-exit').disabled = true; }
    });
    draftCanvas.addEventListener('pointerup', () => dDraw = false);

    /* ---------------- 工具栏绑定 ---------------- */
    function bindToolbar() {
        $('#prev-page').addEventListener('click', () => gotoPage(+$('#cur-page').textContent - 1));
        $('#next-page').addEventListener('click', () => gotoPage(+$('#cur-page').textContent + 1));
        $('#zoom-out').addEventListener('click', () => setZoom(zoom - 0.1));
        $('#zoom-in').addEventListener('click', () => setZoom(zoom + 0.1));
        function setZoom(z) {
            userZoomed = true;
            applyZoom(Math.max(.45, Math.min(1.5, +z.toFixed(2))));
        }
        $('#tool-pen').addEventListener('click', () => { pen.tool = 'pen'; togglePen(); });
        $('#tool-eraser').addEventListener('click', () => { pen.tool = 'eraser'; togglePen(); });
        function togglePen() {
            $('#tool-pen').classList.toggle('on', pen.tool === 'pen');
            $('#tool-eraser').classList.toggle('on', pen.tool === 'eraser');
            $$('.ink').forEach(c => c.classList.toggle('eraser', pen.tool === 'eraser'));
        }
        $$('.color-dot').forEach(d => d.addEventListener('click', () => {
            $$('.color-dot').forEach(x => x.classList.remove('on'));
            d.classList.add('on');
            pen.color = d.dataset.color;
            pen.tool = 'pen'; togglePen();
        }));
        $('#clear-page').addEventListener('click', () => {
            const c = $('.ink', currentPageEl());
            c.getContext('2d').clearRect(0, 0, 794, 1123);
            toast('本页草稿墨迹已清空');
        });

        // 草稿模式
        $$('.mode-switch-mini button').forEach(b => b.addEventListener('click', () => {
            $$('.mode-switch-mini button').forEach(x => x.classList.remove('on'));
            b.classList.add('on');
            draftMode = b.dataset.draft;
            const locked = draftMode === 'locked';
            $$('.pdf-page').forEach(p => p.classList.toggle('locked', locked));
            $('#open-draft').style.display = locked ? 'inline-flex' : 'none';
            $('#pen-tools').style.display = locked ? 'none' : 'flex';
        }));
        $('#open-draft').addEventListener('click', () => $('#draft-stage').classList.add('show'));
        $('#draft-pen').addEventListener('click', () => { dPen = 'pen'; $('#draft-pen').classList.add('on'); $('#draft-eraser').classList.remove('on'); });
        $('#draft-eraser').addEventListener('click', () => { dPen = 'eraser'; $('#draft-eraser').classList.add('on'); $('#draft-pen').classList.remove('on'); });
        $('#draft-clear').addEventListener('click', () => {
            dctx.clearRect(0, 0, 900, 1200);
            draftHasInk = false;
            $('#draft-exit').disabled = false;
            toast('草稿已全部清空，现在可以返回试卷');
        });
        $('#draft-exit').addEventListener('click', () => {
            if (draftHasInk) { toast('请先清空全部草稿内容，才能退出草稿页', 'error'); return; }
            $('#draft-stage').classList.remove('show');
        });

        // 计时
        $('#timer-pill').addEventListener('click', () => running ? pauseTimer(false) : resumeTimer());
        $('#start-btn').addEventListener('click', startTimer);
        $('#resume-btn').addEventListener('click', resumeTimer);
        document.addEventListener('visibilitychange', () => { if (document.hidden) pauseTimer(true); });

        // 暂停页「保存并退出」：落一份草稿后返回首页
        $('#pause-exit-btn').addEventListener('click', () => {
            running = false;
            clearInterval(timerId);
            saveDraft();
            leaving = true;
            toast('进度已保存，可随时从版头「接着做」或首页「未完成试卷」继续');
            setTimeout(() => { location.href = 'index.html'; }, 400);
        });

        // 主动「保存退出」：弹窗三选一（保存并退出 / 不保存退出 / 继续作答）
        let leaving = false;
        $('#save-exit-btn').addEventListener('click', () => {
            if (submitted) { location.href = 'index.html'; return; }
            const done = paper.questions.filter(q => isAnswered(q.id)).length;
            $('#exit-confirm-body').innerHTML =
                `<p style="line-height:2;">已作答 <b style="color:var(--primary)">${done}</b> / ${paper.questions.length} 题，已计时 <b>${fmt(elapsed)}</b>。<br>
                「保存并退出」会把进度按当前账号（${esc(Store.CURRENT_USER)}）单独保存，计时暂停，之后可在首页「未完成试卷」中继续作答。</p>`;
            openModal('exit-confirm');
        });
        $('#exit-save').addEventListener('click', () => {
            running = false;
            clearInterval(timerId);
            saveDraft();                 // 显式保存：答案 + 已用时长 + 整卷快照
            leaving = true;
            toast('进度已保存，可随时从首页「未完成试卷」继续');
            setTimeout(() => { location.href = 'index.html'; }, 500);
        });
        $('#exit-discard').addEventListener('click', () => {
            clearDraft();
            leaving = true;
            location.href = 'index.html';
        });

        window.addEventListener('beforeunload', e => {
            if (leaving || submitted) return;
            if (running) {
                saveDraft();             // 关页 / 刷新 / 意外离开前兜底落一份草稿
                e.preventDefault();
                e.returnValue = '作答尚未提交，进度可保存。确定离开吗？';
            }
        });

        // 点击版头「未完成试卷」面板里的试卷条目离开时：先保存当前卷草稿并放行，避免弹离开确认
        document.addEventListener('click', e => {
            const a = e.target.closest && e.target.closest('.dp-item');
            if (!a) return;
            if (!submitted) saveDraft();
            leaving = true;
        });

        // 交卷
        $('#submit-btn').addEventListener('click', () => {
            const done = paper.questions.filter(q => isAnswered(q.id)).length;
            $('#submit-confirm-body').innerHTML =
                `<p style="line-height:2;">已作答 <b style="color:var(--primary)">${done}</b> / ${paper.questions.length} 题，用时 <b>${fmt(elapsed)}</b>。<br>
                交卷后客观题立即出分，主观题由 AI 异步批改，全部题目将自动归档至历史习题。<br>
                ${done < paper.questions.length ? '<span style="color:var(--danger)">尚有题目未作答，未作答将按错误处理。</span>' : ''}</p>`;
            openModal('submit-confirm');
        });
        $('#confirm-submit').addEventListener('click', () => {
            closeModal('submit-confirm');
            submitPaper();
        });
    }

    /* ---------------- 真实 PDF 渲染钩子（后端就绪后启用） ----------------
       paper.pdfUrl 由后端返回时，PDF.js 会把试卷逐页绘制到 canvas；
       勾选框 / 输入框坐标由后端字段标注下发，叠加到 .widget-layer。
    ------------------------------------------------ */
    async function tryRenderRealPdf() {
        if (!paper.pdfUrl || !window.pdfjsLib) return false;
        try {
            pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            const pdf = await pdfjsLib.getDocument(paper.pdfUrl).promise;
            // 真实接入时在此按页 getViewport + render，并叠加控件层
            console.info('PDF.js 已加载，共', pdf.numPages, '页');
            return true;
        } catch (err) { console.warn('真实 PDF 渲染失败，回退内置版式', err); return false; }
    }

    /* ---------------- 初始化 ---------------- */
    async function init() {
        bindToolbar();
        bindAnswer();
        initLayout();
        renderPaper();
        // 按试卷区宽度自动适应，保证整张 A4 卷完整可见、不被裁切
        // （DOMContentLoaded 时布局已成型，直接计算；load / 延时作兜底校准）
        fitWidth();
        window.addEventListener('load', fitWidth);
        setTimeout(fitWidth, 300);
        if (await tryRenderRealPdf()) { /* 后端模式：真实 PDF 已渲染 */ }

        const restored = restoreDraft();
        if (resumeName && !restored) {
            toast('该未完成试卷的保存已不存在（可能已交卷或被删除），已为你载入当前试卷', 'warn');
            history.replaceState(null, '', 'exam.html');
        }
        $('#timer-text').textContent = fmt(elapsed);
        $('#start-desc').innerHTML =
            `试卷：<b>${esc(paper.name)}</b>（${subjectName(paper.subject)}），共 <b>${paper.questions.length}</b> 题。<br>` +
            (restored ? `✅ 已恢复你上次未完成的作答与计时（${fmt(elapsed)}）。<br>` : '') +
            `支持页面任意位置手写草稿演算，作答数据实时上传，交卷后 AI 自动批改并归档历史习题。`;
        $('#start-title').textContent = restored ? '继续上次作答' : '试卷已就绪';
        $('#start-btn').textContent = restored ? '继续作答（恢复计时）' : '开始作答（启动计时）';
    }

    document.addEventListener('DOMContentLoaded', init);
})();
