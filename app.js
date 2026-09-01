const DB_NAME='deadline-garden-db', DB_VERSION=1, STORE='tasks';
let db, currentMonth=new Date(), tasks=[], lastEmergencyTaskId=null;
const $=s=>document.querySelector(s);
const pad=n=>String(n).padStart(2,'0');
const fmtDateInput=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const THEME_KEY='deadline-garden-theme-v1';
const THEMES=['red','orange','yellow','green','blue','indigo','purple'];
const CAL_DISPLAY_KEY='deadline-garden-calendar-display-v1';
const CAL_VIEW_KEY='deadline-garden-calendar-view-v1';
const CUSTOMIZE_KEY='deadline-garden-customize-v1';
const HOLIDAY_KEY='deadline-garden-holidays-v1';
let customize={flowerSize:'medium',flowerOpacity:'medium',confetti:'medium',checklistColor:'postit',checklistShape:'postit',todoCount:'today'};
let holidays=[];
try{Object.assign(customize,JSON.parse(localStorage.getItem(CUSTOMIZE_KEY)||'{}')||{})}catch{}
try{const h=JSON.parse(localStorage.getItem(HOLIDAY_KEY)||'[]');if(Array.isArray(h))holidays=h}catch{}
let calendarDisplay={time:true,course:false,title:true,description:false};
let calendarView='month';
try{
  const savedView=localStorage.getItem(CAL_VIEW_KEY);
  if(['month','week','day'].includes(savedView))calendarView=savedView;
}catch{}
try{
  const savedDisplay=JSON.parse(localStorage.getItem(CAL_DISPLAY_KEY)||'{}');
  for(const key of Object.keys(calendarDisplay))if(typeof savedDisplay[key]==='boolean')calendarDisplay[key]=savedDisplay[key];
}catch{}

function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'id'});};r.onsuccess=()=>{db=r.result;resolve(db)};r.onerror=()=>reject(r.error)})}
function idbGetAll(){return new Promise((resolve,reject)=>{const r=db.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}
function idbPut(t){return new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readwrite').objectStore(STORE).put(t);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
function idbDelete(id){return new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readwrite').objectStore(STORE).delete(id);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}

function dueMs(t){if(!t.date)return Infinity;return new Date(`${t.date}T${t.time||'23:59'}:00`).getTime()}
function urgency(t){if(t.done)return 0;const diff=dueMs(t)-Date.now();if(diff<0||diff<=15*60e3)return 5;if(diff<=2*3600e3)return 4;if(diff<=24*3600e3)return 3;if(diff<=3*86400e3)return 2;if(diff<=7*86400e3)return 1;return 0}
function formatDue(t){const d=new Date(`${t.date}T${t.time||'12:00'}:00`);const date=d.toLocaleDateString(undefined,{month:'short',day:'numeric'});return `${date}${t.time?` · ${d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}`:' · No specific time'}`}
function countdown(ms){const neg=ms<0;ms=Math.abs(ms);const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000);if(h>=24){const d=Math.floor(h/24);return `${neg?'Overdue ':'Due in '}${d}d ${h%24}h`;}return `${neg?'Overdue by ':'Due in '}${pad(h)}:${pad(m)}:${pad(s)}`}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function dateFromInput(s){return new Date(`${s}T12:00:00`)}
function addDays(date,n){const d=new Date(date);d.setDate(d.getDate()+n);return d}
function addMonthsSafe(date,n,desiredDay){const d=new Date(date.getFullYear(),date.getMonth()+n,1);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(desiredDay,last));return d}
function deadlineTasks(){return tasks.filter(t=>!t.quick)}
function quickTasks(){return tasks.filter(t=>t.quick)}
const ICON_COLORS={red:'#c95f68',orange:'#d88a4f',yellow:'#c5aa47',green:'#5f9c71',blue:'#5f8fb5',indigo:'#6d73b8',purple:'#9870b4'};
function taskIconHtml(t){const e=(t.emoji||'').trim();if(e)return `<span class="task-icon emoji">${escapeHtml(e)}</span>`;if(t.iconColor&&ICON_COLORS[t.iconColor])return `<span class="task-icon color" style="--task-icon-color:${ICON_COLORS[t.iconColor]}"></span>`;return''}
function holidayForDate(ds){return holidays.find(h=>ds>=h.start&&ds<=h.end)||null}
function saveCustomize(){try{localStorage.setItem(CUSTOMIZE_KEY,JSON.stringify(customize))}catch{}applyCustomize()}
function saveHolidays(){try{localStorage.setItem(HOLIDAY_KEY,JSON.stringify(holidays))}catch{}}


async function refresh(){tasks=await idbGetAll();tasks.sort((a,b)=>dueMs(a)-dueMs(b));todoSignature='';renderAll()}
function renderAll(){renderHeader();renderCalendar();renderTodo();renderQuickTodo();renderWarnings()}

function getTodoBadgeCount(pending){const g=getTodoGroups(pending);if(customize.todoCount==='all')return pending.length;if(customize.todoCount==='week')return g.today.length+g.week.length;return g.today.length}
function renderHeader(){
  const now=new Date();
  $('#todayHeading').textContent=now.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
  const pending=deadlineTasks().filter(t=>!t.done),focus=getTodoGroups(pending).today.length,badge=getTodoBadgeCount(pending);
  $('#summaryLine').textContent=focus?`${focus} task${focus===1?'':'s'} to focus on today`:'Nothing due today';
  $('#todoCount').textContent=badge;
  $('#todoToggle').setAttribute('aria-label',`Open to-do list: ${badge} shown in badge`);
  const next=pending[0];
  if(!next){$('#nextTitle').textContent='Nothing due soon';$('#nextMeta').textContent='Your calendar is clear.';$('#nextCountdown').textContent='';return}
  $('#nextTitle').textContent=`${next.course?next.course+' · ':''}${next.title}`;$('#nextMeta').textContent=formatDue(next);const diff=dueMs(next)-Date.now();$('#nextCountdown').textContent=diff<=2*3600e3?countdown(diff):''
}

function calendarChipContent(t){
  const parts=[];
  if(calendarDisplay.title&&t.title)parts.push(t.title);
  if(calendarDisplay.time&&t.time){const d=new Date(`${t.date}T${t.time}:00`);parts.push(d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}));}
  if(calendarDisplay.course&&t.course)parts.push(t.course);
  if(calendarDisplay.description&&t.notes)parts.push(t.notes.replace(/\s+/g,' ').trim());
  if(!parts.length)parts.push(t.title||t.course||formatDue(t));
  return parts.join(' · ');
}
function calendarChipHtml(t){
  const meta=[];
  if(calendarDisplay.time&&t.time){const d=new Date(`${t.date}T${t.time}:00`);meta.push(d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}));}
  if(calendarDisplay.course&&t.course)meta.push(t.course);
  const title=calendarDisplay.title&&t.title?t.title:'';
  const desc=calendarDisplay.description&&t.notes?t.notes.replace(/\s+/g,' ').trim():'';
  if(title){
    return `<span class="event-main-line">${taskIconHtml(t)}<span>${escapeHtml(title)}</span></span>${meta.length?`<span class="event-meta-line">${escapeHtml(meta.join(' · '))}</span>`:''}${desc?`<span class="event-desc-line">${escapeHtml(desc)}</span>`:''}`;
  }
  const fallback=meta.length?meta.join(' · '):(desc||t.title||t.course||formatDue(t));
  return `<span class="event-main-line">${taskIconHtml(t)}<span>${escapeHtml(fallback)}</span></span>${desc&&fallback!==desc?`<span class="event-desc-line">${escapeHtml(desc)}</span>`:''}`;
}

