(function(){
  "use strict";

  /* =====================================================
     MODULE: Storage Layer
  ===================================================== */
  const storage = window.localStorage;

  function loadJSON(key, fallback){
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch(e) { return fallback; }
  }

  function saveJSON(key, value){
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch(e) { console.error('Storage save failed:', e); }
  }

  /* =====================================================
     MODULE: Helper Utils & State Initialization
  ===================================================== */
  function dateKeyFromDate(d){
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function todayKey(){ return dateKeyFromDate(new Date()); }
  
  function dateKeyFromOffset(offsetDays){
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    return dateKeyFromDate(d);
  }
  
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  
  function escapeHTML(str){
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Application State
  let state = {
    theme: loadJSON('pd_theme', 'light'),
    tasks: loadJSON('pd_tasks', []), // Daily Planner Tasks: {id, text, desc, priority, estTime, completed, createdAt}
    habits: loadJSON('pd_habits', []), // Habits: {id, name, icon, frequency, target, completedDates:[], currentStreak, bestStreak}
    timetable: loadJSON('pd_timetable', []), // Schedule time blocks: {id, name, start, end}
    history: loadJSON('pd_history', {}), // Daily productivity archive
    pomodoro: loadJSON('pd_pomodoro_settings', {workMin:25, breakMin:5, longMin:15}),
    pomodoroRun: loadJSON('pd_pomodoro_run', null), 
    lastActiveDate: loadJSON('pd_last_active_date', todayKey()),
    
    // NEW System State
    calendarTasks: loadJSON('pd_calendar_tasks', {}), // { "YYYY-MM-DD": [{id, text, completed}] }
    goals: loadJSON('pd_goals', []), // Weekly goals: {id, title, desc, completed, createdAt}
    journal: loadJSON('pd_journal', {}), // Daily reflection: { "YYYY-MM-DD": {q1, q2, q3, q4} }
    mood: loadJSON('pd_mood', {}), // Mood tracking: { "YYYY-MM-DD": {score, label, emoji} }
    learning: loadJSON('pd_learning', []), // Learning logs: {id, topic, category, notes, date}
    futureNotes: loadJSON('pd_future_notes', []), // Future reminders: {id, date, message, shown}
    focusLog: loadJSON('pd_focus_log', {}), // Focus duration tracking: { "YYYY-MM-DD": minutes }
    pomoSessionsToday: loadJSON('pd_pomo_sessions_today', 0)
  };

  function persistAll(){
    saveJSON('pd_tasks', state.tasks);
    saveJSON('pd_habits', state.habits);
    saveJSON('pd_timetable', state.timetable);
    saveJSON('pd_history', state.history);
    saveJSON('pd_pomodoro_settings', state.pomodoro);
    saveJSON('pd_last_active_date', state.lastActiveDate);
    
    // Persist new features
    saveJSON('pd_calendar_tasks', state.calendarTasks);
    saveJSON('pd_goals', state.goals);
    saveJSON('pd_journal', state.journal);
    saveJSON('pd_mood', state.mood);
    saveJSON('pd_learning', state.learning);
    saveJSON('pd_future_notes', state.futureNotes);
    saveJSON('pd_focus_log', state.focusLog);
    saveJSON('pd_pomo_sessions_today', state.pomoSessionsToday);
  }

  function persistPomodoroRun(){
    saveJSON('pd_pomodoro_run', state.pomodoroRun);
  }

  /* =====================================================
     MODULE: In-App Toast Notification
  ===================================================== */
  let toastTimer;
  function showToast(msg, icon='✓'){
    const toast = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    document.getElementById('toastIcon').textContent = icon;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=> toast.classList.remove('show'), 2800);
  }

  /* =====================================================
     MODULE: Browser Notification API
  ===================================================== */
  const BrowserNotify = {
    supported(){ return 'Notification' in window; },
    permission(){ return this.supported() ? Notification.permission : 'unsupported'; },
    async request(){
      if(!this.supported()) return 'unsupported';
      if(Notification.permission === 'default'){
        return new Promise((resolve) => {
          try {
            const promise = Notification.requestPermission(resolve);
            if (promise && typeof promise.then === 'function') {
              promise.then(resolve);
            }
          } catch (e) {
            Notification.requestPermission(resolve);
          }
        });
      }
      return Notification.permission;
    },
    fire(title, body){
      if(!this.supported() || Notification.permission !== 'granted') return;
      try {
        const iconUrl = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%3E%3Ctext%20y%3D%2280%22%20font-size%3D%2280%22%3E%E2%9A%A1%3C%2Ftext%3E%3C%2Fsvg%3E';
        const n = new Notification(title, {
          body,
          icon: iconUrl,
          tag: 'pd-pomo-' + Date.now()
        });
        setTimeout(()=> {
          try {
            n.close();
          } catch(e) {}
        }, 8000);
      } catch(e) {
        console.error('Browser Notification error:', e);
      }
    }
  };

  let titleFlashInterval = null;
  function startTitleFlash(message) {
    stopTitleFlash();
    const originalTitle = "Flowspace — Personal Productivity System";
    let isFlash = false;
    titleFlashInterval = setInterval(() => {
      document.title = isFlash ? originalTitle : message;
      isFlash = !isFlash;
    }, 1000);
    
    window.addEventListener('focus', stopTitleFlash, { once: true });
  }

  function stopTitleFlash() {
    if (titleFlashInterval) {
      clearInterval(titleFlashInterval);
      titleFlashInterval = null;
      document.title = "Flowspace — Personal Productivity System";
    }
  }

  function refreshNotifStatusUI(){
    const dot = document.getElementById('notifDot');
    const text = document.getElementById('notifStatusText');
    const enableBtn = document.getElementById('enableNotifBtn');
    const perm = BrowserNotify.permission();
    dot.classList.remove('on','off');
    if(perm === 'granted'){
      dot.classList.add('on');
      text.textContent = 'Notifications: on';
      enableBtn.style.display = 'none';
    } else if(perm === 'denied'){
      dot.classList.add('off');
      text.textContent = 'Notifications: blocked';
      enableBtn.textContent = 'Blocked 🔒 (Click for help)';
      enableBtn.style.display = 'inline-block';
    } else if(perm === 'unsupported'){
      text.textContent = 'Notifications: unsupported';
      enableBtn.style.display = 'none';
    } else {
      text.textContent = 'Notifications: off';
      enableBtn.textContent = 'Enable notifications';
      enableBtn.style.display = 'inline-block';
    }
  }

  document.getElementById('enableNotifBtn').addEventListener('click', async ()=>{
    const perm = BrowserNotify.permission();
    if(perm === 'denied'){
      showToast('Notifications are blocked by your browser settings. Click the lock/settings icon in your URL bar to allow them.', '🔒');
      return;
    }
    await BrowserNotify.request();
    refreshNotifStatusUI();
  });

  // Dynamic browser site settings listener
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'notifications' }).then((permissionStatus) => {
      permissionStatus.onchange = () => {
        refreshNotifStatusUI();
      };
    }).catch(e => console.log('Permissions API query not supported for notifications:', e));
  }

  /* =====================================================
     MODULE: Theme Manager
  ===================================================== */
  function applyTheme(){
    document.body.setAttribute('data-theme', state.theme);
    document.getElementById('themeLabel').textContent = state.theme === 'light' ? '☀️ Light Mode' : '🌙 Dark Mode';
  }
  document.getElementById('themeToggle').addEventListener('click', ()=>{
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    saveJSON('pd_theme', state.theme);
    applyTheme();
  });
  applyTheme();

  /* =====================================================
     MODULE: Navigation Router
  ===================================================== */
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.section');
  navItems.forEach(item=>{
    item.addEventListener('click', ()=>{
      navItems.forEach(n=>n.classList.remove('active'));
      item.classList.add('active');
      sections.forEach(s=>s.classList.remove('active'));
      
      const secId = item.dataset.section;
      document.getElementById(secId).classList.add('active');
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('overlay').classList.remove('show');
      
      // Perform module-specific initializations or rerenders
      if(secId === 'calendar') renderCalendar();
      if(secId === 'analytics') renderAnalytics();
      if(secId === 'mood') renderMoodTrackerUI();
      if(secId === 'journal') initJournalUI();
      if(secId === 'learning') renderLearningLog();
      if(secId === 'future') renderFutureNotes();
      if(secId === 'goals') renderGoals();
    });
  });

  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  menuToggle.addEventListener('click', ()=>{
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
  });
  overlay.addEventListener('click', ()=>{
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  });

  /* =====================================================
     MODULE: Live Clock, Greeting, Quote
  ===================================================== */
  function updateClock(){
    const now = new Date();
    let h = now.getHours(), m = now.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    document.getElementById('liveTime').textContent =
      String(h12).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ' ' + ampm;
    document.getElementById('liveDate').textContent =
      now.toLocaleDateString(undefined, {weekday:'long', month:'long', day:'numeric'});

    let greet = 'Good evening';
    if(h < 12) greet = 'Good morning';
    else if(h < 17) greet = 'Good afternoon';
    document.getElementById('greetingText').textContent = greet + ' , Sowmya 👋';
  }
  updateClock();
  setInterval(updateClock, 15000);

  const quotes = [
    {t:"The secret of getting ahead is getting started.", a:"Mark Twain"},
    {t:"Small daily improvements lead to staggering long-term results.", a:"Robin Sharma"},
    {t:"Discipline is choosing between what you want now and what you want most.", a:"Abraham Lincoln"},
    {t:"Productivity is never an accident; it's the result of commitment.", a:"Paul J. Meyer"},
    {t:"Focus on being productive instead of busy.", a:"Tim Ferriss"},
    {t:"You don't have to be great to start, but you have to start to be great.", a:"Zig Ziglar"},
    {t:"Done is better than perfect.", a:"Sheryl Sandberg"},
    {t:"The future depends on what you do today.", a:"Mahatma Gandhi"}
  ];
  (function setQuote(){
    const dayIndex = new Date().getDate() % quotes.length;
    document.getElementById('quoteText').textContent = '"' + quotes[dayIndex].t + '"';
    document.getElementById('quoteAuthor').textContent = '— ' + quotes[dayIndex].a;
  })();

  /* =====================================================
     MODULE: Daily Reset & History Log
  ===================================================== */
  function runDailyReset(){
    const today = todayKey();
    if(state.lastActiveDate === today) return;

    let cursor = new Date(state.lastActiveDate);
    const todayDate = new Date(today);
    while(cursor < todayDate){
      const key = dateKeyFromDate(cursor);
      if(!state.history[key]){
        state.history[key] = { tasksCompleted:0, habitsCompleted:0, habitsTotal: state.habits.length, score:0 };
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    
    // Reset focus sessions today count
    state.pomoSessionsToday = 0;
    state.lastActiveDate = today;
    persistAll();
    showToast('A new day has dawned! Flows updated. 📅','🌅');
  }

  /* =====================================================
     MODULE: Time Blocking (Timetable)
  ===================================================== */
  function timeToMinutes(t){
    const [h,m] = t.split(':').map(Number);
    return h * 60 + m;
  }
  
  function formatTime(t){
    const [h,m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return String(h12).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ' ' + ampm;
  }
  
  function getCurrentMinutes(){
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  // Conflict detection algorithm
  function hasTimeConflict(newStart, newEnd, excludeId = null){
    const startMin = timeToMinutes(newStart);
    const endMin = timeToMinutes(newEnd);
    
    for(let block of state.timetable){
      if(excludeId && block.id === excludeId) continue;
      const blockStart = timeToMinutes(block.start);
      const blockEnd = timeToMinutes(block.end);
      
      // Check overlap
      if((startMin >= blockStart && startMin < blockEnd) || 
         (endMin > blockStart && endMin <= blockEnd) || 
         (startMin <= blockStart && endMin >= blockEnd)){
        return true;
      }
    }
    return false;
  }

  function renderTimetable(){
    const sorted = [...state.timetable].sort((a,b)=> timeToMinutes(a.start) - timeToMinutes(b.start));
    const nowMin = getCurrentMinutes();

    function buildList(container, editable){
      if(!container) return;
      container.innerHTML = '';
      if(sorted.length === 0){
        container.innerHTML = '<div class="empty-state"><span class="emoji">🗓️</span>No scheduled time blocks today.</div>';
        return;
      }
      sorted.forEach(item=>{
        const start = timeToMinutes(item.start), end = timeToMinutes(item.end);
        const isCurrent = nowMin >= start && nowMin < end;
        const row = document.createElement('div');
        row.className = 'timetable-item' + (isCurrent ? ' current':'');
        row.innerHTML = `
          <div class="tt-time">${formatTime(item.start)}<br>${formatTime(item.end)}</div>
          <div class="tt-info">
            <div class="tt-name">${escapeHTML(item.name)}${isCurrent ? '<span class="live-badge">NOW</span>':''}</div>
          </div>
          ${editable ? `<div class="tt-actions">
            <button class="icon-btn edit-tt" data-id="${item.id}">✎</button>
            <button class="icon-btn danger del-tt" data-id="${item.id}">🗑</button>
          </div>` : ''}
        `;
        container.appendChild(row);
      });
    }

    buildList(document.getElementById('timetableList'), true);
    buildList(document.getElementById('overviewTimetable'), false);

    // Delete binding
    document.querySelectorAll('.del-tt').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        state.timetable = state.timetable.filter(t=>t.id !== btn.dataset.id);
        persistAll(); renderTimetable(); renderOverview();
        showToast('Activity time block removed','🗑');
      });
    });

    // Edit binding
    document.querySelectorAll('.edit-tt').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const item = state.timetable.find(t=>t.id === btn.dataset.id);
        if(!item) return;
        document.getElementById('ttName').value = item.name;
        document.getElementById('ttStart').value = item.start;
        document.getElementById('ttEnd').value = item.end;
        state.timetable = state.timetable.filter(t=>t.id !== item.id);
        persistAll(); renderTimetable();
      });
    });
  }

  // Conflict warning dynamically during scheduling
  const startInput = document.getElementById('ttStart');
  const endInput = document.getElementById('ttEnd');
  const warningLabel = document.getElementById('timetableConflictWarning');

  function checkLiveConflict(){
    if(startInput.value && endInput.value){
      if(hasTimeConflict(startInput.value, endInput.value)){
        warningLabel.style.display = 'inline';
      } else {
        warningLabel.style.display = 'none';
      }
    }
  }
  startInput.addEventListener('change', checkLiveConflict);
  endInput.addEventListener('change', checkLiveConflict);

  document.getElementById('timetableForm').addEventListener('submit', e=>{
    e.preventDefault();
    const name = document.getElementById('ttName').value.trim();
    const start = startInput.value;
    const end = endInput.value;
    if(!name || !start || !end) return;

    if(timeToMinutes(end) <= timeToMinutes(start)){
      showToast('End time must succeed start time','⚠️');
      return;
    }

    if(hasTimeConflict(start, end)){
      showToast('Scheduling conflict detected! Overlapping block.','⚠️');
      return;
    }

    state.timetable.push({id:uid(), name, start, end});
    persistAll();
    e.target.reset();
    warningLabel.style.display = 'none';
    renderTimetable();
    renderOverview();
    showToast('Time block scheduled','✓');
  });

  /* =====================================================
     MODULE: Daily Planner & Task Tracker (Enhanced)
  ===================================================== */
  let currentFilter = 'all';

  function renderTodos(){
    const list = document.getElementById('todoList');
    if(!list) return;
    
    let filtered = state.tasks;
    if(currentFilter === 'completed') filtered = state.tasks.filter(t=>t.completed);
    if(currentFilter === 'pending') filtered = state.tasks.filter(t=>!t.completed);

    list.innerHTML = '';
    if(filtered.length === 0){
      list.innerHTML = '<div class="empty-state"><span class="emoji">✅</span>All clear! No tasks matching filters.</div>';
    } else {
      filtered.slice().reverse().forEach(task=>{
        const row = document.createElement('div');
        row.className = 'todo-item' + (task.completed ? ' completed':'');
        
        row.innerHTML = `
          <div class="todo-left">
            <div class="todo-checkbox ${task.completed?'checked':''}" data-id="${task.id}">${task.completed?'✓':''}</div>
            <div class="todo-info">
              <div class="todo-text">${escapeHTML(task.text)}</div>
              ${task.desc ? `<div class="todo-desc">${escapeHTML(task.desc)}</div>` : ''}
            </div>
          </div>
          <div>
            <span class="priority-badge ${task.priority.toLowerCase()}">${task.priority}</span>
          </div>
          <div>
            <span class="est-time-text">⏳ ${task.estTime || 0}m</span>
          </div>
          <div class="tt-actions">
            <button class="icon-btn edit-todo" data-id="${task.id}">✎</button>
            <button class="icon-btn danger del-todo" data-id="${task.id}">🗑</button>
          </div>
        `;
        list.appendChild(row);
      });
    }

    // Bind checkbox action
    document.querySelectorAll('.todo-checkbox').forEach(box=>{
      box.addEventListener('click', ()=>{
        const task = state.tasks.find(t=>t.id === box.dataset.id);
        if(!task) return;
        task.completed = !task.completed;
        persistAll();
        updateTodayHistory();
        renderTodos(); 
        renderOverview(); 
        checkBadges();
      });
    });

    // Bind delete action
    document.querySelectorAll('.del-todo').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        state.tasks = state.tasks.filter(t=>t.id !== btn.dataset.id);
        persistAll(); updateTodayHistory();
        renderTodos(); renderOverview();
        showToast('Task removed from planner','🗑');
      });
    });

    // Bind edit action
    document.querySelectorAll('.edit-todo').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const task = state.tasks.find(t=>t.id === btn.dataset.id);
        if(!task) return;
        const newTitle = prompt('Edit Task Title:', task.text);
        if(newTitle !== null && newTitle.trim() !== ''){
          task.text = newTitle.trim();
          const newDesc = prompt('Edit Description:', task.desc || '');
          if(newDesc !== null) task.desc = newDesc.trim();
          persistAll();
          renderTodos();
          renderOverview();
        }
      });
    });

    // Update Planner stats headers
    const total = state.tasks.length;
    const completed = state.tasks.filter(t=>t.completed).length;
    const percent = total ? Math.round((completed/total)*100) : 0;
    
    const progressPercentLabel = document.getElementById('plannerProgressPercent');
    const progressCountsLabel = document.getElementById('plannerProgressCounts');
    if(progressPercentLabel) progressPercentLabel.textContent = percent + '%';
    if(progressCountsLabel) progressCountsLabel.textContent = `${completed}/${total} completed`;
  }

  // Add Task submit
  const todoForm = document.getElementById('todoForm');
  if(todoForm){
    todoForm.addEventListener('submit', e=>{
      e.preventDefault();
      const text = document.getElementById('todoInput').value.trim();
      const desc = document.getElementById('todoDescInput').value.trim();
      const priority = document.getElementById('todoPriorityInput').value;
      const estTime = parseInt(document.getElementById('todoEstTimeInput').value) || 0;

      if(!text) return;
      state.tasks.push({
        id: uid(),
        text,
        desc,
        priority,
        estTime,
        completed: false,
        createdAt: Date.now()
      });
      persistAll();
      e.target.reset();
      renderTodos();
      renderOverview();
      showToast('Task added to Planner','✓');
    });
  }

  document.querySelectorAll('.filter-tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      document.querySelectorAll('.filter-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderTodos();
    });
  });

  /* =====================================================
     MODULE: Habit Tracker System
  ===================================================== */
  function recalcStreak(habit){
    let streak = 0;
    let offset = 0;
    if(!habit.completedDates.includes(todayKey())){
      offset = 1; 
    }
    while(habit.completedDates.includes(dateKeyFromOffset(offset))){
      streak++;
      offset++;
    }
    habit.currentStreak = streak;
    if(streak > (habit.bestStreak||0)) habit.bestStreak = streak;
  }

  function renderHabits(){
    const list = document.getElementById('habitList');
    if(!list) return;

    list.innerHTML = '';
    if(state.habits.length === 0){
      list.innerHTML = '<div class="empty-state"><span class="emoji">🌱</span>Start tracking your habits here. Add one above!</div>';
      return;
    }
    const tKey = todayKey();
    state.habits.forEach(habit=>{
      recalcStreak(habit);
      const doneToday = habit.completedDates.includes(tKey);
      
      // Calculate completion rate (completed days / total active days since creation, mock rate for simplicity)
      const completionRate = habit.completedDates.length ? Math.min(100, Math.round((habit.completedDates.length / 30) * 100)) : 0;
      
      const row = document.createElement('div');
      row.className = 'habit-item';
      row.innerHTML = `
        <div class="habit-top">
          <div class="habit-info-block">
            <span class="habit-emoji">${habit.icon || '🔥'}</span>
            <div class="habit-title-wrap">
              <div class="habit-name">${escapeHTML(habit.name)}</div>
              <div class="habit-meta">Frequency: ${habit.frequency} | Completion rate: ${completionRate}%</div>
            </div>
          </div>
          <button class="icon-btn danger del-habit" data-id="${habit.id}">🗑</button>
        </div>
        <div class="habit-bottom">
          <div class="streak-badges">
            <span class="streak-pill current">🔥 Streak: ${habit.currentStreak} d</span>
            <span class="streak-pill best">🏅 Longest: ${habit.bestStreak||0} d</span>
          </div>
          <button class="habit-check-btn ${doneToday?'done':''}" data-id="${habit.id}">
            ${doneToday ? '✓ Checked' : 'Check In'}
          </button>
        </div>
      `;
      list.appendChild(row);
    });

    // Habit completions events
    document.querySelectorAll('.habit-check-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const habit = state.habits.find(h=>h.id === btn.dataset.id);
        if(!habit) return;
        const tKey = todayKey();
        const idx = habit.completedDates.indexOf(tKey);
        if(idx >= 0){
          habit.completedDates.splice(idx,1);
        } else {
          habit.completedDates.push(tKey);
          showToast('Habit Checked in! 🔥');
        }
        recalcStreak(habit);
        persistAll();
        updateTodayHistory();
        renderHabits();
        renderOverview();
        checkBadges();
      });
    });

    document.querySelectorAll('.del-habit').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        state.habits = state.habits.filter(h=>h.id !== btn.dataset.id);
        persistAll(); updateTodayHistory();
        renderHabits(); renderOverview();
        showToast('Habit deleted','🗑');
      });
    });
  }

  const habitForm = document.getElementById('habitForm');
  if(habitForm){
    habitForm.addEventListener('submit', e=>{
      e.preventDefault();
      const name = document.getElementById('habitName').value.trim();
      const icon = document.getElementById('habitIcon').value.trim() || '🔥';
      const frequency = document.getElementById('habitFrequency').value;
      const target = parseInt(document.getElementById('habitTarget').value) || 1;

      if(!name) return;
      state.habits.push({
        id: uid(),
        name,
        icon,
        frequency,
        target,
        completedDates: [],
        currentStreak: 0,
        bestStreak: 0
      });
      persistAll();
      e.target.reset();
      document.getElementById('habitIcon').value = '🔥';
      renderHabits();
      renderOverview();
      showToast('Habit setup successfully','🌱');
    });
  }

  /* =====================================================
     MODULE: Pomodoro System (Enhanced 3-modes)
  ===================================================== */
  let pomoWorker = null;

  function initPomoWorker() {
    if (pomoWorker) return;
    try {
      const blobCode = `
        let timer = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (timer) clearInterval(timer);
            timer = setInterval(() => {
              self.postMessage('tick');
            }, 1000);
          } else if (e.data === 'stop') {
            if (timer) {
              clearInterval(timer);
              timer = null;
            }
          }
        };
      `;
      const blob = new Blob([blobCode], { type: 'application/javascript' });
      pomoWorker = new Worker(URL.createObjectURL(blob));
      pomoWorker.onmessage = function() {
        Pomodoro.checkAndRender();
      };
    } catch (e) {
      console.error('Failed to initialize Pomodoro Web Worker:', e);
    }
  }

  const Pomodoro = {
    interval: null,

    init(){
      initPomoWorker();
      const workInput = document.getElementById('pomoWorkInput');
      const breakInput = document.getElementById('pomoBreakInput');
      const longInput = document.getElementById('pomoLongInput');
      
      if(workInput) workInput.value = state.pomodoro.workMin;
      if(breakInput) breakInput.value = state.pomodoro.breakMin;
      if(longInput) longInput.value = state.pomodoro.longMin || 15;

      // Restore active run
      if(state.pomodoroRun){
        const run = state.pomodoroRun;
        const remaining = Math.round((run.endTimestamp - Date.now())/1000);
        if(run.isRunning && remaining > 0){
          this.startInterval();
        } else if(run.isRunning && remaining <= 0){
          this.handlePhaseEnd(run.mode, true);
        }
      }
      this.render();

      const pStart = document.getElementById('pomoStart');
      const pPause = document.getElementById('pomoPause');
      const pReset = document.getElementById('pomoReset');

      if(pStart) pStart.addEventListener('click', ()=> this.start());
      if(pPause) pPause.addEventListener('click', ()=> this.pause());
      if(pReset) pReset.addEventListener('click', ()=> this.reset());

      // Bind mode tabs
      const fBtn = document.getElementById('pomoModeFocus');
      const sBtn = document.getElementById('pomoModeShort');
      const lBtn = document.getElementById('pomoModeLong');

      if(fBtn) fBtn.addEventListener('click', ()=> this.changeModePreset('Focus', state.pomodoro.workMin));
      if(sBtn) sBtn.addEventListener('click', ()=> this.changeModePreset('Break', state.pomodoro.breakMin));
      if(lBtn) lBtn.addEventListener('click', ()=> this.changeModePreset('Long Break', state.pomodoro.longMin || 15));

      document.addEventListener('visibilitychange', ()=>{
        if(document.visibilityState === 'visible'){
          this.checkAndRender();
        }
      });
    },

    changeModePreset(modeLabel, mins){
      this.stopInterval();
      state.pomodoroRun = {
        mode: modeLabel,
        totalSeconds: mins * 60,
        endTimestamp: Date.now() + (mins * 60 * 1000),
        isRunning: false,
        remainingSecondsAtPause: mins * 60
      };
      persistPomodoroRun();
      
      // Update UI active tab class
      document.querySelectorAll('.pomodoro-modes .btn').forEach(b=>b.classList.remove('active'));
      if(modeLabel === 'Focus') document.getElementById('pomoModeFocus').classList.add('active');
      if(modeLabel === 'Break') document.getElementById('pomoModeShort').classList.add('active');
      if(modeLabel === 'Long Break') document.getElementById('pomoModeLong').classList.add('active');
      
      this.render();
    },

    getRemainingSeconds(){
      if(!state.pomodoroRun) return state.pomodoro.workMin * 60;
      if(!state.pomodoroRun.isRunning) return state.pomodoroRun.remainingSecondsAtPause ?? state.pomodoroRun.totalSeconds;
      const remaining = Math.round((state.pomodoroRun.endTimestamp - Date.now())/1000);
      return Math.max(remaining, 0);
    },

    async start(){
      if(BrowserNotify.permission() === 'default'){
        await BrowserNotify.request();
        refreshNotifStatusUI();
      }

      state.pomodoro.workMin = parseFloat(document.getElementById('pomoWorkInput').value) || 25;
      state.pomodoro.breakMin = parseFloat(document.getElementById('pomoBreakInput').value) || 5;
      state.pomodoro.longMin = parseFloat(document.getElementById('pomoLongInput').value) || 15;
      saveJSON('pd_pomodoro_settings', state.pomodoro);

      let mode, totalSeconds, remainingSeconds;
      if(state.pomodoroRun && !state.pomodoroRun.isRunning){
        mode = state.pomodoroRun.mode;
        totalSeconds = state.pomodoroRun.totalSeconds;
        remainingSeconds = state.pomodoroRun.remainingSecondsAtPause ?? totalSeconds;
      } else {
        mode = 'Focus';
        totalSeconds = state.pomodoro.workMin * 60;
        remainingSeconds = totalSeconds;
      }

      state.pomodoroRun = {
        mode,
        totalSeconds,
        endTimestamp: Date.now() + remainingSeconds*1000,
        isRunning: true
      };
      persistPomodoroRun();
      this.startInterval();
      this.render();
      showToast('Timer ticking','▶️');
    },

    pause(){
      if(!state.pomodoroRun || !state.pomodoroRun.isRunning) return;
      const remaining = this.getRemainingSeconds();
      state.pomodoroRun.isRunning = false;
      state.pomodoroRun.remainingSecondsAtPause = remaining;
      persistPomodoroRun();
      this.stopInterval();
      this.render();
      showToast('Timer suspended','⏸️');
    },

    reset(){
      this.stopInterval();
      state.pomodoroRun = null;
      persistPomodoroRun();
      this.render();
      showToast('Timer reset','🔄');
    },

    startInterval(){
      this.stopInterval();
      if (pomoWorker) {
        pomoWorker.postMessage('start');
      } else {
        this.interval = setInterval(()=> this.checkAndRender(), 1000);
      }
    },
    stopInterval(){
      if (pomoWorker) {
        pomoWorker.postMessage('stop');
      }
      if(this.interval){ clearInterval(this.interval); this.interval = null; }
    },

    checkAndRender(){
      if(state.pomodoroRun && state.pomodoroRun.isRunning){
        const remaining = this.getRemainingSeconds();
        if(remaining <= 0){
          this.handlePhaseEnd(state.pomodoroRun.mode, false);
          return;
        }
      }
      this.render();
    },

    handlePhaseEnd(endedMode, reloaded){
      this.playChime();
      let nextMode, nextTotal;
      if(endedMode === 'Focus'){
        // Log focus minutes completed
        const mins = state.pomodoro.workMin;
        const currentLog = state.focusLog[todayKey()] || 0;
        state.focusLog[todayKey()] = currentLog + mins;
        
        state.pomoSessionsToday = (state.pomoSessionsToday || 0) + 1;
        persistAll();

        BrowserNotify.fire('Session completed! 🎉', 'Amazing focus! Have a break now.');
        if(!reloaded) {
          showToast('Session complete! Rest now 🎉','🔔');
          startTitleFlash('🎉 Session Complete! 🎉');
        }
        
        nextMode = 'Break';
        nextTotal = state.pomodoro.breakMin * 60;
      } else {
        BrowserNotify.fire('Break completed! ⏰', 'Let us get back to focus.');
        if(!reloaded) {
          showToast('Break over! Let us focus 💪','🔔');
          startTitleFlash('⏰ Break Over! ⏰');
        }
        nextMode = 'Focus';
        nextTotal = state.pomodoro.workMin * 60;
      }

      state.pomodoroRun = {
        mode: nextMode,
        totalSeconds: nextTotal,
        endTimestamp: Date.now() + nextTotal * 1000,
        isRunning: true
      };
      persistPomodoroRun();
      this.startInterval();
      this.render();
      renderOverview();
    },

    playChime(){
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [440, 554, 659].forEach((freq, i)=>{
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.1, ctx.currentTime + i*0.15);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i*0.15 + 0.3);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(ctx.currentTime + i*0.15);
          osc.stop(ctx.currentTime + i*0.15 + 0.35);
        });
      } catch(e) {}
    },

    formatTime(s){
      const m = Math.floor(s/60), sec = s%60;
      return String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
    },

    render(){
      const remaining = this.getRemainingSeconds();
      const total = state.pomodoroRun ? state.pomodoroRun.totalSeconds : state.pomodoro.workMin * 60;
      const mode = state.pomodoroRun ? state.pomodoroRun.mode : 'Focus';
      const isRunning = state.pomodoroRun ? state.pomodoroRun.isRunning : false;

      const pTime = document.getElementById('pomoTime');
      const pMode = document.getElementById('pomoMode');
      const pSessionsCount = document.getElementById('pomoSessionsCount');
      
      if(pTime) pTime.textContent = this.formatTime(remaining);
      if(pMode) pMode.textContent = mode;
      if(pSessionsCount) pSessionsCount.textContent = state.pomoSessionsToday || 0;

      const percent = total ? ((total - remaining) / total) * 100 : 0;
      const ring = document.getElementById('pomoRing');
      if(ring) setRing(ring, percent, 86);

      const startBtn = document.getElementById('pomoStart');
      if(startBtn){
        startBtn.disabled = isRunning;
        startBtn.textContent = (state.pomodoroRun && !isRunning && remaining < total && remaining > 0) ? 'Resume' : 'Start';
      }
    }
  };

  /* =====================================================
     MODULE: Weekly Goals Board
  ===================================================== */
  function renderGoals(){
    const list = document.getElementById('goalsList');
    if(!list) return;
    list.innerHTML = '';
    
    if(state.goals.length === 0){
      list.innerHTML = '<div class="empty-state"><span class="emoji">🎯</span>No goals set for this week. Plan them now!</div>';
      updateGoalsProgress();
      return;
    }

    state.goals.forEach(goal=>{
      const row = document.createElement('div');
      row.className = 'goal-item' + (goal.completed ? ' completed':'');
      row.innerHTML = `
        <div class="goal-checkbox ${goal.completed?'checked':''}" data-id="${goal.id}">${goal.completed?'✓':''}</div>
        <div class="goal-info">
          <div class="goal-title">${escapeHTML(goal.title)}</div>
          ${goal.desc ? `<div class="goal-desc">${escapeHTML(goal.desc)}</div>` : ''}
        </div>
        <button class="icon-btn danger del-goal" data-id="${goal.id}">🗑</button>
      `;
      list.appendChild(row);
    });

    document.querySelectorAll('.goal-checkbox').forEach(box=>{
      box.addEventListener('click', ()=>{
        const goal = state.goals.find(g=>g.id === box.dataset.id);
        if(!goal) return;
        goal.completed = !goal.completed;
        persistAll();
        renderGoals();
        renderOverview();
      });
    });

    document.querySelectorAll('.del-goal').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        state.goals = state.goals.filter(g=>g.id !== btn.dataset.id);
        persistAll();
        renderGoals();
        renderOverview();
        showToast('Weekly goal deleted','🗑');
      });
    });

    updateGoalsProgress();
  }

  function updateGoalsProgress(){
    const total = state.goals.length;
    const completed = state.goals.filter(g=>g.completed).length;
    const percent = total ? Math.round((completed/total)*100) : 0;

    const countLabel = document.getElementById('goalsProgressCounts');
    const pctLabel = document.getElementById('goalsProgressPct');
    const bar = document.getElementById('goalsProgressBarFill');

    if(countLabel) countLabel.textContent = `${completed}/${total}`;
    if(pctLabel) pctLabel.textContent = `${percent}%`;
    if(bar) bar.style.width = `${percent}%`;
  }

  const goalsForm = document.getElementById('goalsForm');
  if(goalsForm){
    goalsForm.addEventListener('submit', e=>{
      e.preventDefault();
      const title = document.getElementById('goalTitle').value.trim();
      const desc = document.getElementById('goalDesc').value.trim();

      if(!title) return;
      state.goals.push({
        id: uid(),
        title,
        desc,
        completed: false,
        createdAt: Date.now()
      });
      persistAll();
      e.target.reset();
      renderGoals();
      renderOverview();
      showToast('Weekly goal set','🎯');
    });
  }

  /* =====================================================
     MODULE: Interactive Calendar
  ===================================================== */
  let currentCalDate = new Date();
  let selectedCalKey = todayKey();

  function renderCalendar(){
    const grid = document.getElementById('calendarGrid');
    if(!grid) return;
    grid.innerHTML = '';

    const label = document.getElementById('calMonthYearLabel');
    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();
    
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    if(label) label.textContent = monthNames[month] + " " + year;

    // First day of current month
    const firstDayIndex = new Date(year, month, 1).getDay();
    // Last day of current month
    const lastDay = new Date(year, month + 1, 0).getDate();
    // Last day of previous month
    const prevLastDay = new Date(year, month, 0).getDate();

    const todayStr = todayKey();

    // Render preceding month padding cells
    for(let x = firstDayIndex; x > 0; x--){
      const dayNum = prevLastDay - x + 1;
      const cellKey = dateKeyFromDate(new Date(year, month - 1, dayNum));
      createDayCell(dayNum, true, cellKey);
    }

    // Render current month active cells
    for(let i = 1; i <= lastDay; i++){
      const cellKey = dateKeyFromDate(new Date(year, month, i));
      createDayCell(i, false, cellKey);
    }

    // Render succeeding month padding cells to complete a balanced calendar grid
    const totalCells = grid.children.length;
    const remainingCells = 42 - totalCells;
    for(let y = 1; y <= remainingCells; y++){
      const cellKey = dateKeyFromDate(new Date(year, month + 1, y));
      createDayCell(y, true, cellKey);
    }

    function createDayCell(num, isOtherMonth, cellKey){
      const cell = document.createElement('div');
      cell.className = 'cal-day';
      if(isOtherMonth) cell.classList.add('other-month');
      if(cellKey === todayStr) cell.classList.add('today');
      if(cellKey === selectedCalKey) cell.classList.add('selected');

      cell.innerHTML = `<span class="cal-day-num">${num}</span>`;

      // Check task count for the day
      const dayTasks = state.calendarTasks[cellKey] || [];
      if(dayTasks.length > 0){
        cell.innerHTML += `<span class="cal-task-count">${dayTasks.length}</span>`;
      }

      cell.addEventListener('click', ()=>{
        selectedCalKey = cellKey;
        document.querySelectorAll('.cal-day').forEach(c=>c.classList.remove('selected'));
        cell.classList.add('selected');
        renderCalendarDetails();
      });

      grid.appendChild(cell);
    }

    renderCalendarDetails();
  }

  document.getElementById('calPrevMonth').addEventListener('click', ()=>{
    currentCalDate.setMonth(currentCalDate.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('calNextMonth').addEventListener('click', ()=>{
    currentCalDate.setMonth(currentCalDate.getMonth() + 1);
    renderCalendar();
  });

  function renderCalendarDetails(){
    const label = document.getElementById('calDetailsDateLabel');
    const content = document.getElementById('calDetailsContent');
    if(!content) return;

    if(label) label.textContent = selectedCalKey;

    const dayTasks = state.calendarTasks[selectedCalKey] || [];
    const dayJournal = state.journal[selectedCalKey];
    const dayMood = state.mood[selectedCalKey];
    const dayFocus = state.focusLog[selectedCalKey] || 0;

    let html = `
      <div class="cal-details-stat"><span class="lbl">Focus Time Logged:</span><span class="val">${dayFocus} mins</span></div>
      <div class="cal-details-stat"><span class="lbl">Mood Entry:</span><span class="val">${dayMood ? `${dayMood.emoji} ${dayMood.label}` : 'None logged'}</span></div>
    `;

    // Render Journal if exists
    if(dayJournal){
      html += `
        <div class="cal-details-journal mt-3">
          <h5>Daily Reflection Journal</h5>
          <p><strong>Accomplishments:</strong> ${escapeHTML(dayJournal.q1)}</p>
          <p><strong>Distractions:</strong> ${escapeHTML(dayJournal.q2)}</p>
          <p><strong>Learned:</strong> ${escapeHTML(dayJournal.q3)}</p>
          <p><strong>Improvement:</strong> ${escapeHTML(dayJournal.q4)}</p>
        </div>
      `;
    } else {
      html += `<div class="text-muted mt-3">No reflections saved for this date.</div>`;
    }

    // Render Tasks
    html += `
      <div class="cal-details-tasks-box mt-3">
        <h5>Calendar Special Tasks (${dayTasks.length})</h5>
        <div class="cal-details-tasks-list">
    `;

    if(dayTasks.length === 0){
      html += `<p class="text-muted">No scheduled special tasks.</p>`;
    } else {
      dayTasks.forEach((t, idx)=>{
        html += `
          <div class="cal-details-task-item ${t.completed ? 'done':''}">
            <input type="checkbox" class="cal-details-task-checkbox" data-idx="${idx}" ${t.completed ? 'checked':''}>
            <span>${escapeHTML(t.text)}</span>
            <button class="icon-btn danger cal-details-task-del-btn" data-idx="${idx}" style="margin-left:auto;">🗑</button>
          </div>
        `;
      });
    }

    html += `
        </div>
        <form class="cal-details-add-task-form" id="calDetailsAddTaskForm">
          <input type="text" id="calDetailsTaskInput" placeholder="Add custom task..." required>
          <button type="submit" class="btn btn-primary btn-sm">＋</button>
        </form>
      </div>
    `;

    content.innerHTML = html;

    // Bind checkbox tasks check/complete
    document.querySelectorAll('.cal-details-task-checkbox').forEach(box=>{
      box.addEventListener('change', e=>{
        const idx = parseInt(e.target.dataset.idx);
        state.calendarTasks[selectedCalKey][idx].completed = e.target.checked;
        persistAll();
        renderCalendarDetails();
        renderCalendar();
      });
    });

    // Delete calendar tasks
    document.querySelectorAll('.cal-details-task-del-btn').forEach(btn=>{
      btn.addEventListener('click', e=>{
        const idx = parseInt(btn.dataset.idx);
        state.calendarTasks[selectedCalKey].splice(idx, 1);
        if(state.calendarTasks[selectedCalKey].length === 0){
          delete state.calendarTasks[selectedCalKey];
        }
        persistAll();
        renderCalendarDetails();
        renderCalendar();
      });
    });

    // Form submit inside panel
    const taskAddForm = document.getElementById('calDetailsAddTaskForm');
    if(taskAddForm){
      taskAddForm.addEventListener('submit', e=>{
        e.preventDefault();
        const input = document.getElementById('calDetailsTaskInput');
        const text = input.value.trim();
        if(!text) return;

        if(!state.calendarTasks[selectedCalKey]){
          state.calendarTasks[selectedCalKey] = [];
        }
        state.calendarTasks[selectedCalKey].push({text, completed: false});
        persistAll();
        renderCalendarDetails();
        renderCalendar();
      });
    }
  }

  /* =====================================================
     MODULE: Daily reflection Journal
  ===================================================== */
  function initJournalUI(){
    const dateInput = document.getElementById('journalActiveDate');
    if(!dateInput) return;
    
    // Set to today if empty
    if(!dateInput.value) {
      dateInput.value = todayKey();
    }

    loadJournalForSelectedDate();

    dateInput.addEventListener('change', loadJournalForSelectedDate);

    // Save Reflection Entry
    document.getElementById('journalSaveBtn').addEventListener('click', ()=>{
      const targetDate = dateInput.value;
      const q1 = document.getElementById('journalQ1').value.trim();
      const q2 = document.getElementById('journalQ2').value.trim();
      const q3 = document.getElementById('journalQ3').value.trim();
      const q4 = document.getElementById('journalQ4').value.trim();

      if(!q1 && !q2 && !q3 && !q4){
        showToast('Journal empty! Type reflections before saving.','⚠️');
        return;
      }

      state.journal[targetDate] = { q1, q2, q3, q4, savedAt: Date.now() };
      persistAll();
      showToast('Journal entry saved','📝');
      loadJournalForSelectedDate();
      renderOverview();
    });

    // Search reflections
    const searchInput = document.getElementById('journalSearchInput');
    searchInput.addEventListener('input', ()=>{
      const query = searchInput.value.toLowerCase().trim();
      const resultsContainer = document.getElementById('journalSearchResults');
      if(!resultsContainer) return;
      resultsContainer.innerHTML = '';

      if(!query) return;

      let matchFound = false;
      Object.keys(state.journal).forEach(dateKey=>{
        const entry = state.journal[dateKey];
        if(entry.q1.toLowerCase().includes(query) || 
           entry.q2.toLowerCase().includes(query) || 
           entry.q3.toLowerCase().includes(query) || 
           entry.q4.toLowerCase().includes(query)){
          
          matchFound = true;
          const div = document.createElement('div');
          div.className = 'journal-result-item';
          div.innerHTML = `
            <div class="journal-result-date">${dateKey}</div>
            <div class="journal-result-snippet">A: ${entry.q1.slice(0,60)}...</div>
          `;
          div.addEventListener('click', ()=>{
            dateInput.value = dateKey;
            loadJournalForSelectedDate();
          });
          resultsContainer.appendChild(div);
        }
      });

      if(!matchFound){
        resultsContainer.innerHTML = '<div class="text-muted">No journal matching reflections query.</div>';
      }
    });
  }

  function loadJournalForSelectedDate(){
    const dateInput = document.getElementById('journalActiveDate');
    const entry = state.journal[dateInput.value] || {q1:'', q2:'', q3:'', q4:''};

    document.getElementById('journalQ1').value = entry.q1;
    document.getElementById('journalQ2').value = entry.q2;
    document.getElementById('journalQ3').value = entry.q3;
    document.getElementById('journalQ4').value = entry.q4;
  }

  /* =====================================================
     MODULE: Mood Tracker Module
  ===================================================== */
  function renderMoodTrackerUI(){
    const picker = document.getElementById('moodPicker');
    if(!picker) return;

    // Reset mood select highlights
    const activeMood = state.mood[todayKey()];
    document.querySelectorAll('.mood-btn').forEach(btn=>{
      btn.classList.remove('selected');
      if(activeMood && parseInt(btn.dataset.mood) === activeMood.score){
        btn.classList.add('selected');
      }
    });

    // Populate Mood History listing
    const list = document.getElementById('moodHistoryList');
    if(list){
      list.innerHTML = '';
      const moodKeys = Object.keys(state.mood).sort().reverse();
      if(moodKeys.length === 0){
        list.innerHTML = '<div class="text-muted p-2">No mood checks yet.</div>';
      } else {
        moodKeys.forEach(k=>{
          const m = state.mood[k];
          const div = document.createElement('div');
          div.className = 'mood-history-item';
          div.innerHTML = `
            <span class="emoji">${m.emoji}</span>
            <div class="info">
              <span class="date">${k}</span>
              <span class="label">${m.label}</span>
            </div>
          `;
          list.appendChild(div);
        });
      }
    }

    calculateMoodStats();
  }

  // Handle mood selection click
  document.querySelectorAll('.mood-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const score = parseInt(btn.dataset.mood);
      const label = btn.dataset.label;
      const emoji = btn.querySelector('.emoji').textContent;

      state.mood[todayKey()] = { score, label, emoji, timestamp: Date.now() };
      persistAll();
      showToast(`Mood recorded: ${label}`,'😊');
      renderMoodTrackerUI();
      renderOverview();
    });
  });

  function calculateMoodStats(){
    const moodScores = Object.values(state.mood).map(m=>m.score);
    const avgLabel = document.getElementById('moodAverageLabel');
    const freqLabel = document.getElementById('moodMostFreqLabel');

    if(moodScores.length === 0){
      if(avgLabel) avgLabel.textContent = 'N/A';
      if(freqLabel) freqLabel.textContent = 'N/A';
      return;
    }

    const sum = moodScores.reduce((a,b)=>a+b, 0);
    const avg = (sum / moodScores.length).toFixed(1);
    if(avgLabel) avgLabel.textContent = `${avg}/5`;

    // Most frequent mood tracker
    const counts = {};
    let maxMoodLabel = 'N/A';
    let maxCount = 0;
    Object.values(state.mood).forEach(m=>{
      counts[m.label] = (counts[m.label] || 0) + 1;
      if(counts[m.label] > maxCount){
        maxCount = counts[m.label];
        maxMoodLabel = m.label;
      }
    });

    if(freqLabel) freqLabel.textContent = maxMoodLabel;
    renderMoodFrequencyChart();
  }

  let moodFreqChartInstance = null;
  function renderMoodFrequencyChart(){
    const canvas = document.getElementById('moodFrequencyChart');
    if(!canvas) return;

    const counts = { "Excellent": 0, "Good": 0, "Neutral": 0, "Bad": 0, "Very Bad": 0 };
    Object.values(state.mood).forEach(m=>{
      if(counts[m.label] !== undefined) counts[m.label]++;
    });

    const dataValues = [counts["Excellent"], counts["Good"], counts["Neutral"], counts["Bad"], counts["Very Bad"]];

    if(moodFreqChartInstance){
      moodFreqChartInstance.destroy();
    }

    moodFreqChartInstance = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ["Excellent", "Good", "Neutral", "Bad", "Very Bad"],
        datasets: [{
          data: dataValues,
          backgroundColor: ["#2ecc71", "#3498db", "#f1c40f", "#e67e22", "#e74c3c"],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'Poppins', size: 10 } } }
        }
      }
    });
  }

  /* =====================================================
     MODULE: Learning Log & Study Tracker
  ===================================================== */
  function renderLearningLog(){
    const list = document.getElementById('learningList');
    if(!list) return;
    list.innerHTML = '';

    const filterVal = document.getElementById('learnFilterCategory').value;
    
    let filtered = state.learning;
    if(filterVal !== 'All'){
      filtered = state.learning.filter(l=>l.category === filterVal);
    }

    // Sort learnings chronologically (latest first)
    const sorted = [...filtered].sort((a,b)=> b.timestamp - a.timestamp);

    if(sorted.length === 0){
      list.innerHTML = '<div class="empty-state"><span class="emoji">📚</span>No study items logged under this category.</div>';
      return;
    }

    sorted.forEach(item=>{
      const row = document.createElement('div');
      row.className = 'learning-item';
      row.innerHTML = `
        <div class="learning-top">
          <div class="learning-topic">${escapeHTML(item.topic)}</div>
          <span class="category-badge ${item.category.toLowerCase().replace(' ', '-')}">${item.category}</span>
        </div>
        <div class="learning-date">Logged on: ${item.date}</div>
        <div class="learning-notes">${escapeHTML(item.notes)}</div>
        <button class="icon-btn danger del-learn" data-id="${item.id}" style="margin-top: 6px;">🗑 Delete Log</button>
      `;
      list.appendChild(row);
    });

    document.querySelectorAll('.del-learn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        state.learning = state.learning.filter(l=>l.id !== btn.dataset.id);
        persistAll();
        renderLearningLog();
        renderOverview();
        showToast('Learning item deleted','🗑');
      });
    });
  }

  const learningForm = document.getElementById('learningForm');
  if(learningForm){
    learningForm.addEventListener('submit', e=>{
      e.preventDefault();
      const topic = document.getElementById('learnTopic').value.trim();
      const category = document.getElementById('learnCategory').value;
      const notes = document.getElementById('learnNotes').value.trim();

      if(!topic) return;
      state.learning.push({
        id: uid(),
        topic,
        category,
        notes,
        date: todayKey(),
        timestamp: Date.now()
      });
      persistAll();
      e.target.reset();
      renderLearningLog();
      renderOverview();
      showToast('Learning log recorded','📚');
    });
  }

  const learnFilterSelect = document.getElementById('learnFilterCategory');
  if(learnFilterSelect){
    learnFilterSelect.addEventListener('change', renderLearningLog);
  }

  /* =====================================================
     MODULE: Future Me Notes & Trigger Reminders
  ===================================================== */
  function renderFutureNotes(){
    const list = document.getElementById('futureNotesList');
    if(!list) return;
    list.innerHTML = '';

    const activeNotes = state.futureNotes.filter(n=>!n.shown);
    if(activeNotes.length === 0){
      list.innerHTML = '<div class="empty-state"><span class="emoji">🔮</span>No pending future notes scheduled.</div>';
      return;
    }

    activeNotes.forEach(item => {

  const today = new Date();
  today.setHours(0,0,0,0);

  const targetDate = new Date(item.date);
  targetDate.setHours(0,0,0,0);

  const daysLeft = Math.ceil(
    (targetDate - today) /
    (1000 * 60 * 60 * 24)
  );

  const div = document.createElement('div');
  div.className = 'future-item';
  const urgencyClass =
    daysLeft <= 1
        ? 'urgent'
        : daysLeft <= 7
        ? 'warning'
        : 'normal';
  
div.innerHTML = `
  <div class="future-header">

    <span class="future-item-date">
      🎯 Target: ${item.date}
    </span>

    <span class="future-countdown ${urgencyClass}">
      ⏳ ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left
    </span>

  </div>


      <p class="future-item-msg">
        "${escapeHTML(item.message)}"
      </p>

    </div>

    <button
      class="btn btn-ghost btn-sm danger del-future-note"
      data-id="${item.id}">
      🗑 Delete Note
    </button>
  `;

  list.appendChild(div);
});

    document.querySelectorAll('.del-future-note').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        state.futureNotes = state.futureNotes.filter(n=>n.id !== btn.dataset.id);
        persistAll();
        renderFutureNotes();
        renderOverview();
        showToast('Future note deleted','🗑');
      });
    });
  }

  const futureForm = document.getElementById('futureForm');
  if(futureForm){
    futureForm.addEventListener('submit', e=>{
      e.preventDefault();
      const date = document.getElementById('futureDate').value;
      const message = document.getElementById('futureMessage').value.trim();

      if(!date || !message) return;
      state.futureNotes.push({
        id: uid(),
        date,
        message,
        shown: false,
        timestamp: Date.now()
      });
      persistAll();
      e.target.reset();
      renderFutureNotes();
      renderOverview();
      showToast('Future Note set successfully!','🔮');
    });
  }

  // Trigger Future me alerts on load
  function triggerFutureNotesCheck(){
    const today = todayKey();
    const matches = state.futureNotes.filter(n => n.date === today && !n.shown);

    if(matches.length > 0){
      // Trigger Top banner
      const banner = document.getElementById('futureNoteBanner');
      const bannerText = document.getElementById('futureNoteBannerText');
      if(banner && bannerText){
        bannerText.textContent = `Future Me Note: "${matches[0].message}"`;
        banner.style.display = 'flex';
      }

      // Trigger Modal popup alert
      const modal = document.getElementById('futureNotePopupOverlay');
      const popupDate = document.getElementById('futureNotePopupDate');
      const popupMsg = document.getElementById('futureNotePopupMessage');
      if(modal && popupDate && popupMsg){
        popupDate.textContent = `Scheduled target date reached: ${matches[0].date}`;
        popupMsg.textContent = `"${matches[0].message}"`;
        modal.style.display = 'flex';
      }

      // Mark first matching note as shown
      matches[0].shown = true;
      persistAll();
    }
  }

  // Dismiss popup alerts
  const bannerClose = document.getElementById('futureNoteBannerClose');
  if(bannerClose){
    bannerClose.addEventListener('click', ()=>{
      document.getElementById('futureNoteBanner').style.display = 'none';
    });
  }
  const popupClose = document.getElementById('futureNotePopupClose');
  const popupDismiss = document.getElementById('futureNotePopupDismissBtn');
  function dismissFuturePopup(){
    document.getElementById('futureNotePopupOverlay').style.display = 'none';
  }
  if(popupClose) popupClose.addEventListener('click', dismissFuturePopup);
  if(popupDismiss) popupDismiss.addEventListener('click', dismissFuturePopup);

 /* =====================================================
   MODULE: GLOBAL SEARCH SYSTEM
===================================================== */

