// Shared by the pricing and account pages: sign in with the same Firebase account as the app, and call the Worker
// (CONTRACT.md § Payments and plans in Wedzy-backend).
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

export { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

const API = "https://wedzy-voice.ajithprasadpv.workers.dev";
export const PLAN_NAMES = { pass: "Wedding Pass", plus: "Wedding Pass Plus", keepsake: "Keepsake", free: "Free" };

const app = initializeApp({
  apiKey: "AIzaSyD_R8c9IChtVuaQjJZBu0OUWQCs1gtBrk4",
  authDomain: "wedzy-13ad8.firebaseapp.com",
  projectId: "wedzy-13ad8",
});
export const auth = getAuth(app);

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const longDate = (iso) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

export async function api(path, body) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(API + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Something went wrong. Please try again.");
  return data;
}

/** Renders the sign-in form into `el`. onAuthStateChanged fires when it succeeds. */
export function renderSignIn(el, { title = "Sign in to continue", message = "" } = {}) {
  el.innerHTML = `
    <h2 id="pay-title">${esc(title)}</h2>
    <p class="dlg-sub">Use the same account as in the Wedzy app, so your plan unlocks there too.</p>
    <button class="btn btn-google" id="google" autofocus><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" width="18" height="18"/>Continue with Google</button>
    <div class="dlg-or"><span>or</span></div>
    <form id="email-form" class="dlg-form">
      <input type="email" name="email" placeholder="Email" autocomplete="email" required/>
      <input type="password" name="password" placeholder="Password" autocomplete="current-password" required/>
      <button class="btn btn-dark" type="submit">Sign in with email</button>
    </form>
    <p class="dlg-err" id="err" role="alert">${esc(message)}</p>
    <p class="dlg-foot"><a href="#" id="reset">Forgot password?</a> · New to Wedzy? Download the app and create your account first.</p>`;

  const err = el.querySelector("#err");
  el.querySelector("#google").onclick = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
        err.textContent = authMessage(e);
      }
    }
  };
  el.querySelector("#email-form").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    try {
      await signInWithEmailAndPassword(auth, f.get("email"), f.get("password"));
    } catch (e) {
      err.textContent = authMessage(e);
    }
  };
  el.querySelector("#reset").onclick = async (ev) => {
    ev.preventDefault();
    const email = el.querySelector("input[name=email]").value;
    if (!email) return void (err.textContent = "Type your email above first.");
    await sendPasswordResetEmail(auth, email).catch(() => undefined);
    err.textContent = "If that email has a Wedzy account, a reset link is on its way.";
  };
}

function authMessage(e) {
  switch (e.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password don't match a Wedzy account.";
    case "auth/too-many-requests":
      return "Too many tries. Wait a minute and try again.";
    case "auth/unauthorized-domain":
      return "Sign-in isn't switched on for this site yet. Please try again later.";
    default:
      return "Couldn't sign you in. Please try again.";
  }
}