function setCalendarView(view){
  if(!['month','week','day'].includes(view))return;
  calendarView=view;
  try{localStorage.setItem(CAL_VIEW_KEY,view)}catch{}
  document.querySelectorAll('[data-cal-view]').forEach(b=>b.classList.toggle('active',b.dataset.calView===view));
  renderCalendar();
}

function weekStartFor(date){
  const d=new Date(date.getFullYear(),date.getMonth(),date.getDate());
  d.setDate(d.getDate()-d.getDay());
  return d;
}

function renderCalendar(){
  const all=deadlineTasks(),grid=$('#calendarGrid'),weekdays=$('.weekday-row');grid.className='calendar-grid';weekdays.classList.remove('hidden');document.querySelectorAll('[data-cal-view]').forEach(b=>b.classList.toggle('active',b.dataset.calView===calendarView));
  const chip=(t,extra='')=>`<button class="event-chip ${extra} size-${t.calendarSize||'medium'} ${t.done?'done':''} urgent${urgency(t)}" data-id="${t.id}" title="${escapeHtml([t.course,t.title,formatDue(t),t.notes].filter(Boolean).join(' · '))}">${calendarChipHtml(t)}</button>`;
  const holidayTag=h=>h?`<button class="holiday-mini holiday-edit-tag" data-holiday-id="${h.id}" title="Edit holiday">✦ ${escapeHtml(h.name||'Holiday')}</button>`:'';
  if(calendarView==='month'){
    const y=currentMonth.getFullYear(),m=currentMonth.getMonth();$('#monthLabel').textContent=currentMonth.toLocaleDateString(undefined,{month:'long',year:'numeric'});const start=new Date(y,m,1-new Date(y,m,1).getDay());let html='';
    for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const ds=fmtDateInput(d),dayTasks=all.filter(t=>t.date===ds),outside=d.getMonth()!==m,today=ds===fmtDateInput(new Date()),holiday=holidayForDate(ds);html+=`<div class="day-cell ${outside?'outside':''} ${today?'today':''} ${holiday?'holiday-day':''}" data-date="${ds}"><div class="day-number"><span>${d.getDate()}</span>${holidayTag(holiday)}</div>${dayTasks.slice(0,5).map(t=>chip(t)).join('')}${dayTasks.length>5?`<div class="tiny">+${dayTasks.length-5} more</div>`:''}</div>`}
    grid.innerHTML=html;
  }else if(calendarView==='week'){
    const start=weekStartFor(currentMonth),end=addDays(start,6);$('#monthLabel').textContent=`${start.toLocaleDateString(undefined,{month:'short',day:'numeric'})} – ${end.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`;grid.classList.add('calendar-grid-week');let html='';
    for(let i=0;i<7;i++){const d=addDays(start,i),ds=fmtDateInput(d),dayTasks=all.filter(t=>t.date===ds),today=ds===fmtDateInput(new Date()),holiday=holidayForDate(ds);html+=`<div class="week-day ${today?'today':''} ${holiday?'holiday-day':''}" data-date="${ds}"><div class="week-date"><strong>${d.getDate()}</strong><span>${d.toLocaleDateString(undefined,{month:'short'})}</span>${holidayTag(holiday)}</div><div class="week-events">${dayTasks.length?dayTasks.map(t=>chip(t,'week-event')).join(''):'<div class="calendar-empty">No tasks</div>'}</div></div>`}
    grid.innerHTML=html;
  }else{
    weekdays.classList.add('hidden');const d=new Date(currentMonth.getFullYear(),currentMonth.getMonth(),currentMonth.getDate()),ds=fmtDateInput(d),dayTasks=all.filter(t=>t.date===ds),holiday=holidayForDate(ds);$('#monthLabel').textContent=d.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'});grid.classList.add('calendar-grid-day');grid.innerHTML=`<div class="daily-view ${holiday?'holiday-day':''}" data-date="${ds}"><div class="daily-date"><div>${d.toLocaleDateString(undefined,{weekday:'long'})}</div><strong>${d.getDate()}</strong><span>${d.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</span>${holidayTag(holiday)}</div><div class="daily-events">${dayTasks.length?dayTasks.map(t=>`<button class="daily-task-card size-${t.calendarSize||'medium'} ${t.done?'done':''} urgent${urgency(t)}" data-id="${t.id}"><span class="daily-task-time">${t.time?new Date(`${t.date}T${t.time}:00`).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):'Any time'}</span><span class="daily-task-main">${calendarChipHtml(t)}</span></button>`).join(''):'<div class="daily-empty">Nothing scheduled for this day.<button class="soft-btn small" id="dailyAdd">+ Add task</button></div>'}</div></div>`;if($('#dailyAdd'))$('#dailyAdd').onclick=e=>{e.stopPropagation();openTaskModal(null,ds)};
  }
  document.querySelectorAll('.event-chip,[data-id].daily-task-card').forEach(el=>el.onclick=e=>{e.stopPropagation();openTaskDetails(tasks.find(t=>t.id===el.dataset.id))});
  document.querySelectorAll('[data-holiday-id]').forEach(el=>el.onclick=e=>{e.stopPropagation();openHolidayModal(holidays.find(h=>h.id===el.dataset.holidayId))});
  document.querySelectorAll('.day-cell,.week-day,.daily-view').forEach(el=>el.onclick=()=>{el.classList.remove('calendar-click');void el.offsetWidth;el.classList.add('calendar-click');setTimeout(()=>openTaskModal(null,el.dataset.date),90)})
}