const globalSearchBtn = document.getElementById('globalSearchBtn');
const searchModalOverlay = document.getElementById('searchModalOverlay');
const searchModalClose = document.getElementById('searchModalClose');
const globalSearchInput = document.getElementById('globalSearchInput');
const globalSearchResults = document.getElementById('globalSearchResults');

/* =====================================================
   OPEN / CLOSE MODAL
===================================================== */

function openSearchModal(){

    if(!searchModalOverlay) return;

    searchModalOverlay.style.display = 'flex';

    setTimeout(()=>{
        globalSearchInput?.focus();
    },100);
}

function closeSearchModal(){

    if(!searchModalOverlay) return;

    searchModalOverlay.style.display = 'none';

    if(globalSearchInput){
        globalSearchInput.value = '';
    }

    if(globalSearchResults){
        globalSearchResults.innerHTML = `
            <p class="text-muted text-center">
                Start typing to search across your workspace...
            </p>
        `;
    }
}

if(globalSearchBtn){
    globalSearchBtn.addEventListener('click', openSearchModal);
}

if(searchModalClose){
    searchModalClose.addEventListener('click', closeSearchModal);
}

/* =====================================================
   CLICK OUTSIDE TO CLOSE
===================================================== */

if(searchModalOverlay){

    searchModalOverlay.addEventListener('click', e=>{

        if(e.target === searchModalOverlay){
            closeSearchModal();
        }

    });

}

