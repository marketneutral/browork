import { Routes, Route } from "react-router-dom";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { OverviewPage } from "@/components/dashboard/OverviewPage";
import { UsersPage } from "@/components/users/UsersPage";
import { UserDetailPage } from "@/components/users/UserDetailPage";
import { ActivityPage } from "@/components/activity/ActivityPage";
import { ToolsPage } from "@/components/tools/ToolsPage";
import { SystemPage } from "@/components/system/SystemPage";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { McpPage } from "@/components/mcp/McpPage";
import { SkillsPage } from "@/components/skills/SkillsPage";
import { ActiveSessionsPage } from "@/components/sessions/ActiveSessionsPage";
import { UsagePage } from "@/components/usage/UsagePage";

export function App() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:id" element={<UserDetailPage />} />
        <Route path="usage" element={<UsagePage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="tools" element={<ToolsPage />} />
        <Route path="mcp" element={<McpPage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="sessions" element={<ActiveSessionsPage />} />
        <Route path="system" element={<SystemPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
