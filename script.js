/* script.js
   - 5x10 課表、拖曳選取、多節輸入
   - 衝堂偵測、課程清單同步、CSV 匯入匯出
   - JS 版簡化 optimizer（模擬 optimizer.py 行為）
   - 生成 30 分鐘 block 並分配
   - 瀏覽器通知提醒系統
*/

// ---------- 建表 ----------
const days = ["1","2","3","4","5"]; // 週一~週五 (data-day = "1".."5")
const periods = Array.from({length:10},(_,i)=>i+1); // 1..10
const tbody = document.getElementById("schedule-body");

for(let p of periods){
  const tr = document.createElement("tr");
  const th = document.createElement("th");
  th.textContent = `第 ${p} 節`;
  tr.appendChild(th);
  for(let d of days){
    const td = document.createElement("td");
    td.classList.add("cell");
    td.dataset.day = d;
    td.dataset.period = p;
    td.addEventListener("mousedown", cellMouseDown);
    td.addEventListener("mouseover", cellMouseOver);
    td.addEventListener("mouseup", cellMouseUp);
    tr.appendChild(td);
  }
  tbody.appendChild(tr);
}

// ---------- 全域狀態 ----------
let isMouseDown = false;
let selection = new Set(); // key = day-period
let dragStarted = false;
let courses = []; // 每個元素 {id, name, credit, type, sweet, cool, cells: [ "d-p", ... ], color}
let colorMap = {}; // name -> color

// helpers
function keyOf(cell){ return `${cell.dataset.day}-${cell.dataset.period}`; }
function cellByKey(k){ const [d,p]=k.split("-"); return document.querySelector(`td[data-day='${d}'][data-period='${p}']`); }

// ---------- 拖曳選取邏輯 ----------
function cellMouseDown(e){
  e.preventDefault();
  isMouseDown = true;
  dragStarted = true;
  const cell = e.currentTarget;
  toggleSelectCell(cell);
}
function cellMouseOver(e){
  if(isMouseDown){
    toggleSelectCell(e.currentTarget);
  }
}
function cellMouseUp(e){
  if(dragStarted){
    dragStarted = false;
    isMouseDown = false;
    if(selection.size>0){
      openCourseModal();
    }
  }
}
document.addEventListener("mouseup", ()=>{ isMouseDown=false; });

// 點選選取（切換）
function toggleSelectCell(cell){
  const k = keyOf(cell);
  if(selection.has(k)){
    selection.delete(k);
    cell.classList.remove("selected");
  } else {
    selection.add(k);
    cell.classList.add("selected");
  }
}

// ---------- Modal 表單 ----------
const modal = document.getElementById("courseModal");
const input_name = document.getElementById("input_name");
const input_credit = document.getElementById("input_credit");
const input_type = document.getElementById("input_type");
const input_type_other = document.getElementById("input_type_other");
const input_sweet = document.getElementById("input_sweet");
const input_cool = document.getElementById("input_cool");
document.getElementById("modalCancel").addEventListener("click", closeModal);
document.getElementById("modalSave").addEventListener("click", saveCourseFromModal);
input_type.addEventListener("change", ()=>{
  input_type_other.classList.toggle("hidden", input_type.value!=="其他");
});

function openCourseModal(){
  modal.classList.remove("hidden");
  input_name.focus();
}
function closeModal(){
  modal.classList.add("hidden");
  clearSelectionVisual();
}

function clearSelectionVisual(){
  selection.forEach(k=>{ const c=cellByKey(k); if(c) c.classList.remove("selected"); });
  selection.clear();
}

