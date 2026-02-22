
    // --- 核心状态 ---
    let GAME = {
        key: '',
        state: {
            day: 1,
            location: '大学宿舍',
            weather: '未知',
            isGameOver: false,
            chatHistory: [], // 给 LLM 的上下文
            storyLog: [],    // 用于 UI 渲染的剧情记录
            options: [],
            chars: [
                { id: 'player', name: '我 (指挥官)', hp: 100, hg: 100, th: 100, sn: 100, isPlayer: true },
                { id: 'c1', name: '阿强', hp: 100, hg: 100, th: 100, sn: 100 },
                { id: 'c2', name: '小明', hp: 100, hg: 100, th: 100, sn: 100 },
                { id: 'c3', name: '小美', hp: 100, hg: 100, th: 100, sn: 100 },
                { id: 'c4', name: '老王', hp: 100, hg: 100, th: 100, sn: 100 }
            ],
            // 新增地图网格数据 (5x5) 每个格子用字母表示: R=房间, C=走廊, O=户外, Z=丧尸, S=物资
            mapGrid: null
        }
    };

    const SYS_PROMPT = `你是一个赛博硬核风的丧尸末世生存游戏AI叙事者。玩家和4个室友(阿强,小明,小美,老王)在求生。
规则：
1. 直接用生动、紧张的语言描述环境和发生的事件，不要说多余的废话。
2. 描述后，必须提供 3 到 4 个玩家可执行的动作选项。
3. 选项必须严格使用【选项1】、【选项2】... 的格式独立成行，例如：
【选项1】锁死宿舍门，检查室内物资。
【选项2】抄起拖把杆，静步去走廊看看。
4. 根据玩家的选择，适当且合理地描述角色受伤、疲劳、饥饿或心理波动（可以用简短的括号旁白暗示状态变化）。`;

    // --- 初始化与界面切换 ---
    window.onload = () => {
        const savedKey = localStorage.getItem('deepseek_key');
        if (savedKey) document.getElementById('apiKeyInput').value = savedKey;
    };

    function switchUI(toGame) {
        document.getElementById('loginArea').style.display = toGame ? 'none' : 'block';
        document.getElementById('gameArea').style.display = toGame ? 'block' : 'none';
    }

    async function initGame() {
        const key = document.getElementById('apiKeyInput').value.trim();
        if (!key) return alert("必须输入 API 密钥以建立神经连接！");
        
        localStorage.setItem('deepseek_key', key);
        GAME.key = key;
        
        switchUI(true);
        // 初次进入：生成地图 + 开场剧情
        if (!GAME.state.mapGrid) {
            await generateMapFromAI("生成一个初始的校园丧尸爆发地图");
        }
        if (GAME.state.storyLog.length === 0) {
            await triggerEvent("游戏初始化。丧尸病毒突然爆发，校园广播传出惨叫后断绝。我们五个人被困在宿舍里。请生成开场剧情和第一批选项。");
        } else {
            renderAll();
        }
    }

    // --- 地图生成 (AI 随机地图) ---
    async function generateMapFromAI(seedDesc = "随机生成一张5x5丧尸校园地图") {
        if (!GAME.key) return fallbackMapGeneration();
        
        const mapPrompt = `你是一个地图生成器。请严格只输出一个5x5的矩阵，表示丧尸末日校园的地形。每个格子用一个字母表示：R（房间/室内）、C（走廊/通道）、O（户外/空地）、Z（丧尸出没区）、S（物资点）。输出格式为5行，每行5个字母，字母之间用空格分隔。不要有任何解释或额外文字。例如：
R R C O Z
C C C O O
O O Z S R
R C C O Z
S O R C C`;

        try {
            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${GAME.key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [{ role: 'user', content: mapPrompt }],
                    temperature: 0.6,
                    max_tokens: 150
                })
            });

            if (!response.ok) throw new Error(`地图API错误 ${response.status}`);
            const data = await response.json();
            const reply = data.choices[0].message.content.trim();
            
            // 解析矩阵
            const lines = reply.split('\n').filter(l => l.trim() !== '');
            let matrix = [];
            for (let i = 0; i < Math.min(5, lines.length); i++) {
                const parts = lines[i].trim().split(/\s+/);
                if (parts.length >= 5) {
                    const row = parts.slice(0,5).map(p => p.charAt(0).toUpperCase());
                    // 过滤合法字母
                    matrix.push(row.map(c => ['R','C','O','Z','S'].includes(c) ? c : 'R'));
                } else {
                    // 如果一行解析失败，随机填充
                    matrix.push(generateRandomRow());
                }
            }
            while (matrix.length < 5) matrix.push(generateRandomRow());
            
            GAME.state.mapGrid = matrix;
        } catch (e) {
            console.warn("AI地图生成失败，使用后备随机地图:", e);
            fallbackMapGeneration();
        }
        
        // 确保mapGrid存在
        if (!GAME.state.mapGrid) fallbackMapGeneration();
        
        // 添加到剧情日志
        GAME.state.storyLog.push({ type: 'story', text: '<span style="color:var(--cyan);">[系统] 量子测绘完成，周边地形已录入终端。</span>' });
       // renderAll();
    }

    function generateRandomRow() {
        const types = ['R','C','O','Z','S'];
        return Array.from({length:5}, () => types[Math.floor(Math.random() * types.length)]);
    }

    function fallbackMapGeneration() {
        const matrix = [];
        for (let i=0; i<5; i++) matrix.push(generateRandomRow());
        GAME.state.mapGrid = matrix;
    }

    // 刷新地图 (用户点击)
    async function refreshMap() {
        if (!GAME.key) return alert("API密钥不存在，请重新登录");
        await generateMapFromAI("重新生成一张不同的校园地图");
        renderMap();
    }

    // 渲染地图格子
    function renderMap() {
        const container = document.getElementById('mapGridContainer');
        if (!container) return;
        if (!GAME.state.mapGrid) {
            fallbackMapGeneration();
        }
        const grid = GAME.state.mapGrid;
        let html = '';
        const emojiMap = {'R':'🏠','C':'🚪','O':'🌳','Z':'🧟','S':'📦'};
        for (let r=0; r<5; r++) {
            for (let c=0; c<5; c++) {
                let cellType = (grid[r] && grid[r][c]) ? grid[r][c] : 'R';
                const emoji = emojiMap[cellType] || '❓';
                // 附加类型类名用于背景色
                html += `<div class="map-cell ${cellType}" title="${cellType}">${emoji}</div>`;
            }
        }
        container.innerHTML = html;
    }

    // --- 核心 AI 交互层 (基本不变，但确保地图不影响) ---
    async function callDeepSeek(userMessage) {
        let messages = [{ role: 'system', content: SYS_PROMPT }];
        let recentHistory = GAME.state.chatHistory.slice(-4);
        messages = messages.concat(recentHistory);
        
        const statusContext = `(系统隐藏信息: 第${GAME.state.day}天, 地点:${GAME.state.location}。玩家状态: HP${GAME.state.chars[0].hp}/100, 理智${GAME.state.chars[0].sn}/100。) \n玩家行动/意图：${userMessage}`;
        messages.push({ role: 'user', content: statusContext });

        try {
            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${GAME.key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'deepseek-chat', messages: messages, temperature: 0.7 })
            });

            if (!response.ok) throw new Error(`API 通讯故障 [Code: ${response.status}]`);
            const data = await response.json();
            const reply = data.choices[0].message.content;

            GAME.state.chatHistory.push({ role: 'user', content: userMessage });
            GAME.state.chatHistory.push({ role: 'assistant', content: reply });
            
            return reply;
        } catch (error) {
            console.error(error);
            return `【系统错误】神经连接中断... ${error.message}。\n请稍后再试或检查网络连接。\n【选项1】重试动作\n【选项2】休息片刻`;
        }
    }

    async function triggerEvent(actionText, isPlayerChoice = false) {
        if (GAME.state.isGameOver) return;

        const optionsContainer = document.getElementById('optionsContainer');
        optionsContainer.innerHTML = '<div class="loader"></div><div style="text-align:center; color:var(--cyan); font-size:0.9rem; margin-top:10px;">AI 正在演算未来视界...</div>';

        if (isPlayerChoice) {
            GAME.state.storyLog.push({ type: 'action', text: `>> 执行指令：${actionText}` });
            renderStory();
            updateStatsByAction(actionText);
        }

        const aiResponse = await callDeepSeek(actionText);
        parseAIResponse(aiResponse);
        
        checkStatus();
        renderAll();
        const reply = data.choices[0].message.content;
        console.log("AI 原始回复:", reply); // 检查这里
    }

    function parseAIResponse(text) {
        let lines = text.split('\n');
        let storyPart = [];
        let newOptions = [];

        const optRegex = /(?:【?选项\d*】?|第?\d+[.、：:])\s*(.+)/i;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;
            
            const match = trimmed.match(optRegex);
            if (match && match[1]) {
                newOptions.push(match[1]);
            } else {
                storyPart.push(trimmed);
            }
        });

        if (newOptions.length === 0) newOptions = ["继续探索", "检查大家的状态", "找地方休息"];
        
        GAME.state.storyLog.push({ type: 'story', text: storyPart.join('<br>') });
        GAME.state.options = newOptions;

        if (Math.random() > 0.7) GAME.state.day++; 

        console.log("解析后的剧情:", storyPart);
        console.log("解析后的选项:", newOptions);
    }

    function handleOptionSelect(idx) {
        if (GAME.state.isGameOver) return;
        const choiceText = GAME.state.options[idx];
        triggerEvent(choiceText, true);
    }

    function updateStatsByAction(action) {
        let p = GAME.state.chars[0];
        p.hg -= 2; p.th -= 3;
        
        if (/战斗|攻击|杀|拼|打/.test(action)) { p.hp -= Math.floor(Math.random()*15); p.sn -= 5; }
        if (/跑|逃|搜|找/.test(action)) { p.hg -= 5; p.th -= 8; }
        if (/吃|食物|罐头/.test(action)) { p.hg += 30; }
        if (/喝|水/.test(action)) { p.th += 30; }
        if (/休息|睡/.test(action)) { p.hp += 10; p.sn += 15; p.th -= 5; }

        GAME.state.chars.forEach(c => {
            c.hp = Math.min(100, Math.max(0, c.hp));
            c.hg = Math.min(100, Math.max(0, c.hg));
            c.th = Math.min(100, Math.max(0, c.th));
            c.sn = Math.min(100, Math.max(0, c.sn));
        });
    }

    function checkStatus() {
        let p = GAME.state.chars[0];
        let deadMsg = null;
        if (p.hp <= 0) deadMsg = "生命体征归零。你被感染了...";
        else if (p.hg <= 0) deadMsg = "严重营养不良，你饿死了...";
        else if (p.th <= 0) deadMsg = "严重脱水，你的身体机能已停止...";
        else if (p.sn <= 0) deadMsg = "理智崩溃，你举枪对准了自己...";

        if (deadMsg) {
            GAME.state.isGameOver = true;
            GAME.state.storyLog.push({ type: 'story', text: `<span style="color:var(--danger); font-size:1.2rem; font-weight:bold;">[ 警告：检测到核心指令员死亡 ]</span><br>${deadMsg}`});
            GAME.state.options = [];
        }
    }

    // --- 渲染引擎 (新增地图渲染) ---
    function renderAll() {
        document.getElementById('hudDay').innerText = `DAY ${GAME.state.day}`;
        document.getElementById('hudLoc').innerText = GAME.state.location;
        renderStory();
        renderOptions();
        renderChars();
        renderMap();  // 刷新地图
    }

    function renderStory() {
        const box = document.getElementById('storyOutput');
        box.innerHTML = GAME.state.storyLog.map(log => {
            if (log.type === 'action') {
                return `<div class="story-block player-action">${log.text}</div>`;
            } else {
                return `<div class="story-block">${log.text}</div>`;
            }
        }).join('');
        box.scrollTop = box.scrollHeight;
    }

    function renderOptions() {
        const box = document.getElementById('optionsContainer');
        if (GAME.state.isGameOver) {
            box.innerHTML = `<div style="color:var(--danger); text-align:center; padding: 20px; font-weight:bold;">>>> 系统已终止运行 <<<</div>`;
            return;
        }
        
        box.innerHTML = GAME.state.options.map((opt, i) => `
            <button class="outline" onclick="handleOptionSelect(${i})">
                <span class="num">OPT ${i+1}</span>
                <span>${opt}</span>
            </button>
        `).join('');
    }

