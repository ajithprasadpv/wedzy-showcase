// Pricing page checkout: sign in with the same Firebase account as the app, pay with Razorpay Checkout, and the
// Worker grants the plan (CONTRACT.md § Payments and plans in Wedzy-backend).
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

const API = "https://wedzy-voice.ajithprasadpv.workers.dev";
const PLAN_NAMES = { pass: "Wedding Pass", plus: "Wedding Pass Plus", keepsake: "Keepsake", free: "Free" };
const RANK = { free: 0, keepsake: 1, pass: 2, plus: 3 };

const app = initializeApp({
  apiKey: "AIzaSyD_R8c9IChtVuaQjJZBu0OUWQCs1gtBrk4",
  authDomain: "wedzy-13ad8.firebaseapp.com",
  projectId: "wedzy-13ad8",
});
const auth = getAuth(app);

const dialog = document.getElementById("pay-dialog");
const view = document.getElementById("pay-view");
const bar = document.getElementById("account-bar");
const buttons = [...document.querySelectorAll("[data-plan]")];
const labels = new Map(buttons.map((b) => [b, b.textContent]));

let pendingPlan = null;
let entitlement = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const longDate = (iso) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

// ---------------------------------------------------------------- API

async function api(path, body) {
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

// ---------------------------------------------------------------- dialog views

function show(html) {
  view.innerHTML = html;
  if (!dialog.open) dialog.showModal();
}

function signInView(message = "") {
  show(`
    <h2 id="pay-title">Sign in to continue</h2>
    <p class="dlg-sub">Use the same account as in the Wedzy app, so your plan unlocks there too.</p>
    <button class="btn btn-google" id="google" autofocus><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" width="18" height="18"/>Continue with Google</button>
    <div class="dlg-or"><span>or</span></div>
    <form id="email-form" class="dlg-form">
      <input type="email" name="email" placeholder="Email" autocomplete="email" required/>
      <input type="password" name="password" placeholder="Password" autocomplete="current-password" required/>
      <button class="btn btn-dark" type="submit">Sign in with email</button>
    </form>
    <p class="dlg-err" id="err" role="alert">${esc(message)}</p>
    <p class="dlg-foot"><a href="#" id="reset">Forgot password?</a> · New to Wedzy? Download the app and create your account first.</p>`);

  view.querySelector("#google").onclick = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") signInView(authMessage(e));
    }
  };
  view.querySelector("#email-form").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    try {
      await signInWithEmailAndPassword(auth, f.get("email"), f.get("password"));
    } catch (e) {
      view.querySelector("#err").textContent = authMessage(e);
    }
  };
  view.querySelector("#reset").onclick = async (ev) => {
    ev.preventDefault();
    const email = view.querySelector("input[name=email]").value;
    const err = view.querySelector("#err");
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

function successView(ent) {
  show(`
    <div class="dlg-ok">✓</div>
    <h2 id="pay-title">You're all set</h2>
    <p class="dlg-sub"><b>${esc(PLAN_NAMES[ent.plan])}</b> is active until <b>${esc(longDate(ent.expiresAt))}</b>.</p>
    <p class="dlg-sub">Open Wedzy on your phone, signed in as <b>${esc(auth.currentUser.email || "this account")}</b>. Your plan unlocks automatically. A receipt is on its way to your email.</p>
    <form method="dialog"><button class="btn btn-primary">Done</button></form>`);
}

function messageView(title, text) {
  show(`<h2 id="pay-title">${esc(title)}</h2><p class="dlg-sub">${esc(text)}</p>
    <form method="dialog"><button class="btn btn-dark">OK</button></form>`);
}

// ---------------------------------------------------------------- checkout

function setBusy(plan, busy) {
  for (const b of buttons) {
    if (b.dataset.plan !== plan) continue;
    b.disabled = busy;
    b.textContent = busy ? "Opening checkout…" : labels.get(b);
  }
  if (!busy) render();
}

async function checkout(plan) {
  if (dialog.open) dialog.close();
  if (typeof Razorpay !== "function") {
    return messageView("Checkout didn't load", "Check your connection, refresh the page and try again.");
  }
  setBusy(plan, true);
  let order;
  try {
    order = await api("/v1/pay/order", { plan });
  } catch (e) {
    setBusy(plan, false);
    return messageView("Couldn't start the payment", e.message);
  }
  const user = auth.currentUser;
  const rzp = new Razorpay({
    key: order.keyId,
    order_id: order.orderId,
    amount: order.amount,
    currency: order.currency,
    name: "Wedzy",
    description: order.name,
    image: `${location.origin}/assets/favicon.svg`,
    prefill: { name: user.displayName || "", email: user.email || "" },
    notes: { plan },
    theme: { color: "#E84A6F" },
    modal: { ondismiss: () => setBusy(plan, false) },
    handler: async (resp) => {
      try {
        entitlement = await api("/v1/pay/verify", {
          orderId: resp.razorpay_order_id,
          paymentId: resp.razorpay_payment_id,
          signature: resp.razorpay_signature,
        });
        successView(entitlement);
      } catch {
        messageView(
          "Payment received",
          "We're confirming it with the bank. Your plan will be active in a minute or two. Refresh this page to check.",
        );
      }
      setBusy(plan, false);
    },
  });
  rzp.on("payment.failed", (resp) => {
    setBusy(plan, false);
    messageView(
      "Payment didn't go through",
      `${resp?.error?.description || "The payment was declined."} No money was taken. You can try again or use another method.`,
    );
  });
  rzp.open();
}

// ---------------------------------------------------------------- page state

function render() {
  const user = auth.currentUser;
  if (!user) {
    bar.hidden = true;
  } else {
    const active = entitlement && entitlement.plan !== "free";
    bar.hidden = false;
    bar.innerHTML = `<span>Signed in as <b>${esc(user.email || user.displayName || "you")}</b>${
      active ? ` · <b>${esc(PLAN_NAMES[entitlement.plan])}</b> until ${esc(longDate(entitlement.expiresAt))}` : ""
    }</span><button class="link" id="sign-out">Sign out</button>`;
    bar.querySelector("#sign-out").onclick = () => signOut(auth);
  }
  const current = entitlement?.plan ?? "free";
  for (const b of buttons) {
    if (b.textContent === "Opening checkout…") continue;
    const plan = b.dataset.plan;
    b.disabled = false;
    b.textContent = labels.get(b);
    if (plan === current) b.textContent = "Add 12 more months";
    else if (RANK[plan] < RANK[current] && plan !== "keepsake") {
      b.disabled = true;
      b.textContent = `Included in ${PLAN_NAMES[current]}`;
    }
  }
}

for (const b of buttons) {
  b.addEventListener("click", () => {
    if (auth.currentUser) return checkout(b.dataset.plan);
    pendingPlan = b.dataset.plan;
    signInView();
  });
}

dialog.addEventListener("close", () => (pendingPlan = null));

onAuthStateChanged(auth, async (user) => {
  entitlement = null;
  render();
  if (!user) return;
  const plan = pendingPlan;
  if (plan) {
    pendingPlan = null;
    checkout(plan);
  }
  try {
    entitlement = await api("/v1/entitlement");
  } catch {
    entitlement = null;
  }
  render();
});
