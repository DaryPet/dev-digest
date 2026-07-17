"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, Skeleton, Tabs, Textarea, TextInput, Toggle } from "@devdigest/ui";
import type { EvalCaseInput, EvalRunRecord } from "@devdigest/shared";
import { useCreateEvalCase, useEvalCase, useRunEvalCase, useUpdateEvalCase } from "@/lib/hooks/eval";
import { formatCost } from "@/components/RunCostBadge/RunCostBadge";
import { formatDuration, insertFindingSkeleton, validateExpectedOutput } from "./helpers";
import { s } from "./styles";

type InputTabKey = "diff" | "files" | "prMeta";

/** Eval-case editor modal (SPEC-03 Group E, AC-23..27) — create (caseId=null)
    or edit (caseId=string) an eval case. Expected-output JSON is validated at
    this component's own boundary (AC-24) before Save is allowed to fire. */
export function EvalCaseEditorModal({
  agentId,
  caseId,
  lastRun,
  onClose,
}: {
  agentId: string;
  caseId: string | null;
  /** Most recent persisted run for this case, if any (AC-27) — passed down
      from the tab's already-loaded case-status list; not re-fetched here. */
  lastRun?: EvalRunRecord | null;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const { data: existingCase, isLoading } = useEvalCase(agentId, caseId ?? undefined);
  const create = useCreateEvalCase(agentId);
  const update = useUpdateEvalCase(agentId, caseId ?? undefined);

  const [name, setName] = React.useState("");
  const [diffText, setDiffText] = React.useState("");
  const [filesText, setFilesText] = React.useState("[]");
  const [metaTitle, setMetaTitle] = React.useState("");
  const [metaBody, setMetaBody] = React.useState("");
  const [expectedOutputText, setExpectedOutputText] = React.useState("[]");
  const [runOnSave, setRunOnSave] = React.useState(false);
  const [inputTab, setInputTab] = React.useState<InputTabKey>("diff");

  // The case id a run should target: the prop for edit mode, or the freshly
  // created case's id once create() resolves (new-case + "Run on save").
  const [activeCaseId, setActiveCaseId] = React.useState<string | undefined>(caseId ?? undefined);
  const runEvalCase = useRunEvalCase(agentId, activeCaseId);
  const shouldRunAfterCreate = React.useRef(false);

  React.useEffect(() => {
    if (caseId && existingCase) {
      setName(existingCase.name);
      setDiffText(existingCase.input_diff ?? "");
      setFilesText(existingCase.input_files != null ? JSON.stringify(existingCase.input_files, null, 2) : "[]");
      const meta = (existingCase.input_meta as Record<string, unknown> | null) ?? {};
      setMetaTitle(typeof meta.title === "string" ? meta.title : "");
      setMetaBody(typeof meta.body === "string" ? meta.body : "");
      setExpectedOutputText(JSON.stringify(existingCase.expected_output ?? [], null, 2));
      setActiveCaseId(existingCase.id);
    }
  }, [caseId, existingCase]);

  // Fire the deferred single-case run once the freshly-created case's id lands
  // in state (useRunEvalCase's caseId argument is fixed at hook-call time, so
  // for a brand-new case we must wait for the id before the hook is "live").
  React.useEffect(() => {
    if (!caseId && activeCaseId && shouldRunAfterCreate.current) {
      shouldRunAfterCreate.current = false;
      runEvalCase.mutate(undefined, { onSettled: onClose });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCaseId]);

  const validation = React.useMemo(() => validateExpectedOutput(expectedOutputText), [expectedOutputText]);

  const expectedCount = Array.isArray(existingCase?.expected_output)
    ? (existingCase!.expected_output as unknown[]).length
    : 0;
  const actualOutput = lastRun?.actual_output as { findings?: unknown[] } | null | undefined;
  const gotCount = Array.isArray(actualOutput?.findings) ? actualOutput!.findings!.length : 0;

  const saving = create.isPending || update.isPending || runEvalCase.isPending;

  const handleInsertSkeleton = () => setExpectedOutputText((prev) => insertFindingSkeleton(prev));

  const handleSave = () => {
    if (!validation.ok) return; // Save is disabled while invalid — belt-and-suspenders.

    let filesValue: unknown = null;
    try {
      filesValue = filesText.trim() === "" ? null : JSON.parse(filesText);
    } catch {
      // The Files tab isn't AC-24-gated (only Expected output blocks Save) —
      // fall back to null rather than rejecting the whole save.
      filesValue = null;
    }

    const existingMeta = (existingCase?.input_meta as Record<string, unknown> | null) ?? {};
    const payload: EvalCaseInput = {
      owner_kind: "agent",
      owner_id: agentId,
      name,
      input_diff: diffText,
      input_files: filesValue,
      input_meta: { ...existingMeta, title: metaTitle, body: metaBody },
      expected_output: validation.value,
      notes: existingCase?.notes ?? null,
    };

    if (caseId) {
      update.mutate(payload, {
        onSuccess: () => {
          if (runOnSave) runEvalCase.mutate(undefined, { onSettled: onClose });
          else onClose();
        },
      });
    } else {
      shouldRunAfterCreate.current = runOnSave;
      create.mutate(payload, {
        onSuccess: (data) => {
          if (runOnSave) setActiveCaseId(data.id);
          else onClose();
        },
      });
    }
  };

  const title = caseId ? t("caseEditor.caseTitle", { name: name || "…" }) : t("caseEditor.newCase");

  const footer = !isLoading && (
    <div style={s.footer}>
      <Button kind="secondary" onClick={onClose}>
        {t("caseEditor.cancel")}
      </Button>
      <Button kind="primary" icon="Check" onClick={handleSave} disabled={saving || !validation.ok} loading={saving}>
        {saving ? t("caseEditor.saving") : t("caseEditor.save")}
      </Button>
    </div>
  );

  return (
    <Modal width={760} title={title} onClose={onClose} footer={footer}>
      {isLoading ? (
        <div style={s.body}>
          <Skeleton height={200} />
        </div>
      ) : (
        <div style={s.body}>
          <FormField label={t("caseEditor.nameLabel")} required>
            <TextInput value={name} onChange={setName} placeholder={t("caseEditor.namePlaceholder")} />
          </FormField>

          <FormField label={t("caseEditor.inputLabel")}>
            <div style={s.inputTabsWrap}>
              <Tabs
                tabs={[
                  { key: "diff", label: t("caseEditor.tabs.diff") },
                  { key: "files", label: t("caseEditor.tabs.files") },
                  { key: "prMeta", label: t("caseEditor.tabs.prMeta") },
                ]}
                value={inputTab}
                onChange={(k) => setInputTab(k as InputTabKey)}
                pad="0 8px"
              />
              <div style={s.inputTabBody}>
                {inputTab === "diff" && (
                  <Textarea value={diffText} onChange={setDiffText} rows={8} mono placeholder={t("caseEditor.diffPlaceholder")} />
                )}
                {inputTab === "files" && (
                  <Textarea value={filesText} onChange={setFilesText} rows={8} mono placeholder={t("caseEditor.filesPlaceholder")} />
                )}
                {inputTab === "prMeta" && (
                  <div style={s.metaRow}>
                    <FormField label={t("caseEditor.titleLabel")}>
                      <TextInput value={metaTitle} onChange={setMetaTitle} placeholder={t("caseEditor.titlePlaceholder")} />
                    </FormField>
                    <FormField label={t("caseEditor.bodyLabel")}>
                      <Textarea value={metaBody} onChange={setMetaBody} rows={4} placeholder={t("caseEditor.bodyPlaceholder")} />
                    </FormField>
                  </div>
                )}
              </div>
            </div>
          </FormField>

          <FormField
            label={
              <div style={s.expectedHeaderRow}>
                <span>{t("caseEditor.expectedOutput")}</span>
                <span style={s.jsonStatus(validation.ok)}>
                  {validation.ok ? t("caseEditor.validJson") : t("caseEditor.invalidJson")}
                </span>
              </div>
            }
            right={
              <Button kind="ghost" size="sm" icon="Plus" onClick={handleInsertSkeleton}>
                {t("caseEditor.findingSkeleton")}
              </Button>
            }
          >
            <Textarea value={expectedOutputText} onChange={setExpectedOutputText} rows={10} mono />
            {!validation.ok && <div style={s.errorText}>{t("caseEditor.expectedOutputError")}</div>}
          </FormField>

          <div style={s.runOnSaveRow}>
            <Toggle on={runOnSave} onChange={setRunOnSave} size={16} />
            {t("caseEditor.runOnSave")}
          </div>

          {lastRun && (
            <div style={s.lastRun}>
              {lastRun.pass ? t("caseEditor.lastRunPassed") : t("caseEditor.lastRunFailed")}
              {" · "}
              {t("caseEditor.lastRunDetail", {
                expected: expectedCount,
                got: gotCount,
                duration: formatDuration(lastRun.duration_ms),
                cost: formatCost(lastRun.cost_usd),
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
