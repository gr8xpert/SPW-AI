"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useBuyerText } from "../../../_i18n/use-buyer-text";
import type { Buyer } from "../../../use-buyers";
import {
  mergeRules,
  useReadRules,
  useSaveRules,
  type NoteRule,
} from "../../../use-buyer-ai";
import { AiButton, useAiFailure } from "./ai-gate";
import { useRuleWords } from "./proposal-review";

// Notes become rules: the saved rules (strength, remove) and reading the
// notes again with AI, each found rule ticked before it is saved.
export function RulesCard({ buyer }: { buyer: Buyer }) {
  const text = useBuyerText();
  const t = text.ai.rules;
  const pathname = usePathname();
  const words = useRuleWords();
  const read = useReadRules(buyer.id);
  const save = useSaveRules(buyer.id);
  const failure = useAiFailure();
  const [found, setFound] = useState<{
    rules: NoteRule[];
    notesHash: string;
  } | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const saved = buyer.noteRules ?? [];
  const hasNotes = !!buyer.notes?.trim();

  const ask = async () => {
    try {
      const out = await read.mutateAsync(undefined);
      // Nothing new in the notes: mark them read, nothing to accept.
      if (!out.rules.length)
        await save.mutateAsync({ rules: saved, notesHash: out.notesHash });
      setFound(out);
      setTicked(
        new Set(
          out.rules
            .filter(
              (r) => !saved.some((s) => s.id === r.id && s.text === r.text),
            )
            .map((r) => r.id),
        ),
      );
    } catch (err) {
      failure.notify(err);
    }
  };
  const keep = async () => {
    if (!found) return;
    try {
      await save.mutateAsync({
        rules: mergeRules(
          saved,
          found.rules.filter((r) => ticked.has(r.id)),
        ),
        notesHash: found.notesHash,
      });
      setFound(null);
    } catch (err) {
      failure.notify(err);
    }
  };
  const update = async (rules: NoteRule[]) => {
    try {
      await save.mutateAsync({ rules });
    } catch (err) {
      failure.notify(err);
    }
  };

  return (
    <Card data-testid="rules-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t.title}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {buyer.rulesStale ? (
          <p
            className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
            data-testid="rules-stale"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t.stale}
          </p>
        ) : null}

        {saved.length ? (
          <ul className="space-y-2">
            {saved.map((r) => (
              <li
                key={r.id}
                className="flex items-start gap-2 text-sm"
                data-saved-rule={r.id}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{words(r)}</span>
                    <button
                      type="button"
                      title={t.strengthHelp}
                      onClick={() =>
                        update(
                          saved.map((x) =>
                            x.id === r.id
                              ? {
                                  ...x,
                                  strength:
                                    x.strength === "hard" ? "soft" : "hard",
                                }
                              : x,
                          ),
                        )
                      }
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px]",
                        r.strength === "hard"
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-muted",
                      )}
                      data-strength={r.strength}
                    >
                      {r.strength === "hard" ? t.hard : t.soft}
                    </button>
                  </div>
                  <p className="break-words text-xs text-muted-foreground">
                    “{r.text}”
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-label={t.remove}
                  onClick={() => update(saved.filter((x) => x.id !== r.id))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : !found ? (
          <p className="text-sm text-muted-foreground">
            {hasNotes ? t.empty : t.noNotes}
          </p>
        ) : null}

        {found ? (
          <div
            className="space-y-2 rounded-md border p-3"
            data-testid="rules-found"
          >
            {found.rules.length ? (
              <>
                <p className="text-sm font-medium">{t.proposed}</p>
                {found.rules.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-start gap-2 text-sm"
                    data-found-rule={r.id}
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={ticked.has(r.id)}
                      onCheckedChange={() =>
                        setTicked((s) => {
                          const n = new Set(s);
                          if (n.has(r.id)) n.delete(r.id);
                          else n.add(r.id);
                          return n;
                        })
                      }
                      aria-label={words(r)}
                    />
                    <span className="min-w-0">
                      <span className="font-medium">{words(r)}</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        ({r.strength === "hard" ? t.hard : t.soft})
                      </span>
                      <span className="block break-words text-xs text-muted-foreground">
                        “{r.text}”
                      </span>
                    </span>
                  </label>
                ))}
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFound(null)}
                  >
                    {t.cancel}
                  </Button>
                  <Button
                    size="sm"
                    onClick={keep}
                    disabled={save.isPending}
                    data-testid="rules-save"
                  >
                    {save.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {t.save}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t.noneFound}</p>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {hasNotes ? (
            <AiButton
              size="sm"
              variant="outline"
              onClick={ask}
              pending={read.isPending}
              data-testid="rules-read"
            >
              {saved.length || buyer.rulesStale ? t.readAgain : t.read}
            </AiButton>
          ) : (
            <Button size="sm" variant="outline" asChild>
              <Link href={`${pathname}?tab=notes`}>
                {text.record.notes.title}
              </Link>
            </Button>
          )}
        </div>
        {failure.dialog}
      </CardContent>
    </Card>
  );
}
