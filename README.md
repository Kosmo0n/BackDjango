
docker --version
docker compose version
docker info









# TaskFlow

Учебная система управления задачами на Django REST Framework и PostgreSQL. Включает регистрацию и JWT-аутентификацию, роли `User`/`Admin`, CRUD задач, тесты API, Docker Compose, Postman-коллекцию и адаптивный интерфейс.

> Исходное ТЗ практических работ №10–15 в репозитории отсутствует. Реализация сверена со всеми подробными требованиями TaskFlow из чата; перед сдачей сопоставьте их с формулировками вашего преподавателя.

## Технологии и структура

- Python 3.12, Django 5.2, Django REST Framework.
- PostgreSQL 17 (SQLite в конфигурации приложения не используется).
- SimpleJWT, `django-filter`, поиск по названию задачи.
- Docker Compose: Django backend и PostgreSQL с healthcheck.
- 23 сценария `APITestCase` для регистрации, JWT, CRUD, фильтрации и прав.
- HTML, CSS и JavaScript UI, подключённый к настоящему API.

```text
taskflow/                 настройки, корневые URL и WSGI
tasks/                    пользователь, задачи, API, права и тесты
  migrations/             начальная миграция
  static/tasks/            CSS и JavaScript интерфейса
  templates/tasks/         HTML-шаблон приложения
postman/                  Postman Collection
compose.yaml              Django и PostgreSQL
Dockerfile                образ Django
requirements.txt          Python-зависимости
.env.example              пример настроек (без секретов)
```

## Запуск через Docker

Установите Docker Desktop с Docker Compose. В корне проекта:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Откройте <http://localhost:8000/>. API: `http://localhost:8000/api/`; Django Admin: `http://localhost:8000/admin/`. Compose ждёт успешного healthcheck PostgreSQL, после чего backend применяет миграции и запускает Django. Данные БД сохраняются в volume `postgres_data`.

### Если Docker не подключается в Windows

Сообщение `failed to connect to the docker API ... dockerDesktopLinuxEngine` означает, что CLI установлен, но Linux Engine Docker Desktop не запущен. Убедитесь, что Docker Desktop открыт и завершил запуск. Для Linux-контейнеров ему требуется WSL 2. Проверьте его из PowerShell от имени администратора:

```powershell
wsl --status
```

Если WSL не установлен, выполните в PowerShell от имени администратора:

```powershell
wsl --install
```

Перезагрузите компьютер, если установщик это запросит, запустите Docker Desktop и дождитесь готовности Engine. В новом окне PowerShell проверьте:

```powershell
docker info
docker compose version
```

У `docker info` должны отображаться разделы `Client` и `Server` с информацией об Engine. Если Desktop всё ещё не запускается, откройте его окно и проверьте показанную там ошибку; не повторяйте `docker compose up --build`, пока `docker info` не подтвердит доступность Engine.

