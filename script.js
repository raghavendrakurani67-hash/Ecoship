/* EcoShip demo application
   Beginner note: this is a frontend-only demo. Data is stored in this browser.
   Matching, road distances and carbon figures are illustrative, not live bookings.
*/
"use strict";

const STORAGE_KEY = "ecoship-crowdshipping-v1";

const CITY_DATA = {
  "Delhi":       { lat: 28.6139, lon: 77.2090 },
  "Dehradun":    { lat: 30.3165, lon: 78.0322 },
  "Agra":        { lat: 27.1767, lon: 78.0081 },
  "Jaipur":      { lat: 26.9124, lon: 75.7873 },
  "Chandigarh":  { lat: 30.7333, lon: 76.7794 },
  "Lucknow":     { lat: 26.8467, lon: 80.9462 },
  "Haridwar":    { lat: 29.9457, lon: 78.1642 },
  "Meerut":      { lat: 28.9845, lon: 77.7064 },
  "Gurugram":    { lat: 28.4595, lon: 77.0266 },
  "Noida":       { lat: 28.5355, lon: 77.3910 },
  "Rishikesh":   { lat: 30.0869, lon: 78.2676 },
  "Kanpur":      { lat: 26.4499, lon: 80.3319 }
};

const DEFAULT_DRIVERS = [
  { id: "DRV-101", name: "Aarav Sharma", initials: "AS", from: "Delhi", to: "Dehradun", capacity: 8, used: 2, vehicle: "Hatchback", departure: "09:30 AM", color: "#4789cf" },
  { id: "DRV-102", name: "Priya Verma", initials: "PV", from: "Delhi", to: "Agra", capacity: 12, used: 3, vehicle: "Sedan", departure: "10:15 AM", color: "#d99a3a" },
  { id: "DRV-103", name: "Kabir Singh", initials: "KS", from: "Jaipur", to: "Delhi", capacity: 10, used: 1, vehicle: "SUV", departure: "11:00 AM", color: "#8b73c8" },
  { id: "DRV-104", name: "Meera Joshi", initials: "MJ", from: "Delhi", to: "Chandigarh", capacity: 15, used: 5, vehicle: "SUV", departure: "12:30 PM", color: "#27946c" },
  { id: "DRV-105", name: "Rohan Gupta", initials: "RG", from: "Agra", to: "Lucknow", capacity: 10, used: 2, vehicle: "Sedan", departure: "01:00 PM", color: "#cc7770" },
  { id: "DRV-106", name: "Ananya Rao", initials: "AR", from: "Delhi", to: "Haridwar", capacity: 7, used: 1, vehicle: "Hatchback", departure: "02:00 PM", color: "#4d9ba2" }
];

const INITIAL_PARCELS = [
  { id: "PAR-1001", pickup: "Delhi", destination: "Dehradun", weight: 1.5, deadline: "Flexible", note: "Books", status: "Matched", driverId: "DRV-101", carbon: 2.8, createdAt: Date.now() - 300000 },
  { id: "PAR-1002", pickup: "Delhi", destination: "Agra", weight: 3, deadline: "Standard", note: "Small box", status: "Matched", driverId: "DRV-102", carbon: 2.1, createdAt: Date.now() - 200000 },
  { id: "PAR-1003", pickup: "Jaipur", destination: "Delhi", weight: 2, deadline: "Flexible", note: "Clothing", status: "Matched", driverId: "DRV-103", carbon: 1.9, createdAt: Date.now() - 100000 },
  { id: "PAR-1004", pickup: "Delhi", destination: "Chandigarh", weight: 1, deadline: "Urgent", note: "Documents", status: "Pending", driverId: null, carbon: 0, createdAt: Date.now() }
];

let drivers = clone(DEFAULT_DRIVERS);
let parcels = loadParcels();
let map = null;
let routeLayers = [];
let markerLayers = [];
let selectedMatchIds = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadParcels() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (error) {
    console.warn("Browser storage unavailable; using demo data.", error);
  }
  return clone(INITIAL_PARCELS);
}

function saveParcels() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parcels));
  } catch (error) {
    showToast("Browser storage is unavailable. Changes may not persist.");
  }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function getDriver(driverId) {
  return drivers.find(driver => driver.id === driverId) || null;
}

