import {
  ClipboardCheck,
  Compass,
  LayoutDashboard,
  Shapes,
  TrendingUp,
  UserRound,
} from "lucide-react";

import { ROLES } from "@/lib/auth/roles";

/** Sidebar identity for the learner workspace. */
export const STUDENT_WORKSPACE = Object.freeze({
  role: ROLES.STUDENT,
  name: "Student workspace",
  detail: "Grade 6 learning",
});

/**
 * Every destination in the learner sidebar. Order is the order shown.
 * Navigation is presentation only; access is decided server-side.
 */
export const STUDENT_NAV = Object.freeze([
  Object.freeze({
    items: Object.freeze([
      { href: "/student/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/student/my-learning", label: "My Learning", icon: Compass },
      { href: "/student/activities", label: "Activities", icon: Shapes },
      { href: "/student/assessments", label: "Assessments", icon: ClipboardCheck },
      { href: "/student/progress", label: "Progress", icon: TrendingUp },
      { href: "/student/profile", label: "Profile", icon: UserRound },
    ]),
  }),
]);