function renderChars() {
    const box = document.getElementById('charList');
    
    box.innerHTML = GAME.state.chars.map(c => `
        <div class="group relative flow-root mb-10 overflow-hidden rounded border border-gray-200 dark:border-gray-800">
            
            <div class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-white opacity-0 transition-opacity duration-500 group-hover:opacity-100 dark:bg-gray-900">
                <img src="./img/${c.id}.png" 
                        class="h-full w-full object-cover" 
                        onerror="this.parentElement.style.display='none'">
            </div>

            <dl class="relative z-10 -my-3 divide-y divide-gray-200 text-sm dark:divide-gray-700">
                <div class="grid grid-cols-1 gap-1 p-3 sm:grid-cols-3 sm:gap-4">
                    <dt class="font-medium text-gray-900 dark:text-white">名字</dt>
                    <dd class="text-gray-700 sm:col-span-2 dark:text-gray-200">${c.name}</dd>
                </div>

                <div class="grid grid-cols-1 gap-1 p-3 sm:grid-cols-3 sm:gap-4">
                    <dt class="font-medium text-gray-900 dark:text-white">类型</dt>
                    <dd class="text-gray-700 sm:col-span-2 dark:text-gray-200">${c.isPlayer ? 'CMD' : 'NPC'}</dd>
                </div>

                <div class="grid grid-cols-1 gap-1 p-3 sm:grid-cols-3 sm:gap-4">
                    <dt class="font-medium text-gray-900 dark:text-white">生命</dt>
                    <dd class="text-gray-700 sm:col-span-2 dark:text-gray-200">${drawBar('生命', c.hp, 'hp-fill')}</dd>
                </div>

                <div class="grid grid-cols-1 gap-1 p-3 sm:grid-cols-3 sm:gap-4">
                    <dt class="font-medium text-gray-900 dark:text-white">饥饿</dt>
                    <dd class="text-gray-700 sm:col-span-2 dark:text-gray-200">${drawBar('饥饿', c.hg, 'hg-fill')}</dd>
                </div>

                <div class="grid grid-cols-1 gap-1 p-3 sm:grid-cols-3 sm:gap-4">
                    <dt class="font-medium text-gray-900 dark:text-white">理智</dt>
                    <dd class="text-gray-700 sm:col-span-2 dark:text-gray-200">${drawBar('理智', c.sn, 'sn-fill')}</dd>
                </div>

                <div class="grid grid-cols-1 gap-1 p-3 sm:grid-cols-3 sm:gap-4">
                    <dt class="font-medium text-gray-900 dark:text-white">水分</dt>
                    <dd class="text-gray-700 sm:col-span-2 dark:text-gray-200">${drawBar('水分', c.th, 'th-fill')}</dd>
                </div>
            </dl>
        </div>
    `).join('');
}

    function drawBar(label, val, fillClass) {
        return `
            ${val}
        `;
    }

    // --- 数据持久化 (存档/读档 增加 mapGrid) ---
    function saveGame() {
        if (GAME.state.storyLog.length === 0) return alert("尚无数据可保存！");
        const dataStr = JSON.stringify(GAME.state);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `zombie_save_day${GAME.state.day}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert("✔️ 神经元数据已保存到本地设备。");
    }

    function loadGame(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const loadedState = JSON.parse(e.target.result);
                if (loadedState.chars && loadedState.storyLog) {
                    GAME.state = loadedState;
                    // 确保地图数据存在 (旧存档可能没有mapGrid)
                    if (!GAME.state.mapGrid) fallbackMapGeneration();
                    renderAll();
                    alert("✔️ 数据覆写成功，已恢复上一次的连接状态。");
                } else {
                    throw new Error("存档格式不兼容");
                }
            } catch (err) {
                alert("❌ 读取失败：文件已损坏或不是合法的 JSON 存档！\n" + err.message);
            }
        };
        reader.readAsText(file);
    }

    function resetGame() {
        if (!confirm("⚠️ 警告：格式化将清除当前所有记忆进度！是否执行？")) return;
        GAME.state = {
            day: 1, location: '大学宿舍', weather: '未知', isGameOver: false,
            chatHistory: [], storyLog: [], options: [],
            chars: [
                { id: 'player', name: '我 (指挥官)', hp: 100, hg: 100, th: 100, sn: 100, isPlayer: true },
                { id: 'c1', name: '阿强', hp: 100, hg: 100, th: 100, sn: 100 },
                { id: 'c2', name: '小明', hp: 100, hg: 100, th: 100, sn: 100 },
                { id: 'c3', name: '小美', hp: 100, hg: 100, th: 100, sn: 100 },
                { id: 'c4', name: '老王', hp: 100, hg: 100, th: 100, sn: 100 }
            ],
            mapGrid: null
        };
        document.getElementById('storyOutput').innerHTML = '';
        // 生成新地图 (调用AI)
        if (GAME.key) {
            generateMapFromAI("重置世界，生成全新地图").then(() => {
                triggerEvent("游戏初始化。丧尸病毒突然爆发，校园广播传出惨叫后断绝。我们五个人被困在宿舍里。请生成开场剧情和第一批选项。");
            });
        } else {
            fallbackMapGeneration();
            triggerEvent("游戏初始化。丧尸病毒突然爆发，校园广播传出惨叫后断绝。我们五个人被困在宿舍里。请生成开场剧情和第一批选项。");
        }
    }