function roadDistance(from, to) {
  const a = CITY_DATA[from];
  const b = CITY_DATA[to];
  if (!a || !b) return null;
  const rad = degrees => degrees * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const straightLine = 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  // A rough multiplier approximates road distance. This is not routing data.
  return Math.round(straightLine * 1.25);
}

function isKnownCity(city) {
  return Object.keys(CITY_DATA).find(name => name.toLowerCase() === city.trim().toLowerCase()) || null;
}

function estimateCarbon(pickup, destination) {
  const distance = roadDistance(pickup, destination);
  if (!distance) return 0;
  // Illustrative estimate: 0.18 kg/km dedicated delivery, 0.035 kg/km marginal crowdshipping.
  // This is a simple model, not a verified lifecycle emissions calculation.
  return Math.max(0, (distance * (0.18 - 0.035) * 0.65));
}

function getMatches(pickup, destination, weight) {
  return drivers.map(driver => {
    const remaining = driver.capacity - driver.used;
    const sameDirection = driver.from === pickup && driver.to === destination;
    const capacityOK = remaining >= weight;
    const fromKnown = CITY_DATA[driver.from];
    const pickupKnown = CITY_DATA[pickup];
    const destKnown = CITY_DATA[destination];
    const destinationDistance = roadDistance(pickup, destination);
    let routeScore = sameDirection ? 100 : 0;

    // Demo heuristic: exact endpoints score highest. A shared origin and a
    // driver destination geographically near the requested destination is partial.
    if (!sameDirection && driver.from === pickup && fromKnown && pickupKnown && destKnown) {
      const toDriverEnd = roadDistance(driver.to, destination);
      if (toDriverEnd !== null && destinationDistance !== null && toDriverEnd <= Math.max(45, destinationDistance * 0.35)) {
        routeScore = 75;
      }
    }
    if (routeScore > 0 && !capacityOK) routeScore = 0;
    return { ...driver, remaining, sameDirection, capacityOK, score: routeScore };
  }).filter(driver => driver.score > 0)
    .sort((a, b) => b.score - a.score || (a.remaining - b.remaining));
}

function initMap() {
  if (typeof L === "undefined") {
    document.getElementById("map").innerHTML =
      '<div class="p-4 text-center text-secondary">The map library could not load. Check your internet connection and refresh.</div>';
    return;
  }
  map = L.map("map", { scrollWheelZoom: false }).setView([29.1, 78.1], 7);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'
  }).addTo(map);
  renderMap();
}

function clearMapLayers() {
  [...routeLayers, ...markerLayers].forEach(layer => {
    if (map && map.hasLayer(layer)) map.removeLayer(layer);
  });
  routeLayers = [];
  markerLayers = [];
}

function renderMap(highlightDriverIds = []) {
  if (!map) return;
  clearMapLayers();
  const points = [];

  drivers.forEach(driver => {
    const from = CITY_DATA[driver.from];
    const to = CITY_DATA[driver.to];
    if (!from || !to) return;
    const isHighlighted = highlightDriverIds.includes(driver.id);
    const line = L.polyline([[from.lat, from.lon], [to.lat, to.lon]], {
      color: isHighlighted ? "#208450" : driver.color,
      weight: isHighlighted ? 5 : 3,
      opacity: isHighlighted ? 0.95 : 0.52,
      dashArray: isHighlighted ? null : "7 6"
    }).addTo(map);
    line.bindPopup(`<strong>${escapeHTML(driver.name)}</strong><br>${escapeHTML(driver.from)} → ${escapeHTML(driver.to)}<br>Available capacity: ${driver.capacity - driver.used} kg`);
    routeLayers.push(line);
    points.push([from.lat, from.lon], [to.lat, to.lon]);

    const start = L.circleMarker([from.lat, from.lon], {
      radius: isHighlighted ? 6 : 4, color: "#fff", weight: 2,
      fillColor: isHighlighted ? "#208450" : driver.color, fillOpacity: 1
    }).addTo(map).bindPopup(`<strong>${escapeHTML(driver.from)}</strong><br>Driver: ${escapeHTML(driver.name)}`);
    markerLayers.push(start);
  });

  // Add markers for the parcel journeys currently visible in the table.
  parcels.filter(parcel => CITY_DATA[parcel.pickup] && CITY_DATA[parcel.destination])
    .slice(0, 12).forEach(parcel => {
      const point = CITY_DATA[parcel.pickup];
      const marker = L.circleMarker([point.lat, point.lon], {
        radius: 5, color: "#fff", weight: 2, fillColor: "#e3a13d", fillOpacity: 1
      }).addTo(map).bindPopup(`<strong>${escapeHTML(parcel.id)}</strong><br>Pickup: ${escapeHTML(parcel.pickup)}<br>Destination: ${escapeHTML(parcel.destination)}`);
      markerLayers.push(marker);
    });

  if (points.length) map.fitBounds(points, { padding: [20, 20], maxZoom: 7 });
}