function openHolidayModal(existing=null){
  const today=fmtDateInput(new Date()),h=existing||{name:'',start:today,end:today};
  showModal(`<div class="section-label">HOLIDAY</div><h3>${existing?'Edit holiday':'Add time off'}</h3><div class="form-grid"><div class="field full"><label>Name</label><input id="holidayName" value="${escapeHtml(h.name||'')}" placeholder="Fall Break"></div><div class="field"><label>Starts</label><input id="holidayStart" type="date" value="${h.start}"></div><div class="field"><label>Ends</label><input id="holidayEnd" type="date" value="${h.end}"></div></div><div class="next-meta" style="margin-top:10px">Holiday dates stay visible and softly highlighted. Existing tasks are kept unless you choose to clear them.</div><div class="modal-actions">${existing?'<button id="holidayDelete" class="danger-btn">Delete holiday</button>':''}<button id="holidayCancel" class="soft-btn">Cancel</button><button id="holidaySave" class="primary-btn">${existing?'Save changes':'Save holiday'}</button></div>`);
  $('#holidayCancel').onclick=closeModal;
  if(existing)$('#holidayDelete').onclick=()=>{holidays=holidays.filter(x=>x.id!==existing.id);saveHolidays();closeModal();renderCalendar();toast('Holiday deleted.')};
  $('#holidaySave').onclick=()=>{
    const name=$('#holidayName').value.trim()||'Holiday',start=$('#holidayStart').value,end=$('#holidayEnd').value;if(!start||!end||end<start)return toast('Choose a valid holiday date range.');
    if(existing){Object.assign(existing,{name,start,end});saveHolidays();closeModal();renderCalendar();toast('Holiday updated.');return}
    const created={id:crypto.randomUUID(),name,start,end};holidays.push(created);saveHolidays();closeModal();renderCalendar();holidayCelebration();setTimeout(()=>askHolidayClear(created),1950)
  }
}
function askHolidayClear(h){const inRange=deadlineTasks().filter(t=>t.date>=h.start&&t.date<=h.end);showModal(`<div class="holiday-celebrate-mark">✦</div><div class="section-label">HOLIDAY SAVED</div><h3>${escapeHtml(h.name)} is on the calendar!</h3><div class="next-meta">${inRange.length?`${inRange.length} task${inRange.length===1?'':'s'} currently fall inside this break.`:'No tasks currently fall inside this break.'}</div>${inRange.length?'<div class="holiday-question">Clear tasks during this holiday?</div>':''}<div class="modal-actions">${inRange.length?'<button id="holidayClearTasks" class="danger-btn">Clear holiday tasks</button>':''}<button id="holidayKeepTasks" class="primary-btn">${inRange.length?'Keep tasks':'Nice!'}</button></div>`);$('#holidayKeepTasks').onclick=closeModal;if(inRange.length)$('#holidayClearTasks').onclick=async()=>{for(const t of inRange)await idbDelete(t.id);closeModal();await refresh();toast(`Cleared ${inRange.length} holiday task${inRange.length===1?'':'s'}.`)}}
function holidayCelebration(){confetti(true);document.body.classList.remove('holiday-party');void document.body.offsetWidth;document.body.classList.add('holiday-party');setTimeout(()=>document.body.classList.remove('holiday-party'),1800)}

function openCalendarDisplay(){
  showModal(`<div class="section-label">CALENDAR</div><h3>Choose what task labels show</h3>
    <div class="display-choice-list">
      <label class="display-choice"><input id="displayTime" type="checkbox" ${calendarDisplay.time?'checked':''}><span><strong>Deadline time</strong><small>Example: 2:30 PM</small></span></label>
      <label class="display-choice"><input id="displayCourse" type="checkbox" ${calendarDisplay.course?'checked':''}><span><strong>Course</strong><small>Example: HDFS 2300</small></span></label>
      <label class="display-choice"><input id="displayTitle" type="checkbox" ${calendarDisplay.title?'checked':''}><span><strong>Task name</strong><small>Example: Chapter 1 Reading Quiz</small></span></label>
      <label class="display-choice"><input id="displayDescription" type="checkbox" ${calendarDisplay.description?'checked':''}><span><strong>Description</strong><small>Show the task description in calendar labels</small></span></label>
    </div>
    <div class="display-preview"><span>Preview</span><strong id="displayPreviewText"></strong></div>
    <div class="modal-actions"><button id="displayCancel" class="soft-btn">Cancel</button><button id="displaySave" class="primary-btn">Save display</button></div>`);
  const updatePreview=()=>{
    const demo={date:fmtDateInput(new Date()),time:'14:30',course:'HDFS 2300',title:'Reading Quiz',notes:'Complete Chapter 1 questions'};
    const draft={time:$('#displayTime').checked,course:$('#displayCourse').checked,title:$('#displayTitle').checked,description:$('#displayDescription').checked};
    const old=calendarDisplay;calendarDisplay=draft;$('#displayPreviewText').textContent=calendarChipContent(demo);calendarDisplay=old;
  };
  ['#displayTime','#displayCourse','#displayTitle','#displayDescription'].forEach(s=>$(s).onchange=updatePreview);updatePreview();
  $('#displayCancel').onclick=closeModal;
  $('#displaySave').onclick=()=>{
    const next={time:$('#displayTime').checked,course:$('#displayCourse').checked,title:$('#displayTitle').checked,description:$('#displayDescription').checked};
    if(!next.time&&!next.course&&!next.title&&!next.description)return toast('Choose at least one label item.');
    calendarDisplay=next;
    try{localStorage.setItem(CAL_DISPLAY_KEY,JSON.stringify(calendarDisplay))}catch{}
    closeModal();renderCalendar();toast('Calendar display updated.');
  };
}

function getTodoGroups(pending,now=new Date()){
  const today=fmtDateInput(now),monday=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  monday.setDate(monday.getDate()-((now.getDay()+6)%7));
  const nextMonday=new Date(monday);nextMonday.setDate(monday.getDate()+7);
  const followingMonday=new Date(nextMonday);followingMonday.setDate(nextMonday.getDate()+7);
  const next=fmtDateInput(nextMonday),following=fmtDateInput(followingMonday),weekend=now.getDay()===6||now.getDay()===0;
  const groups={today:[],week:[],next:[],later:[],weekend};
  for(const t of [...pending].filter(t=>!t.done).sort((a,b)=>dueMs(a)-dueMs(b))){
    if(t.date<=today)groups.today.push(t);
    else if(t.date<next)groups.week.push(t);
    else if(weekend&&t.date<following)groups.next.push(t);
    else groups.later.push(t)
  }
  return groups
}

const TODO_PREF_KEY='deadline-garden-todo-sections-v2';
let todoOpen={today:true,week:true,next:true,later:false,completed:false},todoSignature='';
try{const saved=JSON.parse(localStorage.getItem(TODO_PREF_KEY)||'{}');for(const k of Object.keys(todoOpen))if(typeof saved[k]==='boolean')todoOpen[k]=saved[k]}catch{}

function renderTodo(){
  const deadlines=deadlineTasks(),pending=deadlines.filter(t=>!t.done),groups=getTodoGroups(pending),today=fmtDateInput(new Date());
  const overdue=groups.today.filter(t=>t.date<today).length;
  $('#todoSubtitle').textContent=groups.today.length?`${groups.today.length} for today${overdue?' · includes overdue':''}`:'Nothing due today';
  document.querySelectorAll('[data-todo-badge]').forEach(r=>r.checked=r.value===customize.todoCount);
  const signature=JSON.stringify([today,pending,customize.todoCount]);
  if(signature!==todoSignature){
    todoSignature=signature;
    const sections=[['today','Today',groups.today],['week','This week',groups.week]];
    if(groups.weekend)sections.push(['next','Next week',groups.next]);
    sections.push(['later','All later deadlines',groups.later]);
    $('#todoList').innerHTML=sections.map(([key,label,items])=>`<details class="todo-section" data-section="${key}" ${todoOpen[key]?'open':''}><summary><span class="todo-arrow">›</span><span class="todo-section-label">${label}</span><span class="todo-section-count">${items.length}</span></summary><div class="todo-section-items">${items.length?items.map(t=>`<div class="todo-item"><label class="todo-check"><input type="checkbox" data-check="${escapeHtml(t.id)}" aria-label="Mark ${escapeHtml(t.title)} as done"></label><button class="todo-content todo-content-button" data-view-task="${escapeHtml(t.id)}"><div class="todo-title">${escapeHtml(t.title)}</div>${t.course?`<div class="todo-course">${escapeHtml(t.course)}</div>`:''}<div class="todo-meta">${escapeHtml(formatDue(t))}</div><div class="todo-timer" data-timer="${escapeHtml(t.id)}"></div></button></div>`).join(''):`<div class="todo-empty">${key==='today'?'All clear for today.':key==='week'?'No other tasks due this week.':key==='next'?'Nothing due next week.':'No later deadlines.'}</div>`}</div></details>`).join('');
    document.querySelectorAll('[data-check]').forEach(c=>c.onchange=()=>completeTask(c.dataset.check));
    document.querySelectorAll('[data-view-task]').forEach(b=>b.onclick=()=>openTaskDetails(tasks.find(t=>t.id===b.dataset.viewTask)));
    document.querySelectorAll('[data-section]').forEach(el=>el.ontoggle=()=>{todoOpen[el.dataset.section]=el.open;try{localStorage.setItem(TODO_PREF_KEY,JSON.stringify(todoOpen))}catch{}})
  }
  const byId=new Map(pending.map(t=>[t.id,t]));document.querySelectorAll('[data-timer]').forEach(el=>{const t=byId.get(el.dataset.timer);if(!t)return;const diff=dueMs(t)-Date.now();el.textContent=diff<=2*3600e3?countdown(diff):'';el.hidden=!el.textContent})
}

