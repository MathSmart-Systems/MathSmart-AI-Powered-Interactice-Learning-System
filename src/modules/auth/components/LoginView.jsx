import { Info, TriangleAlert } from "lucide-react";

import { Wordmark } from "@/modules/shared";

import { messageForNotice } from "../messages";
import { LoginForm } from "./LoginForm";

function Notice({ notice }) {
  const message = messageForNotice(notice);

  if (!message) {
    return null;
  }

  const isError = message.tone === "error";
  const Icon = isError ? TriangleAlert : Info;

  return (
    <p
      role="status"
      className={
        isError
          ? "flex items-start gap-2.5 border-l-[3px] border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive"
          : "flex items-start gap-2.5 border-l-[3px] border-primary bg-primary/5 px-4 py-3 text-sm text-foreground"
      }
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{message.text}</span>
    </p>
  );
}

/**
 * Login screen. The form sits on the left third of the grid; the graph-paper
 * panel on the right carries the MathSmart signature and is hidden on narrow
 * screens, where it would only compete with the form.
 */
export function LoginView({ notice, isConfigured }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <div className="grid-paper-light flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-[26rem]">
          <Wordmark className="text-foreground" markClassName="text-primary" />

          <h1 className="mt-8 font-display text-3xl font-semibold tracking-tight text-foreground">
            Sign in
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            MathSmart supports Grade 6 mathematics for learners and their
            teachers. Use the account your school gave you.
          </p>

          <div className="mt-8 flex flex-col gap-5">
            <Notice notice={notice} />
            <LoginForm isConfigured={isConfigured} />
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="on-shell relative hidden bg-shell lg:block"
      >
        <div className="grid-paper absolute inset-0" />

        {/* One axis pair with a single plotted point: the MathSmart mark at page scale. */}
        <span className="absolute inset-y-0 left-1/3 w-px bg-shell-accent/40" />
        <span className="absolute inset-x-0 top-2/3 h-px bg-shell-accent/40" />
        <span className="absolute top-2/3 left-1/3 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-shell-accent" />

        <p className="absolute top-2/3 left-1/3 mt-6 max-w-[15rem] pl-5 font-display text-2xl leading-snug font-medium text-white">
          Plot the gap. Close the gap.
        </p>
      </div>
    </div>
  );
}