// ---------- 儲存課程並套用到格子 ----------
function saveCourseFromModal(){
  const name = input_name.value.trim();
  if(!name){ alert("請輸入課名"); return; }
  const credit = parseFloat(input_credit.value) || 0;
  let type = input_type.value;
  if(type==="其他"){ type = input_type_other.value.trim() || "其他"; }
  const sweet = parseInt(input_sweet.value) || 5;
  const cool = parseInt(input_cool.value) || 5;

  // detect conflict: any selected cell already occupied by DIFFERENT course?
  const conflicting = [];
  for(const k of selection){
    const c = cellByKey(k);
    if(c && c.dataset.courseId && c.dataset.courseId!==""){
      const id = c.dataset.courseId;
      const existing = courses.find(x=>x.id===id);
      if(existing && existing.name !== name){
        conflicting.push({key:k, existing});
      }
    }
  }
  if(conflicting.length>0){
    if(!confirm("偵測到衝堂：選取格子包含已被其他課程佔用。按「確定」覆蓋；按「取消」放棄。")) {
      closeModal();
      return;
    } else {
      // remove existing references for those cells
      for(const {key} of conflicting){
        const c = cellByKey(key);
        if(c){
          const sid = c.dataset.courseId;
          if(sid){
            const idx = courses.findIndex(x=>x.id===sid);
            if(idx>=0){
              // remove that cell from course record
              courses[idx].cells = courses[idx].cells.filter(x=>x!==key);
            }
            c.removeAttribute("data-course-id");
            c.classList.remove("occupied");
            c.textContent = "";
            c.style.backgroundColor = "";
          }
        }
      }
    }
  }

  // build new course or merge with existing same name
  let course = courses.find(c => c.name === name);
  if(!course){
    course = {
      id: "c"+Date.now()+Math.floor(Math.random()*1000),
      name, credit, type, sweet, cool, cells: []
    };
    courses.push(course);
    colorMap[name] = colorMap[name] || randomPastel();
  } else {
    // update metadata
    course.credit = credit; course.type=type; course.sweet=sweet; course.cool=cool;
  }

  // assign selected cells
  for(const k of Array.from(selection)){
    const c = cellByKey(k);
    if(!c) continue;
    // mark
    c.dataset.courseId = course.id;
    c.classList.add("occupied");
    c.textContent = course.name;
    c.style.backgroundColor = colorMap[course.name];
    if(!course.cells.includes(k)) course.cells.push(k);
  }

  // ensure course.cells unique
  course.cells = Array.from(new Set(course.cells));

  updateCourseListTable();
  closeModal();
  // clear modal inputs
  input_name.value=""; input_credit.value="2"; input_sweet.value="5"; input_cool.value="5"; input_type.value="必修"; input_type_other.value="";
}

// ---------- update course list UI ----------
function updateCourseListTable(){
  const tbody = document.querySelector("#courseList tbody");
  tbody.innerHTML = "";
  for(const c of courses){
    const tr = document.createElement("tr");
    const tdCells = c.cells.join(", ");
    tr.innerHTML = `<td>${c.name}</td><td>${c.credit}</td><td>${c.type}</td><td>${c.sweet}</td><td>${c.cool}</td><td style="max-width:160px">${tdCells}</td>
      <td>
        <button data-action="edit" data-id="${c.id}">編輯</button>
        <button data-action="remove" data-id="${c.id}">移除</button>
      </td>`;
    tbody.appendChild(tr);
  }
  // attach events
  tbody.querySelectorAll("button").forEach(btn=>{
    btn.addEventListener("click",(e)=>{
      const id = e.currentTarget.dataset.id;
      const action = e.currentTarget.dataset.action;
      if(action==="edit") editCourseById(id);
      if(action==="remove") removeCourseById(id);
    });
  });
}

function editCourseById(id){
  const c = courses.find(x=>x.id===id);
  if(!c) return;
  // prefill modal - and select its cells visually
  input_name.value = c.name; input_credit.value=c.credit; input_type.value=c.type; input_sweet.value=c.sweet; input_cool.value=c.cool;
  input_type_other.value = (["必修","選修","通識"].includes(c.type) ? "" : c.type);
  if(!["必修","選修","通識"].includes(c.type)) input_type.value="其他";
  // visualize selection
  clearSelectionVisual();
  for(const k of c.cells){ const cell=cellByKey(k); if(cell){ selection.add(k); cell.classList.add("selected"); } }
  openCourseModal();
}

function removeCourseById(id){
  if(!confirm("確認要刪除這門課（包含在表格上的顯示）？")) return;
  // remove from grid
  const c = courses.find(x=>x.id===id);
  if(c){
    for(const k of c.cells){
      const cell = cellByKey(k);
      if(cell){ cell.textContent=""; cell.classList.remove("occupied"); cell.removeAttribute("data-course-id"); cell.style.backgroundColor=""; }
    }
  }
  courses = courses.filter(x=>x.id!==id);
  updateCourseListTable();
}

