// 從瀏覽器儲存空間讀取資料，若無則初始化
let pool = JSON.parse(localStorage.getItem('pool_v22')) || [];
let activeNurses = JSON.parse(localStorage.getItem('activeNurses_v22')) || [];
let schedule = JSON.parse(localStorage.getItem('sched_v22')) || {};
let leaves = JSON.parse(localStorage.getItem('leaves_v22')) || [];
let isLeaveMode = false;
let dateList = [];
let lockedCells = JSON.parse(localStorage.getItem('locked_v22')) || []; // 記錄鎖定的格子

// 初始化程式：設定預設年月、連線雲端並啟動渲染
// 1. 先定義讀取函式 (確保它在 init 被呼叫前就存在)
async function loadTargetMonth() {
    const yEl = document.getElementById('set-year');
    const mEl = document.getElementById('set-month');
    if (!yEl || !mEl) return;

    const year = yEl.value;
    const month = mEl.value;

    // 儲存目前位置，重整不跳掉
    localStorage.setItem('stay_year', year);
    localStorage.setItem('stay_month', month);

    console.log(`📡 正在請求雲端資料：${year}_${month}`);

    if (window.loadFromFirebase) {
        const data = await window.loadFromFirebase(year, month);
        
        // 在 loadTargetMonth 裡面的 data 注入區塊改寫：
        if (data) {
            console.log("✅ 抓到雲端資料", data);
            
            // 💡 確保這些全域變數都被正確更新
            schedule = data.schedule || {};
            activeNurses = data.activeNurses || [];
            
            // 🔥 GitHub 版最保險的寫法：
            window.leaves = data.leaves || []; 
            leaves = window.leaves; 
            
            window.lockedCells = data.lockedCells || [];
            window.currentDeadline = data.deadline || "";
            
            if (data.pool) pool = data.pool;
        } else {
            // 如果這月份沒資料，清空現有班表
            console.warn("⚠️ 此月份雲端尚無資料");
            schedule = {};
            activeNurses = [];
            leaves = [];
            window.lockedCells = [];
            window.currentDeadline = "";
        }

        // 注入資料後，立刻重新繪製畫面
        initDates();
        renderPool();
        renderTable(); 
        if (typeof updateStats === 'function') updateStats();
    }
}

// 2. 初始化函式
// script.js 關鍵讀取區
async function init() {
    console.log("🚀 系統啟動，正在主動抓取全域與月份資料...");
    const yEl = document.getElementById('set-year');
    const mEl = document.getElementById('set-month');
    const now = new Date();

    // 1. 恢復上次停留位置
    yEl.value = localStorage.getItem('stay_year') || now.getFullYear();
    mEl.value = localStorage.getItem('stay_month') || (now.getMonth() + 1);

    // 2. 🔥 重要：等待 Firebase SDK 掛載到 window
    let retry = 0;
    while (typeof window.loadMonthlyData !== 'function' && retry < 15) {
        await new Promise(r => setTimeout(r, 200));
        retry++;
    }

    // 3. 執行抓取
    await refreshData();

    // 4. 綁定選單改動
    yEl.onchange = refreshData;
    mEl.onchange = refreshData;
}

async function refreshData() {
    const year = document.getElementById('set-year').value;
    const month = document.getElementById('set-month').value;
    
    localStorage.setItem('stay_year', year);
    localStorage.setItem('stay_month', month);

    const [globalPool, monthlyData] = await Promise.all([
        window.loadGlobalNurses ? window.loadGlobalNurses() : [],
        window.loadMonthlyData ? window.loadMonthlyData(year, month) : null
    ]);

    // 1. 更新人員池
    pool = globalPool || [];

    // 2. 🏆 從雲端還原所有班表細節
    if (monthlyData) {
        activeNurses = monthlyData.activeNurses || [];
        schedule = monthlyData.schedule || {};
        leaves = monthlyData.leaves || [];
        window.lockedCells = monthlyData.lockedCells || [];
        window.currentDeadline = monthlyData.deadline || ""; // 讀取 Deadline
    } else {
        // 若該月無資料，則初始化
        activeNurses = [];
        schedule = {};
        leaves = [];
        window.lockedCells = [];
        window.currentDeadline = "";
    }

    // 3. 渲染
    initDates();    
    renderPool();   
    renderTable();  
    if (typeof updateStats === 'function') updateStats();
    
    console.log(`✅ ${year}_${month} 資料已從雲端完全同步`);
}

async function refreshData() {
    const year = document.getElementById('set-year').value;
    const month = document.getElementById('set-month').value;
    
    // 1. 記憶目前位置 (重整不跳掉)
    localStorage.setItem('stay_year', year);
    localStorage.setItem('stay_month', month);

    // 2. 同時抓取兩份資料
    const [globalPool, monthlyData] = await Promise.all([
        window.loadGlobalNurses ? window.loadGlobalNurses() : [],
        window.loadMonthlyData ? window.loadMonthlyData(year, month) : null
    ]);

    // 🏆【核心改動】人員清單獨立：
    // pool 永遠抓全域的 (Settings/NurseList)，這樣你在哪個月都能看到所有人
    pool = globalPool || [];

    // 📅 班表資料維持原樣：
    // activeNurses 只抓當月 (NurseSchedule/年月) 已經加入班表的人
    activeNurses = monthlyData ? (monthlyData.activeNurses || []) : [];
    schedule = monthlyData ? (monthlyData.schedule || {}) : {};
    
    // 這裡要補上你原本可能有的其他資料，例如預假
    leaves = monthlyData ? (monthlyData.leaves || []) : [];
    window.lockedCells = monthlyData ? (monthlyData.lockedCells || []) : [];

    // 3. 渲染畫面 (維持你的 UI 規範)
    initDates();    // 重新產生日期
    renderPool();   // 更新左側人員清單
    renderTable();  // 更新班表表格 (文字純黑、Deadline 放大置前)
    
    console.log(`✅ ${year}_${month} 資料同步完成`);
}

// 同時修改 initDates，讓它在每次日期變動時記住當下位置
const originalInitDates = initDates;
initDates = function() {
    originalInitDates();
    localStorage.setItem('stay_year', document.getElementById('set-year').value);
    localStorage.setItem('stay_month', document.getElementById('set-month').value);
};


// 讓勾選框具備單選功能（選一個就會取消另一個）
function bindCheckboxSingleSelect(selector) {
    document.querySelectorAll(selector).forEach(box => {
        box.addEventListener('change', function() {
            if(this.checked) document.querySelectorAll(selector).forEach(b => { if(b !== this) b.checked = false; });
        });
    });
}

// 核心工具：偵測該人員本月出現次數最多的班別
function detectMainShift(nurseId) {
    let counts = { D: 0, E: 0, N: 0 };
    dateList.forEach(d => {
        if (!d.isBuffer) {
            let s = schedule[`${nurseId}-${d.dateStr}`];
            if (counts[s] !== undefined) counts[s]++;
        }
    });
    let max = Object.keys(counts).reduce((a, b) => counts[a] >= counts[b] ? a : b);
    return counts[max] > 0 ? max : 'D';
}

