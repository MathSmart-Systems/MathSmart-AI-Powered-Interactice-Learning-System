import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Learning Module | MathSmart" };

export default async function StudentLearningModulePage({ params }) {
  const resolvedParams = await params;
  const moduleId = resolvedParams?.moduleId;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/student/assessments">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to assessments
          </Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <BookOpen aria-hidden="true" className="size-5" />
          </div>
          <CardTitle>Learning Module</CardTitle>
          <CardDescription>
            {moduleId ? `Module identifier: ${moduleId}` : "Targeted instructional module."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This learning module contains structured ARAL instructional content,
            worked examples, and associated practice activities.
          </p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-3 border-t border-border pt-6">
          <Button asChild variant="outline">
            <Link href="/student/my-learning">View all modules in My Learning</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/student/assessments">Return to assessments</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
