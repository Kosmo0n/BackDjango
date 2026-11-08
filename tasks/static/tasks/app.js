const API = "/api";
const page = document.querySelector("#page");
const nav = document.querySelector("#sidebar-content");
const userBox = document.querySelector("#sidebar-user");
const toastBox = document.querySelector("#toast");
const labels = {
  pending: "Ожидает", in_progress: "В работе", completed: "Завершена",
  low: "Низкий", medium: "Средний", high: "Высокий",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function notify(message) {
  toastBox.textContent = message;
  toastBox.classList.add("show");
  window.setTimeout(() => toastBox.classList.remove("show"), 2800);
}

function showError(container, error) {
  const node = container.querySelector(".error-note");
  if (node) node.textContent = error.message;
  else notify(error.message);
}

function clearSession() {
  localStorage.removeItem("taskflow.access");
  localStorage.removeItem("taskflow.refresh");
}

async function request(path, options = {}, canRefresh = true) {
  const headers = new Headers(options.headers || {});
  const access = localStorage.getItem("taskflow.access");
  if (access) headers.set("Authorization", `Bearer ${access}`);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (response.status === 401 && canRefresh && localStorage.getItem("taskflow.refresh")) {
    const refreshed = await fetch(`${API}/auth/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: localStorage.getItem("taskflow.refresh") }),
    });
    if (refreshed.ok) {
      const tokens = await refreshed.json();
      localStorage.setItem("taskflow.access", tokens.access);
      return request(path, options, false);
    }
    clearSession();
  }
  if (!response.ok) {
    let detail = `Ошибка запроса (${response.status})`;
    try {
      const data = await response.json();
      detail = typeof data === "object" ? JSON.stringify(data) : String(data);
    } catch (error) {
      detail = `${detail}: ${error.message}`;
    }
    throw new Error(detail);
  }
  if (response.status === 204) return null;
  return response.json();
}

function currentRoute() {
  return location.hash.replace(/^#\/?/, "") || "dashboard";
}

function navigation(profile) {
  if (!profile) {
    nav.innerHTML = "";
    userBox.innerHTML = "";
    return;
  }
  const items = [
    ["dashboard", "◫", "Обзор"], ["tasks", "☷", "Мои задачи"],
    ["create", "+", "Новая задача"], ["profile", "◉", "Профиль"],
  ];
  if (profile.role === "admin") items.push(["admin", "⌘", "Администрирование"]);
  const active = currentRoute();
  nav.innerHTML = `<div class="nav-label">WORKSPACE</div>${items.map(([route, icon, title]) =>
    `<a class="nav-link ${active === route ? "active" : ""}" href="#/${route}"><span class="nav-icon">${icon}</span>${title}</a>`
  ).join("")}`;
  userBox.innerHTML = `<span class="avatar">${escapeHtml(profile.username.slice(0, 1).toUpperCase())}</span><span>${escapeHtml(profile.username)}<small>${profile.role === "admin" ? "Администратор" : "Пользователь"}</small></span>`;
}

function heading(title, subtitle, action = "") {
  return `<div class="page-heading"><div><div class="eyebrow-line">TASKFLOW / ${escapeHtml(title.toUpperCase())}</div><h1>${escapeHtml(title)}</h1><p class="subtitle">${escapeHtml(subtitle)}</p></div>${action}</div>`;
}

async function renderAuth(mode) {
  navigation(null);
  document.querySelector("#topbar-title").textContent = "Рабочее пространство";
  document.querySelector("#topbar-actions").innerHTML = "";
  const register = mode === "register";
  page.innerHTML = `<div class="auth-layout"><form id="auth-form" class="auth-card">
    <div class="auth-brand">TASKFLOW / УПРАВЛЯЙТЕ РАБОТОЙ</div>
    <h1>${register ? "Создайте аккаунт" : "С возвращением"}</h1>
    <p class="subtitle">${register ? "Начните организовывать свои задачи." : "Войдите, чтобы продолжить работу."}</p>
    <p class="error-note"></p>
    ${register ? '<div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>' : ""}
    <div class="field"><label for="username">Имя пользователя</label><input id="username" name="username" autocomplete="username" required minlength="3"></div>
    <div class="field"><label for="password">Пароль</label><input id="password" name="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" required minlength="8"></div>
    <button class="button" type="submit">${register ? "Зарегистрироваться" : "Войти"}</button>
    <p class="auth-foot">${register ? "Уже есть аккаунт?" : "Нет аккаунта?"} <a href="#/${register ? "login" : "register"}">${register ? "Войти" : "Создать аккаунт"}</a></p>
  </form></div>`;
  page.querySelector("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      if (register) {
        await request("/auth/register/", { method: "POST", body: JSON.stringify(payload) }, false);
        notify("Аккаунт создан. Теперь войдите.");
        location.hash = "#/login";
      } else {
        const tokens = await request("/auth/token/", { method: "POST", body: JSON.stringify(payload) }, false);
        localStorage.setItem("taskflow.access", tokens.access);
        localStorage.setItem("taskflow.refresh", tokens.refresh);
        location.hash = "#/dashboard";
      }
    } catch (error) { showError(page, error); }
  });
}

async function loadProfile() {
  return request("/auth/profile/");
}

async function taskList(query = "") {
  const tasks = await request(`/tasks/${query}`);
  return Array.isArray(tasks) ? tasks : tasks.results;
}

function taskMarkup(task, withOwner = false) {
  return `<article class="task-card" data-task-id="${task.id}" data-status="${escapeHtml(task.status)}" data-priority="${escapeHtml(task.priority)}">
    <div><h3>${escapeHtml(task.title)}</h3><p class="task-description">${escapeHtml(task.description || "Нет описания")}</p>
      <div class="task-meta">${withOwner ? `<span class="pill">${escapeHtml(task.owner_username)}</span>` : ""}
        <span class="pill ${escapeHtml(task.status)}">${escapeHtml(labels[task.status] || task.status)}</span>
        <span class="pill ${escapeHtml(task.priority)}">${escapeHtml(labels[task.priority] || task.priority)} приоритет</span>
        ${task.due_date ? `<span class="pill">До ${escapeHtml(new Date(task.due_date).toLocaleDateString("ru-RU"))}</span>` : ""}
      </div>
    </div>
    <div class="task-actions"><button class="button secondary small edit-task" type="button">Изменить</button><button class="button danger small delete-task" type="button">Удалить</button></div>
  </article>`;
}

function attachTaskActions(container) {
  container.querySelectorAll(".delete-task").forEach((button) => button.addEventListener("click", async () => {
    const card = button.closest("[data-task-id]");
    if (!confirm("Удалить задачу?")) return;
    try {
      await request(`/tasks/${card.dataset.taskId}/`, { method: "DELETE" });
      notify("Задача удалена");
      render();
    } catch (error) { notify(error.message); }
  }));
  container.querySelectorAll(".edit-task").forEach((button) => button.addEventListener("click", () => {
    const card = button.closest("[data-task-id]");
    const title = card.querySelector("h3").textContent;
    const description = card.querySelector(".task-description").textContent;
    card.innerHTML = `<form class="inline-edit">
      <div class="field"><label>Название</label><input name="title" value="${escapeHtml(title)}" maxlength="200" required></div>
      <div class="field"><label>Описание</label><textarea name="description">${escapeHtml(description === "Нет описания" ? "" : description)}</textarea></div>
      <div class="form-grid"><div class="field"><label>Статус</label><select name="status"><option value="pending">Ожидает</option><option value="in_progress">В работе</option><option value="completed">Завершена</option></select></div>
      <div class="field"><label>Приоритет</label><select name="priority"><option value="low">Низкий</option><option value="medium">Средний</option><option value="high">Высокий</option></select></div></div>
      <div class="form-actions"><button class="button small" type="submit">Сохранить</button><button class="button secondary small cancel-edit" type="button">Отмена</button></div>
    </form>`;
    const form = card.querySelector("form");
    form.elements.status.value = card.dataset.status;
    form.elements.priority.value = card.dataset.priority;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      try {
        await request(`/tasks/${card.dataset.taskId}/`, { method: "PATCH", body: JSON.stringify(data) });
        notify("Изменения сохранены");
        render();
      } catch (error) { notify(error.message); }
    });
    form.querySelector(".cancel-edit").addEventListener("click", () => render());
  }));
}

async function renderDashboard() {
  const tasks = await taskList();
  const counts = {
    total: tasks.length,
    pending: tasks.filter((task) => task.status === "pending").length,
    in_progress: tasks.filter((task) => task.status === "in_progress").length,
    completed: tasks.filter((task) => task.status === "completed").length,
  };
  page.innerHTML = `${heading("Обзор", "Краткая сводка вашей работы.", '<a class="button" href="#/create">＋ Новая задача</a>')}
    <div class="stats-grid">
      ${[["Всего задач", counts.total, "в вашем пространстве"], ["Ожидают", counts.pending, "готовы к началу"], ["В работе", counts.in_progress, "активные задачи"], ["Завершено", counts.completed, "выполненные задачи"]].map(([label, count, foot]) =>
    `<article class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${count}</div><div class="stat-foot">${foot}</div></article>`
  ).join("")}</div>
    <section class="panel"><div class="panel-heading"><h2>Последние задачи</h2><a class="muted" href="#/tasks">Все задачи →</a></div>
    <div class="task-list">${tasks.slice(0, 5).map((task) => taskMarkup(task)).join("") || '<div class="empty-state"><strong>Пока нет задач</strong>Создайте первую задачу, чтобы начать.</div>'}</div></section>`;
  attachTaskActions(page);
}

async function renderTasks() {
  page.innerHTML = `${heading("Мои задачи", "Создавайте, фильтруйте и обновляйте задачи.")}
    <form id="filters" class="filters">
      <input name="search" placeholder="Поиск по названию" aria-label="Поиск по названию">
      <select name="status"><option value="">Все статусы</option><option value="pending">Ожидает</option><option value="in_progress">В работе</option><option value="completed">Завершена</option></select>
      <select name="priority"><option value="">Все приоритеты</option><option value="low">Низкий</option><option value="medium">Средний</option><option value="high">Высокий</option></select>
      <button class="button secondary" type="submit">Фильтровать</button>
    </form><div id="tasks-list" class="task-list"></div>`;
  const form = page.querySelector("#filters");
  const load = async () => {
    const params = new URLSearchParams(new FormData(form));
    for (const [key, value] of [...params.entries()]) if (!value) params.delete(key);
    try {
      const tasks = await taskList(params.size ? `?${params}` : "");
      const list = page.querySelector("#tasks-list");
      list.innerHTML = tasks.map((task) => taskMarkup(task)).join("") || '<div class="empty-state"><strong>Задач не найдено</strong>Измените фильтры или создайте новую задачу.</div>';
      attachTaskActions(list);
    } catch (error) { notify(error.message); }
  };
  form.addEventListener("submit", (event) => { event.preventDefault(); load(); });
  await load();
}

async function renderCreate(profile) {
  let ownerField = "";
  if (profile.role === "admin") {
    try {
      const users = await request("/users/");
      ownerField = `<div class="field"><label for="owner">Владелец задачи</label><select id="owner" name="owner"><option value="">Я</option>${users
        .map((user) => `<option value="${user.id}">${escapeHtml(user.username)} (${escapeHtml(user.email)})</option>`)
        .join("")}</select></div>`;
    } catch (error) {
      page.innerHTML = `<div class="empty-state"><strong>Не удалось загрузить пользователей</strong>${escapeHtml(error.message)}</div>`;
      return;
    }
  }
  page.innerHTML = `${heading("Новая задача", "Добавьте задачу в своё рабочее пространство.")}
    <form id="create-form" class="panel form-card">
      <p class="error-note"></p>
      <div class="field"><label for="title">Название</label><input id="title" name="title" maxlength="200" required placeholder="Например, подготовить отчёт"></div>
      <div class="field"><label for="description">Описание</label><textarea id="description" name="description" placeholder="Что нужно сделать?"></textarea></div>
      <div class="form-grid">
        <div class="field"><label for="status">Статус</label><select id="status" name="status"><option value="pending">Ожидает</option><option value="in_progress">В работе</option><option value="completed">Завершена</option></select></div>
        <div class="field"><label for="priority">Приоритет</label><select id="priority" name="priority"><option value="low">Низкий</option><option value="medium" selected>Средний</option><option value="high">Высокий</option></select></div>
      </div>
      ${ownerField}
      <div class="field"><label for="due_date">Срок выполнения</label><input id="due_date" name="due_date" type="datetime-local"></div>
      <div class="form-actions"><button class="button" type="submit">Создать задачу</button><a class="button secondary" href="#/tasks">Отмена</a></div>
    </form>`;
  page.querySelector("#create-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (!data.owner) delete data.owner;
    else data.owner = Number(data.owner);
    if (!data.due_date) delete data.due_date;
    else data.due_date = new Date(data.due_date).toISOString();
    try {
      await request("/tasks/", { method: "POST", body: JSON.stringify(data) });
      notify("Задача создана");
      location.hash = "#/tasks";
    } catch (error) { showError(page, error); }
  });
}

async function renderProfile(profile) {
  page.innerHTML = `${heading("Профиль", "Данные текущего аккаунта.")}
    <section class="panel"><div class="profile-grid">
      <div class="profile-item"><small>Имя пользователя</small><strong>${escapeHtml(profile.username)}</strong></div>
      <div class="profile-item"><small>Email</small><strong>${escapeHtml(profile.email)}</strong></div>
      <div class="profile-item"><small>Роль</small><strong>${profile.role === "admin" ? "Admin" : "User"}</strong></div>
      <div class="profile-item"><small>Дата регистрации</small><strong>${escapeHtml(new Date(profile.date_joined).toLocaleDateString("ru-RU"))}</strong></div>
    </div></section>`;
}

async function renderAdmin() {
  const [tasks, users] = await Promise.all([taskList(), request("/users/")]);
  page.innerHTML = `${heading("Администрирование", "Обзор пользователей и задач рабочего пространства.")}
    <div class="toolbar"><span class="toolbar-note">${users.length} пользователей · ${tasks.length} задач</span></div>
    <section class="panel" style="margin-bottom:18px"><div class="panel-heading"><h2>Пользователи</h2><span class="pill">${users.length}</span></div>
      ${users.map((user) => `<div class="user-row"><strong>${escapeHtml(user.username)}</strong><span class="user-email muted">${escapeHtml(user.email)}</span><span class="pill">${user.role === "admin" ? "Admin" : "User"}</span></div>`).join("") || '<div class="empty-state">Пользователей нет</div>'}
    </section>
    <section class="panel"><div class="panel-heading"><h2>Все задачи</h2><span class="pill">${tasks.length}</span></div>
      <div id="admin-task-list" class="task-list">${tasks.map((task) => taskMarkup(task, true)).join("") || '<div class="empty-state">Задач нет</div>'}</div>
    </section>`;
  attachTaskActions(page.querySelector("#admin-task-list"));
}

async function render() {
  const route = currentRoute();
  const titles = { dashboard: "Обзор", tasks: "Мои задачи", create: "Новая задача", profile: "Профиль", admin: "Администрирование" };
  document.querySelector("#topbar-title").textContent = titles[route] || "TaskFlow";
  const access = localStorage.getItem("taskflow.access");
  if (!access && !["login", "register"].includes(route)) {
    location.hash = "#/login";
    return;
  }
  if (["login", "register"].includes(route)) {
    await renderAuth(route);
    return;
  }
  try {
    const profile = await loadProfile();
    navigation(profile);
    document.querySelector("#topbar-actions").innerHTML = '<button class="button secondary small" id="logout" type="button">Выйти</button>';
    document.querySelector("#logout").addEventListener("click", () => { clearSession(); location.hash = "#/login"; });
    if (route === "admin" && profile.role !== "admin") {
      page.innerHTML = '<div class="empty-state"><strong>Нет доступа</strong>Раздел доступен только администраторам.</div>';
      return;
    }
    if (route === "dashboard") await renderDashboard();
    else if (route === "tasks") await renderTasks();
    else if (route === "create") await renderCreate(profile);
    else if (route === "profile") await renderProfile(profile);
    else if (route === "admin") await renderAdmin();
    else location.hash = "#/dashboard";
  } catch (error) {
    if (!localStorage.getItem("taskflow.access")) location.hash = "#/login";
    else page.innerHTML = `<div class="empty-state"><strong>Не удалось загрузить данные</strong>${escapeHtml(error.message)}</div>`;
  }
}

window.addEventListener("hashchange", render);
render();
