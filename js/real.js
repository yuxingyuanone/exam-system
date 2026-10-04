/* 真题库：浏览勾选组卷 + 三种录入渠道 + 仿造套卷模板 */
(function () {
    'use strict';
    const { $, $$, esc, toast, openModal, closeModal, delay, typeBadge, subjectName} = UI;
    const TPL_EXTRA = 'aigame_templates_extra_' + Store.CURRENT_USER;

    const selected = new Set();
    let imSimilarity = 'mid';
    let imSource = 'select'; // select | tpl

    function init() {
        ['#f-subject', '#text-subject'].forEach(s => {
            $(s).innerHTML = SEED.SUBJECTS.map(x => `<option value="${x.code}">${x.name}</option>`).join('');
        });
        $('#f-subject').addEventListener('input', renderList);
        $('#f-kw').addEventListener('input', renderList);

        // tabs
        $$('.tab').forEach(t => t.addEventListener('click', () => {
            $$('.tab').forEach(x => x.classList.remove('on'));
            t.classList.add('on');
            $('#tab-list').style.display = t.dataset.tab === 'list' ? 'block' : 'none';
            $('#tab-tpl').style.display = t.dataset.tab === 'tpl' ? 'block' : 'none';
            if (t.dataset.tab === 'tpl') renderTemplates();
        }));

        $('#btn-import-text').addEventListener('click', () => { $('#text-area').value = ''; $('#text-preview').innerHTML = ''; $('#text-result').textContent = ''; openModal('text-modal'); });
        $('#btn-import-doc').addEventListener('click', () => openDocModal());
        $('#btn-import-img').addEventListener('click', () => openImgModal());
        $('#btn-save-tpl').addEventListener('click', saveTemplate);
        $('#btn-paper-real').addEventListener('click', () => buildPaper(false));
        $('#btn-paper-mix').addEventListener('click', () => { imSource = 'select'; openModal('imitate-modal'); });
        $('#btn-sel-clear').addEventListener('click', () => { selected.clear(); renderList(); toggleBar(); });

        $('#text-parse').addEventListener('click', parseManualText);
        $('#text-confirm').addEventListener('click', confirmManual);
        $('#doc-confirm').addEventListener('click', confirmDoc);
        $('#img-confirm').addEventListener('click', confirmImg);
        $('#im-confirm').addEventListener('click', confirmImitate);

        // 相似度单选
        document.addEventListener('click', e => {
            const c = e.target.closest('#im-similarity .seg-card');
            if (c) { $$('#im-similarity .seg-card').forEach(x => x.classList.remove('on')); c.classList.add('on'); imSimilarity = c.dataset.v; }
        });

        // 上传区点击
        $('#doc-zone').addEventListener('click', () => $('#doc-file').click());
        $('#img-zone').addEventListener('click', () => $('#img-file').click());
        $('#doc-zone').addEventListener('dragover', e => { e.preventDefault(); $('#doc-zone').classList.add('drag'); });
        $('#doc-zone').addEventListener('dragleave', () => $('#doc-zone').classList.remove('drag'));
        $('#doc-zone').addEventListener('drop', e => { e.preventDefault(); $('#doc-zone').classList.remove('drag'); if (e.dataTransfer.files[0]) simulateDocParse(e.dataTransfer.files[0].name); });
        $('#doc-file').addEventListener('change', e => { if (e.target.files[0]) simulateDocParse(e.target.files[0].name); });
        $('#img-file').addEventListener('change', e => { if (e.target.files[0]) simulateImgOcr(e.target.files[0].name); });

        renderList();
    }

    /* ---------------- 真题列表 ---------------- */
    function renderList() {
        const sj = $('#f-subject').value;
        const kw = $('#f-kw').value.trim().toLowerCase();
        const list = Store.questions().filter(q => q.isReal === 1
            && (!sj || q.subject === sj)
            && (!kw || q.stem.toLowerCase().includes(kw) || q.id.toLowerCase().includes(kw)));

        $('#real-empty').style.display = list.length ? 'none' : 'block';
        $('#real-list').innerHTML = list.map(q => `
            <div class="q-card real">
                <div class="q-card-head">
                    <label class="flex" style="gap:7px;cursor:pointer;font-size:14px;font-weight:600;">
                        <input type="checkbox" style="width:15px;height:15px;" data-qid="${q.id}" ${selected.has(q.id) ? 'checked' : ''}>
                        ${q.id}
                    </label>
                    ${typeBadge(q.type)}
                    <span class="badge badge-green">真题原题</span>
                    <span class="badge badge-orange">难度 ${q.difficulty} 级</span>
                    <span class="q-id">${esc(q.chapter)} · ${(q.points || []).join('、')}</span>
                </div>
                <div class="q-card-stem">${esc(q.stem)}</div>
                ${q.options.length ? `<div class="small" style="margin-left:18px;line-height:1.9;">${q.options.map(o => esc(o)).join('　')}</div>` : ''}
                <div class="q-card-foot">
                    <span>✅ 标准答案：<b>${esc(q.answer)}</b></span>
                    <span class="sep">|</span>
                    <span>信誉分 ${q.reputation}</span>
                </div>
            </div>`).join('');

        $$('#real-list input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
            if (cb.checked) selected.add(cb.dataset.qid); else selected.delete(cb.dataset.qid);
            toggleBar();
        }));
        toggleBar();
    }
    function toggleBar() {
        $('#sel-count').textContent = selected.size;
        $('#action-bar').classList.toggle('show', selected.size > 0);
    }
    function selectedQuestions() { return Store.questions(true).filter(q => selected.has(q.id)); }

    /* ---------------- 组卷 ---------------- */
    function checkSubject(qs) {
        const subs = new Set(qs.map(q => q.subject));
        if (subs.size > 1) { toast('同一张试卷仅支持同一学科，请按学科分别选择', 'error'); return false; }
        return true;
    }
    function gotoPaper(questions, subject) {
        if (!questions.length) { toast('试卷题目为空', 'error'); return; }
        const paper = {
            name: Store.nextPaperName(subjectName(subject)),
            subject, mode: 'online', questions,
            source: 'real-select', similarity: imSimilarity
        };
        Store.setCurrentPaper(paper);
        location.href = 'exam.html';
    }
    function buildPaper(withImitate) {
        const qs = selectedQuestions();
        if (!qs.length) { toast('请先勾选真题', 'error'); return; }
        if (!checkSubject(qs)) return;
        if (!withImitate) { gotoPaper(qs, qs[0].subject); return; }
        openModal('imitate-modal');
    }
    function confirmImitate() {
        const reals = imSource === 'tpl' ? tplSelectedQs : selectedQuestions();
        if (!reals.length) { toast('请先选择真题', 'error'); return; }
        const subject = reals[0].subject;
        const n = Math.max(0, parseInt($('#im-count').value, 10) || 0);
        // 从同学科 AI 题库取变式题（演示：复用高信誉分 AI 题作为仿造变式，真实环境由仿造流水线新生成）
        const aiPool = Store.questions().filter(q => q.subject === subject && q.isReal === 0
            && !reals.some(r => r.id === q.id)).sort((a, b) => (b.reputation || 0) - (a.reputation || 0));
        const mixed = [];
        const used = new Set();
        reals.forEach(r => {
            mixed.push(r);
            for (let i = 0; i < n; i++) {
                const cand = aiPool.find(q => !used.has(q.id));
                if (cand) { used.add(cand.id); mixed.push({ ...cand, imitated: true }); }
            }
        });
        closeModal('imitate-modal');
        toast('仿造流水线完成：查重通过，已按' + ({ low: '低', mid: '中', high: '高' }[imSimilarity]) + '相似度组卷');
        gotoPaper(mixed, subject);
    }

    /* ---------------- 套卷模板 ---------------- */
    function templates() { return [...SEED.TEMPLATES, ...(JSON.parse(localStorage.getItem(TPL_EXTRA) || '[]'))]; }
    function saveTemplate() {
        const qs = selectedQuestions();
        if (!qs.length) { toast('请先勾选要保存为模板的真题', 'error'); return; }
        if (!checkSubject(qs)) return;
        const name = prompt('请输入套卷模板名称：', `${subjectName(qs[0].subject)}真题套卷_${new Date().toLocaleDateString()}`);
        if (!name) return;
        const extra = JSON.parse(localStorage.getItem(TPL_EXTRA) || '[]');
        extra.push({ id: 'tpl-' + Date.now(), name, subject: qs[0].subject, count: qs.length, source: '自选保存', createdAt: new Date().toISOString().slice(0, 10), ids: qs.map(q => q.id) });
        localStorage.setItem(TPL_EXTRA, JSON.stringify(extra));
        toast('套卷模板已保存，可在「真题套卷模板」中一键复用', 'success');
    }
    let tplSelectedQs = [];
    function renderTemplates() {
        $('#tpl-grid').innerHTML = templates().map(t => `
            <div class="tpl-card">
                <div class="tpl-name">📑 ${esc(t.name)}</div>
                <div class="tpl-meta">${subjectName(t.subject)} · ${t.count} 道真题 · 来源：${t.source} · ${t.createdAt}</div>
                <div class="flex">
                    <button class="btn btn-sm btn-primary" data-reuse="${t.id}">🚀 一键复用生成仿造模拟卷</button>
                    <button class="btn btn-sm" data-browse="${t.id}">查看模板真题</button>
                </div>
            </div>`).join('');
        $$('[data-reuse]').forEach(b => b.addEventListener('click', () => {
            const t = templates().find(x => x.id === b.dataset.reuse);
            const qs = t.ids
                ? Store.questions(true).filter(q => t.ids.includes(q.id))
                : Store.questions().filter(q => q.subject === t.subject && q.isReal === 1).slice(0, t.count);
            if (!qs.length) { toast('该模板下的真题已被净化删除，请重新选择', 'error'); return; }
            tplSelectedQs = qs;
            imSource = 'tpl';
            openModal('imitate-modal');
        }));
        $$('[data-browse]').forEach(b => b.addEventListener('click', () => {
            const t = templates().find(x => x.id === b.dataset.browse);
            $('#f-subject').value = t.subject;
            $$('.tab[data-tab="list"]')[0].click();
            renderList();
        }));
    }

    /* ---------------- 录入：行模型 ---------------- */
    function detectType(chunk) {
        if (/[A-D][\.．、]/.test(chunk)) return 0;
        if (/_{2,}|＿{2,}|_{3,}|填空/.test(chunk)) return 1;
        return 2;
    }
    function rowToQuestion(row, subject, chapter, seq) {
        const type = parseInt(row.type, 10);
        return {
            id: Store.makeId(subject, 1, type, parseInt(row.diff, 10), seq),
            subject, seq: '', isReal: 1,
            type, difficulty: parseInt(row.diff, 10) || 2,
            chapter: chapter || '手动录入', points: [],
            stem: row.stem.trim(),
            options: type === 0 && row.options
                ? row.options.map((t, i) => `${'ABCD'[i]}. ${t.trim()}`)
                : [],
            answer: (row.answer || '').trim(),
            stepsA: { score: 0, text: (row.analysis || '（手动录入真题，暂无解题步骤）').trim() },
            stepsB: { score: 0, text: '（手动录入真题，尚未经校验 Agent 推演）' },
            reputation: 0
        };
    }
    function rowComplete(r) { return r.stem && r.stem.trim() && r.answer && r.answer.trim(); }
    function previewRowsHtml(rows) {
        return `<thead><tr><th style="width:90px;">题型</th><th style="width:80px;">难度</th><th>题干</th><th style="width:150px;">答案</th><th style="width:180px;">解析</th><th style="width:70px;">状态</th></tr></thead>
        <tbody>${rows.map((r, i) => `
            <tr class="${rowComplete(r) ? '' : 'parse-row-warn'}">
                <td><select class="mini-select" data-r="${i}" data-k="type">
                    <option value="0" ${r.type === 0 ? 'selected' : ''}>选择</option>
                    <option value="1" ${r.type === 1 ? 'selected' : ''}>填空</option>
                    <option value="2" ${r.type === 2 ? 'selected' : ''}>大题</option>
                </select></td>
                <td><select class="mini-select" data-r="${i}" data-k="diff">
                    ${[1,2,3,4,5].map(d => `<option value="${d}" ${r.diff === d ? 'selected' : ''}>${d}级</option>`).join('')}
                </select></td>
                <td><input type="text" data-r="${i}" data-k="stem" value="${esc(r.stem)}" placeholder="题干（必填）"></td>
                <td><input type="text" data-r="${i}" data-k="answer" value="${esc(r.answer)}" placeholder="答案（必填）"></td>
                <td><input type="text" data-r="${i}" data-k="analysis" value="${esc(r.analysis)}"></td>
                <td>${rowComplete(r) ? '<span class="badge badge-green">已识别</span>' : '<span class="badge badge-orange">待补全</span>'}</td>
            </tr>`).join('')}</tbody>`;
    }
    function bindRowEdit(rows, tableEl, onChange) {
        tableEl.addEventListener('input', onEdit);
        tableEl.addEventListener('change', onEdit);
        function onEdit(e) {
            const t = e.target;
            if (!t.dataset.k) return;
            rows[+t.dataset.r][t.dataset.k] = t.value;
            if (onChange) onChange();
        }
    }

    /* ---------------- 手动文本录入 ---------------- */
    let manualRows = [];
    function parseManualText() {
        const text = $('#text-area').value;
        if (!text.trim()) { toast('请先粘贴真题内容', 'error'); return; }
        const chunks = text.split(/\n\s*\n+/).map(s => s.trim()).filter(Boolean);
        manualRows = chunks.map(c => {
            const answer = (c.match(/答案[:：]\s*(.+)/) || [, ''])[1];
            const analysis = (c.match(/解析[:：]\s*([\s\S]+)/) || [, ''])[1];
            let stem = c.replace(/答案[:：][\s\S]*/, '').replace(/解析[:：][\s\S]*/, '').trim();
            // 拆出 A-D 选项行（支持 A. / A、 / A) / A），同行或换行均可
            const options = [];
            const optRe = /([A-D])[\.．、)]\s*([^\n]*?)(?=\s*[A-D][\.．、)]|$)/gs;
            let m;
            const optPart = stem.match(/(?:^|\n)\s*A[\.．、)].*$/s);
            if (optPart) {
                const head = stem.slice(0, optPart.index).trim();
                const tail = stem.slice(optPart.index);
                while ((m = optRe.exec(tail)) !== null) options[m[1].charCodeAt(0) - 65] = m[2].trim();
                stem = head;
            }
            stem = stem.replace(/^\d+\s*[\.．、）)]\s*/, '').trim();
            return {
                type: detectType(c), diff: 2, stem,
                options: options.filter(Boolean),
                answer: answer.trim(), analysis: analysis.trim()
            };
        });
        $('#text-preview').innerHTML = previewRowsHtml(manualRows);
        const bad = manualRows.filter(r => !rowComplete(r)).length;
        $('#text-result').innerHTML = bad
            ? `<span style="color:var(--warning);">⚠ 自动分割为 ${manualRows.length} 道题，其中 ${bad} 道识别残缺，请在上方手动补全后再导入。</span>`
            : `<span style="color:var(--success);">✓ 自动分割为 ${manualRows.length} 道题，信息完整，可直接导入。</span>`;
    }
    function confirmManual() {
        if (!manualRows.length) { toast('请先点击「自动分割识别」', 'error'); return; }
        const bad = manualRows.filter(r => !rowComplete(r));
        if (bad.length) { toast(`还有 ${bad.length} 道残缺题未补全（题干 / 答案必填）`, 'error'); return; }
        const subject = $('#text-subject').value;
        const seqs = Store.allocSeqs(subject, manualRows.length);
        Store.addQuestions(manualRows.map(r => {
            const q = rowToQuestion(r, subject, null, seqs.next().value);
            q.seq = q.id.split('-')[1];
            return q;
        }));
        closeModal('text-modal');
        $('#f-subject').value = subject;
        renderList();
        toast(`成功导入 ${manualRows.length} 道真题至${subjectName(subject)}真题库`, 'success');
    }

    /* ---------------- 文档上传 ---------------- */
    let docRows = [];
    function openDocModal() {
        $('#doc-progress').style.display = 'none';
        $('#doc-result-wrap').style.display = 'none';
        $('#doc-confirm').disabled = true;
        $('#doc-file').value = '';
        openModal('doc-modal');
    }
    async function simulateDocParse(fileName) {
        $('#doc-progress').style.display = 'block';
        const steps = ['正在上传文档…', '解析文档版式…', '拆分题干与选项…', '提取答案与解析…'];
        for (let i = 0; i < steps.length; i++) {
            $('#doc-step').textContent = steps[i];
            $('#doc-pct').textContent = (i + 1) * 25 + '%';
            $('#doc-bar').style.width = (i + 1) * 25 + '%';
            await delay(380);
        }
        const sj = $('#f-subject').value;
        docRows = [
            { type: 0, diff: 3, stem: `（${esc(fileName)}）下列关系中，满足传递性的是（ ）`, options: ['朋友关系', '整数上的整除关系', '同学关系', '直线间的垂直关系'], answer: 'B', analysis: '逐项按传递定义验证，B 项恒满足。' },
            { type: 1, diff: 2, stem: '连通无向图中，边数与顶点数相等且恰含一个环的图称为 ______ 。', answer: '单圈图', analysis: '树的边数为 n−1，多一条边恰成一个环。' },
            { type: 2, diff: 4, stem: '', answer: '', analysis: '' } // 残缺题
        ];
        $('#doc-result-wrap').style.display = 'block';
        $('#doc-preview').innerHTML = previewRowsHtml(docRows);
        bindRowEdit(docRows, $('#doc-preview'), () => {
            $('#doc-confirm').disabled = docRows.some(r => !rowComplete(r));
        });
        toast('文档解析完成：1 道题识别残缺，请手动补全', 'warn');
    }
    function confirmDoc() {
        if (docRows.some(r => !rowComplete(r))) { toast('请先补全橙色残缺题', 'error'); return; }
        const subject = $('#f-subject').value;
        const seqs = Store.allocSeqs(subject, docRows.length);
        Store.addQuestions(docRows.map(r => { const q = rowToQuestion(r, subject, 'Word/TXT 导入', seqs.next().value); q.seq = q.id.split('-')[1]; return q; }));
        closeModal('doc-modal');
        renderList();
        toast(`文档真题导入成功（${docRows.length} 道）`, 'success');
    }

    /* ---------------- 图片 AI 识别 ---------------- */
    function openImgModal() {
        $('#img-steps').style.display = 'none';
        $('#img-word').style.display = 'none';
        $('#img-placeholder').style.display = 'block';
        $('#img-fig-note').style.display = 'none';
        $('#img-confirm').disabled = true;
        $('#img-word').value = '';
        $('#img-file').value = '';
        openModal('img-modal');
    }
    async function simulateImgOcr(fileName) {
        const wrap = $('#img-steps');
        wrap.style.display = 'block';
        const steps = ['图片上传与去噪', 'OCR 文字识别', '数学公式结构化识别', '几何图形识别与配图重建', '生成可编辑 Word 文档'];
        wrap.innerHTML = steps.map((s, i) => `<div class="step-v ${i === 0 ? 'active' : ''}" data-s="${i}"><div class="dot">${i + 1}</div><div class="line"></div><div class="st-body"><div class="st-t">${s}</div></div></div>`).join('');
        for (let i = 0; i < steps.length; i++) {
            const el = $(`[data-s="${i}"]`, wrap);
            await delay(520);
            el.classList.remove('active'); el.classList.add('done');
            const next = $(`[data-s="${i + 1}"]`, wrap);
            if (next) next.classList.add('active');
        }
        $('#img-word').style.display = 'block';
        $('#img-placeholder').style.display = 'none';
        $('#img-fig-note').style.display = 'block';
        $('#img-confirm').disabled = false;
        $('#img-word').value =
            `（图片识别来源：${fileName}）\n` +
            `1. 如图，在△ABC 中，DE 为 AB、AC 中点连线，若 BC = 8，则 DE = （ ）\n` +
            `【几何配图：△ABC 及中位线 DE，可点击替换 / 标注修改】\n` +
            `A. 2　B. 4　C. 6　D. 8\n` +
            `答案：B\n` +
            `解析：三角形中位线等于第三边的一半，DE = BC/2 = 4。`;
        toast('识别完成，已生成可编辑 Word 内容', 'success');
    }
    function confirmImg() {
        const text = $('#img-word').value;
        if (!text.trim()) { toast('识别内容为空', 'error'); return; }
        const answer = (text.match(/答案[:：]\s*(.+)/) || [, ''])[1].trim();
        const analysis = (text.match(/解析[:：]\s*([\s\S]+)/) || [, ''])[1].trim();
        const stem = text.split(/\n/).filter(l => /^\d+[.、]/.test(l.trim())).map(l => l.replace(/^\d+[.、]\s*/, '')).join(' ')
            || text.split('\n')[1] || text.slice(0, 60);
        const subject = $('#f-subject').value;
        const row = { type: detectType(text), diff: 3, stem: stem.replace(/【几何配图[\s\S]*?】/, '（题图见几何配图）'), answer, analysis };
        if (!row.answer) { toast('识别结果缺少答案，请在 Word 中补全', 'error'); return; }
        const q = rowToQuestion(row, subject, null, Store.allocSeqs(subject, 1).next().value);
        q.seq = q.id.split('-')[1]; q.chapter = '图片AI识别'; q.hasFigure = true;
        Store.addQuestions([q]);
        closeModal('img-modal');
        renderList();
        toast('图片真题已识别并导入（含几何配图标记）', 'success');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
