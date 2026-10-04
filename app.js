(function () {
  'use strict';

  // ---- Config ---------------------------------------------------------------

  const STORAGE_KEY = 'expense-tracker.transactions';
  const CURRENCY = 'INR'; // change to e.g. 'EUR', 'INR', 'GBP'
  const MAX_AMOUNT = 1000000000;
  const MAX_DESCRIPTION = 100;
  const RECENT_COUNT = 5;
  const VISIBLE_ROWS = 5; // rows shown before the transaction list scrolls

  const CATEGORIES = {
    expense: ['Food', 'Transport', 'Housing', 'Utilities', 'Shopping', 'Entertainment', 'Health', 'Education', 'Travel', 'Other'],
    income: ['Salary', 'Freelance', 'Business', 'Investment', 'Gift', 'Other'],
  };

  const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY });
  const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
  const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  // ---- State ----------------------------------------------------------------

  let transactions = load();
  let editingId = null;
  let page = 1;
  let pageSize = 10;

  // ---- Elements -------------------------------------------------------------

  const $ = (id) => document.getElementById(id);
  const form = $('transaction-form');
  const amountInput = $('amount');
  const categorySelect = $('category');
  const descriptionInput = $('description');
  const submitBtn = $('submit-btn');
  const cancelBtn = $('cancel-edit-btn');
  const formTitle = $('form-title');
  const filterType = $('filter-type');
  const filterCategory = $('filter-category');
  const filterMonth = $('filter-month');
  const chartMonth = $('chart-month');
  const clearFiltersBtn = $('clear-filters');
  const list = $('transaction-list');
  const toast = $('toast');

  // ---- Storage --------------------------------------------------------------

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data.filter(isValidRecord);
    } catch (err) {
      console.warn('Could not read saved transactions:', err);
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
      return true;
    } catch (err) {
      console.warn('Could not save transactions:', err);
      showToast('Could not save — browser storage is unavailable or full.');
      return false;
    }
  }

  function isValidRecord(t) {
    return t && typeof t.id === 'string'
      && (t.type === 'income' || t.type === 'expense')
      && Number.isInteger(t.amountCents) && t.amountCents > 0
      && typeof t.category === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(t.date)
      && typeof t.description === 'string';
  }

  // ---- Helpers --------------------------------------------------------------

  function toISO(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function todayISO() {
    return toISO(new Date());
  }

  // Parse 'YYYY-MM-DD' as a local date (avoids UTC off-by-one).
  function parseDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function monthKey(iso) {
    return iso.slice(0, 7); // 'YYYY-MM'
  }

  function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    return monthFormat.format(new Date(y, m - 1, 1));
  }

  function formatMoney(cents) {
    return money.format(cents / 100);
  }

  function makeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function selectedType() {
    return form.querySelector('input[name="type"]:checked').value;
  }

  function setOptions(select, options, keepValue) {
    const previous = keepValue ? select.value : null;
    select.innerHTML = '';
    options.forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      select.appendChild(opt);
    });
    if (previous && options.some((o) => o.value === previous)) {
      select.value = previous;
    }
  }

  let toastTimer;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 2500);
  }

  // ---- Date picker ----------------------------------------------------------

  const datePicker = (function () {
    const container = $('datepicker');
    const trigger = $('date');
    const display = $('date-display');
    const popup = $('calendar');
    const title = $('cal-title');
    const daysEl = $('cal-days');
    const prevBtn = $('cal-prev');
    const nextBtn = $('cal-next');
    const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const fullDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

    let value = '';
    let focused = '';      // ISO date that holds keyboard focus in the grid
    let view = new Date(); // first day of the displayed month
    let changeHandler = () => {};

    // Weekday headings, Sunday first (1 Jan 2023 was a Sunday).
    for (let i = 0; i < 7; i++) {
      const span = document.createElement('span');
      span.textContent = weekday.format(new Date(2023, 0, 1 + i));
      $('cal-weekdays').appendChild(span);
    }

    const isOpen = () => !popup.classList.contains('hidden');
    const clampToToday = (iso) => (iso > todayISO() ? todayISO() : iso);

    function addDays(iso, n) {
      const d = parseDate(iso);
      d.setDate(d.getDate() + n);
      return toISO(d);
    }

    function addMonths(iso, n) {
      const d = parseDate(iso);
      const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      target.setDate(Math.min(d.getDate(), lastDay));
      return toISO(target);
    }

    function setView(iso) {
      const d = parseDate(iso);
      view = new Date(d.getFullYear(), d.getMonth(), 1);
    }

    function renderCalendar() {
      const year = view.getFullYear();
      const month = view.getMonth();
      const today = todayISO();
      title.textContent = monthFormat.format(view);
      nextBtn.disabled = toISO(new Date(year, month + 1, 1)) > today;

      daysEl.innerHTML = '';
      const leading = new Date(year, month, 1).getDay();
      for (let i = 0; i < leading; i++) daysEl.appendChild(document.createElement('span'));

      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const iso = toISO(date);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cal-day';
        btn.textContent = day;
        btn.dataset.date = iso;
        btn.tabIndex = iso === focused ? 0 : -1;
        btn.setAttribute('aria-label', fullDate.format(date));
        if (iso === today) {
          btn.classList.add('today');
          btn.setAttribute('aria-current', 'date');
        }
        if (iso === value) {
          btn.classList.add('selected');
          btn.setAttribute('aria-pressed', 'true');
        }
        if (iso > today) btn.disabled = true;
        daysEl.appendChild(btn);
      }
    }

    function focusDay(iso) {
      focused = clampToToday(iso);
      setView(focused);
      renderCalendar();
      const btn = daysEl.querySelector(`[data-date="${focused}"]`);
      if (btn) btn.focus();
    }

    function open() {
      popup.classList.remove('hidden');
      trigger.setAttribute('aria-expanded', 'true');
      focusDay(value || todayISO());
    }

    function close(returnFocus) {
      if (!isOpen()) return;
      popup.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      if (returnFocus) trigger.focus();
    }

    function setValue(iso) {
      value = iso || '';
      display.textContent = value ? longDate.format(parseDate(value)) : 'Select a date';
      trigger.classList.toggle('placeholder', !value);
      if (isOpen()) renderCalendar();
    }

    function select(iso) {
      setValue(iso);
      close(true);
      changeHandler(iso);
    }

    trigger.addEventListener('click', () => (isOpen() ? close(false) : open()));

    prevBtn.addEventListener('click', () => {
      focused = addMonths(focused, -1);
      view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
      renderCalendar();
    });

    nextBtn.addEventListener('click', () => {
      focused = clampToToday(addMonths(focused, 1));
      view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
      renderCalendar();
      if (nextBtn.disabled) prevBtn.focus();
    });

    $('cal-today').addEventListener('click', () => select(todayISO()));
    $('cal-close').addEventListener('click', () => close(true));

    daysEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.cal-day');
      if (btn && !btn.disabled) select(btn.dataset.date);
    });

    daysEl.addEventListener('keydown', (e) => {
      const moves = {
        ArrowLeft: () => addDays(focused, -1),
        ArrowRight: () => addDays(focused, 1),
        ArrowUp: () => addDays(focused, -7),
        ArrowDown: () => addDays(focused, 7),
        PageUp: () => addMonths(focused, -1),
        PageDown: () => addMonths(focused, 1),
      };
      if (moves[e.key]) {
        e.preventDefault();
        focusDay(moves[e.key]());
      }
    });

    popup.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
      }
    });

    // Close when clicking or tabbing outside the picker.
    document.addEventListener('mousedown', (e) => {
      if (isOpen() && !container.contains(e.target)) close(false);
    });
    container.addEventListener('focusout', (e) => {
      if (e.relatedTarget && !container.contains(e.relatedTarget)) close(false);
    });

    return {
      get value() { return value; },
      set value(iso) { setValue(iso); },
      onChange(fn) { changeHandler = fn; },
      close,
    };
  })();

  datePicker.onChange(() => setError('date', ''));

  // ---- Form -----------------------------------------------------------------

  function populateFormCategories(selected) {
    const type = selectedType();
    const options = [{ value: '', label: 'Select a category' }]
      .concat(CATEGORIES[type].map((c) => ({ value: c, label: c })));
    // Keep a legacy/custom category visible when editing an older record.
    if (selected && !CATEGORIES[type].includes(selected)) {
      options.push({ value: selected, label: selected });
    }
    setOptions(categorySelect, options, false);
    categorySelect.value = selected || '';
  }

  function clearErrors() {
    ['amount', 'category', 'date', 'description'].forEach((name) => setError(name, ''));
  }

  function setError(name, message) {
    $(`${name}-error`).textContent = message;
    const input = $(name);
    input.classList.toggle('invalid', Boolean(message));
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function validate() {
    const errors = {};
    const type = selectedType();

    const amountRaw = amountInput.value.trim();
    const amount = Number(amountRaw);
    if (amountRaw === '') {
      errors.amount = 'Please enter an amount.';
    } else if (!Number.isFinite(amount)) {
      errors.amount = 'Amount must be a number.';
    } else if (amount <= 0) {
      errors.amount = 'Amount must be greater than zero.';
    } else if (amount > MAX_AMOUNT) {
      errors.amount = `Amount must be less than ${formatMoney(MAX_AMOUNT * 100)}.`;
    } else if (!/^\d+(\.\d{1,2})?$/.test(amountRaw)) {
      errors.amount = 'Use at most two decimal places (e.g. 12.50).';
    }

    const category = categorySelect.value;
    if (!category) {
      errors.category = `Please choose a${type === 'income' ? 'n income' : 'n expense'} category.`;
    }

    const date = datePicker.value;
    if (!date) {
      errors.date = 'Please pick a date.';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(parseDate(date))) {
      errors.date = 'Please enter a valid date.';
    } else if (date > todayISO()) {
      errors.date = 'Date cannot be in the future.';
    } else if (date < '1900-01-01') {
      errors.date = 'Date is too far in the past.';
    }

    const description = descriptionInput.value.trim();
    if (!description) {
      errors.description = 'Please add a short description.';
    } else if (description.length > MAX_DESCRIPTION) {
      errors.description = `Keep the description under ${MAX_DESCRIPTION} characters.`;
    }

    clearErrors();
    Object.entries(errors).forEach(([name, msg]) => setError(name, msg));

    if (Object.keys(errors).length) {
      $(Object.keys(errors)[0]).focus();
      return null;
    }

    return {
      type,
      amountCents: Math.round(amount * 100),
      category,
      date,
      description,
    };
  }

  function resetForm() {
    editingId = null;
    form.reset();
    form.querySelector('input[value="expense"]').checked = true;
    populateFormCategories('');
    datePicker.value = todayISO();
    datePicker.close(false);
    clearErrors();
    formTitle.textContent = 'Add Transaction';
    submitBtn.textContent = 'Add Transaction';
  }

  function startEdit(id) {
    location.hash = `#/transactions/edit/${encodeURIComponent(id)}`;
  }

  // Fill the form with an existing transaction (called by the router).
  function loadEdit(id) {
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return false;
    resetForm();
    editingId = id;
    form.querySelector(`input[name="type"][value="${tx.type}"]`).checked = true;
    populateFormCategories(tx.category);
    amountInput.value = (tx.amountCents / 100).toFixed(2);
    datePicker.value = tx.date;
    descriptionInput.value = tx.description;
    clearErrors();
    formTitle.textContent = 'Edit Transaction';
    submitBtn.textContent = 'Save Changes';
    return true;
  }

  function deleteTransaction(id) {
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;
    const ok = window.confirm(`Delete "${tx.description}" (${formatMoney(tx.amountCents)})?`);
    if (!ok) return;
    transactions = transactions.filter((t) => t.id !== id);
    save();
    if (editingId === id) resetForm();
    render();
    showToast('Transaction deleted.');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = validate();
    if (!data) return;

    if (editingId) {
      transactions = transactions.map((t) => (t.id === editingId ? { ...t, ...data } : t));
      showToast('Transaction updated.');
    } else {
      transactions.push({ id: makeId(), createdAt: Date.now(), ...data });
      page = 1;
      showToast('Transaction added.');
    }
    save();
    resetForm();
    render();
    location.hash = '#/transactions';
  });

  cancelBtn.addEventListener('click', () => {
    resetForm();
    location.hash = '#/transactions';
  });

  form.querySelectorAll('input[name="type"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      populateFormCategories('');
      setError('category', '');
    });
  });

  // Clear a field's error as soon as the user edits it.
  [amountInput, categorySelect, descriptionInput].forEach((el) => {
    el.addEventListener('input', () => setError(el.id, ''));
  });

  // ---- Filters --------------------------------------------------------------

  function monthOptions(allLabel) {
    const months = [...new Set(transactions.map((t) => monthKey(t.date)))].sort().reverse();
    return [{ value: 'all', label: allLabel }].concat(months.map((m) => ({ value: m, label: monthLabel(m) })));
  }

  function refreshFilterOptions() {
    const type = filterType.value;
    const used = new Set(transactions.filter((t) => type === 'all' || t.type === type).map((t) => t.category));
    const base = type === 'all'
      ? [...new Set([...CATEGORIES.expense, ...CATEGORIES.income])]
      : CATEGORIES[type];
    const categories = [...new Set([...base, ...used])].sort();
    setOptions(
      filterCategory,
      [{ value: 'all', label: 'All categories' }].concat(categories.map((c) => ({ value: c, label: c }))),
      true
    );
    setOptions(filterMonth, monthOptions('All time'), true);
    setOptions(chartMonth, monthOptions('All time'), true);
  }

  function sortNewestFirst(a, b) {
    return b.date.localeCompare(a.date) || ((b.createdAt || 0) - (a.createdAt || 0));
  }

  function filteredTransactions() {
    const type = filterType.value;
    const category = filterCategory.value;
    const month = filterMonth.value;
    return transactions
      .filter((t) => type === 'all' || t.type === type)
      .filter((t) => category === 'all' || t.category === category)
      .filter((t) => month === 'all' || monthKey(t.date) === month)
      .sort(sortNewestFirst);
  }

  [filterType, filterCategory, filterMonth].forEach((el) => el.addEventListener('change', () => {
    page = 1;
    render();
  }));
  chartMonth.addEventListener('change', renderChart);

  function filtersActive() {
    return filterType.value !== 'all' || filterCategory.value !== 'all' || filterMonth.value !== 'all';
  }

  clearFiltersBtn.addEventListener('click', () => {
    filterType.value = 'all';
    filterCategory.value = 'all';
    filterMonth.value = 'all';
    page = 1;
    render();
    // The button disables itself, so keep keyboard focus in the filter area.
    filterType.focus();
    showToast('Filters cleared.');
  });

  // ---- Rendering ------------------------------------------------------------

  function renderTotals() {
    let income = 0;
    let expense = 0;
    transactions.forEach((t) => {
      if (t.type === 'income') income += t.amountCents;
      else expense += t.amountCents;
    });
    const balance = income - expense;
    $('total-income').textContent = formatMoney(income);
    $('total-expense').textContent = formatMoney(expense);
    const balanceEl = $('total-balance');
    balanceEl.textContent = formatMoney(balance);
    balanceEl.classList.toggle('negative', balance < 0);
  }

  function buildItem(t, withActions) {
    const li = document.createElement('li');
    li.className = `transaction ${t.type}`;

    const main = document.createElement('div');
    main.className = 'tx-main';
    const desc = document.createElement('div');
    desc.className = 'tx-desc';
    desc.textContent = t.description;
    const meta = document.createElement('div');
    meta.className = 'tx-meta';
    const badge = document.createElement('span');
    badge.className = 'tx-badge';
    badge.textContent = t.category;
    meta.append(badge, dateFormat.format(parseDate(t.date)));
    main.append(desc, meta);

    const side = document.createElement('div');
    side.className = 'tx-side';
    const amount = document.createElement('span');
    amount.className = 'tx-amount';
    amount.textContent = (t.type === 'income' ? '+' : '−') + formatMoney(t.amountCents);
    side.appendChild(amount);

    if (withActions) {
      const actions = document.createElement('div');
      actions.className = 'tx-actions';
      actions.innerHTML = `
        <button type="button" class="icon-btn" data-action="edit">Edit</button>
        <button type="button" class="icon-btn delete" data-action="delete">Delete</button>`;
      actions.querySelectorAll('button').forEach((b) => {
        b.dataset.id = t.id;
        b.setAttribute('aria-label', `${b.textContent} ${t.description}`);
      });
      side.appendChild(actions);
    }

    li.append(main, side);
    return li;
  }

  function renderList() {
    const items = filteredTransactions();
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    page = Math.min(Math.max(page, 1), totalPages); // e.g. after deleting the last item on a page
    const start = (page - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);

    list.innerHTML = '';
    pageItems.forEach((t) => list.appendChild(buildItem(t, true)));
    list.scrollTop = 0;
    fitListHeight();
    renderPagination(items.length, totalPages, start, pageItems.length);

    const isEmpty = items.length === 0;
    const empty = $('empty-state');
    empty.classList.toggle('hidden', !isEmpty);
    empty.textContent = transactions.length === 0
      ? 'No transactions yet. Use "Add Transaction" to create one.'
      : 'No transactions match these filters.';
    const active = filtersActive();
    clearFiltersBtn.disabled = !active;
    if (transactions.length === 0) {
      $('list-count').textContent = '';
    } else if (active) {
      $('list-count').textContent = `${items.length} of ${transactions.length} shown`;
    } else {
      $('list-count').textContent = `${transactions.length} transaction${transactions.length === 1 ? '' : 's'}`;
    }
  }

  // Limit the list's height to its first VISIBLE_ROWS rows so the rest scroll.
  // Rows vary in height (wrapped descriptions, narrow screens), so measure them.
  function fitListHeight() {
    list.style.maxHeight = '';
    list.classList.remove('scrollable');
    const rows = list.children;
    if (rows.length <= VISIBLE_ROWS || !list.offsetParent) return; // nothing to limit, or view hidden

    list.classList.add('scrollable'); // apply scrollbar space first so rows are measured at final width
    const last = rows[VISIBLE_ROWS - 1];
    const border = parseFloat(getComputedStyle(list).borderBottomWidth) || 0;
    list.style.maxHeight = `${last.offsetTop + last.offsetHeight + border}px`;
  }

  let resizeFrame;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(fitListHeight);
  });

  function renderRecent() {
    const recent = transactions.slice().sort(sortNewestFirst).slice(0, RECENT_COUNT);
    const recentList = $('recent-list');
    recentList.innerHTML = '';
    recent.forEach((t) => recentList.appendChild(buildItem(t, false)));
    $('recent-empty').classList.toggle('hidden', recent.length > 0);
  }

  // ---- Pagination -----------------------------------------------------------

  const pagination = $('pagination');
  const pageNumbers = $('page-numbers');
  const prevPageBtn = $('page-prev');
  const nextPageBtn = $('page-next');
  const pageSizeSelect = $('page-size');

  // Page numbers to show: first, last, and the current page's neighbours,
  // with '…' filling any gaps (e.g. 1 … 4 5 6 … 12).
  function visiblePages(current, total) {
    const wanted = [1, current - 1, current, current + 1, total]
      .filter((p, i, arr) => p >= 1 && p <= total && arr.indexOf(p) === i)
      .sort((a, b) => a - b);
    const result = [];
    let prev = 0;
    wanted.forEach((p) => {
      if (p - prev === 2) result.push(prev + 1); // a gap of one page: just show it
      else if (p - prev > 2) result.push('…');
      result.push(p);
      prev = p;
    });
    return result;
  }

  function renderPagination(totalItems, totalPages, start, shown) {
    pagination.classList.toggle('hidden', totalItems === 0);
    if (totalItems === 0) return;

    $('page-info').textContent = `Showing ${start + 1}–${start + shown} of ${totalItems}`;
    $('page-controls').classList.toggle('hidden', totalPages <= 1);
    prevPageBtn.disabled = page <= 1;
    nextPageBtn.disabled = page >= totalPages;

    pageNumbers.innerHTML = '';
    visiblePages(page, totalPages).forEach((p) => {
      const li = document.createElement('li');
      if (p === '…') {
        li.className = 'page-ellipsis';
        li.setAttribute('aria-hidden', 'true');
        li.textContent = '…';
      } else {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'page-btn';
        btn.dataset.page = p;
        btn.textContent = p;
        btn.setAttribute('aria-label', `Page ${p}`);
        if (p === page) btn.setAttribute('aria-current', 'page');
        li.appendChild(btn);
      }
      pageNumbers.appendChild(li);
    });
  }

  function goToPage(n) {
    page = n;
    renderList();
    // Keep focus on the pager: if the clicked control was replaced or disabled, use the current page button.
    if (!pagination.contains(document.activeElement) || document.activeElement.disabled) {
      pageNumbers.querySelector('[aria-current="page"]').focus({ preventScroll: true });
    }
    const listTop = $('transactions-title').getBoundingClientRect().top;
    if (listTop < 0) $('transactions-title').scrollIntoView({ behavior: 'smooth' });
  }

  pageNumbers.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]');
    if (btn) goToPage(Number(btn.dataset.page));
  });
  prevPageBtn.addEventListener('click', () => goToPage(page - 1));
  nextPageBtn.addEventListener('click', () => goToPage(page + 1));
  pageSizeSelect.addEventListener('change', () => {
    pageSize = Number(pageSizeSelect.value);
    page = 1;
    renderList();
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'edit') startEdit(btn.dataset.id);
    if (btn.dataset.action === 'delete') deleteTransaction(btn.dataset.id);
  });

  function renderChart() {
    const month = chartMonth.value;
    const chart = $('category-chart');

    const totals = {};
    transactions
      .filter((t) => t.type === 'expense' && (month === 'all' || monthKey(t.date) === month))
      .forEach((t) => { totals[t.category] = (totals[t.category] || 0) + t.amountCents; });

    const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    chart.innerHTML = '';

    if (rows.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty-state';
      p.textContent = 'No expenses for this period.';
      chart.appendChild(p);
      return;
    }

    const max = rows[0][1];
    const sum = rows.reduce((acc, [, v]) => acc + v, 0);
    rows.forEach(([category, cents]) => {
      const row = document.createElement('div');
      row.className = 'bar-row';
      const pct = Math.round((cents / sum) * 100);
      row.title = `${category}: ${formatMoney(cents)} (${pct}%)`;

      const label = document.createElement('span');
      label.className = 'bar-label';
      label.textContent = category;

      const track = document.createElement('div');
      track.className = 'bar-track';
      track.setAttribute('role', 'img');
      track.setAttribute('aria-label', `${category}: ${formatMoney(cents)}, ${pct}% of expenses`);
      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.style.width = `${Math.max((cents / max) * 100, 2)}%`;
      track.appendChild(fill);

      const value = document.createElement('span');
      value.className = 'bar-value';
      value.textContent = `${formatMoney(cents)} · ${pct}%`;

      row.append(label, track, value);
      chart.appendChild(row);
    });
  }

  function summaryRow(label, income, expense, href) {
    const net = income - expense;
    const tr = document.createElement('tr');
    const head = document.createElement('th');
    head.scope = 'row';
    if (href) {
      const a = document.createElement('a');
      a.className = 'link';
      a.href = href;
      a.textContent = label;
      head.appendChild(a);
    } else {
      head.textContent = label;
    }
    tr.appendChild(head);
    [
      [formatMoney(income), 'num'],
      [formatMoney(expense), 'num'],
      [formatMoney(net), `num ${net < 0 ? 'neg' : 'pos'}`],
    ].forEach(([text, cls]) => {
      const td = document.createElement('td');
      td.className = cls;
      td.textContent = text;
      tr.appendChild(td);
    });
    return tr;
  }

  function renderMonthly() {
    const byMonth = {};
    let totalIncome = 0;
    let totalExpense = 0;
    transactions.forEach((t) => {
      const key = monthKey(t.date);
      byMonth[key] = byMonth[key] || { income: 0, expense: 0 };
      byMonth[key][t.type] += t.amountCents;
      if (t.type === 'income') totalIncome += t.amountCents;
      else totalExpense += t.amountCents;
    });

    const body = $('monthly-body');
    const foot = $('monthly-foot');
    body.innerHTML = '';
    foot.innerHTML = '';
    const months = Object.keys(byMonth).sort().reverse();

    months.forEach((key) => {
      const { income, expense } = byMonth[key];
      body.appendChild(summaryRow(monthLabel(key), income, expense, `#/transactions?month=${key}`));
    });
    if (months.length) foot.appendChild(summaryRow('Total', totalIncome, totalExpense));

    const isEmpty = months.length === 0;
    $('monthly-empty').classList.toggle('hidden', !isEmpty);
    $('monthly-hint').classList.toggle('hidden', isEmpty);
    document.querySelector('.monthly-table').classList.toggle('hidden', isEmpty);
  }

  function render() {
    refreshFilterOptions();
    renderTotals();
    renderList();
    renderRecent();
    renderChart();
    renderMonthly();
  }

  // Keep tabs in sync if the app is open in more than one window.
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      transactions = load();
      render();
    }
  });

  // ---- Menu -----------------------------------------------------------------

  const sidebar = $('sidebar');
  const menuBtn = $('menu-btn');
  const backdrop = $('backdrop');

  function setMenu(open) {
    sidebar.classList.toggle('open', open);
    backdrop.classList.toggle('hidden', !open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (open) sidebar.querySelector('.nav-link').focus();
  }

  menuBtn.addEventListener('click', () => setMenu(!sidebar.classList.contains('open')));
  backdrop.addEventListener('click', () => setMenu(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      setMenu(false);
      menuBtn.focus();
    }
  });

  // ---- Router ---------------------------------------------------------------

  const VIEWS = {
    dashboard: { view: 'dashboard', nav: 'dashboard', title: 'Dashboard' },
    transactions: { view: 'transactions', nav: 'transactions', title: 'Transactions' },
    add: { view: 'form', nav: 'add', title: 'Add Transaction' },
    edit: { view: 'form', nav: 'transactions', title: 'Edit Transaction' },
    monthly: { view: 'monthly', nav: 'monthly', title: 'Monthly Summary' },
  };

  function parseHash() {
    const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
    const parts = path.split('/').filter(Boolean);
    const params = new URLSearchParams(query || '');
    if (parts[0] === 'transactions') {
      if (parts[1] === 'add') return { name: 'add', params };
      if (parts[1] === 'edit' && parts[2]) return { name: 'edit', id: decodeURIComponent(parts[2]), params };
      return { name: 'transactions', params };
    }
    if (parts[0] === 'monthly') return { name: 'monthly', params };
    return { name: 'dashboard', params };
  }

  function handleRoute(isInitial) {
    const route = parseHash();

    if (route.name === 'add') {
      resetForm();
    } else if (route.name === 'edit' && !loadEdit(route.id)) {
      showToast('That transaction no longer exists.');
      location.replace('#/transactions');
      return;
    } else if (route.name === 'transactions' && route.params.has('month')) {
      // Coming from the monthly summary: show just that month.
      const month = route.params.get('month');
      if ([...filterMonth.options].some((o) => o.value === month)) {
        page = 1;
        filterType.value = 'all';
        render();
        filterCategory.value = 'all';
        filterMonth.value = month;
        render();
      }
      history.replaceState(null, '', '#/transactions');
    }

    if (route.name !== 'add' && route.name !== 'edit') datePicker.close(false);

    const config = VIEWS[route.name];
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== config.view; });
    if (config.view === 'transactions') fitListHeight(); // can't measure rows while the view was hidden
    document.title = `${config.title} · Expense Tracker`;

    const inTransactions = ['transactions', 'add', 'edit'].includes(route.name);
    document.querySelectorAll('.nav-link').forEach((a) => {
      if (a.dataset.route === config.nav) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
      a.classList.toggle('in-section', a.dataset.route === 'transactions' && inTransactions);
    });

    setMenu(false);
    if (!isInitial) {
      window.scrollTo(0, 0);
      const heading = document.querySelector(`.view[data-view="${config.view}"] h1`);
      if (heading) heading.focus({ preventScroll: true });
    }
  }

  window.addEventListener('hashchange', () => handleRoute(false));

  // ---- Init -----------------------------------------------------------------

  resetForm();
  render();
  handleRoute(true);
})();
