// public/driver.js
import { db, auth } from "./firebase-config.js";
import {
  collection,
  addDoc,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

const institutionSelect = document.getElementById("institutionSelect");
const routeSelect = document.getElementById("routeSelect");
const startBtn = document.getElementById("startTripBtn");
const endBtn = document.getElementById("endTripBtn");
const signInBtn = document.getElementById("signInBtn");
const signOutBtn = document.getElementById("signOutBtn");
const userText = document.getElementById("userText");
const statusText = document.getElementById("statusText");

let watchId = null;
let activeTripId = null;
let stops = [];
let currentStopIndex = 0;

// Set to true to simulate location changes for debugging
const DEBUG_SIMULATE = true;

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

function setUiForSignedIn(user) {
  userText.textContent = `Signed in as ${user.displayName || user.email}`;
  signInBtn.disabled = true;
  signOutBtn.disabled = false;
  startBtn.disabled = false;
  routeSelect.disabled = false;
  institutionSelect.disabled = false;
}

function setUiSignedOut() {
  userText.textContent = "Not signed in";
  signInBtn.disabled = false;
  signOutBtn.disabled = true;
  startBtn.disabled = true;
  endBtn.disabled = true;
  routeSelect.disabled = true;
  institutionSelect.disabled = true;
  statusText.textContent = "Status: sign in required";
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
    throw new Error("You must sign in before using the driver interface.");
  }
  return auth.currentUser;
}

async function startTrip() {
  const user = requireAuth();
  await ensureUserRole(user.uid, "driver");

  const institutionId = getCurrentInstitutionId();
  const routeId = getCurrentRouteId();
  alert("Inside startTrip.")
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

  if (DEBUG_SIMULATE) {
    // Simulate location updates for debugging
    let simIndex = 0;
    watchId = setInterval(async () => {
      if (simIndex >= stops.length) {
        clearInterval(watchId);
        watchId = null;
        return;
      }
      const fakePos = {
        coords: {
          latitude: stops[simIndex].latitude + (Math.random() - 0.5) * 0.001, // slight jitter
          longitude: stops[simIndex].longitude + (Math.random() - 0.5) * 0.001,
        }
      };
      // Call the position handler
      await handlePosition(fakePos, institutionId, routeId);
      simIndex++;
    }, 60000); // Update every 60 seconds
  } else {
    if (!navigator.geolocation) {
      alert("Geolocation not supported.");
      return;
    }

    watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        console.log("Real GPS position:", pos.coords.latitude, pos.coords.longitude);
        await handlePosition(pos, institutionId, routeId);
      },
      (err) => {
        console.error("Geolocation error:", err);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  }
}

async function handlePosition(pos, institutionId, routeId) {
  const { latitude, longitude } = pos.coords;

  console.log("Handling position:", latitude, longitude);
  alert("Adding bus location to Firestore."
    + latitude + ", " + longitude+ ", time" + Timestamp.now());

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
    console.log("Distance to next stop", currentStopIndex, ":", dist, "meters");

    const threshold = 80; // meters
    if (dist < threshold) {
      console.log("Stop passed:", currentStopIndex);
      currentStopIndex += 1;
      await updateDoc(doc(db, "trips", activeTripId), {
        currentStopIndex,
      });
    }
  }
}

async function endTrip() {
  const user = requireAuth();
  await ensureUserRole(user.uid, "driver");

  if (!activeTripId) return;

  const routeId = getCurrentRouteId();

  if (watchId !== null) {
    if (DEBUG_SIMULATE) {
      clearInterval(watchId);
    } else {
      navigator.geolocation.clearWatch(watchId);
    }
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

const provider = new GoogleAuthProvider();

signInBtn.addEventListener("click", async () => {
  console.log("Sign in button clicked");
  try {
    statusText.textContent = "Signing in...";
    console.log("Calling signInWithPopup");
    await signInWithPopup(auth, provider);
    console.log("Sign in successful");
  } catch (error) {
    console.error("Sign-in failed", error);
    statusText.textContent = "Sign-in failed.";
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
    await ensureUserRole(user.uid, "driver");
    setUiForSignedIn(user);
    statusText.textContent = "Status: ready (driver)";
  } else {
    setUiSignedOut();
  }
});

startBtn.addEventListener("click", startTrip);
endBtn.addEventListener("click", endTrip);
setUiSignedOut();