// ---------- 小工具：隨機柔和色 ----------
function randomPastel(){
  const h = Math.floor(Math.random()*360);
  const s = 70;
  const l = 80;
  return `hsl(${h}deg ${s}% ${l}%)`;
}

// ---------- 匯出 / 匯入 CSV（課表格式） ----------
document.getElementById("exportCsvBtn").addEventListener("click",()=>{
  // csv header: day,period,course_name,credit,type,sweet,cool
  let csv = "day,period,course_name,credit,type,sweet,cool\n";
  for(const c of courses){
    for(const k of c.cells){
      const [d,p] = k.split("-");
      csv += `${d},${p},${escapeCsv(c.name)},${c.credit},${escapeCsv(c.type)},${c.sweet},${c.cool}\n`;
    }
  }
  downloadText(csv,"courses.csv","text/csv");
});
function escapeCsv(s){ return `"${String(s).replace(/"/g,'""')}"`; }
function downloadText(text, fname, mime){
  const blob = new Blob([text],{type:mime||"text/plain"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);
}

// upload csv
document.getElementById("uploadCsv").addEventListener("change", (ev)=>{
  const f = ev.target.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    const txt = reader.result;
    loadCoursesFromCsvText(txt);
  };
  reader.readAsText(f,"utf-8");
});

function loadCoursesFromCsvText(txt){
  // expect header: day,period,course_name,credit,type,sweet,cool (or subset)
  const lines = txt.split(/\r?\n/).filter(l=>l.trim()!=="");
  if(lines.length<2){ alert("CSV 檔案空或格式錯誤"); return; }
  const headers = lines[0].split(",").map(h=>h.trim().replace(/(^"|"$)/g,""));
  const idx = (name)=>headers.findIndex(h=>h.toLowerCase().includes(name));
  const i_day=idx("day"), i_period=idx("period"), i_name=idx("course"), i_credit=idx("credit"), i_type=idx("type"), i_sweet=idx("sweet"), i_cool=idx("cool");
  courses = []; colorMap={};
  // clear grid
  document.querySelectorAll(".cell").forEach(c=>{ c.textContent=""; c.classList.remove("occupied","conflict"); c.removeAttribute("data-course-id"); c.style.backgroundColor=""; });
  for(let i=1;i<lines.length;i++){
    const row = parseCsvLine(lines[i]);
    if(row.length===0) continue;
    const d = row[i_day] || row[0];
    const p = row[i_period] || row[1];
    const name = row[i_name] || row[2] || "課程";
    const credit = parseFloat(row[i_credit]||1) || 1;
    const type = row[i_type] || "必修";
    const sweet = parseInt(row[i_sweet]||5) || 5;
    const cool = parseInt(row[i_cool]||5) || 5;
    // find existing course by name
    let course = courses.find(c=>c.name===name);
    if(!course){ course = {id:"c"+Date.now()+Math.floor(Math.random()*1000)+i, name, credit, type, sweet, cool, cells:[]}; courses.push(course); colorMap[name]=randomPastel(); }
    const key = `${d}-${p}`;
    course.cells.push(key);
    const cell = cellByKey(key);
    if(cell){ cell.dataset.courseId = course.id; cell.classList.add("occupied"); cell.textContent = name; cell.style.backgroundColor = colorMap[name]; }
  }
  // dedupe cells
  courses.forEach(c=> c.cells = Array.from(new Set(c.cells)));
  updateCourseListTable();
  detectConflicts();
}
function parseCsvLine(line){
  // very simple csv parse for quoted fields
  const out=[]; let cur=""; let inq=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){ if(inq && line[i+1]==='"'){ cur+='"'; i++; } else inq=!inq; continue; }
    if(ch===',' && !inq){ out.push(cur); cur=""; continue; }
    cur+=ch;
  }
  if(cur!=="") out.push(cur);
  return out.map(x=>x.trim());
}

// ---------- 衝堂偵測 ----------
function detectConflicts(){
  // build map key->courses
  const map = {};
  for(const c of courses){
    for(const k of c.cells){
      map[k] = map[k] || [];
      map[k].push(c.name);
    }
  }
  // clear
  document.querySelectorAll(".cell").forEach(cell=>cell.classList.remove("conflict"));
  for(const k in map){
    if(map[k].length>1){
      const cell = cellByKey(k);
      if(cell) cell.classList.add("conflict");
    }
  }
}

