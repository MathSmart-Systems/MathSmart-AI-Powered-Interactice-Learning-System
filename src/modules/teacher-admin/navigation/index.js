import {
  BookOpen,
  ChartColumn,
  CircleHelp,
  ClipboardCheck,
  LayoutDashboard,
  ListTree,
  School,
  Settings,
  Shapes,
  TriangleAlert,
  Users,
} from "lucide-react";

import { ROLES } from "@/lib/auth/roles";

/** Sidebar identity for the combined Teacher/Administrator workspace. */
export const TEACHER_ADMIN_WORKSPACE = Object.freeze({
  role: ROLES.TEACHER_ADMIN,
  name: "Teacher/Administrator workspace",
  detail: "Grade 6 mathematics",
});

/**
 * Every destination in the Teacher/Administrator sidebar, grouped so the list
 * stays readable. Grouping is visual only: all destinations stay visible.
 */
export const TEACHER_ADMIN_NAV = Object.freeze([
  Object.freeze({
    items: Object.freeze([
      { href: "/teacher/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/teacher/students", label: "Students", icon: Users },
      { href: "/teacher/interventions", label: "Interventions", icon: TriangleAlert },
      { href: "/teacher/assessments", label: "Assessments", icon: ClipboardCheck },
    ]),
  }),
  Object.freeze({
    heading: "Learning content",
    items: Object.freeze([
      { href: "/teacher/competencies", label: "Competencies", icon: ListTree },
      { href: "/teacher/learning-modules", label: "Learning Modules", icon: BookOpen },
      { href: "/teacher/activities", label: "Activities", icon: Shapes },
      { href: "/teacher/question-bank", label: "Question Bank", icon: CircleHelp },
    ]),
  }),
  Object.freeze({
    heading: "Class administration",
    items: Object.freeze([
      { href: "/teacher/grades-sections", label: "Grades and Sections", icon: School },
      { href: "/teacher/reports-analytics", label: "Reports and Analytics", icon: ChartColumn },
      { href: "/teacher/settings", label: "Settings", icon: Settings },
    ]),
  }),
]);
