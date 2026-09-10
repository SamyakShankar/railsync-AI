/* RailSync AI - Main Application Controller & Integrated Demo Workflows */

(function () {
  'use strict';

  // Navigation Config
  const ROUTES = {
    'overview': {
      title: 'Operational Overview',
      subtitle: 'System Health & Traffic Metrics',
      viewId: 'view-overview'
    },
    'assets': {
      title: 'Assets & Maintenance',
      subtitle: 'Corridor Infrastructure & Maintenance Tasks',
      viewId: 'view-assets'
    },
    'planning': {
      title: 'Block Planning Workspace',
      subtitle: 'Optimization Engine & Task Selection',
      viewId: 'view-planning'
    },
    'schedule': {
      title: 'Block Schedule & Timeline',
      subtitle: 'Corridor Occupancy & Allocated Windows',
      viewId: 'view-schedule'
    },
    'network': {
      title: 'Network & Train Operations',
      subtitle: 'Agra Cantt – New Delhi Corridor Schematic',
      viewId: 'view-network'
    }
  };

  const DEFAULT_ROUTE = 'overview';

  // DOM Elements
  let sidebarEl;
  let sidebarToggleBtn;
  let pageTitleEl;
  let pageBreadcrumbEl;
  let navItems;
  let pageViews;

  function initApp() {
    sidebarEl = document.getElementById('app-sidebar');
    sidebarToggleBtn = document.getElementById('sidebar-toggle');
    pageTitleEl = document.getElementById('header-page-title');
    pageBreadcrumbEl = document.getElementById('header-breadcrumb');
    navItems = document.querySelectorAll('.sidebar-nav-item');
    pageViews = document.querySelectorAll('.page-view');

    // Sidebar Toggle
    if (sidebarToggleBtn && sidebarEl) {
      sidebarToggleBtn.addEventListener('click', toggleSidebar);
    }

    // Navigation Handlers
    navItems.forEach(item => {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        const route = this.getAttribute('data-route');
        if (route && ROUTES[route]) {
          navigateTo(route);
        }
      });
    });

    // Hash Routing
    window.addEventListener('hashchange', handleRouteFromHash);

    // Bind State Observers
    RailSyncTasks.onChange(renderAll);
    RailSyncPlan.onChange(renderAll);
    RailSyncNetwork.onChange(renderAll);

    // Initial Task Load
    RailSyncTasks.loadTasks();

    // Event Listeners Setup
    setupAssetsEventHandlers();
    setupPlanningEventHandlers();
    setupScheduleEventHandlers();

    // Initial Route Resolution
    handleRouteFromHash();
  }

  function toggleSidebar() {
    if (!sidebarEl) return;
    sidebarEl.classList.toggle('collapsed');
    const isCollapsed = sidebarEl.classList.contains('collapsed');
    localStorage.setItem('railsync_sidebar_collapsed', isCollapsed ? 'true' : 'false');
  }

  function navigateTo(routeKey) {
    if (!ROUTES[routeKey]) routeKey = DEFAULT_ROUTE;

    window.location.hash = `#/${routeKey}`;

    navItems.forEach(item => {
      const itemRoute = item.getAttribute('data-route');
      if (itemRoute === routeKey) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    const targetConfig = ROUTES[routeKey];
    pageViews.forEach(view => {
      if (view.id === targetConfig.viewId) {
        view.classList.add('active');
      } else {
        view.classList.remove('active');
      }
    });

    if (pageTitleEl) pageTitleEl.textContent = targetConfig.title;
    if (pageBreadcrumbEl) pageBreadcrumbEl.textContent = `RailSync / ${targetConfig.title}`;

    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.scrollTop = 0;
  }

  function handleRouteFromHash() {
    let rawHash = window.location.hash || '';
    let cleanRoute = rawHash.replace(/^#\/?/, '').trim();
    if (!cleanRoute || !ROUTES[cleanRoute]) {
      cleanRoute = DEFAULT_ROUTE;
    }
    navigateTo(cleanRoute);
  }

  // ----------------------------------------------------
  // EVENT HANDLERS SETUP
  // ----------------------------------------------------
  function setupAssetsEventHandlers() {
    const searchEl = document.getElementById('assets-search-input');
    if (searchEl) {
      searchEl.addEventListener('input', function () { RailSyncTasks.setFilter('search', this.value); });
    }

    const deptSelect = document.getElementById('filter-dept');
    if (deptSelect) deptSelect.addEventListener('change', function () { RailSyncTasks.setFilter('department', this.value); });

    const corridorSelect = document.getElementById('filter-corridor');
    if (corridorSelect) corridorSelect.addEventListener('change', function () { RailSyncTasks.setFilter('corridor', this.value); });

    const sevSelect = document.getElementById('filter-severity');
    if (sevSelect) sevSelect.addEventListener('change', function () { RailSyncTasks.setFilter('severity', this.value); });

    const statusSelect = document.getElementById('filter-status');
    if (statusSelect) statusSelect.addEventListener('change', function () { RailSyncTasks.setFilter('status', this.value); });

    const prioSelect = document.getElementById('filter-priority');
    if (prioSelect) prioSelect.addEventListener('change', function () { RailSyncTasks.setFilter('priority', this.value); });

    document.querySelectorAll('.th-sortable').forEach(th => {
      th.addEventListener('click', function () {
        const field = this.getAttribute('data-sort-field');
        if (field) RailSyncTasks.setSort(field);
      });
    });

    document.addEventListener('click', function (e) {
      if (e.target.closest('#btn-retry-tasks')) {
        RailSyncTasks.loadTasks();
      }
    });
  }

  function setupPlanningEventHandlers() {
    const btnGen = document.getElementById('btn-generate-plan');
    if (btnGen) {
      btnGen.addEventListener('click', async function () {
        await RailSyncPlan.generateBlockPlan();
      });
    }

    const btnSelectAll = document.getElementById('btn-select-all-tasks');
    if (btnSelectAll) {
      btnSelectAll.addEventListener('click', function () {
        const allIds = RailSyncTasks.getState().tasks.map(t => t.id);
        RailSyncPlan.setSelectedTaskIds(allIds);
      });
    }
  }

  function setupScheduleEventHandlers() {
    document.addEventListener('click', async function (e) {
      if (e.target.closest('#btn-approve-plan')) {
        const btn = e.target.closest('#btn-approve-plan');
        btn.disabled = true;
        btn.textContent = 'Approving...';
        const res = await RailSyncPlan.approveCurrentPlan();
        if (res.ok) {
          alert(`Schedule ${res.scheduleId} successfully approved by Section Controller.`);
        } else {
          alert(`Approval status updated locally for ${RailSyncPlan.getState().currentPlan.scheduleId}.`);
        }
      }
    });
  }

  // ----------------------------------------------------
  // MASTER RENDER OBSERVER
  // ----------------------------------------------------
  function renderAll() {
    const taskState = RailSyncTasks.getState();
    const planState = RailSyncPlan.getState();
    const networkState = RailSyncNetwork.getState();

    renderOverview(taskState, planState);
    renderAssetsTable(taskState);
    renderTaskDrawer(taskState);
    renderPlanningWorkspace(taskState, planState);
    renderGanttSchedule(planState);
    renderNetworkSchematic(networkState, planState);
  }

  // ----------------------------------------------------
  // 1. OVERVIEW DASHBOARD RENDERER
  // ----------------------------------------------------
  function renderOverview(taskState, planState) {
    const { tasks, loading, error } = taskState;
    const { currentPlan } = planState;

    const activeBlocksCount = currentPlan ? currentPlan.scheduledCount : tasks.filter(t => t.status === 'Approved' || t.status === 'Scheduled').length;
    const pendingApprovalsCount = currentPlan && currentPlan.lifecycleState === 'active' ? 1 : tasks.filter(t => t.status === 'Pending Approval' || t.status === 'Unassigned').length;
    const criticalCount = tasks.filter(t => t.severity === 'Critical').length;

    const activeBlocksEl = document.getElementById('metric-active-blocks');
    if (activeBlocksEl) activeBlocksEl.textContent = loading ? '--' : activeBlocksCount;

    const pendingEl = document.getElementById('metric-pending-approvals');
    if (pendingEl) pendingEl.textContent = loading ? '--' : pendingApprovalsCount;

    const availabilityEl = document.getElementById('metric-network-availability');
    if (availabilityEl) availabilityEl.textContent = loading ? '-- %' : (criticalCount > 0 ? '94.2 %' : '98.5 %');

    const punctualityEl = document.getElementById('metric-punctuality');
    if (punctualityEl) punctualityEl.textContent = loading ? '-- %' : '96.4 %';

    const alertBannerContainer = document.getElementById('overview-alert-container');
    if (alertBannerContainer) {
      if (loading) {
        alertBannerContainer.innerHTML = `
          <div class="alert-banner normal">
            <div class="alert-content">
              <div class="spinner" style="border-top-color: var(--color-primary-600); width:20px; height:20px;"></div>
              <div>
                <div class="alert-title">Connecting to RailSync Operations Engine...</div>
                <div class="alert-sub">Fetching corridor tasks and safety telemetry from GET /tasks</div>
              </div>
            </div>
          </div>`;
      } else if (error) {
        alertBannerContainer.innerHTML = `
          <div class="alert-banner">
            <div class="alert-content">
              <div class="alert-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></div>
              <div>
                <div class="alert-title">Backend Task Service Standby / Unreachable</div>
                <div class="alert-sub">${escapeHtml(error)}</div>
              </div>
            </div>
            <button id="btn-retry-tasks" class="btn btn-secondary btn-sm">Retry Connection</button>
          </div>`;
      } else if (criticalCount > 0) {
        alertBannerContainer.innerHTML = `
          <div class="alert-banner">
            <div class="alert-content">
              <div class="alert-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>
              <div>
                <div class="alert-title">${criticalCount} Critical Track Safety Alert${criticalCount > 1 ? 's' : ''} Active</div>
                <div class="alert-sub">Urgent maintenance intervention required on Agra Cantt — New Delhi Main Line</div>
              </div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="RailSyncApp.switchToAssetsWithFilter('critical')">Review Alerts</button>
          </div>`;
      } else {
        alertBannerContainer.innerHTML = `
          <div class="alert-banner normal">
            <div class="alert-content">
              <div class="alert-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
              <div>
                <div class="alert-title">All Safety Signals Normal — Corridor Operating Efficiently</div>
                <div class="alert-sub">Agra Cantt (AGC) – Mathura (MTJ) – New Delhi (NDLS) Main Trunk Line</div>
              </div>
            </div>
            <span class="badge badge-success">System Operational</span>
          </div>`;
      }
    }

    const criticalContainer = document.getElementById('overview-critical-tasks');
    if (criticalContainer) {
      const highPrioTasks = tasks.filter(t => t.priorityScore >= 75 || t.severity === 'Critical').slice(0, 4);
      if (loading) {
        criticalContainer.innerHTML = `<div class="skeleton-rect"></div>`;
      } else if (error || highPrioTasks.length === 0) {
        criticalContainer.innerHTML = `<div class="empty-state"><div class="empty-state-title">${error ? 'No Task Data Available' : 'No Critical Safety Alerts'}</div><div class="empty-state-desc">${error ? 'Backend GET /tasks endpoint unreachable.' : 'All corridor assets are operating within safety parameters.'}</div></div>`;
      } else {
        criticalContainer.innerHTML = `
          <div class="summary-list">
            ${highPrioTasks.map(t => `
              <div class="summary-item" onclick="RailSyncApp.openTaskDetail('${t.id}')">
                <div class="summary-item-left">
                  <span class="badge ${t.severity === 'Critical' ? 'badge-danger' : 'badge-warning'}">${t.severity}</span>
                  <div>
                    <div class="summary-item-title">${escapeHtml(t.id)} — ${escapeHtml(t.corridor)}</div>
                    <div class="summary-item-sub">${escapeHtml(t.description)} (${t.maintenanceAge}d age)</div>
                  </div>
                </div>
                <span class="badge badge-neutral">Priority ${t.priorityScore}</span>
              </div>
            `).join('')}
          </div>`;
      }
    }

    const activeBlocksContainer = document.getElementById('overview-active-blocks');
    if (activeBlocksContainer) {
      const activeList = currentPlan ? currentPlan.blocks : tasks.filter(t => t.status === 'Approved' || t.status === 'Scheduled').slice(0, 3);
      if (loading) {
        activeBlocksContainer.innerHTML = `<div class="skeleton-rect"></div>`;
      } else if (!activeList || activeList.length === 0) {
        activeBlocksContainer.innerHTML = `<div class="empty-state"><div class="empty-state-title">No Active Maintenance Blocks</div><div class="empty-state-desc">Generate a block plan to allocate track windows.</div></div>`;
      } else {
        activeBlocksContainer.innerHTML = `
          <div class="summary-list">
            ${activeList.map(b => `
              <div class="summary-item" onclick="RailSyncApp.openTaskDetail('${b.taskId || b.id}')">
                <div class="summary-item-left">
                  <span class="badge badge-info">${b.blockId || b.id}</span>
                  <div>
                    <div class="summary-item-title">${escapeHtml(b.taskId || b.id)} — ${escapeHtml(b.corridor)}</div>
                    <div class="summary-item-sub">Window: ${b.startTimeFormatted || '02:00'} - ${b.endTimeFormatted || '04:30'} (${b.duration}h)</div>
                  </div>
                </div>
                <span class="status-indicator"><span class="status-dot blue"></span>Allocated</span>
              </div>
            `).join('')}
          </div>`;
      }
    }
  }

  // ----------------------------------------------------
  // 2. ASSETS TABLE RENDERER
  // ----------------------------------------------------
  function renderAssetsTable(state) {
    const tbody = document.getElementById('assets-table-body');
    const countBadge = document.getElementById('assets-count-badge');
    if (!tbody) return;

    const { filteredTasks, loading, error } = state;
    if (countBadge) countBadge.textContent = loading ? 'Loading...' : `${filteredTasks.length} Tasks`;

    if (loading) {
      tbody.innerHTML = `<tr><td colspan="10" style="padding:24px; text-align:center;"><div class="spinner" style="border-top-color:var(--color-primary-600); margin:0 auto 12px auto;"></div><div>Fetching tasks from GET /tasks...</div></td></tr>`;
      return;
    }

    if (error) {
      tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state" style="border:none;"><div class="empty-state-title">Backend API Standby (GET /tasks Unreachable)</div><div class="empty-state-desc">${escapeHtml(error)}</div><button id="btn-retry-tasks" class="btn btn-secondary btn-sm" style="margin-top:12px;">Retry GET /tasks</button></div></td></tr>`;
      return;
    }

    if (filteredTasks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state" style="border:none;"><div class="empty-state-title">No Maintenance Tasks Found</div><div class="empty-state-desc">No tasks match active filter criteria.</div></div></td></tr>`;
      return;
    }

    tbody.innerHTML = filteredTasks.map(t => {
      const sevBadge = t.severity === 'Critical' ? 'badge-danger' : t.severity === 'High' ? 'badge-warning' : t.severity === 'Medium' ? 'badge-info' : 'badge-neutral';
      const prioClass = t.priorityScore >= 75 ? 'high' : t.priorityScore >= 45 ? 'medium' : 'low';

      return `
        <tr onclick="RailSyncApp.openTaskDetail('${t.id}')" style="cursor: pointer;">
          <td><strong style="font-family: var(--font-mono); font-size: 12px;">${escapeHtml(t.id)}</strong></td>
          <td><span class="badge badge-neutral">${escapeHtml(t.department)}</span></td>
          <td><span style="font-weight: 500; color: var(--color-text-primary);">${escapeHtml(t.corridor)}</span></td>
          <td style="max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(t.description)}</td>
          <td><span class="badge ${sevBadge}">${t.severity}</span></td>
          <td style="font-family: var(--font-mono);">${t.duration} hrs</td>
          <td style="font-family: var(--font-mono);">${t.maintenanceAge} days</td>
          <td>
            <div class="priority-score-pill">
              <span class="priority-score-val">${t.priorityScore}</span>
              <div class="priority-bar-outer"><div class="priority-bar-inner ${prioClass}" style="width: ${t.priorityScore}%;"></div></div>
            </div>
          </td>
          <td><span class="badge badge-neutral">${escapeHtml(t.status)}</span></td>
          <td style="text-align: right;" onclick="event.stopPropagation();">
            <button class="btn btn-ghost btn-sm" onclick="RailSyncApp.openTaskDetail('${t.id}')">Inspect</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ----------------------------------------------------
  // 3. TASK DETAIL DRAWER RENDERER
  // ----------------------------------------------------
  function renderTaskDrawer(state) {
    const selectedTask = state.selectedTask;
    const bodyEl = document.getElementById('task-drawer-body-content');
    const titleEl = document.getElementById('task-drawer-title');

    if (!bodyEl) return;

    if (!selectedTask) {
      if (titleEl) titleEl.textContent = 'Maintenance Task Details';
      bodyEl.innerHTML = `<div class="empty-state"><div class="empty-state-title">No Task Selected</div><div class="empty-state-desc">Select a maintenance task to view parameters.</div></div>`;
      return;
    }

    if (titleEl) titleEl.textContent = `Task ${selectedTask.id} (${selectedTask.department})`;
    const priorityInfo = RailSyncTasks.getPriorityExplanation(selectedTask);

    bodyEl.innerHTML = `
      <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;">
        <span class="badge ${priorityInfo.levelBadge}" style="font-size: 12px; padding: 4px 10px;">${selectedTask.severity} Severity</span>
        <span class="badge badge-neutral">${selectedTask.status}</span>
      </div>

      <div class="drawer-section-title">Corridor Operational Parameters</div>
      <div class="drawer-grid">
        <div class="drawer-field"><span class="drawer-field-label">Corridor Section</span><span class="drawer-field-value">${escapeHtml(selectedTask.corridor)}</span></div>
        <div class="drawer-field"><span class="drawer-field-label">Department / Source</span><span class="drawer-field-value">${escapeHtml(selectedTask.department)}</span></div>
        <div class="drawer-field"><span class="drawer-field-label">Estimated Duration</span><span class="drawer-field-value">${selectedTask.duration} Hours</span></div>
        <div class="drawer-field"><span class="drawer-field-label">Time Since Maintenance</span><span class="drawer-field-value">${selectedTask.maintenanceAge} Days</span></div>
      </div>

      <div class="drawer-section-title">Task Description</div>
      <p style="font-size: 13px; color: var(--color-text-secondary); background: var(--color-bg-app); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle); margin-bottom: 20px;">
        ${escapeHtml(selectedTask.description)}
      </p>

      <div class="drawer-section-title">Priority Assessment & Factor Breakdown</div>
      <div class="priority-explanation-card">
        <div class="priority-explanation-header">
          <span class="priority-explanation-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            Priority Score: ${priorityInfo.score} / 100
          </span>
          <span class="badge ${priorityInfo.levelBadge}">${priorityInfo.level} Priority</span>
        </div>

        <div class="priority-factor-list">
          <div class="priority-factor-item"><span class="priority-factor-bullet"></span><div><strong>Severity Rating:</strong> ${escapeHtml(priorityInfo.severityFactor)}</div></div>
          <div class="priority-factor-item"><span class="priority-factor-bullet"></span><div><strong>Maintenance Age:</strong> ${escapeHtml(priorityInfo.ageFactor)}</div></div>
          <div class="priority-factor-item"><span class="priority-factor-bullet"></span><div><strong>Corridor Influence:</strong> ${escapeHtml(priorityInfo.trafficFactor)}</div></div>
        </div>

        <div class="priority-explanation-summary">
          <strong>Backend Priority Reasoning:</strong> ${escapeHtml(priorityInfo.summary)}
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------
  // 4. BLOCK PLANNING WORKSPACE RENDERER
  // ----------------------------------------------------
  function renderPlanningWorkspace(taskState, planState) {
    const { tasks } = taskState;
    const { generating, stageText, stagePercent, currentPlan, selectedTaskIds } = planState;

    const btnGen = document.getElementById('btn-generate-plan');
    if (btnGen) {
      btnGen.disabled = generating || tasks.length === 0;
      btnGen.innerHTML = generating 
        ? `<div class="spinner" style="border-top-color:#fff; width:16px; height:16px; display:inline-block;"></div> Generating Plan...`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Generate Block Plan`;
    }

    const progressContainer = document.getElementById('planning-progress-area');
    if (progressContainer) {
      if (generating) {
        progressContainer.style.display = 'block';
        progressContainer.innerHTML = `
          <div class="planning-progress-container">
            <div class="planning-progress-header">
              <span>${escapeHtml(stageText)}</span>
              <span>${stagePercent}%</span>
            </div>
            <div class="planning-progress-bar-outer">
              <div class="planning-progress-bar-inner" style="width: ${stagePercent}%;"></div>
            </div>
          </div>`;
      } else {
        progressContainer.style.display = 'none';
      }
    }

    const taskListEl = document.getElementById('planning-task-selection-list');
    if (taskListEl) {
      if (tasks.length === 0) {
        taskListEl.innerHTML = `<div class="empty-state"><div class="empty-state-title">No Tasks Available</div><div class="empty-state-desc">Fetch or create tasks before generating block plan.</div></div>`;
      } else {
        taskListEl.innerHTML = tasks.map(t => {
          const isSelected = selectedTaskIds.length === 0 || selectedTaskIds.includes(t.id);
          return `
            <div class="summary-item" style="cursor:pointer;" onclick="RailSyncPlan.toggleTaskSelection('${t.id}')">
              <div class="summary-item-left">
                <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); RailSyncPlan.toggleTaskSelection('${t.id}')">
                <div>
                  <div class="summary-item-title">${escapeHtml(t.id)} — ${escapeHtml(t.department)} (${escapeHtml(t.corridor)})</div>
                  <div class="summary-item-sub">${escapeHtml(t.description)} (${t.duration}h req)</div>
                </div>
              </div>
              <span class="badge ${t.severity === 'Critical' ? 'badge-danger' : 'badge-neutral'}">Priority ${t.priorityScore}</span>
            </div>`;
        }).join('');
      }
    }

    const planResultContainer = document.getElementById('planning-result-summary');
    if (planResultContainer) {
      if (!currentPlan) {
        planResultContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-title">No Block Plan Generated Yet</div>
            <div class="empty-state-desc">Select tasks and click "Generate Block Plan" to synthesize non-overlapping block schedules.</div>
          </div>`;
      } else {
        const solverBadge = currentPlan.solverStatus === 'feasible' ? 'badge-success' : 'badge-danger';
        const lifecycleBadge = currentPlan.lifecycleState === 'approved' ? 'badge-success' : currentPlan.lifecycleState === 'active' ? 'badge-info' : 'badge-neutral';

        planResultContainer.innerHTML = `
          <div style="background-color: var(--color-bg-surface); border: 1px solid var(--color-border-default); border-radius: var(--radius-lg); padding: 18px; box-shadow: var(--shadow-sm);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--color-border-subtle);">
              <div>
                <div style="font-size: 15px; font-weight: 700; color: var(--color-text-primary);">${escapeHtml(currentPlan.scheduleId)}</div>
                <div style="font-size: 11px; color: var(--color-text-muted);">Generated: ${currentPlan.createdAt}</div>
              </div>
              <div style="display: flex; gap: 8px;">
                <span class="badge ${solverBadge}">Solver: ${currentPlan.solverStatus.toUpperCase()}</span>
                <span class="badge ${lifecycleBadge}">State: ${currentPlan.lifecycleState.toUpperCase()}</span>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px;">
              <div style="padding: 10px; background: var(--color-bg-app); border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle); text-align: center;">
                <div style="font-size: 10px; font-weight: 700; color: var(--color-text-muted);">SCHEDULED BLOCKS</div>
                <div style="font-size: 20px; font-weight: 700; color: var(--color-success-text);">${currentPlan.scheduledCount}</div>
              </div>
              <div style="padding: 10px; background: var(--color-bg-app); border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle); text-align: center;">
                <div style="font-size: 10px; font-weight: 700; color: var(--color-text-muted);">UNSCHEDULED TASKS</div>
                <div style="font-size: 20px; font-weight: 700; color: ${currentPlan.unscheduledCount > 0 ? 'var(--color-danger-text)' : 'var(--color-text-primary)'};">${currentPlan.unscheduledCount}</div>
              </div>
              <div style="padding: 10px; background: var(--color-bg-app); border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle); text-align: center;">
                <div style="font-size: 10px; font-weight: 700; color: var(--color-text-muted);">TOTAL DURATION</div>
                <div style="font-size: 20px; font-weight: 700; color: var(--color-primary-700);">${currentPlan.totalBlockHours} h</div>
              </div>
            </div>

            <div style="font-size: 12px; color: var(--color-text-secondary); background: var(--color-bg-app); padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle); margin-bottom: 14px;">
              ${escapeHtml(currentPlan.summary)}
            </div>

            ${currentPlan.unscheduledTasks && currentPlan.unscheduledTasks.length > 0 ? `
              <div class="drawer-section-title" style="color: var(--color-danger-text);">Unscheduled Tasks (${currentPlan.unscheduledTasks.length})</div>
              <div class="summary-list" style="margin-bottom: 14px;">
                ${currentPlan.unscheduledTasks.map(u => `
                  <div class="summary-item" style="border-color: var(--color-danger-border); background-color: var(--color-danger-bg);">
                    <div class="summary-item-left">
                      <span class="badge badge-danger">${u.task.id}</span>
                      <div>
                        <div class="summary-item-title">${escapeHtml(u.task.corridor)} — ${escapeHtml(u.task.description)}</div>
                        <div class="summary-item-sub" style="color: var(--color-danger-text);">${escapeHtml(u.reason)}</div>
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            <div style="display: flex; gap: 10px;">
              <button class="btn btn-primary btn-md" style="flex: 1;" onclick="RailSyncApp.navigateToRoute('schedule')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line></svg>
                Inspect Schedule in Gantt
              </button>
            </div>
          </div>`;
      }
    }
  }

  // ----------------------------------------------------
  // 5. GANTT / BLOCK SCHEDULE RENDERER
  // ----------------------------------------------------
  function renderGanttSchedule(planState) {
    const { currentPlan, trainTimetable } = planState;
    const ganttViewportEl = document.getElementById('gantt-viewport-area');
    const approvalAreaEl = document.getElementById('schedule-approval-area');

    if (approvalAreaEl) {
      if (!currentPlan) {
        approvalAreaEl.innerHTML = `
          <div class="approval-card" style="border-color: var(--color-border-default); background: var(--color-bg-surface);">
            <div class="approval-info">
              <div class="approval-title">Controller Approval Area</div>
              <div class="approval-sub">No block plan generated. Generate a plan from Block Planning workspace to enable controller approval.</div>
            </div>
            <button class="btn btn-primary" onclick="RailSyncApp.navigateToRoute('planning')">Go to Block Planning</button>
          </div>`;
      } else {
        const isApproved = currentPlan.lifecycleState === 'approved';
        approvalAreaEl.innerHTML = `
          <div class="approval-card ${isApproved ? 'approved' : ''}">
            <div class="approval-info">
              <div class="approval-title">
                ${escapeHtml(currentPlan.scheduleId)}
                <span class="badge ${isApproved ? 'badge-success' : 'badge-info'}">${isApproved ? 'APPROVED BY CONTROLLER' : 'PENDING APPROVAL'}</span>
                <span class="badge ${currentPlan.solverStatus === 'feasible' ? 'badge-success' : 'badge-danger'}">SOLVER: ${currentPlan.solverStatus.toUpperCase()}</span>
              </div>
              <div class="approval-sub">${currentPlan.scheduledCount} Maintenance Blocks (${currentPlan.totalBlockHours}h duration) — Synthetic Corridor Timetable Data</div>
            </div>
            <div>
              <button id="btn-approve-plan" class="btn ${isApproved ? 'btn-secondary disabled' : 'btn-primary btn-lg'}" ${isApproved ? 'disabled' : ''}>
                ${isApproved ? 'Plan Approved' : 'Approve Block Plan'}
              </button>
            </div>
          </div>`;
      }
    }

    if (!ganttViewportEl) return;

    const hoursArray = Array.from({ length: 25 }, (_, i) => i);
    const corridors = [
      { id: 'AGC-MTJ', name: 'AGC — MTJ Line', sub: 'Agra Cantt to Mathura Junction' },
      { id: 'MTJ-KSV', name: 'MTJ — KSV Line', sub: 'Mathura to Kosi Kalan' },
      { id: 'KSV-NDLS', name: 'KSV — NDLS Line', sub: 'Kosi Kalan to New Delhi' }
    ];

    const blocks = currentPlan ? currentPlan.blocks : [];

    ganttViewportEl.innerHTML = `
      <div class="gantt-container">
        <div class="gantt-header-bar">
          <div style="font-size: 13px; font-weight: 700; color: var(--color-text-primary);">
            Agra Cantt — New Delhi Corridor Timeline Viewport
          </div>
          <div class="gantt-legend">
            <div class="gantt-legend-item"><span class="legend-box train"></span> Train Occupancy (Constraint)</div>
            <div class="gantt-legend-item"><span class="legend-box block"></span> Maintenance Block Window</div>
            <div class="gantt-legend-item"><span class="legend-box window"></span> Train-Free Gap</div>
          </div>
        </div>

        <div class="gantt-scroll-viewport">
          <div class="gantt-timeline-wrapper">
            <div class="gantt-time-axis">
              ${hoursArray.map(h => `<div class="gantt-time-tick">${String(h).padStart(2, '0')}:00</div>`).join('')}
            </div>

            ${corridors.map(c => {
              const corridorTrains = trainTimetable.filter(t => t.corridor === c.id);
              const corridorBlocks = blocks.filter(b => b.corridor === c.id);

              return `
                <div class="gantt-corridor-row">
                  <div class="gantt-corridor-label">
                    <span class="corridor-name">${c.name}</span>
                    <span class="corridor-sub">${c.sub}</span>
                  </div>

                  <div class="gantt-track-area">
                    ${corridorTrains.map(t => {
                      const leftPct = (t.startHour / 24) * 100;
                      const widthPct = ((t.endHour - t.startHour) / 24) * 100;
                      return `
                        <div class="gantt-train-bar" style="left: ${leftPct}%; width: ${widthPct}%;" title="Train Constraint: ${t.name} (${t.startHour}:00 - ${t.endHour}:00)">
                          🚆 ${t.name}
                        </div>`;
                    }).join('')}

                    ${corridorBlocks.map(b => {
                      const leftPct = (b.startHour / 24) * 100;
                      const widthPct = ((b.endHour - b.startHour) / 24) * 100;
                      const isApproved = currentPlan.lifecycleState === 'approved';
                      return `
                        <div class="gantt-block-bar ${isApproved ? 'approved' : ''}" style="left: ${leftPct}%; width: ${widthPct}%;" onclick="RailSyncApp.openTaskDetail('${b.taskId}')" title="Block ${b.blockId}: Task ${b.taskId} (${b.startTimeFormatted} - ${b.endTimeFormatted})">
                          <span>🛠️ ${b.taskId} (${b.duration}h)</span>
                          <span style="font-size: 10px; opacity: 0.9;">${b.startTimeFormatted}</span>
                        </div>`;
                    }).join('')}
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>

        <div style="padding: 10px 16px; background: var(--color-bg-subtle); border-top: 1px solid var(--color-border-default); font-size: 11px; color: var(--color-text-muted); display: flex; justify-content: space-between;">
          <span>* Train occupancy data represents synthetic operational timetable constraints.</span>
          <span>Corridor Capacity = 1 (Sequential Block Allocation Enforced)</span>
        </div>
      </div>`;
  }

  // ----------------------------------------------------
  // 6. NETWORK CORRIDOR SCHEMATIC RENDERER
  // ----------------------------------------------------
  function renderNetworkSchematic(networkState, planState) {
    const { stations, corridors, trains, selectedTrain, selectedCorridor, selectedStation } = networkState;
    const { currentPlan } = planState;

    const canvasEl = document.getElementById('network-schematic-canvas');
    const inspectorEl = document.getElementById('network-inspector-panel');

    if (canvasEl) {
      canvasEl.innerHTML = `
        <div class="schematic-track-line">
          <div class="track-line-bg"></div>

          <!-- Render 6 Stations -->
          ${stations.map((s, idx) => {
            const leftPct = (idx / (stations.length - 1)) * 90 + 5;
            const isSelected = selectedStation && selectedStation.code === s.code;
            return `
              <div class="schematic-station-node" style="left: ${leftPct}%;" onclick="RailSyncNetwork.selectStation('${s.code}')" title="${s.name} (${s.code}) — Km ${s.km}">
                <div class="station-dot ${s.platformCount > 6 ? 'junction' : ''}"></div>
                <div class="station-node-label" style="${isSelected ? 'border-color: var(--color-primary-500); background: var(--color-primary-50);' : ''}">
                  ${s.code}
                </div>
                <div class="station-node-sub">Km ${s.km}</div>
              </div>`;
          }).join('')}

          <!-- Render 7 Synthetic Train Position Markers -->
          ${trains.map((t, idx) => {
            // Position mapping based on section index
            const secIdx = corridors.findIndex(c => c.id === t.section);
            const basePct = (secIdx / (corridors.length)) * 75 + 12;
            const offsetPct = (t.positionPct / 100) * 15;
            const leftPct = Math.min(92, Math.max(8, basePct + offsetPct));

            const isSelected = selectedTrain && selectedTrain.id === t.id;
            const isFreight = t.type.includes('Freight');

            return `
              <div class="schematic-train-marker ${isFreight ? 'freight' : ''}" style="left: ${leftPct}%; ${isSelected ? 'border-color: #38bdf8; background: var(--color-primary-800);' : ''}" onclick="RailSyncNetwork.selectTrain('${t.id}')" title="Train ${t.number}: ${t.name}">
                <span>${t.direction.includes('UP') ? '▲' : '▼'}</span>
                <span>${t.number}</span>
              </div>`;
          }).join('')}

          <!-- Render Active Maintenance Block Overlays if plan exists -->
          ${currentPlan && currentPlan.blocks ? currentPlan.blocks.slice(0, 2).map((b, idx) => {
            const leftPct = 25 + idx * 35;
            return `
              <div class="schematic-block-indicator" style="left: ${leftPct}%; width: 100px;" onclick="RailSyncApp.openTaskDetail('${b.taskId}')">
                🛠️ BLOCK: ${b.taskId}
              </div>`;
          }).join('') : ''}

        </div>
      `;
    }

    if (inspectorEl) {
      if (selectedTrain) {
        inspectorEl.innerHTML = `
          <div class="drawer-section-title">Train Telemetry Inspector</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--color-text-primary); margin-bottom: 4px;">
            🚆 ${escapeHtml(selectedTrain.number)} — ${escapeHtml(selectedTrain.name)}
          </div>
          <div style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 14px;">${escapeHtml(selectedTrain.type)}</div>

          <div class="drawer-grid">
            <div class="drawer-field"><span class="drawer-field-label">Current Section</span><span class="drawer-field-value">${escapeHtml(selectedTrain.section)}</span></div>
            <div class="drawer-field"><span class="drawer-field-label">Direction</span><span class="drawer-field-value">${escapeHtml(selectedTrain.direction)}</span></div>
            <div class="drawer-field"><span class="drawer-field-label">Current Speed</span><span class="drawer-field-value">${escapeHtml(selectedTrain.speed)}</span></div>
            <div class="drawer-field"><span class="drawer-field-label">Punctuality</span><span class="drawer-field-value" style="color: var(--color-success-text);">${escapeHtml(selectedTrain.status)}</span></div>
          </div>

          <div class="drawer-section-title">Operational Timetable</div>
          <div style="font-size: 12px; color: var(--color-text-secondary); background: var(--color-bg-app); padding: 10px; border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle); margin-bottom: 14px;">
            <strong>Timetable Schedule:</strong> ${escapeHtml(selectedTrain.timetable)}<br>
            <span style="font-size: 11px; color: var(--color-text-muted);">* Synthetic Operational Timetable Data</span>
          </div>`;
      } else if (selectedStation) {
        inspectorEl.innerHTML = `
          <div class="drawer-section-title">Station Inspector</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--color-text-primary); margin-bottom: 4px;">
            🚉 ${escapeHtml(selectedStation.name)} (${escapeHtml(selectedStation.code)})
          </div>
          <div style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 14px;">${escapeHtml(selectedStation.division)} Division — Km ${selectedStation.km}</div>

          <div class="drawer-grid">
            <div class="drawer-field"><span class="drawer-field-label">Platform Count</span><span class="drawer-field-value">${selectedStation.platformCount} Platforms</span></div>
            <div class="drawer-field"><span class="drawer-field-label">Signal Status</span><span class="drawer-field-value" style="color: var(--color-success-text);">${escapeHtml(selectedStation.status)}</span></div>
          </div>`;
      } else {
        inspectorEl.innerHTML = `
          <div class="empty-state" style="border: none;">
            <div class="empty-state-title">Corridor Element Inspector</div>
            <div class="empty-state-desc">Click on any station node, train marker, or track block in the schematic diagram to inspect live operational parameters.</div>
          </div>`;
      }
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  window.RailSyncApp = {
    openTaskDetail: function (taskId) {
      RailSyncTasks.selectTask(taskId);
      RailSyncUI.toggleDrawer('task-drawer-backdrop', true);
    },
    switchToAssetsWithFilter: function (sev) {
      const sevSelect = document.getElementById('filter-severity');
      if (sevSelect) {
        sevSelect.value = sev;
        RailSyncTasks.setFilter('severity', sev);
      }
      navigateTo('assets');
    },
    navigateToRoute: function (route) {
      navigateTo(route);
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    initApp();
    const savedCollapsed = localStorage.getItem('railsync_sidebar_collapsed');
    if (savedCollapsed === 'true' && sidebarEl) {
      sidebarEl.classList.add('collapsed');
    }
  });

})();
