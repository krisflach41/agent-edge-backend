<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Market Intelligence</title>
<script src="universal-cart.js"></script>
<script src="tracking.js"></script>
<script src="feature-gate.js"></script>

<style>

/* ===== BACKGROUND (PORTAL STYLE) ===== */
body {
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  margin: 0;
  padding: 80px 0;
  background:
    linear-gradient(rgba(255,255,255,0.55), rgba(255,255,255,0.65)),
    url("portal-bg.jpg") center / cover no-repeat fixed;
  color: #0b1f3a;
}

/* ===== PAGE WIDTH ===== */
.page-wrap {
  max-width: 1150px;
  margin: 0 auto;
  padding: 0 24px;
}

/* ===== GLASS CONTAINER ===== */
.gallery-card {
  padding: 60px 50px;
  border-radius: 22px;
  background: rgba(255,255,255,0.58);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.65);
  box-shadow:
    0 20px 55px rgba(0,0,0,0.10),
    0 6px 18px rgba(0,0,0,0.05);
}

/* ===== TITLES ===== */
.section-title {
  font-size: 34px;
  text-align: center;
  margin-bottom: 10px;
}

.section-subtitle {
  text-align: center;
  max-width: 650px;
  margin: 0 auto 50px auto;
  color: #555;
}

/* ===== GRID ===== */
.flyer-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 35px;
}

/* ===== CARD ===== */
.flyer-card {
  text-align: center;
}

.flyer-card img {
  width: 100%;
  height: 220px;
  object-fit: cover;
  border-radius: 10px;
  margin-bottom: 12px;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.flyer-card img:hover {
  transform: scale(1.03);
  box-shadow: 0 10px 28px rgba(0,0,0,0.18);
}

/* ===== ADD BUTTON ===== */
.add-btn {
  margin-top: 8px;
  padding: 6px 12px;
  border-radius: 20px;
  border: 1px solid #0b4ea2;
  background: transparent;
  color: #0b4ea2;
  font-weight: 600;
  cursor: pointer;
}

.add-btn.added {
  background: #0b4ea2;
  color: #fff;
}

/* ===== KIT PANEL ===== */
.kit-panel {
  margin: 50px 0 30px;
  padding: 30px;
  border-radius: 18px;
  background: rgba(255,255,255,0.55);
  border: 1px solid rgba(255,255,255,0.6);
}

#kit-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

#kit-list li {
  background: rgba(255,255,255,0.65);
  border-radius: 12px;
  padding: 10px;
  text-align: center;
  font-size: 13px;
}

.empty {
  text-align: center;
  color: #777;
}

/* ===== INFO ICON ===== */
.info-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #0b4ea2;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  margin-left: 8px;
  cursor: pointer;
  position: relative;
}

.tooltip-box {
  visibility: hidden;
  opacity: 0;
  width: 280px;
  background: rgba(255,255,255,0.97);
  padding: 14px;
  border-radius: 12px;
  box-shadow: 0 14px 30px rgba(0,0,0,0.12);
  font-size: 12px;
  line-height: 1.5;
  position: absolute;
  top: 28px;
  left: 50%;
  transform: translateX(-50%);
  transition: 0.25s ease;
  z-index: 9999;
}

.info-icon:hover .tooltip-box {
  visibility: visible;
  opacity: 1;
  transform: translateX(-50%) translateY(4px);
}

/* ===== BACK TO ADVISORY BUTTON ===== */
.back-btn {
  display: inline-block;
  margin-top: 50px;
  padding: 10px 20px;
  border-radius: 25px;
  background: rgba(255,255,255,0.35);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border: 1px solid rgba(255,255,255,0.6);
  text-decoration: none;
  color: #0b1f3a;
  font-weight: 600;
}

.return-main {
  position: fixed;
  bottom: 20px;
  right: 20px;
  padding: 10px 18px;
  border-radius: 25px;
  background: rgba(255,255,255,0.35);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255,255,255,0.6);
  text-decoration: none;
  color: #0b1f3a;
  font-weight: 600;
}

/* ===== IMAGE LIGHTBOX ===== */
.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.65);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.lightbox.active {
  display: flex;
}

.lightbox-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  overflow: auto;
  padding: 10px;
}

.lightbox-content img {
  max-width: 100%;
  max-height: 100%;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.4);
}

.lightbox-close {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 34px;
  height: 34px;
  background: #ffffff;
  color: #0b1f3a;
  border-radius: 50%;
  font-size: 18px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(0,0,0,0.3);
}

/* ===== CODEPEN PANEL STYLES ===== */
.panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: none;
  z-index: 9998;
}

.panel-overlay.active {
  display: block;
}

.property-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90%;
  max-width: 600px;
  max-height: 85vh;
  overflow-y: auto;
  background: white;
  border-radius: 18px;
  padding: 30px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  display: none;
  z-index: 9999;
}

