/**
 * data.js — state model, persistence, and seed data for the Nest budget tracker.
 * Everything is stored in localStorage under STORAGE_KEY so the app works fully
 * offline with no backend.
 */

const STORAGE_KEY = "nest.budget.v1";

const ICON_OPTIONS = [
  { id: "groceries", label: "Groceries", emoji: "🛒", bg: "#F6E1CE", fg: "#C4722A" },
  { id: "rent", label: "Rent", emoji: "🏠", bg: "#F3DAD6", fg: "#B23A2E" },
  { id: "utilities", label: "Utilities", emoji: "⚡", bg: "#FCE9B8", fg: "#C98A12" },
  { id: "dining", label: "Dining", emoji: "🍽️", bg: "#F6D9D3", fg: "#B23A2E" },
  { id: "transport", label: "Transport", emoji: "🚗", bg: "#DCEAE0", fg: "#3F7D55" },
  { id: "health", label: "Health", emoji: "💛", bg: "#F6DCE1", fg: "#C24868" },
  { id: "shopping", label: "Shopping", emoji: "🛍️", bg: "#E6DFF3", fg: "#6C5CA6" },
  { id: "other", label: "Other", emoji: "✨", bg: "#EAE0CD", fg: "#8A7E6E" },
];

function iconMeta(iconId) {
  return ICON_OPTIONS.find((i) => i.id === iconId) || ICON_OPTIONS[ICON_OPTIONS.length - 1];
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function pad2(n) { return String(n).padStart(2, "0"); }

function isoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDisplayDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${pad2(d)}-${months[m - 1]}-${y}`;
}

function formatMoney(n) {
  const rounded = Math.round(n);
  return "₹" + rounded.toLocaleString("en-IN");
}

function uid(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function todayIso() {
  return isoDate(new Date());
}

/** Seed data mirrors the "Nest — The Sharma-Patel home" reference design (Aug 2026). */
function seedState() {
  const members = [
    { id: "m_asha", name: "Asha" },
    { id: "m_ravi", name: "Ravi" },
  ];

  const categories = [
    { id: "c_groceries", name: "Groceries", icon: "groceries", budget: 12000 },
    { id: "c_rent", name: "Rent", icon: "rent", budget: 45000 },
    { id: "c_utilities", name: "Utilities", icon: "utilities", budget: 6000 },
    { id: "c_dining", name: "Dining", icon: "dining", budget: 8000 },
    { id: "c_transport", name: "Transport", icon: "transport", budget: 5000 },
    { id: "c_health", name: "Health", icon: "health", budget: 4000 },
    { id: "c_shopping", name: "Shopping", icon: "shopping", budget: 10000 },
  ];

  const year = 2026, month = 8; // August 2026, matches the reference design
  const d = (day) => `${year}-${pad2(month)}-${pad2(day)}`;

  const transactions = [
    { id: uid("t"), categoryId: "c_groceries", amount: 9800, note: "Weekly groceries", date: d(18), payerId: "m_asha", recurringId: null },
    { id: uid("t"), categoryId: "c_rent", amount: 45000, note: "August rent", date: d(1), payerId: "m_ravi", recurringId: null },
    { id: uid("t"), categoryId: "c_utilities", amount: 4200, note: "Electricity + water", date: d(10), payerId: "m_ravi", recurringId: null },
    { id: uid("t"), categoryId: "c_dining", amount: 8900, note: "Dinners out", date: d(15), payerId: "m_asha", recurringId: null },
    { id: uid("t"), categoryId: "c_transport", amount: 3100, note: "Fuel & cabs", date: d(12), payerId: "m_asha", recurringId: null },
    { id: uid("t"), categoryId: "c_health", amount: 1200, note: "Pharmacy", date: d(9), payerId: "m_ravi", recurringId: null },
    { id: uid("t"), categoryId: "c_shopping", amount: 7600, note: "Home essentials", date: d(6), payerId: "m_ravi", recurringId: null },
  ];

  return {
    version: 1,
    household: { name: "The Sharma-Patel home" },
    members,
    categories,
    transactions,
    recurringRules: [],
    settlements: [], // { id, from, to, amount, date }
    viewMonth: { year, month }, // 1-indexed month
    onboardingDone: false,
    flags: { highlightOverBudget: true },
  };
}

const Store = {
  _state: null,

  load() {
    if (this._state) return this._state;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this._state = JSON.parse(raw);
        return this._state;
      }
    } catch (e) {
      console.warn("Failed to read saved data, starting fresh.", e);
    }
    this._state = seedState();
    this.save();
    return this._state;
  },

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state));
    } catch (e) {
      console.warn("Failed to persist data (storage may be full/unavailable).", e);
    }
  },

  reset() {
    this._state = seedState();
    this.save();
    return this._state;
  },

  state() {
    return this._state || this.load();
  },
};