// 智慧一鍵排班：根據上月剩餘天數自動計算轉班與休假上限
/* ============================================================
   1. 視覺與顏色修正 (符合 #353866 與 純黑文字)
   ============================================================ */
   function applyVisualPreferences() {
    // 強制將按鈕改為指定顏色
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
        btn.style.backgroundColor = '#353866';
        btn.style.color = '#ffffff';
    });
}

/* ============================================================
   2. 優化後的一鍵排班 (解決空班與無法執行問題)
   ============================================================ */
/* ==========================================
   1. 新增工具函式：計算到目前為止的工作天數
   (這能保證工作少的人，不會被系統亂砍班)
   ========================================== */
   function countWorkDaysUntil(nurseId, upToIdx) {
    let count = 0;
    for (let i = 7; i < upToIdx; i++) {
        const key = `${nurseId}-${dateList[i].dateStr}`;
        const s = schedule[key];
        // 只要是 D, E, N, OUT, FLOW 都算上班
        if (['D', 'E', 'N', 'OUT', 'FLOW'].includes(s)) {
            count++;
        }
    }
    return count;
}

/* ==========================================
   2. 修正版一鍵排班 (autoFillSmart)
   ========================================== */
   function autoFillSmart() {
    try {
        if(!confirm('執行【補位排班】：\n僅針對空白格子進行自動排班，保留已手動輸入之班別。')) return;

        const reqD = parseInt(document.getElementById('req-D').value) || 0;
        const reqE = parseInt(document.getElementById('req-E').value) || 0;
        const reqN = parseInt(document.getElementById('req-N').value) || 0;
        const dailyRequirements = { D: reqD, E: reqE, N: reqN };

        // 1. 確保所有人都有主班別
        activeNurses.forEach(nurse => {
            if (!nurse.mainShift) nurse.mainShift = detectMainShift(nurse.id); 
        });

        // 【修正點 1】刪除原本的「初始化清空格子」階段
        // 這樣 schedule[key] 裡原本手動排好的 D/E/N/OFF 就會被保留下來

        // 3. 開始每日排班 (從第 8 天 idx=7 開始)
        for (let idx = 7; idx < dateList.length; idx++) {
            const d = dateList[idx];

            // A. 填入非 FLOW 人員的主班別
            activeNurses.forEach(nurse => {
                const key = `${nurse.id}-${d.dateStr}`;
                
                // 【修正點 2】如果這格已經有值（手動排的），或者被鎖定，就絕對不要動它
                if (schedule[key] !== '' && schedule[key] !== undefined) return; 

                let mShift = nurse.mainShift || 'D';
                if (nurse.mainShift !== 'FLOW') {
                    // 檢查轉班規則，過不去就給 OFF
                    schedule[key] = canWorkThisShift(nurse.id, idx, mShift) ? mShift : 'OFF';
                }
            });

            // B. 人力過剩處理
            ['D', 'E', 'N'].forEach(shiftType => {
                let staff = activeNurses.filter(n => schedule[`${n.id}-${d.dateStr}`] === shiftType);
                
                while (staff.length > dailyRequirements[shiftType]) {
                    // 【修正點 3】過濾掉手動排好或鎖定的格子，這些人不參與「被砍班」
                    // 我們只針對「自動產生」且「未鎖定」的人進行砍班 (這需要判斷，但最保險是只砍未鎖定的)
                    const removableStaff = staff.filter(n => {
                        const k = `${n.id}-${d.dateStr}`;
                        return !(window.lockedCells || []).includes(k);
                    });

                    if (removableStaff.length === 0) break; // 如果剩下的全都鎖定了，就不再砍班

                    removableStaff.sort((a, b) => {
                        // 排序邏輯維持不變
                        let workA = 0, workB = 0;
                        for(let i=7; i<idx; i++) {
                            const sA = schedule[`${a.id}-${dateList[i].dateStr}`];
                            const sB = schedule[`${b.id}-${dateList[i].dateStr}`];
                            if(['D','E','N','OUT','公','FLOW'].includes(sA)) workA++;
                            if(['D','E','N','OUT','公','FLOW'].includes(sB)) workB++;
                        }
                        return (workB - workA) + (Math.random() * 0.1);
                    });
                    
                    const target = removableStaff.shift();
                    schedule[`${target.id}-${d.dateStr}`] = 'OFF';
                    
                    // 重新更新 staff 列表以進行下一次迴圈判斷
                    staff = activeNurses.filter(n => schedule[`${n.id}-${d.dateStr}`] === shiftType);
                }
            });

            // C. 人力不足補位 (Flow Team)
            ['D', 'E', 'N'].forEach(shiftType => {
                let current = activeNurses.filter(n => schedule[`${n.id}-${d.dateStr}`] === shiftType).length;
                if (current < dailyRequirements[shiftType]) {
                    const flows = activeNurses.filter(n => n.mainShift === 'FLOW' && (schedule[`${n.id}-${d.dateStr}`] === '' || schedule[`${n.id}-${d.dateStr}`] === undefined));
                    for (let f of flows) {
                        if (current < dailyRequirements[shiftType] && canWorkThisShift(f.id, idx, shiftType)) {
                            schedule[`${f.id}-${d.dateStr}`] = shiftType;
                            current++;
                        }
                    }
                }
            });

            // D. 最後保底：沒班的一律給 OFF
            activeNurses.forEach(nurse => {
                const key = `${nurse.id}-${d.dateStr}`;
                if (schedule[key] === '' || schedule[key] === undefined) schedule[key] = 'OFF';
            });
        }

        save();
        renderTable(); 
        updateStats(); // 確保紅框與統計同步更新
        alert('補位排班完成！已保留手動調整內容。');
    } catch (e) {
        console.error("排班執行錯誤:", e);
    }
}

// 輔助函式：檢查規則
function canWorkThisShift(nurseId, dateIdx, targetShift) {
    if (!targetShift || targetShift === 'OFF') return true;

    // 1. 取得前一天的班別
    const prevKey = `${nurseId}-${dateList[dateIdx - 1].dateStr}`;
    // 優先順序：預假 > 班表紀錄 > 預設 OFF
    let prevS = leaves.includes(prevKey) ? 'OFF' : (schedule[prevKey] || 'OFF');

    // 2. 轉班規則 (禁止：N→D, N→E, E→D)
    // 如果發生衝突，回傳 false 讓主程式今天給他 OFF
    if (prevS === 'N' && (targetShift === 'D' || targetShift === 'E')) return false;
    if (prevS === 'E' && targetShift === 'D') return false;

    // 3. 連續天數檢查 (排除 OFF, 喪, 休, 預假)
    let workCount = 0;
    // 往前掃描，直到遇到休假為止
    for (let i = dateIdx - 1; i >= 0; i--) {
        const ck = `${nurseId}-${dateList[i].dateStr}`;
        const cs = schedule[ck] || 'OFF';
        const isPre = leaves.includes(ck);
        
        // 只要是工作班別且不是預假，就計入連續天數
        if (['D', 'E', 'N', 'OUT', 'FLOW'].includes(cs) && !isPre) {
            workCount++;
        } else {
            break;
        }
    }

    // 取得該人員的連續上班上限
    let limit = (targetShift === 'N') ? 5 : 6;
    
    // 如果今天再排下去就超標了，回傳 false
    if (workCount >= limit) return false;

    return true;
}

