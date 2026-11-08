from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Task, User


@admin.register(User)
class TaskFlowUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("TaskFlow", {"fields": ("role",)}),)
    list_display = ["username", "email", "role", "is_staff", "is_active"]
    list_filter = ["role", "is_staff", "is_active"]


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ["title", "owner", "status", "priority", "due_date"]
    list_filter = ["status", "priority"]
    search_fields = ["title", "owner__username"]