.property-panel.active {
  display: block;
}

.panel-header {
  margin-bottom: 20px;
}

.panel-title {
  font-size: 24px;
  margin: 0 0 8px 0;
}

.panel-desc {
  color: #666;
  font-size: 14px;
}

.section-label {
  font-weight: 600;
  margin-bottom: 6px;
  font-size: 14px;
}

.property-row {
  background: rgba(11,78,162,0.04);
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 16px;
  position: relative;
}

.remove-prop {
  position: absolute;
  top: 10px;
  right: 15px;
  color: #c0392b;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.property-row input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  margin-bottom: 12px;
  box-sizing: border-box;
}

.field-error {
  display: none;
  color: #c0392b;
  font-size: 13px;
  margin-top: -8px;
  margin-bottom: 10px;
}

.panel-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.panel-actions button {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  background: #0b4ea2;
  color: white;
}

.btn-secondary {
  background: #e0e0e0;
  color: #333;
}

.kit-item {
  background: rgba(11,78,162,0.08);
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 8px;
  font-size: 14px;
}

/* ===== REPORT GUIDE LINK ===== */
.guide-link {
  display: inline-block;
  margin-top: 4px;
  margin-bottom: 4px;
  font-size: 12px;
  color: #6b7c93;
  cursor: pointer;
  transition: color 0.2s;
  text-decoration: none;
  letter-spacing: 0.3px;
}
.guide-link:hover {
  color: #0b4ea2;
}
.guide-link svg {
  width: 13px;
  height: 13px;
  vertical-align: -2px;
  margin-right: 4px;
  opacity: 0.6;
}
.guide-link:hover svg {
  opacity: 1;
}

/* ===== CHEAT SHEET OVERLAY ===== */
.cheatsheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: none;
  z-index: 10001;
  align-items: center;
  justify-content: center;
}
.cheatsheet-overlay.active {
  display: flex;
}
.cheatsheet-card {
  background: #fff;
  border-radius: 18px;
  max-width: 520px;
  width: 90%;
  max-height: 85vh;
  overflow-y: auto;
  padding: 36px 40px 32px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.25);
  position: relative;
}
.cheatsheet-close {
  position: absolute;
  top: 16px;
  right: 18px;
  width: 30px;
  height: 30px;
  background: #f0f0f0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 16px;
  font-weight: 700;
  color: #555;
  transition: background 0.2s;
  border: none;
}
.cheatsheet-close:hover {
  background: #e0e0e0;
}
.cs-report-name {
  font-size: 22px;
  font-weight: 700;
  color: #0b1f3a;
  margin-bottom: 4px;
}
.cs-tagline {
  font-size: 13px;
  color: #8a95a5;
  margin-bottom: 24px;
}
.cs-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #0b4ea2;
  margin-bottom: 6px;
  margin-top: 20px;
}
.cs-section-label:first-of-type {
  margin-top: 0;
}
.cs-text {
  font-size: 14px;
  color: #3a4a5c;
  line-height: 1.65;
  margin-bottom: 0;
}
.cs-bullets {
  list-style: none;
  padding: 0;
  margin: 0;
}
.cs-bullets li {
  font-size: 14px;
  color: #3a4a5c;
  line-height: 1.6;
  padding: 4px 0 4px 20px;
  position: relative;
}
.cs-bullets li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #0b4ea2;
  opacity: 0.25;
}
.cs-handoff {
  margin-top: 20px;
  padding: 16px 18px;
  border-radius: 10px;
  background: rgba(11,78,162,0.05);
  border-left: 3px solid #0b4ea2;
}
.cs-handoff-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #0b4ea2;
  margin-bottom: 6px;
}
.cs-handoff-text {
  font-size: 13px;
  color: #3a4a5c;
  line-height: 1.6;
  font-style: italic;
}

</style>
</head>

<body>

<div class="page-wrap">
<section class="gallery-card">

<h2 class="section-title">Market Intelligence</h2>
<p class="section-subtitle">
Advisor-grade market visuals designed to help Realtors explain trends, pricing dynamics, and timing with clarity and confidence.
</p>

<div class="flyer-grid">

<div class="flyer-card" data-report="bid">
<img src="Bid-Over-Ask.png" alt="Worth the Premium">
<h3>Worth the Premium</h3>
<a class="guide-link" onclick="openGuide('bid')"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 7v4M8 5.5v0"/></svg>Report Guide</a>
<button class="add-btn">Add to My Kit</button>
</div>

<div class="flyer-card" data-report="buyrent">
<img src="Buy-vs-Rent.png" alt="Rent to Wealth">
<h3>Rent to Wealth</h3>
<a class="guide-link" onclick="openGuide('buyrent')"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 7v4M8 5.5v0"/></svg>Report Guide</a>
<button class="add-btn">Add to My Kit</button>
</div>

