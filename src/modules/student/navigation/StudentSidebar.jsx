"use client";

import { SidebarFrame, SidebarNav } from "@/modules/shared";

import { STUDENT_NAV, STUDENT_WORKSPACE } from "./index";

export function StudentSidebar({ email }) {
  return (
    <SidebarFrame
      workspace={STUDENT_WORKSPACE}
      email={email}
      homeHref="/student/dashboard"
      renderNav={(onNavigate) => (
        <SidebarNav groups={STUDENT_NAV} onNavigate={onNavigate} />
      )}
    />
  );
}