/* =====================================================
   KEYBOARD SHORTCUTS
===================================================== */

document.addEventListener('keydown', e=>{

    const activeTag =
        document.activeElement?.tagName;

    if(
        e.key === '/' &&
        activeTag !== 'INPUT' &&
        activeTag !== 'TEXTAREA'
    ){

        e.preventDefault();
        openSearchModal();
    }

    if(e.key === 'Escape'){
        closeSearchModal();
    }

});

/* =====================================================
   SEARCH INPUT
===================================================== */

if(globalSearchInput){

    globalSearchInput.addEventListener('input', ()=>{

        const query =
            globalSearchInput.value
            .toLowerCase()
            .trim();

        if(!query){

            globalSearchResults.innerHTML = `
                <p class="text-muted text-center py-4">
                    Start typing to search...
                </p>
            `;

            return;
        }

        globalSearchResults.innerHTML = '';

        let resultsCount = 0;

        /* =============================
           TASKS
        ============================== */

        state.tasks.forEach(task=>{

            if(
                task.text.toLowerCase().includes(query) ||
                (task.desc &&
                 task.desc.toLowerCase().includes(query))
            ){

                createResultRow(
                    task.text,
                    `Priority: ${task.priority}`,
                    'Task',
                    'todo'
                );

                resultsCount++;
            }

        });

        /* =============================
           HABITS
        ============================== */

        state.habits.forEach(habit=>{

            if(
                habit.name.toLowerCase().includes(query)
            ){

                createResultRow(
                    habit.name,
                    `Current Streak: ${habit.currentStreak || 0}`,
                    'Habit',
                    'habits'
                );

                resultsCount++;
            }

        });

        /* =============================
           JOURNAL
        ============================== */

        Object.keys(state.journal).forEach(dateKey=>{

            const entry = state.journal[dateKey];

            const combined =
                `${entry.q1} ${entry.q2} ${entry.q3} ${entry.q4}`
                .toLowerCase();

            if(combined.includes(query)){

                createResultRow(
                    `Journal Reflection (${dateKey})`,
                    entry.q1.slice(0,100) + '...',
                    'Journal',
                    'journal'
                );

                resultsCount++;
            }

        });

        /* =============================
           LEARNING LOG
        ============================== */

        state.learning.forEach(item=>{

            if(
                item.topic.toLowerCase().includes(query) ||
                item.notes.toLowerCase().includes(query)
            ){

                createResultRow(
                    item.topic,
                    `${item.category} • ${item.notes.slice(0,80)}...`,
                    'Learning',
                    'learning'
                );

                resultsCount++;
            }

        });

        /* =============================
           GOALS
        ============================== */

        state.goals.forEach(goal=>{

            if(
                goal.title.toLowerCase().includes(query) ||
                (goal.desc &&
                 goal.desc.toLowerCase().includes(query))
            ){

                createResultRow(
                    goal.title,
                    goal.desc || 'No description',
                    'Goal',
                    'goals'
                );

                resultsCount++;
            }

        });

        /* =============================
           FUTURE NOTES
        ============================== */

        state.futureNotes.forEach(note=>{

            if(
                note.message.toLowerCase().includes(query)
            ){

                createResultRow(
                    `Future Note (${note.date})`,
                    note.message,
                    'Future',
                    'future'
                );

                resultsCount++;
            }

        });

        /* =============================
           TIMETABLE EVENTS
        ============================== */

        state.timetable.forEach(item=>{

            if(
                item.name.toLowerCase().includes(query)
            ){

                createResultRow(
                    item.name,
                    `${item.start} - ${item.end}`,
                    'Schedule',
                    'timetable'
                );

                resultsCount++;
            }

        });

        /* =============================
           NO RESULTS
        ============================== */

        if(resultsCount === 0){

            globalSearchResults.innerHTML = `
                <div class="empty-state">
                    <span class="emoji">🔍</span>
                    No matching results found.
                </div>
            `;
        }

    });

}