async function addQuickTodo(){
  const input=$('#quickTodoInput'),title=input.value.trim();
  if(!title)return;
  await idbPut({id:crypto.randomUUID(),quick:true,title,done:false,createdAt:Date.now()});
  input.value='';await refresh();
}
async function toggleQuickTodo(id,done){
  const t=tasks.find(x=>x.id===id&&x.quick);if(!t)return;
  t.done=done;t.updatedAt=Date.now();
  await idbPut(t);await refresh();if(done)confetti();
}
async function deleteQuickTodo(id){
  await idbDelete(id);await refresh();toast('Quick to-do deleted.');
}
function renderQuickTodo(){
  const root=$('#quickTodoList');if(!root)return;
  const items=quickTasks().sort((a,b)=>(a.done-b.done)||((a.createdAt||0)-(b.createdAt||0)));
  $('#quickTodoCount').textContent=items.filter(t=>!t.done).length;
  root.innerHTML=items.length?items.map(t=>`<div class="quick-todo-item ${t.done?'done':''}">
    <input type="checkbox" data-quick-check="${escapeHtml(t.id)}" ${t.done?'checked':''} aria-label="Toggle ${escapeHtml(t.title)}">
    <span>${escapeHtml(t.title)}</span>
    <button class="quick-delete" data-quick-delete="${escapeHtml(t.id)}" aria-label="Delete ${escapeHtml(t.title)}" title="Delete">⌫</button>
  </div>`).join(''):'<div class="quick-empty">Tiny things live here.</div>';
  document.querySelectorAll('[data-quick-check]').forEach(c=>c.onchange=()=>toggleQuickTodo(c.dataset.quickCheck,c.checked));
  document.querySelectorAll('[data-quick-delete]').forEach(b=>b.onclick=()=>deleteQuickTodo(b.dataset.quickDelete));
}

function renderWarnings(){
  const active=deadlineTasks().filter(t=>!t.done).sort((a,b)=>dueMs(a)-dueMs(b))[0],wb=$('#warningBackdrop');
  wb.className='warning-backdrop';$('#warningKicker').textContent='';$('#warningText').textContent='';
  if(!active)return;const diff=dueMs(active)-Date.now();
  if(diff>0&&diff<=30*60e3){const level=diff<=15*60e3?2:1;wb.classList.add(`level${level}`);$('#warningKicker').textContent=level===2?'URGENT DEADLINE':'DEADLINE APPROACHING';$('#warningText').textContent=`${active.title} · ${countdown(diff)}`;if(level===2&&lastEmergencyTaskId!==active.id){lastEmergencyTaskId=active.id;openEmergency(active,diff)}}
}

function showModal(html){
  const root=$('#modalRoot');$('#modalCard').innerHTML=html;root.classList.remove('hidden');requestAnimationFrame(()=>root.classList.add('visible'))
}
function closeModal(){
  const root=$('#modalRoot');root.classList.remove('visible');setTimeout(()=>root.classList.add('hidden'),190)
}
$('#modalRoot').onclick=e=>{if(e.target===$('#modalRoot'))closeModal()}

function openTaskSizePicker(task){const current=task.calendarSize||'medium';showModal(`<div class="section-label">CALENDAR APPEARANCE</div><h3>Task display size</h3><div class="size-picker">${['small','medium','large'].map(s=>`<button class="size-choice ${current===s?'active':''}" data-size-choice="${s}"><span class="size-demo ${s}">${taskIconHtml(task)}${escapeHtml(task.title)}</span><strong>${s[0].toUpperCase()+s.slice(1)}</strong></button>`).join('')}</div><div class="modal-actions"><button id="sizeBack" class="soft-btn">Back</button></div>`);$('#sizeBack').onclick=()=>openTaskDetails(task);document.querySelectorAll('[data-size-choice]').forEach(b=>b.onclick=async()=>{task.calendarSize=b.dataset.sizeChoice;await idbPut(task);await refresh();openTaskDetails(task);toast('Calendar size updated.')})}