function renderDashboard() {
  const matched = parcels.filter(parcel => parcel.status === "Matched");
  const carbon = matched.reduce((sum, parcel) => sum + (Number(parcel.carbon) || 0), 0);
  const matchRate = parcels.length ? Math.round(matched.length / parcels.length * 100) : 0;

  document.getElementById("statParcels").textContent = parcels.length;
  document.getElementById("statDrivers").textContent = drivers.length;
  document.getElementById("statMatched").textContent = matched.length;
  document.getElementById("statCarbon").textContent = carbon.toFixed(1);
  document.getElementById("impactCarbon").textContent = carbon.toFixed(1);
  document.getElementById("navParcelCount").textContent = parcels.length;
  document.getElementById("matchRate").textContent = `${matchRate}%`;
  document.getElementById("matchRateBar").style.width = `${matchRate}%`;
  document.getElementById("ecoProgress").style.width = `${Math.min(matchRate, 100)}%`;
  document.getElementById("ecoProgressLabel").textContent =
    parcels.length ? `${matched.length} of ${parcels.length} parcels matched` : "Register a parcel to get started";

  renderParcels();
  renderDrivers();
  renderMap();
}

function statusClass(status) {
  if (status === "Matched") return "status-matched";
  if (status === "Pending") return "status-pending";
  return "status-no-match";
}

function renderParcels() {
  const query = document.getElementById("parcelSearch").value.trim().toLowerCase();
  const filter = document.getElementById("statusFilter").value;
  const visible = parcels.filter(parcel => {
    const driver = getDriver(parcel.driverId);
    const searchable = [parcel.id, parcel.pickup, parcel.destination, parcel.note, driver?.name || ""].join(" ").toLowerCase();
    return searchable.includes(query) && (filter === "All" || parcel.status === filter);
  }).sort((a, b) => b.createdAt - a.createdAt);

  const body = document.getElementById("parcelTableBody");
  body.innerHTML = visible.map(parcel => {
    const driver = getDriver(parcel.driverId);
    const driverMarkup = driver
      ? `<div class="driver-cell"><span class="driver-mini">${escapeHTML(driver.initials)}</span><span><strong>${escapeHTML(driver.name)}</strong><small>${escapeHTML(driver.vehicle)}</small></span></div>`
      : `<span style="color:#9aa59d">Awaiting match</span>`;
    return `<tr>
      <td class="parcel-id">${escapeHTML(parcel.id)}</td>
      <td><div class="journey-cell"><strong>${escapeHTML(parcel.pickup)} → ${escapeHTML(parcel.destination)}</strong><small>${escapeHTML(parcel.note || "General parcel")}</small></div></td>
      <td>${Number(parcel.weight).toFixed(1)} kg</td>
      <td>${driverMarkup}</td>
      <td><span class="status ${statusClass(parcel.status)}">${escapeHTML(parcel.status)}</span></td>
      <td class="carbon-cell">${parcel.carbon > 0 ? `${Number(parcel.carbon).toFixed(1)} kg` : "—"}</td>
      <td><button class="row-menu" data-parcel-action="${escapeHTML(parcel.id)}" title="Parcel actions" aria-label="Delete parcel ${escapeHTML(parcel.id)}">⋯</button></td>
    </tr>`;
  }).join("");

  document.getElementById("emptyState").hidden = visible.length > 0;
  document.getElementById("tableCount").textContent = `Showing ${visible.length} of ${parcels.length} parcel${parcels.length === 1 ? "" : "s"}`;
}