// ---------- 清除表格 ----------
document.getElementById("clearBtn").addEventListener("click", ()=>{
  if(!confirm("清除整個課表？")) return;
  courses=[]; colorMap={};
  document.querySelectorAll(".cell").forEach(c=>{ c.textContent=""; c.classList.remove("occupied","conflict"); c.removeAttribute("data-course-id"); c.style.backgroundColor=""; });
  updateCourseListTable();
});

// detect changes when courses change in grid (basic)
const observer = new MutationObserver(()=>{ detectConflicts(); updateCourseListTable(); });
document.querySelectorAll(".cell").forEach(c=>observer.observe(c,{characterData:true,childList:true,subtree:true}));

// ---------- 模擬 optimizer（簡化版 JS） ----------
// weight 計算： credits * cat_coef * (1 + beta * difficulty) + near_exam
const CATEGORY_COEFS = {"必修":1.30,"選修":1.00,"通識":0.85};
const BETA = 0.10;
const GAMMA = 0.80;

function computeWeightsForCourses(){
  // make array {name,credits,difficulty,category,weight}
  const arr = courses.map(c=>{
    const diff = Math.max(1, Math.round(( (11 - c.sweet) + c.cool )/2)); // 甜度/涼度轉一個 difficulty proxy (簡單)
    const credits = Number(c.credit) || 1;
    const cat = c.type || "選修";
    const coef = CATEGORY_COEFS[cat] || 1.0;
    const base = credits * coef * (1 + BETA * diff);
    const weight = base; // no exam_date in this simplified version
    return {name:c.name,credits,difficulty:diff,category:cat,weight};
  });
  return arr;
}

// calculate minutes (simulate optimize_minutes)
document.getElementById("calcMinutesBtn").addEventListener("click", ()=>{
  const total = Number(document.getElementById("totalMinutes").value) || 0;
  const minPer = Number(document.getElementById("minMinutes").value) || 0;
  const roundTo = Number(document.getElementById("roundTo").value) || 1;
  const arr = computeWeightsForCourses();
  if(arr.length===0){ alert("請先在課表建立至少一門課"); return; }
  const totalWeight = arr.reduce((s,x)=>s+x.weight,0);
  const out = arr.map(x=>{
    let minutes = (totalWeight>0)? total * (x.weight/totalWeight) : Math.floor(total/arr.length);
    if(minutes < minPer) minutes = minPer;
    minutes = Math.round(minutes/roundTo)*roundTo;
    return {...x, minutes};
  });
  out.sort((a,b)=>b.weight*a.minutes - a.weight*b.minutes);
  const panel = document.getElementById("minutesResult");
  panel.innerHTML = "<h4>分鐘分配結果（模擬）</h4>";
  const tbl = document.createElement("table"); tbl.style.width="100%"; tbl.innerHTML="<tr><th>課名</th><th>學分</th><th>難度(proxy)</th><th>權重</th><th>分配分鐘</th></tr>";
  out.forEach(r=>{ const tr=document.createElement("tr"); tr.innerHTML=`<td>${r.name}</td><td>${r.credits}</td><td>${r.difficulty}</td><td>${r.weight.toFixed(2)}</td><td>${r.minutes}</td>`; tbl.appendChild(tr); });
  panel.appendChild(tbl);
  // keep in session
  window._minutesAlloc = out;
});

