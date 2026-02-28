// public/parent.js
import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const institutionSelect = document.getElementById("institutionSelect");
const routeSelect = document.getElementById("routeSelect");
const stopSelect = document.getElementById("stopSelect");
const tripStatusEl = document.getElementById("tripStatus");
const startTimeText = document.getElementById("startTimeText");
const lastUpdateText = document.getElementById("lastUpdateText");
const passedText = document.getElementById("passedText");
const remainingText = document.getElementById("remainingText");

let stops = [];
let totalStops = 0;
let currentStopIndex = 0;
let activeTripId = null;

function getCurrentInstitutionId() {
  return institutionSelect.value;
}

function getCurrentRouteId() {
  return routeSelect.value;
}

async function loadStops() {
  const institutionId = getCurrentInstitutionId();
  const routeId = getCurrentRouteId();

  const qStops = query(
    collection(db, "stops"),
    where("institutionId", "==", institutionId),
    where("routeId", "==", routeId),
    orderBy("sequence", "asc")
  );
  const snap = await getDocs(qStops);
  stops = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  totalStops = stops.length;

  stopSelect.innerHTML = "";
  stops.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.sequence;
    opt.textContent = `${s.sequence} – ${s.name}`;
    stopSelect.appendChild(opt);
  });

  updateRemaining();
}

function formatTs(ts) {
  if (!ts) return "-";
  return ts.toDate().toLocaleTimeString();
}

function updateRemaining() {
  const yourStopIndex = parseInt(stopSelect.value || "1", 10);
  const remaining = Math.max(yourStopIndex - currentStopIndex, 0);
  passedText.textContent = `Stops passed: ${currentStopIndex} of ${totalStops}`;
  remainingText.textContent = `Stops remaining before your stop: ${remaining}`;
}

function subscribeCurrentTrip() {
  const routeId = getCurrentRouteId();

  onSnapshot(doc(db, "currentTrip", routeId), (snap) => {
    if (!snap.exists()) {
      tripStatusEl.textContent = "Status: no active trip";
      startTimeText.textContent = "Start time: -";
      activeTripId = null;
      return;
    }
    const data = snap.data();
    tripStatusEl.textContent = `Status: ${data.status}`;
    startTimeText.textContent = `Start time: ${formatTs(data.startTime)}`;
    activeTripId = data.tripId;
    if (activeTripId) subscribeTripDetails(activeTripId);
  });
}

function subscribeTripDetails(tripId) {
  const routeId = getCurrentRouteId();

  onSnapshot(doc(db, "trips", tripId), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    currentStopIndex = data.currentStopIndex || 0;
    updateRemaining();
  });

  onSnapshot(doc(db, "busLocation", routeId), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    lastUpdateText.textContent = `Last bus update: ${formatTs(
      data.lastUpdateTime
    )}`;
    // data.lat / data.lng available for future map
  });
}

institutionSelect.addEventListener("change", async () => {
  await loadStops();
  subscribeCurrentTrip();
});

routeSelect.addEventListener("change", async () => {
  await loadStops();
  subscribeCurrentTrip();
});

stopSelect.addEventListener("change", updateRemaining);

(async function init() {
  await loadStops();
  subscribeCurrentTrip();
})();