/* =====================================================
   CREATE RESULT ROW
===================================================== */

function createResultRow(
    title,
    snippet,
    tagLabel,
    sectionTarget
){

    const row = document.createElement('div');

    row.className = 'search-result-row';

    row.innerHTML = `
        <div class="search-result-left">

            <div class="search-result-title">
                ${escapeHTML(title)}
            </div>

            <div class="search-result-snippet">
                ${escapeHTML(snippet)}
            </div>

        </div>

        <span class="search-result-tag">
            ${tagLabel}
        </span>
    `;

    row.addEventListener('click', () => {

        closeSearchModal();

        const tab = document.querySelector(
            '.nav-item[data-section="' +
            sectionTarget +
            '"]'
        );

        if(tab){
            tab.click();
        }

    });

    globalSearchResults.appendChild(row);
}

/* =========================================
   APPLY TO TIMETABLE
========================================= */

if(aiApplyScheduleBtn){

  aiApplyScheduleBtn.addEventListener('click', ()=>{

      if(currentGeneratedBlocks.length === 0){

          showToast(
            'Generate a plan first.',
            '⚠️'
          );

          return;
      }

      let addedCount = 0;
      let conflictsCount = 0;

      currentGeneratedBlocks.forEach(block=>{

          if(hasTimeConflict(block.start, block.end)){

              conflictsCount++;

          }else{

              state.timetable.push({
                  id: uid(),
                  name: block.name,
                  start: block.start,
                  end: block.end
              });

              addedCount++;
          }
      });

      persistAll();

      renderTimetable();
      renderOverview();

      if(conflictsCount > 0){

          showToast(
            `Added ${addedCount} blocks. ${conflictsCount} skipped due to conflicts.`,
            '⚠️'
          );

      }else{

          showToast(
            'Schedule imported successfully!',
            '✨'
          );
      }

      aiOutputBox.style.display = 'none';
      aiPromptInput.value = '';
  });
}