function renderDrivers() {
  const list = document.getElementById("driverList");
  list.innerHTML = drivers.slice(0, 5).map(driver => {
    const available = Math.max(0, driver.capacity - driver.used);
    return `<div class="driver-item">
      <div class="driver-avatar">${escapeHTML(driver.initials)}</div>
      <div class="driver-info"><strong>${escapeHTML(driver.name)}</strong><small>${escapeHTML(driver.from)} → ${escapeHTML(driver.to)} · ${escapeHTML(driver.vehicle)}</small></div>
      <div class="capacity"><strong>${available} kg free</strong><small>of ${driver.capacity} kg</small></div>
    </div>`;
  }).join("");
}

function makeParcelId() {
  const numbers = parcels.map(parcel => Number(String(parcel.id).replace(/\D/g, "")) || 1000);
  return `PAR-${Math.max(1000, ...numbers) + 1}`;
}

function showToast(message) {
  const element = document.getElementById("appToast");
  document.getElementById("toastMessage").textContent = message;
  if (window.bootstrap && bootstrap.Toast) bootstrap.Toast.getOrCreateInstance(element, { delay: 2800 }).show();
  else window.alert(message);
}

function displayMatches(parcel, matches) {
  const container = document.getElementById("matchResults");
  if (!matches.length) {
    container.innerHTML = `<div class="no-match"><strong>No suitable sample driver found.</strong><br>Try a different city pair or lighter parcel. You can still register this parcel as pending.</div>`;
    return;
  }
  container.innerHTML = `<div style="font-size:10px;color:#63776a;font-weight:700;margin-bottom:5px">TOP ${Math.min(matches.length, 3)} MATCH${matches.length === 1 ? "" : "ES"} FOUND</div>` +
    matches.slice(0, 3).map(driver => `<div class="match-result-card">
      <div class="match-result-top"><strong>${escapeHTML(driver.name)}</strong><span class="match-score">${driver.score === 100 ? "Exact route" : "Nearby route"}</span></div>
      <p>${escapeHTML(driver.from)} → ${escapeHTML(driver.to)} · ${escapeHTML(driver.vehicle)}<br>${driver.remaining.toFixed(1)} kg capacity available · Departs ${escapeHTML(driver.departure)}</p>
      <button type="button" class="text-button choose-match" data-driver-id="${escapeHTML(driver.id)}" data-parcel-id="${escapeHTML(parcel.id)}">Select this driver →</button>
    </div>`).join("");
}

function validateParcelForm(formData) {
  const pickupRaw = String(formData.get("pickup") || "").trim();
  const destinationRaw = String(formData.get("destination") || "").trim();
  const pickup = isKnownCity(pickupRaw);
  const destination = isKnownCity(destinationRaw);
  const weight = Number(formData.get("weight"));
  if (!pickup || !destination) return { error: "Please select a supported city from the suggestions. This demo includes 12 sample cities." };
  if (pickup === destination) return { error: "Pickup and destination must be different cities." };
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) return { error: "Enter a parcel weight greater than 0 and no more than 100 kg." };
  return { pickup, destination, weight };
}

document.getElementById("parcelForm").addEventListener("submit", event => {
  event.preventDefault();
  const error = document.getElementById("formError");
  error.hidden = true;
  const data = new FormData(event.currentTarget);
  const validated = validateParcelForm(data);
  if (validated.error) {
    error.textContent = validated.error;
    error.hidden = false;
    return;
  }

  const { pickup, destination, weight } = validated;
  const matches = getMatches(pickup, destination, weight);
  const parcel = {
    id: makeParcelId(),
    pickup,
    destination,
    weight,
    deadline: String(data.get("deadline") || "Flexible"),
    note: String(data.get("parcelNote") || "").trim() || "General parcel",
    status: "Pending",
    driverId: null,
    carbon: 0,
    createdAt: Date.now()
  };
  parcels.push(parcel);
  saveParcels();
  renderDashboard();
  displayMatches(parcel, matches);
  renderMap(matches.map(match => match.id));
  if (map && CITY_DATA[pickup] && CITY_DATA[destination]) {
    map.fitBounds([[CITY_DATA[pickup].lat, CITY_DATA[pickup].lon], [CITY_DATA[destination].lat, CITY_DATA[destination].lon]], { padding: [35, 35], maxZoom: 8 });
  }
  document.getElementById("matchResults").scrollIntoView({ behavior: "smooth", block: "nearest" });
  showToast(matches.length ? "Parcel registered. Review the suggested drivers below." : "Parcel registered as pending.");
});