<div class="flyer-card" data-report="costwaiting">
<img src="Cost-of-Waiting.png" alt="Your Wealth Starts Now">
<h3>Your Wealth Starts Now</h3>
<a class="guide-link" onclick="openGuide('costwaiting')"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 7v4M8 5.5v0"/></svg>Report Guide</a>
<button class="add-btn">Add to My Kit</button>
</div>

<div class="flyer-card" data-report="investment">
<img src="Investment-Property.png" alt="Owner to Investor">
<h3>Owner to Investor</h3>
<a class="guide-link" onclick="openGuide('investment')"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 7v4M8 5.5v0"/></svg>Report Guide</a>
<button class="add-btn">Add to My Kit</button>
</div>

<div class="flyer-card" data-report="amortization">
<img src="Mortgage-Amortization.png" alt="Payoff Accelerator">
<h3>Payoff Accelerator</h3>
<a class="guide-link" onclick="openGuide('amortization')"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 7v4M8 5.5v0"/></svg>Report Guide</a>
<button class="add-btn">Add to My Kit</button>
</div>

<div class="flyer-card" data-report="reportcard">
<img src="Real-Estate-Report-Card.png" alt="Neighborhood Blueprint">
<h3>Neighborhood Blueprint</h3>
<a class="guide-link" onclick="openGuide('reportcard')"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 7v4M8 5.5v0"/></svg>Report Guide</a>
<button class="add-btn">Add to My Kit</button>
</div>

<div class="flyer-card" data-report="appreciation">
<img src="Appreciation.png" alt="Wealth in Motion">
<h3>Wealth in Motion</h3>
<a class="guide-link" onclick="openGuide('appreciation')"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 7v4M8 5.5v0"/></svg>Report Guide</a>
<button class="add-btn">Add to My Kit</button>
</div>

</div>

<!-- Cart Summary Panel -->
<div class="kit-panel" id="cartSummaryPanel" style="display:none;">
<h3>Your Cart</h3>
<div id="kit" style="min-height: 40px;">
</div>
</div>

<div style="text-align:center; margin-top:30px;">
  <a href="advisory-collection.html" class="back-btn">
    ← Back to Advisory Collection
  </a>
</div>

</section>
</div>

<!-- FLOATING CART BUTTON -->
<a href="checkout.html" id="cartBtn" onclick="goToCheckout(event)" style="
  position: fixed;
  top: 20px;
  right: 20px;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: rgba(255,255,255,0.85);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  z-index: 9999;
  transition: 0.25s ease;
  cursor: pointer;
  font-size: 22px;
">
  🛒
  <span id="cartBadge" style="
    position: absolute;
    top: -4px;
    right: -4px;
    background: #c0392b;
    color: white;
    font-size: 12px;
    font-weight: 700;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: none;
    align-items: center;
    justify-content: center;
  "></span>
</a>

<a href="portal.html" class="return-main" style="right: 85px;">Return to Portal</a>

<!-- IMAGE LIGHTBOX -->
<!-- Cheat Sheet Overlay -->
<div class="cheatsheet-overlay" id="cheatsheetOverlay">
  <div class="cheatsheet-card" id="cheatsheetCard"></div>
</div>

<div class="lightbox" id="lightbox">
  <div class="lightbox-content">
    <span class="lightbox-close" id="lightboxClose">×</span>
    <img id="lightboxImg" src="" alt="">
  </div>
</div>

<!-- PROPERTY DETAILS PANEL (from CodePen) -->
<div class="panel-overlay" id="overlay" onclick="closePanel()"></div>
<div class="property-panel" id="panel">
  <div class="panel-header">
    <h2 class="panel-title" id="panelTitle">Report Details</h2>
    <p class="panel-desc" id="panelDesc"></p>
  </div>
  
  <div id="pool"></div>
  <div id="properties"></div>
  
  <div style="text-align: center; margin: 20px 0;">
    <button type="button" onclick="addNewProperty()" style="
      padding: 10px 20px;
      background: transparent;
      border: 2px dashed #0b4ea2;
      color: #0b4ea2;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    ">+ Add Another Property</button>
  </div>
  
  <div class="panel-actions">
    <button type="button" class="btn-secondary" onclick="closePanel()">Cancel</button>
    <button type="button" class="btn-primary" id="kitActionBtn" onclick="addToKit()">Add to My Kit</button>
  </div>
</div>

<script>
/* ===== IMAGE PREVIEW LIGHTBOX ===== */
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxClose = document.getElementById("lightboxClose");

document.querySelectorAll(".flyer-card img").forEach(img => {
  img.addEventListener("click", () => {
    lightboxImg.src = img.src;
    lightbox.classList.add("active");
  });
});

lightboxClose.addEventListener("click", () => {
  lightbox.classList.remove("active");
});

lightbox.addEventListener("click", e => {
  if (e.target === lightbox) {
    lightbox.classList.remove("active");
  }
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    lightbox.classList.remove("active");
  }
});