/* =========================================
   CLEAR BUTTON
========================================= */

if(aiClearOutputBtn){

  aiClearOutputBtn.addEventListener('click', ()=>{

      aiOutputBox.style.display = 'none';

      aiPromptInput.value = '';

      currentGeneratedBlocks = [];

      aiOutputSchedule.innerHTML = '';
  });
}

  /* =====================================================
     MODULE: Data Backup, Export & Restore
  ===================================================== */
  const exportJSONBtn = document.getElementById('exportJSONBtn');
  const exportCSVBtn = document.getElementById('exportCSVBtn');
  const triggerImportBtn = document.getElementById('triggerImportBtn');
  const importFileInput = document.getElementById('importFileInput');

  if(exportJSONBtn){
    exportJSONBtn.addEventListener('click', ()=>{
      const backupData = {
        theme: state.theme,
        tasks: state.tasks,
        habits: state.habits,
        timetable: state.timetable,
        history: state.history,
        pomodoro: state.pomodoro,
        calendarTasks: state.calendarTasks,
        goals: state.goals,
        journal: state.journal,
        mood: state.mood,
        learning: state.learning,
        futureNotes: state.futureNotes,
        focusLog: state.focusLog,
        pomoSessionsToday: state.pomoSessionsToday
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `flowspace_backup_${todayKey()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('JSON workspace backup exported','💾');
    });
  }

  // Simple CSV Export helper
  if(exportCSVBtn){
    exportCSVBtn.addEventListener('click', ()=>{
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Type,Title/Name,Details,Priority/Frequency,Completed/Streak\r\n";

      // Append tasks
      state.tasks.forEach(t=>{
        csvContent += `Task,"${t.text.replace(/"/g, '""')}","${(t.desc||'').replace(/"/g, '""')}",${t.priority},${t.completed ? 'Yes':'No'}\r\n`;
      });

      // Append habits
      state.habits.forEach(h=>{
        csvContent += `Habit,"${h.name.replace(/"/g, '""')}",Icon: ${h.icon},${h.frequency},Streak: ${h.currentStreak}\r\n`;
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `flowspace_tasks_habits_${todayKey()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('CSV metrics exported','📊');
    });
  }

  if(triggerImportBtn){
    triggerImportBtn.addEventListener('click', ()=> importFileInput.click());
  }

  if(importFileInput){
    importFileInput.addEventListener('change', e=>{
      const file = e.target.files[0];
      if(!file) return;

      const reader = new FileReader();
      reader.onload = function(event){
        try {
          const parsed = JSON.parse(event.target.result);
          
          // Verify critical structure elements
          if(parsed.tasks !== undefined && parsed.habits !== undefined){
            state.theme = parsed.theme || 'light';
            state.tasks = parsed.tasks;
            state.habits = parsed.habits;
            state.timetable = parsed.timetable || [];
            state.history = parsed.history || {};
            state.pomodoro = parsed.pomodoro || {workMin:25, breakMin:5};
            state.calendarTasks = parsed.calendarTasks || {};
            state.goals = parsed.goals || [];
            state.journal = parsed.journal || {};
            state.mood = parsed.mood || {};
            state.learning = parsed.learning || [];
            state.futureNotes = parsed.futureNotes || [];
            state.focusLog = parsed.focusLog || {};
            state.pomoSessionsToday = parsed.pomoSessionsToday || 0;

            persistAll();
            showToast('Restore successful! Re-aligning views...','✨');
            setTimeout(()=> window.location.reload(), 1000);
          } else {
            showToast('Invalid backup data format','⚠️');
          }
        } catch(err) {
          showToast('Import parser error','⚠️');
        }
      };
      reader.readAsText(file);
    });
  }

  /* =====================================================
     MODULE: Unified Dashboard Home widgets
  ===================================================== */
  function renderOverview(){
    const stats = computeTodayStats();
    
    document.getElementById('statTasksCompleted').textContent = stats.completedTasks;
    document.getElementById('statTasksPending').textContent = stats.pendingTasks;
    document.getElementById('statHabitRate').textContent = stats.habitRate + '%';
    
    // Log focus today minutes
    const todayFocusMin = state.focusLog[todayKey()] || 0;
    document.getElementById('statFocusHours').textContent = `${todayFocusMin}m`;

    setRing(document.getElementById('mainRing'), stats.score, 58);
    document.getElementById('mainRingNum').textContent = stats.score + '%';
    
    document.getElementById('miniTasksDone').textContent = stats.completedTasks + '/' + stats.totalTasks;
    document.getElementById('miniHabitsDone').textContent = stats.completedHabits + '/' + stats.totalHabits;
    
    const bestStreak = state.habits.reduce((m,h)=>Math.max(m,h.bestStreak||0),0);
    document.getElementById('miniBestStreak').textContent = bestStreak;

    renderBadgeGrid('overviewBadges');
    
    // 1. Widget today's tasks
    const tasksListContainer = document.getElementById('widgetTasksTodayList');
    if(tasksListContainer){
      tasksListContainer.innerHTML = '';
      const pendingTasks = state.tasks.filter(t=>!t.completed);
      if(pendingTasks.length === 0){
        tasksListContainer.innerHTML = '<span class="text-muted">No pending tasks today.</span>';
      } else {
        pendingTasks.slice(0, 5).forEach(t=>{
          tasksListContainer.innerHTML += `
            <div class="widget-item">
              <span>${escapeHTML(t.text)}</span>
              <span class="priority-badge ${t.priority.toLowerCase()}">${t.priority}</span>
            </div>
          `;
        });
      }
    }

    // 2. Widget habit streaks
    const streakListContainer = document.getElementById('widgetHabitStreaksList');
    if(streakListContainer){
      streakListContainer.innerHTML = '';
      if(state.habits.length === 0){
        streakListContainer.innerHTML = '<span class="text-muted">No habits defined.</span>';
      } else {
        state.habits.slice(0, 5).forEach(h=>{
          streakListContainer.innerHTML += `
            <div class="widget-item">
              <span>${h.icon} ${escapeHTML(h.name)}</span>
              <span>🔥 ${h.currentStreak} days</span>
            </div>
          `;
        });
      }
    }

    // 3. Widget Goal progress
    const goalsListContainer = document.getElementById('widgetGoalProgressList');
    if(goalsListContainer){
      goalsListContainer.innerHTML = '';
      if(state.goals.length === 0){
        goalsListContainer.innerHTML = '<span class="text-muted">No weekly goals set.</span>';
      } else {
        state.goals.slice(0, 4).forEach(g=>{
          goalsListContainer.innerHTML += `
            <div class="widget-item">
              <span>${escapeHTML(g.title)}</span>
              <span>${g.completed ? '✅ Done':'⏳ Pending'}</span>
            </div>
          `;
        });
      }
    }

    // 4. Widget upcoming future notes
    const futNotesContainer = document.getElementById('widgetFutureNotesList');
    if(futNotesContainer){
      futNotesContainer.innerHTML = '';
      const activeNotes = state.futureNotes.filter(n=>!n.shown);
      if(activeNotes.length === 0){
        futNotesContainer.innerHTML = '<span class="text-muted">No future notes.</span>';
      } else {
        activeNotes.slice(0,3).forEach(n=>{
          futNotesContainer.innerHTML += `
            <div class="widget-item">
              <span>${escapeHTML(n.message)}</span>
              <span class="text-muted" style="font-size:9.5px;">${n.date}</span>
            </div>
          `;
        });
      }
    }

    // 5. Widget Today's Mood
    const moodContainer = document.getElementById('widgetMoodDisplay');
    if(moodContainer){
      const currentMood = state.mood[todayKey()];
      if(currentMood){
        moodContainer.innerHTML = `<span style="font-size:24px; display:block;">${currentMood.emoji}</span>Today feels ${currentMood.label}`;
      } else {
        moodContainer.innerHTML = 'No mood logged today.';
      }
    }

    // 6. Widget Journal reflection
    const journalContainer = document.getElementById('widgetJournalDisplay');
    if(journalContainer){
      const currentRef = state.journal[todayKey()];
      if(currentRef && currentRef.q1){
        journalContainer.textContent = `Accomplished: "${currentRef.q1.slice(0, 120)}..."`;
      } else {
        journalContainer.textContent = 'No reflections recorded today.';
      }
    }

    // 7. Widget Learning summary
    const learnContainer = document.getElementById('widgetLearningDisplay');
    if(learnContainer){
      const todayLearnings = state.learning.filter(l=>l.date === todayKey());
      if(todayLearnings.length > 0){
        learnContainer.textContent = `Learned: ${todayLearnings[0].topic} (${todayLearnings[0].category})`;
      } else {
        learnContainer.textContent = 'No study entries logged today.';
      }
    }
  }

  function computeTodayStats(){
    const totalTasks = state.tasks.length;
    const completedTasks = state.tasks.filter(t=>t.completed).length;
    const pendingTasks = totalTasks - completedTasks;

    const tKey = todayKey();
    const totalHabits = state.habits.length;
    const completedHabits = state.habits.filter(h=>h.completedDates.includes(tKey)).length;
    const habitRate = totalHabits ? Math.round((completedHabits/totalHabits)*100) : 0;

    const taskRate = totalTasks ? (completedTasks/totalTasks)*100 : 0;
    const score = Math.round((taskRate*0.5) + (habitRate*0.5));

    return {totalTasks, completedTasks, pendingTasks, totalHabits, completedHabits, habitRate, score};
  }

  function updateTodayHistory(){
    const stats = computeTodayStats();
    state.history[todayKey()] = {
      tasksCompleted: stats.completedTasks,
      habitsCompleted: stats.completedHabits,
      habitsTotal: stats.totalHabits,
      score: stats.score
    };
    persistAll();
  }

  function setRing(circle, percent, radius=58){
    if(!circle) return;
    const c = 2 * Math.PI * radius;
    circle.style.strokeDasharray = c;
    circle.style.strokeDashoffset = c - (c * Math.min(Math.max(percent,0),100)/100);
  }

  /* =====================================================
     MODULE: Achievement badges
  ===================================================== */
  function getBadgeStatus(){
    const bestStreak = state.habits.reduce((m,h)=>Math.max(m,h.bestStreak||0),0);
    const completedTaskCount = state.tasks.filter(t=>t.completed).length;
    const totalFocus = Object.values(state.focusLog).reduce((a,b)=>a+b, 0);

    return [
      {id:'streak7', emoji:'🔥', name:'7 Day Streak', desc:'Reach a 7-day habit streak', unlocked: bestStreak >= 7},
      {id:'streak30', emoji:'🏆', name:'30 Day Streak', desc:'Reach a 30-day habit streak', unlocked: bestStreak >= 30},
      {id:'focusMaster', emoji:'⏱️', name:'10 Hour Focus', desc:'Complete 600m of Pomodoro focus', unlocked: totalFocus >= 600}
    ];
  }

  function renderBadgeGrid(containerId){
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = '';
    getBadgeStatus().forEach(b=>{
      const card = document.createElement('div');
      card.className = 'badge-card' + (b.unlocked ? ' unlocked':'');
      card.innerHTML = `
        <div class="badge-emoji">${b.emoji}</div>
        <div class="badge-name">${b.name}</div>
        <div class="badge-desc">${b.desc}</div>
      `;
      container.appendChild(card);
    });
  }

  let lastBadgeState = {};
  function checkBadges(){
    const badges = getBadgeStatus();
    badges.forEach(b=>{
      if(b.unlocked && !lastBadgeState[b.id]){
        showToast('Achievement unlocked: ' + b.name + '!', b.emoji);
      }
    });
    lastBadgeState = Object.fromEntries(badges.map(b=>[b.id,b.unlocked]));
  }

  /* =====================================================
     MODULE: Advanced Analytics & Charts (Chart.js)
  ===================================================== */
  let activeAnalyticsPeriod = 'daily';
  let chartInstances = {};

  const analyticTabs = document.querySelectorAll('.analytics-tab');
  analyticTabs.forEach(t=>{
    t.addEventListener('click', ()=>{
      analyticTabs.forEach(tab=>tab.classList.remove('active'));
      t.classList.add('active');
      activeAnalyticsPeriod = t.dataset.period;
      renderAnalytics();
    });
  });

  function getDatesForPeriod(period){
    const list = [];
    let count = 7;
    if(period === 'weekly') count = 14;
    if(period === 'monthly') count = 30;

    for(let i = count - 1; i >= 0; i--){
      list.push(dateKeyFromOffset(i));
    }
    return list;
  }

  function renderAnalytics(){
    const dates = getDatesForPeriod(activeAnalyticsPeriod);
    
    // Update Score boards
    const scoreVal = document.getElementById('analyticStatScore');
    const focusVal = document.getElementById('analyticStatFocus');
    const habitsVal = document.getElementById('analyticStatHabits');

    // Stats calculations
    let totalScoreSum = 0;
    let totalFocusMins = 0;
    let completedHabitsCount = 0;
    let totalHabitsChecked = 0;

    dates.forEach(d=>{
      const hist = state.history[d];
      totalScoreSum += hist ? hist.score : (d === todayKey() ? computeTodayStats().score : 0);
      totalFocusMins += state.focusLog[d] || 0;
      
      state.habits.forEach(h=>{
        totalHabitsChecked++;
        if(h.completedDates.includes(d)) completedHabitsCount++;
      });
    });

    if(scoreVal) scoreVal.textContent = Math.round(totalScoreSum / dates.length) + '%';
    if(focusVal) focusVal.textContent = (totalFocusMins / 60).toFixed(1) + 'h';
    if(habitsVal) habitsVal.textContent = totalHabitsChecked ? Math.round((completedHabitsCount / totalHabitsChecked)*100) + '%' : '0%';

    // Build Chart 1: Focus Time Trend
    const focusData = dates.map(d=> state.focusLog[d] || 0);
    renderLineChart('focusTimeChart', dates, focusData, 'Focus Minutes', '#6c5ce7');

    // Build Chart 2: Task Completion Trend
    const taskData = dates.map(d=>{
      if(d === todayKey()) return state.tasks.filter(t=>t.completed).length;
      return state.history[d] ? state.history[d].tasksCompleted : 0;
    });
    renderBarChart('taskCompletionChart', dates, taskData, 'Tasks Completed', '#ff6b9d');

    // Build Chart 3: Habit Completion rate
    const habitRates = dates.map(d=>{
      let done = 0;
      state.habits.forEach(h=>{
        if(h.completedDates.includes(d)) done++;
      });
      return state.habits.length ? Math.round((done / state.habits.length) * 100) : 0;
    });
    renderLineChart('habitCompletionChart', dates, habitRates, 'Completion Rate %', '#2ecc71');

    // Build Chart 4: Mood vs Productivity Correlation
    renderCorrelationChart('moodProdCorrelationChart', dates);
  }

  function destroyChart(id){
    if(chartInstances[id]){
      chartInstances[id].destroy();
      delete chartInstances[id];
    }
  }

  function renderLineChart(canvasId, labels, data, datasetLabel, color){
    const canvas = document.getElementById(canvasId);
    if(!canvas) return;
    destroyChart(canvasId);

    chartInstances[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels.map(l=> l.slice(5)), // Truncate year
        datasets: [{
          label: datasetLabel,
          data: data,
          borderColor: color,
          backgroundColor: color + '22',
          borderWidth: 2,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function renderBarChart(canvasId, labels, data, datasetLabel, color){
    const canvas = document.getElementById(canvasId);
    if(!canvas) return;
    destroyChart(canvasId);

    chartInstances[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels.map(l=> l.slice(5)),
        datasets: [{
          label: datasetLabel,
          data: data,
          backgroundColor: color,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function renderCorrelationChart(canvasId, dates){
    const canvas = document.getElementById(canvasId);
    if(!canvas) return;
    destroyChart(canvasId);

    // X: Mood score, Y: Productivity score
    const scatterData = [];
    dates.forEach(d=>{
      const moodEntry = state.mood[d];
      const hist = state.history[d];
      const prodScore = hist ? hist.score : (d === todayKey() ? computeTodayStats().score : 0);

      if(moodEntry && prodScore !== undefined){
        scatterData.push({ x: moodEntry.score, y: prodScore });
      }
    });

    chartInstances[canvasId] = new Chart(canvas, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Mood vs Productivity',
          data: scatterData,
          backgroundColor: '#a363f9',
          pointRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: true, text: 'Mood Score (1-5)' },
            min: 1, max: 5, ticks: { stepSize: 1 }
          },
          y: {
            title: { display: true, text: 'Productivity Score %' },
            min: 0, max: 100
          }
        }
      }
    });
  }
/* ============================================================
   FLOWSPACE — Smart Planner Engine v2.0 (embedded)
   See full annotated version in flowspace-planner-engine.js
============================================================ */
 
const PLANNER_CONFIG = {
  defaultDurationHours: 4,
  defaultStartHour: 9,
  minBlockMinutes: 20,
  maxContinuousMinutes: 90,
  shortBreakMinutes: 10,
  longBreakMinutes: 20,
  pomodoroSessionMinutes: 50,
  priorityWeights:      { critical:4, high:3, medium:2, low:1 },
  difficultyMultipliers:{ hard:1.4, medium:1.0, easy:0.75 },
  energyWindows:        { peak:[9,11], midday:[11,13], low:[13,15], recovery:[15,17] },
};
 
const GOAL_TAXONOMY = [
  { patterns:[/\b(leetcode|dsa|data\s*structures?|algorithms?|competitive\s*programming)\b/i], type:'Coding',   difficulty:'hard',   energy:'peak'     },
  { patterns:[/\b(system\s*design|architecture|scalability)\b/i],                              type:'Coding',   difficulty:'hard',   energy:'peak'     },
  { patterns:[/\b(interview|mock\s*interview|interview\s*prep)\b/i],                           type:'Career',   difficulty:'hard',   energy:'peak'     },
  { patterns:[/\b(gate|upsc|gre|sat|cat|exam\s*prep)\b/i],                                    type:'Study',    difficulty:'hard',   energy:'peak'     },
  { patterns:[/\b(machine\s*learning|ml|deep\s*learning|neural\s*networks?|ai\s*research)\b/i],type:'Study',    difficulty:'hard',   energy:'peak'     },
  { patterns:[/\b(servicenow|salesforce|aws|gcp|azure|cloud\s*certif|csa|cse)\b/i],           type:'Study',    difficulty:'medium', energy:'midday'   },
  { patterns:[/\b(java|python|javascript|typescript|rust|golang|kotlin|swift|c\+\+)\b/i],     type:'Skill',    difficulty:'medium', energy:'midday'   },
  { patterns:[/\b(react|vue|angular|next\.?js|svelte|frontend|ui\s*dev)\b/i],                 type:'Project',  difficulty:'medium', energy:'recovery' },
  { patterns:[/\b(backend|node\.?js|express|django|spring|api\s*dev)\b/i],                    type:'Project',  difficulty:'medium', energy:'recovery' },
  { patterns:[/\b(project|portfolio|build|develop|app|webapp|prototype)\b/i],                 type:'Project',  difficulty:'medium', energy:'recovery' },
  { patterns:[/\b(ui|ux|design|figma|wireframe|mockup)\b/i],                                  type:'Design',   difficulty:'medium', energy:'recovery' },
  { patterns:[/\b(resume|cv|cover\s*letter|linkedin|job\s*search|apply)\b/i],                 type:'Career',   difficulty:'easy',   energy:'low'      },
  { patterns:[/\b(japanese|mandarin|spanish|french|german|hindi|arabic|language)\b/i],        type:'Learning', difficulty:'medium', energy:'midday'   },
  { patterns:[/\b(reading|book|chapter|research\s*paper|article)\b/i],                        type:'Learning', difficulty:'easy',   energy:'low'      },
  { patterns:[/\b(math|calculus|linear\s*algebra|statistics|probability)\b/i],                type:'Study',    difficulty:'hard',   energy:'peak'     },
  { patterns:[/\b(gym|workout|exercise|yoga|meditation|run|jog|cycling|fitness)\b/i],         type:'Health',   difficulty:'easy',   energy:'recovery' },
  { patterns:[/\b(revise|revision|review|notes|flashcards|anki)\b/i],                         type:'Study',    difficulty:'easy',   energy:'low'      },
  { patterns:[/\b(writing|blog|essay|article\s*writing|content)\b/i],                         type:'Creative', difficulty:'medium', energy:'peak'     },
];
 
const PRIORITY_SIGNALS = {
  critical:[ /\b(critical|urgent|must\s*do|deadline\s*today|top\s*priority|very\s*important)\b/i ],
  high:    [ /\b(high\s*priority|important|primary|main|focus\s*on|really\s*need)\b/i, /\bhigh\b.*?:/i, /:\s*high\b/i ],
  medium:  [ /\b(medium\s*priority|secondary|also|as\s*well|and\s*maybe|moderate)\b/i, /\bmedium\b.*?:/i ],
  low:     [ /\b(low\s*priority|if\s*time|optional|maybe|leisure|casual|whenever)\b/i, /\blow\b.*?:/i ],
};
 
function detectPriority(ctx) {
  for (const [level, patterns] of Object.entries(PRIORITY_SIGNALS))
    if (patterns.some(p => p.test(ctx))) return level;
  return 'medium';
}
 
function extractDuration(prompt) {
  const combined = prompt.match(/(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*(?:and\s*)?(\d+)\s*m(?:in(?:utes?)?)?/i);
  if (combined) return Math.round(parseFloat(combined[1])*60 + parseInt(combined[2]));
  const dec = prompt.match(/(\d+\.\d+)\s*h(?:ours?|rs?)?/i);
  if (dec) return Math.round(parseFloat(dec[1])*60);
  const h = prompt.match(/(\d+)\s*h(?:ours?|rs?)?/i);
  if (h) return parseInt(h[1])*60;
  const m = prompt.match(/(\d+)\s*m(?:in(?:utes?)?)?/i);
  if (m) return parseInt(m[1]);
  if (/\ban?\s*hour\b/i.test(prompt)) return 60;
  if (/\ba\s*couple\s*(of\s*)?hours?\b/i.test(prompt)) return 120;
  if (/\bhalf\s*(an\s*)?hour\b/i.test(prompt)) return 30;
  return PLANNER_CONFIG.defaultDurationHours * 60;
}
 
function normaliseGoalName(raw) {
  return raw
    .replace(/\b(i want to|i need to|i have to|i should|let me|help me|going to|gonna|plan to|need to|want to)\b/gi,'')
    .replace(/\b(please|also|maybe|just|really|actually|basically)\b/gi,'')
    .replace(/\s{2,}/g,' ').trim()
    .replace(/^[,.\-–]+|[,.\-–]+$/g,'').trim();
}
 
function toTitleCase(str) {
  const stop = new Set(['a','an','the','and','or','but','in','on','at','to','for','of','with','by']);
  return str.split(' ').map((w,i)=>(i===0||!stop.has(w.toLowerCase()))
    ? w.charAt(0).toUpperCase()+w.slice(1).toLowerCase() : w.toLowerCase()).join(' ');
}
 
function classifyAgainstTaxonomy(segment) {
  for (const entry of GOAL_TAXONOMY)
    for (const pattern of entry.patterns) {
      const m = pattern.exec(segment);
      if (m) return { rawName: toTitleCase(m[0].trim()), type:entry.type, difficulty:entry.difficulty, energy:entry.energy };
    }
  return null;
}
 
const EXTRACTION_VERBS = ['learn','study','practice','revise','review','work on','build','develop','prepare for','read','write','complete','finish','do','improve','master','explore'];
 
function extractVerbNounGoal(segment) {
  const verbPat = new RegExp(`\\b(${EXTRACTION_VERBS.join('|')})\\s+(.+)`, 'i');
  const m = segment.match(verbPat);
  if (m) {
    const noun = normaliseGoalName(m[2]);
    if (noun.length > 1) return { rawName: toTitleCase(`${m[1]} ${noun}`), type:'Custom Goal', difficulty:'medium', energy:'midday' };
  }
  const cleaned = normaliseGoalName(segment);
  if (cleaned.length > 3 && cleaned.split(' ').length <= 6)
    return { rawName: toTitleCase(cleaned), type:'Custom Goal', difficulty:'medium', energy:'midday' };
  return null;
}
 
function segmentPrompt(prompt) {
  return prompt
    .replace(/i have\s+\d+(\.\d+)?\s*(hours?|hrs?|minutes?|mins?)/gi,'')
    .replace(/for\s+\d+(\.\d+)?\s*(hours?|hrs?|minutes?|mins?)/gi,'')
    .replace(/\d+(\.\d+)?\s*(hours?|hrs?)\s*(and\s*\d+\s*min(?:utes?)?)?\s*(of\s+)?/gi,'')
    .split(/[,;]|\band\b|\balso\b|\bthen\b|\bas\s+well\b|\+|•|-(?=\s)/i)
    .map(s=>s.trim()).filter(s=>s.length>2);
}
 
function buildPriorityContextMap(prompt) {
  const map = new Map();
  const segments = segmentPrompt(prompt);
  const zones = [
    { pattern:/high\s*priority\s*[:\-]/gi, level:'high'   },
    { pattern:/medium\s*priority\s*[:\-]/gi,level:'medium' },
    { pattern:/low\s*priority\s*[:\-]/gi,  level:'low'    },
    { pattern:/critical\s*[:\-]/gi,        level:'critical'},
    { pattern:/important\s*[:\-]/gi,       level:'high'   },
  ];
  zones.forEach(({pattern,level})=>{
    let m;
    while((m=pattern.exec(prompt))!==null){
      const after = prompt.slice(m.index+m[0].length, m.index+m[0].length+100);
      segments.forEach((seg,idx)=>{ if(after.includes(seg.slice(0,15))) map.set(idx,level); });
    }
  });
  return map;
}
 
function extractGoals(prompt) {
  const segments = segmentPrompt(prompt);
  const seen = new Set(), goals = [];
  const priMap = buildPriorityContextMap(prompt);
  segments.forEach((segment,idx)=>{
    let goal = classifyAgainstTaxonomy(segment) || extractVerbNounGoal(segment);
    if (!goal) return;
    const key = goal.rawName.toLowerCase().replace(/\s+/g,'');
    if (seen.has(key)) return;
    seen.add(key);
    goals.push({ name:goal.rawName, type:goal.type, difficulty:goal.difficulty, energy:goal.energy, priority: priMap.get(idx)||detectPriority(segment) });
  });
  return goals;
}
 
const ENERGY_ORDER = { peak:0, midday:1, recovery:2, low:3 };
 
function scoreGoal(g) {
  return (PLANNER_CONFIG.priorityWeights[g.priority]??2) * (PLANNER_CONFIG.difficultyMultipliers[g.difficulty]??1);
}
 
function scoreAndSortGoals(goals) {
  return goals.map(g=>({...g,score:scoreGoal(g)}))
    .sort((a,b)=>{
      const ed=(ENERGY_ORDER[a.energy]??1)-(ENERGY_ORDER[b.energy]??1);
      return ed!==0 ? ed : b.score-a.score;
    });
}
 
function allocateTime(goals, totalMinutes) {
  if (!goals.length) return [];
  const totalScore = goals.reduce((s,g)=>s+g.score,0);
  const breakMinutes = (goals.length-1)*PLANNER_CONFIG.shortBreakMinutes;
  const workable = Math.max(totalMinutes-breakMinutes, goals.length*PLANNER_CONFIG.minBlockMinutes);
  return goals.map(g=>({ ...g, allocatedMinutes: Math.max(PLANNER_CONFIG.minBlockMinutes, Math.round((g.score/totalScore*workable)/5)*5) }));
}
 
function splitIntoPomodoros(goal) {
  const chunks=[], sz=PLANNER_CONFIG.pomodoroSessionMinutes, mb=PLANNER_CONFIG.shortBreakMinutes;
  let rem=goal.allocatedMinutes, session=1;
  while(rem>0){
    const dur=Math.min(sz,rem);
    chunks.push({...goal,name:`${goal.name} — Session ${session}`,allocatedMinutes:dur,isBreak:false});
    rem-=dur; session++;
    if(rem>0) chunks.push({name:'Pomodoro Break',type:'Break',priority:null,difficulty:null,energy:'low',allocatedMinutes:mb,isBreak:true});
  }
  return chunks;
}
 
function insertBreaks(goals) {
  const blocks=[];
  goals.forEach((g,idx)=>{
    if(g.allocatedMinutes>PLANNER_CONFIG.maxContinuousMinutes) blocks.push(...splitIntoPomodoros(g));
    else blocks.push({...g,isBreak:false});
    if(idx<goals.length-1){
      const bd=g.allocatedMinutes>=PLANNER_CONFIG.maxContinuousMinutes ? PLANNER_CONFIG.longBreakMinutes : PLANNER_CONFIG.shortBreakMinutes;
      blocks.push({name:bd>=15?'Rest & Recharge':'Short Break',type:'Break',priority:null,difficulty:null,energy:'low',allocatedMinutes:bd,isBreak:true});
    }
  });
  return blocks;
}
 
function minutesToHHMM(total) {
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}
 
function computeFocusScore(block) {
  if(block.isBreak) return 0;
  const d={hard:90,medium:60,easy:35}[block.difficulty]??50;
  const p={critical:10,high:7,medium:3,low:0}[block.priority]??3;
  return Math.min(100,d+p);
}
 
function renderBlocks(flat) {
  let cursor=PLANNER_CONFIG.defaultStartHour*60;
  return flat.map(block=>{
    const start=minutesToHHMM(cursor);
    cursor+=block.allocatedMinutes;
    return { name:block.name,start,end:minutesToHHMM(cursor),type:block.type,priority:block.priority,difficulty:block.difficulty,focusScore:computeFocusScore(block),isBreak:block.isBreak,allocatedMinutes:block.allocatedMinutes };
  });
}
 
function buildFallbackPlan(totalMinutes) {
  const fg=[
    {name:'Deep Focus Work',   type:'Focus',  difficulty:'hard',   energy:'peak',   priority:'high'  },
    {name:'Learning Session',  type:'Study',  difficulty:'medium', energy:'midday', priority:'medium'},
    {name:'Review & Reflect',  type:'Review', difficulty:'easy',   energy:'low',    priority:'low'   },
  ];
  return renderBlocks(insertBreaks(allocateTime(scoreAndSortGoals(fg),totalMinutes)));
}
 
function generatePlan(prompt='') {
  const totalMinutes=extractDuration(prompt);
  const rawGoals=extractGoals(prompt);
  if(!rawGoals.length) return buildFallbackPlan(totalMinutes);
  const maxGoals=Math.floor(totalMinutes/PLANNER_CONFIG.minBlockMinutes);
  const capped=rawGoals.slice(0,Math.max(1,maxGoals));
  return renderBlocks(insertBreaks(allocateTime(scoreAndSortGoals(capped),totalMinutes)));
}
 
 
/* ============================================================
   UI CONTROLLER
============================================================ */
 
// Colour map for task types
const TYPE_COLOURS = {
  'Coding':      '#34d399',
  'Study':       '#7c86ff',
  'Career':      '#f59e0b',
  'Learning':    '#a78bfa',
  'Project':     '#38bdf8',
  'Design':      '#f472b6',
  'Health':      '#4ade80',
  'Review':      '#94a3b8',
  'Focus':       '#6366f1',
  'Skill':       '#fb923c',
  'Creative':    '#e879f9',
  'Custom Goal': '#60a5fa',
  'Break':       '#2d3a50',
};
 
const PRIORITY_COLOURS = {
  critical: '#f87171',
  high:     '#f59e0b',
  medium:   '#6366f1',
  low:      '#4a5568',
};
 
function escapeHTML(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
 
function durationLabel(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes/60), m = minutes%60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
 
let currentGeneratedBlocks = [];
 
// Toast
let toastTimeout;
function showToast(msg, icon='ℹ️') {
  const existing = document.querySelector('.flowspace-toast');
  if (existing) existing.remove();
  clearTimeout(toastTimeout);
  const el = document.createElement('div');
  el.className = 'flowspace-toast';
  el.innerHTML = `<span>${icon}</span> ${escapeHTML(msg)}`;
  document.body.appendChild(el);
  toastTimeout = setTimeout(()=>el.remove(), 3000);
}
 
// Render the timeline
function renderAIEstimatedSchedule() {
  const schedule = document.getElementById('aiOutputSchedule');
  const summary  = document.getElementById('planSummary');
  const meta     = document.getElementById('planMeta');
  schedule.innerHTML = '';
 
  if (!currentGeneratedBlocks.length) {
    schedule.innerHTML = '<div class="empty-state">No blocks generated. Try describing your goals.</div>';
    return;
  }
 
  // Stats
  const workBlocks  = currentGeneratedBlocks.filter(b => !b.isBreak);
  const totalWork   = workBlocks.reduce((s,b)=>s+b.allocatedMinutes,0);
  const totalBreak  = currentGeneratedBlocks.filter(b=>b.isBreak).reduce((s,b)=>s+b.allocatedMinutes,0);
  const avgFocus    = Math.round(workBlocks.reduce((s,b)=>s+b.focusScore,0) / (workBlocks.length||1));
  const endTime     = currentGeneratedBlocks[currentGeneratedBlocks.length-1]?.end || '--:--';
 
  meta.innerHTML = `
    <span class="meta-pill">Ends ${endTime}</span>
    <span class="meta-pill">${workBlocks.length} tasks</span>
  `;
 
  summary.innerHTML = `
    <div class="summary-stat">Work <strong>${durationLabel(totalWork)}</strong></div>
    <div class="summary-stat" style="margin-left:.25rem">·</div>
    <div class="summary-stat">Breaks <strong>${durationLabel(totalBreak)}</strong></div>
    <div class="summary-stat" style="margin-left:.25rem">·</div>
    <div class="summary-stat">Avg focus <strong>${avgFocus}</strong></div>
  `;
 
  // Timeline
  const wrapper = document.createElement('div');
  wrapper.className = 'timeline-wrapper';
 
  currentGeneratedBlocks.forEach(block => {
    const accent = block.isBreak ? '#2d3a50' : (TYPE_COLOURS[block.type] || '#6366f1');
    const bgAlpha = block.isBreak ? 'rgba(45,58,80,.4)' : `${accent}14`;
    const badgeBg = block.isBreak ? 'transparent' : `${accent}22`;
    const priorityDotColor = PRIORITY_COLOURS[block.priority] || 'transparent';
 
    // Time column
    const timeEl = document.createElement('div');
    timeEl.className = 'tl-time';
    timeEl.textContent = block.start;
 
    // Block wrap
    const wrap = document.createElement('div');
    wrap.className = 'tl-block-wrap';
    wrap.style.setProperty('--clr-dot', accent);
 
    // Block card
    const card = document.createElement('div');
    card.className = `tl-block${block.isBreak ? ' is-break' : ''}`;
    card.style.setProperty('--block-accent', accent);
    card.style.setProperty('--block-bg', bgAlpha);
    card.style.setProperty('--block-badge-bg', badgeBg);
 
    if (block.isBreak) {
      card.innerHTML = `
        <div class="block-left">
          <span class="block-name">☕ ${escapeHTML(block.name)}</span>
          <span class="block-duration">${block.start} – ${block.end} · ${durationLabel(block.allocatedMinutes)}</span>
        </div>
      `;
    } else {
      const focusPct = block.focusScore;
      card.innerHTML = `
        <div class="block-left">
          <div style="display:flex;align-items:center;gap:.45rem">
            <div class="priority-dot" style="background:${priorityDotColor}"></div>
            <span class="block-name">${escapeHTML(block.name)}</span>
          </div>
          <span class="block-duration">${block.start} – ${block.end} · ${durationLabel(block.allocatedMinutes)}</span>
        </div>
        <div class="block-right">
          <span class="block-type-badge">${escapeHTML(block.type)}</span>
          <div class="focus-bar-wrap">
            <div class="focus-bar-track">
              <div class="focus-bar-fill" style="width:${focusPct}%;background:${accent}"></div>
            </div>
            <span class="focus-label">${focusPct}</span>
          </div>
        </div>
      `;
    }
 
    wrap.appendChild(card);
    wrapper.appendChild(timeEl);
    wrapper.appendChild(wrap);
  });
 
  schedule.appendChild(wrapper);
}
 
// Wire up buttons
const aiGenerateBtn   = document.getElementById('aiGenerateBtn');
const aiApplyBtn      = document.getElementById('aiApplyScheduleBtn');
const aiClearBtn      = document.getElementById('aiClearOutputBtn');
const aiPromptInput   = document.getElementById('aiPromptInput');
const aiOutputBox     = document.getElementById('aiOutputBox');
const aiThinking      = document.getElementById('aiThinking');
const exampleChips    = document.getElementById('exampleChips');
 
aiGenerateBtn.addEventListener('click', () => {
  const prompt = aiPromptInput.value.trim();
  if (!prompt) { showToast('Describe your goals first.', '⚠️'); return; }
 
  // Show thinking state
  aiGenerateBtn.disabled = true;
  aiThinking.classList.add('visible');
  aiOutputBox.style.display = 'none';
 
  setTimeout(() => {
    currentGeneratedBlocks = generatePlan(prompt);
    aiOutputBox.style.display = 'block';
    renderAIEstimatedSchedule();
    aiGenerateBtn.disabled = false;
    aiThinking.classList.remove('visible');
    showToast('Plan ready!', '✨');
  }, 900);
});
 
aiClearBtn.addEventListener('click', () => {
  aiOutputBox.style.display = 'none';
  currentGeneratedBlocks = [];
  aiPromptInput.value = '';
  showToast('Cleared.', '🗑️');
});
 
aiApplyBtn.addEventListener('click', () => {
  if (!currentGeneratedBlocks.length) return;
  // Hook into your existing schedule system here:
  // e.g. currentGeneratedBlocks.forEach(b => addBlockToSchedule(b));
  showToast('Blocks applied to your schedule.', '📅');
});
 
// Example chips auto-fill
exampleChips.addEventListener('click', e => {
  if (!e.target.classList.contains('chip')) return;
  aiPromptInput.value = e.target.textContent.trim();
  aiPromptInput.focus();
});
 
// Allow Ctrl+Enter to generate
aiPromptInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) aiGenerateBtn.click();
});
  /* =====================================================
     BOOT SEQUENCE
  ===================================================== */
  function renderAll(){
    renderTimetable();
    renderTodos();
    renderHabits();
    renderOverview();
  }

  runDailyReset();
  updateTodayHistory();
  refreshNotifStatusUI();
  
  // Init Pomodoro
  Pomodoro.init();
  
  // Render views
  renderAll();
  
  // Check future reminders
  triggerFutureNotesCheck();

  // Periodic refresh loop
  setInterval(()=>{
    renderTimetable();
    const today = todayKey();
    if(state.lastActiveDate !== today){
      runDailyReset();
      renderAll();
    }
  }, 30000);

})();
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/sw.js");
      console.log("Service Worker Registered");
    } catch (err) {
      console.error("SW Error:", err);
    }
  });
}
