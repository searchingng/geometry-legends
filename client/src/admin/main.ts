import type { AdminPage } from "@moba/shared";
import { UnauthorizedError, adminApi } from "./api.js";
import { matchColumns, userColumns, type Column } from "./tables.js";
import "./admin.css";

type Tab = "users" | "matches";

const SEARCH_DEBOUNCE_MS = 250;

const loginForm = document.getElementById("admin-login") as HTMLFormElement;
const loginError = document.getElementById("admin-login-error")!;
const app = document.getElementById("admin-app")!;
const searchInput = document.getElementById("admin-search") as HTMLInputElement;
const totalLabel = document.getElementById("admin-total")!;
const errorLabel = document.getElementById("admin-error")!;
const table = document.getElementById("admin-table") as HTMLTableElement;
const pageLabel = document.getElementById("admin-page")!;
const prevButton = document.getElementById("admin-prev") as HTMLButtonElement;
const nextButton = document.getElementById("admin-next") as HTMLButtonElement;
const tabButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-tab]")];

let tab: Tab = location.hash === "#matches" ? "matches" : "users";
let page = 1;
let requestId = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const users = userColumns((username) => openTab("matches", username));
const matches = matchColumns((username) => openTab("matches", username));

async function start() {
  try {
    await adminApi.session();
    showApp();
  } catch {
    showLogin();
  }
}

function showLogin() {
  app.hidden = true;
  loginForm.hidden = false;
  (loginForm.elements.namedItem("username") as HTMLInputElement).focus();
}

function showApp() {
  loginForm.hidden = true;
  app.hidden = false;
  void load();
}

loginForm.onsubmit = async (event) => {
  event.preventDefault();
  const data = new FormData(loginForm);
  const submit = loginForm.querySelector("button")!;
  submit.disabled = true;
  loginError.textContent = "";
  try {
    await adminApi.login({ username: String(data.get("username")), password: String(data.get("password")) });
    loginForm.reset();
    showApp();
  } catch (error) {
    loginError.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    submit.disabled = false;
  }
};

document.getElementById("admin-logout")!.onclick = async () => {
  await adminApi.logout().catch(() => undefined);
  showLogin();
};

for (const button of tabButtons) button.onclick = () => openTab(button.dataset.tab as Tab, "");

searchInput.oninput = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page = 1;
    void load();
  }, SEARCH_DEBOUNCE_MS);
};

prevButton.onclick = () => {
  page = Math.max(1, page - 1);
  void load();
};

nextButton.onclick = () => {
  page += 1;
  void load();
};

function openTab(next: Tab, search: string) {
  tab = next;
  page = 1;
  searchInput.value = search;
  history.replaceState(null, "", `#${next}`);
  void load();
}

async function load() {
  const id = ++requestId;
  for (const button of tabButtons) button.classList.toggle("active", button.dataset.tab === tab);
  errorLabel.textContent = "";
  try {
    const search = searchInput.value.trim();
    if (tab === "users") render(id, await adminApi.users(search, page), users);
    else render(id, await adminApi.matches(search, page), matches);
  } catch (error) {
    if (id !== requestId) return;
    if (error instanceof UnauthorizedError) showLogin();
    else errorLabel.textContent = error instanceof Error ? error.message : String(error);
  }
}

function render<T>(id: number, result: AdminPage<T>, columns: Column<T>[]) {
  if (id !== requestId) return;
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  page = result.page;
  totalLabel.textContent = `${result.total} ${tab}`;
  pageLabel.textContent = `Page ${result.page} of ${pages}`;
  prevButton.disabled = result.page <= 1;
  nextButton.disabled = result.page >= pages;

  const head = document.createElement("tr");
  for (const column of columns) {
    const th = document.createElement("th");
    th.textContent = column.title;
    head.append(th);
  }
  table.tHead!.replaceChildren(head);

  const rows = result.items.map((item) => {
    const tr = document.createElement("tr");
    for (const column of columns) {
      const td = document.createElement("td");
      td.append(column.cell(item));
      tr.append(td);
    }
    return tr;
  });
  if (rows.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = columns.length;
    td.className = "admin-empty";
    td.textContent = "Nothing found";
    tr.append(td);
    rows.push(tr);
  }
  table.tBodies[0].replaceChildren(...rows);
}

void start();
