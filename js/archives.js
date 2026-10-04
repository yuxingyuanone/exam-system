/* 试卷存档：导出记录浏览、静态打印预览（真题1/仿造0标注）、批量加入历史、Word 导出 */
(function () {
    'use strict';
    const{$,$$,esc,openModal,toast,subjectName}=UI;

    let currentArc = null;

    function init() {
        render();
        // 从首页打印导出跳转过来：自动打开预览
        const params = new URLSearchParams(location.search);
        const newId = params.get('new');
        if (newId) {
            const arc = Store.archives().find(a => a.id === newId);
            if (arc) { openPrint(arc.id); history.replaceState(null, '', 'archives.html'); }
        }
        $('#btn-print-pdf').addEventListener('click', () => window.print());
        $('#btn-export-word').addEventListener('click', exportWord);
    }

    function render() {
        const list = Store.archives();
        const allIds = new Set();
        list.forEach(a => a.questionIds.forEach(id => allIds.add(id)));
        $('#st-arc').textContent = list.length;
        $('#st-q').textContent = allIds.size;
        $('#st-added').textContent = list.filter(a => a.addedToHistory).length;
        $('#st-pending').textContent = list.filter(a => !a.addedToHistory).length;
        $('#arc-empty').style.display = list.length ? 'none' : 'block';

        $('#archive-list').innerHTML = list.map(a => {
            const qs = a.questionIds.map(id => Store.getQuestion(id)).filter(Boolean);
            const realCnt = qs.filter(q => q.isReal === 1).length;
            return `<div class="archive-item">
                <div class="archive-head">
                    <span class="arc-name">📄 ${esc(a.name)}</span>
                    <span class="badge badge-blue">${subjectName(a.subject)}</span>
                    <span class="badge ${a.addedToHistory ? 'badge-green' : 'badge-orange'}">
                        ${a.addedToHistory ? '✅ 已全部加入历史习题' : '🕓 尚未加入历史习题'}
                    </span>
                </div>
                <div class="archive-meta">
                    <span>导出时间：${a.exportedAt}</span>
                    <span>共 ${a.questionIds.length} 题（真题 ${realCnt} · AI 题 ${qs.length - realCnt}）</span>
                    <span>标签：静态打印卷 · 个人私有存档</span>
                </div>
                <div class="id-chips">
                    ${a.questionIds.map(id => `<span class="id-chip" title="${id}">${id}</span>`).join('')}
                </div>
                <div class="flex mt16" style="gap:8px;flex-wrap:wrap;">
                    <button class="btn btn-sm btn-primary" data-preview="${a.id}">🖨️ 查看静态卷面 / 打印</button>
                    <button class="btn btn-sm" data-word="${a.id}">📥 导出 Word</button>
                    <button class="btn btn-sm ${a.addedToHistory ? '' : 'btn-success'}" data-add="${a.id}" ${a.addedToHistory ? 'disabled' : ''}>
                        ${a.addedToHistory ? '✓ 已加入历史习题' : '➕ 批量将全部题目加入我的历史习题'}
                    </button>
                    <button class="btn btn-sm" data-goto="${a.id}">📝 到历史习题逐题反馈</button>
                </div>
            </div>`;
        }).join('');

        $$('[data-preview]').forEach(b => b.addEventListener('click', () => openPrint(b.dataset.preview)));
        $$('[data-word]').forEach(b => b.addEventListener('click', () => { openPrint(b.dataset.word, false); setTimeout(exportWord, 50); }));
        $$('[data-add]').forEach(b => b.addEventListener('click', () => addToHistory(b.dataset.add)));
        $$('[data-goto]').forEach(b => b.addEventListener('click', () => location.href = 'history.html'));
    }

    function addToHistory(id) {
        const a = Store.archives().find(x => x.id === id);
        if (!a || a.addedToHistory) return;
        const entries = a.questionIds.map(qid => {
            const q = Store.getQuestion(qid);
            return q ? {
                subject: q.subject, id: qid, source: 'print',
                correct: null, userAnswer: '（线下纸面作答，未线上批改）', paperName: a.name
            } : null;
        }).filter(Boolean);
        Store.addHistory(entries);
        Store.markArchiveAdded(id);
        render();
        toast(`已将本卷 ${entries.length} 道题目批量加入历史习题，可逐题提交错误反馈`, 'success');
    }

    /* ---------------- 静态卷面渲染（纯静态、无控件） ---------------- */
    function sectionTitle(t) { return { 0: '一、单项选择题（请将答案填入题号前的括号内）', 1: '二、填空题', 2: '三、解答题（写出必要的文字说明、演算步骤）' }[t]; }

    function buildPrintHtml(a) {
        const qs = a.questionIds.map(id => Store.getQuestion(id)).filter(Boolean);
        const groups = { 0: [], 1: [], 2: [] };
        qs.forEach((q, i) => groups[q.type].push({ q, n: i + 1 }));

        const questionBlock = ({ q, n }) => {
            const tag = q.isReal === 1
                ? '<span class="pp-tag real">真题1</span>'
                : '<span class="pp-tag imit">仿造0</span>';
            const idTag = `<span style="font-size:9px;color:#aaa;font-family:Consolas,monospace;">${q.id}</span>`;
            if (q.type === 0) {
                return `<div class="pp-q">${tag}${n}.（　　）${idTag}<br>${esc(q.stem)}
                    <div class="pp-opts">${q.options.map(o => esc(o)).join('　　')}</div></div>`;
            }
            if (q.type === 1) {
                return `<div class="pp-q">${tag}${n}. ${idTag} ${esc(q.stem)}<div class="pp-write"></div></div>`;
            }
            return `<div class="pp-q">${tag}${n}. ${idTag} ${esc(q.stem)}
                <div class="pp-write big"></div><div class="pp-write big"></div></div>`;
        };

        const body = [0, 1, 2].filter(t => groups[t].length).map(t =>
            `<div style="font-weight:700;font-size:14px;margin:16px 0 8px;">${sectionTitle(t)}</div>` +
            groups[t].map(questionBlock).join('')).join('');

        return `<div class="print-page">
            <h1>${esc(a.name)}</h1>
            <div class="pp-meta">${subjectName(a.subject)} · 线下纸质练习卷（静态导出 · 无交互控件）· 导出时间 ${a.exportedAt}</div>
            <div class="pp-blankline">
                <span>姓名:__________</span><span>班级:__________</span>
                <span>学号:__________</span><span>得分:__________</span>
            </div>
            <div style="font-size:11px;color:#777;border:1px solid #ddd;border-radius:6px;padding:6px 10px;margin-bottom:10px;line-height:1.7;">
                考生须知：本卷为纸面作答用静态试卷。题目标签 <span class="pp-tag real">真题1</span> 表示真题原题，
                <span class="pp-tag imit">仿造0</span> 表示 AI 仿造变式 / 生成题；每题标注唯一题目 ID,
                线下作答完成后可在系统「试卷存档」中将本卷加入历史习题，凭题目 ID 提交题干或解题步骤错误反馈。
            </div>
            ${body}
            <div class="pp-foot">${esc(a.name)} · 自成 AI 命题练习系统打印导出 · 试卷存档ID:${a.id}</div>
        </div>`;
    }

    function openPrint(id, autoModal = true) {
        const a = Store.archives().find(x => x.id === id);
        if (!a) { toast('存档不存在或已被清理', 'error'); return; }
        currentArc = a;
        $('#print-area').innerHTML = buildPrintHtml(a);
        if (autoModal) openModal('print-modal');
    }

    /* ---------------- Word 导出（.doc，浏览器直接下载） ---------------- */
    function buildWordBody(a) {
        const qs = a.questionIds.map(id => Store.getQuestion(id)).filter(Boolean);
        const groups = { 0: [], 1: [], 2: [] };
        qs.forEach((q, i) => groups[q.type].push({ q, n: i + 1 }));
        const block = ({ q, n }) => {
            const tag = q.isReal === 1 ? '<span class="tag">[真题1]</span>' : '<span class="tag">[仿造0]</span>';
            const idTag = `<span class="id">${q.id}</span>`;
            if (q.type === 0) {
                return `<p class="q">${tag}${n}.（　）${idTag}<br>${esc(q.stem)}<br>` +
                    `<span class="opts">${q.options.map(o => esc(o)).join('　　')}</span></p>`;
            }
            if (q.type === 1) {
                return `<p class="q">${tag}${n}. ${idTag} ${esc(q.stem)}</p><hr>`;
            }
            return `<p class="q">${tag}${n}. ${idTag} ${esc(q.stem)}</p><hr><p style="height:80pt;">&nbsp;</p><hr>`;
        };
        return [0, 1, 2].filter(t => groups[t].length)
            .map(t => `<p class="sec">${sectionTitle(t)}</p>` + groups[t].map(block).join('')).join('');
    }

    function exportWord() {
        if (!currentArc) return;
        const a = currentArc;
        const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(a.name)}</title>
<style>
body{font-family:"宋体",SimSun;font-size:12pt;line-height:1.8;}
h1{text-align:center;font-size:18pt;}
.meta{text-align:center;font-size:10pt;color:#444;}
.tag{font-size:9pt;border:1px solid #666;padding:0 4px;margin-right:6px;}
.q{margin-bottom:12pt;}
.opts{margin-left:18pt;}
.id{font-size:8pt;color:#999;font-family:Consolas;}
.sec{font-weight:bold;font-size:13pt;margin:14pt 0 6pt;}
hr{border:none;border-top:1px solid #666;margin:8pt 0;}
</style></head><body>
<h1>${esc(a.name)}</h1>
<div class="meta">${subjectName(a.subject)} · 线下纸质练习卷（静态导出）· 导出时间 ${a.exportedAt}</div>
<p>姓名：__________　班级：__________　学号：__________　得分：__________</p>
${buildWordBody(a)}
</body></html>`;
        const blob = new Blob(['﻿', html], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = a.name + '.doc';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('Word 文档已开始下载', 'success');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