// 輔助函式：計算到目前為止的總休假天數
function countOffDays(nurseId, upToIdx) {
    let count = 0;
    for (let i = 7; i < upToIdx; i++) {
        const s = schedule[`${nurseId}-${dateList[i].dateStr}`];
        // 計入 OFF、喪假與預假
        if (s === 'OFF' || s === '喪' || leaves.includes(`${nurseId}-${dateList[i].dateStr}`)) {
            count++;
        }
    }
    return count;
}

// 輔助函式：檢查規則
function canWorkThisShift(nurseId, dateIdx, targetShift) {
    if (!targetShift || targetShift === 'OFF') return true;

    // 1. 取得前一天的班別
    const prevKey = `${nurseId}-${dateList[dateIdx - 1].dateStr}`;
    // 優先順序：預假 > 班表紀錄 > 預設 OFF
    let prevS = leaves.includes(prevKey) ? 'OFF' : (schedule[prevKey] || 'OFF');

    // 2. 轉班規則 (禁止：N→D, N→E, E→D)
    // 如果發生衝突，回傳 false 讓主程式今天給他 OFF
    if (prevS === 'N' && (targetShift === 'D' || targetShift === 'E')) return false;
    if (prevS === 'E' && targetShift === 'D') return false;

    // 3. 連續天數檢查 (排除 OFF, 喪, 休, 預假)
    let workCount = 0;
    // 往前掃描，直到遇到休假為止
    for (let i = dateIdx - 1; i >= 0; i--) {
        const ck = `${nurseId}-${dateList[i].dateStr}`;
        const cs = schedule[ck] || 'OFF';
        const isPre = leaves.includes(ck);
        
        // 只要是工作班別且不是預假，就計入連續天數
        if (['D', 'E', 'N', 'OUT', 'FLOW'].includes(cs) && !isPre) {
            workCount++;
        } else {
            break;
        }
    }

    // 取得該人員的連續上班上限
    let limit = (targetShift === 'N') ? 5 : 6;
    
    // 如果今天再排下去就超標了，回傳 false
    if (workCount >= limit) return false;

    return true;
}

let tempBatchData = {}; // 暫存批次編輯內容

// 開啟批次編輯視窗（編輯上月 14-20 號班別）
function openBatchEdit() {
const modal = document.getElementById('batchEditModal');
const header = document.getElementById('batch-header');
const body = document.getElementById('batch-body');

const targetDates = dateList.slice(0, 7);

header.innerHTML = '<th class="p-3 border bg-slate-800 text-white w-24">姓名</th>' + 
    targetDates.map(d => `<th class="p-2 border bg-slate-700 text-white">${d.display}</th>`).join('');

body.innerHTML = activeNurses.map((n, idx) => {
    const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-blue-50/50';
    
    return `<tr class="${rowBg} hover:bg-amber-50 transition-colors">
        <td class="p-2 border font-bold text-slate-700 sticky left-0 z-10 bg-inherit shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
            ${n.name}
        </td>
        ${targetDates.map(d => {
            const key = `${n.id}-${d.dateStr}`;
            const currentShift = schedule[key] || 'OFF';
            
            const getShiftColor = (s) => {
                if (s === 'D') return 'text-blue-600';
                if (s === 'E') return 'text-amber-600';
                if (s === 'N') return 'text-purple-600';
                if (s === 'OUT') return 'text-emerald-600';
                return 'text-slate-400';
            };

            return `
            <td class="border p-1">
                <select data-key="${key}" 
                        onchange="this.className='batch-select w-full p-1 border rounded font-bold ' + (this.value==='OFF'?'text-slate-400':(this.value==='D'?'text-blue-600':(this.value==='E'?'text-amber-600':(this.value==='N'?'text-purple-600':'text-emerald-600'))))"
                        class="batch-select w-full p-1 border rounded font-bold ${getShiftColor(currentShift)}">
                    <option value="OFF" ${currentShift==='OFF'?'selected':''}>OFF</option>
                    <option value="D" ${currentShift==='D'?'selected':''}>D</option>
                    <option value="E" ${currentShift==='E'?'selected':''}>E</option>
                    <option value="N" ${currentShift==='N'?'selected':''}>N</option>
                    <option value="OUT" ${currentShift==='OUT'?'selected':''}>公</option>
                    <option value="FLOW" ${currentShift==='FLOW'?'selected':''}>FLOW</option>
                </select>
            </td>`;
        }).join('')}
    </tr>`;
}).join('');

modal.style.display = 'flex';
}

// 批次編輯：一鍵清除為 OFF
function clearBatchSelects() {
if(confirm('確定要將此畫面中所有的班別都改為 OFF 嗎？(尚未儲存前不會影響主班表)')) {
    const selects = document.querySelectorAll('.batch-select');
    selects.forEach(sel => {
        sel.value = 'OFF';
    });
}
}

// 儲存批次編輯的班別
function saveBatchEdit() {
const selects = document.querySelectorAll('.batch-select');
selects.forEach(sel => {
    const key = sel.getAttribute('data-key');
    schedule[key] = sel.value;
});

save(); 
renderTable(); 
closeBatchEdit();
alert('上月班表已更新！');
}

// 關閉批次編輯視窗
function closeBatchEdit() {
document.getElementById('batchEditModal').style.display = 'none';
}

// 清空班表 (保留預假、公出、上月班表)
function clearScheduleOnly() {
    if(confirm('確定清空？(將保留預假、公出與上月班表)')) {
        activeNurses.forEach(nurse => {
            let mainShift = detectMainShift(nurse.id);
            dateList.forEach(d => { 
                const key = `${nurse.id}-${d.dateStr}`;
                if(!d.isBuffer && !leaves.includes(key) && schedule[key] !== 'OUT') {
                    schedule[key] = mainShift; 
                }
            });
        });
        save(); renderTable();
    }
}

// 初始化日期範圍邏輯
function initDates() {
    dateList = [];
    const year = parseInt(document.getElementById('set-year').value);
    const month = parseInt(document.getElementById('set-month').value);
    if(!year || !month) return;
    const mainStart = new Date(year, month - 2, 21);
    const mainEnd = new Date(year, month - 1, 20);
    const bufferStart = new Date(mainStart); bufferStart.setDate(bufferStart.getDate() - 7);
    document.getElementById('range-text').innerText = `${mainStart.toLocaleDateString('zh-TW')} ~ ${mainEnd.toLocaleDateString('zh-TW')}`;
    let temp = new Date(bufferStart);
    while (temp <= mainEnd) {
        dateList.push({ dateStr: temp.toISOString().split('T')[0], display: `${temp.getMonth() + 1}/${temp.getDate()}`, isBuffer: temp < mainStart, isStartDay: temp.getTime() === mainStart.getTime() });
        temp.setDate(temp.getDate() + 1);
    }
    renderTable();
}

