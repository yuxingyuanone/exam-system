/* 题库页：筛选浏览 + 三层信誉分展示 + 题目详情（步骤 B 仅后台留存） */
(function () {
    'use strict';
    const { $, esc, openModal, diffStars, typeBadge, sourceBadge, scoreHtml, subjectName } = UI;

    function init() {
        $('#f-subject').innerHTML = SEED.SUBJECTS.map(s => `<option value="${s.code}">${s.name}</option>`).join('');
        ['f-subject', 'f-type', 'f-diff', 'f-rep', 'f-kw', 'f-del'].forEach(id =>
            $('#' + id).addEventListener('input', render));
        $('#f-reset').addEventListener('click', () => {
            ['f-subject', 'f-type', 'f-diff', 'f-rep', 'f-kw'].forEach(id => $('#' + id).value = '');
            $('#f-del').checked = false;
            render();
        });
        document.addEventListener('click', e => {
            const b = e.target.closest('[data-detail]');
            if (b) showDetail(b.getAttribute('data-detail'));
        });
        renderStats();
        render();
    }

    function getFiltered() {
        const deletedIds = Store.deletedIds();
        let list = Store.questions($('#f-del').checked);
        const sj = $('#f-subject').value, tp = $('#f-type').value, df = $('#f-diff').value;
        const rp = $('#f-rep').value, kw = $('#f-kw').value.trim().toLowerCase();
        return list.filter(q => {
            if (sj && q.subject !== sj) return false;
            if (tp !== '' && String(q.type) !== tp) return false;
            if (df && String(q.difficulty) !== df) return false;
            if (rp === 'high' && (q.reputation || 0) < 10) return false;
            if (rp === 'low' && (q.reputation || 0) >= 0) return false;
            if (kw && !(q.stem.toLowerCase().includes(kw) || q.id.toLowerCase().includes(kw)
                || (q.points || []).join(',').toLowerCase().includes(kw))) return false;
            if (!$('#f-del').checked && deletedIds.includes(q.id)) return false;
            return true;
        });
    }

    function render() {
        const list = getFiltered();
        const deletedIds = Store.deletedIds();
        $('#list-count').textContent = `共 ${list.length} 道`;
        $('#bank-empty').style.display = list.length ? 'none' : 'block';

        $('#bank-tbody').innerHTML = list.map(q => {
            const del = deletedIds.includes(q.id);
            const rep = q.reputation || 0;
            const repTip = rep >= 10 ? 'title="已达10分，只扣不增"' : rep <= -10 ? 'title="≤-10，已永久删除"' : '';
            return `<tr ${del ? 'style="opacity:.55;"' : ''}>
                <td class="mono">${q.id}</td>
                <td>${subjectName(q.subject)}</td>
                <td class="stem-cell" title="${esc(q.stem)}">${esc(q.stem)}</td>
                <td>${typeBadge(q.type)}</td>
                <td>${diffStars(q.difficulty)}</td>
                <td>${(q.points || []).map(p => `<span class="badge badge-blue" style="margin:2px;">${p}</span>`).join('')}</td>
                <td ${repTip}>${scoreHtml(rep)}</td>
                <td class="score zero">${q.stepsA.score}</td>
                <td>${q.isReal ? '<span class="badge badge-green">真题(1)</span>' : '<span class="badge badge-gray">AI题(0)</span>'}</td>
                <td>${del ? '<span class="badge badge-red">已永久删除</span>'
                    : rep >= 10 ? '<span class="badge badge-orange">只扣不增</span>'
                    : rep < 0 ? '<span class="badge badge-red">低分预警</span>'
                    : '<span class="badge badge-green">正常调度</span>'}</td>
                <td><button class="btn btn-sm" data-detail="${q.id}">详情</button></td>
            </tr>`;
        }).join('');
    }

    function renderStats() {
        const all = Store.questions(true);
        $('#st-all').textContent = all.filter(q => !Store.deletedIds().includes(q.id)).length;
        $('#st-high').textContent = all.filter(q => (q.reputation || 0) >= 10).length;
        $('#st-low').textContent = all.filter(q => (q.reputation || 0) < 0 && !Store.deletedIds().includes(q.id)).length;
        $('#st-del').textContent = Store.deletedIds().length;
    }

    function showDetail(id) {
        const q = Store.getQuestion(id);
        if (!q) return;
        const del = Store.deletedIds().includes(id);
        $('#detail-body').innerHTML = `
            <div class="q-card-head mb8">
                <span class="mono" style="font-size:13px;color:var(--primary);">${q.id}</span>
                ${typeBadge(q.type)}${sourceBadge(q.isReal)}
                <span class="badge badge-orange">难度 ${q.difficulty} 级</span>
                ${del ? '<span class="badge badge-red">该题已因信誉分 ≤-10 被系统永久删除</span>' : ''}
            </div>
            <div class="mb16"><span class="muted small">所属章节：${esc(q.chapter)}　|　知识点：${(q.points || []).join('、')}</span></div>

            <div class="card-title" style="font-size:14px;">题干内容</div>
            <div style="font-size:14px;line-height:2;margin-bottom:14px;">${esc(q.stem)}</div>
            ${q.options.length ? `<div style="margin-left:18px;line-height:2;margin-bottom:14px;">${q.options.map(o => `<div>${esc(o)}</div>`).join('')}</div>` : ''}
            <div style="margin-bottom:18px;">✅ <b>标准答案：</b>${esc(q.answer)}</div>

            <div class="card-title" style="font-size:14px;">三层信誉分</div>
            <table class="tbl mb16">
                <thead><tr><th>管控层</th><th>当前分值</th><th>规则</th></tr></thead>
                <tbody>
                    <tr><td>🎯 题目本体分</td><td>${scoreHtml(q.reputation || 0)}</td><td class="muted small">≥10 只扣不增；≤-10 永久删除</td></tr>
                    <tr><td>📘 解题步骤 A 分（对学生展示）</td><td class="score zero">${q.stepsA.score}</td><td class="muted small">步骤漏洞单独扣分，不影响题目本体</td></tr>
                    <tr><td>📗 解题步骤 B 分（仅后台）</td><td class="score zero">${q.stepsB.score}</td><td class="muted small">不对外展示，用于双模型偏差统计</td></tr>
                </tbody>
            </table>

            <div class="card-title" style="font-size:14px;">📘 出题端解题步骤 A（面向学生展示）</div>
            <div style="background:#f7f9fc;border-radius:10px;padding:12px 16px;font-size:13px;line-height:1.9;margin-bottom:16px;">${esc(q.stepsA.text)}</div>

            <div class="card-title" style="font-size:14px;">📗 校验端解题步骤 B <span class="sub">后台留存 · 不对学生展示 · 用于优化提示词与模型搭配</span></div>
            <div style="background:#f7f9fc;border-radius:10px;padding:12px 16px;font-size:13px;line-height:1.9;color:var(--text-2);">${esc(q.stepsB.text)}</div>
        `;
        openModal('detail-modal');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