/* ===== CODEPEN FORM LOGIC - INTEGRATED ===== */

let propertyPool = [];
let reportConfigs = {};
let activeReport = "";
let workingSet = [];
let pendingDeleteIndex = null;
let isEditMode = false;

// Get DOM elements
const kit = document.getElementById("kit");
const panel = document.getElementById("panel");
const overlay = document.getElementById("overlay");
const pool = document.getElementById("pool");
const properties = document.getElementById("properties");
const panelTitle = document.getElementById("panelTitle");
const panelDesc = document.getElementById("panelDesc");

/* ============================
   UNIVERSAL MONEY FORMATTER
============================ */
function formatMoney(inputEl) {
  let raw = (inputEl.value || "").replace(/[^0-9.]/g, "");
  if (!raw) {
    inputEl.value = "";
    return;
  }
  const num = parseFloat(raw);
  if (isNaN(num)) {
    inputEl.value = "";
    return;
  }
  inputEl.value = num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  });
}

/* ============================
   Error helpers
============================ */
function clearRentError() {
  const el = document.getElementById("rentError");
  if (el) el.style.display = "none";
}

function showRentError() {
  const el = document.getElementById("rentError");
  if (el) el.style.display = "block";
}

function clearPurchaseError(i) {
  const el = document.getElementById(`purchaseError-${i}`);
  if (el) el.style.display = "none";
}

function showPurchaseError(i) {
  const el = document.getElementById(`purchaseError-${i}`);
  if (el) el.style.display = "block";
}

/* ============================
   Panel open
============================ */
function openPanel(type, mode = "new") {
  activeReport = type;
  isEditMode = (mode === "edit");

  const btn = document.getElementById("kitActionBtn");
  if (btn) {
    btn.textContent = isEditMode ? "Update My Kit" : "Add to My Kit";
  }

  if (mode === "new") {
    workingSet = [];
  }

  if (pool) pool.innerHTML = "";
  if (properties) properties.innerHTML = "";

  pendingDeleteIndex = null;

  // Set panel title
  panelTitle.innerText =
    type === "bid" ? "Worth the Premium" :
    type === "buyrent" ? "Rent to Wealth" :
    type === "costwaiting" ? "Your Wealth Starts Now" :
    type === "amortization" ? "Payoff Accelerator" :
    type === "appreciation" ? "Wealth in Motion" :
    type === "investment" ? "Owner to Investor" :
    "Neighborhood Blueprint";

  panelDesc.innerText = "";

  renderPool();

  if (mode === "new") {
    addNewProperty();
  } else {
    renderInputs();
  }

  panel.classList.add("active");
  overlay.classList.add("active");
}

function renderPool() {
  if (!propertyPool.length) return;
  pool.innerHTML = `<div class="section-label">Use existing properties?</div>`;
  propertyPool.forEach((p, i) => {
    pool.innerHTML += `
      <label>
        <input type="checkbox" onchange="togglePool(${i}, this.checked)">
        ${p.address}
      </label><br>`;
  });
}

function togglePool(i, checked) {
  if (checked) workingSet.push({ ...propertyPool[i] });
  else workingSet = workingSet.filter(p => p.address !== propertyPool[i].address);
  renderInputs();
}

function addNewProperty() {
  workingSet.push({ address: "", list: "", offer: "", purchase: "", rent: "", loan: "", rate: "" });
  renderInputs();
}

function removeProperty(i) {
  workingSet.splice(i, 1);
  pendingDeleteIndex = null;
  renderInputs();
}