// 主渲染函數：繪製表頭、人員列與格子
function renderTable() {
    
    // 1. 產生日期表頭
// 修改 renderTable 內產生表頭的邏輯
    document.getElementById('t-header').innerHTML = 
        '<th class="p-3 sticky-col bg-slate-800 min-w-[180px]">人員 (主班別)</th>' + 
        dateList.map((d, idx) => {
            const bgColor = d.isBuffer ? 'bg-slate-700 text-slate-400' : '';
            return `<th class="p-2 border border-slate-700 min-w-[55px] text-[10px] ${bgColor}">
                <div class="flex flex-col items-center gap-1">
                    ${d.display}
                    ${!d.isBuffer ? `<button onclick="toggleColumnLock('${d.dateStr}')" class="text-[10px] px-1 bg-slate-600 hover:bg-slate-500 rounded">🔒</button>` : ''}
                </div>
            </th>`;
        }).join('') +
        '<th class="p-2 bg-slate-700 min-w-[60px]">休假</th>' +
        '<th class="p-2 bg-blue-900 text-white min-w-[60px]">出勤</th>';
    // 2. 產生人員資料列
    document.getElementById('t-body').innerHTML = activeNurses.map(n => {
        let currentMain = n.mainShift || 'D';
        let totalOff = 0;   // 休假計數
        let totalWork = 0;  // 上班計數
        
        const rowHtml = dateList.map((d, idx) => {
            const key = `${n.id}-${d.dateStr}`;
            const s = schedule[key] || '';
            const isPre = leaves.includes(key);
            const isLocked = (window.lockedCells || []).includes(key); 
            
            // --- 關鍵修改：定義預測區變數 ---
            const isForecast = idx >= dateList.length - 3; 
            
        // --- 休假統計 (休、預、喪) ---
        if (!d.isBuffer) {
            if (isPre || s === 'OFF' || s === '休' || s === '喪') {
                totalOff++; // 預、休、喪、OFF 全部計入休假
            } else {
                const workShifts = ['D', 'E', 'N', 'OUT', '公', 'FLOW'];
                if (workShifts.includes(s)) {
                    totalWork++; // 只有在「不是預假」且為上班字串時才計入出勤
                }
            }
        }

            /** --- C. 連續天數檢查 (排除 FLOW) --- **/
            let isOverLimit = false; 
            if (s !== 'OFF' && s !== '喪' && s !== '' && s !== 'FLOW' && !isPre) {
                let count = 0;
                for (let i = idx; i >= 0; i--) {
                    const ck = `${n.id}-${dateList[i].dateStr}`;
                    const cs = schedule[ck] || '';
                    const cp = leaves.includes(ck);
                    if (cs !== 'OFF' && cs !== '喪' && cs !== '' && cs !== 'FLOW' && !cp) {
                        count++;
                    } else {
                        break;
                    }
                }
                let limit = (s === 'N') ? 5 : 6;
                if (count > limit) isOverLimit = true;
            }
            
            /** --- D. 轉班規則檢查 --- **/
            let isTransitionError = false;
            if (idx > 0 && s !== 'OFF' && s !== '喪' && s !== '' && s !== 'FLOW' && !isPre) {
                const prevKey = `${n.id}-${dateList[idx-1].dateStr}`;
                const prevS = leaves.includes(prevKey) ? 'OFF' : (schedule[prevKey] || 'OFF');
                if ((prevS === 'N' && (s === 'D' || s === 'E')) || (prevS === 'E' && s === 'D')) {
                    isTransitionError = true;
                }
            }

            const sClass = isPre ? '' : (s === '' ? 'shift-EMPTY' : `shift-${s}`);
            
            /** 樣式組合 **/
            let limitStyle = '';
            if (isOverLimit || isTransitionError) {
                limitStyle = 'border: 3px solid #ef4444 !important; background-color: #fee2e2 !important;';
            }
            if (isLocked) {
                limitStyle += 'background-color: #cbd5e1 !important;';
            }
            if (isForecast) {
                limitStyle += 'opacity: 0.85; background-color: #f8fafc;';
            }

            return `<td class="border cell-container ${d.isBuffer?'buffer-day':''} ${sClass}" 
                        style="${limitStyle}" 
                        oncontextmenu="handleRightClick(event, '${key}')"> 
                ${isPre ? 
                    `<div onclick="toggleLeave('${key}')" class="is-pre-leave w-full h-full flex items-center justify-center cursor-pointer font-bold text-red-500">預</div>` : 
                (isLeaveMode ? 
                    `<div onclick="toggleLeave('${key}')" class="w-full h-full cursor-pointer"></div>` : `
                    <div class="relative w-full h-full">
                        ${isLocked ? '<span class="absolute top-0 right-0 text-[10px] select-none z-20">🔒</span>' : ''}
                        <select onchange="updateShift('${n.id}', '${d.dateStr}', this.value)" 
                                ${isLocked ? 'disabled' : ''} 
                                class="shift-select ${sClass} w-full h-full bg-transparent font-bold text-center cursor-pointer outline-none relative z-10">
                                    <option value="" ${s===''?'selected':''}></option>
                                    <option value="OFF" ${s==='OFF'?'selected':''}>休</option>
                                    <option value="D" ${s==='D'?'selected':''}>D</option>
                                    <option value="E" ${s==='E'?'selected':''}>E</option>
                                    <option value="N" ${s==='N'?'selected':''}>N</option>
                                    <option value="喪" ${s==='喪'?'selected':''}>喪</option> 
                                    <option value="OUT" ${s==='OUT'?'selected':''}>公</option>
                                    <option value="FLOW" ${s==='FLOW'?'selected':''}>FLOW</option>
                        </select>
                    </div>
                `)}
            </td>`;
        }).join('');
        
        const selectColor = currentMain === 'FLOW' ? 'bg-slate-200 text-slate-700' : `bg-main-${currentMain}`;
        const offAlertClass = totalOff < 8 ? 'text-red-600 font-black bg-red-50' : 'text-indigo-700';

        return `<tr>
                <td class="p-2 border sticky-col font-bold bg-white flex items-center shadow-sm">
                    <span class="drag-handle text-slate-300 mr-1 cursor-move">☰</span>
                    
                    <button onclick="toggleRowLock('${n.id}')" 
                            title="鎖定/解鎖整列"
                            class="mr-1 text-[12px] hover:scale-110 transition-transform">🔒</button>

                    <span class="truncate text-xs mr-2 text-black font-black" style="color: #000000 !important;">
                        ${n.name}
                    </span>

                    <select onchange="changeNurseMainShift(${n.id}, this.value)" 
                            style="color: #000000 !important;"
                            class="text-[10px] px-1 py-0.5 rounded border-none font-bold cursor-pointer outline-none ${selectColor}">
                        <option value="D" ${currentMain === 'D' ? 'selected' : ''}>D</option>
                        <option value="E" ${currentMain==='E'?'selected':''}>E</option>
                        <option value="N" ${currentMain==='N'?'selected':''}>N</option>
                        <option value="FLOW" ${currentMain==='FLOW'?'selected':''}>F</option>
                    </select>

                    <button onclick="removeFromActive(${n.id})" 
                            class="ml-auto text-red-500 hover:text-red-700 font-bold" 
                            style="font-size: 1.2rem;">×</button>
                </td>
                ${rowHtml}
                <td class="border text-center font-black text-black" style="color: #000000 !important;">${totalOff}</td>
                <td class="border text-center font-black text-blue-800 bg-blue-50">${totalWork}</td>
            </tr>`;
    }).join('');

 if (typeof updateStats === 'function') updateStats();

 // 🔥 關鍵修正：重新初始化拖拉功能
 initSortable(); 
}

