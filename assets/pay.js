// Pricing page checkout: sign in with the same Firebase account as the app, pay with Razorpay Checkout, and the
// Worker grants the plan (CONTRACT.md § Payments and plans in Wedzy-backend).
import { auth, api, esc, longDate, PLAN_NAMES, renderSignIn, userBadge, onAuthStateChanged, signOut } from "./auth.js";

const RANK = { free: 0, keepsake: 1, pass: 2, plus: 3 };

const dialog = document.getElementById("pay-dialog");
const view = document.getElementById("pay-view");
const bar = document.getElementById("account-bar");
const buttons = [...document.querySelectorAll("[data-plan]")];
const labels = new Map(buttons.map((b) => [b, b.textContent]));

let pendingPlan = null;
let entitlement = null;
let checkingOut = false; // one order per click, even if sign-in fires twice

// ---------------------------------------------------------------- dialog views

function show(html) {
  view.innerHTML = html;
  if (!dialog.open) dialog.showModal();
}

function signInView() {
  if (!dialog.open) dialog.showModal();
  renderSignIn(view);
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
  checkingOut = busy;
  for (const b of buttons) {
    if (b.dataset.plan !== plan) continue;
    b.disabled = busy;
    b.textContent = busy ? "Opening checkout…" : labels.get(b);
  }
  if (!busy) render();
}

async function checkout(plan) {
  if (checkingOut) return;
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
    bar.innerHTML = `<span class="bar-who">${userBadge(user, { compact: true })}${
      active ? `<span class="bar-plan"><b>${esc(PLAN_NAMES[entitlement.plan])}</b> until ${esc(longDate(entitlement.expiresAt))}</span>` : ""
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