function renderInputs() {
  properties.innerHTML = "";

  workingSet.forEach((p, i) => {
    properties.innerHTML += `
      <div class="property-row">
       <span class="remove-prop" onclick="removeProperty(${i})">Remove</span>

<div class="section-label">Property Address or MLS #</div>

<input
  placeholder="123 Main St or MLS #"
  value="${p.address || ""}"
  oninput="workingSet[${i}].address=this.value"
>

${activeReport === "bid" ? `
  <div class="section-label">List Price</div>
  <input
    placeholder="$0.00"
    value="${p.list || ""}"
    oninput="workingSet[${i}].list=this.value"
    onblur="formatMoney(this)"
  >

  <div class="section-label" style="margin-top:10px;">Offer Price</div>
  <input
    placeholder="$0.00"
    value="${p.offer || ""}"
    oninput="workingSet[${i}].offer=this.value"
    onblur="formatMoney(this)"
  >
` : ""}

${activeReport === "buyrent" ? `
  <div class="section-label">Current Monthly Rent <span style="color:#c0392b;">*</span></div>
  <input
    placeholder="$0.00"
    value="${p.rent || ""}"
    oninput="workingSet[${i}].rent=this.value; clearPurchaseError(${i});"
    onblur="formatMoney(this)"
  >

  <div class="section-label" style="margin-top:10px;">Purchase Price</div>
  <input
    placeholder="$0.00"
    value="${p.purchase || ""}"
    oninput="workingSet[${i}].purchase=this.value; clearPurchaseError(${i});"
    onblur="formatMoney(this)"
  >

  <div id="purchaseError-${i}" class="field-error">
    Current Rent and Purchase Price are required.
  </div>
` : ""}

${activeReport === "costwaiting" ? `
  <div class="section-label">Purchase Price</div>
  <input
    placeholder="$0.00"
    value="${p.purchase || ""}"
    oninput="workingSet[${i}].purchase=this.value; clearPurchaseError(${i});"
    onblur="formatMoney(this)"
  >

  <div id="purchaseError-${i}" class="field-error">
    Purchase Price is required for Cost of Waiting.
  </div>
` : ""}

${activeReport === "amortization" ? `
  <div class="section-label">Loan Amount</div>
  <input
    placeholder="$0.00"
    value="${p.loan || ""}"
    oninput="workingSet[${i}].loan=this.value"
    onblur="formatMoney(this)"
  >

  <div class="section-label">Interest Rate (%)</div>
  <input
    placeholder="e.g. 6.50"
    value="${p.rate || ""}"
    oninput="workingSet[${i}].rate=this.value"
  >
` : ""}

${activeReport === "appreciation" ? `
  <div class="section-label">Purchase Price</div>
  <input
    placeholder="$0.00"
    value="${p.purchase || ""}"
    oninput="workingSet[${i}].purchase=this.value"
    onblur="formatMoney(this)"
  >

  <div class="section-label">Projected Loan Amount</div>
  <input
    placeholder="$0.00"
    value="${p.loan || ""}"
    oninput="workingSet[${i}].loan=this.value"
    onblur="formatMoney(this)"
  >
` : ""}

${activeReport === "investment" ? `
  <div style="
    margin-top: 16px;
    padding: 14px;
    border-radius: 12px;
    background: rgba(11,78,162,0.06);
    font-size: 14px;
    line-height: 1.5;
    color: #0b1f3a;
  ">
    <strong>Owner to Investor — Investment Property Analysis</strong><br><br>
    Investment property analysis involves multiple variables that materially affect results,
    including financing structure, rent assumptions, and holding strategy.
    <br><br>
    To ensure accuracy, this report requires a brief consultation.
  </div>
` : ""}

      </div>`;
  });
}

function addToKit() {
  const valid = workingSet.filter(p => (p.address || "").trim() !== "");

  if (!isEditMode && valid.length === 0) {
    closePanel();
    return;
  }

  // Validation per report type
  if (activeReport === "bid") {
    const missing = valid.some(p => !(p.list || "").trim() || !(p.offer || "").trim());
    if (missing) {
      alert("Worth the Premium requires List Price and Offer Price for each property.");
      return;
    }
  }

  if (activeReport === "buyrent") {
    const missing = valid.some(p => !(p.purchase || "").trim());
    if (missing) {
      alert("Rent to Wealth requires Purchase Price for each property.");
      return;
    }
  }

  if (activeReport === "costwaiting") {
    const missing = valid.some(p => !(p.purchase || "").trim());
    if (missing) {
      alert("Your Wealth Starts Now requires Purchase Price for each property.");
      return;
    }
  }

  if (activeReport === "appreciation") {
    const missing = valid.some(p => !(p.purchase || "").trim() || !(p.loan || "").trim());
    if (missing) {
      alert("Appreciation requires Purchase Price and Projected Loan Amount for each property.");
      return;
    }
  }

  if (activeReport === "amortization") {
    const missing = valid.some(p => !(p.loan || "").trim() || !(p.rate || "").trim());
    if (missing) {
      alert("Payoff Accelerator requires Loan Amount and Interest Rate for each entry.");
      return;
    }
  }

  // Update property pool
  valid.forEach(p => {
    if (!propertyPool.some(x => x.address === p.address)) {
      propertyPool.push({ address: p.address });
    }
  });

  // Save or update - NOW USING UNIVERSAL CART
  if (isEditMode) {
    if (valid.length === 0) {
      universalCart.setAdvisoryReport(activeReport, null);
      delete reportConfigs[activeReport];
    } else {
      universalCart.setAdvisoryReport(activeReport, JSON.parse(JSON.stringify(valid)));
      reportConfigs[activeReport] = JSON.parse(JSON.stringify(valid));
    }
  } else {
    universalCart.setAdvisoryReport(activeReport, JSON.parse(JSON.stringify(valid)));
    reportConfigs[activeReport] = JSON.parse(JSON.stringify(valid));
  }

  // Track activity
  var reportName = universalCart.getReportDisplayName(activeReport);
  trackActivity('Advisory', 'Market Intelligence', 'Added to Cart', reportName + ' - ' + valid.length + ' properties');

  isEditMode = false;
  renderKit();
  closePanel();
  updateCardButtons();
}

