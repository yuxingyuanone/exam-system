/* ============================================================
   首页：组卷参数收集 + 双 Agent 流水线模拟调度
   ============================================================ */
(function () {
    'use strict';
    const { $, $$, esc, toast, openModal, closeModal, today, delay, subjectName } = UI;

    /* 欢迎语用户名：有昵称显示昵称，否则显示当前登录账号 */
    (function fillHeroName() {
        const el = document.getElementById('hero-uname');
        if (!el) return;
        const u = localStorage.getItem('aigame_user') || '';
        el.textContent = localStorage.getItem('aigame_nickname_' + u) || u;
    })();

    /* ---------------- AI 待生成题库（流水线“生成”的新题毛坯） ---------------- */
    const GEN_POOL = {
        CALC: {
            0: [{
                chapter: '第一章 函数与极限', points: ['重要极限'], difficulty: 2,
                stem: '极限 lim(x→0) (1 − cos x) / x² 的值为（ ）',
                options: ['A. 1/4', 'B. 1/2', 'C. 1', 'D. 2'], answer: 'B',
                stepsA: { score: 0, text: '1−cos x ~ x²/2（x→0），故极限 = 1/2，选 B。' },
                stepsB: { score: 0, text: '洛必达两次或三角恒等变换：(1−cos x)/x² = 2sin²(x/2)/x² → 1/2。' }
            }],
            1: [{
                chapter: '第二章 导数与微分', points: ['复合函数求导'], difficulty: 3,
                stem: '设 y = x³ · sin x，则 y′ = ______ 。',
                options: [], answer: '3x² sin x + x³ cos x',
                stepsA: { score: 0, text: '乘积法则：(uv)′=u′v+uv′，得 3x²sin x + x³cos x。' },
                stepsB: { score: 0, text: '分别对幂函数与正弦函数求导后按乘积法则合并。' }
            }],
            2: [{
                chapter: '第四章 不定积分', points: ['分部积分'], difficulty: 3,
                stem: '计算不定积分：∫ ln x dx。',
                options: [], answer: 'x ln x − x + C',
                stepsA: { score: 0, text: '令 u=ln x，dv=dx，分部积分得 xlnx − ∫1 dx = xlnx − x + C。' },
                stepsB: { score: 0, text: '分部积分后剩余积分 ∫1 dx = x，回代即得。' }
            }]
        },
        DISC: {
            0: [{
                chapter: '第二章 命题逻辑', points: ['命题公式'], difficulty: 2,
                stem: '蕴含式 p → q 与下列命题公式等值的是（ ）',
                options: ['A. p ∧ q', 'B. ¬p ∨ q', 'C. ¬p ∧ q', 'D. p ∨ ¬q'], answer: 'B',
                stepsA: { score: 0, text: '蕴含等值式：p→q ≡ ¬p∨q，选 B。' },
                stepsB: { score: 0, text: '列真值表，p→q 仅在 p=1,q=0 时为假，与 ¬p∨q 完全一致。' }
            }],
            1: [{
                chapter: '第四章 图论基础', points: ['树'], difficulty: 2,
                stem: '一棵含有 n 个顶点的无向树，其边数为 ______ 。',
                options: [], answer: 'n − 1',
                stepsA: { score: 0, text: '树的等价定义：连通且边数 = 顶点数 − 1。' },
                stepsB: { score: 0, text: '树无环，每加一条边连通一个新顶点，故 n 个顶点需 n−1 条边。' }
            }],
            2: [{
                chapter: '第二章 命题逻辑', points: ['主范式'], difficulty: 4,
                stem: '用真值表法求命题公式 (p ∧ q) → r 的主析取范式（写成极小项之和的形式）。',
                options: [], answer: 'm₁∨m₃∨m₄∨m₅∨m₇（即 ¬p¬qr ∨ ¬pqr ∨ p¬q¬r ∨ p¬qr ∨ pqr）',
                stepsA: { score: 0, text: '列出 8 行真值表，公式仅在 (1,1,0) 即 m₆ 处为假，对其余 7 个成真赋值对应极小项求和（m0 亦为真：前件为假蕴含恒真）。' },
                stepsB: { score: 0, text: 'p∧q→r ≡ ¬p∨¬q∨r，唯一成假赋值 110，主析取范式为除 m6 外全部极小项。' }
            }]
        },
        PHYS: {
            0: [{
                chapter: '第二章 牛顿定律', points: ['摩擦力分析'], difficulty: 2,
                stem: '在经典力学范围内，质点所受合外力 F、质量 m 与加速度 a 满足（ ）',
                options: ['A. F = m/a', 'B. F = ma', 'C. F = a/m', 'D. F = m + a'], answer: 'B',
                stepsA: { score: 0, text: '牛顿第二定律：合外力等于质量乘以加速度 F = ma，选 B。' },
                stepsB: { score: 0, text: '由动量定理 F=d(mv)/dt，质量恒定时退化为 F=ma。' }
            }],
            1: [{
                chapter: '第四章 刚体力学', points: ['转动惯量'], difficulty: 3,
                stem: '质量为 m、半径为 R 的匀质圆盘，绕通过圆心且垂直于盘面的轴转动，其转动惯量为 ______ 。',
                options: [], answer: '(1/2) mR²',
                stepsA: { score: 0, text: '圆盘转动惯量公式 I = ∫r²dm = (1/2)mR²。' },
                stepsB: { score: 0, text: '将圆盘分为细圆环积分，面密度 σ=m/(πR²)，积分得 mR²/2。' }
            }],
            2: [{
                chapter: '第二章 牛顿定律', points: ['摩擦力分析'], difficulty: 3,
                stem: '质量为 m 的物体从高度 h 的光滑斜面顶端由静止滑下，求物体到达斜面底端时的速度大小（重力加速度为 g）。',
                options: [], answer: 'v = √(2gh)',
                stepsA: { score: 0, text: '光滑斜面只有重力做功，机械能守恒：mgh = (1/2)mv²，解得 v=√(2gh)。' },
                stepsB: { score: 0, text: '沿斜面方向加速度 a=g sinθ，斜面长 s=h/sinθ，由 v²=2as 得 v²=2gh。' }
            }]
        }
    };

    /* ---------------- 页面状态 ---------------- */
    const state = {
        subject: 'DISC',
        difficulty: [],
        chapters: [],
        points: [],
        refReal: [],
        historyFilter: 'new',
        similarity: 'mid',
        imitateMode: 'only',
        mode: 'online',
        modelPlan: 'main'
    };

    function init() {
        // 学科下拉
        $('#subject').innerHTML = SEED.SUBJECTS
            .map(s => `<option value="${s.code}">${s.name}</option>`).join('');
        $('#subject').value = state.subject;
        $('#subject').addEventListener('change', e => {
            state.subject = e.target.value;
            state.chapters = []; state.points = []; state.refReal = [];
            renderChips();
            updateName();
        });

        renderChips();
        renderDifficulty();
        bindStatic();
        updateName();
        renderStats();
        renderDrafts();
        // 删除未完成试卷草稿（仅删当前账号自己的保存）
        $('#draft-list').addEventListener('click', e => {
            const btn = e.target.closest('.js-draft-del');
            if (!btn) return;
            const map = draftMap();
            delete map[btn.dataset.id];
            localStorage.setItem(DRAFTS_KEY, JSON.stringify(map));
            renderDrafts();
            toast('已删除该未完成试卷的保存进度');
        });
    }

    function renderDifficulty() {
        $('#difficulty').innerHTML = [1, 2, 3, 4, 5]
            .map(d => `<label class="chip"><input type="checkbox" value="${d}">${d} 级</label>`).join('');
    }

    function renderChips() {
        $('#chapters').innerHTML = (SEED.CHAPTERS[state.subject] || [])
            .map(c => `<label class="chip ${state.chapters.includes(c) ? 'on' : ''}"><input type="checkbox" value="${esc(c)}">${c}</label>`).join('')
            || '<span class="small muted">暂无章节</span>';
        $('#points').innerHTML = (SEED.POINTS[state.subject] || [])
            .map(p => `<label class="chip ${state.points.includes(p) ? 'on' : ''}"><input type="checkbox" value="${esc(p)}">${p}</label>`).join('');
        // 参考真题（仅当前学科）
        const realQs = Store.questions().filter(q => q.subject === state.subject && q.isReal === 1);
        $('#ref-real').innerHTML = realQs.length
            ? realQs.map(q => `<label class="chip ${state.refReal.includes(q.id) ? 'on' : ''}"><input type="checkbox" value="${q.id}">${q.id} · ${esc(q.stem.slice(0, 14))}…</label>`).join('')
            : '<span class="small muted">该学科暂无真题，可先到「真题库」录入</span>';
    }

    function bindStatic() {
        // chips 通用多选
        document.addEventListener('change', e => {
            const box = e.target.closest('.chips');
            if (!box || e.target.type !== 'checkbox') return;
            if (box.id === 'difficulty') {
                state.difficulty = $$('#difficulty input:checked').map(i => Number(i.value));
            } else if (box.id === 'chapters') {
                state.chapters = $$('#chapters input:checked').map(i => i.value);
            } else if (box.id === 'points') {
                state.points = $$('#points input:checked').map(i => i.value);
            } else if (box.id === 'ref-real') {
                state.refReal = $$('#ref-real input:checked').map(i => i.value);
            }
            e.target.closest('.chip').classList.toggle('on', e.target.checked);
        });

        // 分段选择器（单选组）
        document.addEventListener('click', e => {
            const card = e.target.closest('.seg-card');
            if (card && card.parentElement && card.parentElement.id === 'history-filter') {
                $$('#history-filter .seg-card').forEach(c => c.classList.remove('on'));
                card.classList.add('on');
                state.historyFilter = card.dataset.v;
            }
            if (card && card.parentElement && card.parentElement.id === 'similarity') {
                $$('#similarity .seg-card').forEach(c => c.classList.remove('on'));
                card.classList.add('on');
                state.similarity = card.dataset.v;
            }
            if (card && card.parentElement && card.parentElement.id === 'imitate-mode') {
                $$('#imitate-mode .seg-card').forEach(c => c.classList.remove('on'));
                card.classList.add('on');
                state.imitateMode = card.dataset.v;
            }
            const mc = e.target.closest('.mode-card');
            if (mc) {
                $$('.mode-card').forEach(c => c.classList.remove('on'));
                mc.classList.add('on');
                state.mode = mc.dataset.mode;
            }
            const col = e.target.closest('.collapse-head');
            if (col) col.parentElement.classList.toggle('open');
        });

        // 题量联动
        ['cnt-choice', 'cnt-blank', 'cnt-big'].forEach(id =>
            $('#' + id).addEventListener('input', () => {
                updateTotal();
                autoFillSources(false);
            }));
        $('#btn-auto-distribute').addEventListener('click', () => autoFillSources(true));

        // 模型方案
        document.addEventListener('change', e => {
            if (e.target.name === 'modelplan') {
                state.modelPlan = e.target.value;
                const cheap = state.modelPlan === 'cheap';
                $('#agent-a-model').textContent = cheap ? '豆包 API' : '智谱 GLM-4';
                $('#agent-b-model').textContent = cheap ? '硅基流动云 DeepSeek 蒸馏模型' : 'DeepSeek-R1';
            }
        });

        $('#btn-generate').addEventListener('click', startGenerate);
        $('#btn-enter').addEventListener('click', enterPaper);
    }

    function updateTotal() {
        const t = val('cnt-choice') + val('cnt-blank') + val('cnt-big');
        $('#cnt-total').value = t;
        return t;
    }
    function val(id) { return Math.max(0, parseInt($('#' + id).value, 10) || 0); }

    function autoFillSources(force) {
        const total = updateTotal();
        const s = id => val(id);
        const sum = s('src-stock') + s('src-imitated') + s('src-real');
        if (force || sum !== total) {
            $('#src-stock').value = total;
            $('#src-imitated').value = 0;
            $('#src-real').value = 0;
        }
        validateDist();
    }
    function validateDist() {
        const total = val('cnt-choice') + val('cnt-blank') + val('cnt-big');
        const sum = val('src-stock') + val('src-imitated') + val('src-real');
        const tip = $('#dist-tip');
        if (sum === total) { tip.textContent = '✓ 配比与总题量一致'; tip.style.color = 'var(--success)'; return true; }
        tip.textContent = `✗ 来源配比之和 ${sum} ≠ 总题量 ${total}`; tip.style.color = 'var(--danger)';
        return false;
    }

    function updateName() {
        $('#paper-name').textContent = Store.nextPaperName(subjectName(state.subject));
    }

    function renderStats() {
        $('#stat-total').textContent = Store.questions().length;
        $('#stat-history').textContent = Store.historyList().length;
        $('#stat-archive').textContent = Store.archives().length;
        $('#stat-deleted').textContent = Store.deletedIds().length;
    }

    /* ---------------- 未完成试卷（答题中途「保存退出」，按账号隔离） ---------------- */
    const DRAFTS_KEY = 'aigame_exam_drafts_' + Store.CURRENT_USER;
    function draftMap() {
        try { return JSON.parse(localStorage.getItem(DRAFTS_KEY)) || {}; }
        catch { return {}; }
    }
    function fmtElapsed(sec) {
        sec = sec || 0;
        const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
        const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
        return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    }
    function renderDrafts() {
        const list = Object.entries(draftMap())
            .map(([id, d]) => ({ id, d }))
            .sort((a, b) => (b.d.savedAt || '').localeCompare(a.d.savedAt || ''));
        const banner = $('#draft-banner');
        if (!list.length) { banner.hidden = true; return; }
        banner.hidden = false;
        $('#draft-list').innerHTML = list.map(({ id, d }) => {
            const answered = d.answeredCount != null ? d.answeredCount : Object.keys(d.answers || {}).length;
            const total = d.totalCount || (d.paper && d.paper.questions && d.paper.questions.length) || '—';
            const saved = d.savedAt ? '保存于 ' + new Date(d.savedAt).toLocaleString() : '历史自动保存';
            return `<div class="draft-item" data-name="${esc(d.paperName)}">
                <div class="di-main">
                    <div class="di-name">📄 ${esc(d.paperName)}</div>
                    <div class="di-meta">
                        <span class="di-sub">${esc(subjectName(d.subject) || '综合')}</span>
                        已答 <b>${answered}</b> / ${total} 题 · 用时 <b>${fmtElapsed(d.elapsed)}</b> · ${esc(saved)}
                    </div>
                </div>
                <div class="di-ops">
                    <a class="btn btn-primary btn-sm" href="exam.html?draft=${encodeURIComponent(id)}">继续作答</a>
                    <button type="button" class="btn btn-danger btn-sm js-draft-del" data-id="${esc(id)}">删除</button>
                </div>
            </div>`;
        }).join('');
    }

    /* ---------------- 组卷核心调度 ---------------- */
    let builtPaper = null;

    function gatherConfig() {
        const need = { 0: val('cnt-choice'), 1: val('cnt-blank'), 2: val('cnt-big') };
        const sources = { stock: val('src-stock'), imitated: val('src-imitated'), real: val('src-real') };
        return { need, sources };
    }

    function buildPaper() {
        const { need, sources } = gatherConfig();
        const subj = state.subject;
        const historyIds = Store.historyList(subj).map(e => e.id);

        // 题库候选池：按学科 / 章节 / 知识点 / 难度过滤，并应用历史习题筛选
        let pool = Store.questions().filter(q => {
            if (q.subject !== subj) return false;
            if (state.chapters.length && !state.chapters.includes(q.chapter)) return false;
            if (state.points.length && !q.points.some(p => state.points.includes(p))) return false;
            if (state.difficulty.length && !state.difficulty.includes(q.difficulty)) return false;
            if (state.historyFilter === 'new' && historyIds.includes(q.id)) return false;
            if (state.historyFilter === 'done' && !historyIds.includes(q.id)) return false;
            return true;
        }).sort((a, b) => (b.reputation || 0) - (a.reputation || 0)); // 高信誉分优先

        // 题型槽位：按来源配比顺序分配
        const slots = [];
        [0, 1, 2].forEach(t => { for (let i = 0; i < need[t]; i++) slots.push({ type: t, source: null }); });
        const order = [['stock', sources.stock], ['real', sources.real], ['imitated', sources.imitated]];
        let idx = 0;
        order.forEach(([src, cnt]) => { for (let i = 0; i < cnt && idx < slots.length; i++, idx++) slots[idx].source = src; });

        const picked = [];
        const genRequests = [];
        const usedPool = new Set();

        slots.forEach((slot, i) => {
            if (slot.source === 'imitated') { genRequests.push(i); return; }
            const wantReal = slot.source === 'real';
            const cand = pool.find(q => q.type === slot.type && (q.isReal === 1) === wantReal && !usedPool.has(q.id));
            if (cand) { usedPool.add(cand.id); picked.push({ slot: i, q: cand }); }
            else genRequests.push(i); // 存量不足，缺口转生成
        });

        // 生成缺口试题（仿造 / 原生新题）
        const generated = [];
        // 批量预分配板块序号，避免同批生成题共用序号（同题型时完整 ID 撞号）
        const seqAlloc = Store.allocSeqs(subj, genRequests.length);
        genRequests.forEach(i => {
            const t = slots[i].type;
            const tpl = (GEN_POOL[subj] && GEN_POOL[subj][t] && GEN_POOL[subj][t][0]) || null;
            if (!tpl) throw new Error('该题型在当前学科暂无可生成模板，请调整题量或来源配比');
            // 入库查重：同同学科同题型且题干完全一致的试题已在库 → 直接复用，不重复入库
            const deletedIds = Store.deletedIds();
            const existed = Store.questions(true).find(q =>
                q.subject === subj && q.type === t && q.stem === tpl.stem
                && !deletedIds.includes(q.id) && !usedPool.has(q.id));
            if (existed) { usedPool.add(existed.id); picked.push({ slot: i, q: existed }); return; }
            const refCands = state.refReal.length
                ? Store.questions(true).filter(q => state.refReal.includes(q.id) && q.subject === subj)
                : Store.questions().filter(q => q.subject === subj && q.isReal === 1);
            const ref = refCands.length ? refCands[Math.floor(Math.random() * refCands.length)] : null;
            const newId = Store.makeId(subj, 0, t, tpl.difficulty, seqAlloc.next().value);
            const q = {
                id: newId, subject: subj, seq: newId.split('-')[1], isReal: 0,
                type: t, difficulty: tpl.difficulty, chapter: tpl.chapter, points: tpl.points,
                stem: tpl.stem, options: tpl.options || [], answer: tpl.answer,
                stepsA: { ...tpl.stepsA, score: 0 }, stepsB: { ...tpl.stepsB, score: 0 },
                reputation: 0, generated: true, imitated: true,
                refRealId: ref ? ref.id : null, similarity: state.similarity
            };
            generated.push({ slot: i, q });
        });

        // 按槽位还原题号顺序
        const all = [...picked, ...generated].sort((a, b) => a.slot - b.slot).map(x => x.q);

        // 新题入库（已通过双 Agent 一致性比对）
        if (generated.length) Store.addQuestions(generated.map(g => g.q));

        const name = Store.nextPaperName(subjectName(subj));
        return {
            uid: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            name, subject: subj, mode: state.mode,
            modelPlan: state.modelPlan, similarity: state.similarity,
            questions: all,
            generatedCount: generated.length,
            stockCount: picked.length,
            imitateRules: $$('#imitate-rules input:checked').map(i => i.value)
        };
    }

    /* ---------------- 流水线动画 ---------------- */
    async function startGenerate() {
        if (!validateDist()) { toast('来源配比之和必须等于总题量', 'error'); return; }
        if (updateTotal() === 0) { toast('试卷总题量不能为 0', 'error'); return; }
        let paper;
        try { paper = buildPaper(); } catch (err) { toast(err.message, 'error'); return; }
        builtPaper = paper;

        openModal('pipeline-modal');
        $('#btn-enter').disabled = true;
        $$('#pipeline-steps .step-v').forEach(s => s.classList.remove('done', 'active', 'fail'));
        const log = $('#pipeline-log');
        log.innerHTML = '';
        const put = (msg, cls = '') => {
            const line = document.createElement('div');
            line.className = cls;
            line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            log.appendChild(line);
            log.scrollTop = log.scrollHeight;
        };
        const setStep = (i, cls) => {
            const s = $(`#pipeline-steps .step-v[data-step="${i}"]`);
            s.classList.remove('active'); s.classList.add(cls);
        };

        const cheap = state.modelPlan === 'cheap';
        const aName = cheap ? '豆包 API' : '智谱 GLM-4';
        const bName = cheap ? '硅基流动云' : 'DeepSeek-R1';
        $('#pipeline-summary').innerHTML =
            `试卷 <b>${esc(paper.name)}</b> · ${subjectName(paper.subject)} · 共 <b>${paper.questions.length}</b> 题` +
            `（题库调取 ${paper.stockCount}，双 Agent 新生成 ${paper.generatedCount}）· 模式：${paper.mode === 'online' ? '网页在线作答' : '静态打印导出'}`;

        // 1 题库调度
        setStep(0, 'active');
        put(`开始检索 ${subjectName(paper.subject)} 存量试题，按信誉分降序调度…`, 'log-info');
        await delay(900);
        put(`题库命中 ${paper.stockCount} 道；存量缺口 ${paper.generatedCount} 道，自动启动双 Agent 生成流水线`, 'log-warn');
        setStep(0, 'done');

        // 2 出题
        if (paper.generatedCount > 0) {
            setStep(1, 'active');
            put(`出题 Agent（${aName}）读取知识库，开始原生出题…`, 'log-info');
            if (paper.similarity) {
                const simMap = { low: '低', mid: '中', high: '高' };
                put(`仿造模式：拆解参考真题特征（题型 / 知识点 / 陷阱 / 采分点 / 解题框架），相似度档位：${simMap[paper.similarity]}`);
                if (paper.imitateRules.length) put(`仿造约束已应用：${paper.imitateRules.map(r => ({ number: '更换数字', scene: '更换场景', angle: '更换提问角度' })[r]).join('、')}`);
            }
            await delay(1300);
            put(`出题 Agent 输出 ${paper.generatedCount} 道完整试题（题干 / 选项 / 标准答案 / 步骤 A）`, 'log-ok');
            setStep(1, 'done');

            // 3 隔离
            setStep(2, 'active');
            const choiceCnt = paper.questions.filter(q => q.type === 0 && q.generated).length;
            put('系统隔离预处理：已屏蔽出题端全部参考答案');
            if (choiceCnt) put(`其中 ${choiceCnt} 道选择题已剔除全部选项，仅将纯题干下发校验端，防止选项诱导`, 'log-warn');
            await delay(900);
            setStep(2, 'done');

            // 4 校验
            setStep(3, 'active');
            put(`校验 Agent（${bName}）独立推演中，未接触出题端答案…`, 'log-info');
            await delay(1300);
            setStep(3, 'done');

            // 5 比对（演示：生成 ≥2 道时废弃 1 道并重生成）
            setStep(4, 'active');
            let discarded = 0;
            if (paper.generatedCount >= 2) {
                discarded = 1;
                put('检测到 1 道试题双方最终答案不一致（支持一题多解，仍不一致）→ 直接废弃，不入库、不入卷', 'log-err');
                await delay(800);
                put('出题 Agent 重新生成 1 道替补试题，再次隔离校验…', 'log-warn');
                await delay(1000);
            }
            put(`答案一致性比对完成：入库 ${paper.generatedCount - discarded + paper.stockCount} 道，废弃 ${discarded} 道`, 'log-ok');
            setStep(4, 'done');
        } else {
            setStep(1, 'done'); setStep(2, 'done'); setStep(3, 'done'); setStep(4, 'done');
            put('存量试题充足，全部直接调取，无需调用生成流水线', 'log-ok');
        }

        // 6 查重
        setStep(5, 'active');
        if (paper.generatedCount) put('仿造查重：与参考真题最高相似度 62%（阈值 80%），通过');
        put('组卷内部查重：同卷无高度相似题干、无同类型重复题，通过', 'log-ok');
        await delay(800);
        setStep(5, 'done');

        put('组卷完成 ✓', 'log-ok');
        $('#btn-enter').disabled = false;
        $('#btn-enter').textContent = paper.mode === 'online' ? '完成，开始在线作答 →' : '完成，导出静态试卷 →';
        renderStats();
        updateName();
    }

    function enterPaper() {
        if (!builtPaper) return;
        Store.setCurrentPaper(builtPaper);
        if (builtPaper.mode === 'online') {
            location.href = 'exam.html';
        } else {
            // 打印导出：题目以初始信誉分 0 入库（生成的新题已入库），并留存试卷存档
            const rec = Store.addArchive(builtPaper);
            Store.clearCurrentPaper();
            location.href = 'archives.html?new=' + encodeURIComponent(rec.id);
        }
    }

    document.addEventListener('input', e => {
        if (['src-stock', 'src-imitated', 'src-real'].includes(e.target.id)) validateDist();
    });

    document.addEventListener('DOMContentLoaded', init);
})();
