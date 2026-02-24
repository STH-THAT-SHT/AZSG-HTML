/*
    宛如使一样的function命名逻辑和功能实现。。
 */

// define the default blocks.

const cstatus = document.getElementById("gameCStatus");
const history = document.getElementById("gameHistory");
const opt = document.getElementById("gameOpt");
const gameDay = document.getElementById("gameDay");
const gameWeather = document.getElementById("gameWeather");
const gameBoardcast = document.getElementById("gameBoardcast");
const gameDirty = document.getElementById("gameDirty");
const pp = document.getElementById('progress');
const AllSTATUS = ['gameDay','gameWeather','gameBoardcast','gameDirty'];

// some vars...
let day=0;  // 希望Ai那玩意不要搞乱这个时间设定，一句话等会跳到10天外了。。
let weather='clear'; // clear晴天，cloudy阴天，bloodmoon血月（夜），rainy雨天，rainstorm暴风雨，
                    // snowstorm暴风雪，excold极寒潮
let broadcast=100; // 这个随着游戏时长变长而降低，每到降至50以下的时候就应该给prompt让AI提醒玩家前往信号更好的地方
let dirty = 1; // 世界污染值，如果成功归零，那么游戏胜利

const StartScene = '你在慌乱中被小美叫醒了……睁开眼，你看到的画面让你怀疑自己是在做梦——一只面目狰狞的丧尸在教师门外发疯地锤击教室门，你的身边，小美和小明和老师老王惊恐地看着那个怪物。你试图说服自己这是一场清醒梦，但是身上的伤口提醒着你，这一切都是最真实的现实。';
let api_baseurl = 'https://api.deepseek.com';

let characters = [
    { id: 'c1', name: "Player", role: "CMD", sanity: 100, stable: 100, health: 100 , stamina: 100 },
    { id: 'c2', name: "小明", role: "NPC", sanity: 100, stable: 100, health: 100 , stamina: 100 },
    { id: 'c3', name: "小美", role: "NPC", sanity: 100, stable: 100, health: 100 , stamina: 100 },
];
// init game

    // first open the mdui dialog..
    let $ = mdui.$;
    let inst = new mdui.Dialog('#initialize-dialog');
    addEventListener('DOMContentLoaded', function() {
    document.getElementById('api_baseurl').value = api_baseurl;
    inst.open();
    });

    $('#initialize-dialog').on('close.mdui.dialog', function () {
    initGame();
    });

    // init the GAME
    function initGame() {
        const api_apikey = document.getElementById("apikey").value.trim();
        let api_baseurl = document.getElementById("api_baseurl").value.trim();
        /* // vaildate key input
        if (api_apikey === "" || api_baseurl == '') {
            mdui.snackbar({
                message: 'API Key或API URL为空，无法开始游戏',
                position: 'left-top',
            });
            return;
        }
        */
        pp.removeAttribute('hidden');
        renderStatus();

        // game start!!!
        gameHistory.innerHTML = `
        <div class="scifi-dialogue narrator-text">
            ${StartScene}
        </div>`;
        pp.setAttribute('hidden','')
    }

    function renderStatus(){

        cstatus.innerHTML = characters.map(e => `
            <div class="mdui-card mdui-shadow-0">
                <div class="mdui-card-header">
                    <img class="mdui-card-header-avatar" src="img/${e.id}.png"/>
                    <div class="mdui-card-header-title" id="playerName">${e.name}</div>
                    <div class="mdui-card-header-subtitle"><span style="color:aqua;" id="sanity">理智: ${e.sanity}</span> | 
                    <span style="color:red;" id="stable">稳定性: ${e.stable}</span> | 
                    <span style="color:green;" id="health">健康: ${e.health}</span> | 
                    <span style="color:blue;" id="stamina">体力: ${e.stamina}</span></span></div>
                </div>
            </div>
        `).join('');
    }
    function addHistory(type,content){
        if(type == 'narration'){
            const cssType = 'narrator-text';
        }else{
            const cssType = 'story-text';
        }
        gameHistory.insertAdjacentHTML('beforeend',`<div class="scifi-dialogue ${cssType}">
            ${content}
        </div>`);
        return ;
    }






    // 用于指定改变哪个值说是.
    function changeStatus(characterid,target,value){
        let cs = characters.find(char => char.id == characterid);
        if(cs){
            cs[target] = value
        }
    }

    // 用于改变status data.
    function changeStatusData(d,w,b,di){
        gameDay.content = d
        gameWeather.content = w
        gameBoardcast.content = b
        gameDirty.content = di
    }

    // 用于向AI发出请求
    async function AiRequest(api,key,addtion){
        
    }