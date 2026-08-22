/**
 * app.js — rendering, navigation, and interaction logic for the Nest budget tracker.
 * Pure vanilla JS, no build step, no external dependencies. Talks to js/data.js (Store).
 */

(function () {
  "use strict";

  const state = Store.load();

  // ---------------------------------------------------------------------
  // Recurring expense engine
  // ---------------------------------------------------------------------

  function addMonthsClamped(date, monthsToAdd) {
    // Adds calendar months while clamping the day-of-month to the last valid
    // day of the target month, instead of letting the native Date roll over
    // into the following month (e.g. Jan 31 + 1 month must land on Feb 28,
    // not spill into Mar 3 the way `setMonth` does by default).
    const targetIndex = date.getMonth() + monthsToAdd;
    const targetYear = date.getFullYear() + Math.floor(targetIndex / 12);
    const targetMonth = ((targetIndex % 12) + 12) % 12;
    const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const day = Math.min(date.getDate(), daysInTargetMonth);
    return new Date(targetYear, targetMonth, day);
  }

  function addInterval(date, freq) {
    const d = new Date(date.getTime());
    switch (freq) {
      case "daily": d.setDate(d.getDate() + 1); return d;
      case "weekly": d.setDate(d.getDate() + 7); return d;
      case "monthly": return addMonthsClamped(date, 1);
      case "quarterly": return addMonthsClamped(date, 3);
      default: return addMonthsClamped(date, 1);
    }
  }

  function generateDueRecurringTransactions() {
    const today = new Date(todayIso());
    let changed = false;

    function pushOccurrence(rule, nextIso) {
      const alreadyExists = state.transactions.some(
        (t) => t.recurringId === rule.id && t.date === nextIso
      );
      if (!alreadyExists) {
        state.transactions.push({
          id: uid("t"),
          categoryId: rule.categoryId,
          amount: rule.amount,
          note: rule.note,
          date: nextIso,
          payerId: rule.payerId,
          recurringId: rule.id,
        });
        changed = true;
      }
    }

    state.recurringRules.forEach((rule) => {
      const monthsPerPeriod = rule.freq === "quarterly" ? 3 : rule.freq === "monthly" ? 1 : null;
      let guard = 0;

      if (monthsPerPeriod) {
        // Anchor every occurrence to the rule's original start date instead of
        // compounding off the previously generated date, so a bill started on
        // the 29th/30th/31st doesn't permanently drift to an earlier day the
        // first time it passes through a shorter month — e.g. this keeps
        // Jan 31 -> Feb 28 -> Mar 31, instead of Jan 31 -> Feb 28 -> Mar 28.
        const anchor = new Date(rule.startDate);
        let n = typeof rule.occurrenceCount === "number" ? rule.occurrenceCount : 0;
        let next = addMonthsClamped(anchor, monthsPerPeriod * (n + 1));

        while (next <= today && guard < 500) {
          const nextIso = isoDate(next);
          pushOccurrence(rule, nextIso);
          n++;
          rule.occurrenceCount = n;
          rule.lastGeneratedDate = nextIso;
          next = addMonthsClamped(anchor, monthsPerPeriod * (n + 1));
          guard++;
        }
      } else {
        // Daily/weekly intervals are fixed-length, so compounding from the
        // last generated date never drifts — no anchor needed here.
        let cursor = new Date(rule.lastGeneratedDate || rule.startDate);
        let next = addInterval(cursor, rule.freq);

        while (next <= today && guard < 500) {
          const nextIso = isoDate(next);
          pushOccurrence(rule, nextIso);
          rule.lastGeneratedDate = nextIso;
          cursor = next;
          next = addInterval(cursor, rule.freq);
          guard++;
        }
      }
    });

    if (changed) Store.save();
  }

  // ---------------------------------------------------------------------
  // Derived data helpers
  // ---------------------------------------------------------------------

  function txsForMonth(year, month) {
    const prefix = `${year}-${pad2(month)}`;
    return state.transactions.filter((t) => t.date.startsWith(prefix));
  }

  function categorySpent(categoryId, year, month) {
    return txsForMonth(year, month)
      .filter((t) => t.categoryId === categoryId)
      .reduce((sum, t) => sum + Number(t.amount), 0);
  }

  function totalBudget() {
    return state.categories.reduce((sum, c) => sum + Number(c.budget), 0);
  }

  function barClass(spent, budget) {
    if (budget <= 0) return spent > 0 ? "red" : "";
    const pct = spent / budget;
    if (pct >= 1) return "red";
    if (pct >= 0.7) return "amber";
    return "";
  }

  function memberName(id) {
    const m = state.members.find((x) => x.id === id);
    return m ? m.name : "Someone";
  }

  function categoryById(id) {
    return state.categories.find((c) => c.id === id);
  }

  // ---------------------------------------------------------------------
  // View switching
  // ---------------------------------------------------------------------

  const views = ["home", "activity", "budgets", "settle", "more"];

  function switchView(name) {
    views.forEach((v) => {
      document.getElementById("view-" + v).hidden = v !== name;
    });
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.nav === name);
    });
    if (name === "home") renderHome();
    if (name === "activity") renderActivity();
    if (name === "budgets") renderBudgets();
    if (name === "settle") renderSettle();
    window.scrollTo(0, 0);
  }

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.nav));
  });

  // ---------------------------------------------------------------------
  // HOME
  // ---------------------------------------------------------------------

  function currentMonth() {
    return state.viewMonth;
  }

  function monthLabelText(year, month) {
    return `${MONTH_NAMES[month - 1]} ${year}`;
  }

  function renderHome() {
    const { year, month } = currentMonth();

    document.getElementById("householdName").textContent = state.household.name;
    document.getElementById("monthLabel").textContent = monthLabelText(year, month);
    document.getElementById("monthNavLabel").textContent = monthLabelText(year, month);

    const spent = txsForMonth(year, month).reduce((s, t) => s + Number(t.amount), 0);
    const budget = totalBudget();
    const remaining = budget - spent;

    document.getElementById("totalLabel").textContent = `TOTAL SPENT IN ${MONTH_NAMES[month - 1].toUpperCase()}`;
    document.getElementById("totalAmount").textContent = formatMoney(spent);

    const remainingEl = document.getElementById("totalRemaining");
    if (remaining >= 0) {
      remainingEl.textContent = `${formatMoney(remaining)} left across all categories`;
      remainingEl.classList.remove("over");
    } else {
      remainingEl.textContent = `${formatMoney(Math.abs(remaining))} over budget across all categories`;
      remainingEl.classList.add("over");
    }

    const list = document.getElementById("categoryList");
    // Empty-state only when the household has never logged any expense at all.
    const hasEverLogged = state.transactions.length > 0;
    document.getElementById("emptyState").hidden = hasEverLogged;
    document.getElementById("wherewentCard").hidden = !hasEverLogged;

    list.innerHTML = "";
    state.categories.forEach((cat) => {
      const spentAmt = categorySpent(cat.id, year, month);
      const pct = cat.budget > 0 ? Math.min(1, spentAmt / cat.budget) : (spentAmt > 0 ? 1 : 0);
      const over = spentAmt > cat.budget;
      const icon = iconMeta(cat.icon);

      const row = document.createElement("div");
      row.className = "category-row";
      row.innerHTML = `
        <div class="category-row-top">
          <div class="cat-icon" style="background:${icon.bg};color:${icon.fg}">${icon.emoji}</div>
          <div class="cat-name-wrap">
            <span class="cat-name">${escapeHtml(cat.name)}</span>
            ${over && state.flags.highlightOverBudget ? '<span class="cat-over-pill">over budget</span>' : ""}
          </div>
          <div class="cat-amounts"><b>${formatMoney(spentAmt)}</b> / ${formatMoney(cat.budget)}</div>
        </div>
        <div class="cat-bar-track"><div class="cat-bar-fill ${barClass(spentAmt, cat.budget)}" style="width:${pct * 100}%"></div></div>
      `;
      row.addEventListener("click", () => switchView("budgets"));
      list.appendChild(row);
    });
  }

  document.getElementById("monthPicker").addEventListener("click", () => {
    const nav = document.getElementById("monthNav");
    nav.hidden = !nav.hidden;
  });

  function shiftMonth(delta) {
    let { year, month } = currentMonth();
    month += delta;
    if (month < 1) { month = 12; year -= 1; }
    if (month > 12) { month = 1; year += 1; }
    state.viewMonth = { year, month };
    Store.save();
    renderHome();
    renderActivity();
    renderSettle();
  }

  document.getElementById("prevMonth").addEventListener("click", () => shiftMonth(-1));
  document.getElementById("nextMonth").addEventListener("click", () => shiftMonth(1));

  document.getElementById("fabAdd").addEventListener("click", () => openExpenseSheet(null));

  // ---------------------------------------------------------------------
  // ACTIVITY
  // ---------------------------------------------------------------------

  function renderActivity() {
    const { year, month } = currentMonth();
    document.getElementById("activityMonthLabel").textContent = monthLabelText(year, month);

    const txs = txsForMonth(year, month).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const container = document.getElementById("activityGroups");
    container.innerHTML = "";
    document.getElementById("activityEmpty").hidden = txs.length !== 0;

    const byDate = {};
    txs.forEach((t) => {
      (byDate[t.date] = byDate[t.date] || []).push(t);
    });

    Object.keys(byDate).sort((a, b) => (a < b ? 1 : -1)).forEach((date) => {
      const dayWrap = document.createElement("div");
      dayWrap.className = "activity-day";
      const dayTotal = byDate[date].reduce((s, t) => s + Number(t.amount), 0);
      dayWrap.innerHTML = `<div class="activity-day-label">${formatDisplayDate(date)} · ${formatMoney(dayTotal)}</div>`;

      byDate[date].forEach((t) => {
        const cat = categoryById(t.categoryId);
        const icon = iconMeta(cat ? cat.icon : "other");
        const row = document.createElement("div");
        row.className = "activity-row";
        row.innerHTML = `
          <div class="cat-icon" style="background:${icon.bg};color:${icon.fg}">${icon.emoji}</div>
          <div class="activity-row-text">
            <strong>${escapeHtml(t.note || (cat ? cat.name : "Expense"))}${t.recurringId ? '<span class="recur-badge">↻ recurring</span>' : ""}</strong>
            <small>${cat ? escapeHtml(cat.name) : "Uncategorized"} · Paid by ${escapeHtml(memberName(t.payerId))}</small>
          </div>
          <div class="activity-row-amount">${formatMoney(t.amount)}</div>
        `;
        row.addEventListener("click", () => openExpenseSheet(t));
        dayWrap.appendChild(row);
      });

      container.appendChild(dayWrap);
    });
  }

  // ---------------------------------------------------------------------
  // BUDGETS
  // ---------------------------------------------------------------------

  function renderBudgets() {
    const { year, month } = currentMonth();
    const list = document.getElementById("budgetList");
    list.innerHTML = "";

    state.categories.forEach((cat) => {
      const spentAmt = categorySpent(cat.id, year, month);
      const pct = cat.budget > 0 ? Math.min(1, spentAmt / cat.budget) : (spentAmt > 0 ? 1 : 0);
      const icon = iconMeta(cat.icon);

      const row = document.createElement("div");
      row.className = "budget-row";
      row.innerHTML = `
        <div class="budget-row-top">
          <div class="cat-icon" style="background:${icon.bg};color:${icon.fg}">${icon.emoji}</div>
          <span class="cat-name">${escapeHtml(cat.name)}</span>
          <div class="cat-amounts"><b>${formatMoney(spentAmt)}</b> / ${formatMoney(cat.budget)}</div>
        </div>
        <div class="cat-bar-track"><div class="cat-bar-fill ${barClass(spentAmt, cat.budget)}" style="width:${pct * 100}%"></div></div>
      `;
      row.addEventListener("click", () => openCategorySheet(cat));
      list.appendChild(row);
    });
  }

  document.getElementById("addCategoryBtn").addEventListener("click", () => openCategorySheet(null));

  // ---------------------------------------------------------------------
  // SETTLE
  // ---------------------------------------------------------------------

  function monthKey(year, month) {
    return `${year}-${pad2(month)}`;
  }

  function renderSettle() {
    const { year, month } = currentMonth();
    document.getElementById("settleMonthLabel").textContent = monthLabelText(year, month);

    const txs = txsForMonth(year, month);
    const total = txs.reduce((s, t) => s + Number(t.amount), 0);
    const n = state.members.length;
    const fairShare = n > 0 ? total / n : 0;

    const net = {};
    state.members.forEach((m) => { net[m.id] = -fairShare; });
    txs.forEach((t) => {
      if (net[t.payerId] === undefined) net[t.payerId] = -fairShare;
      net[t.payerId] += Number(t.amount);
    });

    const mk = monthKey(year, month);
    state.settlements
      .filter((s) => s.monthKey === mk)
      .forEach((s) => {
        net[s.from] = (net[s.from] || 0) + s.amount;
        net[s.to] = (net[s.to] || 0) - s.amount;
      });

    const balancesEl = document.getElementById("settleBalances");
    balancesEl.innerHTML = "";
    state.members.forEach((m) => {
      const amt = net[m.id] || 0;
      const row = document.createElement("div");
      row.className = "settle-balance-row";
      let text, cls;
      if (Math.abs(amt) < 1) { text = "settled up"; cls = ""; }
      else if (amt > 0) { text = `gets back ${formatMoney(amt)}`; cls = "pos"; }
      else { text = `owes ${formatMoney(Math.abs(amt))}`; cls = "neg"; }
      row.innerHTML = `<span class="settle-name">${escapeHtml(m.name)}</span><span class="settle-amt ${cls}">${text}</span>`;
      balancesEl.appendChild(row);
    });

    // Greedy debt simplification
    const creditors = [];
    const debtors = [];
    Object.keys(net).forEach((id) => {
      if (net[id] > 0.5) creditors.push({ id, amt: net[id] });
      else if (net[id] < -0.5) debtors.push({ id, amt: -net[id] });
    });
    creditors.sort((a, b) => b.amt - a.amt);
    debtors.sort((a, b) => b.amt - a.amt);

    const suggestions = [];
    let ci = 0, di = 0;
    while (ci < creditors.length && di < debtors.length) {
      const pay = Math.min(creditors[ci].amt, debtors[di].amt);
      if (pay > 0.5) {
        suggestions.push({ from: debtors[di].id, to: creditors[ci].id, amount: Math.round(pay) });
      }
      creditors[ci].amt -= pay;
      debtors[di].amt -= pay;
      if (creditors[ci].amt < 0.5) ci++;
      if (debtors[di].amt < 0.5) di++;
    }

    const suggEl = document.getElementById("settleSuggestions");
    suggEl.innerHTML = "";
    // Show the "all settled up" empty state whenever there's nothing else to
    // display — either no suggestions, or no household members at all (an
    // empty member list used to fall through to a blank screen instead).
    document.getElementById("settleEmpty").hidden = suggestions.length !== 0 && n !== 0;

    suggestions.forEach((s) => {
      const row = document.createElement("div");
      row.className = "settle-suggestion-row";
      row.innerHTML = `
        <div class="settle-suggestion-text"><b>${escapeHtml(memberName(s.from))}</b> pays <b>${escapeHtml(memberName(s.to))}</b> ${formatMoney(s.amount)}</div>
        <button type="button" class="settle-mark-btn">Mark settled</button>
      `;
      row.querySelector(".settle-mark-btn").addEventListener("click", () => {
        state.settlements.push({ id: uid("s"), from: s.from, to: s.to, amount: s.amount, monthKey: mk, date: todayIso() });
        Store.save();
        renderSettle();
        notifySave("Marked as settled");
      });
      suggEl.appendChild(row);
    });
  }

  // ---------------------------------------------------------------------
  // ADD / EDIT EXPENSE SHEET
  // ---------------------------------------------------------------------

  let editingExpenseId = null;
  let fSelectedCategoryId = null;
  let fSelectedPayerId = null;
  let fSelectedRepeat = "never";

  function buildCategoryChips() {
    const wrap = document.getElementById("fCategoryChips");
    wrap.innerHTML = "";
    state.categories.forEach((cat) => {
      const icon = iconMeta(cat.icon);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip cat-chip" + (cat.id === fSelectedCategoryId ? " active" : "");
      chip.innerHTML = `<span>${icon.emoji}</span>${escapeHtml(cat.name)}`;
      chip.addEventListener("click", () => {
        fSelectedCategoryId = cat.id;
        buildCategoryChips();
      });
      wrap.appendChild(chip);
    });
  }

  function buildPayerChips() {
    const wrap = document.getElementById("fPayerChips");
    wrap.innerHTML = "";
    state.members.forEach((m) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip" + (m.id === fSelectedPayerId ? " active" : "");
      chip.textContent = m.name;
      chip.addEventListener("click", () => {
        fSelectedPayerId = m.id;
        buildPayerChips();
      });
      wrap.appendChild(chip);
    });
  }

  document.querySelectorAll("#fRepeatChips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      fSelectedRepeat = chip.dataset.repeat;
      document.querySelectorAll("#fRepeatChips .chip").forEach((c) => c.classList.toggle("active", c === chip));
    });
  });

  document.getElementById("fDate").addEventListener("change", (e) => {
    document.getElementById("fDateCaption").textContent = e.target.value ? formatDisplayDate(e.target.value) : "";
  });

  document.getElementById("fPhoto").addEventListener("change", (e) => {
    const file = e.target.files[0];
    const preview = document.getElementById("photoPreview");
    if (!file) { preview.hidden = true; preview.innerHTML = ""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      preview.hidden = false;
      preview.innerHTML = `<img src="${reader.result}" alt="Bill photo preview">`;
    };
    reader.readAsDataURL(file);
  });

  function openExpenseSheet(tx) {
    editingExpenseId = tx ? tx.id : null;
    document.getElementById("sheetTitle").textContent = tx ? "Edit expense" : "Add expense";
    document.getElementById("fDelete").hidden = !tx;
    document.getElementById("fAmount").value = tx ? tx.amount : "";
    document.getElementById("fNote").value = tx ? tx.note || "" : "";

    const dateVal = tx ? tx.date : todayIso();
    document.getElementById("fDate").value = dateVal;
    document.getElementById("fDateCaption").textContent = formatDisplayDate(dateVal);

    fSelectedCategoryId = tx ? tx.categoryId : (state.categories[0] ? state.categories[0].id : null);
    fSelectedPayerId = tx ? tx.payerId : (state.members[0] ? state.members[0].id : null);
    fSelectedRepeat = "never";
    document.querySelectorAll("#fRepeatChips .chip").forEach((c) => c.classList.toggle("active", c.dataset.repeat === "never"));

    document.getElementById("fPhoto").value = "";
    document.getElementById("photoPreview").hidden = true;
    document.getElementById("photoPreview").innerHTML = "";

    buildCategoryChips();
    buildPayerChips();

    document.getElementById("sheetBackdrop").hidden = false;
  }

  function closeExpenseSheet() {
    document.getElementById("sheetBackdrop").hidden = true;
  }

  document.getElementById("sheetCancel").addEventListener("click", closeExpenseSheet);
  document.getElementById("sheetBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "sheetBackdrop") closeExpenseSheet();
  });

  document.getElementById("expenseSheet").addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = Number(document.getElementById("fAmount").value);
    const note = document.getElementById("fNote").value.trim();
    const date = document.getElementById("fDate").value || todayIso();

    if (!amount || amount <= 0) { toast("Enter an amount"); return; }
    if (!fSelectedCategoryId) { toast("Choose a category"); return; }

    if (editingExpenseId) {
      const tx = state.transactions.find((t) => t.id === editingExpenseId);
      if (tx) {
        tx.amount = amount;
        tx.note = note;
        tx.date = date;
        tx.categoryId = fSelectedCategoryId;
        tx.payerId = fSelectedPayerId;
      }
    } else {
      const tx = {
        id: uid("t"),
        categoryId: fSelectedCategoryId,
        amount,
        note,
        date,
        payerId: fSelectedPayerId,
        recurringId: null,
      };

      if (fSelectedRepeat !== "never") {
        const rule = {
          id: uid("r"),
          categoryId: fSelectedCategoryId,
          amount,
          note,
          payerId: fSelectedPayerId,
          freq: fSelectedRepeat,
          startDate: date,
          lastGeneratedDate: date,
        };
        state.recurringRules.push(rule);
        tx.recurringId = rule.id;
      }

      state.transactions.push(tx);
    }

    Store.save();
    closeExpenseSheet();
    renderHome();
    renderActivity();
    renderBudgets();
    renderSettle();
    notifySave("Expense saved");
  });

  document.getElementById("fDelete").addEventListener("click", () => {
    if (!editingExpenseId) return;
    state.transactions = state.transactions.filter((t) => t.id !== editingExpenseId);
    Store.save();
    closeExpenseSheet();
    renderHome();
    renderActivity();
    renderBudgets();
    renderSettle();
    notifySave("Expense deleted");
  });

  // ---------------------------------------------------------------------
  // CATEGORY (BUDGET) SHEET
  // ---------------------------------------------------------------------

  let editingCategoryId = null;
  let cSelectedIcon = "other";

  function buildIconChips() {
    const wrap = document.getElementById("cIconChips");
    wrap.innerHTML = "";
    ICON_OPTIONS.forEach((opt) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip cat-chip" + (opt.id === cSelectedIcon ? " active" : "");
      chip.innerHTML = `<span>${opt.emoji}</span>${opt.label}`;
      chip.addEventListener("click", () => {
        cSelectedIcon = opt.id;
        buildIconChips();
      });
      wrap.appendChild(chip);
    });
  }

  function openCategorySheet(cat) {
    editingCategoryId = cat ? cat.id : null;
    document.getElementById("categorySheetTitle").textContent = cat ? "Edit category" : "New category";
    document.getElementById("cDelete").hidden = !cat;
    document.getElementById("cName").value = cat ? cat.name : "";
    document.getElementById("cBudget").value = cat ? cat.budget : "";
    cSelectedIcon = cat ? cat.icon : "other";
    buildIconChips();
    document.getElementById("categoryBackdrop").hidden = false;
  }

  function closeCategorySheet() {
    document.getElementById("categoryBackdrop").hidden = true;
  }

  document.getElementById("categoryCancel").addEventListener("click", closeCategorySheet);
  document.getElementById("categoryBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "categoryBackdrop") closeCategorySheet();
  });

  document.getElementById("categorySheet").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("cName").value.trim();
    const budget = Number(document.getElementById("cBudget").value);
    if (!name) { toast("Name your category"); return; }
    if (budget < 0 || Number.isNaN(budget)) { toast("Enter a valid budget"); return; }

    if (editingCategoryId) {
      const cat = categoryById(editingCategoryId);
      if (cat) { cat.name = name; cat.budget = budget; cat.icon = cSelectedIcon; }
    } else {
      state.categories.push({ id: uid("c"), name, icon: cSelectedIcon, budget });
    }

    Store.save();
    closeCategorySheet();
    renderHome();
    renderBudgets();
    notifySave("Category saved");
  });

  document.getElementById("cDelete").addEventListener("click", () => {
    if (!editingCategoryId) return;
    const hasTx = state.transactions.some((t) => t.categoryId === editingCategoryId);
    const hasRecurring = state.recurringRules.some((r) => r.categoryId === editingCategoryId);

    if (hasTx) {
      const msg = "This category has expenses logged against it. Delete it anyway? The expenses will stay but show as uncategorized."
        + (hasRecurring ? " Its recurring expense will also be stopped." : "");
      if (!confirm(msg)) return;
    } else if (hasRecurring) {
      if (!confirm("This category has a recurring expense set up. Delete it anyway? The recurring expense will be stopped.")) return;
    }

    state.categories = state.categories.filter((c) => c.id !== editingCategoryId);
    // Without this, a deleted category's recurring rule keeps generating new
    // "Uncategorized" expenses forever on every future app boot.
    state.recurringRules = state.recurringRules.filter((r) => r.categoryId !== editingCategoryId);
    Store.save();
    closeCategorySheet();
    renderHome();
    renderBudgets();
    renderActivity();
    notifySave("Category deleted");
  });

  // ---------------------------------------------------------------------
  // HOUSEHOLD SHEET
  // ---------------------------------------------------------------------

  // Household member edits are staged in this working copy and only
  // committed to the real state when "Save household" is pressed. Previously
  // add/remove mutated state.members directly, so clicking Close/Cancel (or
  // tapping the backdrop) looked like it discarded the change but actually
  // left it applied in memory — it would then get silently persisted the
  // next time anything else in the app called Store.save(). Editing a copy
  // and only swapping it in on Save makes Cancel/Close a real cancel.
  let hhWorkingMembers = [];

  function renderHhMembers() {
    const wrap = document.getElementById("hhMembers");
    wrap.innerHTML = "";
    hhWorkingMembers.forEach((m) => {
      const chip = document.createElement("span");
      chip.className = "onb-member-chip";
      chip.innerHTML = `${escapeHtml(m.name)} <button type="button" aria-label="Remove ${escapeHtml(m.name)}">&times;</button>`;
      chip.querySelector("button").addEventListener("click", () => {
        hhWorkingMembers = hhWorkingMembers.filter((x) => x.id !== m.id);
        renderHhMembers();
      });
      wrap.appendChild(chip);
    });
  }

  document.getElementById("moreHousehold").addEventListener("click", () => {
    document.getElementById("hhName").value = state.household.name;
    hhWorkingMembers = state.members.map((m) => ({ ...m }));
    renderHhMembers();
    document.getElementById("householdBackdrop").hidden = false;
  });

  document.getElementById("householdCancel").addEventListener("click", () => {
    document.getElementById("householdBackdrop").hidden = true;
  });
  document.getElementById("householdBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "householdBackdrop") document.getElementById("householdBackdrop").hidden = true;
  });

  document.getElementById("hhAddMemberBtn").addEventListener("click", () => {
    const input = document.getElementById("hhMemberInput");
    const name = input.value.trim();
    if (!name) return;
    hhWorkingMembers.push({ id: uid("m"), name });
    input.value = "";
    renderHhMembers();
  });

  document.getElementById("hhSave").addEventListener("click", () => {
    const name = document.getElementById("hhName").value.trim();
    state.household.name = name || state.household.name;
    state.members = hhWorkingMembers;
    Store.save();
    document.getElementById("householdBackdrop").hidden = true;
    renderHome();
    renderSettle();
    notifySave("Household updated");
  });

  // ---------------------------------------------------------------------
  // RECURRING SHEET
  // ---------------------------------------------------------------------

  function renderRecurringList() {
    const list = document.getElementById("recurringList");
    list.innerHTML = "";
    if (state.recurringRules.length === 0) {
      list.innerHTML = '<div class="recurring-empty">No recurring expenses yet. Set one up from the "Repeating" option when adding an expense.</div>';
      return;
    }
    state.recurringRules.forEach((rule) => {
      const cat = categoryById(rule.categoryId);
      const icon = iconMeta(cat ? cat.icon : "other");
      const row = document.createElement("div");
      row.className = "recurring-row";
      row.innerHTML = `
        <div class="cat-icon" style="background:${icon.bg};color:${icon.fg}">${icon.emoji}</div>
        <div class="recurring-row-text">
          <strong>${escapeHtml(rule.note || (cat ? cat.name : "Expense"))} · ${formatMoney(rule.amount)}</strong>
          <small>${rule.freq[0].toUpperCase() + rule.freq.slice(1)} · started ${formatDisplayDate(rule.startDate)}</small>
        </div>
        <button type="button" class="recurring-stop-btn">Stop</button>
      `;
      row.querySelector(".recurring-stop-btn").addEventListener("click", () => {
        state.recurringRules = state.recurringRules.filter((r) => r.id !== rule.id);
        Store.save();
        renderRecurringList();
        notifySave("Recurring expense stopped");
      });
      list.appendChild(row);
    });
  }

  document.getElementById("moreRecurring").addEventListener("click", () => {
    renderRecurringList();
    document.getElementById("recurringBackdrop").hidden = false;
  });
  document.getElementById("recurringCancel").addEventListener("click", () => {
    document.getElementById("recurringBackdrop").hidden = true;
  });
  document.getElementById("recurringBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "recurringBackdrop") document.getElementById("recurringBackdrop").hidden = true;
  });

  // ---------------------------------------------------------------------
  // MORE: export / reset / replay onboarding
  // ---------------------------------------------------------------------

  function csvField(value) {
    // Proper CSV escaping (RFC 4180 style) for every column, not just the
    // note field — category names and member names are also free text the
    // user can type commas, quotes, or newlines into, and an unescaped
    // comma there used to silently shift every later column in the row.
    const str = String(value === null || value === undefined ? "" : value);
    if (/[",\n\r]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  document.getElementById("moreExport").addEventListener("click", () => {
    const rows = [["Date", "Category", "Amount", "Paid by", "Note", "Recurring"]];
    state.transactions
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .forEach((t) => {
        const cat = categoryById(t.categoryId);
        rows.push([
          t.date,
          cat ? cat.name : "Uncategorized",
          t.amount,
          memberName(t.payerId),
          t.note || "",
          t.recurringId ? "yes" : "no",
        ]);
      });
    const csv = rows.map((r) => r.map(csvField).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nest-expenses.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("CSV downloaded");
  });

  document.getElementById("moreReset").addEventListener("click", () => {
    if (!confirm("This clears all expenses, budgets, and members and restores the sample data. Continue?")) return;
    Store.reset();
    location.reload();
  });

  document.getElementById("moreOnboarding").addEventListener("click", () => {
    startOnboarding();
  });

  // ---------------------------------------------------------------------
  // ONBOARDING
  // ---------------------------------------------------------------------

  let onbStep = 1;

  function renderOnbMembers() {
    const wrap = document.getElementById("onbMembers");
    wrap.innerHTML = "";
    state.members.forEach((m) => {
      const chip = document.createElement("span");
      chip.className = "onb-member-chip";
      chip.innerHTML = `${escapeHtml(m.name)} <button type="button" aria-label="Remove ${escapeHtml(m.name)}">&times;</button>`;
      chip.querySelector("button").addEventListener("click", () => {
        state.members = state.members.filter((x) => x.id !== m.id);
        renderOnbMembers();
      });
      wrap.appendChild(chip);
    });
  }

  function showOnbStep(n) {
    onbStep = n;
    [1, 2, 3].forEach((i) => {
      document.querySelector(`.onboarding-step[data-step="${i}"]`).hidden = i !== n;
      document.querySelector(`.dot[data-dot="${i}"]`).classList.toggle("active", i === n);
    });
    document.getElementById("onbNext").textContent = n === 3 ? "Get started" : "Next";
    if (n === 2) document.getElementById("onbHouseholdName").value = state.household.name;
    if (n === 3) renderOnbMembers();
  }

  function startOnboarding() {
    showOnbStep(1);
    document.getElementById("onboarding").hidden = false;
  }

  function finishOnboarding() {
    const name = document.getElementById("onbHouseholdName").value.trim();
    if (name) state.household.name = name;
    state.onboardingDone = true;
    Store.save();
    document.getElementById("onboarding").hidden = true;
    renderHome();
  }

  document.getElementById("onbNext").addEventListener("click", () => {
    if (onbStep < 3) showOnbStep(onbStep + 1);
    else finishOnboarding();
  });
  document.getElementById("onbSkip").addEventListener("click", finishOnboarding);

  document.getElementById("onbAddMemberBtn").addEventListener("click", () => {
    const input = document.getElementById("onbMemberInput");
    const name = input.value.trim();
    if (!name) return;
    state.members.push({ id: uid("m"), name });
    input.value = "";
    renderOnbMembers();
  });

  // ---------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  /**
   * Call this right after Store.save() instead of a plain toast(). If the save
   * actually reached localStorage, shows the normal success message; if not
   * (storage blocked, private-browsing mode, sandboxed preview, quota full),
   * shows a warning instead so a failed save is never silent.
   */
  function notifySave(successMsg) {
    if (Store.lastSaveOk) {
      toast(successMsg);
    } else {
      toast("Not saved — storage is blocked in this browser/preview");
    }
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------

  function checkStorageBanner() {
    const banner = document.getElementById("storageBanner");
    if (banner && !Store.storageAvailable) {
      banner.hidden = false;
    }
  }

  // Guarded: if index.html and app.js ever get out of sync (e.g. only part of
  // an update landed), a missing element here must never take down the rest
  // of the app the way an unguarded getElementById(...).addEventListener did.
  const storageBannerCloseBtn = document.getElementById("storageBannerClose");
  if (storageBannerCloseBtn) {
    storageBannerCloseBtn.addEventListener("click", () => {
      const banner = document.getElementById("storageBanner");
      if (banner) banner.hidden = true;
    });
  }

  function boot() {
    try {
      checkStorageBanner();
      generateDueRecurringTransactions();
      renderHome();
      renderActivity();
      renderBudgets();
      renderSettle();
      switchView("home");
      if (!state.onboardingDone) {
        startOnboarding();
      }
    } catch (e) {
      // Never fail silent-blank: if something above throws (stale/mismatched
      // files, an unexpected null element, etc.) surface it instead of
      // leaving every screen empty with no clue why.
      console.error("Nest failed to start up:", e);
      const app = document.getElementById("app");
      if (app) {
        const err = document.createElement("div");
        err.style.cssText = "padding:20px;font-family:sans-serif;color:#7C2820;background:#F6D9D3;margin:12px;border-radius:12px;";
        err.textContent = "Nest hit an error while starting up (" + (e && e.message ? e.message : e) + "). Try a hard refresh (Ctrl/Cmd+Shift+R) — if that doesn't help, index.html, css/styles.css, js/data.js, and js/app.js may be out of sync (mixed old/new versions). Re-download all four together and replace them as a set.";
        app.prepend(err);
      }
    }
  }

  boot();
})();
