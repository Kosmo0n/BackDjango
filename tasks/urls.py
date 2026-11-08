from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (
    AdminUserListView,
    ProfileView,
    RegistrationView,
    TaskFlowTokenRefreshView,
    TaskFlowTokenView,
    TaskViewSet,
    health,
)

router = DefaultRouter()
router.register("tasks", TaskViewSet, basename="task")

urlpatterns = [
    path("health/", health, name="health"),
    path("auth/register/", RegistrationView.as_view(), name="register"),
    path("auth/profile/", ProfileView.as_view(), name="profile"),
    path("auth/token/", TaskFlowTokenView.as_view(), name="token_obtain_pair"),
    path("auth/token/refresh/", TaskFlowTokenRefreshView.as_view(), name="token_refresh"),
    path("users/", AdminUserListView.as_view(), name="admin-users"),
    path("", include(router.urls)),
]