function renderKit() {
  var cartPanel = document.getElementById('cartSummaryPanel');
  
  // Sync reportConfigs from universal cart
  reportConfigs = {};
  var cartData = universalCart.cart.advisory;
  Object.keys(cartData).forEach(function(r) {
    reportConfigs[r] = cartData[r];
  });
  
  if (Object.keys(reportConfigs).length === 0) {
    cartPanel.style.display = 'none';
    return;
  }
  
  cartPanel.style.display = 'block';
  kit.innerHTML = "";
  
  Object.keys(reportConfigs).forEach(r => {
    if (!Array.isArray(reportConfigs[r])) return;
    
    const displayName =
      r === "bid" ? "Worth the Premium" :
      r === "buyrent" ? "Rent to Wealth" :
      r === "costwaiting" ? "Your Wealth Starts Now" :
      r === "appreciation" ? "Appreciation" :
      r === "investment" ? "Owner to Investor" :
      r === "amortization" ? "Payoff Accelerator" :
      "Neighborhood Blueprint";
    
    kit.innerHTML += `
      <div class="kit-item">
        ✔ ${displayName} (${reportConfigs[r].length} ${reportConfigs[r].length === 1 ? 'property' : 'properties'})
        <span style="float:right; cursor:pointer; color:#0b4ea2"
          onclick="editReport('${r}')">Edit</span>
        <span style="float:right; cursor:pointer; color:#c0392b; margin-right:16px;"
          onclick="removeReport('${r}')">Remove</span>
      </div>`;
  });
}

function editReport(r) {
  activeReport = r;
  workingSet = JSON.parse(JSON.stringify(reportConfigs[r] || []));
  openPanel(r, "edit");
}

function removeReport(r) {
  universalCart.setAdvisoryReport(r, null);
  delete reportConfigs[r];
  renderKit();
  updateCardButtons();
}

function closePanel() {
  panel.classList.remove("active");
  overlay.classList.remove("active");
  pendingDeleteIndex = null;
}

function updateCardButtons() {
  document.querySelectorAll('.flyer-card').forEach(card => {
    const report = card.dataset.report;
    const btn = card.querySelector('.add-btn');
    
    if (reportConfigs[report] && reportConfigs[report].length > 0) {
      btn.textContent = "Added ✓";
      btn.classList.add("added");
    } else {
      btn.textContent = "Add to My Kit";
      btn.classList.remove("added");
    }
  });
}

function goToCheckout(e) {
  e.preventDefault();
  sessionStorage.setItem('checkoutCart', JSON.stringify(universalCart.cart));
  window.location.href = 'checkout.html';
}

/* ===== WIRE UP CARD BUTTONS TO OPEN PANEL ===== */
document.querySelectorAll('.add-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const card = btn.closest('.flyer-card');
    const report = card.dataset.report;
    
    openPanel(report, "new");
  });
});

// Load existing cart data on page load
renderKit();
updateCardButtons();

