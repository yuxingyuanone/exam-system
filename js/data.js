/* ============================================================
   模拟数据层（前端演示用）
   题目完整 ID 编码：学科编号-板块内序号-是否真题(0AI/1真题)-题型(0选择/1填空/2大题)-难度(1-5)
   ============================================================ */
(function () {
    'use strict';

    const SUBJECTS = [
        { code: 'DISC', name: '离散数学' },
        { code: 'CALC', name: '微积分' },
        { code: 'PHYS', name: '大学物理' }
    ];

    const CHAPTERS = {
        DISC: ['第一章 集合与关系', '第二章 命题逻辑', '第三章 谓词逻辑', '第四章 图论基础'],
        CALC: ['第一章 函数与极限', '第二章 导数与微分', '第三章 中值定理', '第四章 不定积分', '第五章 定积分'],
        PHYS: ['第一章 质点运动学', '第二章 牛顿定律', '第三章 动量与角动量', '第四章 刚体力学']
    };

    const POINTS = {
        DISC: ['幂集', '等价关系', '命题公式', '主范式', '一阶推理', '欧拉图', '哈密顿图', '树'],
        CALC: ['重要极限', '夹逼准则', '复合函数求导', '隐函数求导', '洛必达法则', '泰勒公式', '换元积分', '分部积分'],
        PHYS: ['运动方程', '圆周运动', '摩擦力分析', '动量守恒', '角动量守恒', '转动惯量']
    };

    // 题型字典
    const TYPE_MAP = { 0: '选择题', 1: '填空题', 2: '主观大题' };

    /* 试题库（演示种子数据）
       stepsA / stepsB：两套独立解题步骤，内部各自带信誉分
       B 仅后台存储，不对学生展示
    ------------------------------------------------- */
    const QUESTIONS = [
        {
            id: 'DISC-0001-0-0-2', subject: 'DISC', seq: '0001', isReal: 0, type: 0, difficulty: 2,
            chapter: '第一章 集合与关系', points: ['幂集'],
            stem: '设集合 A = {1, 2, 3}，则 A 的幂集 P(A) 中元素的个数为（ ）',
            options: ['A. 6', 'B. 7', 'C. 8', 'D. 9'],
            answer: 'C',
            stepsA: { score: 3, text: '幂集 P(A) 是 A 的所有子集构成的集合。|A| = 3，故 |P(A)| = 2³ = 8，选 C。' },
            stepsB: { score: 2, text: '枚举：∅、{1}、{2}、{3}、{1,2}、{1,3}、{2,3}、{1,2,3}，共 8 个。' },
            reputation: 6
        },
        {
            id: 'DISC-0007-0-1-3', subject: 'DISC', seq: '0007', isReal: 0, type: 1, difficulty: 3,
            chapter: '第二章 命题逻辑', points: ['命题公式'],
            stem: '命题公式 (p → q) ∧ p ⇒ q 是推理规则中的 ______ 律。',
            options: [], answer: '假言推理（分离规则 / Modus Ponens）',
            stepsA: { score: 2, text: 'p→q 且 p 为真时，q 必为真，这是假言推理规则（MP 规则）。' },
            stepsB: { score: 2, text: '由蕴含消去规则：A→B, A ⊢ B，即分离规则。' },
            reputation: 2
        },
        {
            id: 'DISC-0015-1-2-4', subject: 'DISC', seq: '0015', isReal: 1, type: 2, difficulty: 4,
            chapter: '第四章 图论基础', points: ['欧拉图', '哈密顿图'],
            stem: '设无向连通图 G 有 6 个顶点、10 条边。(1) 判断 G 是否可能为欧拉图并说明理由；(2) 若 G 中恰有 2 个奇度顶点，给出一条从其中一个奇度顶点出发的欧拉迹的构造思路。',
            options: [], answer: '(1) 当且仅当所有顶点度数均为偶数时存在欧拉回路；总度数为 20，可以做到 6 个偶度顶点（如度序列 4,4,4,4,2,2），故可能为欧拉图。(2) 恰有 2 个奇度顶点时存在欧拉迹，在两个奇度顶点之间添加一条虚拟边后图中全为偶度顶点，求欧拉回路再删除虚拟边即得欧拉迹。',
            stepsA: { score: 4, text: '握手定理：Σdeg(v)=2|E|=20。欧拉图充要条件是连通且无奇度顶点，构造度序列验证可行性；两奇度点用 Fleury 算法或加边法构造欧拉迹。' },
            stepsB: { score: 1, text: '利用欧拉定理：连通图奇度顶点数必为偶数。0 个→欧拉回路；2 个→欧拉迹，起点为奇度顶点。' },
            reputation: 8
        },
        {
            id: 'CALC-0003-0-0-2', subject: 'CALC', seq: '0003', isReal: 0, type: 0, difficulty: 2,
            chapter: '第一章 函数与极限', points: ['重要极限'],
            stem: '极限 lim(x→0) sin x / x 的值为（ ）',
            options: ['A. 0', 'B. 1', 'C. +∞', 'D. 不存在'],
            answer: 'B',
            stepsA: { score: 5, text: '第一重要极限：lim(x→0) sin x / x = 1，选 B。' },
            stepsB: { score: 4, text: '单位圆几何夹逼：cos x < sin x / x < 1，由夹逼准则极限为 1。' },
            reputation: 11
        },
        {
            id: 'CALC-0009-0-0-3', subject: 'CALC', seq: '0009', isReal: 0, type: 0, difficulty: 3,
            chapter: '第二章 导数与微分', points: ['复合函数求导'],
            stem: '设 f(x) = e^(2x) · ln x，则 f ′(x) = （ ）',
            options: ['A. e^(2x)(2ln x + 1/x)', 'B. 2e^(2x) · 1/x', 'C. e^(2x)(2ln x + x)', 'D. 2e^(2x)ln x'],
            answer: 'A',
            stepsA: { score: 3, text: '乘积法则：(uv)′=u′v+uv′。u=e^(2x)，u′=2e^(2x)；v=ln x，v′=1/x。故 f′=e^(2x)(2ln x+1/x)，选 A。' },
            stepsB: { score: 3, text: '链式求导加乘积法则，整理后与 A 项一致。' },
            reputation: 5
        },
        {
            id: 'CALC-0014-1-1-3', subject: 'CALC', seq: '0014', isReal: 1, type: 1, difficulty: 3,
            chapter: '第三章 中值定理', points: ['洛必达法则'],
            stem: 'lim(x→0) (x − sin x) / x³ = ______ 。',
            options: [], answer: '1/6',
            stepsA: { score: 4, text: '0/0 型连续使用洛必达法则三次，或泰勒展开 sin x = x − x³/6 + o(x³)，得极限 1/6。' },
            stepsB: { score: 4, text: '洛必达三次：分子导为 1−cos x、sin x、cos x；分母为 3x²、6x、6，得 1/6。' },
            reputation: 9
        },
        {
            id: 'CALC-0021-0-2-4', subject: 'CALC', seq: '0021', isReal: 0, type: 2, difficulty: 4,
            chapter: '第四章 不定积分', points: ['分部积分', '换元积分'],
            stem: '计算不定积分：∫ x · e^(2x) dx。',
            options: [], answer: '(1/2) x e^(2x) − (1/4) e^(2x) + C',
            stepsA: { score: 1, text: '分部积分：令 u=x，dv=e^(2x)dx，则 ∫x e^(2x)dx = (1/2)xe^(2x) − (1/2)∫e^(2x)dx = (1/2)xe^(2x) − (1/4)e^(2x)+C。' },
            stepsB: { score: 4, text: '两次分部积分思想，第二次对纯指数项直接积分，回代即得。' },
            reputation: 3
        },
        {
            id: 'PHYS-0005-1-0-2', subject: 'PHYS', seq: '0005', isReal: 1, type: 0, difficulty: 2,
            chapter: '第一章 质点运动学', points: ['圆周运动'],
            stem: '一质点做匀速圆周运动，半径为 R，速率为 v，其向心加速度大小为（ ）',
            options: ['A. v²/R', 'B. v/R', 'C. v²R', 'D. 0'],
            answer: 'A',
            stepsA: { score: 4, text: '匀速圆周运动只有法向加速度 aₙ = v²/R，方向指向圆心，选 A。' },
            stepsB: { score: 4, text: '速度方向不断变化，Δv 指向圆心，取极限得 a = v²/R。' },
            reputation: 7
        },
        {
            id: 'PHYS-0011-0-1-3', subject: 'PHYS', seq: '0011', isReal: 0, type: 1, difficulty: 3,
            chapter: '第二章 牛顿定律', points: ['摩擦力分析'],
            stem: '质量为 2 kg 的物体置于水平面上，动摩擦因数 μ=0.25，重力加速度 g 取 10 m/s²。要维持物体匀速滑动，水平拉力大小为 ______ N。',
            options: [], answer: '5',
            stepsA: { score: 2, text: '匀速时拉力等于滑动摩擦力：F=μmg=0.25×2×10=5 N。' },
            stepsB: { score: 2, text: '合力为零，T−μmg=0，代入数值得 5 N。' },
            reputation: 1
        },
        {
            id: 'PHYS-0018-1-2-5', subject: 'PHYS', seq: '0018', isReal: 1, type: 2, difficulty: 5,
            chapter: '第三章 动量与角动量', points: ['动量守恒', '角动量守恒'],
            stem: '质量为 M 的木块静止在光滑水平面上，一质量为 m 的子弹以水平速度 v₀ 射入木块并最终留在其中（完全非弹性碰撞）。(1) 求子弹与木块的共同速度；(2) 求碰撞过程中损失的机械能。',
            options: [], answer: '(1) v = m v₀/(M+m)；(2) ΔE = (1/2)m v₀² − (1/2)(M+m)v² = M m v₀²/[2(M+m)]。',
            stepsA: { score: 3, text: '系统水平方向不受外力，动量守恒 m v₀=(M+m)v；能量差即耗散的机械能。' },
            stepsB: { score: 3, text: '动量守恒求共速后，初动能减末动能，通分化简得 ΔE=Mm v₀²/[2(M+m)]。' },
            reputation: 6
        },
        {
            id: 'DISC-0022-0-0-4', subject: 'DISC', seq: '0022', isReal: 0, type: 0, difficulty: 4,
            chapter: '第三章 谓词逻辑', points: ['一阶推理'],
            stem: '设个体域为整数集，公式 ∀x ∃y (x + y = 0) 的真值为（ ）',
            options: ['A. 真', 'B. 假', 'C. 可满足但非永真', 'D. 无法判定'],
            answer: 'A',
            stepsA: { score: 0, text: '对任意整数 x，取 y = −x 即可使 x+y=0 成立，故公式为真，选 A。' },
            stepsB: { score: 3, text: '∀x∃y 要求为每个 x 找到对应的 y，加法逆元在整数集上总存在，命题成立。' },
            reputation: 4
        },
        {
            id: 'CALC-0025-0-1-5', subject: 'CALC', seq: '0025', isReal: 0, type: 1, difficulty: 5,
            chapter: '第三章 中值定理', points: ['泰勒公式'],
            stem: '函数 f(x) = ln(1+x) 在 x=0 处带佩亚诺余项的三阶泰勒展开为 ______ 。',
            options: [], answer: 'x − x²/2 + x³/3 + o(x³)',
            stepsA: { score: 2, text: '逐阶求导后代入泰勒公式，符号交替：ln(1+x)=x−x²/2+x³/3+o(x³)。' },
            stepsB: { score: 2, text: '利用几何级数 1/(1+t) 从 0 到 x 积分逐项得到该展开。' },
            reputation: -3
        }
    ];

    // 仿造题模板（真题模板管理）
    const TEMPLATES = [
        { id: 'tpl-1', name: '2025 秋·离散数学期末真题套卷', subject: 'DISC', count: 22, source: '手动录入', createdAt: '2026-06-20' },
        { id: 'tpl-2', name: '微积分第三章·中值定理真题精选', subject: 'CALC', count: 12, source: 'Word 文档导入', createdAt: '2026-07-02' }
    ];

    window.SEED = { SUBJECTS, CHAPTERS, POINTS, QUESTIONS, TEMPLATES, TYPE_MAP};
})();
