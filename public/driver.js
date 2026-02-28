// public/driver.js
import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const institutionSelect = document.getElementById("institutionSelect");
const routeSelect = document.getElementById("routeSelect");
const startBtn = document.getElementById("startTripBtn");
const endBtn = document.getElementById("endTripBtn");
const statusText = document.getElementById("statusText");

let watchId = null;
let activeTripId = null;
let stops = [];
let currentStopIndex = 0;

function getCurrentInstitutionId() {
  return institutionSelect.value;
}

function getCurrentRouteId() {
  return routeSelect.value; // e.g. "Downingtown_STEM_Academy-259"
}

async function loadStops(institutionId, routeId) {
  const qStops = query(
    collection(db, "stops"),
    where("institutionId", "==", institutionId),
    where("routeId", "==", routeId),
    orderBy("sequence", "asc")
  );
  const snap = await getDocs(qStops);
  stops = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function startTrip() {
  const institutionId = getCurrentInstitutionId();
  const routeId = getCurrentRouteId();

  await loadStops(institutionId, routeId);

  if (stops.length === 0) {
    alert("No stops configured for this route.");
    return;
  }

  const routeNumber = 259; // or fetch from routes collection later

  const tripDoc = await addDoc(collection(db, "trips"), {
    institutionId,
    routeId,
    routeNumber,
    status: "in_progress",
    startTime: Timestamp.now(),
    endTime: null,
    currentStopIndex: 0,
  });

  activeTripId = tripDoc.id;
  currentStopIndex = 0;

  await setDoc(doc(db, "currentTrip", routeId), {
    institutionId,
    routeId,
    tripId: activeTripId,
    status: "in_progress",
    startTime: Timestamp.now(),
  });

  statusText.textContent = "Status: in progress";
  startBtn.disabled = true;
  endBtn.disabled = false;

  if (!navigator.geolocation) {
    alert("Geolocation not supported.");
    return;
  }

  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;

      await setDoc(doc(db, "busLocation", routeId), {
        institutionId,
        routeId,
        tripId: activeTripId,
        lat: latitude,
        lng: longitude,
        lastUpdateTime: Timestamp.now(),
      });

      // naive stop detection
      if (currentStopIndex < stops.length) {
        const nextStop = stops[currentStopIndex];
        const dist = distanceMeters(
          latitude,
          longitude,
          nextStop.latitude,
          nextStop.longitude
        );

        const threshold = 80; // meters
        if (dist < threshold) {
          currentStopIndex += 1;
          await updateDoc(doc(db, "trips", activeTripId), {
            currentStopIndex,
          });
        }
      }
    },
    (err) => {
      console.error(err);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );
}

async function endTrip() {
  if (!activeTripId) return;

  const routeId = getCurrentRouteId();

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  await updateDoc(doc(db, "trips", activeTripId), {
    status: "completed",
    endTime: Timestamp.now(),
  });

  await setDoc(
    doc(db, "currentTrip", routeId),
    {
      status: "completed",
      endTime: Timestamp.now(),
    },
    { merge: true }
  );

  statusText.textContent = "Status: completed";
  startBtn.disabled = false;
  endBtn.disabled = true;
}

startBtn.addEventListener("click", startTrip);
endBtn.addEventListener("click", endTrip);
