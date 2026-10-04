# Expense Tracker

A simple, responsive expense tracker built with plain HTML, CSS, and JavaScript. There are no dependencies and no build step.

## Menu

The app has a sidebar menu. On screens narrower than 900px it becomes a slide-out drawer that you open with the ☰ button.

| Menu item | Page | What it shows |
|---|---|---|
| Dashboard | `#/dashboard` | Balance, income and expense totals, the expenses-by-category chart, and the 5 most recent transactions |
| Transactions | `#/transactions` | The full list, with type, category, and month filters, a **Clear filters** button, Edit and Delete buttons, and pagination (5, 10, 25, or 50 rows per page). The list shows 5 rows at a time and scrolls inside its card when a page has more. To change this, edit `VISIBLE_ROWS` in `app.js`. |
| └ Add Transaction | `#/transactions/add` | The form for adding a transaction. Editing one opens the same form at `#/transactions/edit/<id>` |
| Monthly Summary | `#/monthly` | Income, expenses, and net for each month, with a total row. Select a month to see its transactions |

Each page has its own URL, so the browser's back and forward buttons work and you can bookmark a page.

## Features

- Add income or expense transactions with an amount, category, date, and description
- Pick dates from a built-in calendar popup that works with a mouse, touch, or keyboard (arrow keys move by day or week, Page Up/Down change the month, Esc closes it). Future dates are disabled.
- Edit and delete transactions
- See your total income, total expenses, and current balance
- Filter transactions by type (income or expense), category, and month
- Data is saved in the browser's Local Storage, so it is still there after you refresh
- Responsive layout for desktop and mobile
- **Bonus features:**
  - Monthly summary table (income, expenses, and net for each month)
  - Category-wise expense chart on the Dashboard, with its own period selector
  - Form validation with clear error messages next to each field
  - Light and dark mode that follow your system setting

## How to run

**Option 1: Open the file directly**

Double-click `index.html`, or drag it into any modern browser (Chrome, Edge, Firefox, Safari).

Then open http://localhost:8000 (or the URL that `serve` prints).

## Project structure

```
expense-tracker/
├── index.html   # Page layout and markup
├── style.css    # Styles, responsive layout, and dark mode
├── app.js       # App logic: state, validation, rendering, and Local Storage
└── README.md
```

## Notes

- **Currency:** The default is USD. To change it, edit `CURRENCY` at the top of `app.js` (for example `'EUR'`, `'INR'`, or `'GBP'`).
- **Categories:** You can edit the `CATEGORIES` list at the top of `app.js`.
- **Storage:** Data is stored under the `expense-tracker.transactions` key and is kept per browser and per device. Clearing your browser's site data deletes it. Amounts are stored in cents (whole numbers) to avoid rounding errors.
- **Validation rules:** The amount must be greater than 0 and have no more than two decimal places. A category is required. The date cannot be in the future. The description is required and can be up to 100 characters.