// make 30-min blocks & assign greedily (simulate optimize_blocks)
document.getElementById("makeBlocksBtn").addEventListener("click", ()=>{
  const start = document.getElementById("startTime").value;
  const end = document.getElementById("endTime").value;
  if(!start || !end){ alert("請輸入開始與結束時間"); return; }
  const [sh,sm] = start.split(":").map(Number);
  const [eh,em] = end.split(":").map(Number);
  const today = new Date();
  const startDt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), sh, sm,0);
  const endDt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), eh, em,0);
  if(endDt<=startDt){ alert("結束時間必須晚於開始時間"); return; }

  // build blocks
  const blocks = [];
  let t = new Date(startDt);
  while((t.getTime() + 30*60000) <= endDt.getTime()){
    blocks.push(new Date(t));
    t = new Date(t.getTime() + 30*60000);
  }
  if(blocks.length===0){ alert("沒有可用的 30 分鐘區塊"); return; }

  // compute weights
  const arr = computeWeightsForCourses();
  if(arr.length===0){ alert("請先有課程"); return; }
  // assign greedily by weight per block: simply iterate blocks and pick course with highest remaining need
  // compute desired blocks per course from minutes allocation (_minutesAlloc) if available, otherwise proportionally
  let desiredBlocks = {};
  if(window._minutesAlloc){
    window._minutesAlloc.forEach(r=> desiredBlocks[r.name] = Math.max(1, Math.round(r.minutes/30)));
  } else {
    const totalW = arr.reduce((s,x)=>s+x.weight,0);
    arr.forEach(x=> desiredBlocks[x.name] = Math.max(1, Math.round((x.weight/totalW) * blocks.length)));
  }

  // current assigned counts
  const assignedCounts = {};
  const assignments = []; // {blockTime: Date, course_name}
  for(const b of blocks){
    // choose course with highest weight that still needs blocks
    let candidate = null;
    let bestScore = -Infinity;
    for(const c of arr){
      const assigned = assignedCounts[c.name] || 0;
      const need = desiredBlocks[c.name] || 0;
      // score: remaining need * weight
      const score = (Math.max(0, need - assigned) + 0.001) * c.weight;
      if(score > bestScore){
        bestScore = score; candidate = c;
      }
    }
    if(candidate){
      assignedCounts[candidate.name] = (assignedCounts[candidate.name]||0) + 1;
      assignments.push({blockTime: b, course_name: candidate.name});
    } else {
      assignments.push({blockTime: b, course_name: arr[0].name});
    }
  }

  // show result
  const panel = document.getElementById("blocksResult");
  panel.innerHTML = "<h4>排程結果（模擬）</h4>";
  const tbl = document.createElement("table");
  tbl.style.width="100%";
  tbl.innerHTML = "<tr><th>開始</th><th>結束</th><th>科目</th></tr>";
  assignments.forEach(a=>{
    const start = a.blockTime;
    const end = new Date(start.getTime() + 30*60000);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${timeStr(start)}</td><td>${timeStr(end)}</td><td>${a.course_name}</td>`;
    tbl.appendChild(tr);
  });
  panel.appendChild(tbl);
  // store schedule
  window._finalSchedule = assignments;
});

// export schedule csv
document.getElementById("exportScheduleBtn").addEventListener("click", ()=>{
  if(!window._finalSchedule){ alert("尚未產生排程"); return; }
  let csv = "Start Time,End Time,Course\n";
  window._finalSchedule.forEach(a=>{ const s=timeStr(a.blockTime); const e=timeStr(new Date(a.blockTime.getTime()+30*60000)); csv += `${s},${e},${escapeCsv(a.course_name)}\n`; });
  downloadText(csv,"study_schedule.csv","text/csv");
});

function timeStr(dt){ return dt.toTimeString().slice(0,5); }

// ---------- 提醒系統（瀏覽器通知） ----------
document.getElementById("startReminderBtn").addEventListener("click", async ()=>{
  if(!window._finalSchedule){ alert("請先生成排程"); return; }
  // ask notification permission
  if(Notification.permission !== "granted"){
    await Notification.requestPermission();
  }
  // schedule timers relative to now
  const now = new Date();
  for(const a of window._finalSchedule){
    const start = a.blockTime;
    let delta = start.getTime() - now.getTime();
    if(delta < 0) {
      // schedule for next day at that time
      delta += 24*3600*1000;
    }
    setTimeout(()=>notifyStudyBlock(a), Math.max(0, delta));
  }
  alert("提醒系統已啟動（請保持此頁面或允許通知）。");
});

function notifyStudyBlock(a){
  const title = `開始讀書：${a.course_name}`;
  const body = `時間： ${timeStr(a.blockTime)} ~ ${timeStr(new Date(a.blockTime.getTime()+30*60000))}`;
  if(Notification.permission === "granted"){
    new Notification(title, {body});
  } else {
    alert(`${title}\n${body}`);
  }
  console.log("提醒：", title, body);
}

// ---------- small util ----------
function escapeCsv(s){ return `"${String(s).replace(/"/g,'""')}"`; }

// ---------- init attach clear selection on outside click ----------
document.addEventListener("click", (e)=>{
  if(!modal.classList.contains("hidden") && !e.target.closest(".modal-content")) {
    // click outside modal: cancel
    closeModal();
  }
});