// 建立一個獨立的初始化函式
function initSortable() {
 const el = document.getElementById('t-body');
 if (!el) return;

 // 如果已經有 Sortable 實例，先銷毀它以免重複綁定
 if (window.sortableInstance) {
     window.sortableInstance.destroy();
 }

 // 重新綁定拖拉邏輯
 window.sortableInstance = Sortable.create(el, {
     handle: '.drag-handle', // 確保只有點擊 ☰ 才能拖拉
     animation: 150,
     onEnd: function (evt) {
         // 取得拖動後的新順序
         const rows = Array.from(el.querySelectorAll('tr'));
         const newActiveNurses = [];
         
         rows.forEach(row => {
             // 透過行內的姓名或 ID 找回人員對象 (假設您的按鈕內有 nurseId)
             // 這裡最安全的方式是從 activeNurses 比對順序
             const name = row.querySelector('span.truncate').innerText.trim();
             const nurse = activeNurses.find(n => n.name === name);
             if (nurse) newActiveNurses.push(nurse);
         });

         // 更新全域變數
         activeNurses = newActiveNurses;
         
         // 存檔並同步雲端
         save(); 
         console.log("✅ 順序已調整並同步雲端");
     }
 });
}
//人員橫向一鍵鎖定
function toggleRowLock(nurseId) {
    const dates = dateList.map(d => d.dateStr);
    const keys = dates.map(d => `${nurseId}-${d}`);
    const allLocked = keys.every(k => (window.lockedCells || []).includes(k));

    keys.forEach(k => {
        if (allLocked) {
            window.lockedCells = (window.lockedCells || []).filter(existing => existing !== k);
        } else {
            if (!(window.lockedCells || []).includes(k)) {
                window.lockedCells = window.lockedCells || [];
                window.lockedCells.push(k);
            }
        }
    });
    save();
    renderTable();
}

// 全域變數初始化
if (!window.lockedCells) {
    window.lockedCells = JSON.parse(localStorage.getItem('lockedCells_v22')) || [];
}

// 處理右鍵點擊
function handleRightClick(event, key) {
    event.preventDefault(); // 阻止瀏覽器預設右鍵選單
    
    const index = window.lockedCells.indexOf(key);
    if (index > -1) {
        window.lockedCells.splice(index, 1); // 解鎖
    } else {
        window.lockedCells.push(key); // 鎖定
    }
    
    localStorage.setItem('lockedCells_v22', JSON.stringify(window.lockedCells));
    renderTable(); // 重新渲染畫面
    return false;
}

//直行鎖定功能
function toggleColumnLock(dateStr) {
    // 找出目前畫面上的所有人員 ID
    const nurseIds = activeNurses.map(n => n.id);
    
    // 檢查這一天是否已經全部被鎖定了
    const allLocked = nurseIds.every(id => {
        const key = `${id}-${dateStr}`;
        return (window.lockedCells || []).includes(key);
    });

    nurseIds.forEach(id => {
        const key = `${id}-${dateStr}`;
        if (allLocked) {
            // 如果原本是全鎖，就全部解鎖
            window.lockedCells = (window.lockedCells || []).filter(k => k !== key);
        } else {
            // 如果原本沒全鎖，就全部加進鎖定清單
            if (!(window.lockedCells || []).includes(key)) {
                window.lockedCells = window.lockedCells || [];
                window.lockedCells.push(key);
            }
        }
    });

    // 儲存並重新渲染畫面
    save(); // 確保鎖定狀態有存到 localStorage
    renderTable();
}

// 更新單格班別 (含轉班防呆警告)
function updateShift(nid, date, val) { 
    const idx = dateList.findIndex(d => d.dateStr === date);
    
    if (idx > 0) {
        const prevKey = `${nid}-${dateList[idx-1].dateStr}`;
        // 取得前一天的班別，若無則預設為 OFF
        const prevShift = schedule[prevKey] || 'OFF';
        
        // 使用 trim() 確保沒有多餘空白，並統一判斷邏輯
        const currentVal = val.trim();

        /** * Alarm 警示邏輯 
         */
        // 規則 A: N 班後必須 OFF (不能接 D 或 E)
        if (prevShift === 'N' && (currentVal === 'D' || currentVal === 'E')) {
            alert("⚠️ 違反轉班規則：N 班後必須休假 (OFF)，不可直接接 D 或 E 班！");
        } 
        // 規則 B: E 班後不能接 D
        else if (prevShift === 'E' && currentVal === 'D') {
            alert("⚠️ 違反轉班規則：小夜 (E) 班後不可接 D 班！");
        }
    }

    // 無論是否有錯，都保留使用者的設定
    schedule[`${nid}-${date}`] = val;
    save(); 
    renderTable(); 
}