document.getElementById("matchResults").addEventListener("click", event => {
  const button = event.target.closest(".choose-match");
  if (!button) return;
  const parcel = parcels.find(item => item.id === button.dataset.parcelId);
  const driver = getDriver(button.dataset.driverId);
  if (!parcel || !driver) return;
  const available = driver.capacity - driver.used;
  if (available < parcel.weight) {
    showToast("This driver no longer has enough capacity.");
    return;
  }
  if (parcel.status === "Matched") {
    showToast("This parcel already has a match.");
    return;
  }
  driver.used += parcel.weight;
  parcel.driverId = driver.id;
  parcel.status = "Matched";
  parcel.carbon = estimateCarbon(parcel.pickup, parcel.destination);
  saveParcels();
  renderDashboard();
  document.getElementById("matchResults").innerHTML = `<div class="match-result-card"><div class="match-result-top"><strong>✓ Driver selected</strong><span class="match-score">Demo match</span></div><p>${escapeHTML(driver.name)} has been assigned to ${escapeHTML(parcel.id)}. This is a local prototype action, not a real delivery booking.</p></div>`;
  showToast(`Demo match saved for ${parcel.id}.`);
});

document.getElementById("parcelTableBody").addEventListener("click", event => {
  const button = event.target.closest("[data-parcel-action]");
  if (!button) return;
  const id = button.dataset.parcelAction;
  if (!window.confirm(`Delete ${id} from this browser's demo data?`)) return;
  const parcel = parcels.find(item => item.id === id);
  if (parcel && parcel.driverId) {
    const driver = getDriver(parcel.driverId);
    if (driver) driver.used = Math.max(0, driver.used - Number(parcel.weight || 0));
  }
  parcels = parcels.filter(item => item.id !== id);
  saveParcels();
  renderDashboard();
  showToast(`${id} deleted.`);
});

document.getElementById("parcelSearch").addEventListener("input", renderParcels);
document.getElementById("statusFilter").addEventListener("change", renderParcels);
document.getElementById("clearSearch").addEventListener("click", () => {
  document.getElementById("parcelSearch").value = "";
  document.getElementById("statusFilter").value = "All";
  renderParcels();
});
document.getElementById("fitMap").addEventListener("click", () => {
  if (!map) return;
  const points = [];
  drivers.forEach(driver => [driver.from, driver.to].forEach(city => {
    if (CITY_DATA[city]) points.push([CITY_DATA[city].lat, CITY_DATA[city].lon]);
  }));
  if (points.length) map.fitBounds(points, { padding: [25, 25], maxZoom: 7 });
});
document.getElementById("newParcelTop").addEventListener("click", () => {
  document.getElementById("pickup").focus();
  document.getElementById("matching").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.getElementById("mobileMenu").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});
document.querySelectorAll(".side-nav .nav-link").forEach(link => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".side-nav .nav-link").forEach(item => item.classList.remove("active"));
    link.classList.add("active");
    document.getElementById("sidebar").classList.remove("open");
  });
});
document.getElementById("resetDemo").addEventListener("click", () => {
  if (!window.confirm("Reset all parcel data to the original sample demo?")) return;
  parcels = clone(INITIAL_PARCELS);
  drivers = clone(DEFAULT_DRIVERS);
  saveParcels();
  document.getElementById("matchResults").innerHTML = "";
  document.getElementById("parcelForm").reset();
  document.getElementById("weight").value = "2";
  renderDashboard();
  showToast("Demo data reset.");
});

// Start the app. The dashboard remains usable if the map CDN is unavailable.
initMap();
renderDashboard();
