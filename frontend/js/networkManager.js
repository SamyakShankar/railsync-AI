/* RailSync AI - Network Corridor Schematic & Train Telemetry Manager */

window.RailSyncNetwork = (function () {
  'use strict';

  // 6 Stations along Agra Cantt — New Delhi Corridor
  const STATIONS = [
    { code: 'AGC', name: 'Agra Cantt', km: 0, platformCount: 6, status: 'Normal', division: 'Agra (AGC)' },
    { code: 'RKM', name: 'Raja Ki Mandi', km: 18, platformCount: 4, status: 'Normal', division: 'Agra (AGC)' },
    { code: 'MHO', name: 'Mahoha / Mathura S', km: 42, platformCount: 3, status: 'Normal', division: 'Agra (AGC)' },
    { code: 'MTJ', name: 'Mathura Junction', km: 54, platformCount: 10, status: 'Junction Operational', division: 'Agra (AGC)' },
    { code: 'KSV', name: 'Kosi Kalan', km: 102, platformCount: 4, status: 'Normal', division: 'Delhi (DLI)' },
    { code: 'NDLS', name: 'New Delhi', km: 195, platformCount: 16, status: 'Terminal Operational', division: 'Delhi (DLI)' }
  ];

  // 4 Corridor Track Segments
  const CORRIDORS = [
    { id: 'COR-AGC-RKM', name: 'AGC — RKM', startStation: 'AGC', endStation: 'RKM', lengthKm: 18, tracks: 'Double Line', maxSpeed: 130, status: 'Operational' },
    { id: 'COR-RKM-MTJ', name: 'RKM — MTJ', startStation: 'RKM', endStation: 'MTJ', lengthKm: 36, tracks: 'Double Line', maxSpeed: 130, status: 'Operational' },
    { id: 'COR-MTJ-KSV', name: 'MTJ — KSV', startStation: 'MTJ', endStation: 'KSV', lengthKm: 48, tracks: 'Double Line', maxSpeed: 130, status: 'Operational' },
    { id: 'COR-KSV-NDLS', name: 'KSV — NDLS', startStation: 'KSV', endStation: 'NDLS', lengthKm: 93, tracks: 'Double Line', maxSpeed: 130, status: 'Operational' }
  ];

  // 7 Synthetic Demo Trains
  const TRAINS = [
    { id: 'TRN-12004', number: '12004', name: 'Shatabdi Express', type: 'Superfast Passenger', direction: 'UP (NDLS Bound)', section: 'COR-MTJ-KSV', positionPct: 45, speed: '130 km/h', status: 'On Schedule', delayMins: 0, timetable: '06:00 AGC - 09:30 NDLS' },
    { id: 'TRN-12626', number: '12626', name: 'Kerala Express', type: 'Superfast Express', direction: 'UP (NDLS Bound)', section: 'COR-AGC-RKM', positionPct: 20, speed: '110 km/h', status: 'On Schedule', delayMins: 0, timetable: '08:30 AGC - 12:15 NDLS' },
    { id: 'TRN-22415', number: '22415', name: 'Vande Bharat Express', type: 'Vande Bharat', direction: 'DOWN (AGC Bound)', section: 'COR-KSV-NDLS', positionPct: 75, speed: '130 km/h', status: 'On Schedule', delayMins: 0, timetable: '11:30 NDLS - 14:15 AGC' },
    { id: 'TRN-12952', number: '12952', name: 'New Delhi Rajdhani', type: 'Rajdhani Express', direction: 'UP (NDLS Bound)', section: 'COR-RKM-MTJ', positionPct: 60, speed: '130 km/h', status: 'On Schedule', delayMins: 0, timetable: '17:00 AGC - 20:15 NDLS' },
    { id: 'FRT-55102', number: 'FRT-55102', name: 'BJU Container Freight', type: 'Freight (Container)', direction: 'DOWN (AGC Bound)', section: 'COR-MTJ-KSV', positionPct: 30, speed: '75 km/h', status: 'Operating', delayMins: 0, timetable: '14:00 MTJ - 17:30 AGC' },
    { id: 'FRT-88201', number: 'FRT-88201', name: 'Coal Rake Special', type: 'Freight (Heavy Rake)', direction: 'DOWN (AGC Bound)', section: 'COR-AGC-RKM', positionPct: 80, speed: '60 km/h', status: 'Operating', delayMins: 0, timetable: '20:30 MTJ - 23:45 AGC' },
    { id: 'FRT-99304', number: 'FRT-99304', name: 'NDLS Express Goods', type: 'Freight (Parcel)', direction: 'UP (NDLS Bound)', section: 'COR-KSV-NDLS', positionPct: 25, speed: '80 km/h', status: 'Operating', delayMins: 0, timetable: '02:00 AGC - 06:15 NDLS' }
  ];

  // State
  const state = {
    selectedTrainId: null,
    selectedCorridorId: null,
    selectedStationCode: null
  };

  function selectTrain(trainId) {
    state.selectedTrainId = trainId;
    state.selectedCorridorId = null;
    state.selectedStationCode = null;
    notifyStateChange();
  }

  function selectCorridor(corridorId) {
    state.selectedCorridorId = corridorId;
    state.selectedTrainId = null;
    state.selectedStationCode = null;
    notifyStateChange();
  }

  function selectStation(stationCode) {
    state.selectedStationCode = stationCode;
    state.selectedTrainId = null;
    state.selectedCorridorId = null;
    notifyStateChange();
  }

  function getSelectedTrain() {
    return TRAINS.find(t => t.id === state.selectedTrainId) || null;
  }

  function getSelectedCorridor() {
    return CORRIDORS.find(c => c.id === state.selectedCorridorId) || null;
  }

  function getSelectedStation() {
    return STATIONS.find(s => s.code === state.selectedStationCode) || null;
  }

  // Listeners
  const listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function notifyStateChange() { listeners.forEach(fn => fn(getState())); }

  function getState() {
    return {
      stations: STATIONS,
      corridors: CORRIDORS,
      trains: TRAINS,
      selectedTrain: getSelectedTrain(),
      selectedCorridor: getSelectedCorridor(),
      selectedStation: getSelectedStation()
    };
  }

  return {
    selectTrain: selectTrain,
    selectCorridor: selectCorridor,
    selectStation: selectStation,
    onChange: onChange,
    getState: getState
  };
})();
