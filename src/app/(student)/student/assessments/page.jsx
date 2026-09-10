import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Assessments | MathSmart" };

export default function StudentAssessmentsPage() {
  return (
    <section className="flex flex-col gap-8" aria-labelledby="assessments-heading">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">Student assessments</p>
        <h1
          id="assessments-heading"
          className="font-display text-3xl font-semibold tracking-tight text-foreground"
        >
          Assessments
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Start, resume, or review your Grade 6 mathematics diagnostic.
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ClipboardCheck aria-hidden="true" className="size-5" />
          </div>
          <CardTitle>Diagnostic assessment</CardTitle>
          <CardDescription className="max-w-prose leading-relaxed">
            MathSmart checks your current competency level and uses the result to prepare
            your learning path. Your current status will appear when you open the assessment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Grade 6 Mathematics · Timed assessment · Progress can be resumed
          </p>
        </CardContent>
        <CardFooter className="border-t border-border pt-6">
          <Button asChild size="lg">
            <Link href="/student/assessments/diagnostic">
              Open diagnostic
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}