// 更新統計數據：護病比計算與底部實到人數
function updateStats() {
    const reqD = parseInt(document.getElementById('req-D').value);
    const totalBeds = parseInt(document.getElementById('total-beds').value) || 0;

    const settings = {
        D: { req: parseInt(document.getElementById('req-D').value) || 0, lBeds: parseInt(document.getElementById('l-beds-D').value) || 0 },
        E: { req: parseInt(document.getElementById('req-E').value) || 0, lBeds: parseInt(document.getElementById('l-beds-E').value) || 0 },
        N: { req: parseInt(document.getElementById('req-N').value) || 0, lBeds: parseInt(document.getElementById('l-beds-N').value) || 0 }
    };

    // 更新標頭的比例顯示
    ['D', 'E', 'N'].forEach(type => {
        const displaySpan = document.getElementById(`display-req-${type}`);
        if (displaySpan) displaySpan.innerText = settings[type].req;
        const ratioDisplay = document.getElementById(`ratio-${type}`);
        if (ratioDisplay) {
            let req = settings[type].req;
            let lBeds = settings[type].lBeds;
            if (req > 1) {
                let ratio = ((totalBeds - lBeds) / (req - 1)).toFixed(1);
                ratioDisplay.innerText = `1:${ratio}`;
            } else if (req === 1) {
                ratioDisplay.innerText = `1:${totalBeds}`;
            } else {
                ratioDisplay.innerText = `1:0`;
            }
        }
    });

    let footHtml = '';
    const rowsToStat = ['D', 'E', 'N', 'OFF'];

    rowsToStat.forEach(type => {
        let rowLabel = type === 'OFF' ? '每日總休假人數' : `${type} 班實到人數`;
        let rowBg = type === 'OFF' ? 'bg-slate-200' : 'bg-slate-100';
        
        let rowCount = `<tr class="text-center font-bold text-xs">
            <td class="p-2 border sticky-col ${rowBg} text-black font-black">${rowLabel}</td>`;

        dateList.forEach(d => {
            let count = 0;
            if (!d.isBuffer) {
                activeNurses.forEach(n => {
                    const key = `${n.id}-${d.dateStr}`;
                    const s = schedule[key] || '';
                    const isPre = leaves.includes(key);
                    if (type === 'OFF') {
                        if (isPre || s === 'OFF' || s === '休' || s === '喪') count++;
                    } else {
                        if (s === type && !isPre) count++;
                    }
                });
            }

            // --- 樣式邏輯修正：加入超出人數紅框 ---
            // --- 強效樣式邏輯：確保紅框顯示 ---
        let cellClass = ''; 
        let cellStyle = 'color: #000000 !important; font-weight: 900;'; // 預設純黑極粗體

        if (d.isBuffer) {
            cellClass = 'bg-slate-100 text-slate-400';
        } else if (type !== 'OFF') {
            const isShortage = count < settings[type].req; // 人數不足
            const isOverflow = count > settings[type].req; // 人數超出

            if (isShortage) {
                cellClass = 'bg-rose-50 text-rose-600'; // 不足：粉底紅字
            } else if (isOverflow) {
                // --- 超出：白底 + 絕對優先的紅框 ---
                cellClass = 'bg-white text-emerald-700';
                // 強制加上 4px 的粗紅框，並確保它在所有邊界都顯示
                cellStyle += 'outline: 3px solid #ff0000 !important; outline-offset: -4px; position: relative; z-index: 10;';
            } else {
                cellClass = 'bg-emerald-50 text-emerald-600'; // 剛好
            }
        } else {
            cellClass = 'bg-slate-50 text-black font-black'; // OFF 列
        }

        rowCount += `<td class="border p-2 ${cellClass}" style="${cellStyle}">
            ${d.isBuffer ? '-' : count}
        </td>`;
        });
        footHtml += rowCount + '<td></td></tr>';
    });

    // Leader 檢查區
    let lRow = `<tr class="text-center font-bold text-xs"><td class="p-3 border sticky-col bg-amber-50 text-black font-black">Leader 檢查</td>`;
    dateList.forEach(d => {
        if (d.isBuffer) lRow += `<td class="border bg-slate-100">-</td>`;
        else {
            let miss = [];
            ['D','E','N'].forEach(t => { 
                if(!activeNurses.some(n => n.isLeader && (schedule[`${n.id}-${d.dateStr}`] === t || (t==='D' && schedule[`${n.id}-${d.dateStr}`]==='OUT')))) miss.push(t); 
            });
            lRow += miss.length ? `<td class="border bg-rose-50 text-rose-600 text-[9px]">缺 ${miss.join(',')}</td>` : `<td class="border bg-emerald-50 text-emerald-600">✓</td>`;
        }
    });

    // 最後組合到 t-foot，加上最後的統計空格
    document.getElementById('t-foot').innerHTML = footHtml + lRow + '<td colspan="2" class="bg-slate-100"></td></tr>';
}

// 新增人員到總名單
async function addNurse() { // 加入 async
    const name = document.getElementById('n-name').value; 
    if (!name) return;
    
    let nurse = { id: Date.now(), name, isLeader: false, isIntern: false, isUnready: false, isSupport: false };
    document.querySelectorAll('.role-checkbox-new').forEach(box => { 
        if(box.checked) nurse[box.dataset.role] = true; 
    });
    
    pool.push(nurse); 
    document.getElementById('n-name').value = ''; 
    
    // 🔥 儲存到本地
    save(); 
    
    // 🔥 同步到雲端全域名單 (Settings/NurseList)
    if (window.saveGlobalNurses) {
        await window.saveGlobalNurses(pool); 
    }
    
    renderPool();
}


// 渲染人員名單顯示
function renderPool() {
    document.getElementById('nurse-pool-display').innerHTML = pool.map(n => `<div class="bg-white border p-2 rounded flex items-center gap-2 text-xs"><span class="font-bold">${n.name}</span><button onclick="openEdit(${n.id})" class="text-indigo-500">✎</button><button onclick="removeNurse(${n.id})" class="text-red-300">×</button></div>`).join('');
    document.getElementById('pool-select').innerHTML = pool.filter(p => !activeNurses.some(a => a.id === p.id)).map(n => `<option value="${n.id}">${n.name}</option>`).join('');
}

// 從名單加入到班表
// 從名單加入到班表 (修正：同步更新人員的主班別屬性)
function addToSchedule() {
    const id = parseInt(document.getElementById('pool-select').value); 
    if(!id) return;
    
    // 1. 從人員池中複製資料
    const n = pool.find(x => x.id === id); 
    let newActiveNurse = JSON.parse(JSON.stringify(n));
    
    // 2. 獲取當前在介面上選擇的預設班別 (D/E/N)
    const selectedShift = document.getElementById('select-shift').value;
    
    // --- 修正處：同步設定人員的主班別屬性，這樣名字後面的標籤才會顯示正確的班別與顏色 ---
    newActiveNurse.mainShift = selectedShift;
    
    // 3. 加入到活動人員名單
    activeNurses.push(newActiveNurse);
    
    // 4. 自動填充該人員本月 (21號以後) 的班別為所選班別
    dateList.forEach(d => { 
        if(!d.isBuffer) {
            schedule[`${n.id}-${d.dateStr}`] = selectedShift; 
        }
    });
    
    save(); 
    renderPool(); 
    renderTable();
}

// 開啟人員編輯視窗
function openEdit(id) {
    const n = pool.find(x => x.id === id); document.getElementById('edit-id').value = id; document.getElementById('edit-name').value = n.name;
    document.querySelectorAll('.role-checkbox-edit').forEach(box => box.checked = n[box.dataset.role]);
    document.getElementById('editModal').style.display = 'flex';
}

