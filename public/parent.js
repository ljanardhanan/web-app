// public/parent.js
import { db, auth } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

const institutionSelect = document.getElementById("institutionSelect");
const routeSelect = document.getElementById("routeSelect");
const directionSelect = document.getElementById("directionSelect");
const stopSelect = document.getElementById("stopSelect");
const signInBtn = document.getElementById("signInBtn");
const signOutBtn = document.getElementById("signOutBtn");
const userText = document.getElementById("userText");
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

function setUiForSignedIn(user) {
  userText.textContent = `Signed in as ${user.displayName || user.email}`;
  signInBtn.disabled = true;
  signOutBtn.disabled = false;
  institutionSelect.disabled = false;
  routeSelect.disabled = false;
  directionSelect.disabled = false;
  stopSelect.disabled = false;
  tripStatusEl.textContent = "Status: waiting for route updates";
}

function setUiSignedOut() {
  userText.textContent = "Not signed in";
  signInBtn.disabled = false;
  signOutBtn.disabled = true;
  institutionSelect.disabled = true;
  routeSelect.disabled = true;
  directionSelect.disabled = true;
  stopSelect.disabled = true;
  tripStatusEl.textContent = "Status: sign in required";
}

async function ensureUserRole(uid, role) {
  const userDocRef = doc(db, "users", uid);
  const userSnap = await getDoc(userDocRef);
  if (!userSnap.exists()) {
    await setDoc(userDocRef, {
      role,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    return;
  }
  const data = userSnap.data();
  if (data.role !== role) {
    await setDoc(userDocRef, {
      role,
      updatedAt: Timestamp.now(),
    }, { merge: true });
  }
}

function requireAuth() {
  if (!auth.currentUser) {
    throw new Error("You must sign in before using the parent interface.");
  }
  return auth.currentUser;
}

async function loadStops() {
  requireAuth();
  const institutionId = getCurrentInstitutionId();
  const routeId = getCurrentRouteId();
  const direction = directionSelect?.value || "from_school";

  const qStops = query(
    collection(db, "stops"),
    where("institutionId", "==", institutionId),
    where("routeId", "==", routeId),
    orderBy("sequence", "asc")
  );
  const snap = await getDocs(qStops);
  stops = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (direction === "to_school") {
    stops = [...stops].reverse();
  }
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
  const yourStopSequence = parseInt(stopSelect.value || "1", 10);
  const yourStopIndex = stops.findIndex((stop) => stop.sequence === yourStopSequence);
  const remaining = yourStopIndex < 0 ? 0 : Math.max(yourStopIndex - currentStopIndex, 0);
  passedText.textContent = `Stops passed: ${currentStopIndex} of ${totalStops}`;
  remainingText.textContent = `Stops remaining before your stop: ${remaining}`;
}

function subscribeCurrentTrip() {
  requireAuth();
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
  requireAuth();
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
  if (!auth.currentUser) return;
  await loadStops();
  subscribeCurrentTrip();
});

routeSelect.addEventListener("change", async () => {
  if (!auth.currentUser) return;
  await loadStops();
  subscribeCurrentTrip();
});

directionSelect.addEventListener("change", async () => {
  if (!auth.currentUser) return;
  await loadStops();
  updateRemaining();
});

stopSelect.addEventListener("change", updateRemaining);

const provider = new GoogleAuthProvider();

signInBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Sign-in failed", error);
    alert(`Sign-in error: ${error.message}`);
  }
});

signOutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    setUiSignedOut();
  } catch (error) {
    console.error("Sign-out failed", error);
    alert(`Sign-out error: ${error.message}`);
  }
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    await ensureUserRole(user.uid, "parent");
    setUiForSignedIn(user);
    await loadStops();
    subscribeCurrentTrip();
  } else {
    setUiSignedOut();
  }
});

setUiSignedOut();
