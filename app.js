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
                { id: 'player', name: '我 (指挥官)', hp: 100, hg: 100, th: 100, sn: 100, img: 'player.png', isPlayer: true },
                { id: 'c1', name: '阿强', hp: 100, hg: 100, th: 100, sn: 100, img: 'aq.png' },
                { id: 'c2', name: '小明', hp: 100, hg: 100, th: 100, sn: 100, img: 'xm.png' },
                { id: 'c3', name: '小美', hp: 100, hg: 100, th: 100, sn: 100, img: 'xm2.png' },
                { id: 'c4', name: '老王', hp: 100, hg: 100, th: 100, sn: 100, img: 'lw.png' }
            ]
        }
    };

    const SYS_PROMPT = `下面，你是一个赛博硬核风的丧尸末世生存游戏AI叙事者。玩家和4个室友(阿强,小明,小美,老王)在求生。
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
        if (GAME.state.storyLog.length === 0) {
            await triggerEvent("游戏初始化。丧尸病毒突然爆发，校园广播传出惨叫后断绝。我们五个人被困在宿舍里。请生成开场剧情和第一批选项。");
        } else {
            renderAll();
        }
    }

    // --- 核心 AI 交互层 ---
    async function callDeepSeek(userMessage) {
        // 构建请求上下文 (保留 System + 最近 4 条对话防溢出)
        let messages = [{ role: 'system', content: SYS_PROMPT }];
        let recentHistory = GAME.state.chatHistory.slice(-4);
        messages = messages.concat(recentHistory);
        
        // 加上当前角色状态的隐藏上下文，让 AI 知道具体情况
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

            // 更新历史记录
            GAME.state.chatHistory.push({ role: 'user', content: userMessage });
            GAME.state.chatHistory.push({ role: 'assistant', content: reply });
            
            return reply;
        } catch (error) {
            console.error(error);
            return `【系统错误】神经连接中断... ${error.message}。\n请稍后再试或检查网络连接。\n【选项1】重试动作\n【选项2】休息片刻`;
        }
    }

    // --- 流程控制 ---
    async function triggerEvent(actionText, isPlayerChoice = false) {
        if (GAME.state.isGameOver) return;

        const optionsContainer = document.getElementById('optionsContainer');
        optionsContainer.innerHTML = '<div class="loader"></div><div style="text-align:center; color:var(--cyan); font-size:0.9rem; margin-top:10px;">AI 正在演算未来视界...</div>';

        if (isPlayerChoice) {
            GAME.state.storyLog.push({ type: 'action', text: `>> 执行指令：${actionText}` });
            renderStory();
            updateStatsByAction(actionText); // 简单估算消耗
        }

        const aiResponse = await callDeepSeek(actionText);
        parseAIResponse(aiResponse);
        
        checkStatus();
        renderAll();
    }

    function parseAIResponse(text) {
        // 分离剧情和选项
        let lines = text.split('\n');
        let storyPart = [];
        let newOptions = [];

        // 匹配各种选项格式：【选项1】, 选项 1：, 1. 等
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

        // 兜底处理
        if (newOptions.length === 0) newOptions = ["继续探索", "检查大家的状态", "找地方休息"];
        
        GAME.state.storyLog.push({ type: 'story', text: storyPart.join('<br>') });
        GAME.state.options = newOptions;

        // 模拟时间流逝
        if (Math.random() > 0.7) GAME.state.day++; 
    }

    function handleOptionSelect(idx) {
        if (GAME.state.isGameOver) return;
        const choiceText = GAME.state.options[idx];
        triggerEvent(choiceText, true);
    }

    // --- 简单数值引擎 ---
    function updateStatsByAction(action) {
        let p = GAME.state.chars[0];
        // 每次行动基础消耗
        p.hg -= 2; p.th -= 3;
        
        if (/战斗|攻击|杀|拼|打/.test(action)) { p.hp -= Math.floor(Math.random()*15); p.sn -= 5; }
        if (/跑|逃|搜|找/.test(action)) { p.hg -= 5; p.th -= 8; }
        if (/吃|食物|罐头/.test(action)) { p.hg += 30; }
        if (/喝|水/.test(action)) { p.th += 30; }
        if (/休息|睡/.test(action)) { p.hp += 10; p.sn += 15; p.th -= 5; }

        // 限制边界
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

    // --- 渲染引擎 ---
    function renderAll() {
        document.getElementById('hudDay').innerText = `DAY ${GAME.state.day}`;
        document.getElementById('hudLoc').innerText = GAME.state.location;
        renderStory();
        renderOptions();
        renderChars();
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
        // 自动滚动到底部
        box.scrollTop = box.scrollHeight;
    }

    function renderOptions() {
        const box = document.getElementById('optionsContainer');
        if (GAME.state.isGameOver) {
            box.innerHTML = `<div style="color:var(--danger); text-align:center; padding: 20px; font-weight:bold;">>>> 系统已终止运行 <<<</div>`;
            return;
        }
        
        box.innerHTML = GAME.state.options.map((opt, i) => `
            <button class="btn-option" onclick="handleOptionSelect(${i})">
                <span class="num">OPT ${i+1}</span>
                <span>${opt}</span>
            </button>
        `).join('');
    }

    function renderChars() {
        const box = document.getElementById('charList');
        box.innerHTML = GAME.state.chars.map(c => `
            <div class="char-card ${c.isPlayer ? 'player' : ''}">
                <div class="char-header">
                <img src="./img/${c.img}" alt="${c.name}" />
                    <span>${c.name}</span>
                    <span class="status-tag">${c.isPlayer ? 'CMD' : 'NPC'}</span>
                </div>
                ${drawBar('生命', c.hp, 'hp-fill')}
                ${drawBar('饥饿', c.hg, 'hg-fill')}
                ${drawBar('水分', c.th, 'th-fill')}
                ${drawBar('理智', c.sn, 'sn-fill')}
            </div>
        `).join('');
    }

    function drawBar(label, val, fillClass) {
        return `
            <div class="bar-row">
                <div class="bar-label">${label}</div>
                <div class="bar-track"><div class="bar-fill ${fillClass}" style="width: ${val}%"></div></div>
                <div class="bar-val">${val}</div>
            </div>
        `;
    }

    // --- 数据持久化 (存档机制彻底修复) ---
    function saveGame() {
        if (GAME.state.storyLog.length === 0) return alert("尚无数据可保存！");
        const dataStr = JSON.stringify(GAME.state);
        // 使用 JSON + Blob 下载，避开 CSV 逗号截断问题
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
                    renderAll();
                    alert("数据覆写成功，已恢复上一次的连接状态。");
                } else {
                    throw new Error("存档格式不兼容");
                }
            } catch (err) {
                alert("读取失败：文件已损坏或不是合法的 JSON 存档！\n" + err.message);
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
                { id: 'player', name: '我 (指挥官)', hp: 100, hg: 100, th: 100, sn: 100, img: 'player.png', isPlayer: true },
                { id: 'c1', name: '阿强', hp: 100, hg: 100, th: 100, sn: 100, img: 'aq.png' },
                { id: 'c2', name: '小明', hp: 100, hg: 100, th: 100, sn: 100, img: 'xm.png' },
                { id: 'c3', name: '小美', hp: 100, hg: 100, th: 100, sn: 100, img: 'xm.png' },
                { id: 'c4', name: '老王', hp: 100, hg: 100, th: 100, sn: 100, img: 'lw.png' }
            ]
        };
        document.getElementById('storyOutput').innerHTML = '';
        triggerEvent("游戏初始化。丧尸病毒突然爆发，校园广播传出惨叫后断绝。我们五个人被困在宿舍里。请生成开场剧情和第一批选项。");
    }