// 儲存編輯後的人員資料
async function saveEdit() {
    const id = parseInt(document.getElementById('edit-id').value);
    const idx = pool.findIndex(x => x.id === id);
    pool[idx].name = document.getElementById('edit-name').value;
    document.querySelectorAll('.role-checkbox-edit').forEach(box => pool[idx][box.dataset.role] = box.checked);
    
    const aIdx = activeNurses.findIndex(x => x.id === id); 
    if (aIdx !== -1) activeNurses[aIdx] = JSON.parse(JSON.stringify(pool[idx]));
    
    save(); 
    
    // 🔥 同步編輯後的名單到全域
    if (window.saveGlobalNurses) {
        await window.saveGlobalNurses(pool);
    }
    
    renderPool(); 
    renderTable(); 
    closeEdit();
}

// 產生人員稱謂標籤 (L, 實, 支等)
function getNameTag(n) { 
    let t = []; 
    if(n.isLeader) t.push('(L)'); 
    if(n.isIntern) t.push('(實)'); 
    if(n.isUnready) t.push('(未)'); 
    if(n.isSupport) t.push('(支)'); 
    return n.name + (t.length ? ' ' + t.join('') : ''); 
}

// 關閉編輯視窗、從班表移除人員、徹底刪除人員、預假切換、存檔邏輯等
function closeEdit() { document.getElementById('editModal').style.display = 'none'; }
function removeFromActive(id) { activeNurses = activeNurses.filter(n => n.id !== id); save(); renderPool(); renderTable(); }
async function removeNurse(id) { 
    if(confirm('徹底刪除人員？')) { 
        pool = pool.filter(x => x.id !== id); 
        activeNurses = activeNurses.filter(x => x.id !== id); 
        
        save(); 
        
        // 🔥 同步刪除雲端全域名單
        if (window.saveGlobalNurses) {
            await window.saveGlobalNurses(pool);
        }
        
        renderPool(); 
        renderTable(); 
    } 
}
async function toggleLeave(key) {
    // 1. 先處理資料邏輯
    const i = leaves.indexOf(key);
    if (i > -1) {
        leaves.splice(i, 1);
    } else {
        leaves.push(key);
    }

    // 2. 儲存到本地端 (LocalStorage)
    save();

    // 3. 🔥【這是關鍵】手動推送到雲端
    const year = document.getElementById('set-year').value;
    const month = document.getElementById('set-month').value;

    if (window.saveToFirebase) {
        // 這裡要把所有東西包起來，不然雲端會漏掉其他欄位
        const dataToSave = {
            schedule: schedule,
            activeNurses: activeNurses,
            pool: pool,
            leaves: leaves,  // 👈 這次變動的主角
            deadline: window.currentDeadline || ""
        };
        
        await window.saveToFirebase(dataToSave, year, month);
        console.log("✅ 預假資料已同步至雲端");
    }

    // 4. 最後才渲染畫面
    renderTable(); 
}

async function toggleMode() {
    isLeaveMode = !isLeaveMode; 
    
    const btn = document.getElementById('mode-btn');
    if (btn) btn.innerText = isLeaveMode ? "完成預假" : "進入預假模式";

    if (!isLeaveMode) { 
        console.log("正在同步預假資料至雲端...");
        
        const year = document.getElementById('set-year').value;
        const month = document.getElementById('set-month').value;

        // 🔥 [修正] 這裡要直接抓全域變數，並確保 leaves 不是 undefined
        if (window.saveToFirebase) {
            const allData = {
                schedule: schedule,
                activeNurses: activeNurses,
                pool: pool,
                leaves: leaves || [], // 確保不為空
                lockedCells: window.lockedCells || [],
                deadline: window.currentDeadline || ""
            };
            await window.saveToFirebase(allData, year, month);
            alert("預假資料已同步至雲端！"); // 加上提示才知道 GitHub 有跑完
        }
    }
    renderTable(); 
}

// 存檔到firebase資料庫
async function save() {
    const yEl = document.getElementById('set-year');
    const mEl = document.getElementById('set-month');
    const year = yEl ? yEl.value : new Date().getFullYear().toString();
    const month = mEl ? mEl.value : (new Date().getMonth() + 1).toString();

    const allData = {
        pool: pool,
        activeNurses: activeNurses,
        schedule: schedule,
        leaves: leaves,                  // 👈 補上這行，預假才不會重整消失
        lockedCells: window.lockedCells || [], // 👈 補上這行，鎖定才不會重整消失
        deadline: window.currentDeadline || "",
        stay_year: year,
        stay_month: month
    };

    if (window.saveToFirebase) {
        await window.saveToFirebase(allData, year, month);
    }
}


// 匯出班表為 CSV 檔案
function exportToXls() {
    if (typeof XLSX === 'undefined') {
        alert("找不到 Excel 組件，請檢查網路是否連線。");
        return;
    }

    try {
        // 1. 建立資料陣列，第一行是標題
        let exportData = [];
        let header = ["人員", "屬性"];
        
        // 加入日期標題
        dateList.forEach(d => {
            header.push(d.display);
        });
        header.push("休假總數", "工作總數");
        exportData.push(header);

        // 2. 逐一加入人員資料
        activeNurses.forEach(n => {
            let tag = n.isLeader ? "L" : (n.isIntern ? "實" : (n.isSupport ? "支" : "-"));
            let row = [n.name, tag];
            let offCount = 0;
            let workCount = 0;

            dateList.forEach(d => {
                const key = `${n.id}-${d.dateStr}`;
                const isPre = leaves.includes(key);
                let s = schedule[key] || '';
                
                // 決定顯示文字
                let displayVal = isPre ? "預" : (s === 'OFF' ? '休' : s);
                row.push(displayVal);

                // 統計總數
                if (!d.isBuffer) {
                    if (isPre || s === 'OFF' || s === '休' || s === '喪') offCount++;
                    else if (['D','E','N','OUT','公','FLOW'].includes(s)) workCount++;
                }
            });

            row.push(offCount, workCount);
            exportData.push(row);
        });

        // 3. 加入底部統計資料 (D/E/N/OFF)
        const statTypes = ['D', 'E', 'N', 'OFF'];
        statTypes.forEach(type => {
            let label = type === 'OFF' ? '每日總休假' : `${type}班實到`;
            let statRow = [label, ""]; // 屬性欄填空
            
            dateList.forEach(d => {
                let count = 0;
                if (!d.isBuffer) {
                    activeNurses.forEach(n => {
                        const key = `${n.id}-${d.dateStr}`;
                        const s = schedule[key] || '';
                        if (type === 'OFF') {
                            if (leaves.includes(key) || s === 'OFF' || s === '休' || s === '喪') count++;
                        } else {
                            if (s === type && !leaves.includes(key)) count++;
                        }
                    });
                }
                statRow.push(d.isBuffer ? "-" : count);
            });
            exportData.push(statRow);
        });

        // 4. 產生工作表並匯出
        const ws = XLSX.utils.aoa_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "班表資料");

        const fileName = `ShiftExport_${new Date().getTime()}.xlsx`;
        XLSX.writeFile(wb, fileName);

    } catch (err) {
        console.error("Excel Error:", err);
        alert("匯出失敗，錯誤訊息: " + err.message);
    }
}

