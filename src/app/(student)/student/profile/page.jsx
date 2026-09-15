import { Suspense } from "react";

import { ProfileSkeleton, StudentProfile } from "@/modules/student/profile";

export const metadata = { title: "Profile | MathSmart" };

export default function StudentProfilePage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <StudentProfile />
    </Suspense>
  );
}