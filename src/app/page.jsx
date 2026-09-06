import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Sparkles, BarChart3, Target, GraduationCap, ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 text-slate-100">
      <div className="max-w-4xl w-full text-center space-y-8">
        {/* Badge */}
        <div className="flex justify-center">
          <Badge variant="outline" className="gap-2 px-3.5 py-1.5 text-xs font-medium border-indigo-500/30 bg-indigo-500/10 text-indigo-300 backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            DepEd Grade 7 · ARAL Framework Powered
          </Badge>
        </div>

        {/* Hero Title */}
        <div className="space-y-3">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
            MathSmart
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto font-normal">
            AI-Powered Interactive Learning System for Enhancing Mathematics Skills Among Elementary Learners
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" className="gap-2 bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25">
            Get Started <ArrowRight className="w-4 h-4" />
          </Button>
          <Button size="lg" variant="outline" className="border-slate-700 hover:bg-slate-800 text-slate-200">
            Learn More
          </Button>
        </div>

        {/* Feature Cards Grid using shadcn Card */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 text-left">
          <Card className="border-slate-800 bg-slate-900/60 backdrop-blur hover:border-indigo-500/50 transition-colors">
            <CardHeader className="pb-2">
              <div className="p-2.5 w-fit rounded-lg bg-indigo-500/10 text-indigo-400 mb-2">
                <BarChart3 className="w-5 h-5" />
              </div>
              <CardTitle className="text-base text-slate-100">Diagnostic Assessment</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Adaptive AI scoring that pinpoints learning gaps and math competency needs.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 backdrop-blur hover:border-purple-500/50 transition-colors">
            <CardHeader className="pb-2">
              <div className="p-2.5 w-fit rounded-lg bg-purple-500/10 text-purple-400 mb-2">
                <Target className="w-5 h-5" />
              </div>
              <CardTitle className="text-base text-slate-100">ARAL Modules & Practice</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Targeted remediation and interactive activities aligned with priority competencies.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-slate-800 bg-slate-900/60 backdrop-blur hover:border-blue-500/50 transition-colors">
            <CardHeader className="pb-2">
              <div className="p-2.5 w-fit rounded-lg bg-blue-500/10 text-blue-400 mb-2">
                <GraduationCap className="w-5 h-5" />
              </div>
              <CardTitle className="text-base text-slate-100">Teacher Intervention</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Real-time mastery heatmaps and student analytics for targeted classroom support.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* System Status Footer */}
        <div className="pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs text-slate-400">
          <div>Next.js 16 · Tailwind CSS v4 · shadcn/ui (New York Style)</div>
          <div className="text-emerald-400 font-mono flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Ready
          </div>
        </div>
      </div>
    </main>
  );
}
