// Account page: sign in and see the current Wedzy plan (GET /v1/entitlement).
import { auth, api, esc, longDate, PLAN_NAMES, renderSignIn, userBadge, onAuthStateChanged, signOut } from "./auth.js";

const view = document.getElementById("account-view");
const DAY = 24 * 60 * 60 * 1000;

function signedOutView() {
  renderSignIn(view, { title: "Sign in to your account" });
}

function loadingView(user) {
  view.innerHTML = `<h2 id="pay-title">Your plan</h2>
    ${userBadge(user)}
    <p class="dlg-sub">Checking your plan…</p>`;
}

function planView(user, ent) {
  const paid = ent.plan !== "free" && ent.expiresAt;
  const daysLeft = paid ? Math.max(0, Math.ceil((new Date(ent.expiresAt) - Date.now()) / DAY)) : 0;
  const perks = [
    `${esc(ent.voiceLimit)} voice commands a month`,
    ent.adFree ? "Ad-free" : "Shows ads",
    ...(ent.family ? ["Plan together with family"] : []),
  ];
  view.innerHTML = `
    <h2 id="pay-title">Your plan</h2>
    ${userBadge(user)}
    <div class="plan-status ${paid ? "active" : ""}">
      <span class="plan-label">Current plan</span>
      <b class="plan-name">${esc(PLAN_NAMES[ent.plan] ?? ent.plan)}</b>
      <span class="plan-until">${
        paid
          ? `Active until ${esc(longDate(ent.expiresAt))} · ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`
          : "Free forever. Upgrade any time."
      }</span>
      <ul>${perks.map((p) => `<li>${p}</li>`).join("")}</ul>
    </div>
    <a class="btn btn-primary" href="/pricing/">${paid ? "Extend or upgrade" : "See plans"}</a>
    <p class="dlg-foot">Your plan works in the Wedzy app on Android and iPhone when you sign in with this account.
      <button class="link" id="sign-out">Sign out</button></p>`;
  view.querySelector("#sign-out").onclick = () => signOut(auth);
}

function errorView(user, message) {
  view.innerHTML = `<h2 id="pay-title">Your plan</h2>
    ${userBadge(user)}
    <p class="dlg-err" role="alert">Couldn't load your plan. ${esc(message)}</p>
    <button class="btn btn-dark" id="retry">Try again</button>
    <p class="dlg-foot"><button class="link" id="sign-out">Sign out</button></p>`;
  view.querySelector("#retry").onclick = () => load(user);
  view.querySelector("#sign-out").onclick = () => signOut(auth);
}

async function load(user) {
  loadingView(user);
  try {
    const ent = await api("/v1/entitlement");
    if (auth.currentUser === user) planView(user, ent);
  } catch (e) {
    if (auth.currentUser === user) errorView(user, e.message);
  }
}

onAuthStateChanged(auth, (user) => (user ? load(user) : signedOutView()));
