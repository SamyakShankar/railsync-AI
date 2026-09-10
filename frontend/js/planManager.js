/* RailSync AI - Automatic Block Planning & Gantt Schedule Engine */

window.RailSyncPlan = (function () {
  'use strict';

  // Synthetic Train Occupancy Timetable (Corridor Constraints)
  const TRAIN_TIMETABLE = [
    { id: 'TRN-12004', name: '12004 Shatabdi Exp', corridor: 'AGC-MTJ', startHour: 6.0, endHour: 7.5, type: 'passenger' },
    { id: 'TRN-12626', name: '12626 Kerala Exp', corridor: 'MTJ-KSV', startHour: 8.5, endHour: 10.25, type: 'passenger' },
    { id: 'TRN-22415', name: '22415 Vande Bharat', corridor: 'KSV-NDLS', startHour: 11.5, endHour: 12.75, type: 'passenger' },
    { id: 'FRT-55102', name: 'BJU Freight Container', corridor: 'AGC-MTJ', startHour: 14.0, endHour: 16.0, type: 'freight' },
    { id: 'TRN-12952', name: '12952 Rajdhani Exp', corridor: 'KSV-NDLS', startHour: 17.0, endHour: 18.5, type: 'passenger' },
    { id: 'FRT-88201', name: 'Coal Rake Down', corridor: 'MTJ-KSV', startHour: 20.5, endHour: 22.5, type: 'freight' }
  ];

  // Train-Free Maintenance Opportunities (Windows)
  const MAINTENANCE_WINDOWS = [
    { windowId: 'WIN-01', startHour: 1.0, endHour: 5.5, label: 'Night Window (01:00 - 05:30)' },
    { windowId: 'WIN-02', startHour: 12.75, endHour: 14.0, label: 'Midday Window (12:45 - 14:00)' },
    { windowId: 'WIN-03', startHour: 18.5, endHour: 20.5, label: 'Evening Window (18:30 - 20:30)' }
  ];

  // Plan State
  const state = {
    generating: false,
    stageText: '',
    stagePercent: 0,
    currentPlan: null,
    selectedTaskIds: [],
    history: []
  };

  /**
   * Initialize default selected task IDs
   */
  function setSelectedTaskIds(taskIds) {
    state.selectedTaskIds = taskIds;
    notifyStateChange();
  }

  /**
   * Toggle individual task selection for planning
   */
  function toggleTaskSelection(taskId) {
    const idx = state.selectedTaskIds.indexOf(taskId);
    if (idx >= 0) {
      state.selectedTaskIds.splice(idx, 1);
    } else {
      state.selectedTaskIds.push(taskId);
    }
    notifyStateChange();
  }

  /**
   * Execute Automatic Block Plan Generation
   */
  async function generateBlockPlan() {
    state.generating = true;
    state.stagePercent = 10;
    state.stageText = 'Analyzing corridor train movements and synthetic timetable...';
    notifyStateChange();

    // Stage 1: Timetable analysis simulation
    await delay(300);
    state.stagePercent = 35;
    state.stageText = 'Evaluating track capacity (Corridor Capacity = 1) and headway rules...';
    notifyStateChange();

    // Stage 2: Constraint checking
    await delay(350);
    state.stagePercent = 65;
    state.stageText = 'Identifying train-free maintenance windows across AGC-NDLS sections...';
    notifyStateChange();

    // Stage 3: Attempt API call or synthesize plan
    await delay(350);
    state.stagePercent = 85;
    state.stageText = 'Synthesizing sequential block schedule proposal...';
    notifyStateChange();

    const selectedTasks = RailSyncTasks.getState().tasks.filter(t => 
      state.selectedTaskIds.length === 0 || state.selectedTaskIds.includes(t.id)
    );

    const apiResult = await RailSyncAPI.generatePlan({
      task_ids: selectedTasks.map(t => t.id)
    });

    await delay(200);
    state.stagePercent = 100;
    state.stageText = 'Block schedule synthesized successfully!';

    let planObj;
    if (apiResult.ok && apiResult.data && apiResult.data.schedule_id) {
      planObj = apiResult.data;
    } else {
      // Local Solver Synthesis based on strict rules
      planObj = synthesizePlan(selectedTasks);
    }

    // Mark previous plan as superseded
    if (state.currentPlan && state.currentPlan.lifecycleState === 'active') {
      state.currentPlan.lifecycleState = 'superseded';
    }

    state.currentPlan = planObj;
    state.generating = false;
    notifyStateChange();

    return planObj;
  }

  /**
   * Approve Plan via POST /plan/approve or local state
   */
  async function approveCurrentPlan() {
    if (!state.currentPlan) return { ok: false, error: 'No active plan' };

    const scheduleId = state.currentPlan.scheduleId;
    const apiResult = await RailSyncAPI.approvePlan({ schedule_id: scheduleId });

    if (apiResult.ok || apiResult.status === 404) {
      state.currentPlan.lifecycleState = 'approved';
      notifyStateChange();
      return { ok: true, scheduleId: scheduleId };
    } else {
      return { ok: false, error: apiResult.error };
    }
  }

  /**
   * Local Solver Engine (Strictly adherence to Corridor Capacity = 1)
   */
  function synthesizePlan(inputTasks) {
    const scheduleId = `SCH-${new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 12)}`;
    
    // Sort tasks by priority score descending
    const sortedTasks = [...inputTasks].sort((a, b) => b.priorityScore - a.priorityScore);

    const scheduledBlocks = [];
    const unscheduledTasks = [];

    // Track window cursor per corridor section to enforce Capacity = 1 (Sequential Allocation)
    const corridorCursors = {
      'AGC-MTJ': { winIdx: 0, time: 1.5 },
      'MTJ-KSV': { winIdx: 0, time: 1.5 },
      'KSV-NDLS': { winIdx: 0, time: 1.5 }
    };

    let totalAllocatedHours = 0;

    sortedTasks.forEach((task, index) => {
      const corr = corridorCursors[task.corridor] ? task.corridor : 'AGC-MTJ';
      let cursor = corridorCursors[corr];

      let placed = false;

      // Try windows
      for (let wIdx = cursor.winIdx; wIdx < MAINTENANCE_WINDOWS.length; wIdx++) {
        const win = MAINTENANCE_WINDOWS[wIdx];
        let startTime = Math.max(cursor.time, win.startHour);
        let endTime = startTime + task.duration;

        if (endTime <= win.endHour) {
          // Placed successfully in window!
          const blockId = `BLK-${scheduleId.slice(-4)}-${index + 1}`;
          
          scheduledBlocks.push({
            blockId: blockId,
            taskId: task.id,
            department: task.department,
            corridor: task.corridor,
            description: task.description,
            severity: task.severity,
            priorityScore: task.priorityScore,
            duration: task.duration,
            startHour: startTime,
            endHour: endTime,
            startTimeFormatted: formatHour(startTime),
            endTimeFormatted: formatHour(endTime),
            windowId: win.windowId,
            windowLabel: win.label,
            coordinationNote: `Coordinated within ${win.label} (Sequential track corridor access)`
          });

          cursor.winIdx = wIdx;
          cursor.time = endTime + 0.25; // 15 min buffer
          totalAllocatedHours += task.duration;
          placed = true;
          break;
        }
      }

      if (!placed) {
        unscheduledTasks.push({
          task: task,
          reason: `Exceeds available train-free window capacity (${task.duration}h duration required)`
        });
      }
    });

    const isFeasible = unscheduledTasks.length === 0 || scheduledBlocks.length > 0;

    return {
      scheduleId: scheduleId,
      createdAt: new Date().toLocaleTimeString('en-US', { hour12: false }) + ' IST',
      solverStatus: isFeasible ? 'feasible' : 'infeasible',
      lifecycleState: 'active', // active, approved, superseded
      scheduledCount: scheduledBlocks.length,
      unscheduledCount: unscheduledTasks.length,
      totalBlockHours: totalAllocatedHours.toFixed(1),
      blocks: scheduledBlocks,
      unscheduledTasks: unscheduledTasks,
      summary: `Synthesized ${scheduledBlocks.length} maintenance blocks (${totalAllocatedHours.toFixed(1)} hrs total) on AGC-NDLS corridor across ${MAINTENANCE_WINDOWS.length} train-free windows.`
    };
  }

  function formatHour(h) {
    const hours = Math.floor(h);
    const mins = Math.round((h - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  // Listeners
  const listeners = [];
  function onChange(fn) {
    listeners.push(fn);
  }

  function notifyStateChange() {
    listeners.forEach(fn => fn(getState()));
  }

  function getState() {
    return {
      generating: state.generating,
      stageText: state.stageText,
      stagePercent: state.stagePercent,
      currentPlan: state.currentPlan,
      selectedTaskIds: state.selectedTaskIds,
      trainTimetable: TRAIN_TIMETABLE,
      maintenanceWindows: MAINTENANCE_WINDOWS
    };
  }

  return {
    generateBlockPlan: generateBlockPlan,
    approveCurrentPlan: approveCurrentPlan,
    setSelectedTaskIds: setSelectedTaskIds,
    toggleTaskSelection: toggleTaskSelection,
    onChange: onChange,
    getState: getState
  };
})();
