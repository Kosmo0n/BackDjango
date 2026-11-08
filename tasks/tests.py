from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Task

User = get_user_model()


class TaskFlowAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="student",
            email="student@example.com",
            password="SecurePass!2026",
        )
        self.other_user = User.objects.create_user(
            username="other",
            email="other@example.com",
            password="SecurePass!2026",
        )
        self.admin = User.objects.create_superuser(
            username="teacher",
            email="teacher@example.com",
            password="SecurePass!2026",
        )
        self.task = Task.objects.create(
            title="Owned task",
            owner=self.user,
            description="Test task",
        )
        self.other_task = Task.objects.create(
            title="Private task",
            owner=self.other_user,
        )

    def authenticate(self, user):
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}"
        )

    def test_registration_succeeds_and_password_is_not_returned(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "username": "newstudent",
                "email": "newstudent@example.com",
                "password": "AnotherSecure!2026",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("password", response.data)
        self.assertTrue(User.objects.get(username="newstudent").check_password("AnotherSecure!2026"))

    def test_registration_rejects_duplicate_username(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "username": self.user.username,
                "email": "unique@example.com",
                "password": "AnotherSecure!2026",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", response.data)

    def test_registration_rejects_invalid_email(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "username": "invalidmail",
                "email": "not-an-email",
                "password": "AnotherSecure!2026",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_registration_does_not_allow_admin_role(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "username": "regular",
                "email": "regular@example.com",
                "password": "AnotherSecure!2026",
                "role": "admin",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.get(username="regular").role, User.Role.USER)

    def test_jwt_login_returns_access_and_refresh_tokens(self):
        response = self.client.post(
            "/api/auth/token/",
            {"username": "student", "password": "SecurePass!2026"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_jwt_login_rejects_wrong_password(self):
        response = self.client.post(
            "/api/auth/token/",
            {"username": "student", "password": "incorrect"},
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_token_returns_new_access_token_without_access_auth(self):
        response = self.client.post(
            "/api/auth/token/refresh/",
            {"refresh": str(RefreshToken.for_user(self.user))},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_private_api_rejects_missing_jwt(self):
        response = self.client.get("/api/tasks/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_private_api_rejects_invalid_jwt(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer invalid-token")
        response = self.client.get("/api/tasks/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_profile_returns_current_user_without_password(self):
        self.authenticate(self.user)
        response = self.client.get("/api/auth/profile/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], self.user.username)
        self.assertNotIn("password", response.data)

    def test_user_can_create_task(self):
        self.authenticate(self.user)
        response = self.client.post(
            "/api/tasks/",
            {"title": "New task", "description": "Work", "priority": "high"},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["owner"], self.user.id)

    def test_user_list_contains_only_own_tasks(self):
        self.authenticate(self.user)
        response = self.client.get("/api/tasks/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([task["id"] for task in response.data], [self.task.id])

    def test_user_can_update_own_task(self):
        self.authenticate(self.user)
        response = self.client.patch(
            f"/api/tasks/{self.task.id}/",
            {"title": "Updated task"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.task.refresh_from_db()
        self.assertEqual(self.task.title, "Updated task")

    def test_user_can_delete_own_task(self):
        self.authenticate(self.user)
        response = self.client.delete(f"/api/tasks/{self.task.id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Task.objects.filter(pk=self.task.id).exists())

    def test_user_cannot_access_another_users_task(self):
        self.authenticate(self.user)
        response = self.client.get(f"/api/tasks/{self.other_task.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_cannot_assign_task_to_another_owner(self):
        self.authenticate(self.user)
        response = self.client.post(
            "/api/tasks/",
            {"title": "Spoofed task", "owner": self.other_user.id},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["owner"], self.user.id)

    def test_invalid_task_status_is_rejected(self):
        self.authenticate(self.user)
        response = self.client.post(
            "/api/tasks/",
            {"title": "Bad task", "status": "unknown"},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_task_filter_and_search(self):
        Task.objects.create(
            title="High priority report",
            status=Task.Status.IN_PROGRESS,
            priority=Task.Priority.HIGH,
            owner=self.user,
        )
        self.authenticate(self.user)
        response = self.client.get("/api/tasks/?priority=high&search=report")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["title"], "High priority report")

    def test_admin_can_list_all_tasks_and_users(self):
        self.authenticate(self.admin)
        tasks_response = self.client.get("/api/tasks/")
        users_response = self.client.get("/api/users/")
        self.assertEqual(tasks_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(tasks_response.data), 2)
        self.assertEqual(users_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(users_response.data), 3)

    def test_admin_can_update_another_users_task(self):
        self.authenticate(self.admin)
        response = self.client.patch(
            f"/api/tasks/{self.other_task.id}/",
            {"status": Task.Status.COMPLETED},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.other_task.refresh_from_db()
        self.assertEqual(self.other_task.status, Task.Status.COMPLETED)

    def test_admin_can_create_and_delete_any_task(self):
        self.authenticate(self.admin)
        response = self.client.post(
            "/api/tasks/",
            {"title": "Admin task", "owner": self.other_user.id},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["owner"], self.other_user.id)
        delete_response = self.client.delete(f"/api/tasks/{response.data['id']}/")
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)

    def test_superuser_can_access_django_admin(self):
        self.client.credentials()
        self.assertTrue(self.client.login(username="teacher", password="SecurePass!2026"))
        response = self.client.get("/admin/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_regular_user_cannot_list_all_users(self):
        self.authenticate(self.user)
        response = self.client.get("/api/users/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