/* ===========================
   REPORT GUIDE / CHEAT SHEETS
=========================== */
var guideData = {
  bid: {
    name: 'Worth the Premium',
    tagline: 'Why paying above asking is still a winning investment',
    what: 'Shows your client exactly how quickly the premium they paid over asking price is recovered through home appreciation — with a clear breakeven timeline and 5-year projection.',
    when: 'Your client is nervous about bidding over asking price in a competitive market. They need to see that the extra $10k–$20k is recovered in months, not years.',
    points: [
      '"Based on how homes in this area have historically appreciated, the premium you\'re paying is recovered in less than a year."',
      '"After that breakeven point, every dollar of appreciation is pure upside — wealth you wouldn\'t have if you walked away from this home."',
      '"Waiting for a deal that doesn\'t require bidding over asking often means waiting while prices climb past you."',
      '"This report shows the math. It\'s not a guess — it\'s based on actual FHFA data for this specific area."'
    ],
    handoff: '"Let me connect you with my lender — she\'ll run the exact numbers for your property so you can see the breakeven timeline before you make your offer."'
  },
  buyrent: {
    name: 'Rent to Wealth',
    tagline: 'Why buying builds wealth that renting never will',
    what: 'A side-by-side comparison showing how much wealth your client builds as a homeowner versus how much they lose as a renter over 7 years — including appreciation, equity buildup, and tax benefits.',
    when: 'Your client is on the fence about buying versus continuing to rent. They think renting is "cheaper" but haven\'t seen the full wealth picture.',
    points: [
      '"Every rent check you write builds someone else\'s wealth. Every mortgage payment builds yours."',
      '"Even with today\'s rates, homeowners in this area come out over $200,000 ahead of renters over 7 years."',
      '"Your rent goes up every year with nothing to show for it. A fixed mortgage stays the same while your home value grows."',
      '"This report breaks it down year by year so you can see exactly when buying starts winning — and it\'s sooner than you think."'
    ],
    handoff: '"My lender can run this report with your specific numbers — your current rent, the homes you\'re looking at, and today\'s rates. Want me to set that up?"'
  },
  costwaiting: {
    name: 'Your Wealth Starts Now',
    tagline: 'What waiting really costs your financial future',
    what: 'Calculates the real dollar cost of waiting to buy — combining lost appreciation, wasted rent payments, and equity not being built. Shows that "waiting for better rates" often costs more than the rate savings.',
    when: 'Your client wants to wait for rates to drop, or thinks "now isn\'t the right time." They need to see what sitting on the sidelines actually costs them.',
    points: [
      '"I hear you on wanting to wait for better rates. But let me show you what that wait actually costs."',
      '"Every month you wait, home prices in this area are climbing. That\'s money out of your pocket before you even start."',
      '"You\'re paying rent right now that could be building equity. That\'s real wealth walking out the door every month."',
      '"The best time to buy was yesterday. The second best time is today. This report shows you exactly why."'
    ],
    handoff: '"Let me have my lender run your specific numbers — what you\'re paying in rent, what you\'re looking to buy — so you can see exactly what waiting is costing you each month."'
  },
  investment: {
    name: 'Owner to Investor',
    tagline: 'Increasing your financial freedom',
    what: 'A comprehensive investment property analysis showing monthly cash flow, 10-year projections, exit analysis, and total return on capital. This is a decision-grade tool — not just numbers on a screen.',
    when: 'Your client is considering purchasing an investment property and needs to understand the full financial picture before committing.',
    points: [
      '"This report shows you exactly what this property does for you financially — cash flow from day one, how your equity builds over 10 years, and what your total return looks like if you sell."',
      '"It accounts for everything: vacancy, maintenance, tax increases, appreciation, and what your tenants pay down on your mortgage."',
      '"The numbers tell the story. You\'ll see exactly when income surpasses expenses and how the gap widens every year."',
      '"This isn\'t a spreadsheet — it\'s an investment thesis backed by real market data."'
    ],
    handoff: '"This one requires a deeper conversation given the complexity of investment property analysis. Let me connect you directly with my lender for a personalized consultation — she\'ll build the full analysis for your specific property."'
  },
  amortization: {
    name: 'Payoff Accelerator',
    tagline: 'See how a cup of coffee can shorten your mortgage',
    what: 'Shows your client how small extra payments — even $100–$200/month — can save tens of thousands in interest and cut years off their mortgage. Visual comparison of standard vs. accelerated payoff.',
    when: 'Your client has just closed or is closing soon. They want to feel empowered about their mortgage, not trapped by it. Also great for refinance conversations.',
    points: [
      '"Did you know that adding just $125 a month to your payment could save you over $100,000 in interest?"',
      '"That\'s less than the price of a cup of coffee a day — and it could cut 6+ years off your mortgage."',
      '"This report shows you side by side: what your mortgage looks like on autopilot versus what it looks like with a small extra payment strategy."',
      '"You don\'t need to refinance or make big changes. Small, consistent extra payments have a massive compound effect."'
    ],
    handoff: '"My lender will build this report with your exact loan terms so you can see the impact tailored to your specific mortgage. Want me to set that up?"'
  },
  reportcard: {
    name: 'Neighborhood Blueprint',
    tagline: 'Premium market analysis for any US zip code',
    what: 'A comprehensive market intelligence report for any zip code — covering appreciation trends, median home values, population data, economic indicators, and how the area compares to state and national averages.',
    when: 'Your client is exploring neighborhoods, relocating, or just wants to understand the market dynamics of an area before making a decision. Also great as a value-add for listing presentations.',
    points: [
      '"Before you make a decision, let me show you what the data says about this neighborhood."',
      '"This report pulls from federal housing data to show you how home values have performed historically — 1-year, 5-year, and long-term trends."',
      '"You\'ll see how this zip code compares to the state and national averages, so you know if you\'re buying into a strong or weak market."',
      '"It\'s the kind of market intelligence that helps you advise your clients with real confidence."'
    ],
    handoff: '"My lender can generate this for any zip code your client is considering. Just send me the addresses and she\'ll have the reports ready within 24 hours."'
  },
  appreciation: {
    name: 'Wealth in Motion',
    tagline: 'Your home is already building your future',
    what: 'A 10-year appreciation projection showing how your client\'s home value is expected to grow based on FHFA data — turning the abstract idea of "building equity" into concrete, year-by-year dollar amounts.',
    when: 'Your client needs reassurance that their purchase is a good long-term decision. Perfect for post-close follow-up or for buyers who are nervous about today\'s prices.',
    points: [
      '"Your home isn\'t just where you live — it\'s your largest investment, and it\'s already working for you."',
      '"Based on historical data for your area, your home could appreciate over $130,000 in the next 10 years."',
      '"That\'s wealth that builds silently while you sleep, eat dinner, and live your life."',
      '"This report shows you year by year exactly how your home value is projected to grow."'
    ],
    handoff: '"My lender will run this with your client\'s actual purchase price and local appreciation data. It makes a great closing gift or 1-year homeowner anniversary touchpoint."'
  }
};

