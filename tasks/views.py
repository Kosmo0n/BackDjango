from django.contrib.auth import get_user_model
from rest_framework import generics, permissions, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .models import Task
from .permissions import IsAdminRole, IsOwnerOrAdmin
from .serializers import (
    AdminUserSerializer,
    ProfileSerializer,
    RegistrationSerializer,
    TaskSerializer,
)


class RegistrationView(generics.CreateAPIView):
    serializer_class = RegistrationSerializer
    permission_classes = [permissions.AllowAny]


class ProfileView(generics.RetrieveAPIView):
    serializer_class = ProfileSerializer

    def get_object(self):
        return self.request.user


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]
    filterset_fields = ["status", "priority"]
    search_fields = ["title"]

    def get_queryset(self):
        queryset = Task.objects.select_related("owner")
        if self.request.user.role == "admin":
            return queryset
        return queryset.filter(owner=self.request.user)

    def perform_create(self, serializer):
        if self.request.user.role == "admin":
            serializer.save(owner=serializer.validated_data.get("owner", self.request.user))
        else:
            serializer.save(owner=self.request.user)


class AdminUserListView(generics.ListAPIView):
    serializer_class = AdminUserSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]
    queryset = get_user_model().objects.all().order_by("username")


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def health(request):
    return Response({"status": "ok"})


class TaskFlowTokenView(TokenObtainPairView):
    permission_classes = [permissions.AllowAny]


class TaskFlowTokenRefreshView(TokenRefreshView):
    permission_classes = [permissions.AllowAny]