function normalizeTaskLink(value){
  let s=(value||'').trim();if(!s)return'';
  if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(s))s='https://'+s;
  try{const u=new URL(s);return /^https?:$/.test(u.protocol)?u.href:''}catch{return''}
}
function descriptionHtml(text){
  return escapeHtml(text||'').replace(/\n/g,'<br>');
}
function openTaskDetails(task){
  if(!task)return;
  const link=normalizeTaskLink(task.link);
  const repeatText=task.repeat?.enabled
    ? repeatDescription(task.date,task.repeat)+(task.repeat.until?` Ends ${dateFromInput(task.repeat.until).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}.`:'')
    :'';
  showModal(`<div class="task-detail">
    <div class="task-detail-top">
      <div>
        <div class="section-label">${task.done?'COMPLETED TASK':'TASK DETAILS'}</div>
        <h3>${taskIconHtml(task)}${escapeHtml(task.title)}</h3>
      </div>
      ${task.done?'<span class="completed-badge">Completed</span>':''}
    </div>

    <div class="task-detail-grid">
      ${task.course?`<div class="detail-block"><span>Course</span><strong>${escapeHtml(task.course)}</strong></div>`:''}
      <div class="detail-block"><span>Date</span><strong>${escapeHtml(dateFromInput(task.date).toLocaleDateString(undefined,{weekday:'short',month:'long',day:'numeric',year:'numeric'}))}</strong></div>
      <div class="detail-block"><span>Due time</span><strong>${task.time?escapeHtml(new Date(`${task.date}T${task.time}:00`).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})):'No specific time'}</strong></div>
      ${repeatText?`<div class="detail-block full"><span>Repeat</span><strong>${escapeHtml(repeatText)}</strong></div>`:''}
    </div>

    <div class="detail-description">
      <span>Description</span>
      <div>${task.notes?descriptionHtml(task.notes):'<em>No description added.</em>'}</div>
    </div>

    ${link?`<a class="task-link-card" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">
      <span class="link-icon">↗</span><span><strong>Open task link</strong><small>${escapeHtml(link.replace(/^https?:\/\//,'').replace(/\/$/,''))}</small></span>
    </a>`:''}

    <div class="task-detail-actions">
      <div class="task-state-actions">
        ${task.done
          ?`<button id="detailRestore" class="soft-btn">↶ Return to To-do</button>`
          :`<button id="detailDone" class="soft-btn">✓ Mark as done</button>`
        }
      </div>
      <button id="detailClose" class="soft-btn">Close</button>
      <button id="detailSize" class="soft-btn">Size: ${(task.calendarSize||'medium')[0].toUpperCase()+(task.calendarSize||'medium').slice(1)}</button>
      <button id="detailEdit" class="detail-edit-btn">Edit</button>
    </div>
  </div>`);
  $('#detailClose').onclick=closeModal;
  $('#detailEdit').onclick=()=>openTaskModal(task);$('#detailSize').onclick=()=>openTaskSizePicker(task);
  if(task.done)$('#detailRestore').onclick=async()=>{closeModal();await restoreTask(task.id)}
  else $('#detailDone').onclick=async()=>{closeModal();await completeTask(task.id)}
}

function recurrenceDates(startDate,repeat){
  if(!repeat?.enabled)return[startDate];
  const start=dateFromInput(startDate),end=dateFromInput(repeat.until),out=[],interval=Math.max(1,Number(repeat.interval)||1),limit=1200;
  if(isNaN(end)||end<start)return[];
  if(repeat.unit==='day'){
    for(let d=new Date(start);d<=end&&out.length<limit;d=addDays(d,interval))out.push(fmtDateInput(d))
  }else if(repeat.unit==='week'){
    for(let d=new Date(start);d<=end&&out.length<limit;d=addDays(d,interval*7))out.push(fmtDateInput(d))
  }else{
    const desired=start.getDate();
    for(let n=0;out.length<limit;n+=interval){const d=addMonthsSafe(start,n,desired);if(d>end)break;out.push(fmtDateInput(d))}
  }
  return out
}
function repeatDescription(date,repeat){
  if(!repeat?.enabled)return'';
  const d=dateFromInput(date),interval=Math.max(1,Number(repeat.interval)||1);
  if(repeat.unit==='day')return interval===1?'Repeats every day.':`Repeats every ${interval} days.`;
  if(repeat.unit==='week'){const day=d.toLocaleDateString(undefined,{weekday:'long'});return interval===1?`Repeats every ${day}.`:`Repeats every ${interval} weeks on ${day}.`}
  const day=d.getDate(),suffix=(day%10===1&&day%100!==11)?'st':(day%10===2&&day%100!==12)?'nd':(day%10===3&&day%100!==13)?'rd':'th';
  return interval===1?`Repeats monthly on the ${day}${suffix}.`:`Repeats every ${interval} months on the ${day}${suffix}.`
}
function isSeriesTask(task){return !!task?.seriesId && tasks.filter(t=>t.seriesId===task.seriesId).length>1}
function readTaskForm(){
  const title=$('#fTitle').value.trim(),date=$('#fDate').value;
  if(!title||!date){toast('Task name and date are required.');return null}
  const enabled=$('#fRepeat').checked;
  const repeat=enabled?{enabled:true,unit:$('#fRepeatUnit').value,interval:Math.max(1,Number($('#fRepeatInterval').value)||1),until:$('#fRepeatUntil').value}:null;
  if(enabled&&!repeat.until){toast('Choose a Repeat until date.');return null}
  if(enabled&&dateFromInput(repeat.until)<dateFromInput(date)){toast('Repeat until must be on or after the start date.');return null}
  const rawLink=$('#fLink').value.trim(),link=normalizeTaskLink(rawLink);
  if(rawLink&&!link){toast('Enter a valid http(s) link.');return null}
  return{title,course:$('#fCourse').value.trim(),date,time:$('#fTime').value,emoji:$('#fEmoji').value.trim(),iconColor:$('#fIconColor').value,link,notes:$('#fNotes').value.trim(),repeat}
}
function bindRepeatPreview(){
  const update=()=>{
    const enabled=$('#fRepeat').checked;
    $('#repeatOptions').classList.toggle('hidden',!enabled);
    if(enabled){
      const repeat={enabled:true,unit:$('#fRepeatUnit').value,interval:Math.max(1,Number($('#fRepeatInterval').value)||1),until:$('#fRepeatUntil').value};
      $('#repeatSummary').textContent=repeatDescription($('#fDate').value,repeat)+(repeat.until?` Until ${dateFromInput(repeat.until).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}.`:'')
    }
  };
  ['#fRepeat','#fRepeatUnit','#fRepeatInterval','#fRepeatUntil','#fDate'].forEach(sel=>{const el=$(sel);if(el)el.addEventListener('change',update)});
  update()
}

function openTaskModal(task=null,prefillDate=''){
  const now=new Date(),t=task||{title:'',course:'',date:prefillDate||fmtDateInput(now),time:'',notes:'',done:false};
  const existingRepeat=t.repeat?.enabled?t.repeat:{enabled:false,unit:'week',interval:1,until:''};
  showModal(`<h3>${task?'Edit task':'Add task'}</h3><div class="form-grid">
    <div class="field full"><label>Task name</label><input id="fTitle" value="${escapeHtml(t.title)}" placeholder="Your task name"></div>
    <div class="field"><label>Course (optional)</label><input id="fCourse" value="${escapeHtml(t.course||'')}" placeholder="Your course name (if applicable)"></div>
    <div class="field"><label>Date</label><input id="fDate" type="date" value="${t.date}"></div>
    <div class="field"><label>Exact due time (optional)</label><input id="fTime" type="time" value="${t.time||''}"></div>
    <div class="field"><label>Emoji icon (optional)</label><input id="fEmoji" maxlength="8" value="${escapeHtml(t.emoji||'')}" placeholder="📘"></div>
    <div class="field"><label>Icon color (if no emoji)</label><select id="fIconColor"><option value="">None</option>${['red','orange','yellow','green','blue','indigo','purple'].map(c=>`<option value="${c}" ${t.iconColor===c?'selected':''}>${c[0].toUpperCase()+c.slice(1)}</option>`).join('')}</select></div>
    <div class="field full repeat-field">
      <label class="repeat-toggle"><input id="fRepeat" type="checkbox" ${existingRepeat.enabled?'checked':''}><span>Repeat</span></label>
      <div id="repeatOptions" class="repeat-options ${existingRepeat.enabled?'':'hidden'}">
        <div class="repeat-row"><span>Repeat every</span><input id="fRepeatInterval" type="number" min="1" max="99" value="${existingRepeat.interval||1}">
          <select id="fRepeatUnit"><option value="day" ${existingRepeat.unit==='day'?'selected':''}>day(s)</option><option value="week" ${existingRepeat.unit==='week'?'selected':''}>week(s)</option><option value="month" ${existingRepeat.unit==='month'?'selected':''}>month(s)</option></select>
        </div>
        <div id="repeatSummary" class="repeat-summary"></div>
        <div class="repeat-until"><label>Repeat until</label><input id="fRepeatUntil" type="date" value="${existingRepeat.until||''}"><div class="field-hint">The last occurrence will be on or before this date.</div></div>
      </div>
    </div>
    <div class="field full"><label>Link (optional)</label><input id="fLink" type="url" value="${escapeHtml(t.link||'')}" placeholder="https://…"></div>
    <div class="field full"><label>Description</label><textarea id="fNotes" placeholder="Add instructions, details, or anything useful…">${escapeHtml(t.notes||'')}</textarea></div>
  </div>
  <div class="modal-actions">${task?'<button id="deleteTask" class="danger-btn">Delete</button>':''}<button id="cancelModal" class="soft-btn">Cancel</button><button id="saveTask" class="primary-btn">Save</button></div>`);
  $('#cancelModal').onclick=closeModal;bindRepeatPreview();

  $('#saveTask').onclick=async()=>{
    const form=readTaskForm();if(!form)return;
    if(task&&isSeriesTask(task))return chooseSeriesSaveScope(task,form);
    if(task){
      await idbPut({...t,...form,repeat:form.repeat||null,updatedAt:Date.now()});closeModal();await refresh();toast('Task updated.');return
    }
    await createFromForm(form);closeModal();await refresh()
  };
  if(task)$('#deleteTask').onclick=()=>{if(isSeriesTask(task))chooseSeriesDeleteScope(task);else deleteSingle(task)}
}

async function createFromForm(form,seriesId=null){
  const dates=recurrenceDates(form.date,form.repeat);
  if(!dates.length){toast('Could not create repeated dates.');return}
  const sid=form.repeat?.enabled?(seriesId||crypto.randomUUID()):null,now=Date.now();
  for(const occurrenceDate of dates)await idbPut({id:crypto.randomUUID(),seriesId:sid,title:form.title,course:form.course,date:occurrenceDate,time:form.time,emoji:form.emoji,iconColor:form.iconColor,calendarSize:'medium',link:form.link,notes:form.notes,repeat:form.repeat||null,done:false,createdAt:now});
  toast(form.repeat?.enabled?`Added ${dates.length} repeated tasks.`:'Task added.')
}

function chooseSeriesSaveScope(task,form){
  showModal(`<div class="section-label">REPEATING TASK</div><h3>Apply this change to…</h3>
    <div class="scope-list">
      <button id="scopeOne" class="scope-btn"><strong>This occurrence only</strong><span>Only ${escapeHtml(formatDue(task))} changes. The rest of the series stays where it is.</span></button>
      <button id="scopeFuture" class="scope-btn"><strong>This and all following occurrences</strong><span>Use the edited date as the new pattern from this occurrence forward.</span></button>
    </div>
    <div class="modal-actions"><button id="scopeCancel" class="soft-btn">Cancel</button></div>`);
  $('#scopeCancel').onclick=()=>openTaskModal(task);
  $('#scopeOne').onclick=async()=>{
    await idbPut({...task,title:form.title,course:form.course,date:form.date,time:form.time,emoji:form.emoji,iconColor:form.iconColor,link:form.link,notes:form.notes,updatedAt:Date.now()});
    closeModal();await refresh();toast('Only this occurrence was updated.')
  };
  $('#scopeFuture').onclick=async()=>applySeriesFromHere(task,form)
}

async function applySeriesFromHere(task,form){
  const series=tasks.filter(t=>t.seriesId===task.seriesId);
  const future=series.filter(t=>t.date>=task.date);
  for(const t of future)await idbDelete(t.id);
  if(form.repeat?.enabled){
    await createFromForm(form,task.seriesId)
  }else{
    await idbPut({id:crypto.randomUUID(),seriesId:null,title:form.title,course:form.course,date:form.date,time:form.time,emoji:form.emoji,iconColor:form.iconColor,calendarSize:'medium',link:form.link,notes:form.notes,repeat:null,done:false,createdAt:Date.now()});
    toast('Future repeats removed; this occurrence is now one-time.')
  }
  closeModal();await refresh()
}

function chooseSeriesDeleteScope(task){
  showModal(`<div class="section-label">REPEATING TASK</div><h3>Delete which events?</h3>
    <div class="scope-list">
      <button id="deleteOne" class="scope-btn"><strong>This occurrence only</strong><span>Cancel only this one. Other weeks remain unchanged.</span></button>
      <button id="deleteFuture" class="scope-btn"><strong>This and all following occurrences</strong><span>Delete this occurrence and every later one in this series.</span></button>
    </div>
    <div class="modal-actions"><button id="deleteCancel" class="soft-btn">Cancel</button></div>`);
  $('#deleteCancel').onclick=()=>openTaskModal(task);
  $('#deleteOne').onclick=async()=>{await idbDelete(task.id);closeModal();await refresh();toast('This occurrence was deleted.')};
  $('#deleteFuture').onclick=async()=>{for(const t of tasks.filter(t=>t.seriesId===task.seriesId&&t.date>=task.date))await idbDelete(t.id);closeModal();await refresh();toast('This and following occurrences were deleted.')}
}
async function deleteSingle(task){await idbDelete(task.id);closeModal();await refresh();toast('Task deleted.')}

function openEmergency(task,diff){
  showModal(`<div class="section-label">URGENT DEADLINE</div><h3 style="font-size:30px;margin-top:6px">${escapeHtml(countdown(diff))}</h3><div style="font-size:18px;font-weight:800">${escapeHtml(task.course?task.course+' · ':'')}${escapeHtml(task.title)}</div><div class="next-meta" style="margin-top:7px">${escapeHtml(formatDue(task))}</div><div class="modal-actions"><button id="emClose" class="soft-btn">Keep working</button><button id="emDone" class="primary-btn">Mark as done</button></div>`);
  $('#emClose').onclick=closeModal;$('#emDone').onclick=()=>{closeModal();completeTask(task.id)}
}
async function restoreTask(id){
  const t=tasks.find(x=>x.id===id);if(!t)return;
  t.done=false;delete t.completedAt;
  await idbPut(t);await refresh();toast('Returned to To-do.');
}
async function completeTask(id){
  const t=tasks.find(x=>x.id===id);if(!t)return;
  const previous=JSON.parse(JSON.stringify(t)),today=fmtDateInput(new Date()),wasToday=t.date===today;
  t.done=true;t.completedAt=Date.now();await idbPut(t);confetti();await refresh();
  toastAction('Marked as done.','Undo',async()=>{const restored={...previous,done:false};delete restored.completedAt;await idbPut(restored);await refresh();toast('Task restored.');},6500);
  if(wasToday){const todays=deadlineTasks().filter(x=>x.date===today);if(todays.length&&todays.every(x=>x.done))setTimeout(()=>celebrateAllDoneToday(todays.length),380)}
}

function normalizeBatchLine(line){
  return line.replace(/[，]/g,',').replace(/[；]/g,';').replace(/[｜]/g,'|').replace(/\s+/g,' ').trim();
}
function parseDateLoose(s){
  if(!s)return'';
  s=s.trim();
  let m=s.match(/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
  if(m)return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m=s.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if(m){let y=+m[3];if(y<100)y+=2000;return `${y}-${pad(+m[1])}-${pad(+m[2])}`}
  const mm=s.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*|\s+)?(20\d{2})?\b/i);
  if(mm){
    const names={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
    const mon=names[mm[1].slice(0,4).toLowerCase()]||names[mm[1].slice(0,3).toLowerCase()];
    const year=+(mm[3]||new Date().getFullYear());
    return `${year}-${pad(mon)}-${pad(+mm[2])}`;
  }
  return'';
}
function dateTokenMatch(line){
  return line.match(/\b20\d{2}[-\/]\d{1,2}[-\/]\d{1,2}\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*|\s+)?20\d{2}\b/i)
    || line.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b/i);
}
function parseTimeLoose(s){
  if(!s)return'';
  s=s.trim();
  let m=s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if(m){let h=+m[1],min=+m[2],ap=(m[3]||'').toLowerCase();if(ap==='pm'&&h<12)h+=12;if(ap==='am'&&h===12)h=0;if(h<=23&&min<=59)return `${pad(h)}:${pad(min)}`}
  m=s.match(/^(\d{1,2})\s*(am|pm)$/i);
  if(m){let h=+m[1];if(m[2].toLowerCase()==='pm'&&h<12)h+=12;if(m[2].toLowerCase()==='am'&&h===12)h=0;return `${pad(h)}:00`}
  return'';
}
function timeTokenMatch(line){
  return line.match(/\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/i)||line.match(/\b\d{1,2}\s*(?:AM|PM)\b/i)||line.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/);
}
function courseTokenMatch(line){
  return line.match(/\b[A-Z]{2,6}\s*[- ]?\s*\d{3,4}[A-Z]?\b/i);
}
function cleanBatchTitle(s){
  return s.replace(/\b(?:due|deadline|at|on|by)\b/gi,' ')
    .replace(/^[\s|,;:—–\-]+|[\s|,;:—–\-]+$/g,'')
    .replace(/[\s|,;:—–\-]{2,}/g,' ')
    .replace(/\s+/g,' ').trim();
}
function parseFlexibleLine(raw){
  const line=normalizeBatchLine(raw);
  const dm=dateTokenMatch(line),tm=timeTokenMatch(line),cm=courseTokenMatch(line);
  const date=dm?parseDateLoose(dm[0]):'',time=tm?parseTimeLoose(tm[0]):'',course=cm?cm[0].replace(/\s*-\s*/,' ').replace(/\s+/g,' ').toUpperCase():'';
  let title=line;
  for(const token of [dm?.[0],tm?.[0],cm?.[0]])if(token)title=title.replace(token,' ');
  title=cleanBatchTitle(title);
  return{course,date,time,title,raw,ok:!!(date&&title)};
}
function parseBatch(text){
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),out=[];
  for(const raw of lines){
    if(raw.startsWith('#'))continue;
    const line=normalizeBatchLine(raw);
    // Explicit separators are welcome, but no longer required.
    // Flexible extraction still handles commas inside dates such as "Sep 8, 2026".
    out.push(parseFlexibleLine(line));
  }
  return out;
}
function openBatch(){
  const example=`PSYC 3500 | Sep 8, 2026 | 11:59 PM | Reflection Paper
HDFS 2300, Sep 18 2026, 2:30 PM, Chapter 1 Reading Quiz
Final Paper due Dec 16, 2026 at 11:59 PM PSYC 3105`;
  showModal(`<h3>Batch Paste</h3>
    <div class="batch-example">
      <div class="batch-example-head"><div><strong>Format example</strong><span>You can use |, commas, semicolons, tabs, or natural wording.</span></div><button id="copyBatchExample" class="soft-btn small">Copy example</button></div>
      <pre>${escapeHtml(example)}</pre>
    </div>
    <div class="field"><label>Paste or type your deadlines</label><textarea id="batchText" placeholder="Type one task per line…"></textarea></div>
    <div class="next-meta batch-help">The parser looks for a date, optional time, optional course code, and the remaining text as the task name. You will always review the results before import.</div>
    <div class="modal-actions"><button id="backupBtn" class="soft-btn" style="margin-right:auto">Backup / Restore</button><button id="cancelModal" class="soft-btn">Cancel</button><button id="previewBatch" class="primary-btn">Preview</button></div>`);
  $('#cancelModal').onclick=closeModal;
  $('#previewBatch').onclick=()=>previewBatch($('#batchText').value);
  $('#backupBtn').onclick=openBackup;
  $('#copyBatchExample').onclick=async()=>{
    try{await navigator.clipboard.writeText(example);toast('Example copied.')}
    catch{$('#batchText').value=example;$('#batchText').focus();toast('Example placed in the text box.')}
  };
}
function previewBatch(text){
  const parsed=parseBatch(text);if(!parsed.length)return toast('Paste at least one line.');
  const existingKey=new Set(tasks.map(t=>`${(t.course||'').toLowerCase()}|${t.date}|${t.time||''}|${t.title.toLowerCase()}`));
  parsed.forEach((p,i)=>{p.duplicate=existingKey.has(`${(p.course||'').toLowerCase()}|${p.date}|${p.time||''}|${p.title.toLowerCase()}`);p.idx=i});
  showModal(`<h3>${parsed.length} line${parsed.length===1?'':'s'} detected</h3><div class="batch-icon-options"><div><strong>Optional calendar icon for this import</strong><span>Emoji takes priority over color.</span></div><input id="batchEmoji" maxlength="8" placeholder="📚"><select id="batchIconColor"><option value="">No color</option>${['red','orange','yellow','green','blue','indigo','purple'].map(c=>`<option value="${c}">${c[0].toUpperCase()+c.slice(1)}</option>`).join('')}</select></div><div class="preview-list">${parsed.map(p=>`<label class="preview-row ${!p.ok||p.duplicate?'bad':''}"><input type="checkbox" data-import="${p.idx}" ${p.ok&&!p.duplicate?'checked':''} ${!p.ok?'disabled':''}><div><strong>${escapeHtml(p.title||'Could not identify task')}</strong><div class="tiny">${escapeHtml(p.course||'No course')} · ${escapeHtml(p.date||'Date not recognized')} · ${escapeHtml(p.time||'No specific time')}${p.duplicate?' · Possible duplicate':''}</div><div class="preview-raw">${escapeHtml(p.raw)}</div></div></label>`).join('')}</div><div class="modal-actions"><button id="backBatch" class="soft-btn">Back</button><button id="doImport" class="primary-btn">Import selected</button></div>`);
  $('#backBatch').onclick=openBatch;
  $('#doImport').onclick=async()=>{const selected=[...document.querySelectorAll('[data-import]:checked')].map(x=>parsed[+x.dataset.import]);const batchEmoji=$('#batchEmoji')?.value.trim()||'',batchIconColor=$('#batchIconColor')?.value||'';for(const p of selected)await idbPut({id:crypto.randomUUID(),title:p.title,course:p.course,date:p.date,time:p.time,emoji:batchEmoji,iconColor:batchEmoji?'':batchIconColor,calendarSize:'medium',notes:'',done:false,createdAt:Date.now()});closeModal();await refresh();toast(`Imported ${selected.length} task${selected.length===1?'':'s'}.`)}
}
function openBackup(){
  showModal(`<h3>Backup / Restore</h3><div class="next-meta">Export creates a JSON backup of every task, repeat series, and completion state. Restore merges the backup and keeps task IDs intact.</div><div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button id="exportJson" class="primary-btn">Export JSON</button><label class="soft-btn" style="cursor:pointer">Restore JSON<input id="restoreFile" type="file" accept="application/json" hidden></label><button id="cancelModal" class="soft-btn">Close</button></div>`);
  $('#cancelModal').onclick=closeModal;
  $('#exportJson').onclick=()=>{const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),tasks},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`deadline-garden-backup-${fmtDateInput(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
  $('#restoreFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text()),arr=Array.isArray(data)?data:data.tasks;if(!Array.isArray(arr))throw Error();for(const t of arr)if(t.id&&t.title&&t.date)await idbPut(t);closeModal();await refresh();toast(`Restored ${arr.length} tasks.`)}catch{toast('That backup file could not be read.')}}
}
function hideToast(){const t=$('#toast');t.classList.remove('show','actionable');t.innerHTML=''}
function toast(msg,duration=2300){
  const t=$('#toast');t.classList.remove('actionable');t.innerHTML=`<span>${escapeHtml(msg)}</span>`;t.classList.add('show');
  clearTimeout(toast._t);toast._t=setTimeout(hideToast,duration);
}
function toastAction(msg,label,action,duration=6500){
  const t=$('#toast');t.classList.add('actionable');t.innerHTML=`<span>${escapeHtml(msg)}</span><button id="toastActionBtn">${escapeHtml(label)}</button>`;t.classList.add('show');
  clearTimeout(toast._t);toast._t=setTimeout(hideToast,duration);
  $('#toastActionBtn').onclick=async()=>{clearTimeout(toast._t);hideToast();await action()}
}
function confetti(forceBig=false){const c=$('#confettiCanvas'),ctx=c.getContext('2d'),dpr=devicePixelRatio||1;c.width=innerWidth*dpr;c.height=innerHeight*dpr;ctx.scale(dpr,dpr);const amount=forceBig?150:(customize.confetti==='low'?28:customize.confetti==='high'?100:60);let ps=Array.from({length:amount},()=>({x:innerWidth/2,y:innerHeight*.3,vx:(Math.random()-.5)*8,vy:Math.random()*-7-3,g:.18,s:Math.random()*5+3,a:1}));let frame=0;(function anim(){ctx.clearRect(0,0,innerWidth,innerHeight);ps.forEach((p,i)=>{p.x+=p.vx;p.y+=p.vy;p.vy+=p.g;p.a-=.012;ctx.globalAlpha=Math.max(0,p.a);ctx.fillStyle=['#5f9c71','#9bc3a5','#d5b85a','#f0c7c7'][i%4];ctx.fillRect(p.x,p.y,p.s,p.s)});ctx.globalAlpha=1;if(frame++<90)requestAnimationFrame(anim);else ctx.clearRect(0,0,innerWidth,innerHeight)})()}

function celebrateAllDoneToday(count){
  confetti(true);
  const old=document.querySelector('.all-done-overlay');if(old)old.remove();
  const el=document.createElement('div');el.className='all-done-overlay';el.innerHTML=`<div><span>✦</span><strong>All done for today!</strong><small>${count} task${count===1?'':'s'} complete · enjoy the rest of your day</small></div>`;document.body.appendChild(el);setTimeout(()=>el.remove(),2600)
}

function applyCustomize(){document.body.dataset.flowerSize=customize.flowerSize||'medium';document.body.dataset.flowerOpacity=customize.flowerOpacity||'medium';document.body.dataset.confetti=customize.confetti||'medium';const note=$('.quick-note');if(note){note.dataset.color=customize.checklistColor||'postit';note.dataset.shape=customize.checklistShape||'postit'}renderHeader()}
function setCustomizeField(key,value){customize[key]=value;saveCustomize();document.querySelectorAll(`[data-customize-key="${key}"]`).forEach(b=>b.classList.toggle('active',b.dataset.customizeValue===value))}
function openWardrobe(){$('#themeMenu').classList.remove('hidden');document.querySelectorAll('[data-customize-key]').forEach(b=>b.classList.toggle('active',customize[b.dataset.customizeKey]===b.dataset.customizeValue))}
function applyTheme(theme){
  if(!THEMES.includes(theme))theme='green';
  document.documentElement.dataset.theme=theme;
  try{localStorage.setItem(THEME_KEY,theme)}catch{}
  document.querySelectorAll('[data-theme-choice]').forEach(b=>b.classList.toggle('active',b.dataset.themeChoice===theme))
}
function initTheme(){
  let saved='green';try{saved=localStorage.getItem(THEME_KEY)||'green'}catch{}
  applyTheme(saved);applyCustomize();
  $('#themeBtn').onclick=e=>{e.stopPropagation();if($('#themeMenu').classList.contains('hidden'))openWardrobe();else $('#themeMenu').classList.add('hidden')};
  document.querySelectorAll('[data-theme-choice]').forEach(b=>b.onclick=e=>{e.stopPropagation();applyTheme(b.dataset.themeChoice)});document.querySelectorAll('[data-customize-key]').forEach(b=>b.onclick=e=>{e.stopPropagation();setCustomizeField(b.dataset.customizeKey,b.dataset.customizeValue)});
  document.addEventListener('click',e=>{if(!e.target.closest('.theme-wrap'))$('#themeMenu').classList.add('hidden')})
}
function initPetalRain(){
  const root=$('#petalRain');if(!root)return;const glyphs=['✿','❀','✾','·'];
  for(let i=0;i<18;i++){const p=document.createElement('span');p.className='petal';p.textContent=glyphs[i%glyphs.length];p.style.left=`${Math.random()*100}%`;p.style.animationDuration=`${14+Math.random()*15}s`;p.style.animationDelay=`${-Math.random()*25}s`;p.style.fontSize=`${8+Math.random()*9}px`;p.style.opacity=`${.12+Math.random()*.20}`;root.appendChild(p)}
}

$('#addBtn').onclick=()=>openTaskModal();
$('#importBtn').onclick=openBatch;
$('#todoToggle').onclick=()=>{$('#todoPanel').classList.toggle('open');$('#todoPanel').setAttribute('aria-hidden',!$('#todoPanel').classList.contains('open'));document.querySelectorAll('[data-todo-badge]').forEach(r=>r.checked=r.value===customize.todoCount)};
$('#closeTodo').onclick=()=>{$('#todoPanel').classList.remove('open');$('#todoPanel').setAttribute('aria-hidden','true')};document.querySelectorAll('[data-todo-badge]').forEach(r=>r.onchange=()=>{if(r.checked){customize.todoCount=r.value;saveCustomize();renderHeader()}});
$('#prevMonth').onclick=()=>{
  if(calendarView==='month')currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()-1,1);
  else if(calendarView==='week')currentMonth=addDays(currentMonth,-7);
  else currentMonth=addDays(currentMonth,-1);
  renderCalendar();
};
$('#nextMonth').onclick=()=>{
  if(calendarView==='month')currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()+1,1);
  else if(calendarView==='week')currentMonth=addDays(currentMonth,7);
  else currentMonth=addDays(currentMonth,1);
  renderCalendar();
};
$('#todayBtn').onclick=()=>{currentMonth=new Date();renderCalendar()};
$('#displayBtn').onclick=openCalendarDisplay;$('#holidayBtn').onclick=openHolidayModal;
document.querySelectorAll('[data-cal-view]').forEach(b=>b.onclick=()=>setCalendarView(b.dataset.calView));
$('#quickTodoAdd').onclick=addQuickTodo;
$('#quickTodoInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addQuickTodo()}};$('#quickCollapse').onclick=()=>{$('.quick-note').classList.add('collapsed-away');$('#quickBubble').classList.remove('hidden')};$('#quickBubble').onclick=()=>{const note=$('.quick-note');$('#quickBubble').classList.add('hidden');note.classList.remove('collapsed-away');note.classList.remove('quick-note-pop');void note.offsetWidth;note.classList.add('quick-note-pop');setTimeout(()=>note.classList.remove('quick-note-pop'),420)};

(async()=>{
  initTheme();initPetalRain();await openDB();await refresh();
  setInterval(()=>{renderHeader();renderTodo();renderWarnings()},1000);
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{})
})();
