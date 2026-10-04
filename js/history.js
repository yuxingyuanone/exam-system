/* 历史习题：双渠道归档浏览 + 两类反馈（题干错误 / 步骤错误）+ 双 Agent 复核扣分流程 */
(function () {
    'use strict';
    const { $, $$, esc, openModal, closeModal, toast, delay, typeBadge, sourceBadge, scoreHtml} = UI;

    let curSubject = '';
    let current = null; // { entry, q, subject }

    function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return Math.abs(h); }

    function init() {
        // 学科筛选 chips
        $('#subject-tabs').insertAdjacentHTML('beforeend',
            SEED.SUBJECTS.map(s => `<label class="chip" data-subject="${s.code}"><input type="radio" name="htab">${s.name}</label>`).join(''));
        document.addEventListener('click', e => {
            const chip = e.target.closest('#subject-tabs .chip');
            if (chip) {
                $$('#subject-tabs .chip').forEach(c => c.classList.remove('on'));
                chip.classList.add('on');
                curSubject = chip.dataset.subject;
                render();
            }
            const btn = e.target.closest('[data-detail]');
            if (btn) openDetail(btn.getAttribute('data-detail'), btn.getAttribute('data-subject'));
        });
        $('#f-source').addEventListener('input', render);
        $('#f-fb').addEventListener('input', render);
        render();
    }

    function entries() {
        const h = Store.history();
        const sj = curSubject;
        const src = $('#f-source').value, fb = $('#f-fb').value;
        let list = [];
        Object.keys(h).forEach(code => h[code].forEach(e => list.push({ ...e, subject: code })));
        if (sj) list = list.filter(e => e.subject === sj);
        if (src) list = list.filter(e => e.source === src);
        if (fb === 'none') list = list.filter(e => !e.feedbacks || (!e.feedbacks.stem && !e.feedbacks.stepA));
        if (fb === 'stem') list = list.filter(e => e.feedbacks && e.feedbacks.stem);
        if (fb === 'stepA') list = list.filter(e => e.feedbacks && e.feedbacks.stepA);
        return list.sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
    }

    function resultBadge(e) {
        if (e.correct === true) return '<span class="badge badge-green">答对</span>';
        if (e.correct === 'grading') return '<span class="badge badge-orange">AI 批改中</span>';
        if (e.correct === false) return '<span class="badge badge-red">答错 / 未答</span>';
        return '<span class="badge badge-gray">未批改</span>';
    }

    function render() {
        const list = entries();
        $('#history-empty').style.display = list.length ? 'none' : 'block';
        $('#history-list').innerHTML = list.map(e => {
            const q = Store.getQuestion(e.id);
            const fbs = e.feedbacks || {};
            const cls = e.source === 'print' ? 'print-src' : (e.correct === false ? 'wrong-q' : 'right-q');
            return `<div class="q-card ${cls}">
                <div class="q-card-head">
                    <span class="q-id" style="font-size:13px;color:var(--primary);font-weight:700;">${e.id}</span>
                    ${q ? typeBadge(q.type) : '<span class="badge badge-red">题目已净化</span>'}
                    ${q ? sourceBadge(q.isReal) : ''}
                    ${resultBadge(e)}
                    <span class="badge ${e.source === 'print' ? 'badge-orange' : 'badge-blue'}">${e.source === 'print' ? '🖨️ 线下打印存档' : '🖥️ 网页在线作答'}</span>
                    <div class="fb-tags">
                        ${fbs.stem ? '<span class="fb-done">已反馈：题干错误</span>' : ''}
                        ${fbs.stepA ? '<span class="fb-done step">已反馈：步骤错误</span>' : ''}
                    </div>
                </div>
                <div class="q-card-stem">${q ? esc(q.stem) : '<span class="muted">该题目本体信誉分已 ≤ -10，被系统永久删除（历史记录保留题目 ID）</span>'}</div>
                <div class="q-card-foot">
                    <span>完成时间：${e.doneAt}</span>
                    <span class="sep">|</span>
                    <span>所属试卷：${esc(e.paperName || '—')}</span>
                    <span style="margin-left:auto;">
                        <button class="btn btn-sm btn-primary" data-detail="${e.id}" data-subject="${e.subject}">查看 / 反馈错误</button>
                    </span>
                </div>
            </div>`;
        }).join('');
    }

    /* ---------------- 详情 + 反馈入口 ---------------- */
    function openDetail(id, subject) {
        const entry = Store.getEntry(subject, id);
        const q = Store.getQuestion(id);
        if (!entry) { toast('未找到该历史记录', 'error'); return; }
        current = { entry, q, subject };
        renderDetail();
        openModal('detail-modal');
    }

    function stemVerdictHtml(f) {
        const map = v => v === 'error'
            ? '<b style="color:var(--danger);">判定题干存在错误 ✗</b>'
            : '<b style="color:var(--success);">判定题干无误 ✓</b>';
        let rounds = '';
        if (f.rounds) {
            rounds = `<div class="mt8">二次复核 4 次独立判断结果：
                <div class="rounds">${f.rounds.map((r, i) => `<span class="round-chip ${r ? 'bad' : 'good'}">第${i + 1}次：${r ? '有问题' : '无误'}</span>`).join('')}</div>
                <div class="small muted">判错 ${f.badCount} 次：${f.ruleText}</div>
            </div>`;
        }
        const qNow = Store.getQuestion(current.q ? current.q.id : current.entry.id);
        return `<div class="verdict-panel deduct">
            🎯 <b>题干错误反馈处理完成</b><br>
            <div class="agent-judge">
                <div class="aj-box ${f.a === 'error' ? 'err' : 'ok'}"><div class="aj-t">出题 Agent（GLM-4 侧）</div><div class="aj-r">${map(f.a)}</div></div>
                <div class="aj-box ${f.b === 'error' ? 'err' : 'ok'}"><div class="aj-t">校验 Agent（DeepSeek-R1 侧 · 独立复核）</div><div class="aj-r">${map(f.b)}</div></div>
            </div>
            ${rounds}
            <div>你指出的问题：${esc(f.desc)}</div>
            <div style="margin-top:6px;">题目本体信誉分变动：<b style="font-size:16px;">${f.delta}</b> 分　|　当前本体信誉分：${qNow ? scoreHtml(qNow.reputation || 0) : '—'}</div>
            <div class="small mt8">🚫 同一用户同一题目此类反馈仅生效一次，已关闭再次反馈入口。</div>
        </div>`;
    }

    function stepVerdictHtml(f) {
        const qId = current.q ? current.q.id : current.entry.id;
        const qNow = Store.getQuestion(qId);
        return `<div class="verdict-panel ${f.bodyDelta > 0 ? 'gain' : 'deduct'}">
            📘 <b>解题步骤错误反馈处理完成</b><br>
            1. 出题端解题步骤 A 信用分：<b style="color:#7048d8;">${f.stepDelta} 分</b>（当前 ${qNow ? qNow.stepsA.score : '—'} 分，仅影响步骤层，不影响题目本体）<br>
            2. 作答结束自动触发双 Agent 二次复核：双方独立推演答案<b>${f.review === 'agree' ? '一致' : '不一致'}</b>，
            题目本体信誉分 <b>${f.bodyDelta > 0 ? '+' : ''}${f.bodyDelta}</b> 分（当前 ${qNow ? scoreHtml(qNow.reputation || 0) : '—'}）<br>
            <div class="small mt8">你指出的步骤问题：${esc(f.desc)}</div>
            <div class="small mt8">🚫 同一用户同一题目步骤反馈仅生效一次。校验端步骤 B 始终仅后台留存。</div>
        </div>`;
    }

    function renderDetail() {
        if (!current || !current.entry) { closeModal('detail-modal'); return; }
        const { entry, q } = current;
        const fbs = entry.feedbacks || {};
        const deleted = q && Store.deletedIds().includes(q.id);

        $('#detail-body').innerHTML = `
            <div class="q-card-head mb8">
                <span style="font-family:Consolas,monospace;font-size:14px;color:var(--primary);font-weight:700;">${entry.id}</span>
                ${q ? typeBadge(q.type) : ''} ${q ? sourceBadge(q.isReal) : ''}
                ${resultBadge(entry)}
                <span class="badge ${entry.source === 'print' ? 'badge-orange' : 'badge-blue'}">${entry.source === 'print' ? '线下打印存档题（反馈同样触发双 Agent 复核）' : '网页在线作答题'}</span>
                ${deleted ? '<span class="badge badge-red">已永久净化删除</span>' : ''}
            </div>

            ${q ? `
            <div class="mb16" style="font-size:14px;line-height:2;">
                <div><b>题干：</b>${esc(q.stem)}</div>
                ${q.options.length ? `<div style="margin-left:20px;margin-top:6px;">${q.options.map(o => `<div>${esc(o)}</div>`).join('')}</div>` : ''}
            </div>
            <div class="form-grid mb16">
                <div style="background:#f7f9fc;border-radius:10px;padding:10px 14px;font-size:13px;">
                    <span class="muted">你的作答：</span>${entry.correct === true ? '✅ ' : entry.correct === false ? '❌ ' : ''}${esc(entry.userAnswer || '未作答')}
                </div>
                <div style="background:var(--success-bg);border-radius:10px;padding:10px 14px;font-size:13px;">
                    <span class="muted">标准答案：</span><b>${esc(q.answer)}</b>
                </div>
            </div>

            <div class="card-title" style="font-size:14px;">📘 出题端解题步骤 A（对学生展示 · 当前步骤信用分 ${q.stepsA.score}）</div>
            <div style="background:#f7f9fc;border-radius:10px;padding:12px 16px;font-size:13px;line-height:1.9;margin-bottom:8px;">${esc(q.stepsA.text)}</div>
            <div class="small muted mb16">※ 校验端解题步骤 B 仅后台存储，用于统计双模型偏差、优化提示词与模型搭配，不对学生展示。</div>
            ` : '<div class="verdict-panel neutral mb16">该题已被系统永久删除，仅可查看历史反馈处理结果。</div>'}

            <div class="card-title" style="font-size:14px;">统一反馈入口</div>
            <div id="fb-stem-slot">
                ${fbs.stem ? stemVerdictHtml(fbs.stem) : (q && !deleted) ? `
                <div class="aj-box mb16">
                    <div class="aj-t">🎯 反馈类型一：题干 / 标准答案错误</div>
                    <div class="small muted mb8">例如：题干条件矛盾、选项有误、标准答案错误。提交后由双 Agent 分别独立判断，单次浮动 −1.5 ~ −0.5 分。</div>
                    <textarea id="fb-stem-desc" style="min-height:64px;" placeholder="请具体指出题干或标准答案的错误之处（必填）…"></textarea>
                    <div class="mt8"><button class="btn btn-danger btn-sm" id="fb-stem-submit">提交题干错误反馈</button></div>
                </div>` : ''}
            </div>
            <div id="fb-step-slot">
                ${fbs.stepA ? stepVerdictHtml(fbs.stepA) : (q && !deleted) ? `
                <div class="aj-box">
                    <div class="aj-t">📘 反馈类型二：解题步骤 A 推导错误</div>
                    <div class="small muted mb8">步骤扣分独立于题目本体分，不会因解析瑕疵误删优质试题。请先仔细浏览上方步骤 A。</div>
                    <div class="flex">
                        <button class="btn btn-sm" id="fb-step-misjudge">我仔细看过了，是我自己误判（退出不扣分）</button>
                        <button class="btn btn-sm" style="color:#7048d8;border-color:#cbb6f2;" id="fb-step-open">步骤确有错误，我要反馈</button>
                    </div>
                    <div id="fb-step-form" style="display:none;" class="mt16">
                        <textarea id="fb-step-desc" style="min-height:64px;" placeholder="请指出步骤 A 中具体的逻辑、公式或计算错误…"></textarea>
                        <div class="mt8"><button class="btn btn-sm btn-success" id="fb-step-submit">确认提交步骤错误反馈</button></div>
                    </div>
                </div>` : ''}
            </div>
        `;

        // 绑定入口
        const stemBtn = $('#fb-stem-submit');
        if (stemBtn) stemBtn.addEventListener('click', submitStemFeedback);
        const misBtn = $('#fb-step-misjudge');
        if (misBtn) misBtn.addEventListener('click', () => {
            $('#fb-step-form').style.display = 'none';
            toast('已按误判处理退出，步骤信用分未扣减', 'success');
        });
        const openStep = $('#fb-step-open');
        if (openStep) openStep.addEventListener('click', () => { $('#fb-step-form').style.display = 'block'; });
        const stepBtn = $('#fb-step-submit');
        if (stepBtn) stepBtn.addEventListener('click', submitStepFeedback);
    }

    function reloadCurrentEntry() {
        const fresh = Store.getEntry(current.subject, current.entry.id);
        if (fresh) current.entry = fresh;   // 查不到时保留旧引用，避免覆写为 undefined
        if (current.q) {
            const qq = Store.getQuestion(current.q.id);
            if (qq) current.q = qq;
        }
    }

    /* ---------------- 反馈一：题干错误 ---------------- */
    async function submitStemFeedback() {
        if (!current || !current.entry || !current.q) return;
        const desc = $('#fb-stem-desc').value.trim();
        if (!desc) { toast('请具体描述题干 / 标准答案的错误之处', 'error'); return; }
        const q = current.q;
        const h0 = hash(q.id + '|' + desc);
        const mode = h0 % 4;                 // 0双方判错 1双方判对 2/3分歧
        const a = mode === 0 ? 'error' : mode === 1 ? 'ok' : (h0 % 2 ? 'error' : 'ok');
        const b = mode === 0 ? 'error' : mode === 1 ? 'ok' : (a === 'error' ? 'ok' : 'error');

        // 先渲染判定过程
        $('#fb-stem-slot').innerHTML = `
            <div class="aj-box mb16">
                <div class="aj-t">🎯 题干错误反馈 · 双 Agent 独立判断中 <span class="spinner dark"></span></div>
                <div class="small muted mb8">反馈内容：${esc(desc)}</div>
                <div class="agent-judge" id="stem-a" style="opacity:.5;">
                    <div class="aj-box"><div class="aj-t">出题 Agent（GLM-4 侧）</div><div class="aj-r">判断中…</div></div>
                    <div class="aj-box"><div class="aj-t">校验 Agent（DeepSeek-R1 侧）</div><div class="aj-r">题干已隔离选项与原答案，独立判断中…</div></div>
                </div>
                <div id="stem-next"></div>
            </div>`;

        await delay(1300);
        const boxCls = v => v === 'error' ? 'err' : 'ok';
        const txt = v => v === 'error' ? '判定题干存在错误 ✗' : '判定题干无误 ✓';
        $('#stem-a').style.opacity = '1';
        $('#stem-a').innerHTML = `
            <div class="aj-box ${boxCls(a)}"><div class="aj-t">出题 Agent（GLM-4 侧）</div><div class="aj-r">${txt(a)}</div></div>
            <div class="aj-box ${boxCls(b)}"><div class="aj-t">校验 Agent（DeepSeek-R1 侧）</div><div class="aj-r">${txt(b)}</div></div>`;

        let payload;
        if (a === 'error' && b === 'error') {
            payload = { desc, a, b, delta: -1.5, ruleText: '双方均判有错，总扣 1.5 分，不再二次复核' };
            $('#stem-next').innerHTML = '<div class="verdict-panel deduct mt8">双方均判定题干存在错误 → 题目本体信誉分 <b>−1.5</b>，不再二次复核。</div>';
        } else if (a === 'ok' && b === 'ok') {
            payload = { desc, a, b, delta: -0.5, ruleText: '双方均判定正确，总扣 0.5 分，不再二次复核' };
            $('#stem-next').innerHTML = '<div class="verdict-panel neutral mt8">双方均判定题干无误 → 按误反馈处理，题目本体信誉分 <b>−0.5</b>，不再二次复核。</div>';
        } else {
            // 分歧 → 二次复核 4 次判断
            $('#stem-next').innerHTML = `
                <div class="verdict-panel neutral mt8">
                    ⚖️ 双方判断不一致，自动启动<b>二次复核</b>，共 4 次独立判断…
                    <div class="rounds mt8" id="stem-rounds"></div>
                    <div id="stem-round-result" class="mt8 small"></div>
                </div>`;
            const rounds = [0, 1, 2, 3].map(i => hash(q.id + '|' + desc + '|round' + i) % 2 === 0);
            await delay(500);
            for (let i = 0; i < 4; i++) {
                await delay(650);
                $('#stem-rounds').insertAdjacentHTML('beforeend',
                    `<span class="round-chip ${rounds[i] ? 'bad' : 'good'}">第${i + 1}次：${rounds[i] ? '有问题' : '无误'}</span>`);
            }
            const badCount = rounds.filter(Boolean).length;
            let delta, ruleText;
            if (badCount >= 3) { delta = -1.5; ruleText = `4 次中 ${badCount} 次判定有问题（≥3），扣 1.5 分`; }
            else if (badCount <= 1) { delta = -0.5; ruleText = `4 次中仅 ${badCount} 次判定有问题（≤1），扣 0.5 分`; }
            else { delta = -1; ruleText = `4 次中 ${badCount} 次判定有问题（2 次），扣 1 分`; }
            payload = { desc, a, b, rounds, badCount, delta, ruleText };
            $('#stem-round-result').innerHTML = `复核完成：${ruleText} → 题目本体信誉分 <b>${delta}</b>。`;
        }

        // 落库：防刷分（仅生效一次）+ 信誉分变动
        if (Store.addFeedback(current.subject, q.id, 'stem', payload)) {
            Store.changeReputation(q.id, payload.delta);
        }
        await delay(700);
        reloadCurrentEntry();
        renderDetail();
        render();
        toast('题干反馈处理完成，信誉分已更新', 'success');
    }

    /* ---------------- 反馈二：步骤错误 ---------------- */
    async function submitStepFeedback() {
        if (!current || !current.entry || !current.q) return;
        const desc = $('#fb-step-desc').value.trim();
        if (!desc) { toast('请具体描述步骤 A 的错误之处', 'error'); return; }
        const q = current.q;

        // 第一步：步骤信用分立即 -1
        Store.changeStepScore(q.id, 'A', -1);
        $('#fb-step-slot').innerHTML = `
            <div class="aj-box">
                <div class="aj-t">📘 步骤错误反馈处理中 <span class="spinner dark"></span></div>
                <div class="small mb8">反馈内容：${esc(desc)}</div>
                <div>1. 出题端解题步骤 A 信用分已 <b style="color:#7048d8;">−1</b>（不影响题目本体分）。</div>
                <div id="step-review" class="mt8 small muted">2. 作答结束自动触发双 Agent 二次复核，双方隔离后独立推演答案一致性…</div>
            </div>`;
        await delay(1500);
        const agree = hash(q.id + '|' + desc + '|review') % 2 === 0;
        const bodyDelta = agree ? 0.5 : -0.5;
        const payload = { desc, stepDelta: -1, review: agree ? 'agree' : 'disagree', bodyDelta };
        Store.addFeedback(current.subject, q.id, 'stepA', payload);
        Store.changeReputation(q.id, bodyDelta); // ≥10 时只扣不增规则由仓库自动执行

        $('#step-review').innerHTML = `2. 二次复核：双方独立推演答案<b>${agree ? '一致' : '不一致'}</b>
            → 题目本体信誉分 <b style="color:${agree ? 'var(--success)' : 'var(--danger)'};">${agree ? '+0.5' : '−0.5'}</b>。`;
        await delay(800);
        reloadCurrentEntry();
        renderDetail();
        render();
        toast('步骤反馈处理完成', 'success');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