function openGuide(reportKey) {
  var d = guideData[reportKey];
  if (!d) return;
  
  // Get admin/lender name for personalization
  var lenderName = sessionStorage.getItem('agentEdgeLenderName') || '';
  var lenderRef = lenderName ? 'my lender ' + lenderName : 'my lender';
  var firstName = lenderName ? lenderName.split(' ')[0] : '';
  var pronounll = firstName ? firstName + ' will' : 'they\'ll';
  
  var pointsHTML = '';
  d.points.forEach(function(p) {
    pointsHTML += '<li>' + p.replace(/my lender/g, lenderRef).replace(/she'll/g, pronounll) + '</li>';
  });
  
  // Inject lender name into handoff
  var handoff = d.handoff.replace(/my lender/g, lenderRef).replace(/she'll/g, pronounll);
  
  var card = document.getElementById('cheatsheetCard');
  card.innerHTML = '<button class="cheatsheet-close" onclick="closeGuide()">&times;</button>' +
    '<div class="cs-report-name">' + d.name + '</div>' +
    '<div class="cs-tagline">' + d.tagline + '</div>' +
    '<div class="cs-section-label">What This Report Does</div>' +
    '<p class="cs-text">' + d.what + '</p>' +
    '<div class="cs-section-label">When To Use It</div>' +
    '<p class="cs-text">' + d.when + '</p>' +
    '<div class="cs-section-label">Key Talking Points</div>' +
    '<ul class="cs-bullets">' + pointsHTML + '</ul>' +
    '<div class="cs-handoff">' +
    '<div class="cs-handoff-label">The Handoff</div>' +
    '<div class="cs-handoff-text">' + handoff + '</div>' +
    '</div>';
  
  document.getElementById('cheatsheetOverlay').classList.add('active');
}

function closeGuide() {
  document.getElementById('cheatsheetOverlay').classList.remove('active');
}

document.getElementById('cheatsheetOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeGuide();
});

/* ===========================
   COMPREHENSIVE TRACKING
=========================== */
(function() {
  var userEmail = sessionStorage.getItem('agentEdgeUser');
  var userName = sessionStorage.getItem('agentEdgeName') || 'User';
  var pageLoadTime = new Date();
  
  if (!userEmail) return;
  
  function trackEvent(action, tool, details) {
    fetch('https://agent-edge-backend.vercel.app/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: userName,
        userEmail: userEmail,
        collection: 'Marketing Intelligence',
        tool: tool || 'Market Intelligence',
        action: action,
        details: details || ''
      })
    }).catch(function(err) {
      console.error('Tracking error:', err);
    });
  }

  // 1. TRACK PAGE VISIT
  trackEvent('page_visit', 'Marketing Intelligence', 'Viewed Market Intelligence collection');

  // 2. TRACK TIME SPENT
  window.addEventListener('beforeunload', function() {
    var timeSpent = Math.round((new Date() - pageLoadTime) / 1000);
    trackEvent('time_spent', 'Marketing Intelligence', timeSpent + ' seconds');
  });

  // 3. TRACK REPORT ADDITIONS (when they add reports to kit)
  var originalOpenPanel = window.openPanel;
  window.openPanel = function(report, mode) {
    trackEvent('report_interaction', 'Report Panel', 'Opened: ' + report);
    return originalOpenPanel(report, mode);
  };

  // 4. TRACK REPORT SAVES (when they save a report configuration)
  var originalSaveConfig = window.saveConfig;
  window.saveConfig = function() {
    var report = document.getElementById('panelTitle').textContent.replace('Configure ', '');
    trackEvent('report_added', 'Report Configuration', 'Configured: ' + report);
    return originalSaveConfig();
  };

  // 5. TRACK DOWNLOADS (PDFs, images, etc.)
  document.querySelectorAll('a[download], a[href$=".pdf"], a[href$=".jpg"], a[href$=".png"]').forEach(function(link) {
    link.addEventListener('click', function() {
      var fileName = this.getAttribute('download') || this.getAttribute('href').split('/').pop();
      trackEvent('download', 'Marketing Material', 'Downloaded: ' + fileName);
    });
  });

  // 6. TRACK CHECKOUT NAVIGATION
  var originalGoToCheckout = window.goToCheckout;
  window.goToCheckout = function(e) {
    var itemCount = Object.keys(universalCart.cart.advisory || {}).length;
    trackEvent('checkout_click', 'Checkout', 'Proceeding to checkout with ' + itemCount + ' items');
    return originalGoToCheckout(e);
  };

})();

</script>

</body>
</html>