// 啟用人員列的拖曳排序功能
function initSortable() { Sortable.create(document.getElementById('t-body'), { handle: '.drag-handle', animation: 150, onEnd: () => { 
    let newA = []; document.querySelectorAll('#t-body tr').forEach(tr => {
        let trBtn = tr.querySelector('button[onclick^="removeFromActive"]');
        if(trBtn) {
            let id = parseInt(trBtn.getAttribute('onclick').match(/\d+/)[0]);
            newA.push(activeNurses.find(a => a.id === id));
        }
    });
    activeNurses = newA; save();
}}); }
init();

// 變更人員的主屬性 (D/E/N) 並同步更新顏色與班別
function changeNurseMainShift(nurseId, newMain) {
const nurse = activeNurses.find(x => x.id === nurseId);
const poolNurse = pool.find(x => x.id === nurseId);
if (!nurse) return;

const oldMain = nurse.mainShift || 'D';
nurse.mainShift = newMain;
if (poolNurse) poolNurse.mainShift = newMain;

if (confirm(`已將 ${nurse.name} 的主屬性改為 ${newMain}。要自動將本月原本排 ${oldMain} 的格子換成 ${newMain} 嗎？`)) {
    dateList.forEach(d => {
        const key = `${nurse.id}-${d.dateStr}`;
        if (!d.isBuffer && (!schedule[key] || schedule[key] === oldMain || schedule[key] === '')) {
            schedule[key] = newMain;
        }
    });
}

save();
renderTable(); 
}

// 點擊儲存格時切換預假或循環班別
function handleCellClick(nurseId, dateStr, event) {
    if (isLeaveMode) { toggleLeave(`${nurseId}-${dateStr}`); return; }
    const key = `${nurseId}-${dateStr}`;
    const current = schedule[key] || 'OFF';
    const cycle = { 'D': 'E', 'E': 'N', 'N': 'OUT', 'OUT': 'FLOW', 'FLOW': 'OFF', 'OFF': 'D', '': 'D' };
    updateShift(nurseId, dateStr, cycle[current] || 'D');
}

// 加入鎖定檢查
function toggleLock(key) {
    const index = lockedCells.indexOf(key);
    if (index > -1) {
        lockedCells.splice(index, 1); // 解鎖
    } else {
        lockedCells.push(key); // 鎖定
    }
    localStorage.setItem('locked_v22', JSON.stringify(lockedCells)); // 存檔
    save();
    renderTable(); // 重畫畫面
}

// 清空班表 (完全清空，僅保留預假與公出)
function clearScheduleOnly() {
    if(confirm('確定要清空班表嗎？(已鎖定、預假、公出將保留)')) {
        activeNurses.forEach(nurse => {
            dateList.forEach(d => { 
                const key = `${nurse.id}-${d.dateStr}`;
                // 檢查是否鎖定
                const isLocked = (window.lockedCells || []).includes(key);
                if(!d.isBuffer && !leaves.includes(key) && schedule[key] !== 'OUT' && !isLocked) {
                    schedule[key] = ''; 
                }
            });
        });
        save(); renderTable();
    }
}

/**
 * 匯出班表：將目前所有的 schedule, leaves, lockedCells 存成一個 JSON 檔案
 */
function exportSchedule() {
    const data = {
        schedule: schedule,
        leaves: leaves,
        lockedCells: window.lockedCells || [],
        activeNurses: activeNurses // 連同目前在表上的人員名單一起存
    };
    
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    // 設定檔名，自動帶入今天的日期方便辨識
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `護理班表備份_${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * 匯入班表：讀取檔案並恢復所有設定
 */
async function importSchedule(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (confirm('匯入將會覆蓋目前的班表，確定嗎？')) {
                // 1. 先更新當前網頁的變數
                schedule = data.schedule || {};
                activeNurses = data.activeNurses || [];
                pool = data.pool || [];
                // 如果你的資料裡有 deadline，也把它帶進來
                window.currentDeadline = data.deadline || ""; 

                // 2. 取得目前的年份月份
                const year = document.getElementById('set-year').value;
                const month = document.getElementById('set-month').value;

                console.log("正在嘗試同步匯入資料至雲端...");

                // 3. 🔥 強制同步至 Firebase (確保呼叫 index.html 的函式)
                if (window.saveToFirebase) {
                    await window.saveToFirebase({
                        schedule: schedule,
                        activeNurses: activeNurses,
                        pool: pool,
                        deadline: window.currentDeadline // 確保 Deadline 被存進去
                    }, year, month);
                    
                    console.log("雲端同步指令已發送");
                } else {
                    console.error("找不到 window.saveToFirebase 函式！");
                }

                // 4. 同步全域名單 (解決跨月套用問題)
                if (window.saveGlobalNurses) {
                    await window.saveGlobalNurses(activeNurses);
                }

                // 5. 重新渲染畫面
                renderTable();
                alert('班表匯入成功，雲端已同步！');
            }
        } catch (err) {
            console.error("匯入出錯:", err);
            alert('檔案格式錯誤，或雲端連線失敗。');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function checkRules(nurseId, dateStr) {
    const key = `${nurseId}-${dateStr}`;
    const currentShift = schedule[key] || 'OFF';
    if (currentShift === 'OFF' || currentShift === 'FLOW') return false;

    // 1. 檢查連續上班天數 (往前推 5 天)
    let continuousDays = 0;
    let dateIdx = dateList.findIndex(d => d.dateStr === dateStr);
    
    for (let i = dateIdx; i >= 0; i--) {
        const checkKey = `${nurseId}-${dateList[i].dateStr}`;
        const s = schedule[checkKey] || 'OFF';
        if (s !== 'OFF' && s !== 'FLOW' && s !== '') {
            continuousDays++;
        } else {
            break;
        }
    }
    if (continuousDays > 5) return true; // 違反連 5 規則

    // 2. 檢查轉班花式 (前一天與今天的關係)
    if (dateIdx > 0) {
        const prevKey = `${nurseId}-${dateList[dateIdx - 1].dateStr}`;
        const prevShift = schedule[prevKey] || 'OFF';
        
        // N 班後隔天只能是 N 或 OFF
        if (prevShift === 'N' && (currentShift === 'D' || currentShift === 'E')) return true;
        // E 班後隔天不能是 D
        if (prevShift === 'E' && currentShift === 'D') return true;
    }

    return false;
}

//同步至雲端資料庫（firebase)
async function syncData() { // 或是叫 save()
    const allData = {
        schedule,
        activeNurses,
        pool,
        leaves,         // 👈 沒這行，預假存不進去
        lockedCells: window.lockedCells, // 👈 沒這行，鎖定存不進去
        deadline: window.currentDeadline
    };
    const year = document.getElementById('set-year').value;
    const month = document.getElementById('set-month').value;

    if (window.saveToFirebase) {
        await window.saveToFirebase(allData, year, month);
    }
}



