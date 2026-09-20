"use client";

import { useState } from "react";
import { ClipboardCheck, Mail, Pencil, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { EditNameDialog } from "./EditNameDialog";
import { ProfileAvatar } from "./ProfileAvatar";

function DetailRow({ label, value }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold break-words text-foreground">{value}</dd>
    </div>
  );
}

function StatusTile({ icon: Icon, title, status }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background px-5 py-4">
      <div className="flex items-center gap-2">
        <Icon aria-hidden="true" className="size-4 text-primary" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      <p className="text-base font-semibold text-foreground">{status.label}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{status.summary}</p>
    </div>
  );
}

/**
 * The learner profile.
 *
 * It shows two honest records: the identity the learner can change themselves
 * (their name and their picture) and the enrolment their teacher manages.
 * Statuses are written out in words, never shown by colour alone, and every
 * unset value gets a calm fallback rather than a blank.
 *
 * The identity row is one line on a wide screen — picture, name, actions — and
 * stacks into two on a narrow one. It stacks at `lg` rather than `sm` because
 * the picture controls sit beside the picture: below that width the three
 * parts have to share a line they cannot fit, and the name is what gets
 * squeezed.
 */
export function ProfileView({ model }) {
  const [fullName, setFullName] = useState(model.fullName ?? "");
  const [editOpen, setEditOpen] = useState(false);

  const displayName = fullName || "Your name";

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Grade 6 mathematics</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Student Profile &amp; Learning Record
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Your identity, your enrolment, and the record your teacher follows as you learn.
        </p>
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
      </header>

      {/*
        * The section is the landmark, the Card is the surface. Nested this way
        * because the Card primitive renders a plain div with no `asChild`, and
        * changing that would touch every other module that uses it.
        */}
      <section aria-labelledby="profile-identity-heading">
        <Card>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
                <ProfileAvatar
                  userId={model.userId}
                  initials={model.initials}
                  name={fullName || null}
                  initialUrl={model.avatarUrl}
                />

                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      id="profile-identity-heading"
                      className="font-display text-2xl font-semibold break-words text-foreground"
                    >
                      {displayName}
                    </h2>
                    {model.learnerId ? (
                      <Badge variant="outline" className="font-mono">
                        {model.learnerId}
                      </Badge>
                    ) : null}
                  </div>
                  {/*
                   * `min-w-0` on every ancestor and `break-all` here, because an
                   * email address is one unbreakable token. Without both, a long
                   * one paints straight through the card border and then widens
                   * the document.
                   */}
                  <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                    <Mail aria-hidden="true" className="size-4 shrink-0" />
                    <span className="min-w-0 break-all">{model.email ?? "No email on file"}</span>
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="shrink-0 self-start lg:self-auto"
                onClick={() => setEditOpen(true)}
              >
                <Pencil aria-hidden="true" className="size-4" />
                Edit name
              </Button>
            </div>

            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 border-t border-border pt-5 sm:grid-cols-3">
              <DetailRow label="Grade" value={model.gradeName ?? "Not assigned"} />
              <DetailRow label="Section" value={model.sectionName ?? "Not assigned"} />
              <DetailRow label="School" value={model.schoolName ?? "Not recorded"} />
            </dl>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="profile-status-heading">
        <Card>
          <CardContent className="flex flex-col gap-6">
            <h2
              id="profile-status-heading"
              className="font-display text-lg font-semibold text-foreground"
            >
              Learning status
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <StatusTile icon={ClipboardCheck} title="Diagnostic" status={model.diagnostic} />
              <StatusTile icon={UserRound} title="Support plan" status={model.monitoring} />
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">
              Your teacher is the one who can change your class or your support plan.
              If anything on this page looks wrong, ask them.
            </p>
          </CardContent>
        </Card>
      </section>

      <EditNameDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initialName={fullName}
        onSaved={setFullName}
      />
    </div>
  );
}