Для локальной разработки без Docker установите Python 3.12 и PostgreSQL 17, создайте БД и пользователя согласно `.env`, скопируйте `.env.example` в `.env` и задайте `DB_HOST=localhost`:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
# В .env установите DB_HOST=localhost и параметры своего PostgreSQL
python manage.py migrate
python manage.py runserver
```

Приложение использует PostgreSQL без SQLite fallback.

### Настройки окружения

`.env` исключён из Git; замените учебные значения `SECRET_KEY` и `DB_PASSWORD`:

| Переменная | Назначение |
|---|---|
| `SECRET_KEY` | Секрет Django |
| `DEBUG` | Режим отладки (`True` локально, `False` для публикации) |
| `ALLOWED_HOSTS` | Список разрешённых хостов через запятую |
| `DB_NAME` | Имя PostgreSQL БД |
| `DB_USER` | Пользователь PostgreSQL |
| `DB_PASSWORD` | Пароль PostgreSQL |
| `DB_HOST` | Хост БД (`db` в Compose, `localhost` локально) |
| `DB_PORT` | Порт PostgreSQL, обычно `5432` |

Не публикуйте `.env` и не используйте секреты из примера на внешнем сервере.

## Миграции, администратор и тесты

```powershell
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
docker compose exec backend python manage.py test tasks
```

Созданный `superuser` автоматически получает роль `admin` и доступ в Django Admin. Чтобы выдать административные права существующему пользователю:

```powershell
docker compose exec backend python manage.py shell -c "from tasks.models import User; u=User.objects.get(username='ИМЯ'); u.is_staff=True; u.is_superuser=True; u.save()"
```

Не выдавайте `is_superuser` обычным пользователям: регистрация открыта, но разрешает только `username`, `email` и пароль, поэтому роль из клиентского запроса не назначается. Для локального запуска вместо `docker compose exec backend ...` используйте `python manage.py ...`.

## API

Приватные маршруты требуют заголовок `Authorization: Bearer <access>`.

| Метод | URL | Доступ | Назначение |
|---|---|---|---|
| `GET` | `/api/health/` | Без токена | Проверка backend |
| `POST` | `/api/auth/register/` | Без токена | Регистрация |
| `POST` | `/api/auth/token/` | Без токена | Пара access/refresh JWT |
| `POST` | `/api/auth/token/refresh/` | Refresh token | Обновление access JWT |
| `GET` | `/api/auth/profile/` | JWT | Профиль текущего пользователя |
| `GET` | `/api/tasks/` | JWT | Свои задачи; Admin видит все |
| `POST` | `/api/tasks/` | JWT | Создание задачи |
| `GET` | `/api/tasks/{id}/` | JWT | Просмотр доступной задачи |
| `PUT`, `PATCH` | `/api/tasks/{id}/` | JWT | Обновление доступной задачи |
| `DELETE` | `/api/tasks/{id}/` | JWT | Удаление доступной задачи |
| `GET` | `/api/users/` | Только Admin | Пользователи без паролей |

Поля задачи: `title`, `description`, `status` (`pending`, `in_progress`, `completed`), `priority` (`low`, `medium`, `high`), `due_date`. Для User владелец назначается сервером из текущей учётной записи; Admin может передать `owner` при создании или изменении задачи. Даты создания и обновления задаются сервером. Список задач принимает `?status=pending`, `?priority=high`, `?search=отчёт`; фильтры можно комбинировать.

Пример регистрации:

```json
{"username":"student","email":"student@example.com","password":"StrongPassword!2026"}
```

Пример создания задачи:

```json
{
  "title": "Подготовить отчёт",
  "description": "Собрать результаты практической работы",
  "status": "in_progress",
  "priority": "high",
  "due_date": "2026-12-01T12:00:00Z"
}
```

Регистрация валидирует уникальные username/email и пароль; API не возвращает пароль. Обычный User видит и меняет только собственные задачи. Admin, создаваемый через `createsuperuser`, имеет доступ ко всем задачам и пользователям и входит в Django Admin.

## Postman

Импортируйте `postman/TaskFlow.postman_collection.json` в Postman. Коллекция задаёт `baseUrl` (`http://localhost:8000`) и включает регистрацию, вход, refresh, профиль, список/фильтр и CRUD задачи, список пользователей и healthcheck. Скрипт входа сохраняет токены в переменные `access` и `refresh`; приватные запросы используют access.

Для демонстрации зарегистрируйте User, создайте администратора через `createsuperuser`, задайте его credentials в переменных Postman `adminUsername`/`adminPassword` и выполните запрос `Admin Login — save JWT`. Сравните доступ к задачам и пользователям. В интерфейсе Admin может указать владельца новой задачи.

## Проверки

В окружении с Docker:

```powershell
docker compose up --build -d
docker compose exec backend python manage.py check
docker compose exec backend python manage.py makemigrations --check --dry-run
docker compose exec backend python manage.py test tasks
docker compose exec db pg_isready -U taskflow -d taskflow
```

На момент создания проекта проверки приложения и Docker не были запущены: в среде разработки отсутствуют Python и Docker. Работоспособность миграций, тестов, контейнеров, соединения с PostgreSQL и пользовательских сценариев необходимо подтвердить командами выше.
